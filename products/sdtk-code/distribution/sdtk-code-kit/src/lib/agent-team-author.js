"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { redact, containsSecretMaterial } = require("./trust-redact");
const {
  MODEL_MAX_CALLS_PER_RUN,
  MODEL_WALLCLOCK_TIMEOUT_MS,
  MODEL_MAX_OUTPUT_TOKENS,
  CONTEXT_MAX_FILES,
  CONTEXT_MAX_BYTES,
  MODEL_ID,
  MODEL_MAX_COST_USD,
  estimateTokensFromText,
  assertCostWithinCap,
  callModelProvider,
} = require("./model-provider");
const {
  loadExecuteContext,
  runControlledProcess,
  buildRunAllowlist,
  readPatchSummary,
  guardPatchTargets,
  applyPatch,
  createWorktree,
  cleanupWorktree,
  buildExecuteEvidence,
  writeAndSubmitExecuteEvidence,
  writeReadinessAndReport,
  runVerificationCommands,
  commandLiteral,
  targetPaths,
  stopConditionFromError,
  plannedCleanupCommand,
  confirmExecute,
} = require("./agent-team-execute");

const GIT_LS_FILES_ARGV = Object.freeze(["git", "ls-files", "-z"]);
const AUTHOR_PATCH_NAME = "model-produced.patch";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeRelPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function globToRegex(scope) {
  const escaped = String(scope).replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesScope(targetPath, scope) {
  const normalized = normalizeRelPath(targetPath);
  const normalizedScope = normalizeRelPath(scope);
  if (normalizedScope === "**" || normalizedScope === "**/*") return true;
  if (normalizedScope.endsWith("/**")) {
    const prefix = normalizedScope.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (normalizedScope.includes("*")) {
    return globToRegex(normalizedScope).test(normalized);
  }
  return normalized === normalizedScope;
}

function scopeIsWholeRepo(scope) {
  const normalized = normalizeRelPath(scope);
  return normalized === "**" || normalized === "**/*" || normalized === "./**";
}

function inAllowedScopes(targetPath, allowedScopes) {
  return asArray(allowedScopes).some((scope) => matchesScope(targetPath, scope));
}

function isDenyListedRelPath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return normalized === ".env" ||
    normalized.startsWith(".env.") ||
    normalized.startsWith(".sdtk/") ||
    normalized.startsWith("secrets/") ||
    normalized.startsWith(".codex/") ||
    normalized.startsWith(".claude/") ||
    normalized.startsWith(".git/");
}

function assertInsideBase(candidate, base) {
  const resolved = path.resolve(candidate);
  const root = path.resolve(base);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ValidationError("FAIL_CONTEXT_EMPTY: context candidate escapes worktree root");
  }
  return resolved;
}

function listTrackedFiles(worktreeRoot, deps) {
  const options = deps || {};
  const runner = options.runControlledProcess || runControlledProcess;
  const result = runner([...GIT_LS_FILES_ARGV], { cwd: worktreeRoot });
  if (!result || result.exitCode !== 0) {
    throw new ValidationError(`FAIL_CONTEXT_EMPTY: git ls-files failed: ${result ? result.stderr || result.stdout || "no output" : "no result"}`);
  }
  return String(result.stdout || "").split("\0").map(normalizeRelPath).filter(Boolean);
}

function taskPacketPath(projectPath, ctx) {
  const roleName = String(ctx.role.role || "dev").toUpperCase();
  const slug = String(ctx.role.task_slug || "IMPLEMENTATION");
  return path.join(projectPath, ".sdtk", "agent-team", "tasks", ctx.featureKey, `${roleName}_${slug}.md`);
}

function readTaskPacket(projectPath, ctx) {
  const packetPath = taskPacketPath(projectPath, ctx);
  try {
    return fs.readFileSync(packetPath, "utf8");
  } catch (_error) {
    return [
      `# Agent Task Packet — ${ctx.featureKey} / ${ctx.role.role}`,
      "",
      ctx.role.objective || "Implement the approved bounded slice.",
      "",
      "## Allowed file scopes",
      ...ctx.allowedFileScopes.map((scope) => `- ${scope}`),
    ].join("\n");
  }
}

function readCandidateSnapshot(base, relPath) {
  const absolute = assertInsideBase(path.join(base, relPath), base);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile()) {
    return null;
  }
  const real = fs.realpathSync(absolute);
  assertInsideBase(real, base);
  return fs.readFileSync(real, "utf8");
}

function buildPrompt(featureKey, role, packet, snapshots) {
  const lines = [
    "You are an author-only patch producer for SDTK Agent Team D-2b.",
    "Return a single unified git patch and no prose.",
    "Do not execute commands. Do not request tools. Do not include secrets.",
    `Feature key: ${featureKey}`,
    `Role: ${role.role}`,
    "",
    "## Task Packet",
    packet,
    "",
    "## Context Snapshots",
  ];
  for (const snapshot of snapshots) {
    lines.push(`\n### ${snapshot.path}\n`);
    lines.push(snapshot.content);
  }
  return lines.join("\n");
}

function assembleContext(ctx, opts) {
  const options = opts || {};
  const base = path.resolve(options.worktreeRoot || ctx.worktreeRoot || ctx.projectPath);
  const allowedScopes = asArray(ctx.allowedFileScopes || (ctx.role && ctx.role.allowed_file_scopes));
  if (allowedScopes.length === 0 || allowedScopes.some(scopeIsWholeRepo)) {
    throw new ValidationError("FAIL_CONTEXT_EMPTY: author context requires bounded allowed_file_scopes; whole-repo wildcard is denied");
  }
  const tracked = listTrackedFiles(base, options);
  const snapshots = [];
  let totalBytes = 0;
  for (const relPath of tracked) {
    if (isDenyListedRelPath(relPath)) continue;
    if (!inAllowedScopes(relPath, allowedScopes)) continue;
    let content;
    try {
      content = readCandidateSnapshot(base, relPath);
    } catch (_error) {
      continue;
    }
    if (content == null) continue;
    const redactedContent = redact(content);
    const size = Buffer.byteLength(redactedContent, "utf8");
    totalBytes += size;
    snapshots.push({
      path: redact(relPath),
      snapshot_sha256: sha256(redactedContent),
      content: redactedContent,
      bytes: size,
    });
    if (snapshots.length > CONTEXT_MAX_FILES || totalBytes > CONTEXT_MAX_BYTES) {
      throw new ValidationError(`FAIL_CONTEXT_TOO_LARGE: context exceeds ceiling files=${snapshots.length}, bytes=${totalBytes}`);
    }
  }
  if (snapshots.length === 0) {
    throw new ValidationError("FAIL_CONTEXT_EMPTY: no tracked in-scope context files were available");
  }
  const packet = redact(readTaskPacket(ctx.projectPath, ctx));
  const prompt = redact(buildPrompt(ctx.featureKey, ctx.role, packet, snapshots));
  const promptSha = sha256(prompt);
  const inputTokenEstimate = estimateTokensFromText(prompt);
  const projectedCost = assertCostWithinCap(MODEL_ID, inputTokenEstimate, MODEL_MAX_OUTPUT_TOKENS);
  return {
    prompt,
    prompt_sha256: promptSha,
    context_manifest: snapshots.map((entry) => ({ path: entry.path, snapshot_sha256: entry.snapshot_sha256 })),
    file_count: snapshots.length,
    byte_count: totalBytes,
    input_token_estimate: inputTokenEstimate,
    projected_cost_usd: projectedCost,
    model_id: MODEL_ID,
    max_output_tokens: MODEL_MAX_OUTPUT_TOKENS,
    model_max_cost_usd: MODEL_MAX_COST_USD,
  };
}

function addedPatchContent(patchText) {
  return String(patchText || "").split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

function scanProducedPatchForSecrets(patchText) {
  const added = addedPatchContent(patchText);
  if (containsSecretMaterial(added)) {
    return { stop_condition_hit: "secret_block", reason: "FAIL_PATCH_SECRET_CONTENT: model-produced patch adds secret-shaped content" };
  }
  return null;
}

function authorTempDir(projectPath, featureKey) {
  const dir = path.join(path.resolve(projectPath || "."), ".sdtk", "agent-team", "tmp", featureKey, "author");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeProducedPatch(projectPath, featureKey, patchText) {
  const out = path.join(authorTempDir(projectPath, featureKey), AUTHOR_PATCH_NAME);
  fs.writeFileSync(out, String(patchText || ""), "utf8");
  return out;
}

function renderDryRunAuthorPlan(ctx, context) {
  return [
    `Agent Team Author Plan: ${ctx.featureKey}`,
    "  mode:          dry-run",
    "  network:       disabled",
    "  credential:    not required",
    `  run_id:        ${ctx.runId}`,
    `  role:          ${ctx.role.role}`,
    `  model:         ${context.model_id}`,
    `  max_tokens:    ${context.max_output_tokens}`,
    `  projected_cost_usd: ${context.projected_cost_usd}`,
    `  context_files: ${context.file_count}`,
    `  context_bytes: ${context.byte_count}`,
    `  prompt_sha256: ${context.prompt_sha256}`,
    "  context_manifest:",
    ...context.context_manifest.map((entry) => `    - ${entry.path} ${entry.snapshot_sha256}`),
    "  dry-run only — no provider call, no API key lookup, no worktree mutation, no patch apply.",
  ].join("\n");
}

function stopResult(ctx, data) {
  const info = data || {};
  return {
    keepForReview: false,
    exitCode: 1,
    status: "NOT_READY",
    feature_key: ctx.featureKey,
    run_id: ctx.runId,
    execution_mode: "execute",
    workflow_type: ctx.workflowType,
    worktree_path: ctx.worktreeRoot,
    branch: ctx.branch,
    actions_executed: Number(info.actions_executed || 0),
    stop_condition_hit: info.stop_condition_hit || "unknown_risk_stop",
    stop_reason: info.reason || info.stop_condition_hit || "unknown_risk_stop",
    evidence_path: info.evidence_path || null,
    readiness_path: info.readiness_path || null,
    readiness_verdict: info.readiness_verdict || null,
    report_path: info.report_path || null,
    cleanup_command: null,
    prompt_sha256: info.prompt_sha256 || null,
    context_manifest: info.context_manifest || [],
    produced_patch_sha256: info.produced_patch_sha256 || null,
    model_provider: info.model_provider || null,
    model_id: info.model_id || MODEL_ID,
    model_call_count: info.model_call_count || 0,
    tokens_used: info.tokens_used || null,
    stdout: [
      "Agent Team Author: STOPPED",
      `  feature_key: ${ctx.featureKey}`,
      `  run_id:      ${ctx.runId}`,
      `  stop:        ${info.stop_condition_hit || "unknown_risk_stop"}`,
      "  cleanup:     completed",
    ].join("\n"),
  };
}

function submitStopEvidence(ctx, patchSummary, data) {
  const info = data || {};
  const evidenceJson = buildExecuteEvidence(ctx, {
    stop_condition_hit: info.stop_condition_hit || "unknown_risk_stop",
    summary: `Author execution stopped: ${info.stop_condition_hit || "unknown_risk_stop"}`,
    commands_run: [],
    verification_evidence: "author flow stopped before allowed verification completed",
    blockers: [info.reason || info.stop_condition_hit || "unknown_risk_stop"],
    files_touched: targetPaths(patchSummary),
    code_diff: `no patch applied — stopped at ${info.stop_condition_hit || "unknown_risk_stop"}`,
  });
  const evidenceResult = writeAndSubmitExecuteEvidence(ctx, evidenceJson);
  const readinessBundle = writeReadinessAndReport(ctx);
  return { evidenceResult, readinessBundle };
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ValidationError("FAIL_MODEL_TIMEOUT: model wall-clock timeout exceeded")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function produceAuthorPatch(projectPath, featureKey, opts) {
  const options = opts || {};
  const ctx = loadExecuteContext(projectPath, featureKey);
  const worktreeRoot = options.worktreeRoot;
  if (!worktreeRoot) {
    throw new ValidationError("FAIL_CONTEXT_EMPTY: produceAuthorPatch requires a provided worktreeRoot");
  }
  const context = assembleContext(ctx, {
    worktreeRoot,
    runControlledProcess: options.runControlledProcess,
  });
  let modelCallCount = 0;
  const provider = options.callModelProvider || callModelProvider;
  const modelResult = await withTimeout(Promise.resolve().then(() => {
    modelCallCount += 1;
    if (modelCallCount > MODEL_MAX_CALLS_PER_RUN) {
      throw new ValidationError("FAIL_MODEL_CALL_LIMIT: only one model call is allowed per run");
    }
    return provider({
      prompt: context.prompt,
      model_id: MODEL_ID,
      max_output_tokens: MODEL_MAX_OUTPUT_TOKENS,
      input_token_estimate: context.input_token_estimate,
      call_count: modelCallCount,
    }, options.providerDeps || {});
  }), MODEL_WALLCLOCK_TIMEOUT_MS);
  const patchText = String(modelResult.patch || "");
  const patchHash = sha256(patchText);
  const contentStop = scanProducedPatchForSecrets(patchText);
  return {
    patchText,
    patchHash,
    prompt_sha256: context.prompt_sha256,
    context_manifest: context.context_manifest,
    model_provider: modelResult.provider,
    model_id: modelResult.model_id,
    model_call_count: modelResult.model_call_count || modelCallCount,
    tokens_used: modelResult.tokens_used || null,
    projected_cost_usd: modelResult.projected_cost_usd,
    ...(contentStop ? { stop: contentStop } : {}),
  };
}

async function executeAuthor(projectPath, featureKey, opts) {
  const options = opts || {};
  const ctx = loadExecuteContext(projectPath, featureKey);
  await confirmExecute(options.confirmInput || {}, ctx.featureKey, ctx.runId);
  const allowlist = buildRunAllowlist(ctx.verificationCommands, options);
  let created = null;
  let keepForReview = false;
  let patchPath = null;
  try {
    created = createWorktree(ctx.projectPath, ctx.featureKey, ctx.runId);
    ctx.worktreeRoot = created.worktreeRoot;
    ctx.branch = created.branch;
    const produced = await produceAuthorPatch(projectPath, featureKey, {
      ...options,
      worktreeRoot: created.worktreeRoot,
    });
    const patchText = produced.patchText;
    const patchHash = produced.patchHash;
    patchPath = writeProducedPatch(ctx.projectPath, ctx.featureKey, patchText);
    const patchSummary = readPatchSummary(patchPath);
    if (produced.stop) {
      const bundle = submitStopEvidence(ctx, patchSummary, produced.stop);
      return stopResult(ctx, {
        ...produced.stop,
        evidence_path: bundle.evidenceResult.outputPath,
        readiness_path: bundle.readinessBundle.readinessPath,
        readiness_verdict: bundle.readinessBundle.readiness.overall_verdict,
        report_path: bundle.readinessBundle.reportPath,
        prompt_sha256: produced.prompt_sha256,
        context_manifest: produced.context_manifest,
        produced_patch_sha256: patchHash,
        model_provider: produced.model_provider,
        model_id: produced.model_id,
        model_call_count: produced.model_call_count,
        tokens_used: produced.tokens_used,
      });
    }
    const patchStop = guardPatchTargets(patchSummary, ctx.worktreeRoot, ctx.allowedFileScopes);
    if (patchStop) {
      const bundle = submitStopEvidence(ctx, patchSummary, patchStop);
      return stopResult(ctx, {
        ...patchStop,
        evidence_path: bundle.evidenceResult.outputPath,
        readiness_path: bundle.readinessBundle.readinessPath,
        readiness_verdict: bundle.readinessBundle.readiness.overall_verdict,
        report_path: bundle.readinessBundle.reportPath,
        prompt_sha256: produced.prompt_sha256,
        context_manifest: produced.context_manifest,
        produced_patch_sha256: patchHash,
        model_provider: produced.model_provider,
        model_id: produced.model_id,
        model_call_count: produced.model_call_count,
        tokens_used: produced.tokens_used,
      });
    }
    applyPatch(ctx.worktreeRoot, patchPath);
    const verification = runVerificationCommands(ctx, allowlist);
    const stopHit = verification.stop ? verification.stop.stop_condition_hit : null;
    const stopReason = verification.stop ? verification.stop.reason : null;
    const commandsRun = verification.commandResults.map((entry) => commandLiteral(entry.argv));
    const evidenceJson = buildExecuteEvidence(ctx, {
      stop_condition_hit: stopHit,
      summary: stopHit ? `Author execution stopped: ${stopHit}` : "Model-authored docs patch applied and allowed verification completed.",
      commands_run: commandsRun,
      verification_evidence: verification.commandResults.map((entry) => `${commandLiteral(entry.argv)} exit=${entry.result.exitCode}`).join("; ") || "no commands run",
      blockers: stopHit ? [stopReason || stopHit] : [],
      files_touched: targetPaths(patchSummary),
      code_diff: `Applied model-produced patch to worktree ${ctx.worktreeRoot}.`,
    });
    const evidenceResult = writeAndSubmitExecuteEvidence(ctx, evidenceJson);
    const readinessBundle = writeReadinessAndReport(ctx);
    keepForReview = !stopHit;
    return {
      keepForReview,
      exitCode: stopHit ? 1 : 0,
      status: stopHit ? "NOT_READY" : "READY_TO_REVIEW",
      feature_key: ctx.featureKey,
      run_id: ctx.runId,
      execution_mode: "execute",
      workflow_type: ctx.workflowType,
      worktree_path: ctx.worktreeRoot,
      branch: ctx.branch,
      actions_executed: verification.actionsExecuted,
      stop_condition_hit: stopHit,
      stop_reason: stopReason,
      evidence_path: evidenceResult.outputPath,
      readiness_path: readinessBundle.readinessPath,
      readiness_verdict: readinessBundle.readiness.overall_verdict,
      report_path: readinessBundle.reportPath,
      cleanup_command: plannedCleanupCommand(ctx),
      prompt_sha256: produced.prompt_sha256,
      context_manifest: produced.context_manifest,
      produced_patch_sha256: patchHash,
      model_provider: produced.model_provider,
      model_id: produced.model_id,
      model_call_count: produced.model_call_count,
      tokens_used: produced.tokens_used,
      stdout: [
        `Agent Team Author: ${stopHit ? "STOPPED" : "COMPLETED"}`,
        `  feature_key: ${ctx.featureKey}`,
        `  run_id:      ${ctx.runId}`,
        `  worktree:    ${ctx.worktreeRoot}`,
        `  actions:     ${verification.actionsExecuted}`,
        `  stop:        ${stopHit || "none"}`,
        stopHit ? "  cleanup:     completed" : `  cleanup command: ${plannedCleanupCommand(ctx)}`,
      ].join("\n"),
    };
  } catch (error) {
    const stopHit = stopConditionFromError(error);
    return stopResult(ctx, { stop_condition_hit: stopHit, reason: error && error.message ? error.message : String(error || stopHit) });
  } finally {
    if (patchPath) fs.rmSync(patchPath, { force: true });
    if (!keepForReview && created) {
      cleanupWorktree(ctx.projectPath, created.worktreeRoot, created.branch);
    }
  }
}

function dryRunAuthor(projectPath, featureKey, opts) {
  const options = opts || {};
  const ctx = loadExecuteContext(projectPath, featureKey);
  const allowlist = buildRunAllowlist(ctx.verificationCommands, options);
  void allowlist;
  const context = assembleContext(ctx, { worktreeRoot: ctx.projectPath, runControlledProcess: options.runControlledProcess });
  return {
    exitCode: 0,
    status: "PLANNED",
    feature_key: ctx.featureKey,
    run_id: ctx.runId,
    execution_mode: "dry-run",
    workflow_type: ctx.workflowType,
    worktree_path: ctx.worktreeRoot,
    branch: ctx.branch,
    actions_executed: 0,
    stop_condition_hit: null,
    prompt_sha256: context.prompt_sha256,
    context_manifest: context.context_manifest,
    produced_patch_sha256: null,
    model_provider: "claude",
    model_id: MODEL_ID,
    model_call_count: 0,
    tokens_used: null,
    projected_cost_usd: context.projected_cost_usd,
    stdout: renderDryRunAuthorPlan(ctx, context),
    cleanup_command: plannedCleanupCommand(ctx),
  };
}

function runAuthor(projectPath, featureKey, opts) {
  const options = opts || {};
  if (options.mode === "execute") {
    return executeAuthor(projectPath, featureKey, options);
  }
  return dryRunAuthor(projectPath, featureKey, options);
}

module.exports = {
  GIT_LS_FILES_ARGV,
  AUTHOR_PATCH_NAME,
  sha256,
  matchesScope,
  isDenyListedRelPath,
  listTrackedFiles,
  assembleContext,
  addedPatchContent,
  scanProducedPatchForSecrets,
  renderDryRunAuthorPlan,
  produceAuthorPatch,
  dryRunAuthor,
  executeAuthor,
  runAuthor,
};
