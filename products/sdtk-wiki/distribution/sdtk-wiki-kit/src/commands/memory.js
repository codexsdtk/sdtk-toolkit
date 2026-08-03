"use strict";

// `sdtk-wiki memory` — the wiki-memory onboarding surface (BK-378 W2/W3).
// A new agent/human reads one file (or runs `memory brief`) to get up to speed
// on the latest project changes instead of re-reading every resource.

const fs = require("fs");
const path = require("path");

const {
  runCapture,
  readState,
  MEMORY_REL,
  STATE_REL,
  LOG_REL,
} = require("../lib/capture-decisions");
const {
  RUNTIMES,
  installHook,
  uninstallHook,
  hookInstalled,
} = require("../lib/memory-hooks");
const {
  CLAIMS_BEGIN,
  CLAIMS_END,
  resolveMemoryFile,
  checkClaims,
  applyCorrections,
  checkNames,
} = require("../lib/memory-claims");

const CAPTURE_MARKER =
  "<!-- WIKI-MEMORY-CAPTURE-MARKER: auto-captured decision sections are appended below this line. Do not remove this marker. -->";

function memoryTemplate() {
  return `# Project Memory — living decision layer

**Purpose:** the single "read this first" file. A new session (human or agent)
reads it to get up to speed — structure, latest changes, key decisions — before
starting the next task. Fed incrementally: each manual \`/compact\` appends the
decisions since the previous capture (run \`sdtk-wiki memory install --runtime <claude|codex>\`).

> Auto-appended sections below the marker are machine-extracted and are
> **review-grade, not authoritative** — trim/correct freely; commits and issues
> remain the source of truth.

---

## Standing state (snapshot — update by hand when it drifts)

### Architecture
- _describe the product architecture / main components here._

### Data model
- _key entities / schema decisions._

### API
- _key endpoints / contracts._

### Recent changes
- _newest shipped features / lanes._

### Key decisions
- _durable decisions and the why._

---

## Decision log (newest appended below this marker)

${CAPTURE_MARKER}
`;
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return undefined;
}

function resolveProjectRoot(args) {
  const p = flagValue(args, "--project-path");
  return p ? path.resolve(p) : process.cwd();
}

function memoryHelp() {
  console.log(`Usage:
  sdtk-wiki memory <subcommand> [options]

Subcommands:
  init                     Scaffold the memory file (${MEMORY_REL}) — commit it.
  install --runtime <r>    Wire the PreCompact capture hook for a runtime.
  uninstall --runtime <r>  Remove the capture hook for a runtime.
  status                   Show hook install state per runtime + last capture.
  capture                  Hook entrypoint: extract decisions from the session
                           transcript (read on stdin) and append them. Fail-safe.
  show                     Print the full memory file.
  brief                    Print the "read this first" snapshot (above the marker).
  check [--write] [--json] Verify the standing-state claims against ground truth
                           already in the repo. Offline. Exits 1 on contradiction.

Options:
  --runtime <claude|codex>   Target runtime for install/uninstall.
  --project-path <path>      Project root. Defaults to the current directory.
  --file <path>              Use this memory file instead of the discovered one.
  --write                    (check) Append corrected rows and mark the old ones
                             superseded. Append-only: nothing is ever removed.
  --json                     (check) Machine-readable output.

Claims:
  A claims block (${CLAIMS_BEGIN.slice(4, -3).trim()} … END) holds facts a fresh
  session is told to trust, one per row: key | value | check | as-of | status.
  Checks (${checkNames().join(", ")}) read ground truth from this repo — package
  versions, backlog status, path existence — so no network is needed. The live
  claim for a key is the last row not marked superseded.

Notes:
  The hook fires \`sdtk-wiki memory capture\`, which self-skips when there is no
  memory file, so it is safe to leave installed. Claude wiring is project-local
  (.claude/settings.json); Codex wiring is user-level (~/.codex/hooks.json) and
  git-root-guarded. Hook config is per-machine; the memory file is committed.`);
  return 0;
}

function requireRuntime(args) {
  const runtime = flagValue(args, "--runtime");
  if (!runtime || !RUNTIMES.includes(runtime)) {
    console.error(`[memory] --runtime is required and must be one of: ${RUNTIMES.join(", ")}`);
    return null;
  }
  return runtime;
}

function cmdInit(args) {
  const root = resolveProjectRoot(args);
  const file = path.join(root, MEMORY_REL);
  if (fs.existsSync(file)) {
    console.log(`[memory] already exists: ${MEMORY_REL}`);
    return 0;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, memoryTemplate());
  console.log(`[memory] created: ${MEMORY_REL}`);
  console.log("[memory] commit this file so a fresh clone / new agent has it.");
  console.log("[memory] next: sdtk-wiki memory install --runtime <claude|codex>");
  return 0;
}

function cmdInstall(args) {
  const runtime = requireRuntime(args);
  if (!runtime) return 1;
  const root = resolveProjectRoot(args);
  const res = installHook(runtime, root);
  console.log(`[memory] ${runtime}: ${res.message} (${res.file})`);
  if (runtime === "claude") {
    console.log("[memory] open /hooks once (or restart) so Claude Code reloads the config.");
  }
  if (runtime === "codex") {
    // Codex reads hooks at session start and will not run a hook it has not
    // trusted — a config written by this command needs a fresh session + an
    // explicit trust before it fires. This is the #1 "nothing captured" gotcha.
    console.log("[memory] IMPORTANT — to activate on Codex:");
    console.log("[memory]   1. open a NEW Codex session (it loads ~/.codex/hooks.json at start);");
    console.log("[memory]   2. run /hooks and make sure the PreCompact hook is enabled and TRUSTED");
    console.log("[memory]      (approve it if Codex asks — it will not run an untrusted hook).");
    console.log("[memory] Then /compact will capture. Check: cat .sdtk/wiki-memory/capture.log");
  }
  return 0;
}

function cmdUninstall(args) {
  const runtime = requireRuntime(args);
  if (!runtime) return 1;
  const root = resolveProjectRoot(args);
  const res = uninstallHook(runtime, root);
  console.log(`[memory] ${runtime}: ${res.message} (${res.file})`);
  return 0;
}

function lastCaptureLine(root) {
  const logFile = path.join(root, LOG_REL);
  try {
    const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
    return lines[lines.length - 1] || "(no captures yet)";
  } catch (_) {
    return "(no captures yet)";
  }
}

function cmdStatus(args) {
  const root = resolveProjectRoot(args);
  const found = resolveMemoryFile(root, { override: flagValue(args, "--file") });
  console.log(`[memory] project:      ${root}`);
  // Report the file that is actually there, not the default the kit prefers —
  // status calling an existing file MISSING is how the layout mismatch stayed
  // invisible for as long as it did.
  console.log(
    `[memory] memory file:  ${found.file ? `${found.rel} (present)` : `${MEMORY_REL} (MISSING — run: sdtk-wiki memory init)`}`
  );
  for (const runtime of RUNTIMES) {
    const { installed, file: cfg } = hookInstalled(runtime, root);
    console.log(`[memory] hook ${runtime}:  ${installed ? "installed" : "not installed"} (${cfg})`);
  }
  const state = readState(path.join(root, STATE_REL));
  console.log(`[memory] last marker:  ${state.lastCaptureMs || 0}`);
  console.log(`[memory] last capture: ${lastCaptureLine(root)}`);
  return 0;
}

function cmdCapture() {
  // Delegates to the fail-safe engine; it reads the hook payload on stdin and
  // always returns 0 so a capture never blocks compaction.
  try {
    return runCapture();
  } catch (_) {
    return 0;
  }
}

// Locate the memory file, or explain exactly where we looked. The kit defaults
// to .sdtk/wiki/ but a project may keep the file under governance/ — and when
// the two disagreed, the shipped reader reported "no memory file" for a file
// the shipped capture hook had just written to. Say where we searched instead
// of naming one path the user may not be using.
function locate(args) {
  const root = resolveProjectRoot(args);
  const found = resolveMemoryFile(root, { override: flagValue(args, "--file") });
  if (!found.file) {
    console.error("[memory] no memory file found. Looked in:");
    for (const p of found.searched) console.error(`  - ${path.relative(root, p) || p}`);
    console.error("[memory] run `sdtk-wiki memory init`, or pass --file <path>.");
    return null;
  }
  return { root, ...found };
}

function cmdShow(args) {
  const loc = locate(args);
  if (!loc) return 1;
  process.stdout.write(fs.readFileSync(loc.file, "utf8"));
  return 0;
}

function cmdBrief(args) {
  const loc = locate(args);
  if (!loc) return 1;
  const content = fs.readFileSync(loc.file, "utf8");
  const idx = content.indexOf(CAPTURE_MARKER);
  // The "read this first" snapshot is everything up to the auto-capture marker.
  process.stdout.write(idx >= 0 ? content.slice(0, idx).trimEnd() + "\n" : content);
  return 0;
}

const CLAIMS_TEMPLATE = `## Claims (checkable)

Facts a fresh session is told to trust. \`sdtk-wiki memory check\` verifies each
row against ground truth already in this repo — no network. Rows are
**append-only**: a wrong claim is never edited, it is marked \`superseded\` and a
corrected row is appended below it.

${CLAIMS_BEGIN}
| key | value | check | as-of | status |
|---|---|---|---|---|
${CLAIMS_END}
`;

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function cmdCheck(args) {
  const loc = locate(args);
  if (!loc) return 1;
  const content = fs.readFileSync(loc.file, "utf8");
  const result = checkClaims(content, loc.root);
  const json = args.includes("--json");

  if (!result.present) {
    // Not an error: a memory file without a claims block is simply not using
    // this feature yet. Exiting non-zero here would break every existing repo.
    if (json) {
      console.log(JSON.stringify({ schema: "sdtk.wiki.claims.v1", present: false }, null, 2));
    } else {
      console.log(`[memory] no claims block in ${loc.rel}.`);
      console.log("[memory] add one to start checking standing-state facts:");
      console.log("");
      console.log(CLAIMS_TEMPLATE.split("\n").map((l) => `    ${l}`).join("\n"));
    }
    return 0;
  }

  const write = args.includes("--write");
  let added = [];
  if (write && result.counts.CONTRADICTED > 0) {
    const applied = applyCorrections(content, result);
    if (applied.changed) {
      fs.writeFileSync(loc.file, applied.content);
      added = applied.added;
    }
  }

  if (json) {
    console.log(JSON.stringify({
      schema: "sdtk.wiki.claims.v1",
      file: loc.rel,
      counts: result.counts,
      wrote: added.length,
      results: result.results.map((r) => ({
        key: r.claim.key || null,
        claimed: r.claim.value || null,
        check: r.claim.check || null,
        status: r.status,
        actual: r.actual === undefined ? null : r.actual,
        reason: r.reason || null,
      })),
    }, null, 2));
  } else {
    console.log(`sdtk-wiki memory check — ${loc.rel}`);
    console.log("");
    for (const r of result.results) {
      if (r.status === "SUPERSEDED") continue; // history, not a finding
      const key = r.claim.key || r.claim.raw;
      let line = `  ${pad(r.status, 13)} ${key}`;
      if (r.status === "CONTRADICTED") line += `\n${" ".repeat(17)}claimed ${r.claim.value}  ->  actual ${r.actual}`;
      else if (r.status === "UNCHECKABLE") line += `\n${" ".repeat(17)}${r.reason}`;
      console.log(line);
    }
    const c = result.counts;
    const live = c.CONFIRMED + c.CONTRADICTED;
    console.log("");
    console.log(`  ${c.CONFIRMED} confirmed · ${c.CONTRADICTED} contradicted · `
      + `${c.UNCHECKABLE} uncheckable · ${c.SUPERSEDED} superseded (history)`);
    if (live > 0) {
      console.log(`  contradiction rate: ${(c.CONTRADICTED / live * 100).toFixed(1)}% of checkable claims`);
    }
    if (added.length) {
      console.log("");
      console.log(`  wrote ${added.length} corrected row(s); the old row(s) are now marked superseded:`);
      for (const a of added) console.log(`    ${a.key} -> ${a.value}`);
    } else if (c.CONTRADICTED > 0) {
      console.log("");
      console.log("  run with --write to append corrected rows (nothing is ever overwritten).");
    }
  }

  // Non-zero on contradiction so this is usable as a CI guard, the same posture
  // as `sdtk doctor`. `usage`/`account` are meters and always exit 0; this one
  // reports a defect, so it must be able to fail a pipeline.
  return result.counts.CONTRADICTED > 0 && !write ? 1 : 0;
}

async function cmdMemory(args) {
  const sub = args[0];
  const rest = args.slice(1);
  if (!sub || sub === "-h" || sub === "--help") return memoryHelp();
  switch (sub) {
    case "init":
      return cmdInit(rest);
    case "install":
      return cmdInstall(rest);
    case "uninstall":
      return cmdUninstall(rest);
    case "status":
      return cmdStatus(rest);
    case "capture":
      return cmdCapture();
    case "show":
      return cmdShow(rest);
    case "brief":
      return cmdBrief(rest);
    case "check":
      return cmdCheck(rest);
    default:
      console.error(`[memory] unknown subcommand: "${sub}". Run "sdtk-wiki memory --help".`);
      return 1;
  }
}

module.exports = { cmdMemory, memoryHelp, memoryTemplate, CAPTURE_MARKER };
