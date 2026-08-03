"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runPlan } = require("../lib/workflow-plan");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  "in-scope": { type: "string", multiple: true },
  "out-scope": { type: "string", multiple: true },
  slice: { type: "string", multiple: true },
  "use-seeded-candidates": { type: "boolean" },
  assumption: { type: "string", multiple: true },
  risk: { type: "string", multiple: true },
  note: { type: "string", multiple: true },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function cmdPlan(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "plan".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const result = runPlan(projectPath, featureKey, flags);

  console.log("SDTK-CODE workflow plan");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Lane:        ${result.lane}`);
  console.log(`  Mode:        ${result.planningMode}`);
  console.log(`  Artifact:    ${result.artifactPath}`);
  console.log(`  Slices:      ${result.sliceCount}`);
  console.log(`  Next phase:  ${result.nextPhase}`);
  console.log(`  Engine:      ${result.suggestedEngineSkills.join(", ")}`);

  return 0;
}

module.exports = {
  cmdPlan,
};
