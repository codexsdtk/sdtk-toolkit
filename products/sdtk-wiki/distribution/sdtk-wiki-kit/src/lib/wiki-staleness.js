"use strict";

// BK-393 — is the built graph older than the docs it claims to describe?
//
// BK-366 measured `sdtk-wiki ask` against grep and found the graph silently
// 7 days behind the corpus; 3 of its 10 retrieval misses were pure staleness.
// It filed "ask must never be staler than the newest doc, or warn loudly when
// it is" as bar #1 for any future investment. That bar was never built, and the
// same repo was found 5 days stale again on 2026-07-29 — still serving silently.
// This is the warning. It never blocks: a stale answer with a warning beats no
// answer, and grep (the thing users fall back to) is always live.
//
// Cost control: the walk stops at the FIRST source newer than the graph, so the
// stale case — the one worth reporting — is the cheap one. A fresh graph pays a
// full walk, bounded by MAX_ENTRIES.

const fs = require("fs");
const path = require("path");
const { isIndexableSource } = require("./wiki-sources");

const MAX_ENTRIES = 20000;
const DEFAULT_SCAN_FALLBACK = ["docs"];

function readGraphGeneratedAt(indexPath, fsImpl) {
  // Prefer the timestamp the builder recorded; fall back to file mtime when the
  // index is unreadable or predates the field.
  try {
    const raw = fsImpl.readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.generated === "string") {
      const ms = new Date(parsed.generated).getTime();
      if (Number.isFinite(ms)) {
        return ms;
      }
    }
  } catch (_err) {
    /* fall through to mtime */
  }
  try {
    return fsImpl.statSync(indexPath).mtimeMs;
  } catch (_err) {
    return null;
  }
}

function readScanRoots(projectPath, graphPath, fsImpl) {
  try {
    const config = JSON.parse(fsImpl.readFileSync(path.join(graphPath, "config.json"), "utf8"));
    const roots = Array.isArray(config.scanRoots) ? config.scanRoots.filter(Boolean) : [];
    const excludes = Array.isArray(config.excludes) ? config.excludes.filter(Boolean) : [];
    if (roots.length > 0) {
      return {
        roots: roots.map((root) => (path.isAbsolute(root) ? root : path.resolve(projectPath, root))),
        excludes,
      };
    }
  } catch (_err) {
    /* fall through to default */
  }
  return {
    roots: DEFAULT_SCAN_FALLBACK.map((root) => path.resolve(projectPath, root)),
    excludes: [],
  };
}

function isExcluded(name, excludes) {
  const lower = String(name || "").toLowerCase();
  return excludes.some((frag) => {
    const parts = String(frag).replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.length === 1 && parts[0].toLowerCase() === lower;
  });
}

// Returns { stale, graphGeneratedAt, newestSource, newestSourceAt, checked }.
// Any failure yields { stale: false } — this is advisory, never a gate.
function detectStaleGraph(projectPath, graphPath, options) {
  const opts = options || {};
  const fsImpl = opts.fsImpl || fs;
  const indexPath = opts.indexPath || path.join(graphPath, "SDTK_DOC_INDEX.json");

  const graphGeneratedAt = readGraphGeneratedAt(indexPath, fsImpl);
  if (graphGeneratedAt === null) {
    return { stale: false, graphGeneratedAt: null, newestSource: null, newestSourceAt: null, checked: 0 };
  }

  const { roots, excludes } = readScanRoots(projectPath, graphPath, fsImpl);
  let checked = 0;
  let newestSource = null;
  let newestSourceAt = null;

  const stack = roots.slice();
  while (stack.length > 0) {
    if (checked >= MAX_ENTRIES) break;
    const current = stack.pop();
    let entries;
    try {
      entries = fsImpl.readdirSync(current, { withFileTypes: true });
    } catch (_err) {
      continue;
    }
    for (const entry of entries) {
      if (checked >= MAX_ENTRIES) break;
      if (entry.name.startsWith(".") || isExcluded(entry.name, excludes)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      // Every extension the builder indexes, not just markdown: BK-395 added
      // Office ingest and this check kept watching `.md` alone, so a new deck
      // made the graph stale with no warning at all.
      if (!entry.isFile() || !isIndexableSource(entry.name)) continue;
      checked += 1;
      let mtimeMs;
      try {
        mtimeMs = fsImpl.statSync(absolute).mtimeMs;
      } catch (_err) {
        continue;
      }
      if (mtimeMs > graphGeneratedAt) {
        // First proof of staleness is enough — stop walking.
        return {
          stale: true,
          graphGeneratedAt,
          newestSource: path.relative(projectPath, absolute).split(path.sep).join("/"),
          newestSourceAt: mtimeMs,
          checked,
        };
      }
      if (newestSourceAt === null || mtimeMs > newestSourceAt) {
        newestSourceAt = mtimeMs;
        newestSource = path.relative(projectPath, absolute).split(path.sep).join("/");
      }
    }
  }

  return { stale: false, graphGeneratedAt, newestSource, newestSourceAt, checked };
}

function formatStaleWarning(result) {
  if (!result || !result.stale) return "";
  const days = Math.floor((result.newestSourceAt - result.graphGeneratedAt) / 86400000);
  const age = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : "less than a day";
  return (
    `WARNING: the wiki graph is behind your docs by ${age} ` +
    `(newest change: ${result.newestSource}). ` +
    `Answers below may omit recent work — run "sdtk-wiki atlas build" to refresh.`
  );
}

module.exports = {
  MAX_ENTRIES,
  detectStaleGraph,
  formatStaleWarning,
  readGraphGeneratedAt,
};
