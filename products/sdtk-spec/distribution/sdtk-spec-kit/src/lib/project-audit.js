"use strict";

const fs = require("fs");
const { parseFlags } = require("./args");
const { resolveProjectConfig } = require("./project-config");
const { assertProjectRefreshTargetAllowed } = require("./project-target-guard");
const { loadPremiumHandler } = require("./premium-loader");

const CAPABILITY = "spec.project.audit";

const VALID_SOURCE_MODES = new Set([
  "cached-foundation+baseline",
  "cached-foundation",
  "ephemeral-analysis",
]);

const VALID_READINESS_BANDS = new Set(["low", "medium", "high"]);

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low"]);

const AUDIT_FLAG_DEFS = {
  "project-path": { type: "string" },
  "output-dir": { type: "string" },
  json: { type: "boolean" },
};

/**
 * Validate a single gap or risk entry.
 *
 * Required fields: id, severity, area, title, finding, evidenceRefs, suggestedAction.
 *
 * @param {"gap"|"risk"} kind
 * @param {*} entry
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateAuditEntry(kind, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { valid: false, reason: `${kind} entry must be a plain object` };
  }
  if (typeof entry.id !== "string" || entry.id.trim() === "") {
    return { valid: false, reason: `${kind} entry missing non-empty "id"` };
  }
  if (!VALID_SEVERITIES.has(entry.severity)) {
    return {
      valid: false,
      reason: `${kind} entry "${entry.id}": severity must be critical|high|medium|low`,
    };
  }
  if (typeof entry.area !== "string" || entry.area.trim() === "") {
    return { valid: false, reason: `${kind} entry "${entry.id}": missing non-empty "area"` };
  }
  if (typeof entry.title !== "string" || entry.title.trim() === "") {
    return { valid: false, reason: `${kind} entry "${entry.id}": missing non-empty "title"` };
  }
  if (typeof entry.finding !== "string" || entry.finding.trim() === "") {
    return { valid: false, reason: `${kind} entry "${entry.id}": missing non-empty "finding"` };
  }
  if (!Array.isArray(entry.evidenceRefs) || entry.evidenceRefs.length === 0) {
    return {
      valid: false,
      reason: `${kind} entry "${entry.id}": evidenceRefs must be a non-empty array`,
    };
  }
  if (typeof entry.suggestedAction !== "string" || entry.suggestedAction.trim() === "") {
    return {
      valid: false,
      reason: `${kind} entry "${entry.id}": missing non-empty "suggestedAction"`,
    };
  }
  return { valid: true };
}

/**
 * Validate the full audit result returned by the premium handler.
 *
 * Required contract (see BK-086 controller spec section 5.2):
 *   - top-level audit and summary must be plain objects
 *   - audit.sourceMode must be in VALID_SOURCE_MODES
 *   - audit.readiness.score must be integer 0..100
 *   - audit.readiness.band must be in VALID_READINESS_BANDS
 *   - audit.gaps and audit.risks must be arrays
 *   - each gap/risk entry must satisfy validateAuditEntry
 *   - audit.nextSteps must be an array of plain objects
 *   - audit.nonClaims must be an array
 *   - summary.gapCount must equal audit.gaps.length
 *   - summary.riskCount must equal audit.risks.length
 *
 * @param {*} result
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateAuditResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, reason: "result is not a plain object" };
  }

  const { audit, summary } = result;

  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    return { valid: false, reason: "result.audit must be a plain object" };
  }
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return { valid: false, reason: "result.summary must be a plain object" };
  }

  if (!VALID_SOURCE_MODES.has(audit.sourceMode)) {
    return {
      valid: false,
      reason: `audit.sourceMode must be one of: ${[...VALID_SOURCE_MODES].join(", ")}`,
    };
  }

  const readiness = audit.readiness;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) {
    return { valid: false, reason: "audit.readiness must be a plain object" };
  }
  if (
    !Number.isInteger(readiness.score) ||
    readiness.score < 0 ||
    readiness.score > 100
  ) {
    return { valid: false, reason: "audit.readiness.score must be an integer 0..100" };
  }
  if (!VALID_READINESS_BANDS.has(readiness.band)) {
    return {
      valid: false,
      reason: `audit.readiness.band must be one of: ${[...VALID_READINESS_BANDS].join(", ")}`,
    };
  }

  if (!Array.isArray(audit.gaps)) {
    return { valid: false, reason: "audit.gaps must be an array" };
  }
  if (!Array.isArray(audit.risks)) {
    return { valid: false, reason: "audit.risks must be an array" };
  }

  for (const entry of audit.gaps) {
    const r = validateAuditEntry("gap", entry);
    if (!r.valid) return r;
  }
  for (const entry of audit.risks) {
    const r = validateAuditEntry("risk", entry);
    if (!r.valid) return r;
  }

  if (!Array.isArray(audit.nextSteps)) {
    return { valid: false, reason: "audit.nextSteps must be an array" };
  }
  for (const step of audit.nextSteps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return { valid: false, reason: "each nextStep entry must be a plain object" };
    }
  }

  if (!Array.isArray(audit.nonClaims)) {
    return { valid: false, reason: "audit.nonClaims must be an array" };
  }

  if (summary.gapCount !== audit.gaps.length) {
    return {
      valid: false,
      reason: `summary.gapCount (${summary.gapCount}) does not match audit.gaps.length (${audit.gaps.length})`,
    };
  }
  if (summary.riskCount !== audit.risks.length) {
    return {
      valid: false,
      reason: `summary.riskCount (${summary.riskCount}) does not match audit.risks.length (${audit.risks.length})`,
    };
  }

  return { valid: true };
}

/**
 * Print bounded human-readable audit summary.
 *
 * Includes: source mode, readiness score/band, gap count, risk count,
 * top blocking findings, and bounded next-step recommendation.
 *
 * @param {{ audit: object, summary: object }} result
 * @param {{ projectPath: string }} context
 */
function renderHumanAudit(result, context) {
  const { audit, summary } = result;
  const r = audit.readiness;

  console.log("[project audit] Read-only audit complete.");
  console.log(`  Project path:    ${context.projectPath}`);
  console.log(`  Source mode:     ${audit.sourceMode}`);
  console.log(`  Readiness score: ${r.score}/100 (${r.band})`);
  if (typeof r.blockingCount === "number") {
    console.log(`  Blocking issues: ${r.blockingCount}`);
  }
  console.log(`  Gaps:            ${audit.gaps.length}`);
  console.log(`  Risks:           ${audit.risks.length}`);

  if (r.rationale) {
    console.log(`  Rationale:       ${r.rationale}`);
  }

  const blocking = [
    ...audit.gaps.filter((g) => g.severity === "critical" || g.severity === "high"),
    ...audit.risks.filter((r2) => r2.severity === "critical" || r2.severity === "high"),
  ];
  if (blocking.length > 0) {
    console.log("  Top findings:");
    for (const item of blocking.slice(0, 3)) {
      console.log(`    [${item.severity.toUpperCase()}] ${item.title} -- ${item.finding}`);
    }
  }

  if (audit.nextSteps.length > 0) {
    console.log("  Next steps:");
    for (const step of audit.nextSteps.slice(0, 3)) {
      if (step.command) {
        console.log(`    ${step.action}: ${step.command}`);
      } else if (step.action) {
        console.log(`    ${step.action}`);
      }
    }
  }

  if (audit.nonClaims.length > 0) {
    console.log("  Non-claims (this audit does not imply):");
    for (const nc of audit.nonClaims.slice(0, 3)) {
      console.log(`    - ${nc}`);
    }
  }
}

/**
 * Execute sdtk-spec project audit premium command (read-only).
 *
 * Flow:
 *   1. Parse flags and resolve canonical project-local read paths.
 *   2. Reject the SDTK maintainer monorepo root via the target guard.
 *   3. Load and verify the premium handler via loadPremiumHandler.
 *   4. Determine available audit source mode from cached artifact existence.
 *   5. Build bounded read-only context object.
 *   6. Execute the premium handler.
 *   7. Validate the returned audit-result contract.
 *   8. Print human summary or deterministic JSON output.
 *
 * This command performs NO writes on success or failure.
 *
 * @param {string[]} args - Remaining argv after "project audit"
 * @returns {Promise<number>} CLI exit code
 */
async function runProjectAudit(args) {
  const { flags } = parseFlags(args, AUDIT_FLAG_DEFS);

  // 1. Resolve canonical project-local read paths (no writes)
  let config;
  try {
    config = resolveProjectConfig(flags);
  } catch (err) {
    console.error(`[project audit] ${err.message}`);
    return 1;
  }

  // 2. Reject maintainer repo root as audit target
  try {
    assertProjectRefreshTargetAllowed("sdtk-spec", "audit", config.projectPath);
  } catch (err) {
    console.error(`[project audit] ${err.message}`);
    return 1;
  }

  // 3. Load and verify premium handler (entitlement + pack verification)
  const loaderResult = await loadPremiumHandler(CAPABILITY, "projectAudit");
  if (!loaderResult.ok) {
    console.error(`[project audit] ${loaderResult.message}`);
    return loaderResult.exitCode;
  }

  // 4. Determine available cached source mode (read-only existence checks)
  const hasCachedFoundation = fs.existsSync(config.censusPath);
  const hasStagedDocsBaseline = fs.existsSync(config.docBaselineDir);

  // 5. Build bounded read-only context (no writes, canonical paths only)
  const context = {
    capability: CAPABILITY,
    mode: "read-only-audit",
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
    hasCachedFoundation,
    hasStagedDocsBaseline,
    json: !!flags.json,
    argv: args,
  };

  // 6. Execute premium handler
  let result;
  try {
    result = await loaderResult.handler(context);
  } catch (err) {
    console.error(`[project audit] Premium pack handler error: ${err.message}`);
    return 4;
  }

  // 7. Validate returned audit-result contract
  const validation = validateAuditResult(result);
  if (!validation.valid) {
    console.error(
      `[project audit] Premium pack output contract is invalid: ${validation.reason}`
    );
    return 3;
  }

  // 8. Print output (no writes performed)
  if (flags.json) {
    console.log(JSON.stringify({ audit: result.audit, summary: result.summary }));
  } else {
    renderHumanAudit(result, context);
  }

  return 0;
}

module.exports = { runProjectAudit };
