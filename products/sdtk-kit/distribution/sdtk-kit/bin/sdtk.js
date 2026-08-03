#!/usr/bin/env node
"use strict";

// `sdtk` — unified entry point for the SDTK suite (BK-268).
//
//   sdtk init --runtime <claude|codex>   one-command setup for the toolkits
//   sdtk update [--check-only]           update the toolkit CLIs
//   sdtk --help                          top-level help
//   sdtk --version                       sdtk-kit version + resolved per-kit versions
//   sdtk                                 no args → help
//
// `init` delegates to each toolkit's own shipped init (see src/lib/unified-init.js).
//
// This is the open-source (free edition) entry point. Pro activation and the
// premium runtime are not part of the open-source distribution; see
// https://sdtk.dev for the full suite.

const SUB_KITS = [
  "sdtk-spec-kit",
  "sdtk-ops-kit",
  "sdtk-code-kit",
  "sdtk-wiki-kit",
];

function helpText() {
  return [
    "sdtk — unified SDTK suite CLI (open-source edition)",
    "",
    "Usage:",
    "  sdtk init --runtime <claude|codex> [options]   Initialise the toolkits",
    "  sdtk update [--check-only]                     Update the toolkit CLIs",
    "  sdtk --help                                    Show this help",
    "  sdtk --version                                 Show versions",
    "",
    "init options:",
    "  --runtime <claude|codex>   Required. Runtime for the runtime-aware kits",
    "                             (spec/ops/code place skills under",
    "                             .claude/skills or .codex/skills accordingly).",
    "  --runtime-scope <project|user>  Optional. project = repo-local skills dir;",
    "                             user = global home. Default: claude→project,",
    "                             codex→user (Codex discovers skills via CODEX_HOME).",
    "  --global                   Shorthand for --runtime-scope user (~/.claude or",
    "                             ~/.codex). Applies to both runtimes.",
    "  --project-path <path>      Optional. Target project directory.",
    "  --force                    Re-initialise existing assets.",
    "  --skip-runtime-assets      Skip PowerShell runtime asset install (spec/ops/code).",
    "  --keep-going               Continue past a failing toolkit (default: fail-fast).",
    "  --verbose                  Verbose per-toolkit output.",
    "",
    "update options:",
    "  --check-only               Print the planned npm command without running it.",
    "",
    "Runs: sdtk-spec → sdtk-ops → sdtk-code (all with --runtime) → sdtk-wiki",
    "      (its own non-runtime init; installs no skills).",
    "",
    "Note: for a project-local .codex with codex, pass --runtime-scope project and",
    "launch Codex with CODEX_HOME=<project>/.codex (no native .codex auto-discovery).",
    "",
    "Standalone per-toolkit CLIs remain available: sdtk-spec, sdtk-ops, sdtk-code,",
    "sdtk-wiki.",
    "",
    "The published `sdtk-kit` npm package may bundle additional SDTK toolkits;",
    "this open-source mirror tracks the free suite above.",
    "",
    "Docs: https://sdtk.dev",
  ].join("\n");
}

function versionText() {
  // eslint-disable-next-line global-require
  const self = require("../package.json");
  const lines = [`sdtk-kit ${self.version}`];
  for (const kit of SUB_KITS) {
    let version = "not resolved";
    try {
      // eslint-disable-next-line global-require
      version = require(`${kit}/package.json`).version;
    } catch (err) {
      version = "not resolved";
    }
    lines.push(`  ${kit.padEnd(15)} ${version}`);
  }
  return lines.join("\n");
}

function main(argv) {
  const command = argv[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(helpText());
    return 0;
  }

  if (command === "--version" || command === "-v") {
    console.log(versionText());
    return 0;
  }

  if (command === "init") {
    // eslint-disable-next-line global-require
    const { cmdInit } = require("../src/commands/init");
    return cmdInit(argv.slice(1));
  }

  if (command === "update") {
    // eslint-disable-next-line global-require
    const { cmdUpdate } = require("../src/commands/update");
    return cmdUpdate(argv.slice(1));
  }

  console.error(`sdtk: unknown command '${command}'.`);
  console.error("Run `sdtk --help` for usage.");
  return 2;
}

process.exitCode = main(process.argv.slice(2));
