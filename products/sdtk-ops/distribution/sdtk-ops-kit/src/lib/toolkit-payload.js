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

const REQUIRED_FILES = [
  "toolkit/AGENTS.md",
  "toolkit/install.ps1",
  "toolkit/sdtk-spec.config.json",
  "toolkit/sdtk-spec.config.profiles.example.json",
  "toolkit/SDTKOPS_TOOLKIT.md",
  "toolkit/scripts/install-claude-skills.ps1",
  "toolkit/scripts/install-codex-skills.ps1",
  "toolkit/scripts/uninstall-claude-skills.ps1",
  "toolkit/scripts/uninstall-codex-skills.ps1",
];

const FORBIDDEN_PREFIXES = [
  "toolkit/skills-claude/",
  "toolkit/templates/",
];

const FORBIDDEN_PATHS = new Set([
  "toolkit/skills/placeholder.md",
  "toolkit/scripts/placeholder.md",
]);

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new IntegrityError(
      `SDTK-OPS toolkit manifest not found: ${MANIFEST_PATH}\nRun "npm run build:payload" to sync toolkit assets.`
    );
  }

  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch (error) {
    throw new IntegrityError(`Failed to parse SDTK-OPS toolkit manifest: ${error.message}`);
  }
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolvePayloadFile(relativePath) {
  return path.join(ASSETS_DIR, relativePath);
}

function verify() {
  const manifest = loadManifest();
  if (!Array.isArray(manifest.files)) {
    throw new IntegrityError("SDTK-OPS toolkit manifest has no files array.");
  }

  const errors = [];
  const manifestPaths = new Set();

  for (const entry of manifest.files) {
    manifestPaths.add(entry.path);

    if (FORBIDDEN_PATHS.has(entry.path)) {
      errors.push(`FORBIDDEN PAYLOAD FILE: ${entry.path}`);
      continue;
    }

    if (FORBIDDEN_PREFIXES.some((prefix) => entry.path.startsWith(prefix))) {
      errors.push(`FORBIDDEN PAYLOAD PREFIX: ${entry.path}`);
      continue;
    }

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

  for (const requiredPath of REQUIRED_FILES) {
    if (!manifestPaths.has(requiredPath)) {
      errors.push(`REQUIRED FILE MISSING FROM MANIFEST: ${requiredPath}`);
    }
  }

  const skillManifestEntries = manifest.files.filter(
    (entry) => entry.path.startsWith("toolkit/skills/") && entry.path.endsWith("/SKILL.md")
  );
  if (skillManifestEntries.length < 15) {
    errors.push(`Expected at least 15 skill payload entries, found ${skillManifestEntries.length}.`);
  }

  if (errors.length > 0) {
    throw new IntegrityError(`SDTK-OPS toolkit payload integrity check failed:\n${errors.join("\n")}`);
  }
}

module.exports = {
  ASSETS_DIR,
  MANIFEST_PATH,
  REQUIRED_FILES,
  hashFile,
  loadManifest,
  resolvePayloadFile,
  verify,
};
