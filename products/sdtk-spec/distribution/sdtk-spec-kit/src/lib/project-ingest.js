"use strict";

const fs = require("fs");
const path = require("path");
const { parseFlags } = require("./args");
const { resolveProjectConfig, writeProjectConfig } = require("./project-config");
const { assertProjectRefreshTargetAllowed } = require("./project-target-guard");
const { loadPremiumHandler } = require("./premium-loader");

const CAPABILITY = "spec.project.ingest";
const SCHEMA_VERSION = "bk083-r1";
const ISSUE_ID = "BK-083";

const DOC_SYNTHESIS_SCHEMA_VERSION = 1;
const DOC_SYNTHESIS_ISSUE_ID = "BK-084";

const REQUIRED_STAGED_DOCS = [
  "docs/product/PROJECT_BASELINE_SUMMARY.md",
  "docs/architecture/ARCH_DESIGN_PROJECT_BASELINE.md",
  "docs/database/DATABASE_SPEC_PROJECT_BASELINE.md",
  "docs/api/PROJECT_API_SURFACE_BASELINE.md",
  "docs/dev/PROJECT_RUNTIME_BASELINE.md",
];

const OPTIONAL_STAGED_DOCS = [
  "docs/design/PROJECT_UI_INVENTORY_BASELINE.md",
  "docs/qa/PROJECT_TESTING_BASELINE.md",
];

// BK-088: Required system-level documentation pack.
// These four docs must be present in every successful ingest result.
const REQUIRED_SYSTEM_DOCS = [
  "docs/system/SYSTEM_CONTEXT.md",
  "docs/system/MODULE_MAP.md",
  "docs/system/INTEGRATION_CATALOG.md",
  "docs/system/DEPLOYMENT_TOPOLOGY.md",
];

const VALID_CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

const INGEST_FLAG_DEFS = {
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
  // Reject any ".." segment in the raw path string (covers backslash variants too)
  const parts = relPath.replace(/\\/g, "/").split("/");
  for (const part of parts) {
    if (part === "..") return false;
  }
  // Confirm the resolved path is contained inside baseDir
  const normalizedBase = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, relPath);
  return (
    resolved === normalizedBase ||
    resolved.startsWith(normalizedBase + path.sep)
  );
}

/**
 * Validate a single staged doc entry.
 *
 * @param {string} relPath
 * @param {*} entry
 * @param {string} docBaselineDir - absolute path used for path-safety check
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateDocBaselineEntry(relPath, entry, docBaselineDir) {
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
 * Validate the docBaseline block returned by the premium handler.
 *
 * @param {*} docBaseline
 * @param {string} docBaselineDir - absolute path used for per-entry path-safety checks
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateDocBaseline(docBaseline, docBaselineDir) {
  if (!docBaseline || typeof docBaseline !== "object" || Array.isArray(docBaseline)) {
    return { valid: false, reason: "docBaseline must be a plain object" };
  }
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
  // Validate each file entry
  for (const [relPath, entry] of Object.entries(docBaseline.files)) {
    const entryResult = validateDocBaselineEntry(relPath, entry, docBaselineDir);
    if (!entryResult.valid) return entryResult;
  }
  // All required staged docs must be present
  for (const requiredDoc of REQUIRED_STAGED_DOCS) {
    if (!(requiredDoc in docBaseline.files)) {
      return {
        valid: false,
        reason: `missing required staged doc: ${requiredDoc}`,
      };
    }
  }
  // All required system-level docs must be present (BK-088)
  for (const requiredDoc of REQUIRED_SYSTEM_DOCS) {
    if (!(requiredDoc in docBaseline.files)) {
      return {
        valid: false,
        reason: `missing required staged system doc: ${requiredDoc}`,
      };
    }
  }
  return { valid: true };
}

/**
 * Validate top-level result shape returned by the premium handler.
 *
 * Required keys: census, inventory, profile, moduleGraph, runtimeMarkers,
 * evidencePacks, docBaseline, summary -- each must be a plain object.
 *
 * @param {*} result
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateHandlerResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, reason: "result is not an object" };
  }

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

  return { valid: true };
}

/**
 * Execute sdtk-spec project ingest premium command.
 *
 * Flow:
 *   1. Parse flags and resolve project config / output paths.
 *   2. Reject the SDTK maintainer monorepo root via the existing target guard.
 *   3. Load and verify the premium handler via loadPremiumHandler.
 *   4. Build the bounded context object (mode: foundation+synthesis).
 *   5. Execute the premium handler.
 *   6. Validate the returned result shape (top-level keys).
 *   7. Validate the docBaseline contract (per-entry safety + required docs).
 *   8. Create output dir and write config.json.
 *   9. Write canonical JSON foundation outputs (BK-083).
 *  10. Materialize evidence packs under PROJECT_EVIDENCE_PACKS/.
 *  11. Write INGEST_STATE.json.
 *  12. Materialize staged markdown docs under DOC_SYNTHESIS_BASELINE/docs/...
 *  13. Write DOC_SYNTHESIS_STATE.json.
 *  14. Print human summary or JSON summary.
 *
 * @param {string[]} args - Remaining argv after "project ingest"
 * @returns {Promise<number>} CLI exit code
 */
async function runProjectIngest(args) {
  const { flags } = parseFlags(args, INGEST_FLAG_DEFS);

  // 1. Resolve project config and canonical output paths
  let config;
  try {
    config = resolveProjectConfig(flags);
  } catch (err) {
    console.error(`[project ingest] ${err.message}`);
    return 1;
  }

  // 2. Reject maintainer repo root as ingest target
  try {
    assertProjectRefreshTargetAllowed("sdtk-spec", "ingest", config.projectPath);
  } catch (err) {
    console.error(`[project ingest] ${err.message}`);
    return 1;
  }

  // 3. Load and verify premium handler (entitlement + pack verification)
  const loaderResult = await loadPremiumHandler(CAPABILITY, "projectIngest");
  if (!loaderResult.ok) {
    console.error(`[project ingest] ${loaderResult.message}`);
    return loaderResult.exitCode;
  }

  // 4. Build bounded context object
  const context = {
    capability: CAPABILITY,
    mode: "foundation+synthesis",
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    configPath: config.configPath,
    statePath: config.statePath,
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

  // 5. Execute premium handler
  let result;
  try {
    result = await loaderResult.handler(context);
  } catch (err) {
    console.error(`[project ingest] Premium pack handler error: ${err.message}`);
    return 4;
  }

  // 6. Validate returned result shape (top-level keys)
  const validation = validateHandlerResult(result);
  if (!validation.valid) {
    console.error(
      `[project ingest] Premium pack output contract is invalid: ${validation.reason}`
    );
    return 3;
  }

  // 7. Validate docBaseline contract (per-entry path safety + required docs)
  const docValidation = validateDocBaseline(result.docBaseline, config.docBaselineDir);
  if (!docValidation.valid) {
    console.error(
      `[project ingest] Premium pack output contract is invalid: ${docValidation.reason}`
    );
    return 3;
  }

  // 8. Create output dir and write config.json only after the gated handler succeeds.
  writeProjectConfig(config);

  // 9. Write canonical JSON foundation outputs
  fs.writeFileSync(config.censusPath, JSON.stringify(result.census, null, 2), "utf8");
  fs.writeFileSync(config.inventoryPath, JSON.stringify(result.inventory, null, 2), "utf8");
  fs.writeFileSync(config.profilePath, JSON.stringify(result.profile, null, 2), "utf8");
  fs.writeFileSync(config.moduleGraphPath, JSON.stringify(result.moduleGraph, null, 2), "utf8");
  fs.writeFileSync(config.runtimeMarkersPath, JSON.stringify(result.runtimeMarkers, null, 2), "utf8");

  // 10. Materialize evidence packs under PROJECT_EVIDENCE_PACKS/
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

  // 11. Write INGEST_STATE.json
  const state = {
    schemaVersion: SCHEMA_VERSION,
    issueId: ISSUE_ID,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    generatedAt: new Date().toISOString(),
    summary: result.summary,
  };
  fs.writeFileSync(config.statePath, JSON.stringify(state, null, 2), "utf8");

  // 12. Materialize staged markdown docs under DOC_SYNTHESIS_BASELINE/docs/...
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
        `[project ingest] Doc materialization error for "${relPath}": ${writeErr.message}`
      );
      return 4;
    }
  }

  // 13. Write DOC_SYNTHESIS_STATE.json
  const allRequiredDocs = [...REQUIRED_STAGED_DOCS, ...REQUIRED_SYSTEM_DOCS];
  const requiredDocsWritten = allRequiredDocs.filter(
    (d) => d in result.docBaseline.files
  );
  const optionalDocsGenerated = OPTIONAL_STAGED_DOCS.filter(
    (d) => d in result.docBaseline.files
  );
  const optionalDocsOmitted = OPTIONAL_STAGED_DOCS.filter(
    (d) => !(d in result.docBaseline.files)
  );
  const docSources = {};
  for (const [relPath, entry] of Object.entries(result.docBaseline.files)) {
    docSources[relPath] = entry.sourcePacks;
  }
  const docSynthesisState = {
    schemaVersion: DOC_SYNTHESIS_SCHEMA_VERSION,
    issueId: DOC_SYNTHESIS_ISSUE_ID,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    docBaselineDir: config.docBaselineDir,
    generatedAt: new Date().toISOString(),
    requiredDocs: requiredDocsWritten,
    optionalDocsGenerated,
    optionalDocsOmitted,
    docSources,
    summary: result.docBaseline.summary,
  };
  fs.writeFileSync(
    config.docSynthesisStatePath,
    JSON.stringify(docSynthesisState, null, 2),
    "utf8"
  );

  // 14. Print summary
  if (flags.json) {
    const packKeys = Object.keys(result.evidencePacks);
    const jsonOut = {
      outputDir: config.outputDir,
      summary: result.summary,
      evidencePacks: packKeys,
      docBaseline: {
        docBaselineDir: config.docBaselineDir,
        generatedFiles: requiredDocsWritten.length + optionalDocsGenerated.length,
        requiredDocs: requiredDocsWritten,
        optionalDocsGenerated,
        optionalDocsOmitted,
      },
    };
    console.log(JSON.stringify(jsonOut));
  } else {
    const s = result.summary;
    console.log("[project ingest] Foundation and staged docs baseline written.");
    console.log(`  Output dir:      ${config.outputDir}`);
    if (typeof s.scannedFiles === "number") {
      console.log(`  Scanned files:   ${s.scannedFiles}`);
    }
    if (typeof s.includedFiles === "number") {
      console.log(`  Included files:  ${s.includedFiles}`);
    }
    if (Array.isArray(s.primaryLanguages) && s.primaryLanguages.length > 0) {
      console.log(`  Languages:       ${s.primaryLanguages.join(", ")}`);
    }
    if (Array.isArray(s.markers) && s.markers.length > 0) {
      console.log(`  Markers:         ${s.markers.join(", ")}`);
    }
    const packKeys = Object.keys(result.evidencePacks);
    if (packKeys.length > 0) {
      console.log(`  Evidence packs:  ${packKeys.join(", ")}`);
    }
    const systemDocsWritten = REQUIRED_SYSTEM_DOCS.filter(
      (d) => d in result.docBaseline.files
    );
    const totalDocs = requiredDocsWritten.length + optionalDocsGenerated.length;
    console.log(`  Generated docs:  ${totalDocs}`);
    console.log(`  System docs:     ${systemDocsWritten.length}`);
    console.log(`  Staged baseline: ${config.docBaselineDir}`);
    if (optionalDocsOmitted.length > 0) {
      console.log(`  Omitted (optional): ${optionalDocsOmitted.join(", ")}`);
    }
  }

  return 0;
}

module.exports = { runProjectIngest };
