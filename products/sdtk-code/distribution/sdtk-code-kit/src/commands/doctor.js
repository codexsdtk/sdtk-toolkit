"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runWorkflowDoctor } = require("../lib/workflow-doctor");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function cmdDoctor(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "doctor".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const report = runWorkflowDoctor(projectPath, featureKey);

  console.log("SDTK-CODE workflow doctor");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Artifact:    ${report.state.exists ? report.state.artifactPath : "missing"}`);
  console.log(`  Result:      ${report.result}`);

  if (report.issues.length === 0) {
    console.log("  Issues:      none");
    return 0;
  }

  report.issues.forEach((issue, index) => {
    console.log(`  Issue ${index + 1}: ${issue}`);
  });

  console.log("  Repair:      diagnostic only in BK-047-lite (no auto-repair)");
  return 1;
}

module.exports = {
  cmdDoctor,
};