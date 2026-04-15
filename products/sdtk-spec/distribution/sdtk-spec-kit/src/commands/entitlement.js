"use strict";

const fs = require("fs");
const { loadEntitlementState } = require("../lib/entitlements");
const { syncEntitlements } = require("../lib/premium-sync");
const { getAuthFile } = require("../lib/suite-state");

// Trust/integrity states that require exit code 3.
const INTEGRITY_FAILURE_STATES = new Set([
  "malformed",
  "unsigned",
  "invalid-signature",
  "untrusted-key",
]);

/**
 * Read the suite auth file and return a simple auth summary.
 * @param {string} authFilePath
 * @returns {{ authenticated: boolean }}
 */
function loadAuthState(authFilePath) {
  if (!fs.existsSync(authFilePath)) {
    return { authenticated: false };
  }
  try {
    const data = JSON.parse(fs.readFileSync(authFilePath, "utf8"));
    const token = data.github_token;
    return { authenticated: typeof token === "string" && token.length > 0 };
  } catch (_e) {
    return { authenticated: false };
  }
}

/**
 * `sdtk-spec entitlement status`
 *
 * Reads local auth and entitlement state. Never hits the network.
 * Prints a bounded summary and exits:
 *   0  - informational state (missing, active, grace, expired)
 *   3  - trust/integrity failure (malformed, unsigned, invalid-signature, untrusted-key)
 */
function entitlementStatus() {
  const auth = loadAuthState(getAuthFile());
  const { state, manifest } = loadEntitlementState();

  const lines = [
    "Entitlement Status",
    "------------------",
    `Auth state:     ${auth.authenticated ? "authenticated" : "not authenticated"}`,
    `Manifest state: ${state}`,
  ];

  if (manifest) {
    if (manifest.plan) {
      lines.push(`Plan:           ${manifest.plan}`);
    }
    if (manifest.products && manifest.products.spec) {
      lines.push(`SPEC tier:      ${manifest.products.spec}`);
    }
    const caps = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
    const capWord = caps.length === 1 ? "capability" : "capabilities";
    lines.push(`Capabilities:   ${caps.length} ${capWord}`);
    if (manifest.expires_at) {
      lines.push(`Expires at:     ${manifest.expires_at}`);
    }
    if (manifest.offline_grace_until) {
      lines.push(`Grace until:    ${manifest.offline_grace_until}`);
    }
  }

  console.log(lines.join("\n"));

  if (INTEGRITY_FAILURE_STATES.has(state)) {
    process.stderr.write(
      `Entitlement trust failure: ${state}. ` +
        `Manifest cannot be used for premium capability decisions.\n`
    );
    return 3;
  }

  return 0;
}

/**
 * `sdtk-spec entitlement sync`
 *
 * Fetches and verifies a signed entitlement manifest from GitHub Contents API,
 * caches it locally, and installs required SPEC premium packs.
 *
 * Prints a bounded sync summary and exits:
 *   0  - manifest verified and required pack sync completed (or no packs required)
 *   1  - unauthenticated, network failure, or unauthorized
 *   3  - manifest trust failure or pack SHA256 mismatch
 *   4  - unexpected internal error
 */
async function entitlementSync() {
  let result;
  try {
    result = await syncEntitlements();
  } catch (err) {
    process.stderr.write(`Unexpected error during sync: ${err.message}\n`);
    return 4;
  }

  const lines = [
    "Entitlement Sync",
    "----------------",
    `Manifest state: ${result.manifestState}`,
  ];

  if (result.trustState) {
    lines.push(`Trust state:    ${result.trustState}`);
  }

  if (result.packs.required > 0) {
    lines.push(`Packs required: ${result.packs.required}`);
    lines.push(`  installed:    ${result.packs.installed}`);
    lines.push(`  unchanged:    ${result.packs.unchanged}`);
    lines.push(`  rejected:     ${result.packs.rejected}`);
  } else {
    lines.push("Packs required: 0");
  }

  console.log(lines.join("\n"));

  for (const msg of result.errors) {
    process.stderr.write(`${msg}\n`);
  }

  return result.exitCode;
}

/**
 * Entry point for the `entitlement` command.
 *
 * Supported subcommands:
 *   status  - Show local entitlement and capability state (local-only, no network)
 *   sync    - Fetch and verify a signed entitlement manifest; install required SPEC packs
 *
 * @param {string[]} args - Remaining argv after "entitlement"
 * @returns {number|Promise<number>} CLI exit code
 */
async function cmdEntitlement(args) {
  const [subcommand] = args || [];

  if (!subcommand || subcommand === "status") {
    return entitlementStatus();
  }

  if (subcommand === "sync") {
    return entitlementSync();
  }

  process.stderr.write(
    `Unknown entitlement subcommand: "${subcommand}". ` +
      `Run "sdtk-spec entitlement status" or "sdtk-spec entitlement sync".\n`
  );
  return 1;
}

module.exports = {
  cmdEntitlement,
};
