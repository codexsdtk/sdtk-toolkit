"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runShip } = require("../lib/workflow-ship");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  decision: { type: "string" },
  preflight: { type: "string", multiple: true },
  "follow-up": { type: "string", multiple: true },
  note: { type: "string", multiple: true },
  "debug-note": { type: "string", multiple: true },
  blocked: { type: "boolean" },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function cmdShip(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "ship".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );
  requireFlag(flags, "decision", "decision");

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const result = runShip(projectPath, featureKey, flags);

  console.log("SDTK-CODE workflow ship");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Lane:        ${result.lane}`);
  console.log(`  Decision:    ${result.decision}`);
  console.log(`  Status:      ${result.phaseStatus}`);
  console.log(`  Artifact:    ${result.artifactPath}`);
  console.log(`  Preflight:   ${result.preflightCount}`);
  console.log(`  Next phase:  ${result.nextPhase}`);
  console.log(`  Engine:      ${result.suggestedEngineSkills.join(", ")}`);
  if (result.opsHandoff && result.opsHandoff.emitted) {
    console.log(`  OPS handoff: ${result.opsHandoff.opsHandoffPath}`);
  } else if (result.opsHandoff && result.opsHandoff.reason) {
    console.log(`  OPS handoff: ${result.opsHandoff.reason}`);
  }

  return 0;
}

module.exports = {
  cmdShip,
};
