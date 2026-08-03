"use strict";

// `sdtk evolve <stage|status|adopt|revert>` command (umbrella, BK-316 PR-B).
// Thin wrapper over the pure state machine in src/lib/evolve.js. Deliberately
// NO run/auto-adopt verbs: the reflect step is the /evolve skill's job, and
// adopt is always an explicit human act.

const path = require("path");
const {
  EDIT_BUDGET,
  LEARNED_LINE_CAP,
  stageDraft,
  latestStaging,
  adoptStaging,
  revertLastAdopt,
  buildStatus,
} = require("../lib/evolve");

const SUBCOMMANDS = ["stage", "status", "adopt", "revert"];

// Same minimal local parser pattern as commands/init.js / commands/runtime.js.
const FLAG_DEFS = Object.freeze({
  from: "string",
  staging: "string",
  "project-path": "string",
});

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    let key = arg.slice(2);
    let value;
    const eq = key.indexOf("=");
    if (eq !== -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    const type = FLAG_DEFS[key];
    if (!type) {
      throw new Error(`Unknown flag: --${key}`);
    }
    if (value === undefined) {
      value = args[i + 1];
      i += 1;
    }
    if (value === undefined) {
      throw new Error(`Flag --${key} requires a value.`);
    }
    flags[key] = value;
  }
  return flags;
}

function fail(errors) {
  for (const e of errors) {
    console.error(`Error: ${e}`);
  }
  return 2;
}

function cmdStage(projectPath, flags) {
  if (!flags.from) {
    console.error("Error: --from <draft.json> is required. The /evolve skill produces the draft (sdtk.evolve-draft.v1).");
    return 2;
  }
  const res = stageDraft(projectPath, path.resolve(flags.from));
  if (!res.ok) {
    return fail(res.errors);
  }
  console.log("Staged proposal (nothing live was modified):");
  console.log(`  Staging: ${res.stagingDir}`);
  console.log(`  Edits:   ${res.edits} (budget ${EDIT_BUDGET})`);
  console.log("");
  console.log("Review proposal.md + report.md, then:");
  console.log("  sdtk evolve adopt     # apply (a backup is taken automatically)");
  console.log("  — or delete the staging folder to discard.");
  return 0;
}

function cmdStatus(projectPath) {
  const st = buildStatus(projectPath);
  console.log("SDTK Evolve — local self-improvement status");
  console.log("");
  console.log(`  LEARNED.md:  ${st.learnedExists ? `${st.learnedLines} lines (cap ${st.lineCap})` : "not created yet (first adopt scaffolds it)"}`);
  console.log(`  Lessons:     ${st.lessons} adopted`);
  for (const l of st.lessonRows) {
    console.log(`    ${l.id}  [${l.lane}]  ${l.signature}  (adopted ${String(l.adopted_at).slice(0, 10)})`);
  }
  console.log(`  Staging:     ${st.latestStaging ? `latest ${st.latestStaging}` : "none"}`);
  console.log(`  Last adopt:  ${st.lastAdoptStaging || "never"}`);
  console.log(`  Git posture: LEARNED.md is ${st.gitPosture} (commit to share with a team; ignore for personal habits)`);
  if (st.checkpointDue) {
    console.log("");
    console.log(`  ⚑ Dogfood checkpoint due: first lesson adopted ≥${st.checkpointDays} days ago —`);
    console.log("    review the recurrence scorecard against BK-316 AC-E1..E3.");
  }
  return 0;
}

function cmdAdopt(projectPath, flags) {
  const stagingDir = flags.staging
    ? path.join(projectPath, ".sdtk", "evolve", "staging", flags.staging)
    : latestStaging(projectPath);
  const res = adoptStaging(projectPath, stagingDir);
  if (!res.ok) {
    return fail(res.errors);
  }
  console.log(`Adopted: ${res.applied} edit(s) applied, ${res.skipped} skipped (duplicates / missing anchors).`);
  console.log(`  LEARNED.md: ${res.learnedPath}`);
  console.log(`  Backup:     ${res.backupDir}`);
  console.log("  Undo with: sdtk evolve revert");
  return 0;
}

function cmdRevert(projectPath) {
  const res = revertLastAdopt(projectPath);
  if (!res.ok) {
    return fail(res.errors);
  }
  console.log(`Reverted the last adopt (restored from ${res.restoredFrom}).`);
  return 0;
}

function cmdEvolve(args) {
  const subcommand = args[0];
  if (!subcommand || subcommand.startsWith("--")) {
    console.error(`Error: missing subcommand. Usage: sdtk evolve <${SUBCOMMANDS.join("|")}> [options]`);
    return 2;
  }
  if (!SUBCOMMANDS.includes(subcommand)) {
    console.error(`Error: unknown subcommand '${subcommand}'. Must be one of: ${SUBCOMMANDS.join(", ")}`);
    return 2;
  }

  let flags;
  try {
    flags = parseFlags(args.slice(1));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 2;
  }

  const projectPath = path.resolve(flags["project-path"] || process.cwd());

  switch (subcommand) {
    case "stage":
      return cmdStage(projectPath, flags);
    case "status":
      return cmdStatus(projectPath);
    case "adopt":
      return cmdAdopt(projectPath, flags);
    default:
      return cmdRevert(projectPath);
  }
}

module.exports = {
  cmdEvolve,
  parseFlags,
  LEARNED_LINE_CAP,
};
