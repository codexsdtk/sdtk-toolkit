"use strict";

// BK-320 (wiki 0.10.0): the personal second-brain pipeline verbs
// (ingest/compile/discover/enrich + the `wiki` namespace) moved to the
// standalone sdtk-brain kit and are REMOVED here — src/index.js keeps exit-2
// pointer stubs for them. This module retains the project-memory verbs that
// stay: `query` (deterministic search) and `maintain` (narrowed to a
// lint-only safe pass; its old discover/compile-preview stages belonged to
// the moved pipeline).

const fs = require("fs");
const { parseFlags } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runWikiLint } = require("../lib/wiki-lint");
const { runWikiSearch } = require("../lib/wiki-search");
const { resolveProjectPath } = require("../lib/wiki-paths");
const { printHumanResult } = require("./search");

const QUERY_FLAG_DEFS = {
  help: { type: "boolean", alias: "h" },
  "project-path": { type: "string" },
  json: { type: "boolean" },
  limit: { type: "string" },
};

const MAINTAIN_FLAG_DEFS = {
  help: { type: "boolean", alias: "h" },
  "project-path": { type: "string" },
  mode: { type: "string" },
};

function ensureProjectPath(projectPath) {
  const resolved = resolveProjectPath(projectPath || process.cwd());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new ValidationError(`--project-path is not a valid directory: ${resolved}`);
  }
  return resolved;
}

function ensureSafeMode(mode, commandName) {
  if (mode !== "safe") {
    throw new ValidationError(
      `sdtk-wiki ${commandName} requires --mode safe in this release. No project files were changed.`
    );
  }
}

function cmdQueryHelp() {
  console.log(`SDTK-WIKI Query

Usage:
  sdtk-wiki query [--project-path <path>] [--json] [--limit <n>] "<query>"

Purpose:
  Deterministically search generated local wiki Markdown pages.

Options:
  --project-path <path>   Project root. Defaults to the current directory.
  --json                  Emit the full result object as JSON.
  --limit <n>             Maximum matches to display (default 10, max 50).
  -h, --help              Show this help.

Behavior:
  Local search only.
  No wiki.ask entitlement, LLM/RAG runtime, query history, or project mutation.
`);
  return 0;
}

function cmdMaintainHelp() {
  console.log(`SDTK-WIKI Maintain

Usage:
  sdtk-wiki maintain --mode safe [--project-path <path>]

Purpose:
  Run the safe wiki health pass: lint findings written as a report.

Options:
  --mode safe             Required. Safe mode is the only mode.
  --project-path <path>   Project root. Defaults to the current directory.
  -h, --help              Show this help.

Note:
  The old discover/compile-preview stages belonged to the second-brain
  pipeline, which moved to the standalone sdtk-brain kit (npm i -g
  sdtk-brain-kit) — use "sdtk-brain maintain" for vaults.

Safety:
  Report-only. No apply, source mutation, web fetch, Ask, query history,
  delete/archive, or atlas compatibility mutation is performed.`);
  return 0;
}

function cmdQuery(args) {
  const { flags, positional } = parseFlags(args || [], QUERY_FLAG_DEFS);
  if (flags.help) return cmdQueryHelp();
  const query = positional.join(" ");
  const result = runWikiSearch({
    projectPath: flags["project-path"],
    query,
    limit: flags.limit,
  });
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("[wiki] Query mode: local deterministic search.");
    printHumanResult(result);
  }
  return 0;
}

function cmdMaintain(args) {
  const { flags } = parseFlags(args || [], MAINTAIN_FLAG_DEFS);
  if (flags.help) return cmdMaintainHelp();
  ensureSafeMode(flags.mode, "maintain");
  const projectPath = ensureProjectPath(flags["project-path"]);

  const lint = runWikiLint({ projectPath });

  console.log("[wiki] Maintain mode: safe (lint-only since 0.10.0)");
  console.log(`[wiki] Lint report: ${lint.reportPath}`);
  console.log("[wiki] The discover/compile-preview stages moved to the standalone sdtk-brain kit.");
  console.log("[wiki] No apply, source mutation, web fetch, Ask, query history, delete/archive, or atlas compatibility mutation was performed.");
  return 0;
}

module.exports = {
  cmdMaintain,
  cmdMaintainHelp,
  cmdQuery,
  cmdQueryHelp,
};
