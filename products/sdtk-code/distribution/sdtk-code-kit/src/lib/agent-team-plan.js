"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { STOP_CONDITIONS } = require("./sleep-plan");
const { computeReadiness, gatherSignals } = require("./ship-readiness");
const { generateId } = require("./trust-events");

const PLAN_SCHEMA = "sdtk.agent-team-plan.v1";
const SLEEP_PLAN_SCHEMA = "sdtk.sleep-plan.v1";
const READINESS_FLOOR = Object.freeze({
  score: 75,
  max: 85,
  source: "ship-readiness.computeReadiness",
});

// Secret-bearing paths no role may ever touch. Mirrors the Sleep/Trust posture.
const SECRET_BLOCKED_SCOPES = Object.freeze([
  ".env",
  ".env.*",
  "secrets/**",
  "**/*.pem",
]);

const BOUNDARY_LINE =
  "Preview only. This does not execute agents and Sleep execution is not available in this phase.";

// Canonical 8 stop-condition IDs, sourced (not re-listed) from the shipped sleep plan.
function stopConditionIds() {
  return STOP_CONDITIONS.map((condition) => condition.id);
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.length > 0) : [];
}

function uniqueScopes(base, extra) {
  const seen = new Set();
  const out = [];
  for (const entry of [...list(base), ...list(extra)]) {
    if (!seen.has(entry)) {
      seen.add(entry);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Deterministic Phase A role skeleton (Orchestrator decision B1).
 * Exactly one writer (`dev`); `pm` and `qa` are read-only. DESIGN/OPS roles are
 * intentionally omitted unless their own handoff contracts exist as inputs
 * (decision B2-A: do not fabricate placeholder roles).
 */
function deriveRoles(featureKey, scope, testObligations) {
  const allowed = list(scope.allowed_file_scopes);
  const blocked = uniqueScopes(scope.blocked_file_scopes, SECRET_BLOCKED_SCOPES);
  const verificationCommands = list(testObligations);

  return [
    {
      role: "pm",
      runtime: "claude-code",
      task_id: `${featureKey}_PM`,
      task_slug: "SCOPE_REVIEW",
      objective: `Review scope and acceptance boundary for ${featureKey}; confirm the declared file scopes and stop conditions are sufficient before any implementation.`,
      allowed_file_scopes: ["governance/Features/**"],
      blocked_file_scopes: [...SECRET_BLOCKED_SCOPES],
      can_write: false,
      test_obligations: [],
      verification_commands: [],
      evidence_required: ["review_report"],
    },
    {
      role: "dev",
      runtime: "codex",
      task_id: `${featureKey}_DEV`,
      task_slug: "IMPLEMENTATION",
      objective: `Implement the bounded slices for ${featureKey} strictly within the declared allowed scope. Do not touch blocked paths. Stop at any stop condition.`,
      allowed_file_scopes: allowed,
      blocked_file_scopes: blocked,
      can_write: true,
      test_obligations: verificationCommands,
      verification_commands: verificationCommands,
      evidence_required: ["code_diff", "test_evidence"],
    },
    {
      role: "qa",
      runtime: "claude-code",
      task_id: `${featureKey}_QA`,
      task_slug: "VERIFICATION",
      objective: `Verify the dev evidence for ${featureKey} against the declared test obligations and confirm no write landed outside the allowed scope.`,
      allowed_file_scopes: [],
      blocked_file_scopes: [...SECRET_BLOCKED_SCOPES],
      can_write: false,
      test_obligations: verificationCommands,
      verification_commands: verificationCommands,
      evidence_required: ["verification_report"],
    },
  ];
}

/**
 * Pure assembly + fail-closed validation from already-loaded inputs.
 * No fs, no execution — safe to unit test with crafted objects.
 */
function buildAgentTeamPlan(handoff, sleepPlan, opts) {
  opts = opts || {};

  if (!handoff || typeof handoff !== "object") {
    throw new ValidationError("NEEDS_CODE_HANDOFF: handoff object is missing or invalid.");
  }
  if (handoff.handoff_status !== "READY_FOR_SDTK_CODE") {
    throw new ValidationError(
      `NEEDS_CODE_HANDOFF: handoff status is "${handoff.handoff_status}", expected "READY_FOR_SDTK_CODE".`
    );
  }
  if (!Array.isArray(handoff.implementation_slices) || handoff.implementation_slices.length === 0) {
    throw new ValidationError("NEEDS_CODE_HANDOFF: handoff must have at least one implementation_slices entry.");
  }

  if (!sleepPlan || typeof sleepPlan !== "object" || sleepPlan.schema_version !== SLEEP_PLAN_SCHEMA) {
    throw new ValidationError(
      `NEEDS_SLEEP_PLAN: expected a ${SLEEP_PLAN_SCHEMA} contract. Run \`sdtk-code sleep plan\` first.`
    );
  }

  const featureKey = handoff.feature_key;
  if (sleepPlan.feature_key !== featureKey) {
    throw new ValidationError(
      `NEEDS_SLEEP_PLAN: sleep-plan feature_key "${sleepPlan.feature_key}" does not match handoff "${featureKey}".`
    );
  }

  const scope = sleepPlan.scope && typeof sleepPlan.scope === "object" ? sleepPlan.scope : {};
  if (scope.declared !== true) {
    throw new ValidationError(
      "NEEDS_AGENT_SCOPE: sleep-plan scope is not declared; an agent team cannot be bounded. Declare allowed/blocked scope first."
    );
  }

  // Prefer sleep-plan obligations (already normalized), fall back to handoff.
  const testObligations = list(sleepPlan.test_obligations).length > 0
    ? list(sleepPlan.test_obligations)
    : list(handoff.test_obligations);

  const roles = deriveRoles(featureKey, scope, testObligations);

  // Fail-closed safety gates.
  const writers = roles.filter((role) => role.can_write === true);
  if (writers.length !== 1) {
    throw new ValidationError(
      `FAIL_SCOPE_UNSAFE: Phase A requires exactly one writer role, found ${writers.length}.`
    );
  }
  const writer = writers[0];
  if (writer.allowed_file_scopes.length === 0) {
    throw new ValidationError(
      "FAIL_SCOPE_UNSAFE: the writer role has no allowed_file_scopes; a writer with unbounded scope is rejected."
    );
  }
  if (writer.verification_commands.length === 0) {
    throw new ValidationError(
      "FAIL_EVIDENCE_MISSING: the writer role has no verification_commands (no test obligations carried)."
    );
  }
  for (const role of roles) {
    if (!Array.isArray(role.evidence_required) || role.evidence_required.length === 0) {
      throw new ValidationError(
        `FAIL_EVIDENCE_MISSING: role "${role.role}" has no evidence_required.`
      );
    }
  }

  return {
    schema_version: PLAN_SCHEMA,
    feature_key: featureKey,
    run_id: typeof opts.runId === "string" && opts.runId.length > 0 ? opts.runId : generateId("agt"),
    run_mode: "preview",
    runtime: "native-runtime-adapter-preview",
    source: {
      code_handoff_path: opts.codeHandoffPath || `docs/dev/CODE_HANDOFF_${featureKey}.json`,
      sleep_plan_path: opts.sleepPlanPath || ".sdtk/trust/sleep-plan.json",
    },
    readiness_floor: { ...READINESS_FLOOR },
    roles,
    stop_conditions: stopConditionIds(),
    deploy_confirm_points: Array.isArray(sleepPlan.deploy_confirm_points)
      ? [...sleepPlan.deploy_confirm_points]
      : [],
    generated_at: new Date().toISOString(),
  };
}

/** Thin fs wrapper: read CODE_HANDOFF + sleep-plan, then buildAgentTeamPlan. */
function assembleAgentTeamPlan(projectPath, featureKey, opts) {
  opts = opts || {};
  const resolved = path.resolve(projectPath || ".");

  const handoffRel = `docs/dev/CODE_HANDOFF_${featureKey}.json`;
  const handoffPath = path.join(resolved, "docs", "dev", `CODE_HANDOFF_${featureKey}.json`);
  let handoff;
  try {
    handoff = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
  } catch (_err) {
    throw new ValidationError(
      `NEEDS_CODE_HANDOFF: CODE_HANDOFF_${featureKey}.json not found or invalid at ${handoffPath}.`
    );
  }

  const sleepPlanRel = ".sdtk/trust/sleep-plan.json";
  const sleepPlanPath = path.join(resolved, ".sdtk", "trust", "sleep-plan.json");
  let sleepPlan;
  try {
    sleepPlan = JSON.parse(fs.readFileSync(sleepPlanPath, "utf8"));
  } catch (_err) {
    throw new ValidationError(
      `NEEDS_SLEEP_PLAN: no sleep plan at ${sleepPlanPath}. Run \`sdtk-code sleep plan --feature-key ${featureKey}\` first.`
    );
  }

  return buildAgentTeamPlan(handoff, sleepPlan, {
    runId: opts.runId,
    codeHandoffPath: handoffRel,
    sleepPlanPath: sleepPlanRel,
  });
}

function bulletList(items, fallback) {
  if (!Array.isArray(items) || items.length === 0) {
    return `- ${fallback}`;
  }
  return items.map((item) => `- ${String(item)}`).join("\n");
}

/** Render one bounded role task packet (kept compact for /goal <4000 chars). */
function renderTaskPacket(plan, role) {
  return [
    `# Agent Task Packet — ${plan.feature_key} / ${role.role}`,
    "",
    BOUNDARY_LINE,
    "",
    `- Feature key: ${plan.feature_key}`,
    `- Role: ${role.role}`,
    `- Runtime target: ${role.runtime}`,
    `- Can write: ${role.can_write ? "yes" : "no"}`,
    `- Run id: ${plan.run_id}`,
    `- Task id: ${role.task_id}`,
    "",
    "## Objective",
    "",
    role.objective,
    "",
    "## Allowed file scopes",
    "",
    bulletList(role.allowed_file_scopes, "none (read-only role)"),
    "",
    "## Blocked file scopes",
    "",
    bulletList(role.blocked_file_scopes, "none declared"),
    "",
    "## Verification commands",
    "",
    bulletList(role.verification_commands, "none"),
    "",
    "## Evidence required",
    "",
    bulletList(role.evidence_required, "none"),
    "",
    "## Stop conditions",
    "",
    bulletList(plan.stop_conditions, "none declared"),
    "",
    "## Boundary",
    "",
    "Do not execute outside this scope. Do not spawn processes, publish packages, or deploy.",
    BOUNDARY_LINE,
    "",
  ].join("\n");
}

function taskPacketFilename(role) {
  return `${role.role.toUpperCase()}_${role.task_slug}.md`;
}

/** Write the machine-readable plan JSON; returns absolute path. */
function writeAgentTeamPlan(projectPath, plan) {
  const resolved = path.resolve(projectPath || ".");
  const dir = path.join(resolved, ".sdtk", "agent-team");
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `AGENT_TEAM_PLAN_${plan.feature_key}.json`);
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), "utf8");
  return outPath;
}

/** Write one Markdown task packet per role; returns absolute paths. */
function writeTaskPackets(projectPath, plan) {
  const resolved = path.resolve(projectPath || ".");
  const dir = path.join(resolved, ".sdtk", "agent-team", "tasks", plan.feature_key);
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const role of plan.roles) {
    const outPath = path.join(dir, taskPacketFilename(role));
    fs.writeFileSync(outPath, renderTaskPacket(plan, role), "utf8");
    written.push(outPath);
  }
  return written;
}

/** Load a previously written plan (preview reads, does not re-derive). */
function loadAgentTeamPlan(projectPath, featureKey) {
  const resolved = path.resolve(projectPath || ".");
  const planPath = path.join(resolved, ".sdtk", "agent-team", `AGENT_TEAM_PLAN_${featureKey}.json`);
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  } catch (_err) {
    throw new ValidationError(
      `NEEDS_AGENT_TEAM_PLAN: no agent-team plan at ${planPath}. Run \`sdtk-code agent-team plan --feature-key ${featureKey}\` first.`
    );
  }
  return plan;
}

// Defensive coercion: never assume a loaded/corrupt plan has array fields.
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roleName(role) {
  return role && typeof role.role === "string" && role.role.length > 0 ? role.role : "(unnamed)";
}

/**
 * Structural preview projection of a loaded plan. Phase A does NOT gate on
 * readiness (decision B3) — readiness is attached as informational metadata.
 *
 * This runs against an arbitrary on-disk plan JSON that may be corrupt or
 * hand-edited, so every field access is defensive: a malformed plan must yield
 * a FAIL verdict, never a PASS and never a thrown TypeError.
 */
function projectAgentTeamPreview(plan, readiness) {
  const blockers = [];
  if (!plan || typeof plan !== "object") {
    blockers.push("Invalid agent-team plan — not an object.");
  }
  if (!plan || plan.schema_version !== PLAN_SCHEMA) {
    blockers.push("Invalid agent-team plan — expected sdtk.agent-team-plan.v1.");
  }

  if (plan && plan.roles !== undefined && !Array.isArray(plan.roles)) {
    blockers.push("Invalid agent-team plan — roles is present but not an array.");
  } else if (!plan || !Array.isArray(plan.roles)) {
    blockers.push("Invalid agent-team plan — roles is missing.");
  }

  // Only object entries are previewable; drop non-object junk defensively.
  const roles = asArray(plan && plan.roles).filter((role) => role && typeof role === "object");

  // Per-role structural validation — each scope/evidence field must be an array.
  for (const role of roles) {
    const name = roleName(role);
    if (!Array.isArray(role.allowed_file_scopes)) {
      blockers.push(`Role "${name}" allowed_file_scopes is missing or not an array.`);
    }
    if (!Array.isArray(role.blocked_file_scopes)) {
      blockers.push(`Role "${name}" blocked_file_scopes is missing or not an array.`);
    }
    if (!Array.isArray(role.evidence_required) || role.evidence_required.length === 0) {
      blockers.push(`Role "${name}" has no evidence_required.`);
    }
    if (!Array.isArray(role.verification_commands)) {
      blockers.push(`Role "${name}" verification_commands is missing or not an array.`);
    }
  }

  // Writer invariants: exactly one writer, with a bounded scope and verification.
  const writers = roles.filter((role) => role.can_write === true);
  if (writers.length !== 1) {
    blockers.push(`Expected exactly one writer role, found ${writers.length}.`);
  } else {
    const writer = writers[0];
    if (asArray(writer.allowed_file_scopes).length === 0) {
      blockers.push(`Writer role "${roleName(writer)}" has empty allowed_file_scopes (unbounded writer).`);
    }
    if (asArray(writer.verification_commands).length === 0) {
      blockers.push(`Writer role "${roleName(writer)}" has no verification_commands.`);
    }
  }

  const expectedStops = stopConditionIds();
  const planStops = asArray(plan && plan.stop_conditions);
  const stopsMatch = planStops.length === expectedStops.length
    && expectedStops.every((id) => planStops.includes(id));
  if (!stopsMatch) {
    blockers.push("Stop conditions do not match the canonical 8 sleep-plan IDs.");
  }

  const verdict = blockers.length === 0
    ? "PASS_AGENT_TEAM_PREVIEW_READY"
    : "FAIL_AGENT_TEAM_PREVIEW_NOT_READY";

  return {
    verdict,
    feature_key: plan && plan.feature_key,
    run_id: plan && plan.run_id,
    blockers,
    roles,
    readiness: readiness || null,
    generated_at: new Date().toISOString(),
  };
}

// Renders even a FAIL/corrupt preview without throwing — every field access is
// coerced so a malformed plan still produces a readable fail-closed report.
function renderPreviewMarkdown(plan, preview) {
  const safePlan = plan && typeof plan === "object" ? plan : {};
  const source = safePlan.source && typeof safePlan.source === "object" ? safePlan.source : {};
  const floor = safePlan.readiness_floor && typeof safePlan.readiness_floor === "object"
    ? safePlan.readiness_floor
    : {};

  const roleRows = asArray(preview && preview.roles).map((role) => {
    const mode = role.can_write ? "write" : "read-only";
    const allowedN = asArray(role.allowed_file_scopes).length;
    const blockedN = asArray(role.blocked_file_scopes).length;
    const evidence = asArray(role.evidence_required).join(", ");
    return `| ${roleName(role)} | ${role.runtime || "?"} | ${mode} | ${allowedN} allowed / ${blockedN} blocked | ${evidence} |`;
  });

  const readinessLine = preview && preview.readiness
    ? `- Current readiness (informational, not a gate in Phase A): ${preview.readiness.score}/${preview.readiness.max} — ${preview.readiness.verdict}`
    : "- Current readiness: unavailable";

  const floorScore = floor.score != null ? floor.score : "?";
  const floorMax = floor.max != null ? floor.max : "?";
  const floorSource = floor.source || "ship-readiness.computeReadiness";

  return [
    `# Agent Team Preview — ${(preview && preview.feature_key) || safePlan.feature_key || "(unknown)"}`,
    "",
    BOUNDARY_LINE,
    "",
    "## Verdict",
    "",
    `- Verdict: ${preview && preview.verdict ? preview.verdict : "FAIL_AGENT_TEAM_PREVIEW_NOT_READY"}`,
    `- Run id: ${(preview && preview.run_id) || safePlan.run_id || "(none)"}`,
    "- Blockers:",
    bulletList(preview && preview.blockers, "none"),
    "",
    "## Inputs",
    "",
    `- CODE_HANDOFF: ${source.code_handoff_path || "(unknown)"}`,
    `- Sleep plan: ${source.sleep_plan_path || "(unknown)"}`,
    "",
    "## Roles",
    "",
    "| Role | Runtime | Mode | Scope | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...(roleRows.length > 0 ? roleRows : ["| (none) | | | | |"]),
    "",
    "## Readiness floor",
    "",
    `- Floor: ${floorScore}/${floorMax} via ${floorSource}`,
    readinessLine,
    "",
    "## Stop conditions",
    "",
    bulletList(asArray(safePlan.stop_conditions), "none declared"),
    "",
    "## Boundary",
    "",
    BOUNDARY_LINE,
    "",
  ].join("\n");
}

function writeAgentTeamPreview(projectPath, featureKey, markdown) {
  const resolved = path.resolve(projectPath || ".");
  const outDir = path.join(resolved, "docs", "trust");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `AGENT_TEAM_PREVIEW_${featureKey}.md`);
  fs.writeFileSync(outPath, markdown, "utf8");
  return outPath;
}

/** Informational readiness signal for the preview (never gates in Phase A). */
function gatherPreviewReadiness(projectPath, featureKey) {
  try {
    return computeReadiness(gatherSignals(projectPath, featureKey));
  } catch (_err) {
    return null;
  }
}

module.exports = {
  PLAN_SCHEMA,
  SECRET_BLOCKED_SCOPES,
  BOUNDARY_LINE,
  stopConditionIds,
  deriveRoles,
  buildAgentTeamPlan,
  assembleAgentTeamPlan,
  writeAgentTeamPlan,
  renderTaskPacket,
  taskPacketFilename,
  writeTaskPackets,
  loadAgentTeamPlan,
  projectAgentTeamPreview,
  renderPreviewMarkdown,
  writeAgentTeamPreview,
  gatherPreviewReadiness,
};
