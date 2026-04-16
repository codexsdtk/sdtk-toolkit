"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir, getAuthFile, hardenFilePermissions } = require("./suite-state");
const { migrateLegacyAuthStateIfNeeded } = require("./legacy-auth-migration");

function readAuthPayload(authFile) {
  try {
    const payload = JSON.parse(fs.readFileSync(authFile, "utf8"));
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function normalizeAuthState(payload) {
  const token = typeof payload.github_token === "string" ? payload.github_token : "";
  return { authenticated: token.length > 0, token };
}

function writeAuthPayload(payload) {
  const authFile = getAuthFile();
  ensureDir(path.dirname(authFile));
  fs.writeFileSync(authFile, JSON.stringify(payload, null, 2), "utf8");
  const hardened = hardenFilePermissions(authFile);
  return { path: authFile, hardened };
}

function readAuthState() {
  const authFile = getAuthFile();
  if (!fs.existsSync(authFile)) {
    const migration = migrateLegacyAuthStateIfNeeded();
    if (migration.malformedLegacy || !fs.existsSync(authFile)) {
      return { authenticated: false, token: "" };
    }
  }

  const payload = readAuthPayload(authFile);
  if (!payload) {
    return { authenticated: false, token: "" };
  }

  return normalizeAuthState(payload);
}

/**
 * Write auth state and harden file permissions.
 * @returns {{ path: string, hardened: boolean }}
 */
function writeAuthState(token) {
  return writeAuthPayload({
    github_token: token,
    updated_at: new Date().toISOString(),
  });
}

function clearAuthState() {
  return writeAuthPayload({
    github_token: "",
    updated_at: new Date().toISOString(),
  });
}

module.exports = {
  ensureDir,
  getAuthFile,
  readAuthState,
  writeAuthState,
  clearAuthState,
};
