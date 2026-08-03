"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runVerify } = require("../lib/workflow-verify");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  evidence: { type: "string", multiple: true },
  "batch-summary": { type: "string" },
  "changed-file": { type: "string", multiple: true },
  "exclude-file": { type: "string", multiple: true },
  "truth-sync-target": { type: "string", multiple: true },
  "commit-include": { type: "string", multiple: true },
  "commit-exclude": { type: "string", multiple: true },
  caveat: { type: "string", multiple: true },
  "reviewer-guidance": { type: "string", multiple: true },
  "spec-status": { type: "string" },
  "spec-note": { type: "string", multiple: true },
  "quality-status": { type: "string" },
  "quality-note": { type: "string", multiple: true },
  "debug-note": { type: "string", multiple: true },
  complete: { type: "boolean" },
  blocked: { type: "boolean" },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function cmdVerify(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "verify".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const result = runVerify(projectPath, featureKey, flags);

  console.log("SDTK-CODE workflow verify");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Lane:        ${result.lane}`);
  console.log(`  Status:      ${result.phaseStatus}`);
  console.log(`  Artifact:    ${result.artifactPath}`);
  console.log(`  Review:      ${result.reviewPacketPath}`);
  console.log(`  Evidence:    ${result.evidenceCount}`);
  console.log(
    `  Gates:       evidence=${result.evidenceGate}, spec=${result.specGateStatus}, quality=${result.qualityGateStatus}`
  );
  console.log(`  Next phase:  ${result.nextPhase}`);
  console.log(`  Engine:      ${result.suggestedEngineSkills.join(", ")}`);
  if (Array.isArray(result.provenanceWarnings) && result.provenanceWarnings.length > 0) {
    result.provenanceWarnings.forEach((warning) => {
      console.log(`  Warning:     provenance: ${warning}`);
    });
  }

  return 0;
}

module.exports = {
  cmdVerify,
};
