"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { IntegrityError } = require("./errors");

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.join(PACKAGE_ROOT, "assets", "toolkit");
const MANIFEST_PATH = path.join(
  PACKAGE_ROOT,
  "assets",
  "manifest",
  "toolkit-bundle.manifest.json"
);

/**
 * Load and parse the toolkit bundle manifest.
 * @returns {Object} Parsed manifest object.
 */
function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new IntegrityError(
      `Toolkit manifest not found: ${MANIFEST_PATH}\n` +
        'Run "npm run build:payload" to sync toolkit assets.'
    );
  }
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    throw new IntegrityError(`Failed to parse manifest: ${err.message}`);
  }
}

/**
 * Compute SHA256 hash of a file.
 * @param {string} filePath
 * @returns {string} Lowercase hex hash.
 */
function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Verify payload integrity against manifest.
 * Checks all files exist and SHA256 hashes match.
 * @throws {IntegrityError} on mismatch or missing file.
 */
function verify() {
  const manifest = loadManifest();

  if (!manifest.files || !Array.isArray(manifest.files)) {
    throw new IntegrityError("Manifest has no files array.");
  }

  const errors = [];

  for (const entry of manifest.files) {
    const filePath = path.join(ASSETS_DIR, entry.path);

    if (!fs.existsSync(filePath)) {
      errors.push(`MISSING: ${entry.path}`);
      continue;
    }

    const actualHash = hashFile(filePath);
    if (actualHash !== entry.sha256) {
      errors.push(
        `HASH MISMATCH: ${entry.path}\n` +
          `  expected: ${entry.sha256}\n` +
          `  actual:   ${actualHash}`
      );
    }
  }

  if (errors.length > 0) {
    throw new IntegrityError(
      `Toolkit payload integrity check failed:\n${errors.join("\n")}`
    );
  }
}

/**
 * Resolve absolute path to a file inside the bundled toolkit payload.
 * @param {string} relativePath - Path relative to assets/toolkit/ (e.g., "toolkit/install.ps1").
 * @returns {string} Absolute path.
 */
function resolvePayloadFile(relativePath) {
  return path.join(ASSETS_DIR, relativePath);
}

module.exports = {
  verify,
  loadManifest,
  resolvePayloadFile,
  ASSETS_DIR,
};
