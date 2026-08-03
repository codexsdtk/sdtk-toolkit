"use strict";

// BK-340 — sdtk-code premium loader (the kit's FIRST premium seam).
//
// Mirrors the proven sdtk-wiki single-file loader chain byte-for-byte in
// behavior: signed entitlement manifest (~/.sdtk/entitlements.json, RSA-SHA256
// over the canonicalized payload, public key bundled or via
// SDTK_ENTITLEMENT_PUBLIC_KEY) -> capability check -> premium-pack cache
// verification (~/.sdtk/packs/<product>/<id>/<version>/, sha256 pinned by the
// signed manifest) -> handler load. Fail-closed at every step: without an
// active entitlement AND an intact sleep-execute-pro pack, no headless
// sleep-execution path exists on this machine.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SAFE_PACK_PART_RE = /^[A-Za-z0-9._-]+$/;
const REQUIRED_ENTITLEMENT_FIELDS = [
  "schema_version",
  "customer_id",
  "plan",
  "products",
  "capabilities",
  "issued_at",
  "expires_at",
  "offline_grace_until",
];
const REQUIRED_PACK_FIELDS = [
  "id",
  "product",
  "version",
  "capabilities",
  "source",
  "sha256",
];

const SLEEP_EXECUTE_CAPABILITY = "code.sleep.execute";

function isSafePackPathPart(value) {
  return (
    typeof value === "string" &&
    SAFE_PACK_PART_RE.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

function getSuiteRoot() {
  return path.join(os.homedir(), ".sdtk");
}

function getEntitlementsFile() {
  return path.join(getSuiteRoot(), "entitlements.json");
}

function getPacksRoot() {
  return path.join(getSuiteRoot(), "packs");
}

function resolvePublicKey() {
  if (process.env.SDTK_ENTITLEMENT_PUBLIC_KEY) {
    return process.env.SDTK_ENTITLEMENT_PUBLIC_KEY;
  }

  const bundledKeyPath = path.join(
    __dirname,
    "..",
    "..",
    "assets",
    "keys",
    "sdtk-entitlement-public.pem"
  );
  if (fs.existsSync(bundledKeyPath)) {
    return fs.readFileSync(bundledKeyPath, "utf8");
  }
  return null;
}

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

function buildCanonicalPayload(manifest) {
  const { signature: _signature, ...rest } = manifest;
  return Buffer.from(JSON.stringify(canonicalize(rest)), "utf8");
}

function evaluateManifestObject(manifest, nowMs) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { state: "malformed", manifest: null };
  }

  for (const field of REQUIRED_ENTITLEMENT_FIELDS) {
    if (!(field in manifest)) {
      return { state: "malformed", manifest };
    }
  }

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
  if (
    !("signature" in manifest) ||
    !manifest.signature ||
    typeof manifest.signature !== "string"
  ) {
    return { state: "unsigned", manifest };
  }

  const publicKeyPem = resolvePublicKey();
  if (!publicKeyPem) {
    return { state: "untrusted-key", manifest };
  }

  let verified = false;
  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(buildCanonicalPayload(manifest));
    verified = verifier.verify(publicKeyPem, Buffer.from(manifest.signature, "base64"));
  } catch (_err) {
    return { state: "invalid-signature", manifest };
  }

  if (!verified) {
    return { state: "invalid-signature", manifest };
  }

  const now = nowMs !== undefined ? nowMs : Date.now();
  const expiresAt = new Date(manifest.expires_at).getTime();
  const graceUntil = new Date(manifest.offline_grace_until).getTime();
  if (Number.isNaN(expiresAt) || Number.isNaN(graceUntil)) {
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

function loadEntitlementState() {
  const filePath = getEntitlementsFile();
  if (!fs.existsSync(filePath)) {
    return { state: "missing", manifest: null };
  }
  try {
    return evaluateManifestObject(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch (_err) {
    return { state: "malformed", manifest: null };
  }
}

function checkCapability(capability, entitlementState) {
  const state = entitlementState && entitlementState.state;
  const manifest = entitlementState && entitlementState.manifest;

  if (state === "active" || state === "grace") {
    const capabilities = manifest && Array.isArray(manifest.capabilities)
      ? manifest.capabilities
      : [];
    if (capabilities.includes(capability)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      exitCode: 1,
      reason: `Capability "${capability}" is not included in the local entitlement.`,
    };
  }

  const integrityStates = new Set(["malformed", "unsigned", "untrusted-key", "invalid-signature"]);
  return {
    allowed: false,
    exitCode: integrityStates.has(state) ? 3 : 1,
    reason: `Capability "${capability}" is blocked because local entitlement state is "${state || "missing"}".`,
  };
}

function computeSha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validatePackMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { valid: false, reason: "pack metadata is not an object" };
  }

  for (const field of REQUIRED_PACK_FIELDS) {
    if (!(field in meta)) {
      return { valid: false, reason: `missing required field: ${field}` };
    }
  }

  if (!isSafePackPathPart(meta.id)) {
    return { valid: false, reason: "id must be a safe identifier" };
  }
  if (!isSafePackPathPart(meta.product)) {
    return { valid: false, reason: "product must be a safe identifier" };
  }
  if (!isSafePackPathPart(meta.version)) {
    return { valid: false, reason: "version must be a safe identifier" };
  }
  if (!Array.isArray(meta.capabilities)) {
    return { valid: false, reason: "capabilities must be an array" };
  }
  if (
    !meta.source ||
    typeof meta.source !== "object" ||
    Array.isArray(meta.source) ||
    meta.source.type !== "github-content" ||
    typeof meta.source.path !== "string" ||
    !meta.source.path
  ) {
    return { valid: false, reason: 'source.type must be "github-content" with a path' };
  }
  if (typeof meta.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(meta.sha256)) {
    return { valid: false, reason: "sha256 must be a 64-character lowercase hex string" };
  }
  return { valid: true };
}

function getPackDir(packEntry) {
  return path.join(getPacksRoot(), packEntry.product, packEntry.id, packEntry.version);
}

function getPackFile(packEntry) {
  return path.join(getPackDir(packEntry), "pack.js");
}

function resolvePackState(packEntry) {
  const validation = validatePackMeta(packEntry);
  if (!validation.valid) {
    return { state: "malformed", reason: validation.reason };
  }

  const packFile = getPackFile(packEntry);
  const metaFile = path.join(getPackDir(packEntry), "pack.json");
  if (!fs.existsSync(packFile) || !fs.existsSync(metaFile)) {
    return {
      state: "missing",
      reason:
        `Premium pack "${packEntry.id}@${packEntry.version}" is not installed for capability ${SLEEP_EXECUTE_CAPABILITY}.`,
    };
  }

  let cachedMeta;
  try {
    cachedMeta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  } catch (_err) {
    return { state: "malformed", reason: "pack.json could not be parsed" };
  }

  if (!cachedMeta || cachedMeta.sha256 !== packEntry.sha256) {
    return { state: "stale", reason: "pack.json hash does not match signed manifest" };
  }

  let bytes;
  try {
    bytes = fs.readFileSync(packFile);
  } catch (err) {
    return { state: "malformed", reason: `pack.js could not be read: ${err.message}` };
  }
  if (computeSha256(bytes) !== packEntry.sha256) {
    return { state: "stale", reason: "pack.js hash does not match signed manifest" };
  }
  return { state: "present" };
}

// Capability pre-check only (no pack load) — used by `sleep authorize` so a
// user without entitlement is told up front instead of after typing the
// confirmation phrase.
function checkSleepExecuteCapability() {
  const entitlementState = loadEntitlementState();
  const check = checkCapability(SLEEP_EXECUTE_CAPABILITY, entitlementState);
  if (!check.allowed) {
    return {
      ok: false,
      exitCode: check.exitCode,
      message:
        `${check.reason} Run SDTK activation (sdtk activate --license <KEY>) to install ` +
        `the Sleep Execute Pro runtime.`,
    };
  }
  return { ok: true, entitlementState };
}

async function loadSleepExecuteHandler() {
  const capability = SLEEP_EXECUTE_CAPABILITY;
  const preCheck = checkSleepExecuteCapability();
  if (!preCheck.ok) {
    return preCheck;
  }

  const manifest = preCheck.entitlementState.manifest;
  const packs = Array.isArray(manifest.premium_packs) ? manifest.premium_packs : [];
  const packEntry = packs.find(
    (pack) =>
      pack &&
      pack.product === "code" &&
      Array.isArray(pack.capabilities) &&
      pack.capabilities.includes(capability)
  );
  if (!packEntry) {
    return {
      ok: false,
      exitCode: 1,
      message:
        `Premium pack providing "${capability}" is not available. Run SDTK activation ` +
        `to install the Sleep Execute Pro runtime.`,
    };
  }

  const packState = resolvePackState(packEntry);
  if (packState.state !== "present") {
    return {
      ok: false,
      exitCode: packState.state === "malformed" ? 3 : 1,
      message:
        `Premium pack for "${capability}" is not ready (${packState.state}). ` +
        (packState.reason || "Refresh the local entitlement/runtime cache."),
    };
  }

  let packModule;
  try {
    packModule = require(getPackFile(packEntry));
  } catch (err) {
    return {
      ok: false,
      exitCode: 4,
      message: `Failed to load Sleep Execute Pro runtime pack: ${err.message}`,
    };
  }

  const handler = typeof packModule.sleepExecute === "function" ? packModule.sleepExecute : packModule.run;
  if (typeof handler !== "function") {
    return {
      ok: false,
      exitCode: 3,
      message: 'Sleep Execute Pro runtime pack must export "sleepExecute" or "run".',
    };
  }

  return { ok: true, handler, packEntry };
}

module.exports = {
  SLEEP_EXECUTE_CAPABILITY,
  buildCanonicalPayload,
  canonicalize,
  checkCapability,
  checkSleepExecuteCapability,
  evaluateManifestObject,
  loadEntitlementState,
  loadSleepExecuteHandler,
  resolvePackState,
};
