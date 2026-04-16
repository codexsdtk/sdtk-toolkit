"use strict";

const fs = require("fs");
const path = require("path");
const { resolveFormalHandoffIntake } = require("./workflow-handoff");

function normalizePathForDoc(projectPath, targetPath) {
  return path.relative(projectPath, targetPath).split(path.sep).join("/");
}

function buildRequiredInputs(projectPath, featureKey) {
  return [
    {
      key: "FEATURE_IMPL_PLAN",
      path: path.join(projectPath, "docs", "dev", `FEATURE_IMPL_PLAN_${featureKey}.md`),
    },
    {
      key: "SDTK_CONFIG",
      path: path.join(projectPath, "sdtk-spec.config.json"),
    },
  ].map((entry) => ({
    ...entry,
    exists: fs.existsSync(entry.path),
  }));
}

function buildOptionalInputs(projectPath, featureKey) {
  const candidates = [
    { key: "ARCH_DESIGN", path: path.join(projectPath, "docs", "architecture", `ARCH_DESIGN_${featureKey}.md`) },
    { key: "API_DESIGN_DETAIL", path: path.join(projectPath, "docs", "api", `${featureKey}_API_DESIGN_DETAIL.md`) },
    { key: "DATABASE_SPEC", path: path.join(projectPath, "docs", "database", `DATABASE_SPEC_${featureKey}.md`) },
    { key: "FLOW_ACTION_SPEC", path: path.join(projectPath, "docs", "design", `FLOW_ACTION_SPEC_${featureKey}.md`) },
    { key: "DESIGN_LAYOUT", path: path.join(projectPath, "docs", "design", `DESIGN_LAYOUT_${featureKey}.md`) },
  ];

  return candidates
    .filter((entry) => fs.existsSync(entry.path))
    .map((entry) => ({
      ...entry,
      exists: true,
    }));
}

function getSuggestedEngineSkills(lane, blocked) {
  if (blocked) {
    return ["code-discover"];
  }
  if (lane === "feature") {
    return ["code-plan", "code-brainstorm (if ambiguity remains)"];
  }
  return ["code-debug (when reproducing failure)", "code-tdd", "code-execute"];
}

function buildLegacyCompatibilityWarnings(featureKey, lane) {
  const warnings = [
    "Formal SDTK-SPEC handoff missing. Using bounded compatibility intake from FEATURE_IMPL_PLAN + sdtk-spec.config.json.",
    "Upstream SDTK-SPEC /dev still owns implementation-readiness planning and formal CODE_HANDOFF scope.",
  ];
  if (lane === "feature") {
    warnings.push(
      `Preferred feature-lane intake is docs/dev/CODE_HANDOFF_${featureKey}.json from upstream SDTK-SPEC /dev.`
    );
  }
  return warnings;
}

function runIntake(projectPath, featureKey, lane) {
  const formalHandoff = resolveFormalHandoffIntake(projectPath, featureKey, lane);
  if (formalHandoff) {
    return formalHandoff;
  }

  const requiredInputs = buildRequiredInputs(projectPath, featureKey);
  const optionalInputs = buildOptionalInputs(projectPath, featureKey);
  const missingInputs = requiredInputs.filter((entry) => !entry.exists);
  const blocked = missingInputs.length > 0;

  return {
    requiredInputs,
    optionalInputs,
    missingInputs,
    blocked,
    intakeOutcome: blocked
      ? "BLOCKED_MISSING_INPUTS"
      : lane === "feature"
        ? "READY_FOR_PLAN"
        : "READY_FOR_BUILD_BUGFIX",
    nextPhase: blocked ? "blocked" : lane === "feature" ? "plan" : "build",
    phaseStatus: blocked ? "blocked" : "completed",
    blockingState: blocked ? "blocked_missing_inputs" : "clear",
    suggestedEngineSkills: getSuggestedEngineSkills(lane, blocked),
    normalizePath: (targetPath) => normalizePathForDoc(projectPath, targetPath),
    intakeSource: "legacy_compatibility",
    handoffStatus: "missing",
    compatibilityWarnings: blocked ? [] : buildLegacyCompatibilityWarnings(featureKey, lane),
  };
}

module.exports = {
  runIntake,
};
