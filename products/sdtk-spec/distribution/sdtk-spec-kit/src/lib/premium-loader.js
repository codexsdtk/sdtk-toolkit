"use strict";

const { loadEntitlementState } = require("./entitlements");
const { checkCapability } = require("./capabilities");
const { resolvePackState, getPackFile } = require("./premium-packs");

/**
 * Load a verified premium pack handler for the specified capability.
 *
 * Steps:
 *   1. Load local entitlement state.
 *   2. Check the required capability via checkCapability.
 *   3. Find the matching premium pack entry in manifest.premium_packs.
 *   4. Verify the pack cache state via resolvePackState.
 *   5. Require the pack module from cache.
 *   6. Resolve the handler export (prefer named export, fallback to "run").
 *
 * Failure mapping:
 *   integrity failure state    -> { ok: false, exitCode: 3 }
 *   missing / expired / no cap -> { ok: false, exitCode: 1 }
 *   missing / stale pack       -> { ok: false, exitCode: 1 }
 *   malformed pack             -> { ok: false, exitCode: 3 }
 *   require failure            -> { ok: false, exitCode: 4 }
 *   bad handler export         -> { ok: false, exitCode: 3 }
 *   success                    -> { ok: true, handler, packEntry }
 *
 * @param {string} capability      - Required capability ID (e.g. "spec.atlas.ask").
 * @param {string} preferredExport - Preferred handler export name (e.g. "atlasAsk").
 * @returns {Promise<
 *   { ok: true, handler: Function, packEntry: object } |
 *   { ok: false, exitCode: number, message: string }
 * >}
 */
async function loadPremiumHandler(capability, preferredExport) {
  // 1. Load entitlement state
  const entitlementState = loadEntitlementState();

  // 2. Check capability (handles integrity, missing, expired, not-included)
  const check = checkCapability(capability, entitlementState);
  if (!check.allowed) {
    return { ok: false, exitCode: check.exitCode, message: check.reason };
  }

  // 3. Find matching pack entry from manifest.premium_packs
  const manifest = entitlementState.manifest;
  const packs =
    manifest && Array.isArray(manifest.premium_packs)
      ? manifest.premium_packs
      : [];

  const packEntry = packs.find(
    (p) =>
      p.product === "spec" &&
      Array.isArray(p.capabilities) &&
      p.capabilities.includes(capability)
  );

  if (!packEntry) {
    return {
      ok: false,
      exitCode: 1,
      message:
        `Premium pack providing "${capability}" is not available. ` +
        `Run "sdtk-spec entitlement sync" to install the required premium pack.`,
    };
  }

  // 4. Verify pack cache state
  const packState = resolvePackState(packEntry);

  if (packState.state === "malformed") {
    return {
      ok: false,
      exitCode: 3,
      message:
        `Premium pack integrity failure: ${packState.reason} ` +
        `Run "sdtk-spec entitlement status" for details.`,
    };
  }

  if (packState.state !== "present") {
    // missing or stale
    return {
      ok: false,
      exitCode: 1,
      message:
        `Premium pack is not ready (${packState.state}). ` +
        (packState.reason ||
          `Run "sdtk-spec entitlement sync" to install or refresh the premium pack.`),
    };
  }

  // 5. Load pack module from cache
  const packFile = getPackFile(packEntry.id, packEntry.version);
  let packModule;
  try {
    packModule = require(packFile);
  } catch (err) {
    return {
      ok: false,
      exitCode: 4,
      message: `Failed to load premium pack handler: ${err.message}`,
    };
  }

  // 6. Resolve handler export: prefer named export, fallback to "run"
  const handler =
    preferredExport &&
    typeof packModule[preferredExport] === "function"
      ? packModule[preferredExport]
      : packModule.run;

  if (typeof handler !== "function") {
    return {
      ok: false,
      exitCode: 3,
      message:
        `Premium pack handler contract is invalid: ` +
        `expected export "${preferredExport}" or "run" to be a function.`,
    };
  }

  return { ok: true, handler, packEntry };
}

module.exports = { loadPremiumHandler };
