"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { parseFlags, requireFlag } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { assembleSleepPlan, writeSleepPlan } = require("../lib/sleep-plan");
const {
  loadSleepPlan,
  gatherReportSignals,
  projectSleepReport,
  renderSleepReportMarkdown,
  writeSleepReport,
} = require("../lib/sleep-report");
const { createSleepAuthorization, authorizationPath } = require("../lib/sleep-authorization");
const {
  checkSleepExecuteCapability,
  loadSleepExecuteHandler,
  SLEEP_EXECUTE_CAPABILITY,
} = require("../lib/code-premium-loader");
const { executeSleepSession } = require("../lib/agent-team-sleep-execute");
const { loadExecuteContext } = require("../lib/agent-team-execute");
const { pinScope } = require("../lib/agent-team-sleep-session");
const { appendEvent } = require("../lib/trust-events");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  "max-actions": { type: "string" },
  "max-iterations": { type: "string" },
  // BK-340 W1: declare file scopes at plan time from the CLI (previously the
  // only path was hand-editing optional CODE_HANDOFF JSON fields).
  "allowed": { type: "string", multiple: true },
  "blocked": { type: "string", multiple: true },
  "scope-file": { type: "string" },
};

const AUTHORIZE_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  "max-iterations": { type: "string" },
  "max-cost-usd": { type: "string" },
  "ttl-hours": { type: "string" },
};

const EXECUTE_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  "session-id": { type: "string" },
};

function readLineFromStdin(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// BK-340 W1: read declared scopes from --allowed/--blocked flags or a JSON
// --scope-file ({"allowed_file_scopes": [...], "blocked_file_scopes": [...]}).
// Returns undefined when neither is used so assembleSleepPlan falls back to
// the CODE_HANDOFF-declared scopes exactly as before.
function resolveScopeFlags(flags) {
  const inlineAllowed = Array.isArray(flags.allowed) ? flags.allowed : [];
  const inlineBlocked = Array.isArray(flags.blocked) ? flags.blocked : [];
  const hasInline = inlineAllowed.length > 0 || inlineBlocked.length > 0;
  const scopeFile = flags["scope-file"];

  if (scopeFile && hasInline) {
    throw new ValidationError(
      "Use either --scope-file or inline --allowed/--blocked flags, not both."
    );
  }
  if (scopeFile) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.resolve(scopeFile), "utf8"));
    } catch (err) {
      throw new ValidationError(`--scope-file could not be read as JSON: ${err.message}`);
    }
    const allowed = Array.isArray(parsed.allowed_file_scopes) ? parsed.allowed_file_scopes : [];
    const blocked = Array.isArray(parsed.blocked_file_scopes) ? parsed.blocked_file_scopes : [];
    if (allowed.length === 0 && blocked.length === 0) {
      throw new ValidationError(
        "--scope-file must declare allowed_file_scopes and/or blocked_file_scopes arrays."
      );
    }
    return { allowed, blocked };
  }
  if (hasInline) {
    return { allowed: inlineAllowed, blocked: inlineBlocked };
  }
  return undefined;
}

function cmdSleepPlan(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError(
      'Unexpected positional arguments. Use flags only for "sleep plan".'
    );
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  const opts = {};
  if (flags["max-actions"] !== undefined) {
    opts.maxActions = flags["max-actions"];
  }
  if (flags["max-iterations"] !== undefined) {
    opts.maxIterations = flags["max-iterations"];
  }
  const scopes = resolveScopeFlags(flags);
  if (scopes !== undefined) {
    opts.scopes = scopes;
  }

  const plan = assembleSleepPlan(projectPath, featureKey, opts);
  const outPath = writeSleepPlan(projectPath, plan);

  appendEvent(projectPath, {
    event_type: "sleep_plan",
    feature_key: featureKey,
    status: "ok",
    output_path: outPath,
    steps_count: plan.ordered_steps.length,
    scope_declared: plan.scope.declared,
    stop_conditions_count: plan.stop_conditions.length,
  });

  console.log(`sleep-plan written: ${outPath}`);
  console.log(`  feature_key:       ${plan.feature_key}`);
  console.log(`  steps:             ${plan.ordered_steps.length}`);
  console.log(`  scope:             ${plan.scope.declared ? "declared" : "undeclared"}`);
  console.log(
    `  budgets:           max_actions=${plan.budgets.max_actions}, max_iterations=${plan.budgets.max_iterations}`
  );
  console.log(`  stop_conditions:   ${plan.stop_conditions.length}`);
  console.log(`  policy_profile:    ${plan.policy_profile}`);
  console.log(`  runtime:           ${plan.runtime}`);
  return 0;
}

function cmdSleepReport(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError(
      'Unexpected positional arguments. Use flags only for "sleep report".'
    );
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  const plan = loadSleepPlan(projectPath);
  if (plan.feature_key !== featureKey) {
    throw new ValidationError(
      `sleep-plan feature_key "${plan.feature_key}" does not match --feature-key "${featureKey}".`
    );
  }

  const signals = gatherReportSignals(projectPath, featureKey);
  const report = projectSleepReport(plan, signals);
  const markdown = renderSleepReportMarkdown(report);
  const outPath = writeSleepReport(projectPath, featureKey, markdown);

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "sleep_report",
    command: `sdtk-code sleep report --feature-key ${featureKey}`,
    status: report.verdict,
    output_path: outPath,
    feature_key: featureKey,
  });

  console.log(`Sleep Readiness: ${report.verdict}`);
  console.log(`  reason:            ${report.reason}`);
  console.log(`  readiness:         ${report.readiness.score}/${report.readiness.max} — ${report.readiness.verdict}`);
  console.log(`  report:            ${outPath}`);
  return 0;
}

// BK-340 — attended authorization step. Requires an active Pro entitlement
// (checked up front for honest UX), a READY_TO_SLEEP plan/report, a pinned
// bounded agent-team scope, and an exact typed TTY confirmation. Writes the
// sha256-bound, TTL'd sleep-authorization artifact that `sleep execute`
// (the Pro pack) validates headlessly.
async function cmdSleepAuthorize(args) {
  const { flags, positional } = parseFlags(args, AUTHORIZE_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError(
      'Unexpected positional arguments. Use flags only for "sleep authorize".'
    );
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  const capabilityCheck = checkSleepExecuteCapability();
  if (!capabilityCheck.ok) {
    throw new ValidationError(capabilityCheck.message);
  }

  const { outPath, authorization } = await createSleepAuthorization(projectPath, featureKey, {
    maxIterations: flags["max-iterations"],
    maxCostUsd: flags["max-cost-usd"],
    ttlHours: flags["ttl-hours"],
    confirmInput: {
      isTTY: process.stdin.isTTY === true,
      readLine: readLineFromStdin,
    },
  });

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "sleep_authorize",
    command: `sdtk-code sleep authorize --feature-key ${featureKey}`,
    status: "ok",
    feature_key: featureKey,
    output_path: outPath,
    expires_at: authorization.expires_at,
    max_iterations: authorization.budgets.max_iterations,
    max_cost_usd: authorization.budgets.max_cost_usd,
    patch_class: authorization.patch_class,
  });

  console.log(`sleep-authorization written: ${outPath}`);
  console.log(`  feature_key:     ${authorization.feature_key}`);
  console.log(`  expires_at:      ${authorization.expires_at}`);
  console.log(`  max_iterations:  ${authorization.budgets.max_iterations}`);
  console.log(`  max_cost_usd:    $${authorization.budgets.max_cost_usd.toFixed(2)}`);
  console.log(`  patch_class:     ${authorization.patch_class}`);
  console.log(`  plan_sha256:     ${authorization.plan_sha256}`);
  console.log("Next: sdtk-code sleep execute --feature-key " + featureKey);
  return 0;
}

// BK-340 — Pro headless execution. The premium loader is the ONLY path to a
// non-TTY sleep session: it verifies the signed entitlement + pack integrity,
// and the pack validates the authorization artifact (expiry, plan/scope
// sha256 binding, budget ceilings) before driving the unchanged Phase E
// engine with a pre-authorized confirm strategy.
async function cmdSleepExecute(args) {
  const { flags, positional } = parseFlags(args, EXECUTE_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError(
      'Unexpected positional arguments. Use flags only for "sleep execute".'
    );
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  const loaded = await loadSleepExecuteHandler();
  if (!loaded.ok) {
    appendEvent(projectPath, {
      toolkit: "sdtk-code",
      event_type: "sleep_execute",
      command: `sdtk-code sleep execute --feature-key ${featureKey}`,
      status: "blocked",
      feature_key: featureKey,
      capability: SLEEP_EXECUTE_CAPABILITY,
      reason: loaded.message,
    });
    console.error(loaded.message);
    return loaded.exitCode;
  }

  const result = await loaded.handler({
    projectPath,
    featureKey,
    options: {
      sessionId: flags["session-id"],
    },
    deps: {
      executeSleepSession,
      loadExecuteContext,
      pinScope,
      authorizationPath,
    },
  });

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "sleep_execute",
    command: `sdtk-code sleep execute --feature-key ${featureKey}`,
    status: result.status,
    feature_key: result.feature_key,
    run_id: result.run_id,
    session_id: result.session_id,
    readiness_verdict: result.readiness_verdict,
    stop_condition_hit: result.stop_condition_hit,
    worktree_path: result.worktree_path,
    actions_executed: result.actions_executed,
    execution_mode: result.execution_mode,
    authorization_expires_at: result.authorization_expires_at,
    session_cost_usd: result.session_cost_usd,
    session_output_tokens: result.session_output_tokens,
  });

  console.log(result.stdout || `Sleep Execute: ${result.status}`);
  return result.exitCode === undefined ? 0 : result.exitCode;
}

function cmdSleep(args) {
  if (!args || args.length === 0) {
    throw new ValidationError(
      'Usage: sdtk-code sleep <subcommand> [flags]\nSubcommands: plan, report, authorize, execute\n' +
      '  plan      Assemble the dry-run sleep plan (free). Declare scope with --allowed/--blocked or --scope-file.\n' +
      '  report    Grade READY_TO_SLEEP / NOT_READY (free, dry-run preflight).\n' +
      '  authorize Attended Pro step: typed TTY confirmation writes a sha256-bound, TTL-limited authorization artifact.\n' +
      '  execute   Pro, entitlement-gated: run the bounded sleep session headlessly against a valid authorization.'
    );
  }

  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "plan":
      return cmdSleepPlan(rest);
    case "report":
      return cmdSleepReport(rest);
    case "authorize":
      return cmdSleepAuthorize(rest);
    case "execute":
      return cmdSleepExecute(rest);
    default:
      throw new ValidationError(
        `Unknown sleep subcommand: "${subcommand}". Available: plan, report, authorize, execute`
      );
  }
}

module.exports = { cmdSleep };
