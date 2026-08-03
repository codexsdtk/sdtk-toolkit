"use strict";

// `sdtk doctor` — CLI wrapper over the fragmentation report (BK-322).
// Exit 0 when the install is healthy, 1 when any warning fired (usable as a
// cheap CI/setup guard). Diagnostic only: never mutates anything.

const { buildDoctorReport, buildConfigHealth, UMBRELLA_PKG } = require("../lib/doctor");
const { collectRepoHealth, renderRepoHealth } = require("../lib/repo-health");

function cmdDoctor(argv) {
  const args = argv || [];
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`sdtk doctor [--repo]

Usage:
  sdtk doctor           install-health check (default)
  sdtk doctor --repo    also report git workspace hygiene

Checks every suite CLI (sdtk-spec|design|code|ops|wiki|agent) for version
fragmentation: which package the PATH binary actually executes, and whether
a different (especially newer) copy of that kit is installed but shadowed —
e.g. the umbrella's bundled copy hiding a newer standalone install, or the
reverse. Pure local filesystem resolution: no network, no npm calls.

--repo additionally reports on the git checkout you are running in: how far
behind origin's default branch you are (loud STALE warning past a threshold),
local branches already merged (safe-to-delete litter), worktrees with
uncommitted changes, and tracked files left uncommitted for over a week.
Report-only and read-only: it never mutates the repo and never changes the
exit code.

Exit codes:
  0  healthy — every CLI serves the newest installed copy
  1  fragmentation or missing CLIs detected (warnings printed)`);
    return 0;
  }

  const withRepo = args.includes("--repo");

  const self = require("../../package.json");
  console.log(`[doctor] ${UMBRELLA_PKG}@${self.version} — install health check`);

  const report = buildDoctorReport({});
  for (const kit of report.kits) {
    if (kit.activeVersion) {
      console.log(`  ${kit.cli.padEnd(12)} ${kit.activeVersion.padEnd(9)} ${kit.activeSource}`);
    } else {
      console.log(`  ${kit.cli.padEnd(12)} ${"-".padEnd(9)} not found on PATH`);
    }
  }

  // BK-344 config health — informational only (a fresh init legitimately
  // starts with placeholders); the strict gate is `sdtk-spec config check`.
  const configHealth = buildConfigHealth(process.cwd());
  if (configHealth.present) {
    if (configHealth.parseError) {
      console.log(`[doctor] NOTE sdtk-spec.config.json is not valid JSON: ${configHealth.parseError}`);
    } else if (configHealth.findings.length > 0) {
      console.log(
        `[doctor] NOTE sdtk-spec.config.json has ${configHealth.findings.length} unfilled placeholder(s) ` +
          `(e.g. ${configHealth.findings[0].path}). Run "sdtk-spec config apply-profile <name>" or fill them, ` +
          `then verify with "sdtk-spec config check".`
      );
    } else {
      console.log("[doctor] config: sdtk-spec.config.json has no unfilled placeholders.");
    }
  }

  // BK-364 repo-health section (report-only: never changes the exit code).
  if (withRepo) {
    console.log("");
    for (const line of renderRepoHealth(collectRepoHealth(process.cwd()))) {
      console.log(line);
    }
  }

  const warnings = report.kits.flatMap((k) => k.warnings);
  if (warnings.length === 0) {
    console.log("[doctor] OK — every suite CLI serves the newest installed copy.");
    return 0;
  }
  console.log("");
  for (const warning of warnings) {
    console.warn(`[doctor] WARN ${warning}`);
  }
  console.warn(`[doctor] ${warnings.length} warning(s). See above for fixes.`);
  return 1;
}

module.exports = { cmdDoctor };
