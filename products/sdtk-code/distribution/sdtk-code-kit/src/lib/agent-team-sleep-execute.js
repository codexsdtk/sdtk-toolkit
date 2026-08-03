"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { safeSegment } = require("./agent-team-export");
const { produceAuthorPatch, sha256 } = require("./agent-team-author");
const {
  MODEL_MAX_COST_USD,
  MODEL_MAX_OUTPUT_TOKENS,
} = require("./model-provider");
const {
  loadExecuteContext,
  createWorktree,
  cleanupWorktree,
  buildRunAllowlist,
  readPatchSummary,
  guardPatchTargets,
  applyPatch,
  runVerificationCommands,
  buildExecuteEvidence,
  writeAndSubmitExecuteEvidence,
  writeReadinessAndReport,
  commandLiteral,
  targetPaths,
  plannedCleanupCommand,
  stopConditionFromError,
} = require("./agent-team-execute");
const { loadReadiness } = require("./agent-team-readiness");
const {
  atomicWriteJson,
  resolveEvidencePath,
} = require("./agent-team-evidence");
const { appendEvent } = require("./trust-events");
const {
  SESSION_MAX_ITERATIONS,
  SESSION_MAX_COST_USD,
  SESSION_MAX_OUTPUT_TOKENS,
  pinScope,
  assertPinnedScope,
  createSleepSession,
  withSessionLease,
  sessionStopConditionFromError,
} = require("./agent-team-sleep-session");

const SLEEP_EXECUTE_SCHEMA = "sdtk.agent-team-sleep-execute.preview.v1";
const SLEEP_PATH2_PROJECTED = Object.freeze({
  projected_cost_usd: MODEL_MAX_COST_USD,
  projected_output_tokens: MODEL_MAX_OUTPUT_TOKENS,
});
const SLEEP_PATH1_PROJECTED = Object.freeze({
  projected_cost_usd: 0,
  projected_output_tokens: 0,
});

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadSleepPlan(projectPath, featureKey) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const planPath = path.resolve(projectPath || ".", ".sdtk", "trust", "sleep-plan.json");
  let plan;
  try {
    plan = readJson(planPath);
  } catch (_error) {
    throw new ValidationError(`NEEDS_SLEEP_PLAN: no sleep plan at ${planPath}. Run \`sdtk-code sleep plan\` first.`);
  }
  if (plan.feature_key !== safeFeatureKey) {
    throw new ValidationError(`NEEDS_SLEEP_PLAN: sleep-plan feature_key "${plan.feature_key}" does not match --feature-key "${safeFeatureKey}".`);
  }
  return { plan, planPath };
}

function hasRemainingPlannedWork(plan, completedIterations) {
  const steps = Array.isArray(plan && plan.ordered_steps) ? plan.ordered_steps : [];
  return completedIterations < steps.length;
}

function tokenOutput(tokensUsed) {
  return tokensUsed && typeof tokensUsed.output_tokens === "number" ? tokensUsed.output_tokens : 0;
}

function sleepConfirmPhrase(featureKey, sessionId) {
  return `EXECUTE ${safeSegment(featureKey, "feature_key")} ${safeSegment(sessionId, "session_id")} max_iterations=3 cost_cap=$3.00 unit=Path2-author-only`;
}

async function confirmSleepExecute(input, featureKey, sessionId) {
  const source = input || {};
  const expected = sleepConfirmPhrase(featureKey, sessionId);
  if (source.isTTY !== true) {
    throw new ValidationError("FAIL_EXECUTE_REQUIRES_TTY: --execute requires an interactive TTY confirmation.");
  }
  if (typeof source.readLine !== "function") {
    throw new ValidationError("FAIL_EXECUTE_REQUIRES_TTY: confirmation reader is not available.");
  }
  const answer = await source.readLine(`Type ${expected} to continue: `);
  if (String(answer || "") !== expected) {
    throw new ValidationError("FAIL_EXECUTE_CONFIRMATION_MISMATCH: exact sleep-execute confirmation phrase was not provided.");
  }
  return { confirmed: true, phrase: expected };
}

function tempPatchPath(projectPath, featureKey, sessionId, iterationIndex) {
  const dir = path.resolve(projectPath || ".", ".sdtk", "agent-team", "tmp", safeSegment(featureKey, "feature_key"), "sleep-execute");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safeSegment(sessionId, "session_id")}-${iterationIndex}.patch`);
}

function writeTempPatch(projectPath, featureKey, sessionId, iterationIndex, patchText) {
  const out = tempPatchPath(projectPath, featureKey, sessionId, iterationIndex);
  fs.writeFileSync(out, String(patchText || ""), "utf8");
  return out;
}

function evidenceBaseDir(projectPath) {
  return path.resolve(projectPath || ".", ".sdtk", "agent-team", "evidence");
}

function safeSubmitEvidence(ctx, evidenceJson) {
  try {
    return writeAndSubmitExecuteEvidence(ctx, evidenceJson);
  } catch (error) {
    const message = error && error.message ? String(error.message) : String(error || "");
    if (!message.includes("FAIL_EVIDENCE_ALREADY_SUBMITTED")) {
      throw error;
    }
    const outputPath = resolveEvidencePath(ctx.projectPath, ctx.featureKey, String(ctx.role.role || "dev").toLowerCase());
    atomicWriteJson(outputPath, evidenceJson, evidenceBaseDir(ctx.projectPath));
    return { outputPath, updatedExisting: true };
  }
}

function assertReadinessArtifactAuthentic(ctx, readiness) {
  if (!readiness || typeof readiness !== "object") {
    throw new ValidationError("NEEDS_READINESS: readiness.json is not an object.");
  }
  if (readiness.feature_key !== ctx.featureKey || readiness.run_id !== ctx.runId) {
    throw new ValidationError("NEEDS_READINESS: readiness.json does not match the active agent-team plan.");
  }
  if (readiness.overall_verdict === "READY_TO_SLEEP") {
    for (const roleSpec of Array.isArray(ctx.plan.roles) ? ctx.plan.roles : []) {
      const role = roleSpec && roleSpec.role;
      if (!role) continue;
      const evidencePath = resolveEvidencePath(ctx.projectPath, ctx.featureKey, String(role).toLowerCase());
      if (!fs.existsSync(evidencePath)) {
        throw new ValidationError(`NEEDS_READINESS: READY_TO_SLEEP is not backed by ${String(role).toUpperCase()} evidence.`);
      }
    }
  }
  return readiness;
}

function refreshReadinessAndLoad(ctx) {
  const refreshed = writeReadinessAndReport(ctx);
  const loaded = loadReadiness(ctx.projectPath, ctx.featureKey);
  return { ...refreshed, loaded };
}

function buildStopEvidence(ctx, patchSummary, stopHit, reason, codeDiff) {
  return buildExecuteEvidence(ctx, {
    stop_condition_hit: stopHit || "unknown_risk_stop",
    summary: `Sleep execute stopped: ${stopHit || "unknown_risk_stop"}`,
    commands_run: [],
    verification_evidence: "sleep execute stopped before allowed verification completed",
    blockers: [reason || stopHit || "unknown_risk_stop"],
    files_touched: targetPaths(patchSummary),
    code_diff: codeDiff || `no patch applied — stopped at ${stopHit || "unknown_risk_stop"}`,
  });
}

function sessionTrace(projectPath, result, extra) {
  const info = extra || {};
  return appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: info.event_type || "agent_team_sleep_iteration",
    command: info.command || `sdtk-code agent-team sleep-execute --feature-key ${result.feature_key}`,
    status: result.status,
    feature_key: result.feature_key,
    run_id: result.run_id,
    session_id: result.session_id,
    iteration_index: info.iteration_index,
    readiness_verdict: info.readiness_verdict || result.readiness_verdict,
    stop_condition_hit: info.stop_condition_hit || result.stop_condition_hit,
    session_cost_usd: result.session_cost_usd,
    session_output_tokens: result.session_output_tokens,
    worktree_path: result.worktree_path,
    actions_executed: result.actions_executed,
    execution_mode: result.execution_mode,
    workflow_type: result.workflow_type,
    model_provider: info.model_provider,
    model_id: info.model_id,
    prompt_sha256: info.prompt_sha256,
    context_manifest: info.context_manifest,
    produced_patch_sha256: info.produced_patch_sha256,
    model_call_count: info.model_call_count,
    tokens_used: info.tokens_used,
  });
}

function renderDryRunPlan(ctx, sessionId, pinnedScope, readiness) {
  return [
    `Agent Team Sleep Execute Plan: ${ctx.featureKey}`,
    "  mode:          dry-run",
    "  network:       disabled",
    "  credential:    not required",
    `  session_id:    ${sessionId}`,
    `  run_id:        ${ctx.runId}`,
    `  max_iters:     ${SESSION_MAX_ITERATIONS}`,
    `  cost_cap_usd:  ${SESSION_MAX_COST_USD}`,
    `  output_cap:    ${SESSION_MAX_OUTPUT_TOKENS}`,
    `  readiness:     ${readiness ? readiness.overall_verdict : "not loaded"}`,
    `  allowed scope: ${pinnedScope.allowed_file_scopes.join(", ")}`,
    `  allowlist:     ${pinnedScope.verification_commands.join("; ")}`,
    "  dry-run only — no provider call, no API key lookup, no worktree mutation, no patch apply.",
  ].join("\n");
}

function dryRunSleepExecute(projectPath, featureKey, opts) {
  const options = opts || {};
  const ctx = loadExecuteContext(projectPath, featureKey);
  const sessionId = options.sessionId ? safeSegment(options.sessionId, "session_id") : `${ctx.runId}_sleep`;
  const pinnedScope = pinScope(ctx);
  let readiness = null;
  try {
    readiness = loadReadiness(ctx.projectPath, ctx.featureKey);
  } catch (_error) {
    readiness = null;
  }
  return {
    exitCode: 0,
    status: "PLANNED",
    feature_key: ctx.featureKey,
    run_id: ctx.runId,
    session_id: sessionId,
    execution_mode: "dry-run",
    workflow_type: ctx.workflowType,
    worktree_path: ctx.worktreeRoot,
    branch: ctx.branch,
    actions_executed: 0,
    stop_condition_hit: null,
    readiness_verdict: readiness ? readiness.overall_verdict : null,
    session_cost_usd: 0,
    session_output_tokens: 0,
    stdout: renderDryRunPlan(ctx, sessionId, pinnedScope, readiness),
  };
}

function stopResult(ctx, session, data) {
  const info = data || {};
  const snap = session.snapshot({ cumulativeWorktreePath: ctx.worktreeRoot, plan: ctx.plan });
  return {
    keepForReview: info.keepForReview !== false,
    exitCode: info.exitCode === undefined ? 1 : info.exitCode,
    status: info.status || "NOT_READY",
    feature_key: ctx.featureKey,
    run_id: ctx.runId,
    session_id: session.session_id,
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
    cleanup_command: info.cleanup_command || plannedCleanupCommand(ctx),
    session_cost_usd: snap.session_cost_usd,
    session_output_tokens: snap.session_output_tokens,
    iteration_count: snap.iteration,
    stdout: [
      `Agent Team Sleep Execute: ${info.status || "STOPPED"}`,
      `  feature_key: ${ctx.featureKey}`,
      `  run_id:      ${ctx.runId}`,
      `  session_id:  ${session.session_id}`,
      `  worktree:    ${ctx.worktreeRoot}`,
      `  iterations:  ${snap.iteration}`,
      `  stop:        ${info.stop_condition_hit || "unknown_risk_stop"}`,
      `  cleanup command: ${plannedCleanupCommand(ctx)}`,
    ].join("\n"),
  };
}

async function executeSleepSession(projectPath, featureKey, opts) {
  const options = opts || {};
  const ctx = loadExecuteContext(projectPath, featureKey);
  const { plan: sleepPlan } = loadSleepPlan(ctx.projectPath, ctx.featureKey);
  const sessionId = options.sessionId ? safeSegment(options.sessionId, "session_id") : `${ctx.runId}_sleep`;
  const pinnedScope = pinScope(ctx);
  // BK-340: custom budgets are only reachable through an authorization-backed
  // confirm strategy (the Pro pack). The free TTY phrase pins the 3/$3.00
  // defaults and must never silently understate a larger authorized budget.
  if (options.budgets !== undefined && typeof options.confirmStrategy !== "function") {
    throw new ValidationError("FAIL_BUDGET_REQUIRES_AUTHORIZATION: custom session budgets require an authorization-backed confirm strategy.");
  }
  const session = createSleepSession({
    featureKey: ctx.featureKey,
    sessionId,
    pinnedScope,
    nowMs: options.nowMs,
    budgets: options.budgets,
  });
  // BK-340 seam: an injected confirm strategy (supplied only by the Pro
  // sleep-execute pack after validating a pre-declared attended authorization
  // artifact) replaces the interactive TTY confirmation. Default behavior —
  // the Phase E attended TTY phrase — is unchanged when no strategy is given.
  if (typeof options.confirmStrategy === "function") {
    await options.confirmStrategy({ featureKey: ctx.featureKey, sessionId: session.session_id });
  } else {
    await confirmSleepExecute(options.confirmInput || {}, ctx.featureKey, session.session_id);
  }

  return withSessionLease(session.session_id, async () => {
    let created = null;
    let keepForReview = false;
    const tempPatches = [];
    let lastResult = null;
    try {
      created = createWorktree(ctx.projectPath, ctx.featureKey, session.session_id);
      ctx.worktreeRoot = created.worktreeRoot;
      ctx.branch = created.branch;
      const allowlist = buildRunAllowlist(ctx.verificationCommands, options);
      while (true) {
        const iterationIndex = session.snapshot().iteration;
        const pathMode = options.patchFile ? "path1" : "path2";
        session.assertCanStartIteration(pathMode === "path1" ? SLEEP_PATH1_PROJECTED : SLEEP_PATH2_PROJECTED);
        const readinessBefore = assertReadinessArtifactAuthentic(ctx, loadReadiness(ctx.projectPath, ctx.featureKey));
        if (readinessBefore.overall_verdict !== "READY_TO_SLEEP") {
          keepForReview = true;
          lastResult = stopResult(ctx, session, {
            stop_condition_hit: readinessBefore.overall_verdict,
            reason: `readiness gate is ${readinessBefore.overall_verdict}`,
            readiness_verdict: readinessBefore.overall_verdict,
            status: "NOT_READY",
          });
          sessionTrace(ctx.projectPath, lastResult, { iteration_index: iterationIndex, readiness_verdict: readinessBefore.overall_verdict });
          return lastResult;
        }
        assertPinnedScope(session, ctx);

        let patchPath;
        let patchSummary;
        let patchHash = null;
        let produced = null;
        if (pathMode === "path1") {
          patchPath = path.resolve(options.patchFile);
          patchSummary = readPatchSummary(patchPath);
          patchHash = sha256(fs.readFileSync(patchPath, "utf8"));
        } else {
          produced = await produceAuthorPatch(ctx.projectPath, ctx.featureKey, {
            worktreeRoot: ctx.worktreeRoot,
            callModelProvider: options.callModelProvider,
            providerDeps: options.providerDeps,
            runControlledProcess: options.runControlledProcess,
          });
          patchHash = produced.patchHash;
          patchPath = writeTempPatch(ctx.projectPath, ctx.featureKey, session.session_id, iterationIndex, produced.patchText);
          tempPatches.push(patchPath);
          patchSummary = readPatchSummary(patchPath);
          if (produced.stop) {
            const evidence = buildStopEvidence(ctx, patchSummary, produced.stop.stop_condition_hit, produced.stop.reason);
            const evidenceResult = safeSubmitEvidence(ctx, evidence);
            const refreshed = refreshReadinessAndLoad(ctx);
            session.recordIteration({
              cost_usd: Number(produced.projected_cost_usd || 0),
              output_tokens: tokenOutput(produced.tokens_used),
              produced_patch_sha256: patchHash,
              cumulativeWorktreePath: ctx.worktreeRoot,
              plan: ctx.plan,
            });
            keepForReview = true;
            lastResult = stopResult(ctx, session, {
              stop_condition_hit: produced.stop.stop_condition_hit,
              reason: produced.stop.reason,
              evidence_path: evidenceResult.outputPath,
              readiness_path: refreshed.readinessPath,
              readiness_verdict: refreshed.loaded.overall_verdict,
              report_path: refreshed.reportPath,
              status: "NOT_READY",
            });
            sessionTrace(ctx.projectPath, lastResult, {
              iteration_index: iterationIndex,
              readiness_verdict: refreshed.loaded.overall_verdict,
              stop_condition_hit: produced.stop.stop_condition_hit,
              model_provider: produced.model_provider,
              model_id: produced.model_id,
              prompt_sha256: produced.prompt_sha256,
              context_manifest: produced.context_manifest,
              produced_patch_sha256: patchHash,
              model_call_count: produced.model_call_count,
              tokens_used: produced.tokens_used,
            });
            return lastResult;
          }
        }

        const patchStop = guardPatchTargets(patchSummary, ctx.worktreeRoot, ctx.allowedFileScopes);
        if (patchStop) {
          const evidence = buildStopEvidence(ctx, patchSummary, patchStop.stop_condition_hit, patchStop.reason);
          const evidenceResult = safeSubmitEvidence(ctx, evidence);
          const refreshed = refreshReadinessAndLoad(ctx);
          session.recordIteration({
            cost_usd: produced ? Number(produced.projected_cost_usd || 0) : 0,
            output_tokens: produced ? tokenOutput(produced.tokens_used) : 0,
            produced_patch_sha256: patchHash,
            cumulativeWorktreePath: ctx.worktreeRoot,
            plan: ctx.plan,
          });
          keepForReview = true;
          lastResult = stopResult(ctx, session, {
            stop_condition_hit: patchStop.stop_condition_hit,
            reason: patchStop.reason,
            evidence_path: evidenceResult.outputPath,
            readiness_path: refreshed.readinessPath,
            readiness_verdict: refreshed.loaded.overall_verdict,
            report_path: refreshed.reportPath,
            status: "NOT_READY",
          });
          sessionTrace(ctx.projectPath, lastResult, { iteration_index: iterationIndex, readiness_verdict: refreshed.loaded.overall_verdict, stop_condition_hit: patchStop.stop_condition_hit });
          return lastResult;
        }

        applyPatch(ctx.worktreeRoot, patchPath);
        const verification = runVerificationCommands(ctx, allowlist);
        const stopHit = verification.stop ? verification.stop.stop_condition_hit : null;
        const stopReason = verification.stop ? verification.stop.reason : null;
        const commandsRun = verification.commandResults.map((entry) => commandLiteral(entry.argv));
        const evidenceJson = buildExecuteEvidence(ctx, {
          stop_condition_hit: stopHit,
          summary: stopHit ? `Sleep execute stopped: ${stopHit}` : "Sleep execute iteration applied patch and completed allowed verification commands.",
          commands_run: commandsRun,
          verification_evidence: verification.commandResults.map((entry) => `${commandLiteral(entry.argv)} exit=${entry.result.exitCode}`).join("; ") || "no commands run",
          blockers: stopHit ? [stopReason || stopHit] : [],
          files_touched: targetPaths(patchSummary),
          code_diff: `Applied sleep-execute patch to cumulative worktree ${ctx.worktreeRoot}.`,
        });
        const evidenceResult = safeSubmitEvidence(ctx, evidenceJson);
        const refreshed = refreshReadinessAndLoad(ctx);
        const snap = session.recordIteration({
          cost_usd: produced ? Number(produced.projected_cost_usd || 0) : 0,
          output_tokens: produced ? tokenOutput(produced.tokens_used) : 0,
          produced_patch_sha256: patchHash,
          cumulativeWorktreePath: ctx.worktreeRoot,
          plan: ctx.plan,
        });
        lastResult = stopResult(ctx, session, {
          exitCode: stopHit ? 1 : 0,
          status: stopHit ? "NOT_READY" : "READY_TO_REVIEW",
          stop_condition_hit: stopHit,
          reason: stopReason,
          actions_executed: verification.actionsExecuted,
          evidence_path: evidenceResult.outputPath,
          readiness_path: refreshed.readinessPath,
          readiness_verdict: refreshed.loaded.overall_verdict,
          report_path: refreshed.reportPath,
        });
        lastResult.iteration_count = snap.iteration;
        sessionTrace(ctx.projectPath, lastResult, {
          iteration_index: iterationIndex,
          readiness_verdict: refreshed.loaded.overall_verdict,
          stop_condition_hit: stopHit,
          model_provider: produced ? produced.model_provider : null,
          model_id: produced ? produced.model_id : null,
          prompt_sha256: produced ? produced.prompt_sha256 : null,
          context_manifest: produced ? produced.context_manifest : [],
          produced_patch_sha256: patchHash,
          model_call_count: produced ? produced.model_call_count : 0,
          tokens_used: produced ? produced.tokens_used : null,
        });
        if (stopHit || refreshed.loaded.overall_verdict !== "READY_TO_SLEEP") {
          keepForReview = true;
          return lastResult;
        }
        if (!hasRemainingPlannedWork(sleepPlan, snap.iteration)) {
          keepForReview = true;
          lastResult.status = "READY_TO_REVIEW";
          lastResult.exitCode = 0;
          lastResult.stop_condition_hit = null;
          lastResult.stop_reason = null;
          lastResult.stdout = [
            "Agent Team Sleep Execute: READY_TO_REVIEW",
            `  feature_key: ${ctx.featureKey}`,
            `  run_id:      ${ctx.runId}`,
            `  session_id:  ${session.session_id}`,
            `  worktree:    ${ctx.worktreeRoot}`,
            `  iterations:  ${snap.iteration}`,
            "  stop:        none",
            `  cleanup command: ${plannedCleanupCommand(ctx)}`,
          ].join("\n");
          sessionTrace(ctx.projectPath, lastResult, { event_type: "agent_team_sleep_session", readiness_verdict: refreshed.loaded.overall_verdict });
          return lastResult;
        }
      }
    } catch (error) {
      const stopHit = sessionStopConditionFromError(error) || stopConditionFromError(error);
      if (session && typeof session.killSession === "function") {
        session.killSession(stopHit);
      }
      lastResult = stopResult(ctx, session, {
        stop_condition_hit: stopHit,
        reason: error && error.message ? error.message : String(error || stopHit),
        status: "NOT_READY",
        keepForReview: false,
      });
      sessionTrace(ctx.projectPath, lastResult, { stop_condition_hit: stopHit });
      return lastResult;
    } finally {
      for (const patch of tempPatches) fs.rmSync(patch, { force: true });
      if (!keepForReview && created) {
        cleanupWorktree(ctx.projectPath, created.worktreeRoot, created.branch);
      }
    }
  });
}

function runSleepExecute(projectPath, featureKey, opts) {
  const options = opts || {};
  if (options.mode === "execute") {
    return executeSleepSession(projectPath, featureKey, options);
  }
  return dryRunSleepExecute(projectPath, featureKey, options);
}

module.exports = {
  SLEEP_EXECUTE_SCHEMA,
  SLEEP_PATH2_PROJECTED,
  SLEEP_PATH1_PROJECTED,
  loadSleepPlan,
  hasRemainingPlannedWork,
  sleepConfirmPhrase,
  confirmSleepExecute,
  dryRunSleepExecute,
  executeSleepSession,
  assertReadinessArtifactAuthentic,
  runSleepExecute,
};
