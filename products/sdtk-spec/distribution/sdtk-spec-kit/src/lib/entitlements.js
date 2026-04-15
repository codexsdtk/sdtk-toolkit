"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getEntitlementsFile } = require("./suite-state");

// Required manifest fields excluding signature (checked separately)
const REQUIRED_FIELDS = [
  "schema_version",
  "customer_id",
  "plan",
  "products",
  "capabilities",
  "issued_at",
  "expires_at",
  "offline_grace_until",
];

/**
 * Resolve the RSA public key for entitlement verification.
 * Checks in this order:
 *   1. SDTK_ENTITLEMENT_PUBLIC_KEY environment variable (override)
 *   2. Bundled default PEM asset
 *
 * @returns {string|null} - PEM-formatted public key, or null if not found
 */
function resolvePublicKey() {
  // Environment override takes precedence
  if (process.env.SDTK_ENTITLEMENT_PUBLIC_KEY) {
    return process.env.SDTK_ENTITLEMENT_PUBLIC_KEY;
  }

  // Try bundled default
  try {
    const bundledKeyPath = path.join(
      __dirname,
      "..",
      "assets",
      "keys",
      "spec-entitlement-public.pem"
    );
    if (fs.existsSync(bundledKeyPath)) {
      return fs.readFileSync(bundledKeyPath, "utf8");
    }
  } catch (_e) {
    // Fall through to return null
  }

  return null;
}

/**
 * Recursively sort object keys for canonical JSON serialization.
 * Arrays preserve element order. Primitives are returned as-is.
 *
 * @param {*} value
 * @returns {*}
 */
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Build the canonical signed payload from a manifest.
 * Removes the `signature` field, recursively sorts object keys,
 * and returns a UTF-8 Buffer suitable for RSA-SHA256 verification.
 *
 * @param {object} manifest
 * @returns {Buffer}
 */
function buildCanonicalPayload(manifest) {
  // eslint-disable-next-line no-unused-vars
  const { signature: _sig, ...rest } = manifest;
  return Buffer.from(JSON.stringify(canonicalize(rest)), "utf8");
}

/**
 * Evaluate the trust/time state of a parsed manifest object.
 * Performs all validation steps except file I/O.
 * Shared by loadEntitlementState (file-cache path) and the sync module (remote manifest path).
 *
 * Possible states:
 *   malformed        - structural validation failure or missing required field
 *   unsigned         - signature field absent or empty
 *   untrusted-key    - SDTK_ENTITLEMENT_PUBLIC_KEY not set (manifest cannot be verified)
 *   invalid-signature - RSA-SHA256 verification failed
 *   active           - verified, current time < expires_at
 *   grace            - verified, expires_at <= now < offline_grace_until
 *   expired          - verified, now >= offline_grace_until
 *
 * @param {*} manifest - Value parsed from JSON (may be any type)
 * @param {number} now  - Current epoch ms (injectable for deterministic tests)
 * @returns {{ state: string, manifest: object|null }}
 */
function evaluateManifestObject(manifest, now) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { state: "malformed", manifest: null };
  }

  // ---- 1. Required fields (excluding signature) ----
  for (const field of REQUIRED_FIELDS) {
    if (!(field in manifest)) {
      return { state: "malformed", manifest };
    }
  }

  // ---- 2. Structural field validation ----
  if (typeof manifest.schema_version !== "number") {
    return { state: "malformed", manifest };
  }
  if (typeof manifest.customer_id !== "string" || !manifest.customer_id) {
    return { state: "malformed", manifest };
  }
  if (typeof manifest.plan !== "string" || !manifest.plan) {
    return { state: "malformed", manifest };
  }
  if (
    !manifest.products ||
    typeof manifest.products !== "object" ||
    Array.isArray(manifest.products)
  ) {
    return { state: "malformed", manifest };
  }
  if (!Array.isArray(manifest.capabilities)) {
    return { state: "malformed", manifest };
  }
  if (
    typeof manifest.issued_at !== "string" ||
    typeof manifest.expires_at !== "string" ||
    typeof manifest.offline_grace_until !== "string"
  ) {
    return { state: "malformed", manifest };
  }

  // ---- 3. Signature field ----
  if (
    !("signature" in manifest) ||
    !manifest.signature ||
    typeof manifest.signature !== "string"
  ) {
    return { state: "unsigned", manifest };
  }

  // ---- 4. Public verification key ----
  const publicKeyPem = resolvePublicKey();
  if (!publicKeyPem) {
    return { state: "untrusted-key", manifest };
  }

  // ---- 5. RSA-SHA256 verification ----
  let verified = false;
  try {
    const payload = buildCanonicalPayload(manifest);
    const sigBuffer = Buffer.from(manifest.signature, "base64");
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(payload);
    verified = verifier.verify(publicKeyPem, sigBuffer);
  } catch (_e) {
    return { state: "invalid-signature", manifest };
  }

  if (!verified) {
    return { state: "invalid-signature", manifest };
  }

  // ---- 6. Time-based state ----
  const expiresAt = new Date(manifest.expires_at).getTime();
  const graceUntil = new Date(manifest.offline_grace_until).getTime();

  if (isNaN(expiresAt) || isNaN(graceUntil)) {
    return { state: "malformed", manifest };
  }

  if (now < expiresAt) {
    return { state: "active", manifest };
  }
  if (now < graceUntil) {
    return { state: "grace", manifest };
  }
  return { state: "expired", manifest };
}

/**
 * Load and evaluate the cached entitlement manifest trust state.
 *
 * Possible states:
 *   missing          - no cached file exists
 *   malformed        - JSON parse failure or missing required field
 *   unsigned         - signature field absent or empty
 *   untrusted-key    - SDTK_ENTITLEMENT_PUBLIC_KEY not set (manifest cannot be verified)
 *   invalid-signature - RSA-SHA256 verification failed
 *   active           - verified, current time < expires_at
 *   grace            - verified, expires_at <= now < offline_grace_until
 *   expired          - verified, now >= offline_grace_until
 *
 * @param {number} [nowMs] - Current epoch ms (injectable for deterministic tests)
 * @returns {{ state: string, manifest: object|null }}
 */
function loadEntitlementState(nowMs) {
  const filePath = getEntitlementsFile();
  const now = nowMs !== undefined ? nowMs : Date.now();

  // ---- Missing ----
  if (!fs.existsSync(filePath)) {
    return { state: "missing", manifest: null };
  }

  // ---- Parse ----
  let manifest;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    manifest = JSON.parse(raw);
  } catch (_e) {
    return { state: "malformed", manifest: null };
  }

  return evaluateManifestObject(manifest, now);
}

module.exports = {
  loadEntitlementState,
  evaluateManifestObject,
  buildCanonicalPayload,
  canonicalize,
  resolvePublicKey,
};

