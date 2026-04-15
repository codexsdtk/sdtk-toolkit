"use strict";

/**
 * Frozen SPEC premium capability registry (BK-075).
 * These identifiers are locked now so later premium command families
 * (Atlas Ask, project ingest/refresh/audit) share one canonical namespace.
 *
 * Free SPEC capabilities (spec.core.generate, spec.atlas.build, spec.atlas.open, etc.)
 * are NOT listed here; they are never gated by this helper.
 */
const SPEC_PREMIUM_CAPABILITIES = Object.freeze([
  "spec.atlas.ask",
  "spec.project.ingest",
  "spec.project.refresh",
  "spec.project.audit",
]);

/**
 * Integrity/trust failure states that must block premium execution
 * and map to CLI exit code 3 (IntegrityError).
 */
const INTEGRITY_FAILURE_STATES = new Set([
  "malformed",
  "unsigned",
  "invalid-signature",
  "untrusted-key",
]);

/**
 * Check whether a required capability is permitted under the current entitlement state.
 *
 * Decision table:
 *   integrity failure state  ↁEallowed:false, exitCode:3
 *   missing / expired        ↁEallowed:false, exitCode:1 (user-actionable denial)
 *   active or grace, cap present ↁEallowed:true, exitCode:0
 *   active or grace, cap absent  ↁEallowed:false, exitCode:1
 *
 * @param {string} capability - The required capability identifier.
 * @param {{ state: string, manifest: object|null }} entitlementState
 * @returns {{ allowed: boolean, reason: string|null, exitCode: number }}
 */
function checkCapability(capability, entitlementState) {
  const { state, manifest } = entitlementState;

  // Trust/integrity failures block premium execution unconditionally.
  if (INTEGRITY_FAILURE_STATES.has(state)) {
    return {
      allowed: false,
      reason:
        `Entitlement manifest trust failure: ${state}. ` +
        `Run "sdtk-spec entitlement status" for details.`,
      exitCode: 3,
    };
  }

  // No valid entitlement present.
  if (state === "missing" || state === "expired") {
    return {
      allowed: false,
      reason:
        `No valid entitlement for capability "${capability}". ` +
        `A Pro subscription is required.`,
      exitCode: 1,
    };
  }

  if (state !== "active" && state !== "grace") {
    return {
      allowed: false,
      reason:
        `Entitlement manifest trust failure: unexpected state "${state}". ` +
        `Run "sdtk-spec entitlement status" for details.`,
      exitCode: 3,
    };
  }

  // Active or grace: check the capabilities list.
  const caps =
    manifest && Array.isArray(manifest.capabilities)
      ? manifest.capabilities
      : [];

  if (!caps.includes(capability)) {
    return {
      allowed: false,
      reason: `Capability "${capability}" is not included in your current entitlement.`,
      exitCode: 1,
    };
  }

  return { allowed: true, reason: null, exitCode: 0 };
}

module.exports = {
  SPEC_PREMIUM_CAPABILITIES,
  checkCapability,
};

