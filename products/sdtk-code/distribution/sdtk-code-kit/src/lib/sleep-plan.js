"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { loadScopes } = require("./trust-file-scope");

const STOP_CONDITIONS = [
  {
    id: "scope_lock",
    description: "Halt if action would touch a blocked file scope.",
    default: "on",
  },
  {
    id: "destructive_deny",
    description:
      "Deny irreversible destructive operations (rm -rf, DROP TABLE, force-push main).",
    default: "on",
  },
  {
    id: "deploy_confirm",
    description:
      "Pause at deploy_confirm_points and require explicit confirmation before deployment actions.",
    default: "on",
  },
  {
    id: "secret_block",
    description:
      "Block any action that reads or writes secret material (.env, *.pem, credentials).",
    default: "on",
  },
  {
    id: "action_count_cap",
    description: "Stop when action count reaches budgets.max_actions.",
    default: "on",
  },
  {
    id: "test_evidence_required",
    description: "Do not mark a slice done without test_obligations evidence.",
    default: "on",
  },
  {
    id: "unknown_risk_stop",
    description: "Stop and escalate when risk is unclassified or cannot be assessed.",
    default: "on",
  },
  {
    id: "three_fix_escalation",
    description: "Escalate to controller after three failed fix attempts on the same failure.",
    default: "on",
  },
];

const CHECKPOINT_SCHEMA = {
  phase: null,
  files_touched: [],
  last_green_verify: null,
  blocker: null,
  next_safe_action: null,
};

/**
 * PURE — builds a sleep-plan.v1 object from crafted inputs; no fs calls.
 * Defaults: max_actions=50, max_iterations=10.
 */
function buildSleepPlan(handoff, scopes, opts) {
  const rawActions = opts.maxActions !== undefined ? Number(opts.maxActions) : 50;
  const rawIterations = opts.maxIterations !== undefined ? Number(opts.maxIterations) : 10;

  if (!Number.isInteger(rawActions) || rawActions <= 0) {
    throw new ValidationError("--max-actions must be a positive integer.");
  }
  if (!Number.isInteger(rawIterations) || rawIterations <= 0) {
    throw new ValidationError("--max-iterations must be a positive integer.");
  }

  return {
    schema_version: "sdtk.sleep-plan.v1",
    feature_key: handoff.feature_key,
    source: {
      code_handoff_path: handoff._handoff_path || null,
      lane: handoff.recommended_lane || null,
    },
    ordered_steps: Array.isArray(handoff.implementation_slices)
      ? [...handoff.implementation_slices]
      : [],
    scope: {
      allowed_file_scopes: scopes.allowed || [],
      blocked_file_scopes: scopes.blocked || [],
      declared: scopes.declared === true,
    },
    policy_profile: "sleep-preview",
    budgets: {
      max_actions: rawActions,
      max_iterations: rawIterations,
    },
    test_obligations: Array.isArray(handoff.test_obligations)
      ? [...handoff.test_obligations]
      : [],
    stop_conditions: STOP_CONDITIONS,
    deploy_confirm_points: [],
    checkpoint_schema: CHECKPOINT_SCHEMA,
    runtime: "agnostic",
    generated_at: new Date().toISOString(),
  };
}

/**
 * Thin fs wrapper — reads CODE_HANDOFF + loadScopes, then calls buildSleepPlan.
 * Fail-closed: missing/invalid handoff or not READY_FOR_SDTK_CODE → ValidationError(NEEDS_HANDOFF).
 */
function assembleSleepPlan(projectPath, featureKey, opts) {
  opts = opts || {};
  const resolved = path.resolve(projectPath || ".");
  const handoffPath = path.join(
    resolved,
    "docs",
    "dev",
    `CODE_HANDOFF_${featureKey}.json`
  );

  let handoff;
  try {
    const raw = fs.readFileSync(handoffPath, "utf8");
    handoff = JSON.parse(raw);
  } catch (_err) {
    throw new ValidationError(
      `NEEDS_HANDOFF: CODE_HANDOFF_${featureKey}.json not found or invalid at ${handoffPath}. ` +
        "Ensure the feature has a valid READY_FOR_SDTK_CODE handoff before running sleep plan."
    );
  }

  if (handoff.handoff_status !== "READY_FOR_SDTK_CODE") {
    throw new ValidationError(
      `NEEDS_HANDOFF: CODE_HANDOFF_${featureKey}.json status is "${handoff.handoff_status}", ` +
        'expected "READY_FOR_SDTK_CODE". Resolve open blockers first.'
    );
  }

  if (!Array.isArray(handoff.implementation_slices) || handoff.implementation_slices.length === 0) {
    throw new ValidationError(
      `NEEDS_HANDOFF: CODE_HANDOFF_${featureKey}.json must have at least one implementation_slices entry.`
    );
  }

  // Attach path for source provenance in the plan (read by buildSleepPlan).
  handoff._handoff_path = handoffPath;

  const scopes = loadScopes(resolved, featureKey, opts.scopes || {});

  return buildSleepPlan(handoff, scopes, {
    maxActions: opts.maxActions,
    maxIterations: opts.maxIterations,
  });
}

/**
 * Thin fs wrapper — writes plan to .sdtk/trust/sleep-plan.json; returns output path.
 */
function writeSleepPlan(projectPath, plan) {
  const resolved = path.resolve(projectPath || ".");
  const trustDir = path.join(resolved, ".sdtk", "trust");
  fs.mkdirSync(trustDir, { recursive: true });
  const outPath = path.join(trustDir, "sleep-plan.json");
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), "utf8");
  return outPath;
}

module.exports = {
  STOP_CONDITIONS,
  CHECKPOINT_SCHEMA,
  buildSleepPlan,
  assembleSleepPlan,
  writeSleepPlan,
};
