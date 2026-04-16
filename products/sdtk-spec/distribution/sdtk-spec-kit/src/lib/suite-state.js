"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getSuiteRoot() {
  return path.join(os.homedir(), ".sdtk");
}

function getAuthFile() {
  return path.join(getSuiteRoot(), "auth.json");
}

function getEntitlementsFile() {
  return path.join(getSuiteRoot(), "entitlements.json");
}

function getActivationFile() {
  return path.join(getSuiteRoot(), "activation.json");
}

function getPacksRoot() {
  return path.join(getSuiteRoot(), "packs");
}

function getLogsRoot() {
  return path.join(getSuiteRoot(), "logs");
}

/**
 * Harden file permissions so only the current user can read/write.
 * - POSIX: chmod 600
 * - Windows: icacls to grant only current user Full Control
 * @returns {boolean} true if hardening succeeded, false otherwise.
 */
function hardenFilePermissions(filePath) {
  try {
    if (process.platform === "win32") {
      const username = os.userInfo().username;
      execFileSync("icacls", [
        filePath,
        "/inheritance:r",
        "/grant:r",
        `${username}:(F)`,
      ], { stdio: "ignore" });
    } else {
      fs.chmodSync(filePath, 0o600);
    }
    return true;
  } catch (_err) {
    return false;
  }
}

module.exports = {
  ensureDir,
  getSuiteRoot,
  getAuthFile,
  getEntitlementsFile,
  getActivationFile,
  getPacksRoot,
  getLogsRoot,
  hardenFilePermissions,
};
