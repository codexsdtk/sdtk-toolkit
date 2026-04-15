"use strict";

const { runProjectIngest } = require("../lib/project-ingest");
const { runProjectAudit } = require("../lib/project-audit");
const { runProjectRefresh } = require("../lib/project-refresh");
const { ValidationError } = require("../lib/errors");

const PROJECT_SUBCOMMANDS = new Set(["ingest", "audit", "refresh"]);

/**
 * Top-level dispatcher for `sdtk-spec project <subcommand>`.
 *
 * Subcommands (BK-083 R1):
 *   ingest   - Build reusable project census and profile foundation (Pro)
 *
 * Subcommands (BK-086 R1):
 *   audit    - Read-only audit report: readiness, gaps, risks, next steps (Pro)
 *
 * Subcommands (BK-085 R1):
 *   refresh  - Incremental managed refresh of .sdtk/project/ artifacts (Pro)
 *
 * @param {string[]} args - Remaining argv after "project"
 * @returns {Promise<number>} CLI exit code
 */
async function cmdProject(args) {
  if (!args || args.length === 0) {
    console.error("[project] Usage: sdtk-spec project <subcommand> [options]");
    console.error("  Premium subcommands: ingest, audit, refresh (requires Pro entitlement)");
    console.error("  Run 'sdtk-spec --help' for full usage.");
    return 1;
  }

  const [subcommand, ...rest] = args;

  if (!PROJECT_SUBCOMMANDS.has(subcommand)) {
    throw new ValidationError(
      `Unknown project subcommand: "${subcommand}". Valid subcommands: ingest, audit, refresh.`
    );
  }

  switch (subcommand) {
    case "ingest":
      return runProjectIngest(rest);
    case "audit":
      return runProjectAudit(rest);
    case "refresh":
      return runProjectRefresh(rest);
  }
}

module.exports = { cmdProject };
