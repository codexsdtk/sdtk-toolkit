"use strict";

const crypto = require("crypto");
const { ValidationError } = require("./errors");
const { safeSegment } = require("./agent-team-export");
const { redact } = require("./trust-redact");

const SESSION_MAX_ITERATIONS = 3;
const SESSION_MAX_COST_USD = 3.00;
const SESSION_MAX_OUTPUT_TOKENS = 48000;
const SESSION_WALLCLOCK_TIMEOUT_MS = 30 * 60 * 1000;
// BK-340: hard engine ceilings for authorization-backed sessions (OQ-3). A
// sleep-authorization artifact may raise the per-session budgets ABOVE the
// free-tier defaults but NEVER above these — the ceilings live here, in the
// engine, so no artifact content can widen them.
const AUTHORIZED_MAX_ITERATIONS = 10;
const AUTHORIZED_MAX_COST_USD = 10.00;
const AUTHORIZED_MAX_TTL_HOURS = 24;
const SESSION_DOC_TARGET_PATTERNS = Object.freeze([
  "docs/**/*.md",
  "governance/**/*.md",
  "README.md",
  "AGENTS.md",
]);
const SESSION_ALLOWED_COMMANDS = Object.freeze([
  "python3 scripts/ci/docs_lint.py",
  "python3 scripts/ci/path_check.py",
]);

const activeSessionIds = new Set();

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function makeSessionId(featureKey, seed) {
  if (seed) return safeSegment(seed, "session_id");
  const stamp = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return safeSegment(`${featureKey}_${stamp}_${rand}`, "session_id");
}

function normalizeCommand(value) {
  return String(value || "").trim();
}

function pinAllowedCommands(commands) {
  const seen = new Set();
  const out = [];
  for (const command of asArray(commands).map(normalizeCommand)) {
    if (SESSION_ALLOWED_COMMANDS.includes(command) && !seen.has(command)) {
      seen.add(command);
      out.push(command);
    }
  }
  if (out.length === 0) {
    throw new ValidationError("FAIL_NO_ALLOWED_COMMANDS: no role verification command matches the Phase E session allowlist.");
  }
  return Object.freeze(out);
}

function pinAllowedScopes(ctx) {
  const scopes = asArray(ctx && ctx.allowedFileScopes).map((scope) => String(scope || "").trim()).filter(Boolean);
  if (scopes.length === 0) {
    throw new ValidationError("FAIL_EXECUTE_SCOPE: Phase E requires pinned allowed_file_scopes.");
  }
  return Object.freeze(scopes);
}

function collectTaskList(plan) {
  const items = [];
  for (const value of asArray(plan && plan.implementation_slices)) {
    if (value) items.push(String(value));
  }
  for (const role of asArray(plan && plan.roles)) {
    if (role && role.objective) items.push(String(role.objective));
    for (const value of asArray(role && role.evidence_required)) {
      items.push(`evidence_required:${role.role}:${value}`);
    }
  }
  return items;
}

function pinScope(ctx) {
  const source = ctx || {};
  return Object.freeze({
    feature_key: source.featureKey,
    run_id: source.runId,
    role: source.role && source.role.role ? String(source.role.role) : "dev",
    allowed_file_scopes: pinAllowedScopes(source),
    doc_target_patterns: SESSION_DOC_TARGET_PATTERNS,
    verification_commands: pinAllowedCommands(source.verificationCommands),
  });
}

function redactedTaskList(plan) {
  return collectTaskList(plan).map((item) => redact(item));
}

function enumerateCarriedState(data) {
  const source = data || {};
  const priorPatchHashes = asArray(source.priorPatchHashes).map((hash) => String(hash));
  return Object.freeze({
    cumulativeWorktreePath: source.cumulativeWorktreePath ? redact(String(source.cumulativeWorktreePath)) : null,
    taskListFromPinnedPlan: redactedTaskList(source.plan),
    priorPatchHashes: Object.freeze(priorPatchHashes),
    accumulators: Object.freeze({
      iteration: Number(source.iteration || 0),
      session_cost_usd: Number(source.session_cost_usd || 0),
      session_output_tokens: Number(source.session_output_tokens || 0),
    }),
  });
}

function projectedCost(projectedNextCall) {
  const call = projectedNextCall || {};
  if (call.pricing_unknown === true || call.model_id_unknown === true) {
    throw new ValidationError("FAIL_MODEL_PRICING_UNKNOWN: model pricing is not pinned for this session iteration.");
  }
  const value = call.projected_cost_usd === undefined ? 0 : Number(call.projected_cost_usd);
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError("FAIL_MODEL_PRICING_UNKNOWN: model pricing is not pinned for this session iteration.");
  }
  return value;
}

function projectedTokens(projectedNextCall) {
  const value = projectedNextCall && projectedNextCall.projected_output_tokens !== undefined
    ? Number(projectedNextCall.projected_output_tokens)
    : 0;
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError("FAIL_SESSION_TOKEN_CAP: projected output tokens are not evaluable.");
  }
  return value;
}

// BK-340: validate optional authorization-backed budgets against the hard
// engine ceilings. Absent budgets keep today's free-tier defaults untouched.
function resolveSessionBudgets(budgets) {
  if (budgets === undefined || budgets === null) {
    return { maxIterations: SESSION_MAX_ITERATIONS, maxCostUsd: SESSION_MAX_COST_USD };
  }
  if (typeof budgets !== "object" || Array.isArray(budgets)) {
    throw new ValidationError("FAIL_BUDGET_CEILING: session budgets must be an object when provided.");
  }
  const iterations = budgets.max_iterations === undefined ? SESSION_MAX_ITERATIONS : budgets.max_iterations;
  const costUsd = budgets.max_cost_usd === undefined ? SESSION_MAX_COST_USD : budgets.max_cost_usd;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new ValidationError("FAIL_BUDGET_CEILING: budgets.max_iterations must be a positive integer.");
  }
  if (iterations > AUTHORIZED_MAX_ITERATIONS) {
    throw new ValidationError(`FAIL_BUDGET_CEILING: budgets.max_iterations exceeds the engine ceiling (${AUTHORIZED_MAX_ITERATIONS}).`);
  }
  if (!Number.isFinite(costUsd) || costUsd <= 0) {
    throw new ValidationError("FAIL_BUDGET_CEILING: budgets.max_cost_usd must be a positive number.");
  }
  if (costUsd > AUTHORIZED_MAX_COST_USD) {
    throw new ValidationError(`FAIL_BUDGET_CEILING: budgets.max_cost_usd exceeds the engine ceiling ($${AUTHORIZED_MAX_COST_USD.toFixed(2)}).`);
  }
  return { maxIterations: iterations, maxCostUsd: costUsd };
}

function createSleepSession(input) {
  const options = input || {};
  const featureKey = safeSegment(options.featureKey, "feature_key");
  const sessionId = makeSessionId(featureKey, options.sessionId);
  const now = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const startedAtMs = Number(options.startedAtMs === undefined ? now() : options.startedAtMs);
  const pinnedScope = options.pinnedScope || null;
  const { maxIterations, maxCostUsd } = resolveSessionBudgets(options.budgets);
  let iteration = 0;
  let sessionCostUsd = 0;
  let sessionOutputTokens = 0;
  let killed = false;
  const priorPatchHashes = [];

  function snapshot(extra) {
    const info = extra || {};
    return {
      session_id: sessionId,
      feature_key: featureKey,
      iteration,
      session_cost_usd: sessionCostUsd,
      session_output_tokens: sessionOutputTokens,
      killed,
      started_at_ms: startedAtMs,
      pinned_scope: pinnedScope,
      prior_patch_hashes: priorPatchHashes.slice(),
      carried_state: enumerateCarriedState({
        cumulativeWorktreePath: info.cumulativeWorktreePath,
        plan: info.plan,
        priorPatchHashes,
        iteration,
        session_cost_usd: sessionCostUsd,
        session_output_tokens: sessionOutputTokens,
      }),
    };
  }

  function assertCanStartIteration(projectedNextCall) {
    if (killed) {
      throw new ValidationError("FAIL_SESSION_KILLED: sleep execute session was killed.");
    }
    if (iteration >= maxIterations) {
      throw new ValidationError(`FAIL_SESSION_ITERATION_CAP: max iterations reached (${maxIterations}).`);
    }
    if (now() - startedAtMs >= SESSION_WALLCLOCK_TIMEOUT_MS) {
      throw new ValidationError("FAIL_SESSION_WALLCLOCK_CAP: 30-minute session wall-clock exceeded.");
    }
    const nextCost = projectedCost(projectedNextCall);
    const nextTokens = projectedTokens(projectedNextCall);
    if (sessionCostUsd + nextCost > maxCostUsd) {
      throw new ValidationError(`FAIL_SESSION_COST_CAP: projected session cost exceeds $${maxCostUsd.toFixed(2)}.`);
    }
    if (sessionOutputTokens + nextTokens > SESSION_MAX_OUTPUT_TOKENS) {
      throw new ValidationError("FAIL_SESSION_TOKEN_CAP: projected session output tokens exceed 48000.");
    }
    return true;
  }

  function recordIteration(usage) {
    const info = usage || {};
    const cost = Number(info.cost_usd === undefined ? 0 : info.cost_usd);
    const tokens = Number(info.output_tokens === undefined ? 0 : info.output_tokens);
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(tokens) || tokens < 0) {
      throw new ValidationError("unknown_risk_stop: session usage must be non-negative and evaluable.");
    }
    const patchHash = info.produced_patch_sha256 ? String(info.produced_patch_sha256) : null;
    sessionCostUsd += cost;
    sessionOutputTokens += tokens;
    iteration += 1;
    if (patchHash) priorPatchHashes.push(patchHash);
    return snapshot(info);
  }

  function killSession(reason) {
    killed = true;
    return { killed: true, reason: reason || "killed" };
  }

  return Object.freeze({
    session_id: sessionId,
    feature_key: featureKey,
    started_at_ms: startedAtMs,
    pinned_scope: pinnedScope,
    assertCanStartIteration,
    recordIteration,
    killSession,
    snapshot,
  });
}

function assertPinnedScope(session, ctx) {
  if (!session || !session.pinned_scope) {
    throw new ValidationError("scope_lock: Phase E session scope is not pinned.");
  }
  const current = pinScope(ctx);
  const pinned = session.pinned_scope;
  const sameScopes = JSON.stringify(current.allowed_file_scopes) === JSON.stringify(pinned.allowed_file_scopes);
  const sameCommands = JSON.stringify(current.verification_commands) === JSON.stringify(pinned.verification_commands);
  const sameRole = current.role === pinned.role;
  if (!sameScopes || !sameCommands || !sameRole) {
    throw new ValidationError("scope_lock: pinned Phase E session scope changed during the session.");
  }
  return true;
}

async function withSessionLease(sessionId, fn) {
  const safeSessionId = safeSegment(sessionId, "session_id");
  if (activeSessionIds.has(safeSessionId)) {
    throw new ValidationError("FAIL_SESSION_REENTRY: sleep execute session is already active; resume/reentry is not available in Preview.");
  }
  activeSessionIds.add(safeSessionId);
  try {
    return await fn();
  } finally {
    activeSessionIds.delete(safeSessionId);
  }
}

function sessionStopConditionFromError(error) {
  const message = error && error.message ? String(error.message) : String(error || "unknown_risk_stop");
  if (message.includes("FAIL_SESSION_COST_CAP")) return "FAIL_SESSION_COST_CAP";
  if (message.includes("FAIL_SESSION_TOKEN_CAP")) return "FAIL_SESSION_TOKEN_CAP";
  if (message.includes("FAIL_SESSION_ITERATION_CAP")) return "action_count_cap";
  if (message.includes("FAIL_SESSION_WALLCLOCK_CAP")) return "action_count_cap";
  if (message.includes("FAIL_MODEL_PRICING_UNKNOWN")) return "FAIL_MODEL_PRICING_UNKNOWN";
  if (message.includes("scope_lock")) return "scope_lock";
  if (message.includes("FAIL_SESSION_KILLED")) return "unknown_risk_stop";
  if (message.includes("FAIL_SESSION_REENTRY")) return "unknown_risk_stop";
  return "unknown_risk_stop";
}

module.exports = {
  SESSION_MAX_ITERATIONS,
  SESSION_MAX_COST_USD,
  AUTHORIZED_MAX_ITERATIONS,
  AUTHORIZED_MAX_COST_USD,
  AUTHORIZED_MAX_TTL_HOURS,
  resolveSessionBudgets,
  SESSION_MAX_OUTPUT_TOKENS,
  SESSION_WALLCLOCK_TIMEOUT_MS,
  SESSION_DOC_TARGET_PATTERNS,
  SESSION_ALLOWED_COMMANDS,
  sha256,
  pinScope,
  assertPinnedScope,
  enumerateCarriedState,
  createSleepSession,
  withSessionLease,
  sessionStopConditionFromError,
};
