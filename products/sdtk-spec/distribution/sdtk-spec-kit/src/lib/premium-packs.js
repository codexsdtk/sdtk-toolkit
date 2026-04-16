"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getPacksRoot, ensureDir } = require("./suite-state");

// Required fields in a pack manifest entry (from the signed entitlement manifest).
const SAFE_PACK_PART_RE = /^[A-Za-z0-9._-]+$/;

function isSafePackPathPart(value) {
  return (
    typeof value === "string" &&
    SAFE_PACK_PART_RE.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

const REQUIRED_PACK_FIELDS = [
  "id",
  "product",
  "version",
  "capabilities",
  "source",
  "sha256",
];

/**
 * Resolve the cache directory for a specific pack version.
 * Layout: ~/.sdtk/packs/spec/<pack_id>/<pack_version>/
 *
 * @param {string} packId
 * @param {string} packVersion
 * @returns {string}
 */
function getPackDir(packId, packVersion) {
  return path.join(getPacksRoot(), "spec", packId, packVersion);
}

/**
 * Resolve the cached pack payload path.
 * @param {string} packId
 * @param {string} packVersion
 * @returns {string}
 */
function getPackFile(packId, packVersion) {
  return path.join(getPackDir(packId, packVersion), "pack.js");
}

/**
 * Resolve the cached pack metadata path.
 * @param {string} packId
 * @param {string} packVersion
 * @returns {string}
 */
function getPackMetaFile(packId, packVersion) {
  return path.join(getPackDir(packId, packVersion), "pack.json");
}

/**
 * Compute lowercase hex SHA256 over exact bytes.
 * @param {Buffer} bytes
 * @returns {string}
 */
function computeSha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Validate the shape of a pack metadata entry from the signed manifest.
 *
 * @param {*} meta - Value to validate (may be any type)
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
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
    return {
      valid: false,
      reason: "id must be a non-empty safe identifier",
    };
  }

  if (
    !isSafePackPathPart(meta.version)
  ) {
    return {
      valid: false,
      reason: "version must be a non-empty safe identifier",
    };
  }

  if (meta.product !== "spec") {
    return {
      valid: false,
      reason: `product must be "spec", got "${meta.product}"`,
    };
  }

  if (
    !meta.source ||
    typeof meta.source !== "object" ||
    Array.isArray(meta.source) ||
    meta.source.type !== "github-content"
  ) {
    return { valid: false, reason: 'source.type must be "github-content"' };
  }

  if (typeof meta.source.path !== "string" || !meta.source.path) {
    return {
      valid: false,
      reason: "source.path must be a non-empty string",
    };
  }

  if (
    typeof meta.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(meta.sha256)
  ) {
    return {
      valid: false,
      reason: "sha256 must be a 64-character lowercase hex string",
    };
  }

  if (!Array.isArray(meta.capabilities)) {
    return { valid: false, reason: "capabilities must be an array" };
  }

  return { valid: true };
}

/**
 * Write a pack payload to cache using a temp-write + hash-check + rename pattern.
 *
 * Steps:
 *   1. Verify SHA256 of bytes matches signed manifest entry
 *   2. Write bytes to a temp file
 *   3. Rename temp file to final pack.js path
 *   4. Write pack.json metadata
 *
 * @param {object} packMeta - Validated pack metadata from signed manifest
 * @param {Buffer} packBytes - Raw pack.js content
 * @returns {{ success: boolean, reason?: string }}
 */
function writePackToCache(packMeta, packBytes) {
  const validation = validatePackMeta(packMeta);
  if (!validation.valid) {
    return { success: false, reason: `Invalid pack metadata: ${validation.reason}` };
  }

  if (!Buffer.isBuffer(packBytes)) {
    return { success: false, reason: "packBytes must be a Buffer" };
  }

  const actualHash = computeSha256(packBytes);
  if (actualHash !== packMeta.sha256) {
    return {
      success: false,
      reason:
        `SHA256 mismatch for pack "${packMeta.id}@${packMeta.version}": ` +
        `expected ${packMeta.sha256}, got ${actualHash}`,
    };
  }

  const packDir = getPackDir(packMeta.id, packMeta.version);
  try {
    ensureDir(packDir);
  } catch (err) {
    return {
      success: false,
      reason: `Failed to create pack cache directory: ${err.message}`,
    };
  }

  // Write to a temp file in the same cache directory, then rename (atomic-style).
  // Keeping temp and final on the same volume avoids EXDEV failures on Windows.
  const tmpFile = path.join(
    packDir,
    `.pack.js.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );

  try {
    fs.writeFileSync(tmpFile, packBytes);
  } catch (err) {
    return {
      success: false,
      reason: `Failed to write pack temp file: ${err.message}`,
    };
  }

  const finalPackFile = getPackFile(packMeta.id, packMeta.version);
  try {
    if (fs.existsSync(finalPackFile)) {
      fs.unlinkSync(finalPackFile);
    }
    fs.renameSync(tmpFile, finalPackFile);
  } catch (err) {
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {}
    return {
      success: false,
      reason: `Failed to move pack to cache: ${err.message}`,
    };
  }

  // Write pack.json metadata after content integrity passes.
  const packJsonMeta = {
    id: packMeta.id,
    product: packMeta.product,
    version: packMeta.version,
    capabilities: packMeta.capabilities,
    sha256: packMeta.sha256,
    source: packMeta.source,
    installed_at: new Date().toISOString(),
    entrypoint: "pack.js",
  };

  try {
    fs.writeFileSync(
      getPackMetaFile(packMeta.id, packMeta.version),
      JSON.stringify(packJsonMeta, null, 2),
      "utf8"
    );
  } catch (err) {
    return {
      success: false,
      reason: `Failed to write pack.json: ${err.message}`,
    };
  }

  return { success: true };
}

/**
 * Resolve the local cache state for a pack without executing pack code.
 *
 * States:
 *   present   - pack.js and pack.json exist with matching sha256
 *   missing   - pack files are absent
 *   stale     - pack.json sha256 does not match the manifest entry
 *   malformed - pack entry is invalid or pack.json cannot be parsed
 *
 * @param {object} manifestPackEntry - Pack entry from the verified entitlement manifest
 * @returns {{ state: "present"|"missing"|"stale"|"malformed", reason?: string }}
 */
function resolvePackState(manifestPackEntry) {
  const validation = validatePackMeta(manifestPackEntry);
  if (!validation.valid) {
    return { state: "malformed", reason: validation.reason };
  }

  const { id, version, sha256 } = manifestPackEntry;
  const packFile = getPackFile(id, version);
  const metaFile = getPackMetaFile(id, version);

  if (!fs.existsSync(packFile) || !fs.existsSync(metaFile)) {
    return {
      state: "missing",
      reason:
        `Pack "${id}@${version}" is not installed. ` +
        `Run "sdtk-spec entitlement sync" to install.`,
    };
  }

  let cachedMeta;
  try {
    cachedMeta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  } catch (_e) {
    return {
      state: "malformed",
      reason: `pack.json for "${id}@${version}" could not be parsed`,
    };
  }

  if (!cachedMeta || typeof cachedMeta !== "object" || Array.isArray(cachedMeta)) {
    return {
      state: "malformed",
      reason: `pack.json for "${id}@${version}" is not a valid object`,
    };
  }

  if (cachedMeta.sha256 !== sha256) {
    return {
      state: "stale",
      reason:
        `Pack "${id}@${version}" hash in metadata does not match manifest. ` +
        `Run "sdtk-spec entitlement sync" to refresh.`,
    };
  }

  let packBytes;
  try {
    packBytes = fs.readFileSync(packFile);
  } catch (err) {
    return {
      state: "malformed",
      reason: `pack.js for "${id}@${version}" could not be read: ${err.message}`,
    };
  }

  if (computeSha256(packBytes) !== sha256) {
    return {
      state: "stale",
      reason:
        `Pack "${id}@${version}" bytes do not match the signed manifest hash. ` +
        `Run "sdtk-spec entitlement sync" to refresh.`,
    };
  }

  return { state: "present" };
}

module.exports = {
  getPackDir,
  getPackFile,
  getPackMetaFile,
  computeSha256,
  validatePackMeta,
  writePackToCache,
  resolvePackState,
};
