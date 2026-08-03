"use strict";

const { parseFlags } = require("./args");

const BASE_FLAG_DEFS = {
  workspace: { type: "string" },
  "project-path": { type: "string" },
  "output-dir": { type: "string" },
  "scan-root": { type: "string" },
  verbose: { type: "boolean" },
};

const OPEN_FLAG_DEFS = {
  workspace: { type: "string" },
  ...BASE_FLAG_DEFS,
  host: { type: "string" },
  port: { type: "string" },
  "no-open": { type: "boolean" },
  tunnel: { type: "boolean" },
};

const INIT_FLAG_DEFS = {
  ...OPEN_FLAG_DEFS,
  force: { type: "boolean" },
  "no-build": { type: "boolean" },
};

const WATCH_FLAG_DEFS = {
  ...BASE_FLAG_DEFS,
  port: { type: "string" },
  "no-open": { type: "boolean" },
};

const LINT_FLAG_DEFS = {
  "project-path": { type: "string" },
};

function parseWikiFlags(args, defs) {
  const scanRoots = [];
  const filteredArgs = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg === "--scan-root") {
      i++;
      if (i < args.length) {
        scanRoots.push(args[i]);
        i++;
      }
    } else if (arg.startsWith("--scan-root=")) {
      scanRoots.push(arg.slice("--scan-root=".length));
      i++;
    } else {
      filteredArgs.push(arg);
      i++;
    }
  }

  const { flags, positional } = parseFlags(filteredArgs, defs);
  flags["scan-root"] = scanRoots.length > 0 ? scanRoots : undefined;
  return { flags, positional };
}

module.exports = {
  BASE_FLAG_DEFS,
  INIT_FLAG_DEFS,
  LINT_FLAG_DEFS,
  OPEN_FLAG_DEFS,
  WATCH_FLAG_DEFS,
  parseWikiFlags,
};
