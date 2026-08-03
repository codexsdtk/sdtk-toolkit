"use strict";

const { parseFlags } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { writeContextPack } = require("../lib/wiki-context-pack");

const CONTEXT_FLAG_DEFS = {
  help: { type: "boolean", alias: "h" },
  topic: { type: "string" },
  budget: { type: "string" },
  "project-path": { type: "string" },
  out: { type: "string" },
};

function parseContextFlags(args) {
  return parseFlags(args || [], CONTEXT_FLAG_DEFS);
}

function printContextHelp() {
  console.log(`SDTK-WIKI Context Pack

Usage:
  sdtk-wiki context --topic launch --budget 4000 --project-path .

Purpose:
  Write a budgeted, source-linked context pack for compact/resume handoff.

Options:
  --topic <topic>         Topic to pack context for (required).
  --budget <n>            Token budget for the pack (default 4000).
  --project-path <path>   Project root. Defaults to the current directory.
  --out <path>            Output file path (defaults under .sdtk/wiki).
  -h, --help              Show this help.

Behavior:
  Local-only. No network, no iii-sdk, no raw prompt dump.`);
  return 0;
}

function parseBudget(value) {
  if (value === undefined) {
    return 4000;
  }
  const budget = Number(value);
  if (!Number.isInteger(budget) || budget <= 0) {
    throw new ValidationError("--budget must be a positive integer.");
  }
  return budget;
}

function cmdContext(args) {
  const { flags } = parseContextFlags(args || []);
  if (flags.help) {
    return printContextHelp();
  }
  if (!flags.topic || !String(flags.topic).trim()) {
    throw new ValidationError("--topic is required.");
  }
  const result = writeContextPack(flags["project-path"], {
    topic: flags.topic,
    budget: parseBudget(flags.budget),
    out: flags.out,
  });
  console.log(
    `Context pack: ${result.selected} items, ${result.pinned} pinned, ${result.tokens}/${result.budget} tokens, ${result.pagedOut} paged out -> ${result.path}`
  );
  return 0;
}

module.exports = {
  cmdContext,
  parseContextFlags,
  printContextHelp,
};
