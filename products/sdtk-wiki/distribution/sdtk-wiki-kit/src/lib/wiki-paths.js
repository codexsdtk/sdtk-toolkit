"use strict";

const path = require("path");

const WIKI_WORKSPACE_RELATIVE = path.join(".sdtk", "wiki");
const WIKI_GRAPH_RELATIVE = path.join(".sdtk", "wiki", "graph");
const WIKI_MANIFEST_RELATIVE = path.join(".sdtk", "wiki", "manifest.json");
const WIKI_PAGES_RELATIVE = path.join(".sdtk", "wiki", "pages");
const WIKI_RAW_RELATIVE = path.join(".sdtk", "wiki", "raw");
const WIKI_RAW_DESCRIPTORS_RELATIVE = path.join(".sdtk", "wiki", "raw", "descriptors");
const WIKI_RAW_SOURCES_RELATIVE = path.join(".sdtk", "wiki", "raw", "sources.json");
const WIKI_PROVENANCE_RELATIVE = path.join(".sdtk", "wiki", "provenance");
const WIKI_PROVENANCE_INGEST_EVENTS_RELATIVE = path.join(".sdtk", "wiki", "provenance", "ingest-events.json");
const WIKI_PROVENANCE_SOURCES_RELATIVE = path.join(".sdtk", "wiki", "provenance", "sources.json");
const WIKI_QUERIES_RELATIVE = path.join(".sdtk", "wiki", "queries");
const WIKI_REPORTS_RELATIVE = path.join(".sdtk", "wiki", "reports");
const WIKI_LOGS_RELATIVE = path.join(".sdtk", "wiki", "logs");
const CANONICAL_WIKI_RELATIVE = "wiki";
const LEGACY_PERSONAL_BRAIN_RELATIVE = path.join(".sdtk", "wiki", "personal-brain");
const LEGACY_ATLAS_RELATIVE = path.join(".sdtk", "atlas");

function resolveProjectPath(projectPath) {
  return path.resolve(projectPath || process.cwd());
}

function normalizeComparablePath(targetPath) {
  const resolved = path.resolve(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInsideOrEqual(targetPath, rootPath) {
  const comparableTarget = normalizeComparablePath(targetPath);
  const comparableRoot = normalizeComparablePath(rootPath);
  return (
    comparableTarget === comparableRoot ||
    comparableTarget.startsWith(comparableRoot + path.sep)
  );
}

function assertPathInsideOrEqual(
  targetPath,
  rootPath,
  message = "Refusing to access a path outside the allowed root"
) {
  const resolvedTarget = path.resolve(targetPath);
  if (!isPathInsideOrEqual(resolvedTarget, rootPath)) {
    throw new Error(`${message}: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

function getWikiWorkspacePath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_WORKSPACE_RELATIVE);
}

function getCanonicalWikiPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), CANONICAL_WIKI_RELATIVE);
}

function getLegacyPersonalBrainPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), LEGACY_PERSONAL_BRAIN_RELATIVE);
}

function getPreferredWikiContentPath(projectPath) {
  const canonical = getCanonicalWikiPath(projectPath);
  const legacy = getLegacyPersonalBrainPath(projectPath);
  try {
    const fs = require("fs");
    if (fs.existsSync(canonical) && fs.statSync(canonical).isDirectory()) {
      return {
        path: canonical,
        mode: "canonical_project_wiki",
        relative: CANONICAL_WIKI_RELATIVE,
      };
    }
    if (fs.existsSync(legacy) && fs.statSync(legacy).isDirectory()) {
      return {
        path: legacy,
        mode: "legacy_personal_brain_fallback",
        relative: LEGACY_PERSONAL_BRAIN_RELATIVE,
      };
    }
  } catch (_) {
    // Callers perform their own existence validation and error reporting.
  }
  return {
    path: canonical,
    mode: "canonical_project_wiki",
    relative: CANONICAL_WIKI_RELATIVE,
  };
}

// BK-318: ordered content roots for the unified query surface.
// The atlas pages mirror (full original content, built by `atlas build`) comes
// first; the compiled canonical wiki (or its legacy personal-brain fallback)
// second. Union of both is the one logical corpus query/search/ask ground on.
function getWikiContentRoots(projectPath) {
  const fs = require("fs");
  const roots = [];
  const atlasPages = getWikiPagesPath(projectPath);
  try {
    if (
      fs.existsSync(atlasPages) &&
      fs.statSync(atlasPages).isDirectory() &&
      fs.readdirSync(atlasPages).length > 0
    ) {
      // An empty pages dir (scaffolded by `init --no-build`) is not a store yet.
      roots.push({ path: atlasPages, store: "atlas", mode: "atlas_pages" });
    }
  } catch (_) {
    // fall through — callers validate emptiness themselves
  }
  const preferred = getPreferredWikiContentPath(projectPath);
  try {
    if (fs.existsSync(preferred.path) && fs.statSync(preferred.path).isDirectory()) {
      roots.push({ path: preferred.path, store: "wiki", mode: preferred.mode });
    }
  } catch (_) {
    // fall through
  }
  return roots;
}

function getWikiGraphPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_GRAPH_RELATIVE);
}

function getWikiManifestPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_MANIFEST_RELATIVE);
}

function getWikiPagesPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_PAGES_RELATIVE);
}

function getWikiRawPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_RAW_RELATIVE);
}

function getWikiRawDescriptorsPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_RAW_DESCRIPTORS_RELATIVE);
}

function getWikiRawSourcesPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_RAW_SOURCES_RELATIVE);
}

function getWikiProvenancePath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_PROVENANCE_RELATIVE);
}

function getWikiProvenanceIngestEventsPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_PROVENANCE_INGEST_EVENTS_RELATIVE);
}

function getWikiProvenanceSourcesPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_PROVENANCE_SOURCES_RELATIVE);
}

function getWikiQueriesPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_QUERIES_RELATIVE);
}

function getWikiReportsPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_REPORTS_RELATIVE);
}

function getWikiLogsPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), WIKI_LOGS_RELATIVE);
}

function getLegacyAtlasPath(projectPath) {
  return path.join(resolveProjectPath(projectPath), LEGACY_ATLAS_RELATIVE);
}

function assertWikiWorkspaceWritePath(targetPath, projectPath) {
  return assertPathInsideOrEqual(
    targetPath,
    getWikiWorkspacePath(projectPath),
    "Refusing to write outside project-local .sdtk/wiki workspace"
  );
}

function assertCanonicalWikiWritePath(targetPath, projectPath) {
  return assertPathInsideOrEqual(
    targetPath,
    getCanonicalWikiPath(projectPath),
    "Refusing to write outside project-local wiki output"
  );
}

function describeWikiPaths(projectPath) {
  return {
    projectPath: resolveProjectPath(projectPath),
    canonicalWikiPath: getCanonicalWikiPath(projectPath),
    legacyPersonalBrainPath: getLegacyPersonalBrainPath(projectPath),
    wikiWorkspacePath: getWikiWorkspacePath(projectPath),
    wikiGraphPath: getWikiGraphPath(projectPath),
    wikiManifestPath: getWikiManifestPath(projectPath),
    wikiPagesPath: getWikiPagesPath(projectPath),
    wikiRawPath: getWikiRawPath(projectPath),
    wikiRawDescriptorsPath: getWikiRawDescriptorsPath(projectPath),
    wikiRawSourcesPath: getWikiRawSourcesPath(projectPath),
    wikiProvenancePath: getWikiProvenancePath(projectPath),
    wikiProvenanceIngestEventsPath: getWikiProvenanceIngestEventsPath(projectPath),
    wikiProvenanceSourcesPath: getWikiProvenanceSourcesPath(projectPath),
    wikiQueriesPath: getWikiQueriesPath(projectPath),
    wikiReportsPath: getWikiReportsPath(projectPath),
    wikiLogsPath: getWikiLogsPath(projectPath),
    legacyAtlasPath: getLegacyAtlasPath(projectPath),
  };
}

module.exports = {
  CANONICAL_WIKI_RELATIVE,
  LEGACY_ATLAS_RELATIVE,
  LEGACY_PERSONAL_BRAIN_RELATIVE,
  WIKI_GRAPH_RELATIVE,
  WIKI_LOGS_RELATIVE,
  WIKI_MANIFEST_RELATIVE,
  WIKI_PAGES_RELATIVE,
  WIKI_RAW_DESCRIPTORS_RELATIVE,
  WIKI_RAW_RELATIVE,
  WIKI_RAW_SOURCES_RELATIVE,
  WIKI_PROVENANCE_INGEST_EVENTS_RELATIVE,
  WIKI_PROVENANCE_RELATIVE,
  WIKI_PROVENANCE_SOURCES_RELATIVE,
  WIKI_QUERIES_RELATIVE,
  WIKI_REPORTS_RELATIVE,
  WIKI_WORKSPACE_RELATIVE,
  assertPathInsideOrEqual,
  assertCanonicalWikiWritePath,
  assertWikiWorkspaceWritePath,
  describeWikiPaths,
  getCanonicalWikiPath,
  getLegacyPersonalBrainPath,
  getLegacyAtlasPath,
  getPreferredWikiContentPath,
  getWikiContentRoots,
  getWikiGraphPath,
  getWikiLogsPath,
  getWikiManifestPath,
  getWikiPagesPath,
  getWikiProvenanceIngestEventsPath,
  getWikiProvenancePath,
  getWikiProvenanceSourcesPath,
  getWikiQueriesPath,
  getWikiRawDescriptorsPath,
  getWikiRawPath,
  getWikiRawSourcesPath,
  getWikiReportsPath,
  getWikiWorkspacePath,
  isPathInsideOrEqual,
  normalizeComparablePath,
  resolveProjectPath,
};
