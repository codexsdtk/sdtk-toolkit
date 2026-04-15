"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");

const CONFIG_SCHEMA_VERSION = 1;
const DEFAULT_PORT = 8765;
const DEFAULT_HOST = "127.0.0.1";

const DEFAULT_EXCLUDES = [
  ".git",
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

/**
 * Resolve Atlas configuration from CLI flags and optional persisted config.
 *
 * Priority: CLI flags > persisted config > defaults.
 *
 * @param {Object} flags - Parsed CLI flags.
 * @returns {AtlasConfig}
 */
function resolveAtlasConfig(flags) {
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new ValidationError(
      `--project-path is not a valid directory: ${projectPath}`
    );
  }

  const defaultOutputDir = path.join(projectPath, ".sdtk", "atlas");
  const outputDir = flags["output-dir"]
    ? path.resolve(flags["output-dir"])
    : defaultOutputDir;

  // Read persisted config if it exists
  const configPath = path.join(outputDir, "config.json");
  let persisted = {};
  if (fs.existsSync(configPath)) {
    try {
      persisted = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (_) {
      // ignore corrupt config, use defaults
    }
  }

  // Resolve scan roots: CLI flag > persisted > [projectPath]
  let scanRoots;
  if (flags["scan-root"] && flags["scan-root"].length > 0) {
    scanRoots = flags["scan-root"].map((r) => path.resolve(r));
  } else if (persisted.scanRoots && Array.isArray(persisted.scanRoots) && persisted.scanRoots.length > 0) {
    scanRoots = persisted.scanRoots.map((r) => path.resolve(r));
  } else {
    scanRoots = [projectPath];
  }

  const excludes =
    persisted.excludes && Array.isArray(persisted.excludes)
      ? persisted.excludes
      : DEFAULT_EXCLUDES.slice();

  const host = flags["host"] || persisted.host || DEFAULT_HOST;
  const port = flags["port"]
    ? parseInt(flags["port"], 10)
    : persisted.port || DEFAULT_PORT;

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ValidationError(`Invalid --port value: ${flags["port"]}`);
  }

  return {
    projectPath,
    outputDir,
    configPath,
    scanRoots,
    excludes,
    host,
    port,
    verbose: !!flags.verbose,
  };
}

/**
 * Write the persisted Atlas config to .sdtk/atlas/config.json.
 * Creates the output directory if it does not exist.
 *
 * @param {Object} config - Atlas config object from resolveAtlasConfig.
 */
function writeAtlasConfig(config) {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const payload = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    scanRoots: config.scanRoots,
    excludes: config.excludes,
    host: config.host,
    port: config.port,
  };

  fs.writeFileSync(config.configPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

/**
 * Check whether Atlas has been initialized (config.json exists).
 *
 * @param {string} outputDir
 * @returns {boolean}
 */
function isAtlasInitialized(outputDir) {
  return fs.existsSync(path.join(outputDir, "config.json"));
}

/**
 * Check whether a successful Atlas build exists (index artifact present).
 *
 * @param {string} outputDir
 * @returns {boolean}
 */
function isAtlasBuilt(outputDir) {
  return (
    fs.existsSync(path.join(outputDir, "SDTK_DOC_INDEX.json")) &&
    fs.existsSync(path.join(outputDir, "viewer.html"))
  );
}

/**
 * Read last build metadata from SDTK_DOC_INDEX.json if it exists.
 *
 * @param {string} outputDir
 * @returns {{ generated: string, count: number } | null}
 */
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

/**
 * Read last graph metadata from SDTK_DOC_GRAPH.json if it exists.
 *
 * @param {string} outputDir
 * @returns {{ nodeCount: number, edgeCount: number } | null}
 */
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

/**
 * Resolve the path to the packaged atlas builder Python script.
 *
 * @returns {string} Absolute path to build_atlas.py.
 */
function resolveBuilderPath() {
  const p = path.resolve(__dirname, "..", "..", "assets", "atlas", "build_atlas.py");
  return p;
}

module.exports = {
  resolveAtlasConfig,
  writeAtlasConfig,
  isAtlasInitialized,
  isAtlasBuilt,
  readBuildMeta,
  readGraphMeta,
  resolveBuilderPath,
  DEFAULT_EXCLUDES,
  DEFAULT_PORT,
  DEFAULT_HOST,
};
