"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { IntegrityError } = require("./errors");

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.join(PACKAGE_ROOT, "assets", "toolkit");
const MANIFEST_PATH = path.join(
  PACKAGE_ROOT,
  "assets",
  "manifest",
  "toolkit-bundle.manifest.json"
);

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new IntegrityError(
      `SDTK-CODE toolkit manifest not found: ${MANIFEST_PATH}\nRun "npm run build:payload" to sync toolkit assets.`
    );
  }

  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch (error) {
    throw new IntegrityError(`Failed to parse SDTK-CODE toolkit manifest: ${error.message}`);
  }
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verify() {
  const manifest = loadManifest();
  if (!Array.isArray(manifest.files)) {
    throw new IntegrityError("SDTK-CODE toolkit manifest has no files array.");
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
        `HASH MISMATCH: ${entry.path}\n  expected: ${entry.sha256}\n  actual:   ${actualHash}`
      );
    }
  }

  if (errors.length > 0) {
    throw new IntegrityError(`SDTK-CODE toolkit payload integrity check failed:\n${errors.join("\n")}`);
  }
}

function resolvePayloadFile(relativePath) {
  return path.join(ASSETS_DIR, relativePath);
}

module.exports = {
  ASSETS_DIR,
  loadManifest,
  hashFile,
  resolvePayloadFile,
  verify,
};
