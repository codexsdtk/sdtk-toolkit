"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { ensureDir, getAuthFile, hardenFilePermissions } = require("./suite-state");

function getLegacyAuthFile() {
  return path.join(os.homedir(), ".sdtkrc");
}

function buildMigratedPayload(payload) {
  const token = typeof payload.github_token === "string" ? payload.github_token : "";
  const updatedAt =
    typeof payload.updated_at === "string" && payload.updated_at.trim().length > 0
      ? payload.updated_at
      : new Date().toISOString();

  return {
    github_token: token,
    updated_at: updatedAt,
  };
}

function migrateLegacyAuthStateIfNeeded() {
  const authFile = getAuthFile();
  if (fs.existsSync(authFile)) {
    return { migrated: false, malformedLegacy: false, path: authFile };
  }

  const legacyAuthFile = getLegacyAuthFile();
  if (!fs.existsSync(legacyAuthFile)) {
    return { migrated: false, malformedLegacy: false, path: authFile };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(legacyAuthFile, "utf8"));
    const migratedPayload = buildMigratedPayload(payload);
    ensureDir(path.dirname(authFile));
    fs.writeFileSync(authFile, JSON.stringify(migratedPayload, null, 2), "utf8");
    const hardened = hardenFilePermissions(authFile);
    return {
      migrated: true,
      malformedLegacy: false,
      path: authFile,
      hardened,
    };
  } catch (_error) {
    return { migrated: false, malformedLegacy: true, path: authFile };
  }
}

module.exports = {
  getLegacyAuthFile,
  migrateLegacyAuthStateIfNeeded,
};
