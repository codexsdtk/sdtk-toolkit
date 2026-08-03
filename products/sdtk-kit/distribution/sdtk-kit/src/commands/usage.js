"use strict";

// `sdtk usage` — CLI wrapper over the Claude/Codex token-usage aggregator
// (BK-371). Wires the real fs/os.homedir/Date.now into the pure lib and
// prints. Meter, not a gate: always exits 0 (R5 lock in
// .sdtk/handoff/BK-371/03-plan-review.md), even when the malformed-lines
// warning fires.

const { aggregateUsage, renderTable } = require("../lib/usage");

const HELP_TEXT = `sdtk usage [--dir <path>]... [--json]

Token usage meter across Claude Code and Codex CLI accounts on this machine.

Scans account directories under $HOME (the default ".claude"/".codex" dirs
and any "-"-suffixed variant, e.g. ".claude-b") for per-message usage data,
and reports token totals per account x model over three rolling windows:
last 5 hours, today (local midnight), and the last 7 days. Codex accounts
also report the most recent rate-limit snapshot (used %, window, reset time).

Read-only: only ever opens files under <account-dir>/projects/**/*.jsonl
(Claude) or <account-dir>/sessions/**/*.jsonl (Codex). Never opens
credential files (.credentials.json, auth.json, or anything else at the
account root).

Usage:
  sdtk usage                 Table output for every discovered account
  sdtk usage --json          Same data as machine-readable JSON
  sdtk usage --dir <path>    Also probe <path> as an account dir (repeatable)
  sdtk usage --help          Show this help

Exit codes:
  0  always — this is a metering/report tool, not a health gate.`;

function parseArgs(args) {
  const extraDirs = [];
  let json = false;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      help = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--dir") {
      const v = args[i + 1];
      if (v) extraDirs.push(v);
      i += 1;
      continue;
    }
  }
  return { extraDirs, json, help };
}

// `deps` is an optional injection seam ({ now, homedir, fsImpl }) so tests can
// run this command entrypoint offline against a fixture tree with no real
// home directory involved. bin/sdtk.js calls this with deps omitted, which
// falls through to aggregateUsage's own real-fs/real-homedir/real-clock
// defaults.
function cmdUsage(argv, deps = {}) {
  const args = argv || [];
  const { extraDirs, json, help } = parseArgs(args);

  if (help) {
    console.log(HELP_TEXT);
    return 0;
  }

  const result = aggregateUsage({ ...deps, extraDirs });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const line of renderTable(result)) console.log(line);
  }

  return 0;
}

module.exports = { cmdUsage };
