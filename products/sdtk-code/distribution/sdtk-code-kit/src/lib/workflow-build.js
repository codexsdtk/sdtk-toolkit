"use strict";

const { ValidationError } = require("./errors");
const { createOrUpdateWorkflowArtifact, loadWorkflowArtifactState } = require("./workflow-artifact");

function normalizeEntries(entries) {
  return (entries || []).map((entry) => entry.trim()).filter(Boolean);
}

function resolveBuildStatus(flags, state) {
  if (flags.complete && flags.blocked) {
    throw new ValidationError('Use either "--complete" or "--blocked", not both.');
  }
  if (flags.complete) {
    return "completed";
  }
  if (flags.blocked) {
    return "blocked";
  }
  if (state.currentPhase === "build" && state.phaseStatus === "completed") {
    return state.phaseStatus;
  }
  return "in_progress";
}

function getSuggestedEngineSkills(lane, flags, phaseStatus) {
  if (lane === "bugfix") {
    const skills = ["code-debug (if failure reproduction is needed)", "code-tdd", "code-execute"];
    if (phaseStatus === "blocked" && !skills.includes("code-debug")) {
      skills.unshift("code-debug");
    }
    return skills;
  }

  const skills = ["code-worktree", "code-tdd", "code-execute"];
  if (flags["parallel-reason"]) {
    skills.push("code-parallel");
  }
  if (phaseStatus === "blocked") {
    skills.push("code-debug");
  }
  return skills;
}

function validateBuildState(state) {
  if (state.intakeOutcome === "BLOCKED_MISSING_INPUTS") {
    throw new ValidationError(
      "Workflow artifact is blocked by missing upstream inputs. Re-run \"sdtk-code start\" after the handoff inputs are ready."
    );
  }

  if (state.lane === "feature") {
    if (state.currentPhase === "start") {
      throw new ValidationError(
        'Feature-lane workflow must complete "plan" before "build". Run "sdtk-code plan" first.'
      );
    }
    if (state.currentPhase !== "plan" && state.currentPhase !== "build") {
      throw new ValidationError(
        `Cannot run "build" from current phase "${state.currentPhase}". Re-run the next legal workflow step instead.`
      );
    }
    if (state.intakeOutcome !== "READY_FOR_PLAN") {
      throw new ValidationError(
        `Feature-lane workflow is not ready for "build". Current intake outcome: ${state.intakeOutcome}.`
      );
    }
    return;
  }

  if (state.currentPhase !== "start" && state.currentPhase !== "plan" && state.currentPhase !== "build") {
    throw new ValidationError(
      `Cannot run "build" from current phase "${state.currentPhase}". Re-run the next legal workflow step instead.`
    );
  }

  if (state.intakeOutcome !== "READY_FOR_BUILD_BUGFIX") {
    throw new ValidationError(
      `Bugfix-lane workflow is not ready for "build". Current intake outcome: ${state.intakeOutcome}.`
    );
  }
}

function runBuild(projectPath, featureKey, flags) {
  const state = loadWorkflowArtifactState(projectPath, featureKey);
  validateBuildState(state);

  if (state.lane === "bugfix" && flags["parallel-reason"]) {
    throw new ValidationError('Bugfix-lane build does not support "--parallel-reason" in v1.');
  }

  const phaseStatus = resolveBuildStatus(flags, state);
  const suggestedEngineSkills = getSuggestedEngineSkills(state.lane, flags, phaseStatus);
  const nextPhase = phaseStatus === "completed" ? "verify" : "build";
  const blockingState = phaseStatus === "blocked" ? "blocked_build_issue" : "clear";

  const artifactPath = createOrUpdateWorkflowArtifact({
    projectPath,
    featureKey,
    lane: state.lane,
    currentPhase: "build",
    phaseStatus,
    intakeOutcome: state.intakeOutcome,
    nextPhase,
    blockingState,
    suggestedEngineSkills,
    managedBlocks: ["METADATA", "BUILD", "STATUS"],
    activeSlices: normalizeEntries(flags["active-slice"]),
    buildNotes: normalizeEntries(flags.note),
    debugNotes: normalizeEntries(flags["debug-note"]),
    parallelReason: flags["parallel-reason"] || null,
  });

  return {
    artifactPath,
    lane: state.lane,
    phaseStatus,
    nextPhase,
    suggestedEngineSkills,
    executionMode: flags["parallel-reason"] ? "parallel" : "sequential",
    activeSliceCount: normalizeEntries(flags["active-slice"]).length,
  };
}

module.exports = {
  runBuild,
};
