"use strict";

const { clearAuthState, readAuthState, writeAuthState } = require("../lib/state");
const { parseFlags } = require("../lib/args");
const { checkRepoAccess } = require("../lib/github-access");
const { ValidationError } = require("../lib/errors");

const FLAG_DEFS = {
  token: { type: "string" },
  status: { type: "boolean" },
  logout: { type: "boolean" },
  verify: { type: "boolean" },
};

/**
 * Redact a token for safe display (show first 4 chars only).
 */
function redactToken(token) {
  if (!token || token.length < 8) return "****";
  return token.slice(0, 4) + "****";
}

async function cmdAuth(args) {
  const { flags } = parseFlags(args, FLAG_DEFS);

  if (flags.status) {
    const state = readAuthState();
    if (!state.authenticated) {
      console.log("Auth status: not authenticated");
      console.log('Run "sdtk-spec auth --token <value>" to authenticate.');
      return 1;
    }
    console.log("Auth status: authenticated");
    console.log(`Token: ${redactToken(state.token)}`);
    return 0;
  }

  if (flags.logout) {
    clearAuthState();
    console.log("Auth state cleared.");
    return 0;
  }

  // Process --token first, then optionally --verify in the same invocation.
  // This supports: sdtk-spec auth --token <value> --verify
  if (flags.token) {
    const { path: authFile, hardened } = writeAuthState(flags.token);
    if (hardened) {
      console.log("Token stored securely.");
    } else {
      console.log("Token stored (file permission hardening was not applied).");
    }
    console.log(`Auth file: ${authFile}`);

    if (flags.verify) {
      console.log("");
      console.log("Verifying repository access...");
      const result = await checkRepoAccess(flags.token);
      console.log(result.message);
      return result.hasAccess ? 0 : 1;
    }

    console.log('Run "sdtk-spec auth --verify" to check repository access.');
    return 0;
  }

  if (flags.verify) {
    const state = readAuthState();
    if (!state.authenticated) {
      console.log("Not authenticated. Store a token first with --token.");
      return 1;
    }
    const result = await checkRepoAccess(state.token);
    console.log(result.message);
    return result.hasAccess ? 0 : 1;
  }

  throw new ValidationError(
    "Usage: sdtk-spec auth --token <value> [--verify] | --status | --logout"
  );
}

module.exports = {
  cmdAuth,
};
