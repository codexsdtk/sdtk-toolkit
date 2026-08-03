#!/usr/bin/env node
"use strict";

// BK-376 Tầng 1 — auto-capture session decisions into the wiki memory layer.
//
// Wired as a PreCompact (matcher: manual) hook: when the operator runs
// /compact, this reads the session transcript SINCE THE LAST CAPTURE, asks a
// cheap headless model to extract the durable decisions / new-feature specs /
// product directions, appends them to governance/ai/wiki-memory/PROJECT_MEMORY.md,
// advances the marker, and rebuilds the wiki graph so a new session can read
// the layer and get up to speed.
//
// Hard rule: this must NEVER block or slow compaction into failure. Every
// branch exits 0; any error is logged to the state dir and swallowed. It is a
// side-effect helper, not a gate.
//
// Prototype: repo-local (scripts/wiki/), NOT baked into the published kit —
// the operator evaluates extraction quality before it is productized.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Conventioned, committed memory-file location for a repo using the kit
// (BK-378 W2). The marker + log stay under the gitignored .sdtk/wiki-memory/.
const MEMORY_REL = path.join(".sdtk", "wiki", "PROJECT_MEMORY.md");
const STATE_REL = path.join(".sdtk", "wiki-memory", "capture-state.json");
const LOG_REL = path.join(".sdtk", "wiki-memory", "capture.log");
const DIGEST_CAP = 40000; // bytes of conversation text fed to the extractor (tail kept)

// --- pure helpers (unit-tested) -------------------------------------------

// Pull user + assistant TEXT from Claude or Codex transcript JSONL, dropping
// tool noise, for messages strictly after `sinceMs`. Returns
// { text, latestMs, totalLines, parsedLines, newTsLines, roleMatchedLines }
// where text is capped to the last `capBytes`. The count fields exist purely
// for diagnostic logging on the "no new conversation" branch — they add no
// behavior, just visibility into where a real transcript stopped matching.
function extractConversation(jsonlText, sinceMs, capBytes = DIGEST_CAP) {
  const parts = [];
  let latestMs = sinceMs;
  let totalLines = 0;
  let parsedLines = 0;
  let newTsLines = 0;
  let roleMatchedLines = 0;
  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    totalLines++;
    let d;
    try {
      d = JSON.parse(line);
    } catch (_) {
      continue;
    }
    parsedLines++;
    const ts = Date.parse(d.timestamp);
    if (!Number.isFinite(ts) || ts <= sinceMs) continue;
    newTsLines++;
    if (ts > latestMs) latestMs = ts;
    // Claude stores {type, message.content}; Codex rollout JSONL stores
    // {type:"response_item", payload:{type:"message", role, content}}.
    // Only consume response_item messages on Codex: event_msg mirrors would
    // otherwise duplicate the same user/assistant text.
    const isCodexMessage =
      d.type === "response_item" && d.payload && d.payload.type === "message";
    const role = isCodexMessage ? d.payload.role : d.type;
    if (role !== "user" && role !== "assistant") continue;
    roleMatchedLines++;
    const content = isCodexMessage
      ? d.payload.content
      : d.message && d.message.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter(
          (b) =>
            b &&
            ["text", "input_text", "output_text"].includes(b.type) &&
            typeof b.text === "string",
        )
        .map((b) => b.text)
        .join("\n");
    }
    text = text.trim();
    if (text) parts.push(`### ${role}\n${text}`);
  }
  let joined = parts.join("\n\n");
  if (joined.length > capBytes) joined = joined.slice(joined.length - capBytes);
  return { text: joined, latestMs, totalLines, parsedLines, newTsLines, roleMatchedLines };
}

function readState(stateFile, fsImpl = fs) {
  try {
    const d = JSON.parse(fsImpl.readFileSync(stateFile, "utf8"));
    return { lastCaptureMs: Number(d.lastCaptureMs) || 0 };
  } catch (_) {
    return { lastCaptureMs: 0 };
  }
}

function writeState(stateFile, lastCaptureMs, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(stateFile), { recursive: true });
  fsImpl.writeFileSync(stateFile, JSON.stringify({ lastCaptureMs }, null, 2) + "\n");
}

// Append a dated capture section below the marker line, preserving the file.
function appendCapture(memoryFile, extractedMd, nowIso, fsImpl = fs) {
  const body = fsImpl.readFileSync(memoryFile, "utf8");
  const section = `\n### ${nowIso} (auto-captured)\n\n${extractedMd.trim()}\n`;
  fsImpl.writeFileSync(memoryFile, body.replace(/\s*$/, "\n") + section);
}

// --- side-effecting driver -------------------------------------------------

function log(cwd, msg) {
  try {
    const f = path.join(cwd, LOG_REL);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`);
  } catch (_) {
    /* logging must never throw */
  }
}

function findProjectRoot(startDir) {
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(current, MEMORY_REL))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir || process.cwd());
    current = parent;
  }
}

function runExtractor(command, args, prompt, cwd) {
  return spawnSync(command, args, {
    input: prompt,
    cwd,
    encoding: "utf8",
    timeout: Number(process.env.CAPTURE_EXTRACTOR_TIMEOUT_MS) || 45000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function extractWithModel(digest, cwd) {
  const prompt = [
    "You are extracting a project decision-log entry from a coding session transcript excerpt.",
    "Output ONLY markdown bullet points capturing DURABLE items a future session must know:",
    "important decisions made, new/changed features and their specs, product-direction changes,",
    "and any hard constraints established. Skip process noise, tool mechanics, and transient chatter.",
    "Be concise (aim for 3-10 bullets). If nothing durable was decided, output exactly: NONE",
    "",
    "--- TRANSCRIPT EXCERPT (since last capture) ---",
    digest,
  ].join("\n");
  const claudeBin = process.env.CAPTURE_CLAUDE_BIN || "claude";
  const claude = runExtractor(
    claudeBin,
    ["-p", "--model", "sonnet", "--output-format", "json"],
    prompt,
    cwd,
  );
  if (!claude.error || claude.error.code !== "ENOENT") {
    if (claude.status !== 0 || claude.error) {
      return { ok: false, reason: `claude -p exit ${claude.status} ${claude.error || ""}` };
    }
    try {
      const d = JSON.parse(claude.stdout || "{}");
      if (d.is_error) return { ok: false, reason: "claude -p reported is_error" };
      return { ok: true, text: String(d.result || "").trim(), extractor: "claude -p" };
    } catch (_) {
      return { ok: false, reason: "claude -p output not JSON" };
    }
  }

  const codexBin = process.env.CAPTURE_CODEX_BIN || "codex";
  const codex = runExtractor(
    codexBin,
    [
      "--disable",
      "hooks",
      "-a",
      "never",
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "-",
    ],
    prompt,
    cwd,
  );
  if (codex.status !== 0 || codex.error) {
    return {
      ok: false,
      reason: `no extractor: claude unavailable; codex exec exit ${codex.status} ${codex.error || ""}`,
    };
  }
  const text = String(codex.stdout || "").trim();
  return text
    ? { ok: true, text, extractor: "codex exec" }
    : { ok: false, reason: "codex exec returned no final text" };
}

function main() {
  let hookInput = {};
  try {
    hookInput = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (_) {
    hookInput = {};
  }
  const cwd = findProjectRoot(hookInput.cwd || process.cwd());
  // Codex 0.144.1 uses transcript_path, matching Claude. Accept the camelCase
  // alias too so wrappers can pass the same payload without translation.
  const transcriptPath = hookInput.transcript_path || hookInput.transcriptPath;
  const memoryFile = path.join(cwd, MEMORY_REL);
  const stateFile = path.join(cwd, STATE_REL);

  if (!fs.existsSync(memoryFile)) {
    // No memory file → this repo does not use the layer. Skip SILENTLY (no
    // log) and FIRST: a user-level Codex hook fires in every repo, so logging
    // here would create a stray .sdtk/wiki-memory/ directory in unrelated
    // projects. Checked before the transcript so unrelated repos stay clean.
    return 0;
  }
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    log(cwd, "skip: no transcript_path/transcriptPath");
    return 0;
  }

  const { lastCaptureMs } = readState(stateFile);
  let jsonl;
  try {
    jsonl = fs.readFileSync(transcriptPath, "utf8");
  } catch (err) {
    log(cwd, `skip: cannot read transcript (${err && err.code})`);
    return 0;
  }
  const { text, latestMs, totalLines, parsedLines, newTsLines, roleMatchedLines } =
    extractConversation(jsonl, lastCaptureMs);
  if (!text) {
    log(
      cwd,
      `skip: no new conversation since last capture ` +
        `(transcript=${transcriptPath}, bytes=${jsonl.length}, sinceMs=${lastCaptureMs}, ` +
        `stateFile=${stateFile}, totalLines=${totalLines}, parsedLines=${parsedLines}, ` +
        `newTsLines=${newTsLines}, roleMatchedLines=${roleMatchedLines})`,
    );
    return 0;
  }

  const res = extractWithModel(text, cwd);
  if (!res.ok) {
    log(cwd, `skip: extraction failed (${res.reason}) — marker NOT advanced, will retry next compact`);
    return 0;
  }
  if (!res.text || res.text.toUpperCase() === "NONE") {
    writeState(stateFile, latestMs); // nothing durable, but advance so we don't re-scan
    log(cwd, `ok: ${res.extractor || "extractor"} returned NONE, marker advanced`);
    return 0;
  }

  try {
    appendCapture(memoryFile, res.text, new Date().toISOString());
    writeState(stateFile, latestMs);
    log(cwd, `ok: appended capture via ${res.extractor || "extractor"} (${res.text.length} chars), marker advanced`);
  } catch (err) {
    log(cwd, `skip: append failed (${err && err.message})`);
    return 0;
  }

  // The captured decisions live in PROJECT_MEMORY.md — a plain markdown file a
  // new session reads directly, so the core goal needs no graph rebuild. A full
  // `sdtk-wiki atlas build` regenerates ~1600 tracked pages and would dirty the
  // tree on every /compact, so it is OPT-IN via CAPTURE_REBUILD_WIKI=1 (e.g. for
  // browsing the graph/docs view). Default: capture only.
  if (process.env.CAPTURE_REBUILD_WIKI === "1") {
    const build = spawnSync("sdtk-wiki", ["atlas", "build"], { cwd, encoding: "utf8", timeout: 180000 });
    log(cwd, build.status === 0 ? "ok: wiki rebuilt (opt-in)" : `warn: wiki rebuild exit ${build.status} (${build.error || ""})`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    // Last-resort fail-safe: even an unexpected filesystem/runtime exception
    // must never turn PreCompact into a compaction gate.
    try {
      log(findProjectRoot(process.cwd()), `skip: unexpected capture failure (${err && err.message})`);
    } catch (_) {
      /* nothing left to do */
    }
    process.exit(0);
  }
}

module.exports = { extractConversation, readState, writeState, appendCapture, extractWithModel, findProjectRoot, runCapture: main, MEMORY_REL, STATE_REL, LOG_REL };
