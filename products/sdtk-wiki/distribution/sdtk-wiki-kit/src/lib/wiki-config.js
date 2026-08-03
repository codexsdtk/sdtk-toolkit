"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const {
  getLegacyAtlasPath,
  getWikiGraphPath,
  getWikiWorkspacePath,
  isPathInsideOrEqual,
} = require("./wiki-paths");

const CONFIG_SCHEMA_VERSION = 1;
const DEFAULT_PORT = 8765;
const DEFAULT_HOST = "127.0.0.1";

const DEFAULT_EXCLUDES = [
  ".git",
  ".sdtk/wiki",
  ".sdtk/atlas",
  "node_modules",
  ".venv",
  "venv",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
];

function resolveWikiConfig(flags = {}) {
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new ValidationError(`--project-path is not a valid directory: ${projectPath}`);
  }

  const defaultOutputDir = getWikiGraphPath(projectPath);
  const outputDir = flags["output-dir"]
    ? path.resolve(flags["output-dir"])
    : defaultOutputDir;
  const workspaceRoot = getWikiWorkspacePath(projectPath);
  if (!isPathInsideOrEqual(outputDir, workspaceRoot)) {
    throw new ValidationError(
      `--output-dir must stay under project-local .sdtk/wiki workspace: ${outputDir}`
    );
  }
  const configPath = path.join(outputDir, "config.json");
  const legacyAtlasDir = getLegacyAtlasPath(projectPath);

  let persisted = {};
  if (fs.existsSync(configPath)) {
    try {
      persisted = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (_) {
      persisted = {};
    }
  }

  let scanRoots;
  if (flags["scan-root"] && flags["scan-root"].length > 0) {
    scanRoots = flags["scan-root"].map((r) => path.resolve(r));
  } else if (
    persisted.scanRoots &&
    Array.isArray(persisted.scanRoots) &&
    persisted.scanRoots.length > 0
  ) {
    // BK-330: persisted roots are project-relative so a committed config
    // builds correctly from any checkout path. Absolute entries (legacy
    // configs) still resolve as-is on the machine that wrote them.
    scanRoots = persisted.scanRoots.map((r) =>
      path.isAbsolute(r) ? r : path.resolve(projectPath, r)
    );
  } else {
    const docsDir = path.join(projectPath, "docs");
    const hasDocsDir = fs.existsSync(docsDir) && fs.statSync(docsDir).isDirectory();
    scanRoots = [hasDocsDir ? docsDir : projectPath];
  }

  const excludes =
    persisted.excludes && Array.isArray(persisted.excludes)
      ? persisted.excludes
      : DEFAULT_EXCLUDES.slice();

  // BK-325: archive-tier path fragments (same matching semantics as
  // excludes). Empty by default — tiering is a per-project opt-in.
  const archive =
    persisted.archive && Array.isArray(persisted.archive)
      ? persisted.archive
      : [];

  const host = flags.host || persisted.host || DEFAULT_HOST;
  const port = flags.port
    ? parseInt(flags.port, 10)
    : persisted.port || DEFAULT_PORT;

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new ValidationError(`Invalid --port value: ${flags.port}`);
  }

  return {
    projectPath,
    outputDir,
    configPath,
    legacyAtlasDir,
    scanRoots,
    excludes,
    archive,
    host,
    port,
    tunnel: !!flags.tunnel,
    verbose: !!flags.verbose,
  };
}

// BK-330: store roots project-relative (posix) when they live inside the
// project, so the committed config is portable across checkout paths. Roots
// outside the project stay absolute (they are machine-specific by nature).
function relativizeRoot(root, projectPath) {
  const resolved = path.resolve(root);
  const relative = path.relative(projectPath, resolved);
  if (relative === "") return ".";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return resolved;
  return relative.split(path.sep).join("/");
}

function writeWikiConfig(config) {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const payload = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    product: "SDTK-WIKI",
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    legacyAtlasDir: config.legacyAtlasDir,
    scanRoots: config.scanRoots.map((r) => relativizeRoot(r, config.projectPath)),
    excludes: config.excludes,
    archive: config.archive || [],
    host: config.host,
    port: config.port,
  };

  fs.writeFileSync(config.configPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

function isWikiInitialized(outputDir) {
  return fs.existsSync(path.join(outputDir, "config.json"));
}

function isWikiBuilt(outputDir) {
  return (
    fs.existsSync(path.join(outputDir, "SDTK_DOC_INDEX.json")) &&
    fs.existsSync(path.join(outputDir, "viewer.html"))
  );
}

function isLegacyAtlasBuilt(projectPath) {
  const legacyDir = getLegacyAtlasPath(projectPath);
  return isWikiBuilt(legacyDir);
}

function readBuildMeta(outputDir) {
  const indexPath = path.join(outputDir, "SDTK_DOC_INDEX.json");
  if (!fs.existsSync(indexPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    return { generated: data.generated || null, count: data.count || 0 };
  } catch (_) {
    return null;
  }
}

function readGraphMeta(outputDir) {
  const graphPath = path.join(outputDir, "SDTK_DOC_GRAPH.json");
  if (!fs.existsSync(graphPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
    return {
      nodeCount: data.node_count || 0,
      edgeCount: data.edge_count || 0,
    };
  } catch (_) {
    return null;
  }
}

function resolveBuilderPath() {
  return path.resolve(__dirname, "..", "..", "assets", "atlas", "build_atlas.py");
}

module.exports = {
  CONFIG_SCHEMA_VERSION,
  DEFAULT_EXCLUDES,
  DEFAULT_HOST,
  DEFAULT_PORT,
  isLegacyAtlasBuilt,
  isWikiBuilt,
  isWikiInitialized,
  readBuildMeta,
  readGraphMeta,
  resolveBuilderPath,
  resolveWikiConfig,
  writeWikiConfig,
};
