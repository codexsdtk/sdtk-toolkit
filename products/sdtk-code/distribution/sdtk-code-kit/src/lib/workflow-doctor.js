"use strict";

const { loadWorkflowState } = require("./workflow-state");

function pushIfMissing(issues, value, message) {
  if (!value) {
    issues.push(message);
  }
}

function runWorkflowDoctor(projectPath, featureKey) {
  const state = loadWorkflowState(projectPath, featureKey);
  const issues = [];

  if (!state.exists) {
    issues.push("Workflow artifact is missing. Run start before workflow recovery commands.");
  } else {
    pushIfMissing(issues, state.blocks.METADATA, "Workflow artifact is missing required managed block METADATA.");
    pushIfMissing(issues, state.blocks.STATUS, "Workflow artifact is missing required managed block STATUS.");

    if (state.currentPhase === "verify" || state.currentPhase === "ship" || state.nextPhase === "ship") {
      pushIfMissing(
        issues,
        state.blocks.VERIFY,
        "Workflow state requires VERIFY surface, but the VERIFY managed block is missing."
      );
    }

    if (state.currentPhase === "ship") {
      pushIfMissing(
        issues,
        state.blocks.SHIP,
        "Workflow state requires SHIP surface, but the SHIP managed block is missing."
      );
    }

    if (state.blocks.METADATA) {
      if (!state.lane || state.lane === "unknown") {
        issues.push("METADATA lane is missing or unreadable.");
      }
      if (!state.currentPhase || state.currentPhase === "unknown") {
        issues.push("METADATA current phase is missing or unreadable.");
      }
      if (!state.phaseStatus || state.phaseStatus === "unknown") {
        issues.push("METADATA phase status is missing or unreadable.");
      }
      if (!state.intakeOutcome || state.intakeOutcome === "unknown") {
        issues.push("METADATA intake outcome is missing or unreadable.");
      }
    }

    if (state.blocks.STATUS) {
      if (!state.nextPhase || state.nextPhase === "unknown") {
        issues.push("STATUS next recommended phase is missing or unreadable.");
      }
      if (!state.blockingState || state.blockingState === "unknown") {
        issues.push("STATUS blocking state is missing or unreadable.");
      }
    }

    if (
      state.currentPhase === "verify" &&
      state.phaseStatus === "completed" &&
      Array.isArray(state.evidenceEntries) &&
      state.evidenceEntries.length === 0
    ) {
      issues.push("Workflow claims verify completed, but no evidence entries are recorded in VERIFY.");
    }

    issues.push(...state.contradictions);
  }

  const uniqueIssues = [...new Set(issues)];
  return {
    state,
    issues: uniqueIssues,
    healthy: uniqueIssues.length === 0,
    result: uniqueIssues.length === 0 ? "healthy" : "invalid",
  };
}

module.exports = {
  runWorkflowDoctor,
};