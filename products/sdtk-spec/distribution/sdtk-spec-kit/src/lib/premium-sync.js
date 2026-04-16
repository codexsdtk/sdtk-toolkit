"use strict";

const fs = require("fs");
const path = require("path");
const { readAuthState } = require("./state");
const { getEntitlementsFile, ensureDir } = require("./suite-state");
const { evaluateManifestObject } = require("./entitlements");
const { fetchGithubContents, getEntitlementRepo } = require("./github-access");
const {
  validatePackMeta,
  writePackToCache,
  resolvePackState,
} = require("./premium-packs");

const DEFAULT_MANIFEST_PATH = "entitlements/spec/entitlements.json";
const DEFAULT_REF = "main";

// Trust states that must block manifest cache writes and pack sync.
const INVALID_TRUST_STATES = new Set([
  "malformed",
  "unsigned",
  "invalid-signature",
  "untrusted-key",
]);

/**
 * Run a full entitlement sync for the SPEC product.
 *
 * Flow:
 *   1. Read suite auth token; fail with exitCode 1 if unauthenticated.
 *   2. Fetch signed entitlement manifest from GitHub Contents API.
 *   3. Verify manifest using evaluateManifestObject.
 *   4. Write verified manifest to ~/.sdtk/entitlements.json only after verification.
 *   5. Resolve required SPEC premium packs from signed premium_packs metadata.
 *   6. Fetch and cache each required pack; verify SHA256 before final write.
 *   7. Return a structured summary for CLI output.
 *
 * @param {object} [options]
 * @param {Function} [options.fetcher] - Injectable HTTP fetch function (default: global fetch)
 * @param {number}   [options.nowMs]   - Current epoch ms (injectable for deterministic tests)
 * @returns {Promise<SyncResult>}
 *
 * @typedef {object} SyncResult
 * @property {"updated"|"unchanged"|"failed"|"unknown"} manifestState
 * @property {string|null} trustState - active | grace | expired | rejected | null
 * @property {{ required: number, installed: number, unchanged: number, rejected: number }} packs
 * @property {number} exitCode - 0 success, 1 auth/network failure, 3 integrity failure, 4 internal
 * @property {string[]} errors - Actionable error messages for stderr
 */
async function syncEntitlements({ fetcher, nowMs } = {}) {
  const result = {
    manifestState: "unknown",
    trustState: null,
    packs: {
      required: 0,
      installed: 0,
      unchanged: 0,
      rejected: 0,
    },
    exitCode: 0,
    errors: [],
  };

  // ---- 1. Read auth state ----
  let auth;
  try {
    auth = readAuthState();
  } catch (_e) {
    auth = { authenticated: false, token: "" };
  }

  if (!auth.authenticated || !auth.token) {
    result.manifestState = "failed";
    result.exitCode = 1;
    result.errors.push(
      "Not authenticated. Run: sdtk-spec auth --token <your-github-token>"
    );
    return result;
  }

  // ---- 2. Fetch signed manifest ----
  const repo =
    process.env.SDTK_ENTITLEMENT_REPO || getEntitlementRepo();
  const manifestPath =
    process.env.SDTK_ENTITLEMENT_MANIFEST_PATH || DEFAULT_MANIFEST_PATH;
  const ref = process.env.SDTK_ENTITLEMENT_REF || DEFAULT_REF;

  let manifestBytes;
  try {
    manifestBytes = await fetchGithubContents(
      auth.token,
      repo,
      manifestPath,
      ref,
      fetcher
    );
  } catch (err) {
    result.manifestState = "failed";
    result.exitCode = 1;
    result.errors.push(
      `Failed to fetch entitlement manifest: ${err.message}`
    );
    return result;
  }

  // ---- 3. Parse manifest ----
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (_e) {
    result.manifestState = "failed";
    result.trustState = "rejected";
    result.exitCode = 3;
    result.errors.push(
      "Remote manifest is malformed JSON. Existing cache preserved."
    );
    return result;
  }

  // ---- 4. Verify manifest ----
  const now = nowMs !== undefined ? nowMs : Date.now();
  const { state: trustState } = evaluateManifestObject(manifest, now);
  result.trustState = trustState;

  if (INVALID_TRUST_STATES.has(trustState)) {
    result.manifestState = "failed";
    result.exitCode = 3;
    result.errors.push(
      `Remote manifest verification failed: ${trustState}. Existing cache preserved.`
    );
    return result;
  }

  // ---- 5. Write verified manifest to cache ----
  const entitlementsFile = getEntitlementsFile();
  try {
    ensureDir(path.dirname(entitlementsFile));
    const newStr = JSON.stringify(manifest, null, 2);

    let existingStr = null;
    if (fs.existsSync(entitlementsFile)) {
      try {
        const existingRaw = fs.readFileSync(entitlementsFile, "utf8");
        existingStr = JSON.stringify(JSON.parse(existingRaw), null, 2);
      } catch (_) {}
    }

    if (existingStr !== null && existingStr === newStr) {
      result.manifestState = "unchanged";
    } else {
      fs.writeFileSync(entitlementsFile, newStr, "utf8");
      result.manifestState = "updated";
    }
  } catch (err) {
    result.manifestState = "failed";
    result.exitCode = 4;
    result.errors.push(
      `Failed to write entitlement cache: ${err.message}`
    );
    return result;
  }

  // ---- 6. Resolve required SPEC packs ----
  const premiumPacks = Array.isArray(manifest.premium_packs)
    ? manifest.premium_packs
    : [];
  const manifestCaps = Array.isArray(manifest.capabilities)
    ? manifest.capabilities
    : [];

  // A pack is required if its product is "spec" and at least one of its
  // capabilities intersects the verified entitlement capabilities list.
  const requiredPacks = premiumPacks.filter((pack) => {
    if (!pack || pack.product !== "spec") return false;
    if (!Array.isArray(pack.capabilities)) return false;
    return pack.capabilities.some((c) => manifestCaps.includes(c));
  });

  result.packs.required = requiredPacks.length;

  // ---- 7. Fetch and cache each required pack ----
  for (const packEntry of requiredPacks) {
    // Validate pack metadata shape before any network access.
    const validation = validatePackMeta(packEntry);
    if (!validation.valid) {
      result.packs.rejected++;
      result.exitCode = Math.max(result.exitCode, 3);
      result.errors.push(
        `Pack "${packEntry.id || "unknown"}" has malformed metadata: ${validation.reason}`
      );
      continue;
    }

    // Check if pack is already current (no-op path).
    const packState = resolvePackState(packEntry);
    if (packState.state === "present") {
      result.packs.unchanged++;
      continue;
    }

    // Fetch pack bytes.
    const packRef = packEntry.source.ref || ref;
    let packBytes;
    try {
      packBytes = await fetchGithubContents(
        auth.token,
        repo,
        packEntry.source.path,
        packRef,
        fetcher
      );
    } catch (err) {
      result.packs.rejected++;
      result.exitCode = Math.max(result.exitCode, 1);
      result.errors.push(
        `Failed to fetch pack "${packEntry.id}": ${err.message}`
      );
      continue;
    }

    // Verify SHA256 and write to cache.
    const writeResult = writePackToCache(packEntry, packBytes);
    if (writeResult.success) {
      result.packs.installed++;
    } else {
      result.packs.rejected++;
      result.exitCode = Math.max(result.exitCode, 3);
      result.errors.push(writeResult.reason);
    }
  }

  return result;
}

module.exports = { syncEntitlements };
