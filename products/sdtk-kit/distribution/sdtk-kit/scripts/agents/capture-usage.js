#!/usr/bin/env node
"use strict";

// BK-377 — capture a delegated dispatch's usage so a lane's cost is
// reconstructable from files instead of hand-transcribed into chat (the M1
// experiment, BK-371, recorded counter deltas by hand).
//
// A `claude -p --output-format json` (or `codex exec` JSON) result already
// carries a usage/modelUsage block; this pipes that result through unchanged
// (tee) while appending the extracted usage to
// `.sdtk/handoff/<BK>/usage/<stage>.json`. Convention, not a product: it only
// runs when you explicitly put it in a dispatch pipe.
//
// Usage:
//   claude -p "..." --output-format json \
//     | node scripts/agents/capture-usage.js --bk BK-371 --stage S2
//   node scripts/agents/capture-usage.js --bk BK-371 --stage S2 --file result.json

const fs = require("fs");
const path = require("path");

// Pure: normalize whatever a dispatch returned into a small, stable record.
// Tolerant of both the Claude headless shape (modelUsage/usage/total_cost_usd)
// and a plain usage object; never throws on a missing field.
function extractUsage(result) {
  const r = result && typeof result === "object" ? result : {};
  const perModel = r.modelUsage && typeof r.modelUsage === "object" ? r.modelUsage : {};
  const models = Object.keys(perModel).map((name) => {
    const m = perModel[name] || {};
    return {
      model: name,
      inputTokens: num(m.inputTokens),
      outputTokens: num(m.outputTokens),
      cacheReadInputTokens: num(m.cacheReadInputTokens),
      cacheCreationInputTokens: num(m.cacheCreationInputTokens),
      costUSD: num(m.costUSD),
    };
  });
  const u = r.usage && typeof r.usage === "object" ? r.usage : {};
  return {
    capturedAt: new Date().toISOString(),
    isError: Boolean(r.is_error),
    numTurns: num(r.num_turns),
    durationMs: num(r.duration_ms),
    totalCostUSD: num(r.total_cost_usd),
    usage: {
      inputTokens: num(u.input_tokens),
      outputTokens: num(u.output_tokens),
      cacheReadInputTokens: num(u.cache_read_input_tokens),
      cacheCreationInputTokens: num(u.cache_creation_input_tokens),
    },
    models,
    sessionId: typeof r.session_id === "string" ? r.session_id : null,
  };
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// bk/stage become path segments, so they must be single safe segments — no
// separators, no "..". Rejects the `--bk ../.. --stage ../package` traversal
// that could otherwise write outside the handoff tree (Codex review F3).
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function assertSafeSegment(name, value) {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value) || value.includes("..")) {
    throw new Error(`unsafe ${name} "${value}" (expected [A-Za-z0-9._-], no path separators)`);
  }
}

// Append one entry to the stage file (an array — a stage may dispatch more
// than once, e.g. a rework round). Injectable fs for tests. Never destroys
// prior evidence: a pre-existing file that is not a valid usage array is
// preserved to a .corrupt sidecar before a fresh array is written, and the
// write is atomic (temp + rename) so a crash mid-write can't truncate it
// (Codex review F4).
function appendUsage(handoffRoot, bk, stage, entry, fsImpl = fs, now = Date.now()) {
  assertSafeSegment("bk", bk);
  assertSafeSegment("stage", stage);
  const dir = path.join(handoffRoot, bk, "usage");
  fsImpl.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stage}.json`);

  let arr = [];
  let raw = null;
  try {
    raw = fsImpl.readFileSync(file, "utf8");
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err; // real read error → surface, don't clobber
    raw = null; // ENOENT → fresh file, expected
  }
  if (raw !== null) {
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (raw.trim() !== "") {
      // Existing non-array content — preserve the bytes rather than overwrite.
      const backup = path.join(dir, `${stage}.corrupt.${new Date(now).toISOString().replace(/[:.]/g, "-")}.json`);
      fsImpl.writeFileSync(backup, raw);
    }
  }

  arr.push(entry);
  const tmp = path.join(dir, `.${stage}.json.tmp`);
  fsImpl.writeFileSync(tmp, JSON.stringify(arr, null, 2) + "\n");
  fsImpl.renameSync(tmp, file);
  return file;
}

// A dispatch result may be a single JSON document (claude -p --output-format
// json) or JSONL (codex exec streams events, one JSON per line). Parse the
// whole thing; on failure fall back to the last non-empty line that parses —
// for codex that is the final event carrying cumulative token_count.
function parseDispatchResult(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch (_) {
        /* keep scanning upward */
      }
    }
    return undefined;
  }
}

function parseArgs(argv) {
  const o = { bk: null, stage: null, file: null, handoff: ".sdtk/handoff" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bk") o.bk = argv[++i];
    else if (a === "--stage") o.stage = argv[++i];
    else if (a === "--file") o.file = argv[++i];
    else if (a === "--handoff") o.handoff = argv[++i];
  }
  return o;
}

function readInput(o) {
  if (o.file) return fs.readFileSync(o.file, "utf8");
  return fs.readFileSync(0, "utf8"); // stdin
}

function main(argv) {
  const o = parseArgs(argv);
  let raw = "";
  try {
    raw = readInput(o);
  } catch (_) {
    process.stderr.write("capture-usage: no input (pipe a --output-format json result or pass --file)\n");
    return 0; // convention helper — never break the pipe
  }
  // Pass the result through unchanged so this can sit in a pipe (tee).
  process.stdout.write(raw);
  const parsed = parseDispatchResult(raw);
  // Propagate a dispatch-reported failure as a nonzero exit so a pipeline (even
  // without `set -o pipefail`) sees the dispatch failed rather than the tee
  // masking it (Codex review F2). The process-crash case still needs pipefail —
  // documented in the header.
  const exitCode = parsed && parsed.is_error ? 1 : 0;

  if (!o.bk || !o.stage) {
    process.stderr.write("capture-usage: --bk and --stage required to record; result passed through, not captured\n");
    return exitCode;
  }
  if (parsed === undefined) {
    process.stderr.write("capture-usage: input was not JSON/JSONL; result passed through, not captured\n");
    return exitCode;
  }
  try {
    const file = appendUsage(o.handoff, o.bk, o.stage, extractUsage(parsed));
    process.stderr.write(`capture-usage: recorded → ${file}\n`);
  } catch (err) {
    process.stderr.write(`capture-usage: could not record (${(err && err.message) || err}); result passed through\n`);
  }
  return exitCode;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { extractUsage, appendUsage, parseArgs };
