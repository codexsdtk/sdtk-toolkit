"use strict";

// BK-371 — `sdtk usage` token meter across Claude Code and Codex CLI account
// dirs. Pure aggregator: every I/O dependency (fs, homedir, clock) is
// injectable so tests never touch a real home directory — mirrors the
// injected-`git` pattern in lib/repo-health.js.
//
// UM-OQ-3 (hard boundary): the file walker only ever descends into a
// directory literally named `projects` (Claude) or `sessions` (Codex) at the
// account root, and only ever opens a path matching CLAUDE_JSONL_RE /
// CODEX_JSONL_RE relative to that root. Sibling files at the account root
// (.credentials.json, auth.json, history.jsonl, config.toml, ...) are never
// listed by the walker, let alone read. scripts/usage.test.js proves this
// with a recording fs spy over a fixture tree containing decoy files.

const fs = require("fs");
const os = require("os");
const path = require("path");

const SCHEMA = "sdtk.usage.v1";

// ---------------------------------------------------------------------------
// 1. Path allowlist (UM-OQ-3)
// ---------------------------------------------------------------------------

const CLAUDE_JSONL_RE = /^projects[\\/].+\.jsonl$/;
const CODEX_JSONL_RE = /^sessions[\\/].+\.jsonl$/;

function isAllowedRelPath(vendor, relPath) {
  const posix = relPath.split(path.sep).join("/");
  return vendor === "claude" ? CLAUDE_JSONL_RE.test(posix) : CODEX_JSONL_RE.test(posix);
}

/**
 * Manual recursive walk (not fs.readdirSync(dir, {recursive:true}) — support
 * for that option is inconsistent across the package's declared
 * ">=18.13.0" engines floor, so a hand-rolled walk avoids the version risk
 * for zero new dependencies). Only ever descends into <accountRoot>/projects
 * or <accountRoot>/sessions; nothing else at the account root is listed.
 */
// A lexical allowlist alone is not enough: statSync follows symlinks and
// Windows junctions, so a linked `projects`/`sessions` dir (or any linked
// subdir/file underneath) would let the walk read JSONL outside the account
// root while every relative path still looked legal. Every candidate is
// therefore resolved and required to stay inside the resolved account root.
function isContained(resolvedRoot, candidate, fsImpl) {
  let resolved;
  try {
    resolved = fsImpl.realpathSync(candidate);
  } catch (_) {
    return null;
  }
  const rel = path.relative(resolvedRoot, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

function walkJsonlFiles(accountRoot, vendor, fsImpl) {
  const topName = vendor === "claude" ? "projects" : "sessions";
  const top = path.join(accountRoot, topName);

  let resolvedRoot;
  try {
    resolvedRoot = fsImpl.realpathSync(accountRoot);
  } catch (_) {
    return [];
  }
  if (isContained(resolvedRoot, top, fsImpl) === null) return [];

  let topStat;
  try {
    topStat = fsImpl.lstatSync(top);
  } catch (_) {
    return [];
  }
  if (topStat.isSymbolicLink() || !topStat.isDirectory()) return [];

  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fsImpl.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return; // unreadable dir -> skip, never throw
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue; // never traverse or read a link
      if (isContained(resolvedRoot, full, fsImpl) === null) continue;
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(accountRoot, full);
      if (isAllowedRelPath(vendor, rel)) out.push(full);
    }
  })(top);
  return out;
}

// ---------------------------------------------------------------------------
// 2. Account discovery (UM-OQ-2 + R1 lock)
//
// R1 LOCKED (03-plan-review.md): siblings of $HOME are classified against
// each vendor's default name (".claude" / ".codex"):
//   - exact match or dash-variant (".claude-*")  -> included as a candidate
//   - dot-variant (".claude.*")                  -> EXCLUDED as a candidate,
//     but if it does contain a projects/sessions subdir it is reported in
//     `skippedSiblings` (fail-loud, never silently hidden).
//   - anything else                              -> not a candidate at all
// `--dir` overrides this rule entirely: an explicit --dir is always probed,
// regardless of naming.
// ---------------------------------------------------------------------------

function classifySibling(vendor, name) {
  const base = `.${vendor}`;
  if (name === base) return "default";
  if (name.startsWith(`${base}-`)) return "dash";
  if (name.startsWith(`${base}.`)) return "dot";
  return null;
}

function discoverAccountDirs({ homedir = os.homedir(), fsImpl = fs, extraDirs = [] } = {}) {
  const found = [];
  const skippedSiblings = [];

  for (const vendor of ["claude", "codex"]) {
    const topName = vendor === "claude" ? "projects" : "sessions";
    let siblings;
    try {
      siblings = fsImpl.readdirSync(homedir, { withFileTypes: true });
    } catch (_) {
      siblings = [];
    }
    for (const e of siblings) {
      if (!e.isDirectory()) continue;
      const cls = classifySibling(vendor, e.name);
      if (!cls) continue;
      const full = path.join(homedir, e.name);
      const hasData = fsImpl.existsSync(path.join(full, topName));
      if (cls === "dot") {
        if (hasData) skippedSiblings.push({ vendor, name: e.name });
        continue;
      }
      if (hasData) found.push({ vendor, dir: full, label: e.name });
    }
  }

  for (const dir of extraDirs) {
    for (const vendor of ["claude", "codex"]) {
      const topName = vendor === "claude" ? "projects" : "sessions";
      if (fsImpl.existsSync(path.join(dir, topName))) {
        found.push({ vendor, dir, label: path.basename(dir) });
      }
    }
  }

  // De-dupe by (vendor, realpath) — a --dir override pointing at an
  // already-discovered default dir must not double-count.
  const seen = new Set();
  const accounts = found.filter((a) => {
    let key;
    try {
      key = `${a.vendor}:${fsImpl.realpathSync(a.dir)}`;
    } catch (_) {
      key = `${a.vendor}:${a.dir}`;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { accounts, skippedSiblings };
}

// ---------------------------------------------------------------------------
// 3. Claude line parser
// ---------------------------------------------------------------------------

// `malformed: true` on the ok:false result means the line itself was not
// valid JSON (or not even an object) -- a real parse failure worth counting
// toward the warning summary. `malformed: false` means the JSON was fine but
// the line legitimately doesn't carry usage (a "user" line, a system event,
// an assistant line with no usage block, ...) -- these are the overwhelming
// majority of a real transcript and must NOT inflate the malformed count
// (discovered live: on this box's real ~/.claude data, ~64% of lines are
// ordinary non-assistant lines; counting them as "malformed" produced a
// wildly misleading warning).
function parseClaudeLine(rawLine) {
  let d;
  try {
    d = JSON.parse(rawLine);
  } catch (_) {
    return { ok: false, malformed: true };
  }
  if (!d || typeof d !== "object") return { ok: false, malformed: true };
  if (d.type !== "assistant") return { ok: false, malformed: false };
  const msg = d.message;
  if (!msg || typeof msg !== "object" || !msg.usage) return { ok: false, malformed: false };
  const ts = Date.parse(d.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, malformed: true };
  const u = msg.usage;
  return {
    ok: true,
    model: safeModel(msg.model),
    timestampMs: ts,
    input: safeNumber(u.input_tokens),
    output: safeNumber(u.output_tokens),
    cacheRead: safeNumber(u.cache_read_input_tokens),
    cacheCreate: safeNumber(u.cache_creation_input_tokens),
  };
}

// ---------------------------------------------------------------------------
// 4. Codex session reducer
// ---------------------------------------------------------------------------

function reduceCodexSession(lines) {
  let currentModel = "unknown";
  let latestRateLimits = null; // { ts, primary }
  let prevTotal = null; // previous event's cumulative totals, for delta derivation
  const rows = []; // { model, timestampMs, input, cachedInput, output, reasoningOutput }
  let malformed = 0;

  for (const raw of lines) {
    let d;
    try {
      d = JSON.parse(raw);
    } catch (_) {
      malformed += 1;
      continue;
    }
    if (!d || typeof d !== "object") {
      malformed += 1;
      continue;
    }

    if (d.type === "turn_context" && d.payload && d.payload.model) {
      currentModel = safeModel(d.payload.model);
      continue;
    }

    if (d.type === "event_msg" && d.payload && d.payload.type === "token_count") {
      const info = d.payload.info || {};
      // Contribution = the DELTA of the session-cumulative total_token_usage.
      //
      // Two traps, both found on real data:
      //  - summing total_token_usage itself overcounts (it is cumulative);
      //  - summing last_token_usage ALSO overcounts, because refresh events
      //    repeat the previous turn's delta while the cumulative total stays
      //    put (45,752 such events across 182 real session files). Deltas of
      //    the cumulative field are immune to both.
      // last_token_usage survives only as the fallback when a record carries
      // no total_token_usage at all.
      const total = info.total_token_usage;
      const last = info.last_token_usage || {};
      const ts = Date.parse(d.timestamp);
      let contribution = null;
      if (total && typeof total === "object") {
        const cur = {
          input: safeNumber(total.input_tokens),
          cachedInput: safeNumber(total.cached_input_tokens),
          output: safeNumber(total.output_tokens),
          reasoningOutput: safeNumber(total.reasoning_output_tokens),
        };
        // A cumulative counter that goes DOWN means the session's counter was
        // reset mid-file (resume/compaction — 24 such events across the 182
        // real session files on the authoring box). That starts a new
        // segment, so the whole current value is the contribution; flooring
        // the negative delta at zero instead would silently drop everything
        // the new segment goes on to spend.
        const step = (curVal, prevVal) => (curVal >= prevVal ? curVal - prevVal : curVal);
        contribution = prevTotal
          ? {
              input: step(cur.input, prevTotal.input),
              cachedInput: step(cur.cachedInput, prevTotal.cachedInput),
              output: step(cur.output, prevTotal.output),
              reasoningOutput: step(cur.reasoningOutput, prevTotal.reasoningOutput),
            }
          : cur;
        prevTotal = cur;
      } else {
        contribution = {
          input: safeNumber(last.input_tokens),
          cachedInput: safeNumber(last.cached_input_tokens),
          output: safeNumber(last.output_tokens),
          reasoningOutput: safeNumber(last.reasoning_output_tokens),
        };
      }
      if (Number.isFinite(ts)) {
        rows.push({
          model: currentModel,
          timestampMs: ts,
          input: contribution.input,
          cachedInput: contribution.cachedInput,
          output: contribution.output,
          reasoningOutput: contribution.reasoningOutput,
        });
      }
      const rl = d.payload.rate_limits && d.payload.rate_limits.primary;
      if (rl && Number.isFinite(ts) && (!latestRateLimits || ts > latestRateLimits.ts)) {
        latestRateLimits = { ts, primary: rl };
      }
    }
  }

  return { rows, latestRateLimits, malformed };
}

// ---------------------------------------------------------------------------
// 5. Window bucketing (UM-OQ-4)
// ---------------------------------------------------------------------------

function windowBounds(now) {
  const d = new Date(now);
  const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return {
    last5h: now - 5 * 60 * 60 * 1000,
    today: localMidnight, // LOCAL midnight, not UTC
    last7d: now - 7 * 24 * 60 * 60 * 1000,
  };
}

function emptyWindowAccumulator() {
  return {
    last5h: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    today: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
    last7d: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
  };
}

// Corrupt-but-valid JSON must never poison a total or reach padEnd() as a
// non-string: coerce every numeric field and every model label at the parser
// boundary (AC-3 + the always-exit-0 lock).
function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeModel(value) {
  return typeof value === "string" && value.trim() !== "" ? value : "unknown";
}

function accumulate(byModel, model, timestampMs, bounds, deltas) {
  if (!byModel.has(model)) byModel.set(model, emptyWindowAccumulator());
  const acc = byModel.get(model);
  for (const win of Object.keys(bounds)) {
    if (timestampMs >= bounds[win]) {
      acc[win].input += deltas.input;
      acc[win].output += deltas.output;
      acc[win].cacheRead += deltas.cacheRead;
      acc[win].cacheCreate += deltas.cacheCreate;
    }
  }
}

// Returns the allowlisted file with the greatest mtime, or null. Used only
// by the G2-1 last-known-rate-limit fallback below -- `files` is already the
// output of walkJsonlFiles, so this never opens anything outside the
// allowlist. Stat failures are skipped, not fatal (fail open: worst case the
// fallback finds nothing and rateLimits stays null, same as before the fix).
function findNewestFile(files, fsImpl) {
  let newest = null;
  let newestMtimeMs = -Infinity;
  for (const file of files) {
    let stat;
    try {
      stat = fsImpl.statSync(file);
    } catch (_) {
      continue;
    }
    if (stat.mtimeMs > newestMtimeMs) {
      newestMtimeMs = stat.mtimeMs;
      newest = file;
    }
  }
  return newest;
}

// Session/rollout JSONL files are append-only, so a file's mtime tracks the
// timestamp of its last written line. Discovered live on this box: some real
// Codex rollout files are 200MB-1.4GB and long predate every window (oldest
// found: Dec 2025); readFileSync-ing them in full just to discard every line
// was most of a 72s real-box runtime against the <5s AC-5 target. Skip a
// file's read entirely when its mtime is older than the widest window
// (last7d) -- every line in it is guaranteed to fall outside all three
// windows. Fails open (reads the file) if stat itself fails, since an
// unknown age is not evidence the file is irrelevant.
// Returns the file text, or a sentinel saying why not. Distinguishing
// "deliberately skipped because it predates the window" from "wanted it but
// could not read it" matters: the second case silently under-reports totals
// unless it is surfaced. A real 1.4GB rollout exists on the authoring box, and
// readFileSync throws ERR_STRING_TOO_LONG past ~512MB — such a file inside the
// window must degrade to a loud warning, never a silent hole (and never a
// crash: the always-exit-0 lock). Streaming those files is deferred (F3).
const SKIPPED_OLD = { skipped: "old" };
const UNREADABLE = { skipped: "unreadable" };

function readIfRecentEnough(file, oldestCutoffMs, fsImpl) {
  let stat = null;
  try {
    stat = fsImpl.statSync(file);
  } catch (_) {
    stat = null;
  }
  if (stat && stat.mtimeMs < oldestCutoffMs) return SKIPPED_OLD;
  try {
    return fsImpl.readFileSync(file, "utf8");
  } catch (_) {
    return UNREADABLE;
  }
}

// ---------------------------------------------------------------------------
// 6. Aggregation entry point
// ---------------------------------------------------------------------------

// --- limit events (BK-392) --------------------------------------------------
//
// What is and is NOT available, established by inspecting the real data:
//
//   Codex writes `payload.rate_limits.primary` PROACTIVELY into every session
//   file, which is why `sdtk account status` can report "used 27% (resets X)".
//   Claude writes no such snapshot anywhere on disk. Its transcripts record a
//   limit only AFTER one is hit, as a 429 error line:
//       {"apiErrorStatus":429, message:{content:[{text:"You've hit your
//        session limit · resets 3:50pm (UTC)"}]}}
//
// So a live "5-hour / weekly % used" figure for Claude cannot be produced from
// local files. The only other source is the server (`/api/oauth/usage`), which
// needs the OAuth token — reading it would break the credential-free invariant,
// so it is deliberately not done. What IS honest and useful is the LAST limit
// actually hit per kind, which answers "which account ran into a wall, and
// when" without inventing a headroom number.
//
// Bounded by the same 7-day file window as the token aggregation, so this adds
// no extra filesystem walk and no extra read.

const LIMIT_KINDS = Object.freeze([
  [/session limit/i, "session (5h)"],
  [/weekly limit/i, "weekly"],
  [/monthly spend limit/i, "monthly spend"],
  [/usage credits/i, "usage credits"],
  [/\blimit\b/i, "other"],
]);

// Cheap pre-filter so the common line costs one indexOf, not a parse.
function looksLikeLimitLine(line) {
  return line.indexOf("apiErrorStatus") !== -1 && line.indexOf("429") !== -1;
}

// Returns {kind, at, text} or null. Never throws.
function parseLimitLine(line) {
  let d;
  try {
    d = JSON.parse(line);
  } catch (_) {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  if (d.apiErrorStatus !== 429) return null;
  const content = d.message && d.message.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content.map((c) => (c && typeof c.text === "string" ? c.text : "")).join(" ");
  }
  text = text.trim();
  if (!text) return null;
  let kind = "other";
  for (const [re, name] of LIMIT_KINDS) {
    if (re.test(text)) { kind = name; break; }
  }
  const at = Date.parse(d.timestamp || "");
  return { kind, at: Number.isFinite(at) ? at : null, text: text.slice(0, 160) };
}

// Keep only the newest event per kind.
function recordLimitEvent(map, ev) {
  if (!ev) return;
  const prev = map.get(ev.kind);
  if (!prev || (ev.at || 0) > (prev.at || 0)) map.set(ev.kind, ev);
}

function aggregateUsage({ now = Date.now(), homedir = os.homedir(), fsImpl = fs, extraDirs = [] } = {}) {
  const startedAt = Date.now();
  let unreadableCount = 0;
  const { accounts: discovered, skippedSiblings } = discoverAccountDirs({ homedir, fsImpl, extraDirs });
  const bounds = windowBounds(now);
  const result = {
    schema: SCHEMA,
    accounts: [],
    skippedSiblings,
    warnings: [],
    malformedCount: 0,
    elapsedMs: 0,
  };

  for (const acct of discovered) {
    const files = walkJsonlFiles(acct.dir, acct.vendor, fsImpl);
    const byModel = new Map();
    let acctMalformed = 0;
    let latestRateLimits = null;
    const limitEvents = new Map();

    if (acct.vendor === "claude") {
      for (const file of files) {
        const text = readIfRecentEnough(file, bounds.last7d, fsImpl);
        if (text === UNREADABLE) { unreadableCount += 1; continue; }
        if (typeof text !== "string") continue;
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          if (looksLikeLimitLine(line)) recordLimitEvent(limitEvents, parseLimitLine(line));
          const parsed = parseClaudeLine(line);
          if (!parsed.ok) {
            if (parsed.malformed) acctMalformed += 1;
            continue;
          }
          accumulate(byModel, parsed.model, parsed.timestampMs, bounds, {
            input: parsed.input,
            output: parsed.output,
            cacheRead: parsed.cacheRead,
            cacheCreate: parsed.cacheCreate,
          });
        }
      }
    } else {
      for (const file of files) {
        const text = readIfRecentEnough(file, bounds.last7d, fsImpl);
        if (text === UNREADABLE) { unreadableCount += 1; continue; }
        if (typeof text !== "string") continue;
        const { rows, latestRateLimits: fileRL, malformed } = reduceCodexSession(
          text.split("\n").filter((l) => l.trim())
        );
        acctMalformed += malformed;
        for (const row of rows) {
          accumulate(byModel, row.model, row.timestampMs, bounds, {
            input: row.input,
            output: row.output,
            cacheRead: row.cachedInput,
            cacheCreate: 0, // Codex has no cache-create analogue
          });
        }
        if (fileRL && (!latestRateLimits || fileRL.ts > latestRateLimits.ts)) latestRateLimits = fileRL;
      }

      // G2-1 fix: plan §1.1 wants the *last-known* rate-limit snapshot, not
      // "last-known within the 7d window". If every session file was
      // mtime-skipped by readIfRecentEnough (all older than the last7d
      // cutoff), latestRateLimits is still null here even though a real
      // snapshot may exist in the newest file. Read just that one file
      // (already allowlisted -- walkJsonlFiles already restricted `files` to
      // sessions/**/*.jsonl) purely to recover its rate_limits, without
      // letting its usage rows (all outside every window anyway) into
      // byModel.
      if (!latestRateLimits && files.length > 0) {
        const newest = findNewestFile(files, fsImpl);
        if (newest) {
          let text = null;
          try {
            text = fsImpl.readFileSync(newest, "utf8");
          } catch (_) {
            text = null;
          }
          if (text !== null) {
            const { latestRateLimits: fallbackRL } = reduceCodexSession(text.split("\n").filter((l) => l.trim()));
            if (fallbackRL) latestRateLimits = fallbackRL;
          }
        }
      }
    }

    result.malformedCount += acctMalformed;
    // Record whether this account's session store is a symlink and where it
    // resolves. A symlinked store is shared with another account (BK-373
    // `account link`) and its transcripts are counted under the account that
    // physically owns the store — so an empty models list here means "shared",
    // not "unused". The post-pass below names the owner.
    const topName = acct.vendor === "claude" ? "projects" : "sessions";
    const topPath = path.join(acct.dir, topName);
    let topIsSymlink = false;
    let storeReal = null;
    try {
      topIsSymlink = fsImpl.lstatSync(topPath).isSymbolicLink();
    } catch (_) {
      topIsSymlink = false;
    }
    try {
      storeReal = fsImpl.realpathSync(topPath);
    } catch (_) {
      storeReal = null;
    }

    result.accounts.push({
      vendor: acct.vendor,
      dir: acct.dir,
      label: acct.label,
      models: Array.from(byModel.entries()).map(([model, w]) => ({ model, ...w })),
      storeReal,
      topIsSymlink,
      sharedUnder: null, // filled by the post-pass below
      // Newest 429 per limit kind seen in this account's own transcripts within
      // the same 7-day window. Claude only. This is "what wall did you hit and
      // when", NOT a headroom percentage -- no such figure exists locally.
      limitEvents: Array.from(limitEvents.values()).sort((a, b) => (b.at || 0) - (a.at || 0)),
      // asOf is the event timestamp the snapshot came from (ISO) -- always
      // present alongside rateLimits so a stale last-known snapshot never
      // masquerades as fresh (staleness honesty, G2-1).
      rateLimits:
        acct.vendor === "codex" && latestRateLimits
          ? { ...latestRateLimits.primary, asOf: new Date(latestRateLimits.ts).toISOString() }
          : null,
    });
  }

  // Name the owner of each shared (symlinked) store: the discovered account of
  // the same vendor whose real store dir this one points at and that is itself
  // a real dir (not a symlink). Lets the renderer say "counted under <owner>"
  // instead of a misleading "(no usage recorded)".
  const owners = new Map();
  for (const a of result.accounts) {
    if (!a.topIsSymlink && a.storeReal) owners.set(`${a.vendor}:${a.storeReal}`, a.label);
  }
  for (const a of result.accounts) {
    if (a.topIsSymlink && a.storeReal) {
      const owner = owners.get(`${a.vendor}:${a.storeReal}`);
      if (owner && owner !== a.label) a.sharedUnder = owner;
    }
  }

  if (result.malformedCount > 0) {
    result.warnings.push(`${result.malformedCount} malformed/unrecognized JSONL line(s) skipped across all accounts.`);
  }
  if (unreadableCount > 0) {
    result.unreadableCount = unreadableCount;
    result.warnings.push(
      `${unreadableCount} in-window file(s) could not be read (too large for a single read, or permission denied) — totals below are UNDER-counted.`
    );
  }
  result.elapsedMs = Date.now() - startedAt;
  return result;
}

// ---------------------------------------------------------------------------
// 7. Renderers
// ---------------------------------------------------------------------------

function fmtWindow(w) {
  return `in=${w.input} out=${w.output} cacheR=${w.cacheRead} cacheC=${w.cacheCreate}`;
}

function renderTable(result) {
  const lines = [];
  lines.push(`sdtk usage — ${result.accounts.length} account(s) discovered`);

  if (result.accounts.length === 0) {
    lines.push("  (no Claude or Codex account directories found)");
  }

  for (const acct of result.accounts) {
    lines.push("");
    lines.push(`[${acct.vendor}] ${acct.label}  (${acct.dir})`);
    if (acct.models.length === 0) {
      if (acct.sharedUnder) {
        lines.push(`  (shared session store — usage counted under ${acct.sharedUnder})`);
      } else if (acct.topIsSymlink) {
        lines.push("  (shared session store)");
      } else {
        lines.push("  (no usage recorded)");
      }
    } else {
      lines.push(`  ${"MODEL".padEnd(24)} ${"LAST 5H".padEnd(34)} ${"TODAY".padEnd(34)} ${"LAST 7D".padEnd(34)}`);
      for (const m of acct.models) {
        lines.push(
          `  ${m.model.padEnd(24)} ${fmtWindow(m.last5h).padEnd(34)} ${fmtWindow(m.today).padEnd(34)} ${fmtWindow(m.last7d).padEnd(34)}`
        );
      }
    }
    if (acct.rateLimits) {
      const rl = acct.rateLimits;
      const resetIso = Number.isFinite(rl.resets_at) ? new Date(rl.resets_at * 1000).toISOString() : String(rl.resets_at);
      lines.push(`  rate limit: used ${rl.used_percent}% (window ${rl.window_minutes}m) resets ${resetIso} — as of ${rl.asOf}`);
    }
  }

  if (result.skippedSiblings.length > 0) {
    const names = result.skippedSiblings.map((s) => s.name).join(", ");
    lines.push("");
    lines.push(`${result.skippedSiblings.length} sibling dir(s) skipped (dot-suffix naming): ${names}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    for (const w of result.warnings) lines.push(`WARN ${w}`);
  }

  return lines;
}

function toJSON(result) {
  return result; // already a plain-object tree
}

module.exports = {
  SCHEMA,
  safeNumber,
  safeModel,
  isContained,
  isAllowedRelPath,
  walkJsonlFiles,
  classifySibling,
  discoverAccountDirs,
  parseClaudeLine,
  reduceCodexSession,
  windowBounds,
  readIfRecentEnough,
  findNewestFile,
  aggregateUsage,
  renderTable,
  toJSON,
};
