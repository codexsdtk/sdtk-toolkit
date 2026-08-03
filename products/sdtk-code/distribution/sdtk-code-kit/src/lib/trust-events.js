"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { redact } = require("./trust-redact");

const locks = new Map();
const MAX_COMMAND_LENGTH = 2000;

function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${ts}_${rand}`;
}

function fingerprintId(prefix, content) {
  const hash = crypto.createHash("sha256").update(String(content)).digest("hex");
  return `${prefix}_${hash.slice(0, 16)}`;
}

function eventsDir(projectPath) {
  return path.join(path.resolve(projectPath || "."), ".sdtk", "trust", "events");
}

function eventsFile(projectPath, date) {
  const day = typeof date === "string" ? date : new Date(date || Date.now()).toISOString().slice(0, 10);
  return path.join(eventsDir(projectPath), `${day}.jsonl`);
}

function nullableString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeStatus(value) {
  return typeof value === "string" && value.length > 0 ? value : "info";
}

function inferEventType(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (typeof raw.event_type === "string" && raw.event_type.length > 0) {
    return raw.event_type;
  }
  const hookType = typeof raw.hook_type === "string" ? raw.hook_type : "";
  const toolName = typeof raw.tool_name === "string" ? raw.tool_name : "";
  if (hookType === "post_tool_failure") {
    return "command_failure";
  }
  if (hookType === "post_tool" || hookType === "task_completed") {
    return "post_command";
  }
  if (hookType === "pre_tool" || /(?:bash|shell|exec|run)/i.test(toolName)) {
    return "pre_command";
  }
  return null;
}

function normalizeFiles(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string").map((entry) => redact(entry));
}


function normalizeContextManifest(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const source = entry && typeof entry === "object" ? entry : {};
    return {
      path: source.path != null ? redact(String(source.path)) : null,
      snapshot_sha256: typeof source.snapshot_sha256 === "string" ? source.snapshot_sha256 : null,
    };
  }).filter((entry) => entry.path && entry.snapshot_sha256);
}

function normalizeTokensUsed(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    input_tokens: typeof value.input_tokens === "number" ? value.input_tokens : null,
    output_tokens: typeof value.output_tokens === "number" ? value.output_tokens : null,
  };
}

function normalizeCommand(value) {
  if (typeof value !== "string") {
    return { command: null, truncated: false };
  }
  const redacted = redact(value);
  if (redacted.length > MAX_COMMAND_LENGTH) {
    return { command: redacted.slice(0, MAX_COMMAND_LENGTH), truncated: true };
  }
  return { command: redacted, truncated: false };
}

function buildEvent(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const timestamp = typeof source.timestamp === "string" && source.timestamp.length > 0
    ? source.timestamp
    : new Date().toISOString();
  const { command, truncated } = normalizeCommand(source.command);
  const sessionId = nullableString(source.session_id);
  const toolkit = nullableString(source.toolkit);
  const eventType = inferEventType(source);
  // Agent-team traceability (BK-260). Redacted like any other string field and
  // folded into the dedup identity so distinct runs/roles emitting the same
  // command are not collapsed into a single event. Existing callers omit these,
  // so the fields default to null and keep dedup deterministic.
  const runId = source.run_id != null ? redact(String(source.run_id)) : null;
  const agentRole = source.agent_role != null ? redact(String(source.agent_role)) : null;
  const taskId = source.task_id != null ? redact(String(source.task_id)) : null;
  const featureKey = source.feature_key != null ? redact(String(source.feature_key)) : null;
  const stopConditionHit = source.stop_condition_hit != null
    ? String(source.stop_condition_hit) : null;
  const evidenceQualityOk = typeof source.evidence_quality_ok === "boolean"
    ? source.evidence_quality_ok : null;
  const overallVerdict = source.overall_verdict != null
    ? String(source.overall_verdict) : null;
  const rolesNotReadyCount = typeof source.roles_not_ready_count === "number"
    ? source.roles_not_ready_count : null;
  const reportPath = source.report_path != null ? redact(String(source.report_path)) : null;
  const worktreePath = source.worktree_path != null ? redact(String(source.worktree_path)) : null;
  const actionsExecuted = typeof source.actions_executed === "number"
    ? source.actions_executed : null;
  const executionMode = source.execution_mode != null
    ? String(source.execution_mode) : null;
  const workflowType = source.workflow_type != null
    ? String(source.workflow_type) : null;
  const iterationIndex = typeof source.iteration_index === "number"
    ? source.iteration_index : null;
  const readinessVerdict = source.readiness_verdict != null
    ? String(source.readiness_verdict) : null;
  const sessionCostUsd = typeof source.session_cost_usd === "number"
    ? source.session_cost_usd : null;
  const sessionOutputTokens = typeof source.session_output_tokens === "number"
    ? source.session_output_tokens : null;
  const modelProvider = source.model_provider != null ? redact(String(source.model_provider)) : null;
  const modelId = source.model_id != null ? redact(String(source.model_id)) : null;
  const promptSha256 = source.prompt_sha256 != null ? String(source.prompt_sha256) : null;
  const contextManifest = normalizeContextManifest(source.context_manifest);
  const producedPatchSha256 = source.produced_patch_sha256 != null
    ? String(source.produced_patch_sha256) : null;
  const modelCallCount = typeof source.model_call_count === "number"
    ? source.model_call_count : null;
  const tokensUsed = normalizeTokensUsed(source.tokens_used);
  const canonical = [
    sessionId || "",
    toolkit || "",
    eventType || "",
    command || "",
    runId || "",
    agentRole || "",
    taskId || "",
    timestamp,
  ].join("|");

  return {
    event_id: fingerprintId("evt", canonical),
    session_id: sessionId,
    toolkit,
    phase: nullableString(source.phase),
    event_type: eventType,
    command,
    run_id: runId,
    agent_role: agentRole,
    task_id: taskId,
    feature_key: featureKey,
    stop_condition_hit: stopConditionHit,
    evidence_quality_ok: evidenceQualityOk,
    overall_verdict: overallVerdict,
    roles_not_ready_count: rolesNotReadyCount,
    report_path: reportPath,
    ...(Object.prototype.hasOwnProperty.call(source, "worktree_path") ? { worktree_path: worktreePath } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "actions_executed") ? { actions_executed: actionsExecuted } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "execution_mode") ? { execution_mode: executionMode } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "workflow_type") ? { workflow_type: workflowType } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "iteration_index") ? { iteration_index: iterationIndex } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "readiness_verdict") ? { readiness_verdict: readinessVerdict } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "session_cost_usd") ? { session_cost_usd: sessionCostUsd } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "session_output_tokens") ? { session_output_tokens: sessionOutputTokens } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "model_provider") ? { model_provider: modelProvider } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "model_id") ? { model_id: modelId } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "prompt_sha256") ? { prompt_sha256: promptSha256 } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "context_manifest") ? { context_manifest: contextManifest } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "produced_patch_sha256") ? { produced_patch_sha256: producedPatchSha256 } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "model_call_count") ? { model_call_count: modelCallCount } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "tokens_used") ? { tokens_used: tokensUsed } : {}),
    status: normalizeStatus(source.status),
    cwd: typeof source.cwd === "string" ? redact(source.cwd) : null,
    files: normalizeFiles(source.files),
    timestamp,
    redaction: "applied",
    truncated,
  };
}

function readExistingEventIds(file) {
  if (!fs.existsSync(file)) {
    return new Set();
  }
  const ids = new Set();
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const event = JSON.parse(line);
      if (event && typeof event.event_id === "string") {
        ids.add(event.event_id);
      }
    } catch (_error) {
      // Append-only logs should remain writable even if one old line is malformed.
    }
  }
  return ids;
}

/**
 * Append a redacted trust event.
 *
 * The caller must provide a stable timestamp when retry-idempotency is desired.
 * If timestamp is omitted, each call receives the current ISO timestamp and is
 * treated as a distinct observation.
 */
function appendEvent(projectPath, raw) {
  const event = buildEvent(raw);
  const file = eventsFile(projectPath, event.timestamp.slice(0, 10));
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const existingIds = readExistingEventIds(file);
  if (existingIds.has(event.event_id)) {
    return { event, written: false };
  }

  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  return { event, written: true };
}

function withKeyedLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  const cleanup = next.then(
    () => {},
    () => {},
  );
  locks.set(key, cleanup);
  cleanup.then(() => {
    if (locks.get(key) === cleanup) {
      locks.delete(key);
    }
  });
  return next;
}

void withKeyedLock;

module.exports = { generateId, fingerprintId, buildEvent, appendEvent, eventsDir, eventsFile };
