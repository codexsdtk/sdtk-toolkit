"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { safeSegment } = require("./agent-team-export");
const { loadAgentTeamPlan } = require("./agent-team-plan");
const { STOP_CONDITIONS } = require("./sleep-plan");

const EVIDENCE_SCHEMA_VERSION = "sdtk.agent-team-evidence.v1";
const VALID_ROLES = Object.freeze(["pm", "dev", "qa"]);
const VALID_STOP_CONDITIONS = new Set(
  STOP_CONDITIONS.map((condition) => condition && condition.id).filter(Boolean)
);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roleName(value) {
  return String(value || "").toLowerCase();
}

function evidenceBaseDir(projectPath) {
  return path.resolve(projectPath || ".", ".sdtk", "agent-team", "evidence");
}

function assertPathUnderBase(resolvedPath, expectedBase) {
  const resolved = path.resolve(resolvedPath);
  const base = path.resolve(expectedBase);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new ValidationError("FAIL_UNSAFE_EXPORT_PATH: resolved path outside expected base");
  }
  return resolved;
}

function resolveEvidencePath(projectPath, featureKey, role) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const safeRole = safeSegment(roleName(role), "role");
  const base = evidenceBaseDir(projectPath);
  const dir = assertPathUnderBase(path.join(base, safeFeatureKey), base);
  const outputPath = assertPathUnderBase(
    path.join(dir, `${safeRole.toUpperCase()}.evidence.json`),
    base
  );
  return outputPath;
}

function requireExpectedBase(expectedBase) {
  if (typeof expectedBase !== "string" || expectedBase.length === 0) {
    throw new TypeError("expectedBase is required for agent-team atomic writes");
  }
  return expectedBase;
}

function tmpPathFor(resolved) {
  const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return `${resolved}.${nonce}.tmp`;
}

function lockPid(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_error) {
    return null;
  }
}

function processIsAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error && error.code === "ESRCH");
  }
}

function removeStaleLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return true;
    }
    return false;
  }
}

function reserveExclusive(lockPath, lockExistsMessage) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      try {
        fs.writeSync(fd, `${process.pid}
`);
      } finally {
        fs.closeSync(fd);
      }
      return;
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw error;
      }
      if (!processIsAlive(lockPid(lockPath)) && removeStaleLock(lockPath)) {
        continue;
      }
      throw new ValidationError(
        lockExistsMessage || `FAIL_EVIDENCE_ALREADY_SUBMITTED: evidence submission already in progress at ${lockPath}`
      );
    }
  }
}

function atomicWrite(outputPath, content, expectedBase, opts) {
  const options = opts || {};
  const resolved = assertPathUnderBase(outputPath, requireExpectedBase(expectedBase));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tmpPath = tmpPathFor(resolved);
  const lockPath = `${resolved}.lock`;
  let locked = false;
  let succeeded = false;

  try {
    if (options.exclusive === true) {
      reserveExclusive(lockPath, options.lockExistsMessage);
      locked = true;
      if (fs.existsSync(resolved)) {
        throw new ValidationError(options.alreadyExistsMessage || `FAIL_EVIDENCE_ALREADY_SUBMITTED: evidence already exists at ${resolved}`);
      }
    }
    fs.writeFileSync(tmpPath, content, "utf8");
    fs.renameSync(tmpPath, resolved);
    succeeded = true;
    return resolved;
  } finally {
    if (!succeeded && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    if (locked && fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}

function atomicWriteJson(outputPath, data, expectedBase, opts) {
  return atomicWrite(outputPath, JSON.stringify(data, null, 2), expectedBase, opts);
}

function atomicWriteText(outputPath, text, expectedBase, opts) {
  return atomicWrite(outputPath, String(text), expectedBase, opts);
}

function schemaError(message) {
  throw new ValidationError(`FAIL_EVIDENCE_SCHEMA: ${message}`);
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    schemaError(`${field} must not be empty`);
  }
}

function requiredStringArray(value, field) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    schemaError(`${field} must be an array of strings`);
  }
}

function findRoleSpec(plan, role) {
  const normalized = roleName(role);
  return asArray(plan && plan.roles).find((entry) => roleName(entry && entry.role) === normalized) || null;
}

function validateCommitRange(commitRange) {
  if (commitRange === undefined || commitRange === null) {
    return;
  }
  if (typeof commitRange !== "object" || Array.isArray(commitRange)) {
    schemaError("commit_range must be an object when present");
  }
  requiredString(commitRange.before, "commit_range.before");
  requiredString(commitRange.after, "commit_range.after");
}

function validateEvidenceFile(evidenceJson, plan) {
  if (!evidenceJson || typeof evidenceJson !== "object" || Array.isArray(evidenceJson)) {
    schemaError("evidence file must be a JSON object");
  }
  if (evidenceJson.schema_version !== EVIDENCE_SCHEMA_VERSION) {
    schemaError(`schema_version must be ${EVIDENCE_SCHEMA_VERSION}`);
  }

  requiredString(evidenceJson.feature_key, "feature_key");
  requiredString(evidenceJson.role, "role");
  const featureKey = safeSegment(evidenceJson.feature_key, "feature_key");
  const role = roleName(safeSegment(evidenceJson.role, "role"));
  if (!VALID_ROLES.includes(role)) {
    schemaError(`role \"${role}\" is not supported`);
  }
  if (!plan || typeof plan !== "object") {
    throw new ValidationError("NEEDS_AGENT_TEAM_PLAN: agent-team plan is missing or invalid.");
  }
  if (plan.feature_key !== featureKey) {
    schemaError(`feature_key \"${featureKey}\" does not match plan feature_key \"${plan.feature_key}\"`);
  }

  const roleSpec = findRoleSpec(plan, role);
  if (!roleSpec) {
    schemaError(`role \"${role}\" is not present in agent-team plan`);
  }
  if (typeof evidenceJson.run_id !== "string" || evidenceJson.run_id.length === 0) {
    schemaError("run_id must not be empty");
  }
  if (evidenceJson.run_id !== plan.run_id) {
    throw new ValidationError("FAIL_EVIDENCE_RUN_MISMATCH: evidence run_id does not match agent-team plan run_id.");
  }

  requiredString(evidenceJson.submitted_at, "submitted_at");
  requiredString(evidenceJson.summary, "summary");
  requiredStringArray(evidenceJson.commands_run, "commands_run");
  requiredString(evidenceJson.verification_evidence, "verification_evidence");
  requiredStringArray(evidenceJson.blockers, "blockers");

  if (evidenceJson.stop_condition_hit !== null && evidenceJson.stop_condition_hit !== undefined) {
    if (typeof evidenceJson.stop_condition_hit !== "string" || !VALID_STOP_CONDITIONS.has(evidenceJson.stop_condition_hit)) {
      schemaError(`stop_condition_hit must be null or one of: ${Array.from(VALID_STOP_CONDITIONS).join(", ")}`);
    }
  }

  if (!evidenceJson.evidence || typeof evidenceJson.evidence !== "object" || Array.isArray(evidenceJson.evidence)) {
    schemaError("evidence must be an object");
  }
  const missing = asArray(roleSpec.evidence_required).filter((key) => !(key in evidenceJson.evidence));
  if (missing.length > 0) {
    throw new ValidationError(`FAIL_EVIDENCE_INCOMPLETE: missing required evidence key(s): ${missing.join(", ")}`);
  }

  validateCommitRange(evidenceJson.commit_range);
  return { valid: true, roleSpec };
}

function submitEvidence(projectPath, featureKey, role, evidenceFilePath) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const safeRole = roleName(safeSegment(role, "role"));
  const plan = loadAgentTeamPlan(projectPath, safeFeatureKey);
  const roleSpec = findRoleSpec(plan, safeRole);
  if (!roleSpec) {
    schemaError(`role \"${safeRole}\" is not present in agent-team plan`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(evidenceFilePath, "utf8"));
  } catch (_error) {
    schemaError(`evidence file could not be read or parsed: ${evidenceFilePath}`);
  }

  requiredString(parsed.feature_key, "feature_key");
  requiredString(parsed.role, "role");
  if (parsed.feature_key !== safeFeatureKey) {
    schemaError(`feature_key \"${parsed.feature_key}\" does not match --feature-key \"${safeFeatureKey}\"`);
  }
  if (roleName(parsed.role) !== safeRole) {
    schemaError(`role \"${parsed.role}\" does not match --role \"${safeRole}\"`);
  }
  validateEvidenceFile(parsed, plan);

  const outputPath = resolveEvidencePath(projectPath, safeFeatureKey, safeRole);
  atomicWriteJson(outputPath, parsed, evidenceBaseDir(projectPath), {
    exclusive: true,
    alreadyExistsMessage: `FAIL_EVIDENCE_ALREADY_SUBMITTED: evidence already exists at ${outputPath}`,
    lockExistsMessage: `FAIL_EVIDENCE_ALREADY_SUBMITTED: evidence submission already in progress at ${outputPath}.lock`,
  });

  return {
    outputPath,
    run_id: plan.run_id,
    role: safeRole,
    stop_condition_hit: parsed.stop_condition_hit || null,
  };
}

module.exports = {
  EVIDENCE_SCHEMA_VERSION,
  VALID_ROLES,
  VALID_STOP_CONDITIONS,
  asArray,
  roleName,
  evidenceBaseDir,
  assertPathUnderBase,
  resolveEvidencePath,
  atomicWriteJson,
  atomicWriteText,
  validateEvidenceFile,
  submitEvidence,
};
