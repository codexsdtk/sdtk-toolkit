"use strict";

const { ValidationError } = require("./errors");
const {
  createOrUpdateWorkflowArtifact,
  extractManagedBlock,
  loadWorkflowArtifactState,
} = require("./workflow-artifact");

function normalizeEntries(entries) {
  return (entries || []).map((entry) => entry.trim()).filter(Boolean);
}

function uniqueEntries(entries) {
  const seen = new Set();
  const results = [];
  for (const entry of entries) {
    if (!entry || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    results.push(entry);
  }
  return results;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBulletSection(planBlock, heading) {
  if (!planBlock) {
    return [];
  }

  const regex = new RegExp(`### ${escapeRegExp(heading)}\\r?\\n([\\s\\S]*?)(?=\\r?\\n### |$)`);
  const match = planBlock.match(regex);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function getSeededPlanContext(state) {
  const planBlock = extractManagedBlock(state.text, "PLAN");
  const candidateSlices = parseBulletSection(planBlock, "Seeded Candidate Slices From Formal Handoff")
    .filter((entry) => entry !== "No candidate slices seeded from the formal handoff.");
  const candidatePlanningNotes = parseBulletSection(planBlock, "Planning Notes").filter(
    (entry) => entry !== "No additional planning notes recorded."
  );

  return {
    candidateSlices,
    candidatePlanningNotes,
  };
}

function getBuildEngineSkills(lane) {
  if (lane === "bugfix") {
    return ["code-debug (if failure reproduction is needed)", "code-tdd", "code-execute"];
  }
  return ["code-worktree", "code-tdd", "code-execute", "code-parallel (if tasks are independent)"];
}

function validatePlanState(state) {
  if (state.phaseStatus === "blocked" || state.intakeOutcome === "BLOCKED_MISSING_INPUTS") {
    throw new ValidationError(
      "Workflow artifact is blocked by missing upstream inputs. Re-run \"sdtk-code start\" after the handoff inputs are ready."
    );
  }

  if (state.currentPhase !== "start" && state.currentPhase !== "plan") {
    throw new ValidationError(
      `Cannot run "plan" from current phase "${state.currentPhase}". Re-run the next legal workflow step instead.`
    );
  }

  if (state.lane === "feature" && state.intakeOutcome !== "READY_FOR_PLAN") {
    throw new ValidationError(
      `Feature-lane workflow is not ready for "plan". Current intake outcome: ${state.intakeOutcome}.`
    );
  }

  if (state.lane === "bugfix" && state.intakeOutcome !== "READY_FOR_BUILD_BUGFIX") {
    throw new ValidationError(
      `Bugfix-lane workflow is not eligible for optional planning. Current intake outcome: ${state.intakeOutcome}.`
    );
  }
}

function buildPlanPayload(flags, state) {
  const lane = state.lane;
  const useSeededCandidates = Boolean(flags["use-seeded-candidates"]);
  const payload = {
    inScope: normalizeEntries(flags["in-scope"]),
    outScope: normalizeEntries(flags["out-scope"]),
    assumptions: normalizeEntries(flags.assumption),
    risks: normalizeEntries(flags.risk),
    slices: normalizeEntries(flags.slice),
    planNotes: normalizeEntries(flags.note),
    planningMode: lane === "bugfix" ? "bugfix-light" : "feature-standard",
  };

  if (lane !== "feature" && useSeededCandidates) {
    throw new ValidationError('"--use-seeded-candidates" is only valid for feature-lane planning.');
  }

  if (lane === "feature") {
    const seededContext = getSeededPlanContext(state);

    if (useSeededCandidates && state.currentPhase !== "start") {
      throw new ValidationError(
        '"--use-seeded-candidates" can only be used while confirming seeded handoff slices from the "start" phase.'
      );
    }

    if (useSeededCandidates && payload.slices.length > 0) {
      throw new ValidationError(
        'Feature-lane planning must choose exactly one slice-confirmation path: explicit "--slice" entries or "--use-seeded-candidates".'
      );
    }

    if (useSeededCandidates) {
      if (seededContext.candidateSlices.length === 0) {
        throw new ValidationError(
          'No seeded candidate slices are available in the workflow artifact. Re-run "sdtk-code start" from a formal SDTK-SPEC handoff or use explicit "--slice" entries.'
        );
      }

      payload.slices = seededContext.candidateSlices;
      payload.planNotes = uniqueEntries([
        "Confirmed seeded candidate slices from the formal SDTK-SPEC handoff via `--use-seeded-candidates`.",
        ...payload.planNotes,
        ...seededContext.candidatePlanningNotes,
      ]);
      payload.planningMode = "feature-seeded-confirmed";
    }

    if (payload.slices.length === 0) {
      if (seededContext.candidateSlices.length > 0) {
        throw new ValidationError(
          'Feature-lane planning requires explicit "--slice" entries or "--use-seeded-candidates" to confirm the seeded handoff slice set.'
        );
      }
      throw new ValidationError('Feature-lane planning requires at least one "--slice" entry.');
    }
  }

  if (lane === "bugfix" && payload.slices.length === 0) {
    payload.slices = ["Targeted bugfix path remains lightweight; proceed to focused build and regression checks."];
  }

  return payload;
}

function runPlan(projectPath, featureKey, flags) {
  const state = loadWorkflowArtifactState(projectPath, featureKey);
  validatePlanState(state);

  const planPayload = buildPlanPayload(flags, state);
  const artifactPath = createOrUpdateWorkflowArtifact({
    projectPath,
    featureKey,
    lane: state.lane,
    currentPhase: "plan",
    phaseStatus: "completed",
    intakeOutcome: state.intakeOutcome,
    nextPhase: "build",
    blockingState: "clear",
    suggestedEngineSkills: getBuildEngineSkills(state.lane),
    managedBlocks: ["METADATA", "PLAN", "STATUS"],
    ...planPayload,
  });

  return {
    artifactPath,
    lane: state.lane,
    nextPhase: "build",
    suggestedEngineSkills: getBuildEngineSkills(state.lane),
    planningMode: planPayload.planningMode,
    sliceCount: planPayload.slices.length,
  };
}

module.exports = {
  runPlan,
};
