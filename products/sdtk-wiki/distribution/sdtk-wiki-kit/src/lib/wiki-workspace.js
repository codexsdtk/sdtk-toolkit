"use strict";

const fs = require("fs");
const path = require("path");
const {
  assertPathInsideOrEqual,
  getLegacyAtlasPath,
  getWikiGraphPath,
  getWikiLogsPath,
  getWikiManifestPath,
  getWikiPagesPath,
  getWikiRawDescriptorsPath,
  getWikiRawPath,
  getWikiRawSourcesPath,
  getWikiProvenanceIngestEventsPath,
  getWikiProvenancePath,
  getWikiProvenanceSourcesPath,
  getWikiQueriesPath,
  getWikiReportsPath,
  getWikiWorkspacePath,
} = require("./wiki-paths");

const WIKI_WORKSPACE_SCHEMA_VERSION = 1;

const RESERVED_DIRECTORIES = [
  "graph",
  "pages",
  "raw",
  "provenance",
  "queries",
  "reports",
  "logs",
];

function nowIso() {
  return new Date().toISOString();
}

function describeWorkspace(projectPath, graphRoot) {
  return {
    workspaceRoot: getWikiWorkspacePath(projectPath),
    manifestPath: getWikiManifestPath(projectPath),
    graphRoot: graphRoot || getWikiGraphPath(projectPath),
    defaultGraphRoot: getWikiGraphPath(projectPath),
    pagesRoot: getWikiPagesPath(projectPath),
    rawRoot: getWikiRawPath(projectPath),
    rawDescriptorsRoot: getWikiRawDescriptorsPath(projectPath),
    rawSourcesPath: getWikiRawSourcesPath(projectPath),
    provenanceRoot: getWikiProvenancePath(projectPath),
    provenanceIngestEventsPath: getWikiProvenanceIngestEventsPath(projectPath),
    provenanceSourcesPath: getWikiProvenanceSourcesPath(projectPath),
    queriesRoot: getWikiQueriesPath(projectPath),
    reportsRoot: getWikiReportsPath(projectPath),
    logsRoot: getWikiLogsPath(projectPath),
    legacyAtlasRoot: getLegacyAtlasPath(projectPath),
  };
}

function assertInsideWorkspace(targetPath, workspaceRoot) {
  return assertPathInsideOrEqual(
    targetPath,
    workspaceRoot,
    "Refusing to write outside SDTK-WIKI workspace"
  );
}

function readWorkspaceManifest(projectPath) {
  const manifestPath = getWikiManifestPath(projectPath);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (_) {
    return null;
  }
}

function buildManifest(projectPath, graphRoot, existingManifest) {
  const workspace = describeWorkspace(projectPath, graphRoot);
  const timestamp = nowIso();
  const createdAt =
    existingManifest && typeof existingManifest.createdAt === "string"
      ? existingManifest.createdAt
      : timestamp;

  return {
    schemaVersion: WIKI_WORKSPACE_SCHEMA_VERSION,
    product: "SDTK-WIKI",
    workspaceRoot: workspace.workspaceRoot,
    graphRoot: workspace.graphRoot,
    legacyAtlasRoot: workspace.legacyAtlasRoot,
    createdAt,
    updatedAt: timestamp,
    features: {
      graph: true,
      pages: false,
      raw: true,
      queries: false,
      reports: false,
    },
  };
}

function ensureWorkspace(projectPath, graphRoot) {
  const workspace = describeWorkspace(projectPath, graphRoot);
  fs.mkdirSync(workspace.workspaceRoot, { recursive: true });

  for (const dirName of RESERVED_DIRECTORIES) {
    const target = path.join(workspace.workspaceRoot, dirName);
    assertInsideWorkspace(target, workspace.workspaceRoot);
    fs.mkdirSync(target, { recursive: true });
  }

  const existingManifest = readWorkspaceManifest(projectPath);
  const manifest = buildManifest(projectPath, graphRoot, existingManifest);
  assertInsideWorkspace(workspace.manifestPath, workspace.workspaceRoot);
  fs.writeFileSync(workspace.manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  return {
    manifest,
    workspace,
  };
}

function getWorkspaceStatus(projectPath) {
  const workspace = describeWorkspace(projectPath);
  const manifest = readWorkspaceManifest(projectPath);
  return {
    exists: fs.existsSync(workspace.workspaceRoot),
    manifestExists: fs.existsSync(workspace.manifestPath),
    schemaVersion: manifest ? manifest.schemaVersion : null,
    manifest,
    workspace,
  };
}

module.exports = {
  RESERVED_DIRECTORIES,
  WIKI_WORKSPACE_SCHEMA_VERSION,
  buildManifest,
  describeWorkspace,
  ensureWorkspace,
  getWorkspaceStatus,
  readWorkspaceManifest,
};
