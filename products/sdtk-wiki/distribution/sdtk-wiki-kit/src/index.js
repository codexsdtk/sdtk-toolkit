"use strict";

const { cmdAtlas } = require("./commands/atlas");
const { cmdKanban } = require("./commands/kanban");
const { cmdHelp } = require("./commands/help");
const { cmdInit } = require("./commands/init");
const { cmdLint } = require("./commands/lint");
const { cmdMaintain, cmdQuery } = require("./commands/operations");
const { cmdContext } = require("./commands/context");
const { cmdSearch } = require("./commands/search");
const { cmdUpdate } = require("./commands/update");
const { cmdMemory } = require("./commands/memory");
const { ValidationError } = require("./lib/errors");

// BK-320 (0.10.0): the second-brain pipeline verbs are REMOVED — they moved
// to the standalone sdtk-brain kit after one deprecated minor (0.8.x/0.9.x
// printed notices per L-8). The names stay recognized so users get a pointer
// and exit 2 instead of "Unknown command".
const REMOVED_PIPELINE_VERBS = {
  ingest: "sdtk-brain ingest <source-root>",
  compile: "sdtk-brain compile --mode safe [--apply]",
  discover: "sdtk-brain discover --plan",
  enrich: "sdtk-brain enrich --source github --mode review",
  wiki: "sdtk-brain (the wiki-level pipeline namespace moved with it)",
};

function removedVerbStub(name) {
  console.error(
    `sdtk-wiki ${name}: removed in 0.10.0 — the personal second-brain pipeline ` +
      `moved to the standalone sdtk-brain kit. Install it with "npm install -g sdtk-brain-kit" ` +
      `and use "${REMOVED_PIPELINE_VERBS[name]}". ` +
      "Your project docs are indexed by \"sdtk-wiki init\" / \"sdtk-wiki atlas build\" " +
      "and queried with search/query/ask. No project files were changed."
  );
  return 2;
}

function getVersion() {
  const pkg = require("../package.json");
  return pkg.version;
}

function parseCommand(argv) {
  if (!argv || argv.length === 0) {
    return { command: "help", args: [] };
  }

  const [first, ...rest] = argv;
  if (first === "-h" || first === "--help") {
    return { command: "help", args: [] };
  }
  if (first === "-v" || first === "--version") {
    return { command: "version", args: [] };
  }

  return { command: first, args: rest };
}

const COMMANDS = new Set([
  "help",
  "version",
  "init",
  "atlas",
  "wiki",
  "kanban",
  "lint",
  "search",
  "ingest",
  "compile",
  "query",
  "discover",
  "maintain",
  "enrich",
  "context",
  "update",
  "memory",
]);

async function run(argv) {
  const { command, args } = parseCommand(argv);

  if (!COMMANDS.has(command)) {
    throw new ValidationError(
      `Unknown command: "${command}". Run "sdtk-wiki --help" for available commands.`
    );
  }

  switch (command) {
    case "help":
      return cmdHelp();
    case "version":
      console.log(`sdtk-wiki-kit ${getVersion()}`);
      return 0;
    case "init":
      return cmdInit(args);
    case "atlas":
      return cmdAtlas(args);
    case "wiki":
      return removedVerbStub("wiki");
    case "kanban":
      return cmdKanban(args);
    case "lint":
      return cmdLint(args);
    case "search":
      return cmdSearch(args);
    case "ingest":
      return removedVerbStub("ingest");
    case "compile":
      return removedVerbStub("compile");
    case "query":
      return cmdQuery(args);
    case "discover":
      return removedVerbStub("discover");
    case "maintain":
      return cmdMaintain(args);
    case "enrich":
      return removedVerbStub("enrich");
    case "context":
      return cmdContext(args);
    case "update":
      return cmdUpdate(args);
    case "memory":
      return cmdMemory(args);
  }
}

module.exports = {
  parseCommand,
  run,
};

