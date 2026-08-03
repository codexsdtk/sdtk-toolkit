"use strict";

// BK-262 Phase B — Agent Team Runtime Adapter Exports.
//
// Turns a validated BK-260 agent-team plan into runtime-specific export bundles
// (per-role prompts + metadata + brief + optional codex review-draft TOML) so a
// human (or a runtime the human chooses to act on) spends less time hand-writing
// prompts/assignments and gets consistent scope + evidence requirements.
//
// EXPORT/PACKAGING ONLY. This module:
//   - does NOT execute agents, spawn processes, or schedule anything,
//   - does NOT write .codex/agents/**, .claude/**, or any global/user config,
//   - writes only under <project>/.sdtk/agent-team/exports/**,
//   - is not a local LLM runtime and is not Sleep execution.

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const {
  loadAgentTeamPlan,
  projectAgentTeamPreview,
  stopConditionIds,
  BOUNDARY_LINE,
} = require("./agent-team-plan");

const EXPORT_SCHEMA = "sdtk.agent-team-export.v1";
// Mirrors commands/runtime.js VALID_RUNTIMES. `--runtime` selects the export
// target format the human will hand the bundle to; it is not a per-role spawn.
const EXPORT_RUNTIMES = Object.freeze(["codex", "claude"]);
const GOAL_PROMPT_MAX = 4000;

// Phrases that would overclaim execution. The verbatim BOUNDARY_LINE deliberately
// contains "execute" ("does not execute agents"), so the guard targets specific
// auto-run claims rather than the bare word.
const OVERCLAIM_PHRASES = Object.freeze([
  "auto-spawn",
  "automatically spawn",
  "automatically run",
  "automatically execute",
  "will execute the",
  "will spawn",
  "will deploy",
  "will publish",
  "spawns subagents automatically",
]);

// Safe single path segment: filename-friendly, no separators, no traversal.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function safeSegment(value, label) {
  const segment = String(value);
  if (
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0") ||
    !SAFE_SEGMENT.test(segment)
  ) {
    throw new ValidationError(
      `FAIL_UNSAFE_EXPORT_PATH: ${label} "${segment}" is not a safe path segment (no separators or "."/"..").`
    );
  }
  return segment;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roleName(role) {
  return role && typeof role.role === "string" && role.role.length > 0 ? role.role : "unnamed";
}

function roleFileBase(role) {
  return roleName(role).toUpperCase();
}

// --- D3: static, advisory, non-binding suggestions ---------------------------
// Never a mandated model. Higher reasoning is suggested for review/scope roles.
function modelSuggestion() {
  return "runtime_default";
}

const HIGH_REASONING_ROLES = new Set(["pm", "qa", "arch", "architect", "review", "reviewer"]);

function reasoningSuggestion(role) {
  return HIGH_REASONING_ROLES.has(roleName(role)) ? "high" : "medium";
}

function sandboxExpectation(canWrite) {
  return canWrite
    ? "workspace-write (review the allowed scope before granting write)"
    : "read-only";
}

function bulletList(items, fallback) {
  if (!Array.isArray(items) || items.length === 0) {
    return `- ${fallback}`;
  }
  return items.map((item) => `- ${String(item)}`).join("\n");
}

// --- G2: renderers -----------------------------------------------------------

// Bounded, copy-pasteable prompt per role (Codex `/goal` style; Claude reads the
// same generic packet). Kept compact so it stays < GOAL_PROMPT_MAX.
function renderGoalText(plan, role, runtime) {
  const stops = asArray(plan.stop_conditions).length > 0 ? asArray(plan.stop_conditions) : stopConditionIds();
  return [
    `# Agent goal — ${plan.feature_key} / ${roleName(role)} (${runtime} export)`,
    "",
    BOUNDARY_LINE,
    "",
    `Role: ${roleName(role)}`,
    `Can write: ${role.can_write ? "yes" : "no (read-only)"}`,
    `Run id: ${plan.run_id}`,
    "",
    "## Objective",
    String(role.objective || "(none declared)"),
    "",
    "## Allowed file scopes (do not write outside these)",
    bulletList(role.allowed_file_scopes, "none (read-only role)"),
    "",
    "## Blocked file scopes (never touch)",
    bulletList(role.blocked_file_scopes, "none declared"),
    "",
    "## Verification commands (run and capture evidence)",
    bulletList(role.verification_commands, "none"),
    "",
    "## Evidence required",
    bulletList(role.evidence_required, "none"),
    "",
    "## Stop conditions (stop and report at any of these)",
    bulletList(stops, "none declared"),
    "",
    "## Boundary",
    "Stay within the allowed scope. Do not spawn processes, publish packages, or deploy.",
    "Ask for parallel subagents only if the plan implies parallel roles; never assume the runtime creates them on its own.",
    BOUNDARY_LINE,
    "",
  ].join("\n");
}

function projectRole(plan, role, runtime) {
  const goalText = renderGoalText(plan, role, runtime);
  return {
    role: roleName(role),
    runtime_target: runtime,
    can_write: role.can_write === true,
    allowed_file_scopes: asArray(role.allowed_file_scopes),
    blocked_file_scopes: asArray(role.blocked_file_scopes),
    verification_commands: asArray(role.verification_commands),
    evidence_required: asArray(role.evidence_required),
    stop_conditions: asArray(plan.stop_conditions).length > 0 ? asArray(plan.stop_conditions) : stopConditionIds(),
    model_suggestion: modelSuggestion(),
    reasoning_suggestion: reasoningSuggestion(role),
    sandbox_expectation: sandboxExpectation(role.can_write === true),
    goal_text: goalText,
  };
}

// --- G1: projection (pure, no fs) --------------------------------------------

// Pure projection from an already-validated plan to a runtime export bundle.
// Fail-closed: reuses the BK-260 preview validation, enforces /goal length and
// the no-overclaim guard. No fs, no spawn.
function projectExport(plan, runtime) {
  if (!EXPORT_RUNTIMES.includes(runtime)) {
    throw new ValidationError(
      `Invalid value for --runtime: "${runtime}". Must be one of: ${EXPORT_RUNTIMES.join(", ")}`
    );
  }

  // Reuse BK-260 validation — do not re-derive a parallel validator.
  const preview = projectAgentTeamPreview(plan, null);
  if (preview.verdict !== "PASS_AGENT_TEAM_PREVIEW_READY") {
    throw new ValidationError(
      `NEEDS_AGENT_TEAM_PLAN: plan is not export-ready — ${preview.blockers.join("; ")}`
    );
  }

  // Path-segment safety: a hand-edited plan must not escape the export dir via
  // feature_key or a role name like "../PWN". Fail closed before any write.
  safeSegment(plan.feature_key, "feature_key");
  for (const role of asArray(plan.roles)) {
    if (role && typeof role === "object") {
      safeSegment(roleName(role), "role");
    }
  }

  const roles = asArray(plan.roles)
    .filter((role) => role && typeof role === "object")
    .map((role) => projectRole(plan, role, runtime));

  // /goal length guard.
  for (const role of roles) {
    if (role.goal_text.length >= GOAL_PROMPT_MAX) {
      throw new ValidationError(
        `FAIL_GOAL_PROMPT_TOO_LONG: ${role.role} goal prompt is ${role.goal_text.length} chars (max ${GOAL_PROMPT_MAX}). Link to the plan JSON instead of inlining.`
      );
    }
  }

  // No-overclaim guard + boundary presence.
  for (const role of roles) {
    const lowered = role.goal_text.toLowerCase();
    for (const phrase of OVERCLAIM_PHRASES) {
      if (lowered.includes(phrase)) {
        throw new ValidationError(
          `FAIL_RUNTIME_OVERCLAIM: ${role.role} export text implies execution ("${phrase}"). Export is preview-only.`
        );
      }
    }
    if (!role.goal_text.includes(BOUNDARY_LINE)) {
      throw new ValidationError(
        `FAIL_RUNTIME_OVERCLAIM: ${role.role} export text is missing the export-only boundary line.`
      );
    }
  }

  // Exactly one writer carried through (preview already guarantees this; assert).
  const writers = roles.filter((role) => role.can_write === true);
  if (writers.length !== 1) {
    throw new ValidationError(
      `FAIL_RUNTIME_OVERCLAIM: export must carry exactly one writer role, found ${writers.length}.`
    );
  }

  return {
    schema_version: EXPORT_SCHEMA,
    feature_key: plan.feature_key,
    run_id: plan.run_id,
    runtime,
    boundary_line: BOUNDARY_LINE,
    generated_at: new Date().toISOString(),
    roles,
  };
}

function renderAdapterMetadata(exp) {
  return {
    schema_version: exp.schema_version,
    feature_key: exp.feature_key,
    run_id: exp.run_id,
    runtime: exp.runtime,
    boundary_line: exp.boundary_line,
    generated_at: exp.generated_at,
    roles: exp.roles.map((role) => ({
      role: role.role,
      runtime_target: role.runtime_target,
      can_write: role.can_write,
      allowed_file_scopes: role.allowed_file_scopes,
      blocked_file_scopes: role.blocked_file_scopes,
      verification_commands: role.verification_commands,
      evidence_required: role.evidence_required,
      stop_conditions: role.stop_conditions,
      model_suggestion: role.model_suggestion,
      reasoning_suggestion: role.reasoning_suggestion,
      sandbox_expectation: role.sandbox_expectation,
    })),
  };
}

// Human overview per runtime (D4). Overview-only; adds no authority over the
// per-role files or metadata.
function renderRunBrief(exp) {
  const writer = exp.roles.find((role) => role.can_write === true);
  const tomlNote = exp.runtime === "codex"
    ? " + `<ROLE>.toml.preview` (review draft, not installed)"
    : "";
  const lines = [
    `# Agent Team Run Brief — ${exp.feature_key} (${exp.runtime})`,
    "",
    exp.boundary_line,
    "",
    `- Run id: ${exp.run_id}`,
    `- Runtime target: ${exp.runtime}`,
    `- Writer role: ${writer ? writer.role : "(none)"}`,
    `- Per-role files: \`<ROLE>.goal.txt\` + \`adapter-metadata.json\` + this brief${tomlNote}`,
    "",
    "## Roles",
    "",
    "| Role | Mode | Allowed scopes | Verification commands |",
    "| --- | --- | --- | --- |",
  ];
  for (const role of exp.roles) {
    const mode = role.can_write ? "write" : "read-only";
    lines.push(
      `| ${role.role} | ${mode} | ${role.allowed_file_scopes.length} | ${role.verification_commands.length} |`
    );
  }
  lines.push("");
  lines.push("## How to use");
  lines.push("");
  lines.push("Review each `<ROLE>.goal.txt`, then paste it into the chosen runtime yourself.");
  lines.push("Nothing here runs an agent; Sleep execution is not available in this phase.");
  lines.push("");
  lines.push("## Boundary");
  lines.push("");
  lines.push(exp.boundary_line);
  lines.push("");
  return lines.join("\n");
}

function tomlEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Documented Codex custom-agent sandbox_mode value (advisory only).
function sandboxModeAdvisory(canWrite) {
  return canWrite ? "workspace-write" : "read-only";
}

// Review draft of a Codex custom-agent TOML matching the documented custom-agent
// shape. Minimum fields: name, description, developer_instructions. Advisory
// fields use the documented Codex field names (model, model_reasoning_effort,
// sandbox_mode) and stay commented/non-binding. This is a `.preview` review
// draft — BK-262 does NOT write .codex/agents/**.
function renderCodexTomlPreview(exp, role) {
  const name = `${exp.feature_key.toLowerCase()}-${role.role}`;
  const description = `${role.role} role for ${exp.feature_key} (${role.can_write ? "writer" : "read-only"}) — SDTK agent-team export review draft.`;
  return [
    "# REVIEW DRAFT — Codex custom-agent preview. NOT an installed runtime file.",
    `# ${exp.boundary_line}`,
    "",
    `name = "${tomlEscape(name)}"`,
    `description = "${tomlEscape(description)}"`,
    'developer_instructions = """',
    role.goal_text,
    '"""',
    "",
    "# Advisory only (non-binding; documented Codex custom-agent fields; edit before any use):",
    `# model = "${tomlEscape(role.model_suggestion)}"`,
    `# model_reasoning_effort = "${tomlEscape(role.reasoning_suggestion)}"`,
    `# sandbox_mode = "${tomlEscape(sandboxModeAdvisory(role.can_write))}"`,
    "",
  ].join("\n");
}

// --- G3: writer (fs, bounded to exports/**) ----------------------------------

function exportDir(projectPath, exp) {
  const resolved = path.resolve(projectPath || ".");
  // Defense in depth: re-validate segments at path-build time.
  safeSegment(exp.runtime, "runtime");
  safeSegment(exp.feature_key, "feature_key");
  return path.join(resolved, ".sdtk", "agent-team", "exports", exp.runtime, exp.feature_key);
}

// Writes the bundle only under .sdtk/agent-team/exports/<runtime>/<KEY>/.
// Returns absolute paths written.
function writeExportBundle(projectPath, exp) {
  const dir = exportDir(projectPath, exp);
  const base = path.resolve(dir);

  // After computing every output path, assert it stays under the export dir.
  const safePath = (segment) => {
    safeSegment(segment, "output filename");
    const resolved = path.resolve(path.join(base, segment));
    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      throw new ValidationError(
        `FAIL_UNSAFE_EXPORT_PATH: resolved path "${resolved}" escapes export dir "${base}".`
      );
    }
    return resolved;
  };

  fs.mkdirSync(dir, { recursive: true });
  const written = [];

  for (const role of exp.roles) {
    const goalPath = safePath(`${role.role.toUpperCase()}.goal.txt`);
    fs.writeFileSync(goalPath, role.goal_text, "utf8");
    written.push(goalPath);

    // Codex only: review-draft TOML. Claude stays generic (D1) — no toml.preview.
    if (exp.runtime === "codex") {
      const tomlPath = safePath(`${role.role.toUpperCase()}.toml.preview`);
      fs.writeFileSync(tomlPath, renderCodexTomlPreview(exp, role), "utf8");
      written.push(tomlPath);
    }
  }

  const metaPath = safePath("adapter-metadata.json");
  fs.writeFileSync(metaPath, JSON.stringify(renderAdapterMetadata(exp), null, 2), "utf8");
  written.push(metaPath);

  const briefPath = safePath("RUN_BRIEF.md");
  fs.writeFileSync(briefPath, renderRunBrief(exp), "utf8");
  written.push(briefPath);

  return written;
}

module.exports = {
  EXPORT_SCHEMA,
  EXPORT_RUNTIMES,
  GOAL_PROMPT_MAX,
  SAFE_SEGMENT,
  safeSegment,
  projectExport,
  renderGoalText,
  renderAdapterMetadata,
  renderRunBrief,
  renderCodexTomlPreview,
  exportDir,
  writeExportBundle,
  loadAgentTeamPlan,
};
