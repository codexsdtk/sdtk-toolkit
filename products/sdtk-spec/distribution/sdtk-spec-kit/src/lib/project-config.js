"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");

const SCHEMA_VERSION = 1;

const DEFAULT_EXCLUDES = [
  ".git",
  ".sdtk",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "target",
];

/**
 * Resolve and validate project path and output directory from parsed flags.
 *
 * Returns the canonical set of output paths for the .sdtk/project foundation
 * and the BK-084 staged doc synthesis workspace.
 *
 * @param {{ "project-path"?: string, "output-dir"?: string }} flags
 * @returns {{
 *   projectPath: string,
 *   outputDir: string,
 *   configPath: string,
 *   statePath: string,
 *   refreshStatePath: string,
 *   censusPath: string,
 *   inventoryPath: string,
 *   profilePath: string,
 *   moduleGraphPath: string,
 *   runtimeMarkersPath: string,
 *   evidencePacksDir: string,
 *   docBaselineDir: string,
 *   docBaselineDocsRoot: string,
 *   docSynthesisStatePath: string,
 *   excludes: string[],
 * }}
 */
function resolveProjectConfig(flags) {
  const rawPath = (flags && flags["project-path"]) || process.cwd();
  const projectPath = path.resolve(rawPath);

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new ValidationError(
      `Invalid --project-path: "${rawPath}" is not a valid directory.`
    );
  }

  const rawOutputDir = flags && flags["output-dir"];
  const outputDir = rawOutputDir
    ? path.resolve(rawOutputDir)
    : path.join(projectPath, ".sdtk", "project");

  const docBaselineDir = path.join(outputDir, "DOC_SYNTHESIS_BASELINE");

  return {
    projectPath,
    outputDir,
    configPath: path.join(outputDir, "config.json"),
    statePath: path.join(outputDir, "INGEST_STATE.json"),
    refreshStatePath: path.join(outputDir, "REFRESH_STATE.json"),
    censusPath: path.join(outputDir, "PROJECT_CENSUS.json"),
    inventoryPath: path.join(outputDir, "PROJECT_SOURCE_INVENTORY.json"),
    profilePath: path.join(outputDir, "PROJECT_PROFILE.json"),
    moduleGraphPath: path.join(outputDir, "PROJECT_MODULE_GRAPH.json"),
    runtimeMarkersPath: path.join(outputDir, "PROJECT_RUNTIME_MARKERS.json"),
    evidencePacksDir: path.join(outputDir, "PROJECT_EVIDENCE_PACKS"),
    docBaselineDir,
    docBaselineDocsRoot: path.join(docBaselineDir, "docs"),
    docSynthesisStatePath: path.join(outputDir, "DOC_SYNTHESIS_STATE.json"),
    excludes: DEFAULT_EXCLUDES.slice(),
  };
}

/**
 * Create the output directory if it does not exist and persist config.json.
 *
 * @param {ReturnType<typeof resolveProjectConfig>} config
 */
function writeProjectConfig(config) {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    excludes: config.excludes,
  };
  fs.writeFileSync(config.configPath, JSON.stringify(payload, null, 2), "utf8");
}

module.exports = {
  resolveProjectConfig,
  writeProjectConfig,
  DEFAULT_EXCLUDES,
};
