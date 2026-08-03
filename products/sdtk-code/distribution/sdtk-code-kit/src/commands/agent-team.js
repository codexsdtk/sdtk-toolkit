"use strict";

const path = require("path");
const readline = require("readline");
const { parseFlags, requireFlag, validateChoice } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const {
  assembleAgentTeamPlan,
  writeAgentTeamPlan,
  writeTaskPackets,
  loadAgentTeamPlan,
  projectAgentTeamPreview,
  renderPreviewMarkdown,
  writeAgentTeamPreview,
  gatherPreviewReadiness,
} = require("../lib/agent-team-plan");
const {
  EXPORT_RUNTIMES,
  projectExport,
  writeExportBundle,
} = require("../lib/agent-team-export");
const { submitEvidence } = require("../lib/agent-team-evidence");
const {
  READINESS_NOTE,
  computeReadiness,
  writeReadiness,
} = require("../lib/agent-team-readiness");
const {
  buildMorningReport,
  writeReport,
} = require("../lib/agent-team-report");
const {
  loadExecuteContext,
  runExecute,
  confirmExecute,
} = require("../lib/agent-team-execute");
const { runAuthor } = require("../lib/agent-team-author");
const { runSleepExecute } = require("../lib/agent-team-sleep-execute");
const { appendEvent } = require("../lib/trust-events");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
};

const EXPORT_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  runtime: { type: "string" },
};

const EVIDENCE_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  role: { type: "string" },
  "evidence-file": { type: "string" },
};

const READINESS_REPORT_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
};

const EXECUTE_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  "patch-file": { type: "string" },
  execute: { type: "boolean" },
  "dry-run": { type: "boolean" },
};

const AUTHOR_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  execute: { type: "boolean" },
  "dry-run": { type: "boolean" },
};

const SLEEP_EXECUTE_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  "patch-file": { type: "string" },
  execute: { type: "boolean" },
  "dry-run": { type: "boolean" },
};

function resolveProjectPath(flags) {
  return flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
}

function cmdAgentTeamPlan(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team plan".');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);

  const plan = assembleAgentTeamPlan(projectPath, featureKey);
  const planPath = writeAgentTeamPlan(projectPath, plan);
  const packetPaths = writeTaskPackets(projectPath, plan);

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "agent_team_plan",
    command: `sdtk-code agent-team plan --feature-key ${featureKey}`,
    status: "ok",
    feature_key: featureKey,
    run_id: plan.run_id,
    output_path: planPath,
  });

  console.log(`agent-team plan written: ${planPath}`);
  console.log(`  feature_key:   ${plan.feature_key}`);
  console.log(`  run_id:        ${plan.run_id}`);
  console.log(`  roles:         ${plan.roles.map((role) => role.role).join(", ")}`);
  console.log(`  task packets:  ${packetPaths.length}`);
  console.log(`  stop_conditions: ${plan.stop_conditions.length}`);
  console.log("  preview only — agents are not executed and Sleep execution is not available in this phase.");
  return 0;
}

function cmdAgentTeamPreview(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team preview".');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);

  const plan = loadAgentTeamPlan(projectPath, featureKey);
  if (plan.feature_key !== featureKey) {
    throw new ValidationError(
      `agent-team plan feature_key "${plan.feature_key}" does not match --feature-key "${featureKey}".`
    );
  }

  const readiness = gatherPreviewReadiness(projectPath, featureKey);
  const preview = projectAgentTeamPreview(plan, readiness);
  const markdown = renderPreviewMarkdown(plan, preview);
  const outPath = writeAgentTeamPreview(projectPath, featureKey, markdown);

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "agent_team_preview",
    command: `sdtk-code agent-team preview --feature-key ${featureKey}`,
    status: preview.verdict,
    feature_key: featureKey,
    run_id: plan.run_id,
    output_path: outPath,
  });

  console.log(`Agent Team Preview: ${preview.verdict}`);
  console.log(`  run_id:   ${preview.run_id}`);
  console.log(`  roles:    ${preview.roles.map((role) => role.role).join(", ")}`);
  console.log(`  report:   ${outPath}`);
  console.log("  preview only — agents are not executed and Sleep execution is not available in this phase.");
  return 0;
}

function cmdAgentTeamExport(args) {
  const { flags, positional } = parseFlags(args, EXPORT_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team export".');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const runtime = requireFlag(flags, "runtime", "runtime");
  validateChoice(runtime, EXPORT_RUNTIMES, "runtime");
  const projectPath = resolveProjectPath(flags);

  const plan = loadAgentTeamPlan(projectPath, featureKey);
  if (plan.feature_key !== featureKey) {
    throw new ValidationError(
      `agent-team plan feature_key "${plan.feature_key}" does not match --feature-key "${featureKey}".`
    );
  }

  const exported = projectExport(plan, runtime);
  const written = writeExportBundle(projectPath, exported);

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "agent_team_export",
    command: `sdtk-code agent-team export --feature-key ${featureKey} --runtime ${runtime}`,
    status: "ok",
    feature_key: featureKey,
    run_id: exported.run_id,
    output_path: written[written.length - 1],
  });

  console.log(`agent-team export written (${runtime}): ${path.dirname(written[0])}`);
  console.log(`  feature_key: ${exported.feature_key}`);
  console.log(`  run_id:      ${exported.run_id}`);
  console.log(`  roles:       ${exported.roles.map((role) => role.role).join(", ")}`);
  console.log(`  files:       ${written.length}`);
  console.log("  export/preview only — agents are not executed and Sleep execution is not available in this phase.");
  return 0;
}

function cmdAgentTeamEvidenceSubmit(args) {
  const { flags, positional } = parseFlags(args, EVIDENCE_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team evidence submit".');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const role = requireFlag(flags, "role", "role");
  const evidenceFile = requireFlag(flags, "evidence-file", "evidence-file");
  const projectPath = resolveProjectPath(flags);
  const evidenceFilePath = path.resolve(evidenceFile);

  const result = submitEvidence(projectPath, featureKey, role, evidenceFilePath);

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "agent_team_evidence_submit",
    command: `sdtk-code agent-team evidence submit --feature-key ${featureKey} --role ${result.role}`,
    status: "ok",
    feature_key: featureKey,
    run_id: result.run_id,
    agent_role: result.role,
    stop_condition_hit: result.stop_condition_hit,
    evidence_quality_ok: true,
  });

  console.log(`agent-team evidence written: ${result.outputPath}`);
  console.log(`  feature_key:        ${featureKey}`);
  console.log(`  role:               ${result.role}`);
  console.log(`  run_id:             ${result.run_id}`);
  console.log(`  stop_condition_hit: ${result.stop_condition_hit || "none"}`);
  console.log("  evidence storage only — agents are not executed and no runtime hooks are installed.");
  return 0;
}

function cmdAgentTeamReadiness(args) {
  const { flags, positional } = parseFlags(args, READINESS_REPORT_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team readiness".');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);

  const readiness = computeReadiness(projectPath, featureKey);
  const readinessPath = writeReadiness(projectPath, featureKey, readiness);
  const rolesNotReadyCount = readiness.roles.filter((role) => role.verdict !== "READY").length;

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "agent_team_readiness",
    command: `sdtk-code agent-team readiness --feature-key ${featureKey}`,
    status: readiness.overall_verdict,
    feature_key: featureKey,
    run_id: readiness.run_id,
    overall_verdict: readiness.overall_verdict,
    roles_not_ready_count: rolesNotReadyCount,
  });

  console.log(`Agent Team Readiness: ${readiness.overall_verdict}`);
  console.log(`  run_id:   ${readiness.run_id}`);
  console.log(`  report:   ${readinessPath}`);
  console.log(`  note:     ${READINESS_NOTE}`);
  console.log("  roles:");
  for (const role of readiness.roles) {
    console.log(`    ${role.role}: ${role.verdict}${role.reason ? ` — ${role.reason}` : ""}`);
  }
  return 0;
}

function cmdAgentTeamReport(args) {
  const { flags, positional } = parseFlags(args, READINESS_REPORT_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team report".');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);

  const built = buildMorningReport(projectPath, featureKey);
  const reportPath = writeReport(projectPath, featureKey, built.markdown);

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "agent_team_report",
    command: `sdtk-code agent-team report --feature-key ${featureKey}`,
    status: built.readinessJson.overall_verdict,
    feature_key: featureKey,
    run_id: built.plan.run_id,
    report_path: reportPath,
  });

  console.log(`agent-team report written: ${reportPath}`);
  console.log(`  feature_key: ${built.plan.feature_key}`);
  console.log(`  run_id:      ${built.plan.run_id}`);
  console.log(`  verdict:     ${built.readinessJson.overall_verdict}`);
  console.log(`  note:        ${READINESS_NOTE}`);
  console.log("  report only — no agents are executed and implementation correctness is not verified.");
  return 0;
}


function readLineFromStdin(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function cmdAgentTeamExecute(args) {
  const { flags, positional } = parseFlags(args, EXECUTE_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team execute".');
  }
  if (flags.execute && flags["dry-run"]) {
    throw new ValidationError('Use either --execute or --dry-run, not both.');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const patchFile = requireFlag(flags, "patch-file", "patch-file");
  const projectPath = resolveProjectPath(flags);
  const mode = flags.execute ? "execute" : "dry-run";

  if (mode === "execute") {
    const ctx = loadExecuteContext(projectPath, featureKey);
    await confirmExecute({
      isTTY: process.stdin.isTTY === true,
      readLine: readLineFromStdin,
    }, featureKey, ctx.runId);
  }

  const result = runExecute(projectPath, featureKey, { mode, patchFile });
  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: mode === "execute" ? "agent_team_execute_ran" : "agent_team_execute_planned",
    command: `sdtk-code agent-team execute --feature-key ${featureKey} --patch-file ${patchFile}${mode === "execute" ? " --execute" : ""}`,
    status: result.status,
    feature_key: result.feature_key,
    run_id: result.run_id,
    stop_condition_hit: result.stop_condition_hit,
    worktree_path: result.worktree_path,
    actions_executed: result.actions_executed,
    execution_mode: result.execution_mode,
    workflow_type: result.workflow_type,
  });

  console.log(result.stdout || `Agent Team Execute: ${result.status}`);
  return result.exitCode;
}

async function cmdAgentTeamAuthor(args) {
  const { flags, positional } = parseFlags(args, AUTHOR_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team author".');
  }
  if (flags.execute && flags["dry-run"]) {
    throw new ValidationError('Use either --execute or --dry-run, not both.');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);
  const mode = flags.execute ? "execute" : "dry-run";

  const result = await runAuthor(projectPath, featureKey, {
    mode,
    confirmInput: {
      isTTY: process.stdin.isTTY === true,
      readLine: readLineFromStdin,
    },
  });

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "agent_team_d2b_authored",
    command: `sdtk-code agent-team author --feature-key ${featureKey}${mode === "execute" ? " --execute" : ""}`,
    status: result.status,
    feature_key: result.feature_key,
    run_id: result.run_id,
    stop_condition_hit: result.stop_condition_hit,
    worktree_path: result.worktree_path,
    actions_executed: result.actions_executed,
    execution_mode: result.execution_mode,
    workflow_type: result.workflow_type,
    model_provider: result.model_provider,
    model_id: result.model_id,
    prompt_sha256: result.prompt_sha256,
    context_manifest: result.context_manifest,
    produced_patch_sha256: result.produced_patch_sha256,
    model_call_count: result.model_call_count,
    tokens_used: result.tokens_used,
  });

  console.log(result.stdout || `Agent Team Author: ${result.status}`);
  return result.exitCode;
}

async function cmdAgentTeamSleepExecute(args) {
  const { flags, positional } = parseFlags(args, SLEEP_EXECUTE_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "agent-team sleep-execute".');
  }
  if (flags.execute && flags["dry-run"]) {
    throw new ValidationError('Use either --execute or --dry-run, not both.');
  }
  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);
  const mode = flags.execute ? "execute" : "dry-run";

  const result = await runSleepExecute(projectPath, featureKey, {
    mode,
    patchFile: flags["patch-file"],
    confirmInput: {
      isTTY: process.stdin.isTTY === true,
      readLine: readLineFromStdin,
    },
  });

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: mode === "execute" ? "agent_team_sleep_session" : "agent_team_sleep_planned",
    command: `sdtk-code agent-team sleep-execute --feature-key ${featureKey}${flags["patch-file"] ? ` --patch-file ${flags["patch-file"]}` : ""}${mode === "execute" ? " --execute" : ""}`,
    status: result.status,
    feature_key: result.feature_key,
    run_id: result.run_id,
    session_id: result.session_id,
    readiness_verdict: result.readiness_verdict,
    stop_condition_hit: result.stop_condition_hit,
    worktree_path: result.worktree_path,
    actions_executed: result.actions_executed,
    execution_mode: result.execution_mode,
    workflow_type: result.workflow_type,
    session_cost_usd: result.session_cost_usd,
    session_output_tokens: result.session_output_tokens,
  });

  console.log(result.stdout || `Agent Team Sleep Execute: ${result.status}`);
  return result.exitCode;
}

function cmdAgentTeam(args) {
  if (!args || args.length === 0) {
    throw new ValidationError(
      "Usage: sdtk-code agent-team <subcommand> [flags]\nSubcommands: plan, preview, export, evidence, readiness, report, execute, author, sleep-execute\n(run is not available; execute is bounded docs-only; author is attended D-2b; sleep-execute is attended Phase E Preview.)"
    );
  }

  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "plan":
      return cmdAgentTeamPlan(rest);
    case "preview":
      return cmdAgentTeamPreview(rest);
    case "export":
      return cmdAgentTeamExport(rest);
    case "evidence":
      if (!rest[0] || rest[0] !== "submit") {
        throw new ValidationError('Usage: sdtk-code agent-team evidence submit --feature-key <KEY> --role <pm|dev|qa> --evidence-file <path>');
      }
      return cmdAgentTeamEvidenceSubmit(rest.slice(1));
    case "readiness":
      return cmdAgentTeamReadiness(rest);
    case "report":
      return cmdAgentTeamReport(rest);
    case "execute":
      return cmdAgentTeamExecute(rest);
    case "author":
      return cmdAgentTeamAuthor(rest);
    case "sleep-execute":
      return cmdAgentTeamSleepExecute(rest);
    case "run":
      throw new ValidationError(
        `"agent-team run" is not available in this phase. Supported: plan, preview, export, evidence, readiness, report, execute (bounded docs-only), author (attended D-2b), sleep-execute (attended Phase E Preview).`
      );
    default:
      throw new ValidationError(
        `Unknown agent-team subcommand: "${subcommand}". Available: plan, preview, export, evidence, readiness, report, execute, author, sleep-execute`
      );
  }
}

module.exports = { cmdAgentTeam };
