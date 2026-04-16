"use strict";

const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const path = require("path");
const { getEntitlementsFile, ensureDir, hardenFilePermissions } = require("./suite-state");
const { resolvePublicKey, evaluateManifestObject } = require("./entitlements");
const {
  validatePackMeta,
  writePackToCache,
} = require("./premium-packs");
const {
  writeActivationState,
} = require("./activation-state");

/**
 * Generate a deterministic machine_id from local machine facts.
 * Bounded to handle Windows and POSIX systems.
 *
 * @returns {string}
 */
function buildMachineId() {
  // Use hostname + platform + cpu count for determinism across same machine
  const hostname = os.hostname();
  const platform = process.platform;
  const cpus = os.cpus().length;
  const combined = `${hostname}-${platform}-${cpus}`;
  return crypto.createHash("sha256").update(combined).digest("hex").substring(0, 16);
}

/**
 * POST an activation request to the backend API.
 * @param {object} options
 * @param {string} options.activationUrl - Base activation API URL
 * @param {string} options.licenseKey - Activation license key
 * @param {string} options.machineId - Bound machine identifier
 * @returns {Promise<{ success: boolean, response?: object, error?: string }>}
 */
async function postActivationRequest({
  activationUrl,
  licenseKey,
  machineId,
}) {
  const pkg = require("../package.json");
  const body = {
    license_key: licenseKey,
    machine_id: machineId,
    cli_version: pkg.version,
    os: process.platform,
    hostname: os.hostname(),
  };

  try {
    const response = await fetch(activationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Activation API returned status ${response.status}`,
      };
    }

    return { success: true, response: data };
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Validate the activation response contract.
 * @param {object} response
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateActivationResponse(response) {
  if (!response || typeof response !== "object") {
    return { valid: false, reason: "Response is not an object" };
  }

  if (!response.decision || !["activated", "already_activated", "denied"].includes(response.decision)) {
    return { valid: false, reason: "Invalid decision in response" };
  }

  if (!response.manifest || typeof response.manifest !== "object") {
    return { valid: false, reason: "Response is missing manifest" };
  }

  if (response.decision === "denied") {
    return { valid: false, reason: response.manifest.error || "Activation was denied by server" };
  }

  if (!response.activation || typeof response.activation !== "object") {
    return { valid: false, reason: "Response is missing activation metadata" };
  }

  if (typeof response.activation.machine_id !== "string") {
    return { valid: false, reason: "Response activation.machine_id is invalid" };
  }

  return { valid: true };
}

/**
 * Verify the signed manifest payload from the response.
 * @param {object} manifest
 * @returns {{ verified: boolean, reason?: string }}
 */
function verifyManifestSignature(manifest) {
  const now = Date.now();
  const { state, manifest: verified } = evaluateManifestObject(manifest, now);

  if (state === "missing") {
    return { verified: false, reason: "No entitlement manifest available" };
  }

  if (state === "malformed") {
    return { verified: false, reason: "Manifest is malformed" };
  }

  if (state === "unsigned") {
    return { verified: false, reason: "Manifest is not signed" };
  }

  if (state === "untrusted-key") {
    return { verified: false, reason: "Trust root not configured" };
  }

  if (state === "invalid-signature") {
    return { verified: false, reason: "Manifest signature is invalid (exit code 3)" };
  }

  if (state === "expired") {
    return { verified: false, reason: "Entitlement has expired" };
  }

  // "active" and "grace" are valid states
  return { verified: true, manifest: verified };
}

/**
 * Install required premium packs from the manifest.
 * @param {object} manifest - Verified manifest
 * @param {Array} premiumPacks - Pack metadata from activation response
 * @returns {{ success: boolean, errors: string[] }}
 */
function installRequiredPacks(manifest, premiumPacks) {
  const errors = [];

  if (!Array.isArray(premiumPacks)) {
    return { success: true, errors: [] };
  }

  // Filter for spec product packs that match capabilities
  const manifestCaps = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  const requiredPacks = premiumPacks.filter((pack) => {
    if (!pack || pack.product !== "spec") return false;
    if (!Array.isArray(pack.capabilities)) return false;
    return pack.capabilities.some((c) => manifestCaps.includes(c));
  });

  // Install each required pack
  for (const packEntry of requiredPacks) {
    const validation = validatePackMeta(packEntry);
    if (!validation.valid) {
      errors.push(`Pack "${packEntry.id || "unknown"}": ${validation.reason}`);
      continue;
    }

    // If pack bytes are embedded in the response, cache them immediately
    if (packEntry.bytes && typeof packEntry.bytes === "string") {
      try {
        const packBytes = Buffer.from(packEntry.bytes, "base64");
        const writeResult = writePackToCache(packEntry, packBytes);
        if (!writeResult.success) {
          errors.push(`Pack "${packEntry.id}": ${writeResult.reason}`);
        }
      } catch (err) {
        errors.push(`Pack "${packEntry.id}": Failed to decode bytes: ${err.message}`);
      }
    }
  }

  return { success: errors.length === 0, errors };
}

/**
 * Persist the verified entitlements and activation state locally.
 * @param {object} manifest - Verified entitlement manifest
 * @param {object} activation - Activation metadata from response
 * @returns {{ success: boolean, error?: string }}
 */
function persistEntitlementAndActivation(manifest, activation) {
  const entitlementsFile = getEntitlementsFile();

  try {
    ensureDir(path.dirname(entitlementsFile));

    // Write entitlements manifest
    const manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(entitlementsFile, manifestJson, "utf8");
    hardenFilePermissions(entitlementsFile);

    // Write activation metadata (no plain license key)
    const activationResult = writeActivationState({
      provider: "license",
      customer_id: manifest.customer_id,
      plan: manifest.plan,
      machine_id: activation.machine_id,
      decision: activation.decision || "activated",
    });

    if (!activationResult.success) {
      return { success: false, error: activationResult.error };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clean up partial state on activation failure.
 * Only removes files if they are clearly from a failed activation attempt.
 */
function rollbackPartialState() {
  // Conservative: only remove activation.json if it exists
  // Leave entitlements.json intact to avoid accidental deletion of valid state
  try {
    const { getActivationFile } = require("./suite-state");
    const activationFile = getActivationFile();
    if (fs.existsSync(activationFile)) {
      fs.unlinkSync(activationFile);
    }
  } catch (_e) {
    // Ignore cleanup errors
  }
}

/**
 * Run the full activation flow.
 *
 * @param {object} options
 * @param {string} options.licenseKey - Activation key from user
 * @param {string} [options.activationUrl] - Override API URL (default: https://sdtk-spec.com/api/activate)
 * @returns {Promise<{ success: boolean, decision?: string, message: string, exitCode: number }>}
 */
async function activateWithLicense({
  licenseKey,
  activationUrl = "https://sdtk-spec.com/api/activate",
} = {}) {
  const result = {
    success: false,
    message: "",
    exitCode: 1,
  };

  // Validation: license key is required
  if (!licenseKey || typeof licenseKey !== "string" || !licenseKey.trim()) {
    result.message = "License key is required. Usage: sdtk-spec activate --license <KEY>";
    result.exitCode = 1;
    return result;
  }

  // Build machine_id
  const machineId = buildMachineId();

  // POST to activation API
  const apiResult = await postActivationRequest({
    activationUrl,
    licenseKey: licenseKey.trim(),
    machineId,
  });

  if (!apiResult.success) {
    result.message = `Activation failed: ${apiResult.error}`;
    result.exitCode = 1;
    rollbackPartialState();
    return result;
  }

  // Validate response contract
  const validation = validateActivationResponse(apiResult.response);
  if (!validation.valid) {
    result.message = `Invalid activation response: ${validation.reason}`;
    result.exitCode = 1;
    rollbackPartialState();
    return result;
  }

  const { decision, manifest, activation } = apiResult.response;

  // Handle denied decision
  if (decision === "denied") {
    result.message = manifest.error || "Activation was denied by the server.";
    result.exitCode = 1;
    rollbackPartialState();
    return result;
  }

  // Verify manifest signature
  const sigResult = verifyManifestSignature(manifest);
  if (!sigResult.verified) {
    result.message = `Manifest verification failed: ${sigResult.reason}`;
    result.exitCode = sigResult.reason && sigResult.reason.includes("exit code 3") ? 3 : 1;
    rollbackPartialState();
    return result;
  }

  // Validate premium packs metadata (install step deferred)
  const packErrors = installRequiredPacks(sigResult.manifest, apiResult.response.premium_packs);
  if (!packErrors.success) {
    result.message = `Pack validation failed: ${packErrors.errors.join("; ")}`;
    result.exitCode = 1;
    rollbackPartialState();
    return result;
  }

  // Persist verified state
  const persistResult = persistEntitlementAndActivation(sigResult.manifest, activation);
  if (!persistResult.success) {
    result.message = `Failed to save activation state: ${persistResult.error}`;
    result.exitCode = 4;
    rollbackPartialState();
    return result;
  }

  // Success
  result.success = true;
  result.decision = decision;
  result.exitCode = 0;

  if (decision === "already_activated") {
    result.message = `Pro already activated on this machine (customer: ${sigResult.manifest.customer_id}, plan: ${sigResult.manifest.plan}).`;
  } else {
    result.message = `Pro activated successfully! Customer: ${sigResult.manifest.customer_id}, Plan: ${sigResult.manifest.plan}. You can now use premium SDTK commands.`;
  }

  return result;
}

module.exports = {
  activateWithLicense,
  buildMachineId,
};
