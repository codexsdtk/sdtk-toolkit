"use strict";

// BK-340 — sleep-authorization WRITER (attended side).
//
// `sdtk-code sleep authorize` moves the human's deliberate consent from the
// Phase E in-session TTY confirm to a pre-declared artifact created while the
// operator is still present. The artifact binds — by sha256 — to the exact
// sleep-plan bytes and the exact pinned agent-team scope it authorizes, carries
// budget caps validated against the hard engine ceilings, and expires after a
// bounded TTL. VALIDATION of the artifact at execute time deliberately lives in
// the Pro pack (see the BK-340 spec §W4): this module only creates it.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { loadSleepPlan, gatherReportSignals, projectSleepReport } = require("./sleep-report");
const { loadExecuteContext } = require("./agent-team-execute");
const { loadReadiness } = require("./agent-team-readiness");
const {
  pinScope,
  AUTHORIZED_MAX_ITERATIONS,
  AUTHORIZED_MAX_COST_USD,
  AUTHORIZED_MAX_TTL_HOURS,
  SESSION_MAX_ITERATIONS,
  SESSION_MAX_COST_USD,
  resolveSessionBudgets,
} = require("./agent-team-sleep-session");

const AUTHORIZATION_SCHEMA = "sdtk.sleep-authorization.v1";
const DEFAULT_TTL_HOURS = 8;

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

// BK-340 F2/F3 integrity binding. Every security-relevant field is folded into
// one digest so a naive single-field edit (budgets 1->9 within ceiling, or
// expires_at -> 2099) no longer round-trips: the pack recomputes this digest at
// execute time and fail-closes on any mismatch.
//
// NOTE (honest scope, not tamper-PROOF): the artifact carries no client secret,
// so a determined local forger who understands this canonical form can recompute
// the digest and craft a valid artifact within the engine ceilings. That residual
// is accepted and documented — the digest is tamper-EVIDENCE against naive edits
// and co-resident processes that do not know the format, and the engine envelope
// (doc-class guard, hard ceilings, per-iteration readiness re-check, pinned scope,
// worktree isolation) bounds the blast radius regardless. The pack keeps a
// byte-identical copy of this function; `test_sdtk_code_sleep_execute_pro.py`
// asserts the two agree so they cannot drift.
function authorizationDigestPayload(auth) {
  const a = auth || {};
  const b = a.budgets || {};
  return JSON.stringify([
    AUTHORIZATION_SCHEMA,
    a.feature_key,
    a.plan_sha256,
    a.pinned_scope_sha256,
    b.max_iterations,
    b.max_cost_usd,
    a.patch_class,
    a.created_at,
    a.expires_at,
  ]);
}

function computeAuthorizationDigest(auth) {
  return sha256Hex(Buffer.from(authorizationDigestPayload(auth), "utf8"));
}

function authorizationPath(projectPath) {
  return path.join(path.resolve(projectPath || "."), ".sdtk", "trust", "sleep-authorization.json");
}

function sleepPlanPath(projectPath) {
  return path.join(path.resolve(projectPath || "."), ".sdtk", "trust", "sleep-plan.json");
}

function buildAuthorizationPhrase(featureKey, budgets, ttlHours) {
  return (
    `AUTHORIZE ${featureKey} max_iterations=${budgets.maxIterations} ` +
    `cost_cap=$${budgets.maxCostUsd.toFixed(2)} ttl_hours=${ttlHours} unit=Path2-author-only`
  );
}

function resolveTtlHours(value) {
  const ttl = value === undefined ? DEFAULT_TTL_HOURS : Number(value);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new ValidationError("SLEEP_AUTH_TTL_INVALID: --ttl-hours must be a positive number.");
  }
  if (ttl > AUTHORIZED_MAX_TTL_HOURS) {
    throw new ValidationError(
      `SLEEP_AUTH_TTL_INVALID: --ttl-hours exceeds the engine ceiling (${AUTHORIZED_MAX_TTL_HOURS}h).`
    );
  }
  return ttl;
}

// The attended typed confirmation. Mirrors the Phase E confirm contract:
// requires a real TTY and the exact phrase — no --yes path exists.
async function confirmAuthorization(input, phrase) {
  const source = input || {};
  if (source.isTTY !== true) {
    throw new ValidationError(
      "SLEEP_AUTH_REQUIRES_TTY: sleep authorize requires an interactive TTY confirmation."
    );
  }
  if (typeof source.readLine !== "function") {
    throw new ValidationError("SLEEP_AUTH_REQUIRES_TTY: confirmation reader is not available.");
  }
  const answer = await source.readLine(`Type ${phrase} to authorize: `);
  if (String(answer || "") !== phrase) {
    throw new ValidationError(
      "SLEEP_AUTH_CONFIRMATION_MISMATCH: exact sleep-authorize confirmation phrase was not provided."
    );
  }
  return { confirmed: true };
}

/**
 * Create the sleep-authorization artifact (attended).
 *
 * Preconditions (each fail-closed with a typed error):
 *   1. sleep plan exists and matches the feature key;
 *   2. a FRESH sleep report computes READY_TO_SLEEP;
 *   3. the agent-team execute context loads and its scope pins (bounded);
 *   4. the agent-team readiness artifact is READY_TO_SLEEP;
 *   5. budgets/TTL are within the hard engine ceilings;
 *   6. the operator types the exact confirmation phrase on a TTY.
 */
async function createSleepAuthorization(projectPath, featureKey, opts) {
  const options = opts || {};
  const resolved = path.resolve(projectPath || ".");

  // 1. Sleep plan (throws NEEDS_PLAN when absent) + feature match.
  const plan = loadSleepPlan(resolved);
  if (plan.feature_key !== featureKey) {
    throw new ValidationError(
      `SLEEP_AUTH_PLAN_MISMATCH: sleep-plan feature_key "${plan.feature_key}" does not match --feature-key "${featureKey}".`
    );
  }

  // 2. Fresh sleep-report verdict must be READY_TO_SLEEP.
  const signals = gatherReportSignals(resolved, featureKey);
  const report = projectSleepReport(plan, signals);
  if (report.verdict !== "READY_TO_SLEEP") {
    throw new ValidationError(
      `SLEEP_AUTH_NOT_READY: sleep report verdict is "${report.verdict}" — ${report.reason}`
    );
  }

  // 3. Agent-team execute context + pinned scope (pinScope enforces bounded,
  //    non-whole-repo allowed_file_scopes and an allowlisted verification set).
  const ctx = loadExecuteContext(resolved, featureKey);
  const pinnedScope = pinScope(ctx);

  // 4. Agent-team readiness gate (the engine re-asserts authenticity per
  //    iteration; authorize checks the verdict up front for honest UX).
  const readiness = loadReadiness(resolved, featureKey);
  if (!readiness || readiness.overall_verdict !== "READY_TO_SLEEP") {
    throw new ValidationError(
      `SLEEP_AUTH_NOT_READY: agent-team readiness verdict is "${readiness ? readiness.overall_verdict : "absent"}".`
    );
  }

  // 5. Budgets + TTL within engine ceilings (resolveSessionBudgets throws
  //    FAIL_BUDGET_CEILING above the hard caps).
  const budgets = resolveSessionBudgets({
    max_iterations: options.maxIterations === undefined ? SESSION_MAX_ITERATIONS : Number(options.maxIterations),
    max_cost_usd: options.maxCostUsd === undefined ? SESSION_MAX_COST_USD : Number(options.maxCostUsd),
  });
  const ttlHours = resolveTtlHours(options.ttlHours);

  // 6. Attended typed confirmation.
  const phrase = buildAuthorizationPhrase(featureKey, budgets, ttlHours);
  await confirmAuthorization(options.confirmInput || {}, phrase);

  const planBytes = fs.readFileSync(sleepPlanPath(resolved));
  const nowMs = typeof options.nowMs === "function" ? options.nowMs() : Date.now();
  const createdAt = new Date(nowMs);
  const expiresAt = new Date(nowMs + ttlHours * 60 * 60 * 1000);

  const authorization = {
    schema_version: AUTHORIZATION_SCHEMA,
    feature_key: featureKey,
    plan_sha256: sha256Hex(planBytes),
    pinned_scope_sha256: sha256Hex(Buffer.from(JSON.stringify(pinnedScope), "utf8")),
    budgets: {
      max_iterations: budgets.maxIterations,
      max_cost_usd: budgets.maxCostUsd,
    },
    patch_class: "doc",
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    confirmation: {
      phrase_sha256: sha256Hex(Buffer.from(phrase, "utf8")),
      confirmed_at: createdAt.toISOString(),
      tty: true,
    },
  };
  // Bind all security-relevant fields (F2/F3). Computed last, over the fields above.
  authorization.authorization_sha256 = computeAuthorizationDigest(authorization);

  const outPath = authorizationPath(resolved);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(authorization, null, 2), "utf8");
  fs.renameSync(tmpPath, outPath);
  return { outPath, authorization };
}

module.exports = {
  AUTHORIZATION_SCHEMA,
  DEFAULT_TTL_HOURS,
  authorizationPath,
  buildAuthorizationPhrase,
  authorizationDigestPayload,
  computeAuthorizationDigest,
  createSleepAuthorization,
};
