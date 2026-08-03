"use strict";

const { parseFlags } = require("../lib/args");
const { runWikiSearch } = require("../lib/wiki-search");

const SEARCH_FLAG_DEFS = {
  help: { type: "boolean", alias: "h" },
  "project-path": { type: "string" },
  json: { type: "boolean" },
  limit: { type: "string" },
  all: { type: "boolean" },
};

function parseSearchFlags(args) {
  return parseFlags(args || [], SEARCH_FLAG_DEFS);
}

function printSearchHelp() {
  console.log(`SDTK-WIKI Local Search

Usage:
  sdtk-wiki search --project-path <path> "multi-agent"
  sdtk-wiki search --project-path <path> --json --limit 10 "Claude Code"

Purpose:
  Deterministically search generated local wiki Markdown pages.

Inputs:
  Union of the atlas pages (.sdtk/wiki/pages/**/*.md, built by "sdtk-wiki atlas build")
  and wiki/**/*.md, falling back to .sdtk/wiki/personal-brain/**/*.md for legacy workspaces.
  Duplicate coverage of the same source is de-duplicated; the atlas version wins.
  Each match reports its store (atlas | wiki).

Options:
  --project-path <path>   Project root. Defaults to the current directory.
  --json                  Emit the full result object as JSON.
  --limit <n>             Maximum matches to display (default 10, max 50).
  --all                   Include low-score matches the default view hides.
  -h, --help              Show this help.

Behavior:
  Matches below a relative min-score band are hidden by default (the hidden
  count is reported); pass --all for the exhaustive set. Ranking is unchanged.
  Read-only and non-premium.
  No wiki.ask entitlement is required.
  No LLM, RAG, web search, query history, compile/apply, prune, or project mutation is performed.`);
  return 0;
}

function printHumanResult(result) {
  const lines = [
    `Query: ${result.query}`,
    `Search mode: ${result.searchMode}`,
    `Wiki content: ${result.wikiContentPath}`,
    `Wiki content mode: ${result.wikiContentMode}`,
    `Scanned files: ${result.scannedFiles}`,
    result.suppressedLowScoreMatches > 0
      ? `Matches: ${result.totalMatches} (plus ${result.suppressedLowScoreMatches} low-score hidden; --all to include)`
      : `Matches: ${result.totalMatches}`,
    "",
  ];

  if (result.matches.length === 0) {
    lines.push("No local wiki matches found.");
  } else {
    result.matches.forEach((match, index) => {
      lines.push(`${index + 1}. ${match.path}`);
      lines.push(`   store: ${match.store}`);
      lines.push(`   title: ${match.title}`);
      lines.push(`   score: ${match.score}`);
      lines.push(`   why: ${match.why}`);
      lines.push(`   snippet: ${match.snippet}`);
      lines.push("");
    });
  }

  lines.push("No entitlement, LLM/RAG runtime, query history, or project mutation was used.");
  console.log(lines.join("\n").trimEnd());
}

function cmdSearch(args) {
  const { flags, positional } = parseSearchFlags(args || []);
  if (flags.help) {
    return printSearchHelp();
  }
  const query = positional.join(" ");
  const result = runWikiSearch({
    projectPath: flags["project-path"],
    query,
    limit: flags.limit,
    includeAll: Boolean(flags.all),
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }
  return 0;
}

module.exports = {
  cmdSearch,
  parseSearchFlags,
  printHumanResult,
  printSearchHelp,
};
