"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { safeSegment } = require("./agent-team-export");
const { loadAgentTeamPlan } = require("./agent-team-plan");
const {
  asArray,
  assertPathUnderBase,
  atomicWriteJson,
  resolveEvidencePath,
} = require("./agent-team-evidence");

const READINESS_SCHEMA_VERSION = "sdtk.agent-team-readiness.v1";
const READINESS_NOTE =
  "READY_TO_SLEEP indicates evidence is present and well-formed — it does NOT verify implementation correctness. Human review required before acting on this verdict.";

function readinessBaseDir(projectPath) {
  return path.resolve(projectPath || ".", ".sdtk", "agent-team", "readiness");
}

function resolveReadinessPath(projectPath, featureKey) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const base = readinessBaseDir(projectPath);
  const dir = assertPathUnderBase(path.join(base, safeFeatureKey), base);
  return assertPathUnderBase(path.join(dir, "readiness.json"), base);
}

function loadSleepPlanStopConditions(projectPath) {
  const sleepPlanPath = path.resolve(projectPath || ".", ".sdtk", "trust", "sleep-plan.json");
  let sleepPlan;
  try {
    sleepPlan = JSON.parse(fs.readFileSync(sleepPlanPath, "utf8"));
  } catch (_error) {
    throw new ValidationError(
      `NEEDS_SLEEP_PLAN: no sleep plan at ${sleepPlanPath}. Run \`sdtk-code sleep plan\` first.`
    );
  }
  const ids = asArray(sleepPlan.stop_conditions)
    .map((condition) => {
      if (condition && typeof condition === "object") return condition.id;
      return condition;
    })
    .filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) {
    throw new ValidationError(`NEEDS_SLEEP_PLAN: sleep plan at ${sleepPlanPath} has no stop_conditions.`);
  }
  return ids;
}

function loadEvidenceFile(projectPath, featureKey, role) {
  const evidencePath = resolveEvidencePath(projectPath, featureKey, role);
  if (!fs.existsSync(evidencePath)) {
    return { evidencePath, evidence: null };
  }
  try {
    return { evidencePath, evidence: JSON.parse(fs.readFileSync(evidencePath, "utf8")) };
  } catch (_error) {
    return { evidencePath, evidence: null, invalid: true };
  }
}

function scoreRole(projectPath, plan, roleSpec, activeStopConditions) {
  const role = roleSpec && roleSpec.role;
  const { evidencePath, evidence, invalid } = loadEvidenceFile(projectPath, plan.feature_key, role);
  if (!evidence) {
    return {
      role,
      verdict: "NOT_READY",
      reason: invalid
        ? `evidence file invalid — ${evidencePath} could not be parsed`
        : `evidence file missing — no ${String(role).toUpperCase()}.evidence.json submitted`,
    };
  }

  const stopConditionHit = evidence.stop_condition_hit === undefined ? null : evidence.stop_condition_hit;
  if (stopConditionHit !== null) {
    if (!activeStopConditions.includes(stopConditionHit)) {
      return {
        role,
        verdict: "NOT_READY",
        reason: `unrecognized stop_condition_hit=${stopConditionHit} is not active in sleep-plan.json`,
      };
    }
    return {
      role,
      verdict: "BLOCKED_BY_STOP_CONDITION",
      reason: `stop_condition_hit=${stopConditionHit}`,
    };
  }

  const evidenceObject = evidence.evidence && typeof evidence.evidence === "object" ? evidence.evidence : {};
  const missing = asArray(roleSpec.evidence_required).filter((key) => !(key in evidenceObject));
  if (missing.length > 0) {
    return {
      role,
      verdict: "NOT_READY",
      reason: `required evidence missing: ${missing.join(", ")}`,
    };
  }

  return { role, verdict: "READY", reason: null };
}

function overallReason(roles) {
  const notReady = roles.filter((role) => role.verdict !== "READY");
  if (notReady.length === 0) {
    return "All required role evidence is present and well-formed.";
  }
  if (notReady.length === 1) {
    return `${notReady[0].role} is ${notReady[0].verdict}: ${notReady[0].reason}`;
  }
  return `${notReady.length} roles are not ready.`;
}

function computeReadiness(projectPath, featureKey) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const plan = loadAgentTeamPlan(projectPath, safeFeatureKey);
  const activeStopConditions = loadSleepPlanStopConditions(projectPath);
  const roles = asArray(plan.roles).map((roleSpec) => scoreRole(projectPath, plan, roleSpec, activeStopConditions));
  const rolesNotReady = roles.filter((role) => role.verdict !== "READY");
  const overallVerdict = rolesNotReady.length === 0 ? "READY_TO_SLEEP" : "NOT_READY";

  return {
    schema_version: READINESS_SCHEMA_VERSION,
    feature_key: plan.feature_key,
    run_id: plan.run_id,
    evaluated_at: new Date().toISOString(),
    roles,
    overall_verdict: overallVerdict,
    overall_reason: overallReason(roles),
    readiness_note: READINESS_NOTE,
  };
}

function writeReadiness(projectPath, featureKey, readinessJson) {
  const outputPath = resolveReadinessPath(projectPath, featureKey);
  return atomicWriteJson(outputPath, readinessJson, readinessBaseDir(projectPath));
}

function loadReadiness(projectPath, featureKey) {
  const outputPath = resolveReadinessPath(projectPath, featureKey);
  try {
    return JSON.parse(fs.readFileSync(outputPath, "utf8"));
  } catch (_error) {
    throw new ValidationError(`NEEDS_READINESS: no readiness.json at ${outputPath}. Run \`sdtk-code agent-team readiness --feature-key ${featureKey}\` first.`);
  }
}

module.exports = {
  READINESS_SCHEMA_VERSION,
  READINESS_NOTE,
  readinessBaseDir,
  resolveReadinessPath,
  loadSleepPlanStopConditions,
  scoreRole,
  computeReadiness,
  writeReadiness,
  loadReadiness,
};
