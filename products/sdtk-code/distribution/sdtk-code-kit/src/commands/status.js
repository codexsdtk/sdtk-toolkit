"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { loadWorkflowState } = require("../lib/workflow-state");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function formatNextPhase(nextPhase) {
  return nextPhase === "none" ? "none (workflow closed)" : nextPhase;
}

function cmdStatus(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "status".');
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

  console.log("SDTK-CODE workflow status");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Artifact:    ${state.exists ? state.artifactPath : "missing"}`);

  if (!state.exists) {
    console.log("  Lifecycle:   not_started");
    console.log(`  Next action: ${state.commandTemplates.start}`);
    console.log("  Resume:      unavailable");
    return 0;
  }

  console.log(`  Lane:        ${state.lane}`);
  console.log(`  Current:     ${state.currentPhase}`);
  console.log(`  Status:      ${state.phaseStatus}`);
  console.log(`  Next:        ${formatNextPhase(state.nextPhase)}`);
  console.log(`  Blocking:    ${state.blockingState}`);

  if (state.contradictions.length > 0) {
    console.log("  Health:      invalid");
    state.contradictions.forEach((issue) => {
      console.log(`  Warning:     ${issue}`);
    });
  } else {
    console.log("  Health:      valid");
  }

  if (state.resumeDecision && state.resumeDecision.allowed) {
    console.log("  Resume:      auto_build");
    console.log(`  Action:      ${state.resumeDecision.dispatchCommand}`);
  } else if (state.resumeDecision) {
    console.log(`  Resume:      ${state.resumeDecision.mode}`);
    console.log(`  Resume note: ${state.resumeDecision.reason}`);
    if (state.resumeDecision.nextCommand) {
      console.log(`  Action:      ${state.resumeDecision.nextCommand}`);
    }
  }

  return 0;
}

module.exports = {
  cmdStatus,
};