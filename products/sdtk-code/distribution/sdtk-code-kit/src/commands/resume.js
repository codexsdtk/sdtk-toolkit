"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runBuild } = require("../lib/workflow-build");
const { loadWorkflowState } = require("../lib/workflow-state");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function cmdResume(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "resume".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const state = loadWorkflowState(projectPath, featureKey);
  const decision = state.resumeDecision;

  if (!decision || !decision.allowed) {
    const lines = [decision ? decision.reason : "Resume is unavailable for this workflow state."];
    if (decision && decision.nextCommand) {
      lines.push(`Next command: ${decision.nextCommand}`);
    }
    throw new ValidationError(lines.join("\n"));
  }

  const resumeBuildSlices = Array.isArray(decision.resumeBuildSlices) ? decision.resumeBuildSlices : [];
  const result = runBuild(projectPath, featureKey, {
    "active-slice": resumeBuildSlices,
  });

  console.log("SDTK-CODE workflow resume");
  console.log(`  Feature key: ${featureKey}`);
  console.log("  Decision:    auto-dispatch build");
  console.log(`  Command:     ${decision.dispatchCommand}`);
  console.log(`  Slices:      ${resumeBuildSlices.length}`);
  console.log(`  Artifact:    ${result.artifactPath}`);
  console.log(`  Status:      ${result.phaseStatus}`);
  console.log(`  Next phase:  ${result.nextPhase}`);
  console.log(`  Engine:      ${result.suggestedEngineSkills.join(", ")}`);

  return 0;
}

module.exports = {
  cmdResume,
};