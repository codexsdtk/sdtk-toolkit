"use strict";

const { ValidationError } = require("./errors");
const { createOrUpdateWorkflowArtifact, loadWorkflowArtifactState } = require("./workflow-artifact");
const { emitOpsHandoffForCompletedCloseout } = require("./workflow-handoff");

const VALID_DECISIONS = ["ship", "finish"];
const VALID_PREFLIGHT_RESULT = ["pass", "partial", "fail"];

function normalizeEntries(entries) {
  return (entries || []).map((entry) => entry.trim()).filter(Boolean);
}

function validateChoice(value, choices, flagName) {
  if (!choices.includes(value)) {
    throw new ValidationError(
      `Invalid value for --${flagName}: "${value}". Must be one of: ${choices.join(", ")}`
    );
  }
  return value;
}

function parsePreflightEntries(entries, featureKey) {
  const normalized = normalizeEntries(entries);
  if (normalized.length === 0) {
    throw new ValidationError(
      'Ship requires at least one "--preflight" entry in the format "check|summary|pass|docs/dev/evidence/FEATURE_KEY/file.txt".'
    );
  }

  const expectedPrefix = `docs/dev/evidence/${featureKey}/`;
  return normalized.map((entry) => {
    const parts = entry.split("|").map((part) => part.trim());
    if (parts.length !== 4 || parts.some((part) => !part)) {
      throw new ValidationError(
        'Each "--preflight" entry must use exactly four pipe-separated fields: "check|summary|pass|docs/dev/evidence/FEATURE_KEY/file.txt".'
      );
    }

    const [checkName, summary, result, rawOutputRef] = parts;
    validateChoice(result, VALID_PREFLIGHT_RESULT, "preflight");

    const normalizedRef = rawOutputRef.replace(/\\/g, "/");
    if (!normalizedRef.startsWith(expectedPrefix)) {
      throw new ValidationError(
        `Preflight raw-output reference must stay under "${expectedPrefix}". Received: ${rawOutputRef}`
      );
    }

    return {
      checkName,
      summary,
      result,
      rawOutputRef: normalizedRef,
    };
  });
}

function resolvePreflightStatus(entries) {
  if (entries.some((entry) => entry.result === "fail")) {
    return "fail";
  }
  if (entries.some((entry) => entry.result === "partial")) {
    return "partial";
  }
  return "pass";
}

function validateShipState(state) {
  if (state.intakeOutcome === "BLOCKED_MISSING_INPUTS") {
    throw new ValidationError(
      'Workflow artifact is blocked by missing upstream inputs. Re-run "sdtk-code start" after the handoff inputs are ready.'
    );
  }

  if (state.currentPhase === "verify") {
    if (state.phaseStatus !== "completed") {
      throw new ValidationError(
        'Workflow must complete "verify" before "ship". Run "sdtk-code verify --complete" first.'
      );
    }
    return;
  }

  if (state.currentPhase !== "ship") {
    throw new ValidationError(
      `Cannot run "ship" from current phase "${state.currentPhase}". Re-run the next legal workflow step instead.`
    );
  }
}

function resolveShipPhaseStatus(flags, state, preflightStatus) {
  if (flags.blocked || preflightStatus === "fail") {
    return "blocked";
  }
  if (preflightStatus === "pass") {
    return "completed";
  }
  return "in_progress";
}

function getSuggestedEngineSkills(phaseStatus, decision) {
  if (phaseStatus === "completed") {
    return ["code-finish"];
  }

  const primary = decision === "finish" ? "code-finish" : "code-ship";
  if (phaseStatus === "blocked") {
    return ["code-debug", primary];
  }
  return [primary];
}

function validateDecisionSpecificFinish(lane, decision, followUps, notes) {
  if (decision !== "finish" || lane === "bugfix") {
    return;
  }

  if (followUps.length > 0 && notes.length > 0) {
    return;
  }

  throw new ValidationError(
    'Feature-lane "finish" requires at least one "--follow-up" item and at least one "--note". "finish" is for bounded closeout when remaining hardening or deployment work is still explicit; use "--decision ship" for the stronger closure decision.'
  );
}

function validateCloseoutBundleStrength(lane, decision, preflightEntries) {
  if (decision === "ship" && preflightEntries.length < 2) {
    throw new ValidationError(
      'Stronger "--decision ship" closeout requires at least two "--preflight" entries. Use a multi-preflight bundle to record the fuller release boundary, or use "--decision finish" for a bounded closeout.'
    );
  }

  if (decision === "finish" && lane === "feature" && preflightEntries.length < 2) {
    throw new ValidationError(
      'Feature-lane "--decision finish" requires at least two "--preflight" entries. Use a multi-preflight bundle plus explicit "--follow-up" and "--note" items so the bounded closeout remains reviewable.'
    );
  }
}

function runShip(projectPath, featureKey, flags) {
  const state = loadWorkflowArtifactState(projectPath, featureKey);
  validateShipState(state);

  const decision = validateChoice(flags.decision, VALID_DECISIONS, "decision");
  const preflightEntries = parsePreflightEntries(flags.preflight, featureKey);
  const shipFollowUps = normalizeEntries(flags["follow-up"]);
  const shipNotes = normalizeEntries(flags.note);
  validateDecisionSpecificFinish(state.lane, decision, shipFollowUps, shipNotes);
  validateCloseoutBundleStrength(state.lane, decision, preflightEntries);
  const preflightStatus = resolvePreflightStatus(preflightEntries);
  const phaseStatus = resolveShipPhaseStatus(flags, state, preflightStatus);
  const nextPhase = phaseStatus === "completed" ? "none" : "ship";
  const blockingState =
    phaseStatus === "blocked"
      ? "blocked_ship_issue"
      : phaseStatus === "completed"
        ? "clear"
        : "ship_preflight_in_progress";
  const suggestedEngineSkills = getSuggestedEngineSkills(phaseStatus, decision);

  const artifactPath = createOrUpdateWorkflowArtifact({
    projectPath,
    featureKey,
    lane: state.lane,
    currentPhase: "ship",
    phaseStatus,
    intakeOutcome: state.intakeOutcome,
    nextPhase,
    blockingState,
    suggestedEngineSkills,
    managedBlocks: ["METADATA", "SHIP", "STATUS"],
    shipDecision: decision,
    shipStatus: phaseStatus,
    preflightEntries,
    shipFollowUps,
    shipNotes,
    shipDebugNotes: normalizeEntries(flags["debug-note"]),
  });

  const opsHandoffResult =
    phaseStatus === "completed"
      ? emitOpsHandoffForCompletedCloseout({
          projectPath,
          featureKey,
          lane: state.lane,
          decision,
          preflightEntries,
          shipFollowUps,
          shipNotes,
        })
      : {
          emitted: false,
          reason: 'skipped because OPS_HANDOFF is emitted only after completed "ship" closeout.',
        };

  return {
    artifactPath,
    lane: state.lane,
    decision,
    phaseStatus,
    nextPhase,
    suggestedEngineSkills,
    preflightCount: preflightEntries.length,
    preflightStatus,
    opsHandoff: opsHandoffResult,
  };
}

module.exports = {
  runShip,
};
