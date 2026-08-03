"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const {
  getWikiContentRoots,
  isPathInsideOrEqual,
  resolveProjectPath,
} = require("./wiki-paths");
const { normalizeText, tokenize, scoreFile } = require("./wiki-score");

const DEFAULT_LIMIT = 10;
const CANONICAL_WIKI_RELATIVE = "wiki";
const LEGACY_PERSONAL_BRAIN_RELATIVE = path.join(".sdtk", "wiki", "personal-brain");

// BK-323: token-overlap scoring gives nearly every doc a nonzero score, so a
// raw match count is noise ("Matches: 1495" on a 1,722-doc corpus). Default
// results keep only matches within a band of the top score (or at least the
// floor); `--all` restores the exhaustive set. Ranking is unaffected — the
// cut runs after sorting.
const MIN_SCORE_FLOOR = 2;
const MIN_SCORE_TOP_RATIO = 0.25;

// BK-325: archive-tier docs rank lower (never hidden). Atlas pages carry the
// tier in frontmatter (set at build time from the config `archive` path
// fragments); compiled-wiki candidates fall back to matching those fragments
// against their own path.
const ARCHIVE_TIER_FACTOR = 0.5;

function extractTrustZone(text) {
  const fm = extractFrontmatterBlock(text);
  const match = fm.match(/^trust_zone:\s*"?([^"\n]+)"?\s*$/m);
  return match ? match[1].trim() : null;
}

function loadArchiveFrags(projectPath) {
  try {
    const configPath = path.join(projectPath, ".sdtk", "wiki", "graph", "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return Array.isArray(config.archive) ? config.archive.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function pathMatchesFrags(relativePath, frags) {
  const parts = toPosix(relativePath).toLowerCase().split("/").filter(Boolean);
  for (const frag of frags) {
    const fragParts = toPosix(frag).toLowerCase().replace(/^\/+|\/+$/g, "").split("/").filter((p) => p && p !== ".");
    if (!fragParts.length) continue;
    if (fragParts.length === 1) {
      if (parts.includes(fragParts[0])) return true;
      continue;
    }
    for (let idx = 0; idx <= parts.length - fragParts.length; idx++) {
      if (parts.slice(idx, idx + fragParts.length).join("/") === fragParts.join("/")) return true;
    }
  }
  return false;
}

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function collectMarkdownFiles(rootPath) {
  const files = [];
  function visit(current) {
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current).sort()) {
        visit(path.join(current, child));
      }
      return;
    }
    if (stat.isFile() && /\.md(?:arkdown)?$/i.test(current)) {
      files.push(current);
    }
  }
  visit(rootPath);
  return files.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}

function extractTitle(text, filePath) {
  const heading = text.match(/^#\s+(.+?)\s*$/m);
  if (heading) return heading[1].trim();
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, " ").trim();
}

function snippetFor(text, query, tokens) {
  const lower = normalizeText(text);
  const phrase = normalizeText(query);
  let index = phrase ? lower.indexOf(phrase) : -1;
  if (index < 0) {
    for (const token of tokens) {
      index = lower.indexOf(token);
      if (index >= 0) break;
    }
  }
  if (index < 0) {
    return text.replace(/\s+/g, " ").trim().slice(0, 180);
  }
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 180);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

// BK-318 union de-dup: identify the underlying source a page describes.
// Atlas pages carry `source_path:` (repo-relative). Compiled wiki source pages
// carry `aliases: ["<logical path>"]` (relative to their ingest root). A
// compiled page is a duplicate of an atlas page when the atlas source_path
// equals — or path-suffix-matches — one of its aliases (atlas wins).
function extractFrontmatterBlock(text) {
  const match = String(text || "").match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : "";
}

function extractSourceKey(text) {
  const fm = extractFrontmatterBlock(text);
  const sourcePath = fm.match(/^source_path:\s*"?([^"\n]+)"?\s*$/m);
  if (sourcePath) {
    return { kind: "source_path", value: toPosix(sourcePath[1]).toLowerCase() };
  }
  const aliases = fm.match(/^aliases:\s*\[\s*"([^"\n]+)"/m);
  if (aliases) {
    return { kind: "alias", value: toPosix(aliases[1]).toLowerCase() };
  }
  return null;
}

function isDuplicateOfAtlas(aliasValue, atlasSourcePaths) {
  if (atlasSourcePaths.has(aliasValue)) return true;
  for (const sourcePath of atlasSourcePaths) {
    if (sourcePath.endsWith(`/${aliasValue}`)) return true;
  }
  return false;
}

function runWikiSearch({ projectPath, query, limit = DEFAULT_LIMIT, includeAll = false }) {
  const resolvedProjectPath = resolveProjectPath(projectPath || process.cwd());
  if (!fs.existsSync(resolvedProjectPath) || !fs.statSync(resolvedProjectPath).isDirectory()) {
    throw new ValidationError(`--project-path is not a valid directory: ${resolvedProjectPath}`);
  }

  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    throw new ValidationError('sdtk-wiki search requires a query, for example: sdtk-wiki search --project-path <path> "multi-agent".');
  }

  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : DEFAULT_LIMIT;

  const contentRoots = getWikiContentRoots(resolvedProjectPath);
  for (const root of contentRoots) {
    if (!isPathInsideOrEqual(root.path, resolvedProjectPath)) {
      throw new ValidationError("Refusing to search outside the project root.");
    }
  }
  if (contentRoots.length === 0) {
    throw new ValidationError(
      `No SDTK-WIKI local wiki found under ${resolvedProjectPath}. ` +
        'Run "sdtk-wiki init" / "sdtk-wiki atlas build" to index your project docs (searched at .sdtk/wiki/pages). ' +
        "A compiled wiki/ produced by the standalone sdtk-brain kit is also searched when present; " +
        "legacy .sdtk/wiki/personal-brain workspaces remain readable."
    );
  }

  const tokens = tokenize(normalizedQuery);
  const archiveFrags = loadArchiveFrags(resolvedProjectPath);

  // Pass 1 — read every candidate once, keyed by root; collect atlas source paths.
  const candidates = [];
  const atlasSourcePaths = new Set();
  let scannedFiles = 0;
  for (const root of contentRoots) {
    for (const filePath of collectMarkdownFiles(root.path)) {
      scannedFiles += 1;
      const text = fs.readFileSync(filePath, "utf-8");
      const sourceKey = extractSourceKey(text);
      if (root.store === "atlas" && sourceKey && sourceKey.kind === "source_path") {
        atlasSourcePaths.add(sourceKey.value);
      }
      candidates.push({ filePath, text, store: root.store, sourceKey });
    }
  }

  // Pass 2 — score, suppressing compiled-wiki duplicates of atlas sources.
  const matches = [];
  for (const candidate of candidates) {
    if (
      candidate.store === "wiki" &&
      candidate.sourceKey &&
      isDuplicateOfAtlas(candidate.sourceKey.value, atlasSourcePaths)
    ) {
      continue;
    }
    const relativePath = toPosix(path.relative(resolvedProjectPath, candidate.filePath));
    const title = extractTitle(candidate.text, candidate.filePath);
    const scored = scoreFile({
      text: candidate.text,
      title,
      relativePath,
      query: normalizedQuery,
      tokens,
    });
    if (scored.score <= 0) continue;
    const frontmatterTier = candidate.store === "atlas" ? extractTrustZone(candidate.text) : null;
    const isArchive =
      frontmatterTier === "archive" ||
      (frontmatterTier === null && archiveFrags.length > 0 && pathMatchesFrags(relativePath, archiveFrags));
    let score = scored.score;
    const reasons = scored.reasons.slice();
    if (isArchive) {
      score = Math.max(1, Math.round(score * ARCHIVE_TIER_FACTOR));
      reasons.push("archive tier (rank reduced)");
    }
    matches.push({
      path: relativePath,
      title,
      store: candidate.store,
      tier: isArchive ? "archive" : "current",
      score,
      why: reasons.join("; "),
      snippet: snippetFor(candidate.text, normalizedQuery, tokens),
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.store !== b.store) return a.store === "atlas" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  let keptMatches = matches;
  let suppressedLowScoreMatches = 0;
  let minScore = 0;
  if (!includeAll && matches.length > 0) {
    minScore = Math.max(MIN_SCORE_FLOOR, Math.ceil(matches[0].score * MIN_SCORE_TOP_RATIO));
    keptMatches = matches.filter((m) => m.score >= minScore);
    suppressedLowScoreMatches = matches.length - keptMatches.length;
  }

  const hasAtlas = contentRoots.some((root) => root.store === "atlas");
  const wikiRoot = contentRoots.find((root) => root.store === "wiki");
  const primaryRoot = contentRoots[0];

  return {
    query: normalizedQuery,
    projectPath: resolvedProjectPath,
    wikiContentPath: primaryRoot.path,
    wikiContentMode: primaryRoot.mode,
    contentRoots: contentRoots.map((root) => ({
      path: root.path,
      store: root.store,
      mode: root.mode,
    })),
    personalBrainPath: primaryRoot.path,
    scannedFiles,
    matches: keptMatches.slice(0, safeLimit),
    totalMatches: keptMatches.length,
    suppressedLowScoreMatches,
    minScore,
    includeAll: Boolean(includeAll),
    limit: safeLimit,
    searchMode: hasAtlas
      ? (wikiRoot
        ? "local_deterministic_union_atlas_and_wiki_markdown"
        : "local_deterministic_atlas_pages_markdown")
      : (primaryRoot.mode === "canonical_project_wiki"
        ? "local_deterministic_project_wiki_markdown"
        : "local_deterministic_legacy_personal_brain_markdown"),
    premiumRequired: false,
    mutated: false,
  };
}

module.exports = {
  CANONICAL_WIKI_RELATIVE,
  LEGACY_PERSONAL_BRAIN_RELATIVE,
  runWikiSearch,
  tokenize,
};
