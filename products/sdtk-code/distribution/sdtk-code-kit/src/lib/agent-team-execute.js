"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ValidationError } = require("./errors");
const { safeSegment } = require("./agent-team-export");
const { loadAgentTeamPlan } = require("./agent-team-plan");
const { STOP_CONDITIONS } = require("./sleep-plan");
const { redact } = require("./trust-redact");
const { submitEvidence } = require("./agent-team-evidence");
const { computeReadiness, writeReadiness } = require("./agent-team-readiness");
const { buildMorningReport, writeReport } = require("./agent-team-report");

const WORKFLOW_TYPES = Object.freeze(["docs"]);
const ACTION_CAP_DEFAULT = 20;
const COMMAND_TIMEOUT_MS = 120000;
const PATCH_MAX_FILES = 50;
const PATCH_MAX_LINES = 20000;
const EXECUTE_EVIDENCE_SCHEMA = "sdtk.agent-team-evidence.v1";
const EXECUTE_BRANCH_PREFIX = "sdtk/agent-team";
const A1_LITERAL = "python3 scripts/ci/docs_lint.py";
const A2_LITERAL = "python3 scripts/ci/path_check.py";
const A1_ARGV = Object.freeze(["python3", "scripts/ci/docs_lint.py"]);
const A2_ARGV = Object.freeze(["python3", "scripts/ci/path_check.py"]);
const ALLOWED_COMMANDS = Object.freeze([
  Object.freeze({ literal: A1_LITERAL, argv: A1_ARGV }),
  Object.freeze({ literal: A2_LITERAL, argv: A2_ARGV }),
]);
const STOP_CONDITION_IDS = Object.freeze(
  STOP_CONDITIONS.map((condition) => condition && condition.id).filter(Boolean)
);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertPathUnderBase(resolvedPath, expectedBase) {
  const resolved = path.resolve(resolvedPath);
  const base = path.resolve(expectedBase);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new ValidationError("FAIL_UNSAFE_EXPORT_PATH: resolved path outside expected base");
  }
  return resolved;
}

function worktreesBaseDir(projectPath) {
  return path.resolve(projectPath || ".", ".sdtk", "agent-team", "worktrees");
}

function resolveWorktreeRoot(projectPath, runId) {
  const safeRunId = safeSegment(runId, "run_id");
  const base = worktreesBaseDir(projectPath);
  return assertPathUnderBase(path.join(base, safeRunId), base);
}

function writerRole(plan) {
  const writers = asArray(plan && plan.roles).filter((role) => role && role.can_write === true);
  if (writers.length !== 1) {
    throw new ValidationError(`FAIL_EXECUTE_SCOPE: expected exactly one writer role, found ${writers.length}.`);
  }
  const role = writers[0];
  if (!role.role) {
    throw new ValidationError("FAIL_EXECUTE_SCOPE: writer role is missing role name.");
  }
  if (!Array.isArray(role.allowed_file_scopes) || role.allowed_file_scopes.length === 0) {
    throw new ValidationError("FAIL_EXECUTE_SCOPE: writer role has no allowed_file_scopes.");
  }
  return role;
}

function loadExecuteContext(projectPath, featureKey) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const plan = loadAgentTeamPlan(projectPath, safeFeatureKey);
  if (plan.feature_key !== safeFeatureKey) {
    throw new ValidationError(
      `NEEDS_AGENT_TEAM_PLAN: agent-team plan feature_key "${plan.feature_key}" does not match --feature-key "${safeFeatureKey}".`
    );
  }
  const role = writerRole(plan);
  const runId = safeSegment(plan.run_id, "run_id");
  return {
    projectPath: path.resolve(projectPath || "."),
    featureKey: safeFeatureKey,
    runId,
    plan,
    role,
    workflowType: "docs",
    worktreeRoot: resolveWorktreeRoot(projectPath, runId),
    branch: `${EXECUTE_BRANCH_PREFIX}/${safeFeatureKey}/${runId}`,
    allowedFileScopes: asArray(role.allowed_file_scopes),
    verificationCommands: asArray(role.verification_commands),
    actionCap: ACTION_CAP_DEFAULT,
    stopConditions: activeStopConditionIds(plan),
  };
}



function stripPatchPrefix(rawPath) {
  if (!rawPath || rawPath === "/dev/null") return null;
  let value = String(rawPath).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (value.startsWith("a/") || value.startsWith("b/")) {
    return value.slice(2);
  }
  return value;
}

function changedLineCount(patchText) {
  let count = 0;
  for (const line of String(patchText || "").split(/\r?\n/)) {
    if ((line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"))) {
      count++;
    }
  }
  return count;
}

function extractPatchTargets(patchText) {
  const targets = [];
  let current = null;
  for (const line of String(patchText || "").split(/\r?\n/)) {
    const diff = line.match(/^diff --git\s+(\S+)\s+(\S+)$/);
    if (diff) {
      current = {
        oldPath: stripPatchPrefix(diff[1]),
        newPath: stripPatchPrefix(diff[2]),
        isDelete: false,
      };
      targets.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("deleted file mode")) {
      current.isDelete = true;
    } else if (line.startsWith("rename from ")) {
      const oldPath = stripPatchPrefix(line.slice("rename from ".length));
      if (oldPath) current.oldPath = oldPath;
    } else if (line.startsWith("rename to ")) {
      const newPath = stripPatchPrefix(line.slice("rename to ".length));
      if (newPath) current.newPath = newPath;
    } else if (line.startsWith("--- ")) {
      const oldPath = stripPatchPrefix(line.slice(4).split(/\t/)[0]);
      if (oldPath) current.oldPath = oldPath;
    } else if (line.startsWith("+++ ")) {
      const newPath = stripPatchPrefix(line.slice(4).split(/\t/)[0]);
      if (newPath) current.newPath = newPath;
      else current.isDelete = true;
    }
  }
  const unique = new Map();
  for (const target of targets) {
    const key = `${target.oldPath || ""}|${target.newPath || ""}|${target.isDelete ? "D" : "M"}`;
    unique.set(key, target);
  }
  return {
    targets: Array.from(unique.values()),
    file_count: new Set(Array.from(unique.values()).map((target) => target.newPath || target.oldPath).filter(Boolean)).size,
    changed_lines: changedLineCount(patchText),
  };
}

function pathSegments(value) {
  return String(value || "").split(/[\\/]+/).filter(Boolean);
}

function isTraversalOrAbsolute(targetPath) {
  if (!targetPath || path.isAbsolute(targetPath)) return true;
  return pathSegments(targetPath).includes("..");
}

function isSecretPath(targetPath) {
  const normalized = String(targetPath || "").replace(/\\/g, "/");
  return normalized === ".env" ||
    normalized.startsWith(".env.") ||
    normalized.startsWith("secrets/") ||
    normalized.startsWith(".codex/") ||
    normalized.startsWith(".claude/");
}

function isAllowedDocTarget(targetPath) {
  const normalized = String(targetPath || "").replace(/\\/g, "/");
  if (normalized === "README.md" || normalized === "AGENTS.md") return true;
  if (normalized.startsWith("docs/") && normalized.endsWith(".md")) return true;
  if (normalized.startsWith("governance/") && normalized.endsWith(".md")) return true;
  return false;
}

function globToRegex(scope) {
  const escaped = String(scope).replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesScope(targetPath, scope) {
  const normalized = String(targetPath || "").replace(/\\/g, "/");
  const normalizedScope = String(scope || "").replace(/\\/g, "/");
  if (normalizedScope.endsWith("/**")) {
    const prefix = normalizedScope.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (normalizedScope.includes("*")) {
    return globToRegex(normalizedScope).test(normalized);
  }
  return normalized === normalizedScope;
}

function targetInAllowedScopes(targetPath, allowedScopes) {
  return asArray(allowedScopes).some((scope) => matchesScope(targetPath, scope));
}

function stop(stopConditionHit, reason) {
  return { stop_condition_hit: stopConditionHit, reason };
}

function guardPatchTargets(summary, worktreeRoot, allowedScopes) {
  if (!summary || !Array.isArray(summary.targets) || summary.targets.length === 0) {
    return stop("unknown_risk_stop", "patch has no evaluable targets");
  }
  if (summary.file_count > PATCH_MAX_FILES || summary.changed_lines > PATCH_MAX_LINES) {
    return stop("unknown_risk_stop", `patch exceeds ceiling: files=${summary.file_count}, lines=${summary.changed_lines}`);
  }
  const base = path.resolve(worktreeRoot);
  for (const target of summary.targets) {
    const rawTarget = target.newPath || target.oldPath;
    const oldPath = target.oldPath || "";
    const newPath = target.newPath || "";
    // D-2a intentionally keeps rename support blocked. If a future BK enables
    // renames, both source and destination sides must be guarded explicitly.
    if (!target.isDelete && oldPath && newPath && oldPath !== newPath) {
      return stop("destructive_deny", `patch renames are not allowed in Phase D R1: ${oldPath} -> ${newPath}`);
    }
    if (target.isDelete) {
      return stop("destructive_deny", `patch deletes ${rawTarget}`);
    }
    if (isTraversalOrAbsolute(rawTarget)) {
      return stop("scope_lock", `patch target escapes safe path segment: ${rawTarget}`);
    }
    if (isSecretPath(rawTarget)) {
      return stop("secret_block", `patch target touches protected path: ${rawTarget}`);
    }
    const resolved = path.resolve(base, rawTarget);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      return stop("scope_lock", `patch target resolves outside worktree: ${rawTarget}`);
    }
    if (!isAllowedDocTarget(rawTarget)) {
      return stop("unknown_risk_stop", `patch target is not in the Phase D-2a doc-class allowlist: ${rawTarget}`);
    }
    if (!targetInAllowedScopes(rawTarget, allowedScopes)) {
      return stop("scope_lock", `patch target outside allowed_file_scopes: ${rawTarget}`);
    }
  }
  return null;
}

function readPatchSummary(patchFile) {
  const patchText = fs.readFileSync(patchFile, "utf8");
  return extractPatchTargets(patchText);
}

function applyPatch(worktreeRoot, patchFile) {
  const patchPath = path.resolve(patchFile);
  const checked = runGit(["apply", "--check", patchPath], { cwd: worktreeRoot, timeoutMs: COMMAND_TIMEOUT_MS });
  if (checked.exitCode !== 0) {
    throw new ValidationError(`unknown_risk_stop: git apply --check failed: ${checked.stderr || checked.stdout || "no output"}`);
  }
  const applied = runGit(["apply", patchPath], { cwd: worktreeRoot, timeoutMs: COMMAND_TIMEOUT_MS });
  if (applied.exitCode !== 0) {
    throw new ValidationError(`unknown_risk_stop: git apply failed: ${applied.stderr || applied.stdout || "no output"}`);
  }
  return applied;
}

const SHELL_META_RE = /(?:;|&&|\|\||\||`|\$\(|>|<|\n|\r|&)/;

function rejectShellMetacharacters(cmdArgv) {
  for (const token of cmdArgv) {
    if (SHELL_META_RE.test(String(token))) {
      throw new ValidationError(`unknown_risk_stop: shell metacharacter rejected in token "${token}"`);
    }
  }
}

function networkMutationReason(cmdArgv) {
  const head = String(cmdArgv[0] || "");
  const sub = String(cmdArgv[1] || "");
  if (head === "git" && sub === "push") return "git push";
  if (head === "gh") return "gh";
  if (head === "npm" && ["publish", "install", "ci"].includes(sub)) return `npm ${sub}`;
  if (head === "npx") return "npx";
  if (head === "curl" || head === "wget") return head;
  if (head === "pip" && sub === "install") return "pip install";
  if (head === "python3" && sub === "-m" && cmdArgv[2] === "pip" && cmdArgv[3] === "install") return "python3 -m pip install";
  if (head === "yarn" && sub === "add") return "yarn add";
  return null;
}

function runControlledProcess(cmdArgv, opts) {
  const options = opts || {};
  if (!Array.isArray(cmdArgv) || cmdArgv.length === 0) {
    throw new ValidationError("unknown_risk_stop: command argv is empty or invalid");
  }
  const argv = cmdArgv.map((token) => String(token));
  rejectShellMetacharacters(argv);
  const networkMutation = networkMutationReason(argv);
  if (networkMutation) {
    throw new ValidationError(`unknown_risk_stop: network mutation command rejected: ${networkMutation}`);
  }
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    shell: false,
    timeout: options.timeoutMs || COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 8,
    env: options.env || process.env,
  });
  if (result.error) {
    if (result.error.code === "ENOENT" && argv[0] === "python3") {
      // No interpreter fallback in D-2a; Windows parity requires a future CI-backed BK.
      throw new ValidationError("FAIL_EXECUTE_UNSUPPORTED_PLATFORM: python3 is not resolvable on PATH; Phase D R1 is Linux-first.");
    }
    if (result.error.code === "ETIMEDOUT") {
      return { exitCode: 124, stdout: redact(result.stdout || ""), stderr: redact(result.stderr || "command timed out") };
    }
    throw result.error;
  }
  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: redact(result.stdout || ""),
    stderr: redact(result.stderr || ""),
  };
}

// Routes allowed git maintenance/apply subcommands into runControlledProcess;
// this is not the security boundary. The gateway owns network-mutation deny,
// and `git push` is routed on purpose so that deny path is exercised.
function gitArgvRouted(argv) {
  if (argv[0] === "push") return true; // route to gateway so network deny is proven there.
  if (argv[0] === "worktree" && ["add", "remove"].includes(argv[1])) return true;
  if (argv[0] === "branch" && argv[1] === "-D") return true;
  if (argv[0] === "apply") return true;
  return false;
}

function runGit(argv, opts) {
  if (!Array.isArray(argv) || argv.length === 0 || !gitArgvRouted(argv.map(String))) {
    throw new ValidationError("unknown_risk_stop: git subcommand is not allowed in Phase D R1");
  }
  return runControlledProcess(["git", ...argv], opts || {});
}

function sameArgv(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeVerificationCommand(command) {
  const literal = String(command || "").trim();
  if (literal === A1_LITERAL) return [...A1_ARGV];
  if (literal === A2_LITERAL) return [...A2_ARGV];
  return null;
}

function resolveExecutable(name, pathEnv) {
  const paths = String(pathEnv === undefined ? process.env.PATH || "" : pathEnv).split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (_error) {
      // try next PATH entry
    }
  }
  return null;
}

function ensurePython3Resolvable(pathEnv) {
  // Linux-first D-2a contract: python3 must be present. Do not auto-guess
  // python/py/venv fallbacks; missing python3 fails closed.
  if (!resolveExecutable("python3", pathEnv)) {
    throw new ValidationError("FAIL_EXECUTE_UNSUPPORTED_PLATFORM: python3 is not resolvable on PATH; Phase D R1 is Linux-first.");
  }
}

function buildRunAllowlist(roleCommands, opts) {
  const options = opts || {};
  const mapped = [];
  for (const command of asArray(roleCommands)) {
    const argv = normalizeVerificationCommand(command);
    if (argv) mapped.push(argv);
  }
  const unique = [];
  for (const argv of mapped) {
    if (!unique.some((existing) => sameArgv(existing, argv))) {
      unique.push(argv);
    }
  }
  if (unique.length === 0) {
    throw new ValidationError("FAIL_NO_ALLOWED_COMMANDS: no role verification command matches the Phase D R1 docs allowlist.");
  }
  if (unique.some((argv) => argv[0] === "python3")) {
    ensurePython3Resolvable(options.pathEnv);
  }
  return unique;
}

function runAllowedCommand(argv, opts) {
  const isAllowed = sameArgv(argv, A1_ARGV) || sameArgv(argv, A2_ARGV);
  if (!isAllowed) {
    throw new ValidationError("unknown_risk_stop: command is not on the Phase D R1 allowlist");
  }
  return runControlledProcess(argv, opts || {});
}

function createWorktree(projectPath, key, runId) {
  const safeKey = safeSegment(key, "feature_key");
  const safeRunId = safeSegment(runId, "run_id");
  const worktreeRoot = resolveWorktreeRoot(projectPath, safeRunId);
  const branch = `${EXECUTE_BRANCH_PREFIX}/${safeKey}/${safeRunId}`;
  runGit(["worktree", "add", worktreeRoot, "-b", branch, "HEAD"], {
    cwd: path.resolve(projectPath || "."),
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
  return { worktreeRoot, branch };
}

function cleanupWorktree(projectPath, worktreeRoot, branch) {
  const cwd = path.resolve(projectPath || ".");
  try {
    runGit(["worktree", "remove", "--force", worktreeRoot], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
  } catch (_error) {
    // Cleanup must be idempotent; a missing or half-created worktree is handled by rmSync below.
  }
  try {
    runGit(["branch", "-D", branch], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
  } catch (_error) {
    // Branch may not exist if worktree creation failed before branch creation.
  }
  fs.rmSync(worktreeRoot, { recursive: true, force: true });
}

function withAbortCleanup(ctx, fn) {
  let keepForReview = false;
  let created = null;
  try {
    created = createWorktree(ctx.projectPath, ctx.featureKey, ctx.runId);
    const result = fn(created);
    keepForReview = Boolean(result && result.keepForReview);
    return result;
  } finally {
    if (!keepForReview && created) {
      cleanupWorktree(ctx.projectPath, created.worktreeRoot, created.branch);
    }
  }
}


function activeStopConditionIds(plan) {
  const ids = asArray(plan && plan.stop_conditions)
    .map((condition) => {
      if (condition && typeof condition === "object") return condition.id;
      return condition;
    })
    .filter((id) => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : STOP_CONDITION_IDS;
}

function stopConditionActive(ctx, id) {
  return asArray(ctx && ctx.stopConditions).includes(id);
}

function enforceKnownStopCondition(ctx, id, reason) {
  if (!STOP_CONDITION_IDS.includes(id)) {
    return stop("unknown_risk_stop", `unrecognized stop condition: ${id}`);
  }
  if (!stopConditionActive(ctx, id)) {
    return stop("unknown_risk_stop", `${id} is not active in the execution plan`);
  }
  return stop(id, reason);
}

function commandLooksLikeDeploy(argv) {
  const joined = asArray(argv).map((token) => String(token).toLowerCase()).join(" ");
  return /(^|\s)(deploy|release|publish|terraform|kubectl|vercel|flyctl|railway)(\s|$)/.test(joined);
}

function actionNeedsTestEvidence(action) {
  if (!action || typeof action !== "object") return false;
  if (action.requires_test_evidence === true) return true;
  const kind = String(action.kind || action.type || "").toLowerCase();
  return kind === "verification" || kind === "test";
}

function enforcePerActionStopConditions(ctx, action, state) {
  const status = state || {};
  const nextActionCount = Number(status.actionsExecuted || 0) + 1;
  const actionCap = Number(ctx && ctx.actionCap || ACTION_CAP_DEFAULT);
  if (nextActionCount > actionCap) {
    return enforceKnownStopCondition(ctx, "action_count_cap", `action cap exceeded: ${nextActionCount} > ${actionCap}`);
  }
  if (!action || typeof action !== "object") {
    return enforceKnownStopCondition(ctx, "unknown_risk_stop", "action is missing or not evaluable");
  }
  if (commandLooksLikeDeploy(action.argv || action.command)) {
    return enforceKnownStopCondition(ctx, "deploy_confirm", "deployment-shaped command requires controller confirmation");
  }
  if (actionNeedsTestEvidence(action) && action.test_evidence_present !== true) {
    return enforceKnownStopCondition(ctx, "test_evidence_required", "verification action lacks test evidence marker");
  }
  if (Number(status.failedAttempts || 0) >= 3) {
    return enforceKnownStopCondition(ctx, "three_fix_escalation", "three failed attempts reached for the same failure");
  }
  return null;
}

function executeAction(ctx, action, state) {
  const blocked = enforcePerActionStopConditions(ctx, action, state);
  if (blocked) return { blocked };
  if (!Array.isArray(action.argv)) {
    return { blocked: enforceKnownStopCondition(ctx, "unknown_risk_stop", "action argv is missing") };
  }
  const result = runAllowedCommand(action.argv, {
    cwd: action.cwd,
    timeoutMs: action.timeoutMs || COMMAND_TIMEOUT_MS,
    env: action.env,
  });
  return { result };
}


function stopConditionFromError(error) {
  const message = error && error.message ? String(error.message) : String(error || "unknown error");
  for (const id of STOP_CONDITION_IDS) {
    if (message.includes(id)) return id;
  }
  if (message.includes("FAIL_NO_ALLOWED_COMMANDS")) return "unknown_risk_stop";
  if (message.includes("FAIL_EXECUTE_UNSUPPORTED_PLATFORM")) return "unknown_risk_stop";
  return "unknown_risk_stop";
}

function targetPaths(summary) {
  return asArray(summary && summary.targets).map((target) => target.newPath || target.oldPath).filter(Boolean);
}

function evidenceTempDir(projectPath, featureKey) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const base = path.resolve(projectPath || ".", ".sdtk", "agent-team", "tmp", safeFeatureKey);
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function buildExecuteEvidence(ctx, data) {
  const info = data || {};
  const stopConditionHit = info.stop_condition_hit === undefined ? null : info.stop_condition_hit;
  const commandsRun = asArray(info.commands_run);
  const blockers = asArray(info.blockers);
  const filesTouched = asArray(info.files_touched);
  const verificationEvidence = info.verification_evidence ||
    (commandsRun.length > 0 ? commandsRun.map((command) => `${command}: recorded`).join("; ") : "no verification commands were run");
  return {
    schema_version: EXECUTE_EVIDENCE_SCHEMA,
    feature_key: ctx.featureKey,
    role: String(ctx.role.role || "dev").toLowerCase(),
    run_id: ctx.runId,
    submitted_at: new Date().toISOString(),
    summary: info.summary || (stopConditionHit ? `Execution stopped: ${stopConditionHit}` : "Bounded docs-only execute completed."),
    commands_run: commandsRun,
    verification_evidence: verificationEvidence,
    blockers,
    stop_condition_hit: stopConditionHit,
    files_touched: filesTouched,
    evidence: {
      code_diff: info.code_diff || `Applied supplied patch to worktree ${ctx.worktreeRoot}.`,
      test_evidence: verificationEvidence,
    },
  };
}

function writeAndSubmitExecuteEvidence(ctx, evidenceJson) {
  const dir = evidenceTempDir(ctx.projectPath, ctx.featureKey);
  const evidencePath = path.join(dir, `${ctx.runId}-${String(ctx.role.role || "dev").toLowerCase()}-execute.json`);
  fs.writeFileSync(evidencePath, JSON.stringify(evidenceJson, null, 2), "utf8");
  try {
    return submitEvidence(ctx.projectPath, ctx.featureKey, String(ctx.role.role || "dev").toLowerCase(), evidencePath);
  } finally {
    fs.rmSync(evidencePath, { force: true });
  }
}

function writeReadinessAndReport(ctx) {
  const readiness = computeReadiness(ctx.projectPath, ctx.featureKey);
  const readinessPath = writeReadiness(ctx.projectPath, ctx.featureKey, readiness);
  const built = buildMorningReport(ctx.projectPath, ctx.featureKey);
  const reportPath = writeReport(ctx.projectPath, ctx.featureKey, built.markdown);
  return { readiness, readinessPath, reportPath };
}

function commandLiteral(argv) {
  return asArray(argv).map((token) => String(token)).join(" ");
}

function runVerificationCommands(ctx, allowlist) {
  const commandResults = [];
  let actionsExecuted = 0;
  for (const argv of allowlist) {
    const action = {
      kind: "verification",
      argv,
      cwd: ctx.worktreeRoot,
      timeoutMs: COMMAND_TIMEOUT_MS,
      test_evidence_present: true,
    };
    const executed = executeAction(ctx, action, { actionsExecuted });
    if (executed.blocked) {
      return { stop: executed.blocked, commandResults, actionsExecuted };
    }
    actionsExecuted += 1;
    const result = executed.result;
    commandResults.push({ argv, result });
    if (!result || result.exitCode !== 0) {
      return {
        stop: stop("unknown_risk_stop", `${commandLiteral(argv)} failed with exit ${result ? result.exitCode : "unknown"}`),
        commandResults,
        actionsExecuted,
      };
    }
  }
  return { stop: null, commandResults, actionsExecuted };
}

function dryRunExecute(projectPath, featureKey, opts) {
  const options = opts || {};
  const ctx = loadExecuteContext(projectPath, featureKey);
  const patchSummary = readPatchSummary(options.patchFile);
  const patchStop = guardPatchTargets(patchSummary, ctx.worktreeRoot, ctx.allowedFileScopes);
  const allowlist = buildRunAllowlist(ctx.verificationCommands, options);
  const stdout = renderDryRunPlan(ctx, patchSummary, allowlist) +
    (patchStop ? `\n  would_stop:    ${patchStop.stop_condition_hit} — ${patchStop.reason}` : "");
  return {
    exitCode: 0,
    status: patchStop ? "WOULD_STOP" : "PLANNED",
    feature_key: ctx.featureKey,
    run_id: ctx.runId,
    execution_mode: "dry-run",
    workflow_type: ctx.workflowType,
    worktree_path: ctx.worktreeRoot,
    branch: ctx.branch,
    actions_executed: 0,
    stop_condition_hit: patchStop ? patchStop.stop_condition_hit : null,
    stdout,
    cleanup_command: plannedCleanupCommand(ctx),
  };
}

function executeWithWorktree(projectPath, featureKey, opts) {
  const options = opts || {};
  const ctx = loadExecuteContext(projectPath, featureKey);
  const allowlist = buildRunAllowlist(ctx.verificationCommands, options);
  const patchSummary = readPatchSummary(options.patchFile);
  return withAbortCleanup(ctx, () => {
    let actionsExecuted = 0;
    let stopHit = null;
    let stopReason = null;
    let evidenceResult = null;
    let readinessBundle = null;
    let keepForReview = false;
    let patchApplied = false;

    const patchStop = guardPatchTargets(patchSummary, ctx.worktreeRoot, ctx.allowedFileScopes);
    if (patchStop) {
      stopHit = patchStop.stop_condition_hit;
      stopReason = patchStop.reason;
    } else {
      try {
        applyPatch(ctx.worktreeRoot, options.patchFile);
        patchApplied = true;
        const verification = runVerificationCommands(ctx, allowlist);
        actionsExecuted = verification.actionsExecuted;
        if (verification.stop) {
          stopHit = verification.stop.stop_condition_hit;
          stopReason = verification.stop.reason;
        }
        const commandsRun = verification.commandResults.map((entry) => commandLiteral(entry.argv));
        const evidenceJson = buildExecuteEvidence(ctx, {
          stop_condition_hit: stopHit,
          summary: stopHit ? `Execution stopped: ${stopHit}` : "Applied supplied docs patch and completed allowed verification commands.",
          commands_run: commandsRun,
          verification_evidence: verification.commandResults.map((entry) => `${commandLiteral(entry.argv)} exit=${entry.result.exitCode}`).join("; ") || "no commands run",
          blockers: stopHit ? [stopReason || stopHit] : [],
          files_touched: targetPaths(patchSummary),
          code_diff: `Applied supplied patch to worktree ${ctx.worktreeRoot}.`,
        });
        evidenceResult = writeAndSubmitExecuteEvidence(ctx, evidenceJson);
        readinessBundle = writeReadinessAndReport(ctx);
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
          actions_executed: actionsExecuted,
          stop_condition_hit: stopHit,
          stop_reason: stopReason,
          evidence_path: evidenceResult ? evidenceResult.outputPath : null,
          readiness_path: readinessBundle ? readinessBundle.readinessPath : null,
          readiness_verdict: readinessBundle ? readinessBundle.readiness.overall_verdict : null,
          report_path: readinessBundle ? readinessBundle.reportPath : null,
          cleanup_command: plannedCleanupCommand(ctx),
          stdout: [
            `Agent Team Execute: ${stopHit ? "STOPPED" : "COMPLETED"}`,
            `  feature_key: ${ctx.featureKey}`,
            `  run_id:      ${ctx.runId}`,
            `  worktree:    ${ctx.worktreeRoot}`,
            `  actions:     ${actionsExecuted}`,
            `  stop:        ${stopHit || "none"}`,
            stopHit ? "  cleanup:     completed" : `  cleanup command: ${plannedCleanupCommand(ctx)}`,
          ].join("\n"),
        };
      } catch (error) {
        stopHit = stopConditionFromError(error);
        stopReason = error && error.message ? error.message : String(error || stopHit);
      }
    }

    const evidenceJson = buildExecuteEvidence(ctx, {
      stop_condition_hit: stopHit,
      summary: `Execution stopped: ${stopHit || "unknown_risk_stop"}`,
      commands_run: [],
      verification_evidence: "execution stopped before allowed verification completed",
      blockers: [stopReason || stopHit || "unknown_risk_stop"],
      files_touched: targetPaths(patchSummary),
      code_diff: patchApplied
        ? `Applied supplied patch to worktree ${ctx.worktreeRoot}.`
        : `no patch applied — stopped at ${stopHit || "unknown_risk_stop"}`,
    });
    try {
      evidenceResult = writeAndSubmitExecuteEvidence(ctx, evidenceJson);
      readinessBundle = writeReadinessAndReport(ctx);
    } catch (error) {
      stopHit = stopConditionFromError(error);
      stopReason = error && error.message ? error.message : String(error || stopHit);
    }
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
      actions_executed: actionsExecuted,
      stop_condition_hit: stopHit || "unknown_risk_stop",
      stop_reason: stopReason,
      evidence_path: evidenceResult ? evidenceResult.outputPath : null,
      readiness_path: readinessBundle ? readinessBundle.readinessPath : null,
      readiness_verdict: readinessBundle ? readinessBundle.readiness.overall_verdict : null,
      report_path: readinessBundle ? readinessBundle.reportPath : null,
      cleanup_command: null,
      stdout: [
        "Agent Team Execute: STOPPED",
        `  feature_key: ${ctx.featureKey}`,
        `  run_id:      ${ctx.runId}`,
        `  worktree:    ${ctx.worktreeRoot}`,
        `  actions:     ${actionsExecuted}`,
        `  stop:        ${stopHit || "unknown_risk_stop"}`,
        "  cleanup:     completed",
      ].join("\n"),
    };
  });
}

function runExecute(projectPath, featureKey, opts) {
  const options = opts || {};
  if (!options.patchFile) {
    throw new ValidationError("FAIL_EXECUTE_PATCH_REQUIRED: --patch-file is required for Phase D R1 Flow B.");
  }
  if (options.mode === "execute") {
    return executeWithWorktree(projectPath, featureKey, options);
  }
  return dryRunExecute(projectPath, featureKey, options);
}


async function confirmExecute(input, featureKey, runId) {
  const source = input || {};
  const expected = `EXECUTE ${safeSegment(featureKey, "feature_key")} ${safeSegment(runId, "run_id")}`;
  if (source.isTTY !== true) {
    throw new ValidationError("FAIL_EXECUTE_REQUIRES_TTY: --execute requires an interactive TTY confirmation.");
  }
  if (typeof source.readLine !== "function") {
    throw new ValidationError("FAIL_EXECUTE_REQUIRES_TTY: confirmation reader is not available.");
  }
  const answer = await source.readLine(`Type ${expected} to continue: `);
  if (String(answer || "") !== expected) {
    throw new ValidationError("FAIL_EXECUTE_CONFIRMATION_MISMATCH: exact execute confirmation phrase was not provided.");
  }
  return { confirmed: true, phrase: expected };
}

function plannedCleanupCommand(ctx) {
  return `git worktree remove --force ${ctx.worktreeRoot} && git branch -D ${ctx.branch}`;
}

function renderDryRunPlan(ctx, patchSummary, allowlist) {
  return [
    `Agent Team Execute Plan: ${ctx.featureKey}`,
    `  mode:          dry-run`,
    `  workflow:      ${ctx.workflowType}`,
    `  run_id:        ${ctx.runId}`,
    `  role:          ${ctx.role.role}`,
    `  worktree:      ${ctx.worktreeRoot}`,
    `  branch:        ${ctx.branch}`,
    `  patch_files:   ${patchSummary ? patchSummary.file_count : 0}`,
    `  patch_lines:   ${patchSummary ? patchSummary.changed_lines : 0}`,
    `  allowlist:     ${allowlist.map((argv) => argv.join(" ")).join("; ") || "(none)"}`,
    `  allowed scope: ${ctx.allowedFileScopes.join(", ")}`,
    `  stop:          ${ctx.stopConditions.join(", ")}`,
    `  action cap:    ${ctx.actionCap}`,
    "  dry-run only — no worktree is created, no patch is applied, and no command is run.",
  ].join("\n");
}

module.exports = {
  WORKFLOW_TYPES,
  ACTION_CAP_DEFAULT,
  COMMAND_TIMEOUT_MS,
  PATCH_MAX_FILES,
  PATCH_MAX_LINES,
  EXECUTE_EVIDENCE_SCHEMA,
  A1_LITERAL,
  A2_LITERAL,
  A1_ARGV,
  A2_ARGV,
  ALLOWED_COMMANDS,
  STOP_CONDITION_IDS,
  asArray,
  assertPathUnderBase,
  worktreesBaseDir,
  resolveWorktreeRoot,
  loadExecuteContext,
  plannedCleanupCommand,
  renderDryRunPlan,
  rejectShellMetacharacters,
  networkMutationReason,
  runControlledProcess,
  runGit,
  normalizeVerificationCommand,
  resolveExecutable,
  ensurePython3Resolvable,
  buildRunAllowlist,
  runAllowedCommand,
  stripPatchPrefix,
  changedLineCount,
  extractPatchTargets,
  guardPatchTargets,
  readPatchSummary,
  applyPatch,
  createWorktree,
  cleanupWorktree,
  withAbortCleanup,
  activeStopConditionIds,
  stopConditionActive,
  enforceKnownStopCondition,
  commandLooksLikeDeploy,
  actionNeedsTestEvidence,
  enforcePerActionStopConditions,
  executeAction,
  stopConditionFromError,
  targetPaths,
  buildExecuteEvidence,
  writeAndSubmitExecuteEvidence,
  writeReadinessAndReport,
  commandLiteral,
  runVerificationCommands,
  dryRunExecute,
  executeWithWorktree,
  runExecute,
  confirmExecute,
};
