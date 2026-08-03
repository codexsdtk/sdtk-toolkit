"use strict";

const { LINT_FLAG_DEFS, parseWikiFlags } = require("../lib/wiki-flags");
const { runWikiLint } = require("../lib/wiki-lint");

function hasHelp(args) {
  return args.includes("-h") || args.includes("--help");
}

function cmdLintHelp() {
  console.log(`Usage:
  sdtk-wiki lint --help
  sdtk-wiki lint [--project-path <path>]

Purpose:
  Run report-first, non-destructive lint checks over canonical .sdtk/wiki content and local source-quality evidence.

Output:
  .sdtk/wiki/reports/lint-report-YYYY-MM-DD.md

Behavior:
  Findings are written to the report and do not auto-modify wiki or source files.
  Source-quality checks report mojibake-like text, missing source URLs, weak titles, duplicate repo/source candidates, low-confidence extraction, and raw/graph/provenance coverage mismatch.
  Local wiki quality metrics report frontmatter coverage, required sections, source refs, internal links, stub ratio, giant pages, density, and source evidence coverage.
  Completed lint runs exit 0 even when findings exist.
  Missing workspace or fatal report-write failures exit non-zero.

Options:
  --project-path <path>   Project root. Defaults to current working directory.`);
  return 0;
}

function cmdLint(args) {
  if (hasHelp(args)) {
    return cmdLintHelp();
  }

  const { flags } = parseWikiFlags(args, LINT_FLAG_DEFS);
  const result = runWikiLint({ projectPath: flags["project-path"] });

  console.log(`[wiki] Lint report: ${result.reportPath}`);
  console.log(`[wiki] Findings: ${result.totalFindings}`);
  console.log("[wiki] No wiki or source content was auto-modified.");
  return 0;
}

module.exports = {
  cmdLint,
  cmdLintHelp,
};
