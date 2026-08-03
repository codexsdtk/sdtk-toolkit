"use strict";

// Unified skills-only runtime orchestrator (pure logic).
//
// BK-314: `sdtk runtime install|uninstall|status --runtime <claude|codex>` fans
// out to each runtime-aware kit's own `runtime` command family (sdtk-spec/ops/
// code shipped it first; sdtk-design gained parity in kit 0.6.0). Unlike
// `sdtk init`, this path touches ONLY skills directories — no kit writes
// managed project files — so it is safe inside repos where full init is
// refused (e.g. the SDTK maintainer root, guarded by sdtk-spec's
// project-target-guard). sdtk-wiki and sdtk-agent install no skills and are
// skipped with an honest summary row.
//
// Reuses the unified-init chassis: same TOOLKITS registry, bin-map resolution,
// fail-fast/--keep-going semantics, exit-code convention (2 bad input, 3 no
// PowerShell, 4 kit unresolvable, else first child failure) and summary
// renderer. All effects go through the injected `deps` seam, so this module
// runs fully offline under test.

const {
  VALID_RUNTIMES,
  TOOLKITS,
  defaultScope,
  renderSummary,
} = require("./unified-init");

const RUNTIME_SUBCOMMANDS = Object.freeze(["install", "uninstall", "status"]);

// Build the forwarded argv for one kit (subcommand-aware, pure).
// install → --force allowed; uninstall → --all allowed; status → neither.
function buildRuntimeArgs(subcommand, opts) {
  const args = ["runtime", subcommand, "--runtime", opts.runtime];
  if (opts.scope) {
    args.push("--scope", opts.scope);
  }
  if (opts.projectPath) {
    args.push("--project-path", opts.projectPath);
  }
  if (subcommand === "install" && opts.force) {
    args.push("--force");
  }
  if (subcommand === "uninstall" && opts.all) {
    args.push("--all");
  }
  if (opts.verbose) {
    args.push("--verbose");
  }
  return args;
}

function normalizeExitCode(res) {
  if (res && typeof res.status === "number") {
    return res.status;
  }
  if (res && typeof res.exitCode === "number") {
    return res.exitCode;
  }
  return 1;
}

// Core orchestrator. `deps` = { spawn, resolveBin, powershellCheck, log } —
// same seam as runUnifiedInit. Returns { exitCode, results }.
function runUnifiedRuntime(subcommand, opts, deps) {
  const spawn = deps.spawn;
  const resolveBin = deps.resolveBin;
  const powershellCheck = deps.powershellCheck;
  const log = deps.log || (() => {});

  // 1. Validated subcommand + --runtime (no spawns on failure). Exit 2.
  if (!RUNTIME_SUBCOMMANDS.includes(subcommand)) {
    log(
      `Error: unknown runtime subcommand '${subcommand || ""}'. ` +
        `Usage: sdtk runtime <${RUNTIME_SUBCOMMANDS.join("|")}> --runtime <${VALID_RUNTIMES.join("|")}>`
    );
    return { exitCode: 2, results: [] };
  }
  if (!opts.runtime || !VALID_RUNTIMES.includes(opts.runtime)) {
    log(`Error: --runtime is required and must be one of: ${VALID_RUNTIMES.join(", ")}.`);
    return { exitCode: 2, results: [] };
  }

  // 2. PowerShell pre-flight, fail-closed, install/uninstall only: those run
  //    the spec/ops/code .ps1 install scripts. status is pure Node in every
  //    kit and must stay usable on a PowerShell-less host. Exit 3.
  if (subcommand !== "status") {
    const ps = powershellCheck();
    if (!ps || !ps.ok) {
      const exe = (ps && ps.exe) || "pwsh";
      log(
        `Error: PowerShell not found (tried: ${exe}). The spec/ops/code runtime ` +
          "asset scripts require PowerShell. Install PowerShell and ensure it is " +
          "on PATH, then retry."
      );
      return { exitCode: 3, results: [] };
    }
  }

  const scopeLabel = opts.scope || defaultScope(opts.runtime);
  log(`SDTK skills-only runtime ${subcommand} — runtime: ${opts.runtime}, scope: ${scopeLabel}`);

  const results = [];
  let firstFailure = 0;
  const runtimeKits = TOOLKITS.filter((t) => t.acceptsRuntime);
  const skippedKits = TOOLKITS.filter((t) => !t.acceptsRuntime);
  const total = runtimeKits.length;

  for (let i = 0; i < total; i += 1) {
    const toolkit = runtimeKits[i];
    const idx = `[${i + 1}/${total}]`;

    let binPath;
    try {
      binPath = resolveBin(toolkit.kitPkg, toolkit.binName);
    } catch (err) {
      const code = typeof err.exitCode === "number" ? err.exitCode : 4;
      results.push({
        name: toolkit.name,
        acceptsRuntime: true,
        status: "FAILED",
        statusLabel: `FAILED (kit '${toolkit.kitPkg}' not found)`,
        exitCode: code,
      });
      log(`  ${idx} ${toolkit.name} … FAILED — kit '${toolkit.kitPkg}' not resolvable`);
      if (!firstFailure) {
        firstFailure = code;
      }
      if (!opts.keepGoing) {
        break;
      }
      continue;
    }

    const argv = buildRuntimeArgs(subcommand, opts);
    const res = spawn(binPath, argv, toolkit);
    const code = normalizeExitCode(res);

    if (code === 0) {
      results.push({ name: toolkit.name, acceptsRuntime: true, status: "OK", exitCode: 0 });
      log(`  ${idx} ${toolkit.name} … OK`);
    } else {
      results.push({
        name: toolkit.name,
        acceptsRuntime: true,
        status: "FAILED",
        statusLabel: `FAILED (exit ${code})`,
        exitCode: code,
      });
      log(`  ${idx} ${toolkit.name} … FAILED (exit ${code})`);
      if (res && res.stderr) {
        log(String(res.stderr).trimEnd());
      }
      if (!firstFailure) {
        firstFailure = code;
      }
      if (!opts.keepGoing) {
        break;
      }
    }
  }

  for (const toolkit of skippedKits) {
    results.push({
      name: toolkit.name,
      acceptsRuntime: false,
      status: "SKIPPED",
      statusLabel: "skipped (no skills)",
      exitCode: 0,
    });
  }

  log("");
  log(renderSummary(results, opts, scopeLabel));
  const exitCode = firstFailure || 0;
  if (exitCode === 0) {
    log(`Skills-only runtime ${subcommand} completed for the ${opts.runtime} runtime.`);
    log("No managed project file (AGENTS.md, CLAUDE.md, configs, docs/) was touched.");
    if (subcommand === "install" && opts.runtime === "claude") {
      log("Tip: `sdtk statusline install` adds an optional 3-line Claude Code statusLine (context/rate-limit/cost) — opt-in, not run automatically.");
    }
  }
  return { exitCode, results };
}

module.exports = {
  RUNTIME_SUBCOMMANDS,
  buildRuntimeArgs,
  runUnifiedRuntime,
};
