"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runBuild } = require("../lib/workflow-build");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  "active-slice": { type: "string", multiple: true },
  note: { type: "string", multiple: true },
  "debug-note": { type: "string", multiple: true },
  "parallel-reason": { type: "string" },
  complete: { type: "boolean" },
  blocked: { type: "boolean" },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function cmdBuild(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "build".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const result = runBuild(projectPath, featureKey, flags);

  console.log("SDTK-CODE workflow build");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Lane:        ${result.lane}`);
  console.log(`  Status:      ${result.phaseStatus}`);
  console.log(`  Artifact:    ${result.artifactPath}`);
  console.log(`  Slices:      ${result.activeSliceCount}`);
  console.log(`  Mode:        ${result.executionMode}`);
  console.log(`  Next phase:  ${result.nextPhase}`);
  console.log(`  Engine:      ${result.suggestedEngineSkills.join(", ")}`);

  return 0;
}

module.exports = {
  cmdBuild,
};
