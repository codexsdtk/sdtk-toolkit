"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");
const { createOrUpdateWorkflowArtifact, loadWorkflowArtifactState } = require("./workflow-artifact");
const { createReviewPacket } = require("./workflow-review-packet");

const VALID_REVIEW_STATUS = ["pending", "pass", "partial", "fail"];
const VALID_EVIDENCE_RESULT = ["pass", "partial", "fail"];
const VALID_TRUTH_SYNC_STATUS = ["touched", "untouched"];
const GLOB_PATTERN_RE = /[*?[\]{}]/;

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

function normalizeRepoRelativePath(rawValue, label) {
  if (!rawValue || !String(rawValue).trim()) {
    throw new ValidationError(`${label} must be a non-empty repo-relative path.`);
  }

  const normalized = String(rawValue).trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new ValidationError(`${label} must be repo-relative, not absolute: ${rawValue}`);
  }
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new ValidationError(`${label} must stay within the repository boundary: ${rawValue}`);
  }

  return normalized;
}

function rejectGlobPattern(rawValue, label) {
  if (GLOB_PATTERN_RE.test(String(rawValue))) {
    throw new ValidationError(`${label} must be an exact repo-relative path, not a glob pattern: ${rawValue}`);
  }
}

function parseEvidenceEntries(entries, featureKey, projectPath) {
  const normalized = normalizeEntries(entries);
  if (normalized.length === 0) {
    throw new ValidationError(
      'Verification requires at least one "--evidence" entry in the format "check|summary|pass|docs/dev/evidence/FEATURE_KEY/file.txt".'
    );
  }

  const expectedPrefix = `docs/dev/evidence/${featureKey}/`;
  return normalized.map((entry) => {
    const parts = entry.split("|").map((part) => part.trim());
    if (parts.length !== 4 || parts.some((part) => !part)) {
      throw new ValidationError(
        'Each "--evidence" entry must use exactly four pipe-separated fields: "check|summary|pass|docs/dev/evidence/FEATURE_KEY/file.txt".'
      );
    }

    const [checkName, summary, result, rawOutputRef] = parts;
    validateChoice(result, VALID_EVIDENCE_RESULT, "evidence");

    const normalizedRef = rawOutputRef.replace(/\\/g, "/");
    rejectGlobPattern(normalizedRef, "evidence raw-output reference");
    if (!normalizedRef.startsWith(expectedPrefix)) {
      throw new ValidationError(
        `Evidence raw-output reference must stay under "${expectedPrefix}". Received: ${rawOutputRef}`
      );
    }
    if (!fs.existsSync(path.join(projectPath, normalizedRef.replace(/\//g, path.sep)))) {
      throw new ValidationError(
        `Evidence raw-output reference must exist before verify can claim the check ran. Missing: ${rawOutputRef}`
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

function parseChangedFileEntries(entries) {
  return normalizeEntries(entries).map((entry) => {
    const parts = entry.split("|").map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => !part)) {
      throw new ValidationError(
        'Each "--changed-file" entry must use exactly two pipe-separated fields: "repo/path|rationale".'
      );
    }

    const normalizedPath = normalizeRepoRelativePath(parts[0], "changed-file path");
    rejectGlobPattern(normalizedPath, "changed-file path");

    return {
      path: normalizedPath,
      rationale: parts[1],
    };
  });
}

function parseExcludeFileEntries(entries) {
  return normalizeEntries(entries).map((entry) => {
    const parts = entry.split("|").map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => !part)) {
      throw new ValidationError(
        'Each "--exclude-file" entry must use exactly two pipe-separated fields: "repo/path|reason".'
      );
    }

    const normalizedPath = normalizeRepoRelativePath(parts[0], "exclude-file path");
    rejectGlobPattern(normalizedPath, "exclude-file path");

    return {
      path: normalizedPath,
      reason: parts[1],
    };
  });
}

function parseTruthSyncTargetEntries(entries) {
  return normalizeEntries(entries).map((entry) => {
    const parts = entry.split("|").map((part) => part.trim());
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new ValidationError(
        'Each "--truth-sync-target" entry must use exactly three pipe-separated fields: "path-or-surface|touched|rationale".'
      );
    }

    const [target, status, rationale] = parts;
    validateChoice(status, VALID_TRUTH_SYNC_STATUS, "truth-sync-target");
    return {
      target,
      status,
      rationale,
    };
  });
}

function parseCommitBoundaryPaths(entries, flagName) {
  return normalizeEntries(entries).map((entry) => {
    const normalizedPath = normalizeRepoRelativePath(entry, `${flagName} path`);
    rejectGlobPattern(normalizedPath, `${flagName} path`);
    return normalizedPath;
  });
}

function parseCaveatEntries(entries) {
  return normalizeEntries(entries).map((entry) => {
    const parts = entry.split("|").map((part) => part.trim());
    if (parts.length !== 4 || parts.some((part) => !part)) {
      throw new ValidationError(
        'Each "--caveat" entry must use exactly four pipe-separated fields: "ID|statement|impact|owner".'
      );
    }

    return {
      id: parts[0],
      statement: parts[1],
      impact: parts[2],
      owner: parts[3],
    };
  });
}

function resolveEvidenceGate(evidenceEntries) {
  if (evidenceEntries.some((entry) => entry.result === "fail")) {
    return "fail";
  }
  if (evidenceEntries.some((entry) => entry.result === "partial")) {
    return "partial";
  }
  return "pass";
}

function resolveReviewStatus(value, flagName) {
  if (!value) {
    return "pending";
  }
  return validateChoice(value, VALID_REVIEW_STATUS, flagName);
}

function validateVerifyState(state) {
  if (state.intakeOutcome === "BLOCKED_MISSING_INPUTS") {
    throw new ValidationError(
      'Workflow artifact is blocked by missing upstream inputs. Re-run "sdtk-code start" after the handoff inputs are ready.'
    );
  }

  if (state.currentPhase === "build") {
    if (state.phaseStatus !== "completed") {
      throw new ValidationError(
        'Workflow must complete "build" before "verify". Run "sdtk-code build --complete" first.'
      );
    }
    return;
  }

  if (state.currentPhase !== "verify") {
    throw new ValidationError(
      `Cannot run "verify" from current phase "${state.currentPhase}". Re-run the next legal workflow step instead.`
    );
  }
}

function resolveVerifyPhaseStatus(flags, state, evidenceGate, specGateStatus, qualityGateStatus) {
  if (flags.complete && flags.blocked) {
    throw new ValidationError('Use either "--complete" or "--blocked", not both.');
  }

  if (flags.complete) {
    if (evidenceGate !== "pass" || specGateStatus !== "pass" || qualityGateStatus !== "pass") {
      throw new ValidationError(
        'Verify can be marked complete only when evidence, spec/compliance, and quality gates all pass.'
      );
    }
    return "completed";
  }

  if (
    flags.blocked ||
    evidenceGate === "fail" ||
    specGateStatus === "fail" ||
    qualityGateStatus === "fail"
  ) {
    return "blocked";
  }

  if (
    state.currentPhase === "verify" &&
    state.phaseStatus === "completed" &&
    evidenceGate === "pass" &&
    specGateStatus === "pass" &&
    qualityGateStatus === "pass"
  ) {
    return "completed";
  }

  return "in_progress";
}

function getSuggestedEngineSkills(phaseStatus, evidenceGate, specGateStatus, qualityGateStatus) {
  if (phaseStatus === "completed") {
    return ["code-ship", "code-finish"];
  }

  const hasFailure =
    evidenceGate === "fail" || specGateStatus === "fail" || qualityGateStatus === "fail";
  const skills = ["code-verify", "code-review"];
  if (hasFailure || phaseStatus === "blocked") {
    skills.unshift("code-debug");
  }
  return skills;
}

function evaluateProvenanceConsistency(reviewPacket) {
  const warnings = [];
  if (!reviewPacket || !reviewPacket.hasReferenceDisclosure) {
    warnings.push("review packet did not render the required Reference Disclosure section");
    return warnings;
  }

  if (reviewPacket.provenanceMode === "missing") {
    warnings.push("workflow plan is missing the required Provenance section or declaration");
  }

  if (
    reviewPacket.provenanceMode === "external" &&
    reviewPacket.referenceDisclosureMode !== "external"
  ) {
    warnings.push("workflow plan reports external references, but review packet disclosure mode is not external");
  }

  if (
    reviewPacket.provenanceMode === "no_reference" &&
    reviewPacket.referenceDisclosureMode !== "no_reference"
  ) {
    warnings.push("workflow plan reports no-reference declaration, but review packet disclosure does not mirror it");
  }

  return warnings;
}

function runVerify(projectPath, featureKey, flags) {
  const state = loadWorkflowArtifactState(projectPath, featureKey);
  validateVerifyState(state);

  const evidenceEntries = parseEvidenceEntries(flags.evidence, featureKey, projectPath);
  const evidenceGate = resolveEvidenceGate(evidenceEntries);
  const specGateStatus = resolveReviewStatus(flags["spec-status"], "spec-status");
  const qualityGateStatus = resolveReviewStatus(flags["quality-status"], "quality-status");
  const phaseStatus = resolveVerifyPhaseStatus(
    flags,
    state,
    evidenceGate,
    specGateStatus,
    qualityGateStatus
  );
  const nextPhase = phaseStatus === "completed" ? "ship" : "verify";
  const blockingState =
    phaseStatus === "blocked"
      ? "blocked_verify_issue"
      : phaseStatus === "completed"
        ? "clear"
        : "review_in_progress";
  const suggestedEngineSkills = getSuggestedEngineSkills(
    phaseStatus,
    evidenceGate,
    specGateStatus,
    qualityGateStatus
  );
  const specNotes = normalizeEntries(flags["spec-note"]);
  const qualityNotes = normalizeEntries(flags["quality-note"]);
  const debugNotes = normalizeEntries(flags["debug-note"]);
  const reviewPacket = createReviewPacket({
    projectPath,
    featureKey,
    workflowText: state.text,
    evidenceEntries,
    specGateStatus,
    qualityGateStatus,
    specNotes,
    qualityNotes,
    debugNotes,
    batchSummary: flags["batch-summary"] || "",
    changedFiles: parseChangedFileEntries(flags["changed-file"]),
    excludedFiles: parseExcludeFileEntries(flags["exclude-file"]),
    truthSyncTargets: parseTruthSyncTargetEntries(flags["truth-sync-target"]),
    commitInclude: parseCommitBoundaryPaths(flags["commit-include"], "commit-include"),
    commitExclude: parseCommitBoundaryPaths(flags["commit-exclude"], "commit-exclude"),
    caveats: parseCaveatEntries(flags.caveat),
    reviewerGuidance: normalizeEntries(flags["reviewer-guidance"]),
  });
  const normalizedReviewPacketPath = path
    .relative(projectPath, reviewPacket.reviewPacketPath)
    .replace(/\\/g, "/");
  const provenanceWarnings = evaluateProvenanceConsistency(reviewPacket);
  const verifyDebugNotes = [
    ...debugNotes,
    ...provenanceWarnings.map((warning) => `Provenance warning: ${warning}`),
  ];

  const artifactPath = createOrUpdateWorkflowArtifact({
    projectPath,
    featureKey,
    lane: state.lane,
    currentPhase: "verify",
    phaseStatus,
    intakeOutcome: state.intakeOutcome,
    nextPhase,
    blockingState,
    suggestedEngineSkills,
    managedBlocks: ["METADATA", "VERIFY", "STATUS"],
    evidenceEntries,
    evidenceGate,
    specGateStatus,
    qualityGateStatus,
    specNotes,
    qualityNotes,
    verifyDebugNotes,
    reviewPacketPath: normalizedReviewPacketPath,
  });

  return {
    artifactPath,
    lane: state.lane,
    phaseStatus,
    nextPhase,
    suggestedEngineSkills,
    evidenceCount: evidenceEntries.length,
    evidenceGate,
    specGateStatus,
    qualityGateStatus,
    reviewPacketPath: normalizedReviewPacketPath,
    provenanceWarnings,
  };
}

module.exports = {
  runVerify,
};
