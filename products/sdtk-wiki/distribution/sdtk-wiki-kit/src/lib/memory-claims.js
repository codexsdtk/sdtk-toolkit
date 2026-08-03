"use strict";

// BK-390 — checkable claims in the project memory file.
//
// The problem this solves, measured before it was written: the "read this
// first" file of this very repo asserted `sdtk-kit@1.34.0 LIVE on npm` while
// the real version was 1.43.0. Four of its eight checkable version claims were
// wrong — a 50% falsehood rate in the one file a fresh session is told to trust.
// A memory layer that is written but never verified drifts silently, and a new
// agent starts from a lie.
//
// So: standing-state facts get a small table, and `sdtk-wiki memory check`
// verifies each row against ground truth that already exists IN THE REPO
// (package.json, the backlog, the filesystem). No network, no new store.
//
// The write model is APPEND-ONLY. A contradicted claim is never edited or
// deleted: a corrected row is appended and the old row is marked `superseded`.
// Two consequences fall out of that one rule:
//   1. the supersedes relation is produced BY verification — nobody hand-writes
//      an edge, which is what keeps this from becoming an ontology nobody feeds;
//   2. two agents writing concurrently cannot erase each other's work, which is
//      the failure class behind every collision incident this repo has recorded.
//
// Everything here is pure or takes an injected fs, so the command layer stays a
// thin shell and the checks are testable without a real repo.

const fs = require("fs");
const path = require("path");

const CLAIMS_BEGIN = "<!-- SDTK-WIKI-CLAIMS-BEGIN -->";
const CLAIMS_END = "<!-- SDTK-WIKI-CLAIMS-END -->";

const STATUS_CONFIRMED = "CONFIRMED";
const STATUS_CONTRADICTED = "CONTRADICTED";
const STATUS_UNCHECKABLE = "UNCHECKABLE";
const STATUS_SUPERSEDED = "SUPERSEDED";

// Layouts seen in the wild. The kit has always defaulted to `.sdtk/wiki/`, but
// this repo's capture hook writes to `governance/ai/wiki-memory/` — so the
// shipped reader could not find the file the shipped writer had just appended
// to, and `memory brief` reported "no memory file" for a file that existed.
// Resolution tries the default first and falls back, rather than picking a
// winner, because both layouts are in use and neither is wrong.
const MEMORY_CANDIDATES = Object.freeze([
  path.join(".sdtk", "wiki", "PROJECT_MEMORY.md"),
  path.join("governance", "ai", "wiki-memory", "PROJECT_MEMORY.md"),
]);

// --- resolution -------------------------------------------------------------

// Returns { file, rel, source } or { file: null, searched: [...] }.
function resolveMemoryFile(root, { override, fsImpl = fs } = {}) {
  if (override) {
    const abs = path.isAbsolute(override) ? override : path.join(root, override);
    return fsImpl.existsSync(abs)
      ? { file: abs, rel: path.relative(root, abs), source: "--file" }
      : { file: null, searched: [abs] };
  }
  const searched = [];
  for (const rel of MEMORY_CANDIDATES) {
    const abs = path.join(root, rel);
    searched.push(abs);
    if (fsImpl.existsSync(abs)) return { file: abs, rel, source: "discovered" };
  }
  return { file: null, searched };
}

// --- claims block parsing ---------------------------------------------------

function splitRow(line) {
  // A markdown table row: leading/trailing pipes are optional padding.
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

// Parse the block between the markers. Malformed rows are RETAINED with a
// parseError rather than dropped: silently discarding a line the user wrote
// would lose a claim, and losing claims is the failure this feature exists to
// prevent.
function parseClaims(content) {
  const begin = content.indexOf(CLAIMS_BEGIN);
  const end = content.indexOf(CLAIMS_END);
  if (begin < 0 || end < 0 || end < begin) {
    return { present: false, claims: [], begin, end };
  }
  const body = content.slice(begin + CLAIMS_BEGIN.length, end);
  const claims = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes("|")) continue;
    const cells = splitRow(line);
    if (isSeparatorRow(cells)) continue;
    if (cells[0].toLowerCase() === "key") continue; // header
    if (cells.length < 3) {
      claims.push({ raw: line, parseError: "row needs at least key|value|check" });
      continue;
    }
    claims.push({
      key: cells[0],
      value: cells[1],
      check: cells[2],
      asOf: cells[3] || "",
      status: (cells[4] || "").toLowerCase(),
      raw: line,
    });
  }
  return { present: true, claims, begin, end };
}

// The live claim for a key is the LAST row for that key that is not superseded.
// Order is meaningful precisely because the file is append-only.
function currentClaims(claims) {
  const byKey = new Map();
  for (const c of claims) {
    if (c.parseError || !c.key) continue;
    if (c.status === "superseded") continue;
    byKey.set(c.key, c);
  }
  return [...byKey.values()];
}

function renderRows(claims) {
  const head = ["| key | value | check | as-of | status |", "|---|---|---|---|---|"];
  const rows = claims
    .filter((c) => !c.parseError)
    .map((c) => `| ${c.key} | ${c.value} | ${c.check} | ${c.asOf || ""} | ${c.status || ""} |`);
  return [...head, ...rows].join("\n");
}

// Replace the block body, preserving everything outside the markers byte-exact.
function renderClaimsBlock(content, claims) {
  const begin = content.indexOf(CLAIMS_BEGIN);
  const end = content.indexOf(CLAIMS_END);
  if (begin < 0 || end < 0 || end < begin) return null;
  return (
    content.slice(0, begin + CLAIMS_BEGIN.length) +
    "\n" +
    renderRows(claims) +
    "\n" +
    content.slice(end)
  );
}

// --- verifiers --------------------------------------------------------------
//
// Every verifier is offline and reads ground truth that the repo already
// maintains. A verifier that cannot reach its ground truth returns UNCHECKABLE
// WITH A REASON — never CONFIRMED. Reporting "fine" because the check itself
// failed is the one outcome that would make this feature actively harmful.

function readJson(file, fsImpl) {
  try {
    return JSON.parse(fsImpl.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

// pkg:<name> -> the `version` field of that package's package.json in this repo.
// Deliberately the repo's own declaration, not npm: it needs no network, and it
// is the value that will BE published, so it catches drift a release earlier.
function checkPkgVersion(claim, ctx) {
  const name = claim.key.slice("pkg:".length);
  if (!name) return { status: STATUS_UNCHECKABLE, reason: "empty package name" };
  const hits = ctx.packageIndex.get(name);
  if (!hits) {
    return { status: STATUS_UNCHECKABLE, reason: `no package.json named '${name}' in repo` };
  }
  return hits === claim.value
    ? { status: STATUS_CONFIRMED, actual: hits }
    : { status: STATUS_CONTRADICTED, actual: hits };
}

// bk:BK-123 -> the status cell of that row in the backlog table.
function checkBacklogStatus(claim, ctx) {
  const id = claim.key.slice("bk:".length).toUpperCase();
  if (!/^BK-\d+$/.test(id)) {
    return { status: STATUS_UNCHECKABLE, reason: `'${id}' is not a BK id` };
  }
  if (!ctx.backlogRows) {
    return { status: STATUS_UNCHECKABLE, reason: "IMPROVEMENT_BACKLOG.md not found" };
  }
  const row = ctx.backlogRows.get(id);
  if (!row) return { status: STATUS_UNCHECKABLE, reason: `${id} not in backlog` };
  // The status column is free text ("DONE + PUBLISHED", "IMPLEMENTED (PR open)"),
  // so a substring match is the honest comparison — an exact match would report
  // CONTRADICTED for rows that merely carry extra detail.
  const want = claim.value.toLowerCase();
  return row.toLowerCase().includes(want)
    ? { status: STATUS_CONFIRMED, actual: row }
    : { status: STATUS_CONTRADICTED, actual: row };
}

// path:<rel> -> does it exist. Cheap, and it catches the "that file moved"
// drift that silently invalidates a whole paragraph of a memory file.
function checkPathExists(claim, ctx) {
  const rel = claim.key.slice("path:".length);
  if (!rel) return { status: STATUS_UNCHECKABLE, reason: "empty path" };
  if (rel.includes("..")) return { status: STATUS_UNCHECKABLE, reason: "path escapes the repo" };
  const exists = ctx.fsImpl.existsSync(path.join(ctx.root, rel));
  const want = claim.value.toLowerCase();
  if (want !== "exists" && want !== "absent") {
    return { status: STATUS_UNCHECKABLE, reason: "value must be 'exists' or 'absent'" };
  }
  const actual = exists ? "exists" : "absent";
  return actual === want
    ? { status: STATUS_CONFIRMED, actual }
    : { status: STATUS_CONTRADICTED, actual };
}

const CHECKS = Object.freeze({
  "pkg-version": { prefix: "pkg:", run: checkPkgVersion },
  "backlog-status": { prefix: "bk:", run: checkBacklogStatus },
  "path-exists": { prefix: "path:", run: checkPathExists },
});

function checkNames() {
  return Object.keys(CHECKS);
}

// --- ground-truth context ---------------------------------------------------

// Built once per run so N claims never cause N filesystem walks.
function buildContext(root, { fsImpl = fs, maxDepth = 6 } = {}) {
  const packageIndex = new Map();
  const skip = new Set(["node_modules", ".git", ".sdtk", "dist", "build", "coverage"]);
  (function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fsImpl.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.name === "package.json") {
        const pkg = readJson(path.join(dir, e.name), fsImpl);
        if (pkg && pkg.name && pkg.version && !packageIndex.has(pkg.name)) {
          packageIndex.set(pkg.name, pkg.version);
        }
      }
    }
  })(root, 0);

  let backlogRows = null;
  const backlog = path.join(root, "governance", "ai", "core", "IMPROVEMENT_BACKLOG.md");
  try {
    const text = fsImpl.readFileSync(backlog, "utf8");
    backlogRows = new Map();
    for (const line of text.split(/\r?\n/)) {
      const m = /^\|\s*(BK-\d+)\s*\|/.exec(line);
      if (!m) continue;
      const cells = splitRow(line);
      // | BK | title | priority | STATUS | owner | notes |
      if (cells.length >= 4) backlogRows.set(m[1], cells[3]);
    }
  } catch (_) {
    backlogRows = null;
  }

  return { root, fsImpl, packageIndex, backlogRows };
}

// --- the check run ----------------------------------------------------------

function checkClaims(content, root, { fsImpl = fs, ctx } = {}) {
  const parsed = parseClaims(content);
  if (!parsed.present) {
    return { present: false, results: [], counts: emptyCounts() };
  }
  const context = ctx || buildContext(root, { fsImpl });
  const live = currentClaims(parsed.claims);
  const results = [];

  for (const c of parsed.claims) {
    if (c.parseError) {
      results.push({ claim: c, status: STATUS_UNCHECKABLE, reason: c.parseError });
      continue;
    }
    if (c.status === "superseded") {
      results.push({ claim: c, status: STATUS_SUPERSEDED });
      continue;
    }
    if (!live.includes(c)) {
      // An older row for a key that a newer row already replaced, but which was
      // never marked. Treat as superseded rather than re-checking a dead claim.
      results.push({ claim: c, status: STATUS_SUPERSEDED, reason: "replaced by a later row" });
      continue;
    }
    const spec = CHECKS[c.check];
    if (!spec) {
      results.push({
        claim: c,
        status: STATUS_UNCHECKABLE,
        reason: `unknown check '${c.check}' (known: ${checkNames().join(", ")})`,
      });
      continue;
    }
    if (!c.key.startsWith(spec.prefix)) {
      results.push({
        claim: c,
        status: STATUS_UNCHECKABLE,
        reason: `check '${c.check}' needs a key starting with '${spec.prefix}'`,
      });
      continue;
    }
    let out;
    try {
      out = spec.run(c, context);
    } catch (err) {
      out = { status: STATUS_UNCHECKABLE, reason: `verifier threw: ${err && err.message}` };
    }
    results.push({ claim: c, ...out });
  }

  return { present: true, results, counts: countBy(results) };
}

function emptyCounts() {
  return { CONFIRMED: 0, CONTRADICTED: 0, UNCHECKABLE: 0, SUPERSEDED: 0 };
}

function countBy(results) {
  const counts = emptyCounts();
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}

// --- append-only correction -------------------------------------------------

// For every CONTRADICTED claim: mark the old row superseded and append a
// corrected row carrying the observed value. Nothing is edited in place beyond
// the status cell, and nothing is ever removed — the old assertion stays
// readable, which is the whole point of an audit trail.
function applyCorrections(content, checkResult, { today } = {}) {
  const parsed = parseClaims(content);
  if (!parsed.present) return { changed: false, content, added: [] };

  const contradicted = new Map();
  for (const r of checkResult.results) {
    if (r.status === STATUS_CONTRADICTED) contradicted.set(r.claim.raw, r);
  }
  if (!contradicted.size) return { changed: false, content, added: [] };

  const stamp = today || new Date().toISOString().slice(0, 10);
  const next = [];
  const added = [];
  for (const c of parsed.claims) {
    const hit = contradicted.get(c.raw);
    if (!hit) {
      next.push(c);
      continue;
    }
    next.push({ ...c, status: "superseded" });
    const corrected = {
      key: c.key,
      value: String(hit.actual),
      check: c.check,
      asOf: stamp,
      status: "",
    };
    next.push(corrected);
    added.push(corrected);
  }
  return { changed: true, content: renderClaimsBlock(content, next), added };
}

module.exports = {
  CLAIMS_BEGIN,
  CLAIMS_END,
  MEMORY_CANDIDATES,
  STATUS_CONFIRMED,
  STATUS_CONTRADICTED,
  STATUS_UNCHECKABLE,
  STATUS_SUPERSEDED,
  resolveMemoryFile,
  parseClaims,
  currentClaims,
  renderClaimsBlock,
  buildContext,
  checkClaims,
  applyCorrections,
  checkNames,
};
