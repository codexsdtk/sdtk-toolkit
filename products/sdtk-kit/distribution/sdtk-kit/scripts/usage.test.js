#!/usr/bin/env node
"use strict";

// Offline unit tests for `sdtk usage` (BK-371): Claude/Codex token-usage
// aggregator, path allowlist, window bucketing, renderers, and the command
// entrypoint. Real fs against committed fixtures + throwaway temp dirs; no
// network, no real $HOME.
//
// TZ is pinned to a non-UTC zone for the whole file so the "today = LOCAL
// midnight, not UTC" boundary (T17) is actually discriminating — this
// process only, does not leak into other *.test.js files (each runs as its
// own `node` invocation per package.json's `scripts.test` chain).
process.env.TZ = "America/New_York";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  SCHEMA,
  isAllowedRelPath,
  walkJsonlFiles,
  discoverAccountDirs,
  parseClaudeLine,
  reduceCodexSession,
  windowBounds,
  readIfRecentEnough,
  findNewestFile,
  aggregateUsage,
  renderTable,
  toJSON,
} = require("../src/lib/usage");

const { cmdUsage } = require("../src/commands/usage");

const FIXTURES_DIR = path.join(__dirname, "fixtures", "usage");
const CLAUDE_HOME = path.join(FIXTURES_DIR, "claude-home");
const CODEX_HOME = path.join(FIXTURES_DIR, "codex-home");
const CODEX_STALE_HOME = path.join(FIXTURES_DIR, "codex-stale-home");
const CODEX_STALE_FILE = path.join(CODEX_STALE_HOME, "sessions", "2026", "06", "01", "rollout-stale.jsonl");

// FIXED_NOW = 2026-07-20T14:00:00Z. With TZ=America/New_York (EDT, UTC-4 in
// July): last5h cutoff = 09:00Z same day; today (local midnight) cutoff =
// 2026-07-20T04:00:00Z; last7d cutoff = 2026-07-13T14:00:00Z. Fixture JSONL
// timestamps below are hand-picked against these exact bounds (never "now"),
// so the suite never rots with wall-clock time.
const FIXED_NOW = Date.parse("2026-07-20T14:00:00.000Z");

// Shared empty homedir: no .claude*/.codex*-named siblings, so tests that
// drive everything via `extraDirs` don't accidentally also pick up whatever
// the test-runner's real $HOME happens to contain.
const FAKE_EMPTY_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-usage-emptyhome-"));

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function captureStdout(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    const result = fn();
    return { result, output: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

function makeReadSpy() {
  const opened = [];
  const fsImpl = {
    readdirSync: fs.readdirSync,
    existsSync: fs.existsSync,
    statSync: fs.statSync,
    realpathSync: fs.realpathSync,
    lstatSync: fs.lstatSync,
    readFileSync: (p, enc) => {
      opened.push(p);
      return fs.readFileSync(p, enc);
    },
  };
  return { fsImpl, opened };
}

// Real fs wrapper that reports a forced-old mtime for specific paths, so a
// committed fixture file (whose real on-disk mtime is checkout time, not any
// meaningful "age") can exercise the readIfRecentEnough mtime-skip path
// deterministically. Everything else (directory listing, file content)
// passes straight through to real fs -- only mtimeMs is faked, and only for
// the paths named in `oldPaths`.
function makeMtimeOverrideFsImpl(oldPaths, oldMtimeMs) {
  return {
    readdirSync: fs.readdirSync,
    existsSync: fs.existsSync,
    realpathSync: fs.realpathSync,
    lstatSync: fs.lstatSync,
    readFileSync: fs.readFileSync,
    statSync: (p) => {
      const real = fs.statSync(p);
      if (!oldPaths.has(p)) return real;
      const clone = Object.create(Object.getPrototypeOf(real));
      Object.assign(clone, real);
      clone.mtimeMs = oldMtimeMs;
      return clone;
    },
  };
}

function makeFakeFsImpl({ home, siblings, dataDirs }) {
  // siblings: [{ name, isDir }]; dataDirs: Set of full paths that "exist".
  return {
    readdirSync(dir) {
      if (dir !== home) return [];
      return siblings.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDir,
        isFile: () => !e.isDir,
      }));
    },
    existsSync(p) {
      return dataDirs.has(p);
    },
    realpathSync(p) {
      return p;
    },
  };
}

function makeResult(overrides) {
  return {
    schema: SCHEMA,
    accounts: [],
    skippedSiblings: [],
    warnings: [],
    malformedCount: 0,
    elapsedMs: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Path allowlist -- discharges AC-4 / UM-OQ-3
// ---------------------------------------------------------------------------

test("usage allowlist: scanning claude-home never opens .credentials.json", () => {
  const { fsImpl, opened } = makeReadSpy();
  aggregateUsage({ now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl, extraDirs: [CLAUDE_HOME] });
  assert.ok(opened.length > 0, "at least one file was opened");
  assert.ok(opened.every((p) => !p.includes(".credentials.json")), "decoy .credentials.json never opened");
  assert.ok(opened.some((p) => /projects[\\/].+\.jsonl$/.test(p)), "a real projects/**/*.jsonl path was opened");
});

test("usage allowlist: scanning codex-home never opens auth.json", () => {
  const { fsImpl, opened } = makeReadSpy();
  aggregateUsage({ now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl, extraDirs: [CODEX_HOME] });
  assert.ok(opened.length > 0, "at least one file was opened");
  assert.ok(opened.every((p) => !p.includes("auth.json")), "decoy auth.json never opened");
  assert.ok(opened.some((p) => /sessions[\\/].+\.jsonl$/.test(p)), "a real sessions/**/*.jsonl path was opened");
});

// [F2 regression — Codex cross-family review, 2026-07-20] The lexical
// allowlist alone was breakable: statSync follows symlinks, so a linked
// `projects`/`sessions` dir (or a linked file underneath) escaped the account
// root while every relative path still looked legal. Containment is now
// enforced against the RESOLVED path, and links are never traversed.
test("walkJsonlFiles refuses a symlinked top dir pointing outside the account root [F2]", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-usage-symlink-"));
  try {
    const outside = path.join(tmp, "outside");
    fs.mkdirSync(path.join(outside, "nested"), { recursive: true });
    fs.writeFileSync(path.join(outside, "nested", "secret.jsonl"), "{}\n");
    const account = path.join(tmp, "account");
    fs.mkdirSync(account, { recursive: true });
    fs.symlinkSync(outside, path.join(account, "projects"), "dir");

    assert.deepStrictEqual(walkJsonlFiles(account, "claude", fs), [], "symlinked top dir must yield no files");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("walkJsonlFiles never follows a symlinked subdir or file inside the account root [F2]", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-usage-symlink2-"));
  try {
    const outside = path.join(tmp, "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "escaped.jsonl"), "{}\n");
    const projects = path.join(tmp, "account", "projects", "real");
    fs.mkdirSync(projects, { recursive: true });
    fs.writeFileSync(path.join(projects, "legit.jsonl"), "{}\n");
    fs.symlinkSync(outside, path.join(tmp, "account", "projects", "linked"), "dir");
    fs.symlinkSync(path.join(outside, "escaped.jsonl"), path.join(projects, "linked.jsonl"));

    const found = walkJsonlFiles(path.join(tmp, "account"), "claude", fs);
    assert.strictEqual(found.length, 1, "only the real in-root file may be collected");
    assert.ok(found[0].endsWith(path.join("real", "legit.jsonl")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("isAllowedRelPath: table-driven positive/negative cases", () => {
  const cases = [
    ["claude", "projects/foo/bar.jsonl", true],
    ["claude", "projects/foo.jsonl", true],
    ["claude", ".credentials.json", false],
    ["claude", "projects/x.jsonl.bak", false],
    ["claude", "projects/../../etc/passwd", false],
    ["codex", "sessions/2026/07/13/rollout.jsonl", true],
    ["codex", "auth.json", false],
    ["codex", "sessions/x.jsonl.bak", false],
    ["codex", "projects/foo.jsonl", false], // wrong vendor's shape
  ];
  for (const [vendor, rel, expected] of cases) {
    assert.strictEqual(isAllowedRelPath(vendor, rel), expected, `${vendor}: ${rel}`);
  }
});

// ---------------------------------------------------------------------------
// Claude line parser -- discharges AC-3, AC-6
// ---------------------------------------------------------------------------

test("parseClaudeLine extracts model + usage + timestamp from a well-formed assistant line", () => {
  const line = JSON.stringify({
    type: "assistant",
    timestamp: "2026-07-20T13:30:00.000Z",
    message: {
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 },
    },
  });
  const parsed = parseClaudeLine(line);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.model, "claude-sonnet-4-6");
  assert.strictEqual(parsed.timestampMs, Date.parse("2026-07-20T13:30:00.000Z"));
  assert.strictEqual(parsed.input, 100);
  assert.strictEqual(parsed.output, 50);
  assert.strictEqual(parsed.cacheCreate, 10);
  assert.strictEqual(parsed.cacheRead, 5);
});

test("parseClaudeLine includes a <synthetic>-model line as its own zero-usage row (documented decision)", () => {
  const line = JSON.stringify({
    type: "assistant",
    timestamp: "2026-07-20T13:00:00.000Z",
    message: {
      model: "<synthetic>",
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  });
  const parsed = parseClaudeLine(line);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.model, "<synthetic>");
  assert.strictEqual(parsed.input, 0);
  assert.strictEqual(parsed.output, 0);
});

test("parseClaudeLine returns ok:false, malformed:true for malformed JSON without throwing", () => {
  assert.doesNotThrow(() => {
    const parsed = parseClaudeLine('{"type":"assistant","message":{');
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.malformed, true);
  });
});

test("parseClaudeLine returns ok:false, malformed:false for user/system/other non-assistant lines (not corrupt JSON, just not usage-bearing)", () => {
  // Live-smoke discovery: on a real transcript ~64% of lines are ordinary
  // non-assistant lines. These must NOT count toward the malformed warning
  // -- only actual JSON parse failures should.
  const userLine = JSON.stringify({ type: "user", timestamp: "2026-07-20T12:00:00.000Z", message: { role: "user", content: "hi" } });
  const userParsed = parseClaudeLine(userLine);
  assert.strictEqual(userParsed.ok, false);
  assert.strictEqual(userParsed.malformed, false);

  const sysLine = JSON.stringify({ type: "system", timestamp: "2026-07-20T12:00:00.000Z" });
  const sysParsed = parseClaudeLine(sysLine);
  assert.strictEqual(sysParsed.ok, false);
  assert.strictEqual(sysParsed.malformed, false);

  const noUsage = JSON.stringify({ type: "assistant", timestamp: "2026-07-20T12:00:00.000Z", message: { model: "x" } });
  const noUsageParsed = parseClaudeLine(noUsage);
  assert.strictEqual(noUsageParsed.ok, false);
  assert.strictEqual(noUsageParsed.malformed, false);
});

// ---------------------------------------------------------------------------
// Codex session reducer -- discharges AC-3, AC-6
// ---------------------------------------------------------------------------

function turnContext(turnId, model, ts) {
  return JSON.stringify({ type: "turn_context", timestamp: ts, payload: { turn_id: turnId, model } });
}

function tokenCount(ts, { total, last, rateLimits } = {}) {
  const payload = {
    type: "token_count",
    info: {
      total_token_usage: total || { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
      last_token_usage: last || { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
      model_context_window: 258400,
    },
  };
  if (rateLimits) {
    payload.rate_limits = { limit_id: "codex", limit_name: null, primary: rateLimits, secondary: null, credits: null, individual_limit: null, plan_type: "plus", rate_limit_reached_type: null };
  }
  return JSON.stringify({ type: "event_msg", timestamp: ts, payload });
}

test("reduceCodexSession attributes token_count usage to the most recent turn_context model", () => {
  const lines = [
    turnContext("t1", "gpt-5.2", "2026-07-20T10:00:00.000Z"),
    tokenCount("2026-07-20T10:01:00.000Z", {
      total: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 },
      last: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 },
    }),
  ];
  const { rows } = reduceCodexSession(lines);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].model, "gpt-5.2");
  assert.strictEqual(rows[0].input, 10);
});

test("reduceCodexSession splits usage correctly across a mid-session model switch", () => {
  const lines = [
    turnContext("t1", "gpt-5.2", "2026-07-20T10:00:00.000Z"),
    tokenCount("2026-07-20T10:01:00.000Z", {
      total: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 },
      last: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 },
    }),
    turnContext("t2", "gpt-5.2-codex", "2026-07-20T10:05:00.000Z"),
    tokenCount("2026-07-20T10:06:00.000Z", {
      total: { input_tokens: 30, cached_input_tokens: 0, output_tokens: 13, reasoning_output_tokens: 0, total_tokens: 43 },
      last: { input_tokens: 20, cached_input_tokens: 0, output_tokens: 8, reasoning_output_tokens: 0, total_tokens: 28 },
    }),
  ];
  const { rows } = reduceCodexSession(lines);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].model, "gpt-5.2");
  assert.strictEqual(rows[0].input, 10);
  assert.strictEqual(rows[1].model, "gpt-5.2-codex");
  assert.strictEqual(rows[1].input, 20);
});

test("reduceCodexSession captures the latest rate_limits.primary {used_percent, window_minutes, resets_at}", () => {
  // Adversarial ordering: the event with the GREATEST timestamp is processed
  // FIRST in file order, and a later-appended event has an EARLIER
  // timestamp. If the implementation naively took "whichever rate_limits
  // block it saw last" instead of comparing timestamps, this would report
  // the wrong (1.0%) snapshot instead of the correct (5.0%) one.
  const lines = [
    turnContext("t1", "gpt-5.2", "2026-07-20T10:00:00.000Z"),
    tokenCount("2026-07-20T10:10:00.000Z", { rateLimits: { used_percent: 5.0, window_minutes: 10080, resets_at: 222 } }),
    tokenCount("2026-07-20T10:05:00.000Z", { rateLimits: { used_percent: 1.0, window_minutes: 10080, resets_at: 111 } }),
  ];
  const { latestRateLimits } = reduceCodexSession(lines);
  assert.ok(latestRateLimits);
  assert.strictEqual(latestRateLimits.primary.used_percent, 5.0);
  assert.strictEqual(latestRateLimits.primary.resets_at, 222);
});

test("reduceCodexSession skips malformed JSON lines without throwing and counts them", () => {
  const lines = ["{not json", turnContext("t1", "gpt-5.2", "2026-07-20T10:00:00.000Z"), "also not json {"];
  let out;
  assert.doesNotThrow(() => {
    out = reduceCodexSession(lines);
  });
  assert.strictEqual(out.malformed, 2);
});

test('reduceCodexSession buckets a token_count with no prior turn_context under "unknown" instead of dropping it', () => {
  const lines = [
    tokenCount("2026-07-20T10:01:00.000Z", {
      total: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 },
      last: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 },
    }),
  ];
  const { rows } = reduceCodexSession(lines);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].model, "unknown");
  assert.strictEqual(rows[0].input, 10);
});

// [F1 regression — Codex cross-family review, 2026-07-20] Both naive readings
// overcount on real transcripts: total_token_usage is cumulative, and
// last_token_usage is REPEATED verbatim by rate-limit refresh events that do
// not advance the cumulative total (45,752 such events across the 182 real
// session files on the authoring box). Contributions are therefore deltas of
// the cumulative field.
test("reduceCodexSession derives contributions as deltas of total_token_usage, immune to repeated refresh events", () => {
  const lines = [
    turnContext("t1", "gpt-5.2", "2026-07-20T10:00:00.000Z"),
    tokenCount("2026-07-20T10:01:00.000Z", {
      total: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 40, reasoning_output_tokens: 0, total_tokens: 140 },
      last: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 40, reasoning_output_tokens: 0, total_tokens: 140 },
    }),
    // Refresh event: cumulative total UNCHANGED, last_token_usage repeats the
    // previous delta. Must contribute exactly zero.
    tokenCount("2026-07-20T10:01:30.000Z", {
      total: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 40, reasoning_output_tokens: 0, total_tokens: 140 },
      last: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 40, reasoning_output_tokens: 0, total_tokens: 140 },
    }),
    tokenCount("2026-07-20T10:02:00.000Z", {
      total: { input_tokens: 250, cached_input_tokens: 0, output_tokens: 90, reasoning_output_tokens: 0, total_tokens: 340 },
      last: { input_tokens: 150, cached_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 200 },
    }),
  ];
  const { rows } = reduceCodexSession(lines);
  const sumInput = rows.reduce((s, r) => s + r.input, 0);
  // Correct: 100 + 0 + 150 = 250 == the final cumulative total.
  // Wrong (summing last): 100 + 100 + 150 = 350 -- the F1 double-count.
  // Wrong (summing total): 100 + 100 + 250 = 450 -- the R4 cumulative trap.
  assert.strictEqual(sumInput, 250);
  assert.strictEqual(rows[1].input, 0, "refresh event must contribute zero");
});

test("reduceCodexSession falls back to last_token_usage when a record carries no total_token_usage", () => {
  const raw = JSON.stringify({
    type: "event_msg",
    timestamp: "2026-07-20T10:03:00.000Z",
    payload: {
      type: "token_count",
      info: { last_token_usage: { input_tokens: 7, cached_input_tokens: 0, output_tokens: 3, reasoning_output_tokens: 0, total_tokens: 10 } },
    },
  });
  const { rows } = reduceCodexSession([raw]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].input, 7);
});

test("parsers coerce corrupt-but-valid JSON values instead of poisoning totals or throwing [F4]", () => {
  const claudeLine = JSON.stringify({
    type: "assistant",
    timestamp: "2026-07-20T10:00:00.000Z",
    message: { model: 12345, usage: { input_tokens: "80", output_tokens: 5, cache_read_input_tokens: null, cache_creation_input_tokens: -3 } },
  });
  const parsed = parseClaudeLine(claudeLine);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.model, "unknown", "non-string model must not reach padEnd()");
  assert.strictEqual(parsed.input, 0, "string-typed token count must not poison the total");
  assert.strictEqual(parsed.output, 5);
  assert.strictEqual(parsed.cacheRead, 0);
  assert.strictEqual(parsed.cacheCreate, 0, "negative token count must not subtract from a total");
});

// ---------------------------------------------------------------------------
// Window bucketing -- discharges UM-OQ-4
// ---------------------------------------------------------------------------

test("windowBounds: an event 6h old is excluded from last-5h but included in today+last7d", () => {
  const bounds = windowBounds(FIXED_NOW);
  const ts = FIXED_NOW - 6 * 60 * 60 * 1000; // 08:00Z same day
  assert.ok(ts < bounds.last5h, "excluded from last5h");
  assert.ok(ts >= bounds.today, "included in today");
  assert.ok(ts >= bounds.last7d, "included in last7d");
});

test("windowBounds: an event before local midnight is excluded from today but included in last7d", () => {
  const bounds = windowBounds(FIXED_NOW);
  const ts = Date.parse("2026-07-19T20:00:00.000Z"); // before local (EDT) midnight 2026-07-20T04:00:00Z
  assert.ok(ts < bounds.today, "excluded from today");
  assert.ok(ts >= bounds.last7d, "included in last7d");
});

test("windowBounds: an event 8 days old is excluded from all three windows", () => {
  const bounds = windowBounds(FIXED_NOW);
  const ts = FIXED_NOW - 8 * 24 * 60 * 60 * 1000;
  assert.ok(ts < bounds.last5h);
  assert.ok(ts < bounds.today);
  assert.ok(ts < bounds.last7d);
});

test("windowBounds: today boundary uses LOCAL midnight, not UTC", () => {
  const bounds = windowBounds(FIXED_NOW);
  assert.strictEqual(bounds.today, Date.parse("2026-07-20T04:00:00.000Z"), "today cutoff must be LOCAL (EDT) midnight");
  assert.notStrictEqual(bounds.today, Date.parse("2026-07-20T00:00:00.000Z"), "a UTC-midnight implementation would give 00:00Z instead");
});

// ---------------------------------------------------------------------------
// Account discovery -- discharges UM-OQ-2, AC-2, and the R1 lock
// ---------------------------------------------------------------------------

const FAKE_HOME = path.join(path.sep, "fake", "home");

test("discoverAccountDirs finds sibling dirs of ~/.claude* and ~/.codex* via injected homedir+fsImpl", () => {
  const fsImpl = makeFakeFsImpl({
    home: FAKE_HOME,
    siblings: [
      { name: ".claude", isDir: true },
      { name: ".codex", isDir: true },
    ],
    dataDirs: new Set([path.join(FAKE_HOME, ".claude", "projects"), path.join(FAKE_HOME, ".codex", "sessions")]),
  });
  const { accounts } = discoverAccountDirs({ homedir: FAKE_HOME, fsImpl });
  assert.strictEqual(accounts.length, 2);
  assert.ok(accounts.some((a) => a.vendor === "claude" && a.dir === path.join(FAKE_HOME, ".claude")));
  assert.ok(accounts.some((a) => a.vendor === "codex" && a.dir === path.join(FAKE_HOME, ".codex")));
});

test("discoverAccountDirs merges --dir overrides with defaults, de-duplicated by realpath", () => {
  const otherDir = path.join(path.sep, "other", "dir");
  const fsImpl = makeFakeFsImpl({
    home: FAKE_HOME,
    siblings: [{ name: ".claude", isDir: true }],
    dataDirs: new Set([path.join(FAKE_HOME, ".claude", "projects"), path.join(otherDir, "sessions")]),
  });
  const { accounts } = discoverAccountDirs({
    homedir: FAKE_HOME,
    fsImpl,
    extraDirs: [path.join(FAKE_HOME, ".claude"), otherDir], // first is a duplicate of the default; second is new
  });
  assert.strictEqual(accounts.length, 2, "duplicate --dir must not double-count");
  assert.ok(accounts.some((a) => a.vendor === "claude" && a.dir === path.join(FAKE_HOME, ".claude")));
  assert.ok(accounts.some((a) => a.vendor === "codex" && a.dir === otherDir));
});

test("discoverAccountDirs skips a sibling dir that has neither projects/ nor sessions/", () => {
  const fsImpl = makeFakeFsImpl({
    home: FAKE_HOME,
    siblings: [{ name: ".claude", isDir: true }],
    dataDirs: new Set(), // no projects/ under it
  });
  const { accounts } = discoverAccountDirs({ homedir: FAKE_HOME, fsImpl });
  assert.strictEqual(accounts.length, 0);
});

test("discoverAccountDirs includes a dash-variant sibling (.claude-b) as a normal account [R1 lock]", () => {
  const fsImpl = makeFakeFsImpl({
    home: FAKE_HOME,
    siblings: [{ name: ".claude-b", isDir: true }],
    dataDirs: new Set([path.join(FAKE_HOME, ".claude-b", "projects")]),
  });
  const { accounts, skippedSiblings } = discoverAccountDirs({ homedir: FAKE_HOME, fsImpl });
  assert.strictEqual(accounts.length, 1);
  assert.strictEqual(accounts[0].label, ".claude-b");
  assert.strictEqual(skippedSiblings.length, 0);
});

test("discoverAccountDirs excludes a dot-variant sibling (.claude.broken) but reports it in skippedSiblings [R1 lock]", () => {
  const fsImpl = makeFakeFsImpl({
    home: FAKE_HOME,
    siblings: [{ name: ".claude.broken", isDir: true }],
    dataDirs: new Set([path.join(FAKE_HOME, ".claude.broken", "projects")]),
  });
  const { accounts, skippedSiblings } = discoverAccountDirs({ homedir: FAKE_HOME, fsImpl });
  assert.strictEqual(accounts.length, 0, "dot-variant must not be treated as a real account");
  assert.strictEqual(skippedSiblings.length, 1);
  assert.strictEqual(skippedSiblings[0].name, ".claude.broken");
  assert.strictEqual(skippedSiblings[0].vendor, "claude");
});

test("aggregateUsage returns an empty Claude section (not a crash) when no discovered dir has projects/", () => {
  const result = aggregateUsage({ now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl: fs, extraDirs: [CODEX_HOME] });
  assert.strictEqual(result.accounts.filter((a) => a.vendor === "claude").length, 0);
  assert.ok(result.accounts.some((a) => a.vendor === "codex"), "codex account still discovered");
});

test('aggregateUsage returns an empty Codex section (not a crash) when no discovered dir has sessions/ ("box without Codex -> Claude-only table")', () => {
  const result = aggregateUsage({ now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl: fs, extraDirs: [CLAUDE_HOME] });
  assert.strictEqual(result.accounts.filter((a) => a.vendor === "codex").length, 0);
  assert.ok(result.accounts.some((a) => a.vendor === "claude"), "claude account still discovered");
});

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

test("renderTable produces one row per account x model with last-5h/today/last-7d columns", () => {
  const result = makeResult({
    accounts: [
      {
        vendor: "claude",
        dir: "/fake/.claude",
        label: ".claude",
        models: [
          {
            model: "claude-sonnet-4-6",
            last5h: { input: 1, output: 2, cacheRead: 3, cacheCreate: 4 },
            today: { input: 5, output: 6, cacheRead: 7, cacheCreate: 8 },
            last7d: { input: 9, output: 10, cacheRead: 11, cacheCreate: 12 },
          },
          {
            model: "claude-opus-4-8",
            last5h: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
            today: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
            last7d: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
          },
        ],
        rateLimits: null,
      },
    ],
  });
  const text = renderTable(result).join("\n");
  assert.ok(text.includes("claude-sonnet-4-6"));
  assert.ok(text.includes("claude-opus-4-8"));
  assert.ok(text.includes("LAST 5H") && text.includes("TODAY") && text.includes("LAST 7D"));
  assert.ok(text.includes("in=1 out=2 cacheR=3 cacheC=4"));
  assert.ok(text.includes("in=9 out=10 cacheR=11 cacheC=12"));
});

test("renderTable labels a shared (symlinked) store as counted-under its owner, not '(no usage recorded)'", () => {
  const result = makeResult({
    accounts: [
      { vendor: "claude", dir: "/fake/.claude", label: ".claude", models: [], topIsSymlink: false, storeReal: "/fake/.claude/projects", sharedUnder: null, rateLimits: null },
      { vendor: "claude", dir: "/fake/.claude-b", label: ".claude-b", models: [], topIsSymlink: true, storeReal: "/fake/.claude/projects", sharedUnder: ".claude", rateLimits: null },
    ],
  });
  const text = renderTable(result).join("\n");
  assert.ok(text.includes("shared session store — usage counted under .claude"), "shared secondary must name its owner");
  assert.ok(!text.includes(".claude-b  (/fake/.claude-b)\n  (no usage recorded)"), "must not read as unused");
});

test("aggregateUsage marks a symlinked store shared under its real owner (fixture home with a real symlink)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-usage-shared-"));
  try {
    fs.mkdirSync(path.join(home, ".claude", "projects", "p"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "projects", "p", "s.jsonl"),
      JSON.stringify({ type: "assistant", timestamp: "2026-07-20T13:00:00.000Z", message: { model: "claude-fable-5", usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + "\n"
    );
    fs.mkdirSync(path.join(home, ".claude-b"), { recursive: true });
    fs.symlinkSync(path.join(home, ".claude", "projects"), path.join(home, ".claude-b", "projects"), "dir");

    const r = aggregateUsage({ now: FIXED_NOW, homedir: home });
    const b = r.accounts.find((a) => a.label === ".claude-b");
    const a = r.accounts.find((a) => a.label === ".claude");
    assert.strictEqual(b.topIsSymlink, true);
    assert.strictEqual(b.sharedUnder, ".claude", "secondary points at .claude's store");
    assert.strictEqual(b.models.length, 0, "symlinked store is not walked (BK-371 F2)");
    assert.strictEqual(a.sharedUnder, null, "the real owner is not itself 'shared under' anyone");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("renderTable appends used_percent + resets_at on Codex rows only, never on Claude rows", () => {
  const result = makeResult({
    accounts: [
      { vendor: "claude", dir: "/fake/.claude", label: ".claude", models: [], rateLimits: null },
      { vendor: "codex", dir: "/fake/.codex", label: ".codex", models: [], rateLimits: { used_percent: 3.2, window_minutes: 10080, resets_at: 1784600000 } },
    ],
  });
  const lines = renderTable(result);
  const codexStart = lines.findIndex((l) => l.startsWith("[codex]"));
  const claudeBlock = lines.slice(0, codexStart).join("\n");
  const codexBlock = lines.slice(codexStart).join("\n");
  assert.ok(!claudeBlock.includes("used "), "claude block must not carry rate-limit text");
  assert.ok(codexBlock.includes("used 3.2%"), "codex block carries used_percent");
  assert.ok(codexBlock.includes("resets "), "codex block carries resets_at");
});

test("toJSON output is JSON.stringify-able and its totals match renderTable's for the same fixture", () => {
  const result = aggregateUsage({ now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl: fs, extraDirs: [CLAUDE_HOME, CODEX_HOME] });
  const parsed = JSON.parse(JSON.stringify(toJSON(result)));
  assert.strictEqual(parsed.schema, "sdtk.usage.v1");
  const sonnet = parsed.accounts.find((a) => a.vendor === "claude").models.find((m) => m.model === "claude-sonnet-4-6");
  // 100 (session-a, 13:30Z) + 7 (agent-x, 13:45Z) + 300 (session-a, prior-day 20:00Z, still within 7d) = 407
  assert.strictEqual(sonnet.last7d.input, 407);
  const lines = renderTable(result);
  assert.ok(lines.some((l) => l.includes("in=407")), "renderTable shows the same total");
});

// ---------------------------------------------------------------------------
// Performance regression (additional to the locked 30 -- discovered live on
// this box's real ~/.codex data: some real rollout files are 200MB-1.4GB and
// long predate every window; reading them in full was most of a 72s runtime
// against the <5s AC-5 target).
// ---------------------------------------------------------------------------

test("readIfRecentEnough skips reading a file whose mtime predates the cutoff, without touching readFileSync", () => {
  let readCalled = false;
  const fsImpl = {
    statSync: () => ({ mtimeMs: Date.parse("2025-01-01T00:00:00.000Z") }),
    readFileSync: () => {
      readCalled = true;
      return "should never be read";
    },
  };
  const text = readIfRecentEnough("/fake/old-file.jsonl", Date.parse("2026-07-13T14:00:00.000Z"), fsImpl);
  assert.strictEqual(typeof text, "object", "an out-of-window file returns a skip sentinel, not text");
  assert.strictEqual(text.skipped, "old");
  assert.strictEqual(readCalled, false, "readFileSync must not be called for a file older than the cutoff");
});

// [F3 partial — Codex cross-family review, 2026-07-20] Streaming huge files is
// deferred, but an in-window file that cannot be read must be counted and
// warned about, never silently dropped: a 1.4GB rollout exists on the
// authoring box and readFileSync throws past ~512MB.
test("an in-window file that cannot be read is reported as under-counting, not silently skipped [F3]", () => {
  const fsImpl = {
    statSync: () => ({ mtimeMs: Date.now() }),
    readFileSync: () => {
      const err = new Error("Cannot create a string longer than 0x1fffffe8 characters");
      err.code = "ERR_STRING_TOO_LONG";
      throw err;
    },
  };
  const text = readIfRecentEnough("/fake/huge.jsonl", Date.now() - 1000, fsImpl);
  assert.strictEqual(typeof text, "object");
  assert.strictEqual(text.skipped, "unreadable", "unreadable must be distinguishable from out-of-window");
});

test("readIfRecentEnough reads a file whose mtime is at/after the cutoff", () => {
  const fsImpl = {
    statSync: () => ({ mtimeMs: Date.parse("2026-07-20T00:00:00.000Z") }),
    readFileSync: () => "real content",
  };
  const text = readIfRecentEnough("/fake/recent-file.jsonl", Date.parse("2026-07-13T14:00:00.000Z"), fsImpl);
  assert.strictEqual(text, "real content");
});

test("readIfRecentEnough fails open (still reads) when statSync itself fails", () => {
  const fsImpl = {
    statSync: () => {
      throw new Error("ENOENT");
    },
    readFileSync: () => "real content",
  };
  const text = readIfRecentEnough("/fake/unstatable-file.jsonl", Date.parse("2026-07-13T14:00:00.000Z"), fsImpl);
  assert.strictEqual(text, "real content");
});

// ---------------------------------------------------------------------------
// G2-1 fix: last-known rate limits must survive the mtime-skip (04-g2-review.md)
// ---------------------------------------------------------------------------

test("aggregateUsage falls back to the newest file's rate_limits when every codex session file is mtime-skipped [G2-1]", () => {
  const oldMtimeMs = Date.parse("2025-01-01T00:00:00.000Z"); // well before the last7d cutoff
  const fsImpl = makeMtimeOverrideFsImpl(new Set([CODEX_STALE_FILE]), oldMtimeMs);
  const result = aggregateUsage({ now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl, extraDirs: [CODEX_STALE_HOME] });
  const acct = result.accounts.find((a) => a.vendor === "codex");
  assert.ok(acct, "codex account still discovered even though its only file was mtime-skipped");
  assert.strictEqual(acct.models.length, 0, "usage rows stay absent -- the skipped file's rows never entered any window bucket");
  assert.ok(acct.rateLimits, "rate limit is still reported via the last-known fallback");
  assert.strictEqual(acct.rateLimits.used_percent, 9.5);
  assert.strictEqual(acct.rateLimits.asOf, "2026-06-01T00:10:00.000Z", "asOf reflects the stale event, not FIXED_NOW");
});

test("findNewestFile returns the file with the greatest mtime and skips unstatable entries", () => {
  const fsImpl = {
    statSync: (p) => {
      if (p === "/fake/unstatable.jsonl") throw new Error("ENOENT");
      const mtimeMs = { "/fake/a.jsonl": 100, "/fake/b.jsonl": 300, "/fake/c.jsonl": 200 }[p];
      return { mtimeMs };
    },
  };
  const newest = findNewestFile(["/fake/a.jsonl", "/fake/unstatable.jsonl", "/fake/b.jsonl", "/fake/c.jsonl"], fsImpl);
  assert.strictEqual(newest, "/fake/b.jsonl");
});

test("codex rate-limit line and JSON always carry an asOf stamp, including on the fresh (in-window) path", () => {
  const result = aggregateUsage({ now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl: fs, extraDirs: [CODEX_HOME] });
  const acct = result.accounts.find((a) => a.vendor === "codex");
  assert.ok(acct.rateLimits.asOf, "fresh-path rate limit also carries asOf");
  assert.strictEqual(acct.rateLimits.asOf, "2026-07-20T13:10:00.000Z");
  const lines = renderTable(result);
  const codexBlock = lines.slice(lines.findIndex((l) => l.startsWith("[codex]"))).join("\n");
  assert.ok(codexBlock.includes("as of 2026-07-20T13:10:00.000Z"), "table rate-limit line shows the as-of stamp");
});

// ---------------------------------------------------------------------------
// Command layer (cmdUsage) -- discharges AC-2, AC-6
// ---------------------------------------------------------------------------

test("cmdUsage --json emits parseable JSON to stdout and returns exit code 0", () => {
  const { result: code, output } = captureStdout(() =>
    cmdUsage(["--json", "--dir", CLAUDE_HOME, "--dir", CODEX_HOME], { now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl: fs })
  );
  assert.strictEqual(code, 0);
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.schema, "sdtk.usage.v1");
  assert.ok(parsed.accounts.length >= 2);
});

test("cmdUsage returns exit code 0 with a Claude-only table when the fixture home has no codex account", () => {
  const { result: code, output } = captureStdout(() =>
    cmdUsage(["--dir", CLAUDE_HOME], { now: FIXED_NOW, homedir: FAKE_EMPTY_HOME, fsImpl: fs })
  );
  assert.strictEqual(code, 0);
  assert.ok(output.includes("[claude]"));
  assert.ok(!output.includes("[codex]"));
});

test("cmdUsage --help prints usage text, returns 0, and touches no filesystem path before the help branch returns", () => {
  const throwingFsImpl = new Proxy(
    {},
    {
      get(_target, prop) {
        return () => {
          throw new Error(`fsImpl.${String(prop)} must not be called on the --help path`);
        };
      },
    }
  );
  const { result: code, output } = captureStdout(() => cmdUsage(["--help"], { fsImpl: throwingFsImpl }));
  assert.strictEqual(code, 0);
  assert.ok(output.includes("sdtk usage"));
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
(async () => {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  PASS: ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL: ${t.name}`);
      console.error(`        ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${tests.length} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
