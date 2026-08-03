"use strict";

const path = require("path");
const { parseFlags, requireFlag, validateChoice, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { runIntake } = require("../lib/workflow-intake");
const { createOrUpdateWorkflowArtifact } = require("../lib/workflow-artifact");

const FLAG_DEFS = {
  lane: { type: "string" },
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  force: { type: "boolean" },
};

const VALID_LANES = ["feature", "bugfix"];
const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function formatIntakeSource(intake) {
  return intake.intakeSource === "formal_handoff"
    ? "formal SDTK-SPEC handoff"
    : "legacy compatibility intake";
}

function buildBlockedIntakeMessage(intake, artifactPath) {
  if (intake.blockingState === "blocked_upstream_handoff") {
    const details = intake.blockingDetails.map((entry) => `- ${entry}`).join("\n");
    return `${intake.blockingMessage}\n${details}\nArtifact written to: ${artifactPath}`;
  }

  if (intake.blockingState === "invalid_handoff_contract") {
    return `${intake.blockingMessage}\nArtifact written to: ${artifactPath}`;
  }

  const details = intake.missingInputs.map((entry) => `- ${entry.key}: ${entry.path}`).join("\n");
  return `Workflow intake blocked. Missing required inputs:\n${details}\nArtifact written to: ${artifactPath}`;
}

function cmdStart(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "start".');
  }

  const lane = requireFlag(flags, "lane", "lane");
  validateChoice(lane, VALID_LANES, "lane");

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const intake = runIntake(projectPath, featureKey, lane);
  const artifactPath = createOrUpdateWorkflowArtifact({
    featureKey,
    lane,
    projectPath,
    force: flags.force,
    managedBlocks: ["METADATA", "INPUTS", "STATUS"],
    ...intake,
  });

  console.log("SDTK-CODE workflow start");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Lane:        ${lane}`);
  console.log(`  Intake:      ${formatIntakeSource(intake)}`);
  console.log(`  Handoff:     ${intake.handoffStatus}`);
  console.log(`  Outcome:     ${intake.intakeOutcome}`);
  console.log(`  Artifact:    ${artifactPath}`);
  console.log(`  Next phase:  ${intake.nextPhase}`);
  console.log(`  Engine:      ${intake.suggestedEngineSkills.join(", ")}`);
  for (const warning of intake.compatibilityWarnings || []) {
    console.log(`  Note:        ${warning}`);
  }

  if (intake.blocked) {
    throw new ValidationError(buildBlockedIntakeMessage(intake, artifactPath));
  }

  return 0;
}

module.exports = {
  cmdStart,
};
