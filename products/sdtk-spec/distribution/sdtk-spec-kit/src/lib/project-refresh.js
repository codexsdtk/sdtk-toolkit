"use strict";

const fs = require("fs");
const path = require("path");
const { parseFlags } = require("./args");
const { resolveProjectConfig } = require("./project-config");
const { assertProjectRefreshTargetAllowed } = require("./project-target-guard");
const { loadPremiumHandler } = require("./premium-loader");

const CAPABILITY = "spec.project.refresh";
const SCHEMA_VERSION = "bk085-r1";
const ISSUE_ID = "BK-085";

const DOC_SYNTHESIS_SCHEMA_VERSION = 1;

const VALID_CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

// Required baseline files/dirs that must exist before refresh can run.
const REQUIRED_BASELINE_FILES = [
  "configPath",
  "statePath",
  "censusPath",
  "docSynthesisStatePath",
];
const REQUIRED_BASELINE_DIRS = [
  "docBaselineDir",
];

// Required staged docs that must still be present after refresh.
const REQUIRED_STAGED_DOCS = [
  "docs/product/PROJECT_BASELINE_SUMMARY.md",
  "docs/architecture/ARCH_DESIGN_PROJECT_BASELINE.md",
  "docs/database/DATABASE_SPEC_PROJECT_BASELINE.md",
  "docs/api/PROJECT_API_SURFACE_BASELINE.md",
  "docs/dev/PROJECT_RUNTIME_BASELINE.md",
];

// BK-088: Required system-level documentation pack.
// These four docs must remain coherent after every successful refresh.
const REQUIRED_SYSTEM_DOCS = [
  "docs/system/SYSTEM_CONTEXT.md",
  "docs/system/MODULE_MAP.md",
  "docs/system/INTEGRATION_CATALOG.md",
  "docs/system/DEPLOYMENT_TOPOLOGY.md",
];

const REFRESH_FLAG_DEFS = {
  "project-path": { type: "string" },
  "output-dir": { type: "string" },
  json: { type: "boolean" },
};

/**
 * Return true when relPath is a safe relative path that stays inside baseDir.
 *
 * Rejects absolute paths, paths containing ".." segments, and paths that
 * resolve outside baseDir after normalization.
 *
 * @param {string} relPath
 * @param {string} baseDir - absolute path used as the containment root
 * @returns {boolean}
 */
function isSafeRelativeStagedPath(relPath, baseDir) {
  if (!relPath || typeof relPath !== "string") return false;
  if (path.isAbsolute(relPath)) return false;
  const parts = relPath.replace(/\\/g, "/").split("/");
  for (const part of parts) {
    if (part === "..") return false;
  }
  const normalizedBase = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, relPath);
  return (
    resolved === normalizedBase ||
    resolved.startsWith(normalizedBase + path.sep)
  );
}

/**
 * Validate a single staged doc entry returned by the refresh handler.
 *
 * @param {string} relPath
 * @param {*} entry
 * @param {string} docBaselineDir - absolute path used for path-safety check
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateRefreshEntry(relPath, entry, docBaselineDir) {
  if (!isSafeRelativeStagedPath(relPath, docBaselineDir)) {
    return {
      valid: false,
      reason: `staged doc path is invalid or unsafe: "${relPath}"`,
    };
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {
      valid: false,
      reason: `docBaseline.files["${relPath}"] must be a plain object`,
    };
  }
  if (typeof entry.content !== "string" || entry.content.trim() === "") {
    return {
      valid: false,
      reason: `docBaseline.files["${relPath}"].content must be a non-empty string`,
    };
  }
  if (!Array.isArray(entry.sourcePacks) || entry.sourcePacks.length === 0) {
    return {
      valid: false,
      reason: `docBaseline.files["${relPath}"].sourcePacks must be a non-empty array`,
    };
  }
  if (!VALID_CONFIDENCE_VALUES.has(entry.confidence)) {
    return {
      valid: false,
      reason: `docBaseline.files["${relPath}"].confidence must be low, medium, or high`,
    };
  }
  if (entry.reviewRequired !== true) {
    return {
      valid: false,
      reason: `docBaseline.files["${relPath}"].reviewRequired must be true`,
    };
  }
  if (!Array.isArray(entry.nonClaims)) {
    return {
      valid: false,
      reason: `docBaseline.files["${relPath}"].nonClaims must be an array`,
    };
  }
  return { valid: true };
}

/**
 * Load existing DOC_SYNTHESIS_STATE.json to get the list of previously managed doc paths.
 *
 * Returns a Set of relative doc paths that were previously managed (relative to docBaselineDir).
 *
 * @param {{ docSynthesisStatePath: string }} config
 * @returns {Set<string>}
 */
function loadExistingManagedDocState(config) {
  try {
    const raw = fs.readFileSync(config.docSynthesisStatePath, "utf8");
    const state = JSON.parse(raw);
    const managed = new Set();
    if (state && typeof state === "object" && state.docSources) {
      for (const relPath of Object.keys(state.docSources)) {
        managed.add(relPath);
      }
    }
    return managed;
  } catch (_) {
    return new Set();
  }
}

/**
 * Validate the full refresh result contract returned by the premium handler.
 *
 * @param {*} result
 * @param {{ docBaselineDir: string }} config
 * @param {Set<string>} previousDocState - previously managed doc paths
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateRefreshResult(result, config, previousDocState) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, reason: "result is not an object" };
  }

  // All BK-084 top-level objects remain required.
  const requiredObjects = [
    "census",
    "inventory",
    "profile",
    "moduleGraph",
    "runtimeMarkers",
    "evidencePacks",
    "docBaseline",
    "summary",
  ];
  for (const key of requiredObjects) {
    if (!(key in result)) {
      return { valid: false, reason: `missing required key: ${key}` };
    }
    const val = result[key];
    if (!val || typeof val !== "object" || Array.isArray(val)) {
      return { valid: false, reason: `${key} must be a plain object` };
    }
  }

  // New top-level refresh object is required.
  if (!("refresh" in result)) {
    return { valid: false, reason: "missing required key: refresh" };
  }
  const refresh = result.refresh;
  if (!refresh || typeof refresh !== "object" || Array.isArray(refresh)) {
    return { valid: false, reason: "refresh must be a plain object" };
  }

  // refresh.sourceMode must equal "incremental-managed-refresh".
  if (refresh.sourceMode !== "incremental-managed-refresh") {
    return {
      valid: false,
      reason: `refresh.sourceMode must be "incremental-managed-refresh", got "${refresh.sourceMode}"`,
    };
  }

  // refresh.changedFiles and refresh.removedSourceFiles must be integers >= 0.
  if (
    typeof refresh.changedFiles !== "number" ||
    !Number.isInteger(refresh.changedFiles) ||
    refresh.changedFiles < 0
  ) {
    return {
      valid: false,
      reason: "refresh.changedFiles must be an integer >= 0",
    };
  }
  if (
    typeof refresh.removedSourceFiles !== "number" ||
    !Number.isInteger(refresh.removedSourceFiles) ||
    refresh.removedSourceFiles < 0
  ) {
    return {
      valid: false,
      reason: "refresh.removedSourceFiles must be an integer >= 0",
    };
  }

  // refresh.affectedEvidencePacks, refresh.regeneratedDocs, refresh.removedDocs must be arrays.
  if (!Array.isArray(refresh.affectedEvidencePacks)) {
    return { valid: false, reason: "refresh.affectedEvidencePacks must be an array" };
  }
  if (!Array.isArray(refresh.regeneratedDocs)) {
    return { valid: false, reason: "refresh.regeneratedDocs must be an array" };
  }
  if (!Array.isArray(refresh.removedDocs)) {
    return { valid: false, reason: "refresh.removedDocs must be an array" };
  }

  // Validate docBaseline block.
  const docBaseline = result.docBaseline;
  if (
    !docBaseline.files ||
    typeof docBaseline.files !== "object" ||
    Array.isArray(docBaseline.files)
  ) {
    return { valid: false, reason: "docBaseline.files must be a plain object" };
  }
  if (
    !docBaseline.summary ||
    typeof docBaseline.summary !== "object" ||
    Array.isArray(docBaseline.summary)
  ) {
    return { valid: false, reason: "docBaseline.summary must be a plain object" };
  }

  // Validate each file entry in docBaseline.files.
  for (const [relPath, entry] of Object.entries(docBaseline.files)) {
    const entryResult = validateRefreshEntry(relPath, entry, config.docBaselineDir);
    if (!entryResult.valid) return entryResult;
  }

  // Validate every path in refresh.removedDocs is safe under DOC_SYNTHESIS_BASELINE/docs/.
  for (const removedPath of refresh.removedDocs) {
    if (!isSafeRelativeStagedPath(removedPath, config.docBaselineDir)) {
      return {
        valid: false,
        reason: `managed staged-doc path is invalid or unsafe in removedDocs: "${removedPath}"`,
      };
    }
  }

  // docBaseline.summary.removedFiles, when present, must equal refresh.removedDocs.
  if (Array.isArray(docBaseline.summary.removedFiles)) {
    const summaryRemoved = docBaseline.summary.removedFiles;
    const contractRemoved = refresh.removedDocs;
    const summarySet = new Set(summaryRemoved);
    const contractSet = new Set(contractRemoved);
    for (const p of contractSet) {
      if (!summarySet.has(p)) {
        return {
          valid: false,
          reason: `docBaseline.summary.removedFiles does not match refresh.removedDocs: "${p}" missing from summary`,
        };
      }
    }
    for (const p of summarySet) {
      if (!contractSet.has(p)) {
        return {
          valid: false,
          reason: `docBaseline.summary.removedFiles does not match refresh.removedDocs: "${p}" missing from contract`,
        };
      }
    }
  }

  // Required staged docs must remain present after refresh (unless handler explicitly listed them in removedDocs).
  const removedSet = new Set(refresh.removedDocs);
  for (const requiredDoc of REQUIRED_STAGED_DOCS) {
    if (removedSet.has(requiredDoc)) {
      return {
        valid: false,
        reason: `required staged doc must not be removed: ${requiredDoc}`,
      };
    }
    if (!(requiredDoc in docBaseline.files)) {
      return {
        valid: false,
        reason: `missing required staged doc in refresh result: ${requiredDoc}`,
      };
    }
  }

  // Required system-level docs (BK-088) must remain complete after refresh.
  for (const requiredDoc of REQUIRED_SYSTEM_DOCS) {
    if (removedSet.has(requiredDoc)) {
      return {
        valid: false,
        reason: `required staged system doc must not be removed: ${requiredDoc}`,
      };
    }
    if (!(requiredDoc in docBaseline.files)) {
      return {
        valid: false,
        reason: `missing required staged system doc in refresh result: ${requiredDoc}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Safely delete stale managed staged-doc files.
 *
 * A file is deleted only when:
 *   1. Its path is safe under the managed staged root (docBaselineDir).
 *   2. It was previously recorded as managed in DOC_SYNTHESIS_STATE.json.
 *   3. It is listed in the validated refresh.removedDocs set.
 *
 * @param {{ docBaselineDir: string }} config
 * @param {Set<string>} previousDocState
 * @param {string[]} removedDocs
 * @returns {{ deleted: string[], skipped: string[], error: string|null }}
 */
function deleteRemovedManagedDocs(config, previousDocState, removedDocs) {
  const deleted = [];
  const skipped = [];

  for (const relPath of removedDocs) {
    // Safety: must be a safe relative path inside the managed staged root.
    if (!isSafeRelativeStagedPath(relPath, config.docBaselineDir)) {
      return { deleted, skipped, error: `unsafe staged-doc path: "${relPath}"` };
    }
    // Must have been previously managed.
    if (!previousDocState.has(relPath)) {
      skipped.push(relPath);
      continue;
    }
    const fullPath = path.join(config.docBaselineDir, relPath);
    if (!fs.existsSync(fullPath)) {
      skipped.push(relPath);
      continue;
    }
    try {
      fs.unlinkSync(fullPath);
      deleted.push(relPath);
    } catch (err) {
      return { deleted, skipped, error: `failed to delete "${relPath}": ${err.message}` };
    }
  }

  return { deleted, skipped, error: null };
}

/**
 * Print deterministic human-readable refresh summary.
 *
 * @param {*} result
 * @param {{ outputDir: string, docBaselineDir: string }} config
 * @param {string[]} deletedDocs
 */
function renderHumanRefresh(result, config, deletedDocs) {
  const refresh = result.refresh;
  const s = result.summary;
  console.log("[project refresh] Incremental managed refresh complete.");
  console.log(`  Source mode:       ${refresh.sourceMode}`);
  console.log(`  Changed files:     ${refresh.changedFiles}`);
  console.log(`  Removed sources:   ${refresh.removedSourceFiles}`);
  if (refresh.affectedEvidencePacks.length > 0) {
    console.log(`  Affected packs:    ${refresh.affectedEvidencePacks.join(", ")}`);
  } else {
    console.log(`  Affected packs:    0`);
  }
  if (typeof s.regeneratedDocs === "number") {
    console.log(`  Regenerated docs:  ${s.regeneratedDocs}`);
  } else if (refresh.regeneratedDocs.length > 0) {
    console.log(`  Regenerated docs:  ${refresh.regeneratedDocs.length}`);
  }
  if (deletedDocs.length > 0) {
    console.log(`  Removed docs:      ${deletedDocs.length} (${deletedDocs.join(", ")})`);
  }
  console.log(`  Output dir:        ${config.outputDir}`);
  console.log(`  Staged baseline:   ${config.docBaselineDir}`);
  console.log(`  Note: live /docs/ was not modified.`);
}

/**
 * Execute sdtk-spec project refresh premium command.
 *
 * Flow:
 *   1. Parse flags and resolve project config / output paths.
 *   2. Reject the SDTK maintainer monorepo root via the target guard.
 *   3. Verify required managed ingest baseline exists.
 *   4. Load and verify the premium handler via loadPremiumHandler.
 *   5. Build bounded refresh context object (mode: incremental-refresh).
 *   6. Execute the premium handler.
 *   7. Validate the returned refresh-result contract.
 *   8. Load existing managed doc state (for stale deletion).
 *   9. Rewrite managed foundation JSON outputs.
 *  10. Rewrite evidence packs.
 *  11. Rewrite staged docs under DOC_SYNTHESIS_BASELINE/docs/...
 *  12. Remove stale managed staged docs.
 *  13. Rewrite INGEST_STATE.json, DOC_SYNTHESIS_STATE.json, REFRESH_STATE.json.
 *  14. Print human or JSON summary.
 *
 * @param {string[]} args - Remaining argv after "project refresh"
 * @returns {Promise<number>} CLI exit code
 */
async function runProjectRefresh(args) {
  const { flags } = parseFlags(args, REFRESH_FLAG_DEFS);

  // 1. Resolve project config and canonical output paths.
  let config;
  try {
    config = resolveProjectConfig(flags);
  } catch (err) {
    console.error(`[project refresh] ${err.message}`);
    return 1;
  }

  // 2. Reject maintainer repo root as refresh target.
  try {
    assertProjectRefreshTargetAllowed("sdtk-spec", "refresh", config.projectPath);
  } catch (err) {
    console.error(`[project refresh] ${err.message}`);
    return 1;
  }

  // 3. Verify required managed ingest baseline exists.
  for (const key of REQUIRED_BASELINE_FILES) {
    if (!fs.existsSync(config[key])) {
      console.error(
        `[project refresh] project refresh requires a prior "sdtk-spec project ingest" run. ` +
        `Missing managed workspace file: ${config[key]}. ` +
        `Run "sdtk-spec project ingest --project-path ${config.projectPath}" first.`
      );
      return 1;
    }
  }
  for (const key of REQUIRED_BASELINE_DIRS) {
    if (!fs.existsSync(config[key])) {
      console.error(
        `[project refresh] project refresh requires a prior "sdtk-spec project ingest" run. ` +
        `Missing managed workspace directory: ${config[key]}. ` +
        `Run "sdtk-spec project ingest --project-path ${config.projectPath}" first.`
      );
      return 1;
    }
  }

  // 4. Load and verify premium handler (entitlement + pack verification).
  const loaderResult = await loadPremiumHandler(CAPABILITY, "projectRefresh");
  if (!loaderResult.ok) {
    console.error(`[project refresh] ${loaderResult.message}`);
    return loaderResult.exitCode;
  }

  // 5. Build bounded refresh context object.
  const context = {
    capability: CAPABILITY,
    mode: "incremental-refresh",
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    configPath: config.configPath,
    statePath: config.statePath,
    refreshStatePath: config.refreshStatePath,
    censusPath: config.censusPath,
    inventoryPath: config.inventoryPath,
    profilePath: config.profilePath,
    moduleGraphPath: config.moduleGraphPath,
    runtimeMarkersPath: config.runtimeMarkersPath,
    evidencePacksDir: config.evidencePacksDir,
    docBaselineDir: config.docBaselineDir,
    docBaselineDocsRoot: config.docBaselineDocsRoot,
    docSynthesisStatePath: config.docSynthesisStatePath,
    json: !!flags.json,
    argv: args,
  };

  // 6. Execute premium handler.
  let result;
  try {
    result = await loaderResult.handler(context);
  } catch (err) {
    console.error(`[project refresh] Premium pack handler error: ${err.message}`);
    return 4;
  }

  // 7. Validate refresh-result contract.
  // Load previous doc state before validation so we can use it in stale-deletion.
  const previousDocState = loadExistingManagedDocState(config);
  const validation = validateRefreshResult(result, config, previousDocState);
  if (!validation.valid) {
    console.error(
      `[project refresh] Premium pack output contract is invalid: ${validation.reason}`
    );
    return 3;
  }

  // 8. Rewrite managed foundation JSON outputs.
  try {
    fs.writeFileSync(config.censusPath, JSON.stringify(result.census, null, 2), "utf8");
    fs.writeFileSync(config.inventoryPath, JSON.stringify(result.inventory, null, 2), "utf8");
    fs.writeFileSync(config.profilePath, JSON.stringify(result.profile, null, 2), "utf8");
    fs.writeFileSync(config.moduleGraphPath, JSON.stringify(result.moduleGraph, null, 2), "utf8");
    fs.writeFileSync(config.runtimeMarkersPath, JSON.stringify(result.runtimeMarkers, null, 2), "utf8");
  } catch (writeErr) {
    console.error(`[project refresh] Foundation write error: ${writeErr.message}`);
    return 4;
  }

  // 9. Rewrite evidence packs.
  try {
    if (!fs.existsSync(config.evidencePacksDir)) {
      fs.mkdirSync(config.evidencePacksDir, { recursive: true });
    }
    for (const [packKey, packData] of Object.entries(result.evidencePacks)) {
      const packFileName = `${packKey}.pack.json`;
      fs.writeFileSync(
        path.join(config.evidencePacksDir, packFileName),
        JSON.stringify(packData, null, 2),
        "utf8"
      );
    }
  } catch (writeErr) {
    console.error(`[project refresh] Evidence pack write error: ${writeErr.message}`);
    return 4;
  }

  // 10. Rewrite staged docs under DOC_SYNTHESIS_BASELINE/docs/...
  for (const [relPath, entry] of Object.entries(result.docBaseline.files)) {
    const fullPath = path.join(config.docBaselineDir, relPath);
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    try {
      fs.writeFileSync(fullPath, entry.content, "utf8");
    } catch (writeErr) {
      console.error(
        `[project refresh] Doc materialization error for "${relPath}": ${writeErr.message}`
      );
      return 4;
    }
  }

  // 11. Remove stale managed staged docs that are listed in refresh.removedDocs
  //     only when they were previously managed.
  const deleteResult = deleteRemovedManagedDocs(
    config,
    previousDocState,
    result.refresh.removedDocs
  );
  if (deleteResult.error) {
    console.error(`[project refresh] Stale doc removal error: ${deleteResult.error}`);
    return 4;
  }

  // 12. Rewrite INGEST_STATE.json.
  const ingestState = {
    schemaVersion: SCHEMA_VERSION,
    issueId: ISSUE_ID,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    refreshedAt: new Date().toISOString(),
    summary: result.summary,
  };
  try {
    fs.writeFileSync(config.statePath, JSON.stringify(ingestState, null, 2), "utf8");
  } catch (writeErr) {
    console.error(`[project refresh] INGEST_STATE.json write error: ${writeErr.message}`);
    return 4;
  }

  // 13. Rewrite DOC_SYNTHESIS_STATE.json.
  const docSources = {};
  for (const [relPath, entry] of Object.entries(result.docBaseline.files)) {
    docSources[relPath] = entry.sourcePacks;
  }
  const docSynthesisState = {
    schemaVersion: DOC_SYNTHESIS_SCHEMA_VERSION,
    issueId: ISSUE_ID,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    docBaselineDir: config.docBaselineDir,
    refreshedAt: new Date().toISOString(),
    docSources,
    removedDocs: result.refresh.removedDocs,
    summary: result.docBaseline.summary,
  };
  try {
    fs.writeFileSync(
      config.docSynthesisStatePath,
      JSON.stringify(docSynthesisState, null, 2),
      "utf8"
    );
  } catch (writeErr) {
    console.error(`[project refresh] DOC_SYNTHESIS_STATE.json write error: ${writeErr.message}`);
    return 4;
  }

  // 14. Write REFRESH_STATE.json.
  const refreshState = {
    schemaVersion: SCHEMA_VERSION,
    issueId: ISSUE_ID,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    refreshedAt: new Date().toISOString(),
    sourceMode: result.refresh.sourceMode,
    changedFiles: result.refresh.changedFiles,
    removedSourceFiles: result.refresh.removedSourceFiles,
    affectedEvidencePacks: result.refresh.affectedEvidencePacks,
    regeneratedDocs: result.refresh.regeneratedDocs,
    removedDocs: result.refresh.removedDocs,
    summary: result.summary,
  };
  try {
    fs.writeFileSync(
      config.refreshStatePath,
      JSON.stringify(refreshState, null, 2),
      "utf8"
    );
  } catch (writeErr) {
    console.error(`[project refresh] REFRESH_STATE.json write error: ${writeErr.message}`);
    return 4;
  }

  // 15. Print summary.
  if (flags.json) {
    const jsonOut = {
      refresh: result.refresh,
      summary: result.summary,
      outputDir: config.outputDir,
      docBaselineDir: config.docBaselineDir,
      refreshStatePath: config.refreshStatePath,
    };
    console.log(JSON.stringify(jsonOut));
  } else {
    renderHumanRefresh(result, config, deleteResult.deleted);
  }

  return 0;
}

module.exports = { runProjectRefresh };
