"use strict";

const fs = require("fs");
const {
  extractManagedBlock,
  getWorkflowArtifactPath,
  parseManagedField,
} = require("./workflow-artifact");

const VALID_PHASES = new Set(["start", "plan", "build", "verify", "ship"]);
const VALID_PHASE_STATUSES = new Set(["pending", "in_progress", "completed", "blocked"]);
const VALID_NEXT_PHASES = new Set(["plan", "build", "verify", "ship", "none", "blocked"]);
const PLACEHOLDER_SLICES = new Set([
  "Pending confirmation during workflow planning.",
  "Pending lane-specific planning or build guidance.",
  "Lightweight bugfix planning not recorded yet.",
  "No active build slices recorded yet.",
  "Pending build-phase execution.",
]);

function quotePathForCommand(projectPath) {
  const normalized = String(projectPath || ".");
  return /\s/.test(normalized) ? `"${normalized}"` : normalized;
}

function normalizeNextPhase(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return "unknown";
  }
  if (/^none\s*\(workflow closed\)$/i.test(normalized)) {
    return "none";
  }
  return normalized;
}

function parseBulletSection(blockText, heading) {
  if (!blockText) {
    return [];
  }

  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = blockText.match(new RegExp(`### ${escapedHeading}\\r?\\n([\\s\\S]*?)(?=\\r?\\n### |$)`));
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

function parseInlinePlanSlices(planBlock) {
  if (!planBlock) {
    return [];
  }

  const match = planBlock.match(/## 4\. Plan \/ Slices\r?\n([\s\S]*?)(?=\r?\n### Planning Notes)/);
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

function uniqueNonPlaceholder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const normalized = String(value || "").trim();
    if (!normalized || PLACEHOLDER_SLICES.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parsePlanSlices(planBlock) {
  const finalized = parseBulletSection(planBlock, "Finalized Slices After `plan`");
  if (finalized.length > 0) {
    return uniqueNonPlaceholder(finalized);
  }
  return uniqueNonPlaceholder(parseInlinePlanSlices(planBlock));
}

function parseBuildActiveSlices(buildBlock) {
  return uniqueNonPlaceholder(parseBulletSection(buildBlock, "Active Slices"));
}

function buildCommandTemplates(featureKey, projectPath, lane) {
  const projectPathArg = quotePathForCommand(projectPath);
  return {
    start: `sdtk-code start --lane <feature|bugfix> --feature-key ${featureKey} --project-path ${projectPathArg}`,
    plan:
      lane === "feature"
        ? `sdtk-code plan --feature-key ${featureKey} --project-path ${projectPathArg} --slice "<approved-slice>"`
        : `sdtk-code plan --feature-key ${featureKey} --project-path ${projectPathArg} --note "<planning-note>"`,
    build: `sdtk-code build --feature-key ${featureKey} --project-path ${projectPathArg} --active-slice "<active-slice>"`,
    verify:
      `sdtk-code verify --feature-key ${featureKey} --project-path ${projectPathArg}` +
      ` --evidence "check|summary|pass|docs/dev/evidence/${featureKey}/file.txt" --spec-status <pending|pass|partial|fail>` +
      " --quality-status <pending|pass|partial|fail>",
    ship:
      `sdtk-code ship --feature-key ${featureKey} --project-path ${projectPathArg}` +
      ` --decision <ship|finish> --preflight "check|summary|pass|docs/dev/evidence/${featureKey}/file.txt"`,
    doctor: `sdtk-code doctor --feature-key ${featureKey} --project-path ${projectPathArg}`,
  };
}

function deriveExpectedNextPhase(lane, currentPhase, phaseStatus) {
  if (!VALID_PHASES.has(currentPhase) || !VALID_PHASE_STATUSES.has(phaseStatus)) {
    return null;
  }

  if (currentPhase === "start") {
    if (phaseStatus === "blocked") {
      return "blocked";
    }
    if (phaseStatus === "completed") {
      return lane === "bugfix" ? "build" : "plan";
    }
    return "start";
  }

  if (currentPhase === "plan") {
    return phaseStatus === "completed" ? "build" : "plan";
  }
  if (currentPhase === "build") {
    return phaseStatus === "completed" ? "verify" : "build";
  }
  if (currentPhase === "verify") {
    return phaseStatus === "completed" ? "ship" : "verify";
  }
  if (currentPhase === "ship") {
    return phaseStatus === "completed" ? "none" : "ship";
  }

  return null;
}

function deriveExpectedBlockingState(currentPhase, phaseStatus, intakeOutcome) {
  if (phaseStatus === "blocked") {
    if (currentPhase === "start") {
      if (intakeOutcome === "BLOCKED_MISSING_INPUTS") {
        return "blocked_missing_inputs";
      }
      if (intakeOutcome === "BLOCKED_UPSTREAM_HANDOFF") {
        return "blocked_upstream_handoff|invalid_handoff_contract";
      }
      return "blocked_missing_inputs|blocked_upstream_handoff|invalid_handoff_contract";
    }
    if (currentPhase === "build") {
      return "blocked_build_issue";
    }
    if (currentPhase === "verify") {
      return "blocked_verify_issue";
    }
    if (currentPhase === "ship") {
      return "blocked_ship_issue";
    }
  }

  if (phaseStatus === "in_progress") {
    if (currentPhase === "verify") {
      return "review_in_progress";
    }
    if (currentPhase === "ship") {
      return "ship_preflight_in_progress";
    }
    return "clear";
  }

  if (phaseStatus === "completed" || phaseStatus === "pending") {
    return "clear";
  }

  return null;
}

function parseEvidenceEntries(verifyBlock) {
  const entries = [];
  if (!verifyBlock) {
    return entries;
  }

  const pattern = /^- `([^`]+)` \| `([^`]+)` \| ([^\r\n]+?) \| Raw output: `([^`]+)`$/gm;
  let match;
  while ((match = pattern.exec(verifyBlock)) !== null) {
    entries.push({
      checkName: match[1],
      result: match[2],
      summary: match[3].trim(),
      rawOutputRef: match[4],
    });
  }

  return entries;
}

function evaluateContradictions(snapshot) {
  const issues = [];
  const expectedNext = deriveExpectedNextPhase(snapshot.lane, snapshot.currentPhase, snapshot.phaseStatus);
  const expectedBlocking = deriveExpectedBlockingState(
    snapshot.currentPhase,
    snapshot.phaseStatus,
    snapshot.intakeOutcome
  );

  if (snapshot.currentPhase && !VALID_PHASES.has(snapshot.currentPhase)) {
    issues.push(`Current phase is invalid: ${snapshot.currentPhase}`);
  }
  if (snapshot.phaseStatus && !VALID_PHASE_STATUSES.has(snapshot.phaseStatus)) {
    issues.push(`Phase status is invalid: ${snapshot.phaseStatus}`);
  }
  if (snapshot.nextPhase && !VALID_NEXT_PHASES.has(snapshot.nextPhase)) {
    issues.push(`Next recommended phase is invalid: ${snapshot.nextPhase}`);
  }

  if (expectedNext && snapshot.nextPhase && expectedNext !== snapshot.nextPhase) {
    issues.push(
      `Current phase/status expects next phase "${expectedNext}", but STATUS block reports "${snapshot.nextPhaseRaw}".`
    );
  }

  if (
    snapshot.currentPhase === "verify" &&
    snapshot.phaseStatus === "completed" &&
    snapshot.evidenceEntries.length === 0
  ) {
    issues.push("Workflow claims verify completed, but VERIFY evidence summary has no recorded evidence entries.");
  }

  if (snapshot.nextPhase === "none" && snapshot.currentPhase !== "ship") {
    issues.push("STATUS reports workflow closed (next phase none), but current phase is not ship.");
  }

  if (snapshot.phaseStatus === "blocked" && snapshot.blockingState === "clear") {
    issues.push("Phase status is blocked, but blocking state is clear.");
  }

  if (snapshot.phaseStatus !== "blocked" && /^blocked_/.test(snapshot.blockingState || "")) {
    issues.push(`Blocking state "${snapshot.blockingState}" is blocked_* while phase status is not blocked.`);
  }

  if (expectedBlocking && snapshot.blockingState) {
    if (expectedBlocking.includes("|")) {
      const allowed = expectedBlocking.split("|");
      if (!allowed.includes(snapshot.blockingState)) {
        issues.push(
          `Blocking state "${snapshot.blockingState}" is not legal for ${snapshot.currentPhase}/${snapshot.phaseStatus}. Expected one of: ${allowed.join(
            ", "
          )}.`
        );
      }
    } else if (expectedBlocking !== snapshot.blockingState) {
      issues.push(
        `Blocking state "${snapshot.blockingState}" does not match expected "${expectedBlocking}" for ${snapshot.currentPhase}/${snapshot.phaseStatus}.`
      );
    }
  }

  return [...new Set(issues)];
}

function evaluateResumeDecision(state) {
  const templates = state.commandTemplates;

  if (!state.exists) {
    return {
      allowed: false,
      mode: "not_started",
      reason: "Workflow artifact is missing. Resume is unavailable until start initializes the workflow.",
      nextCommand: templates.start,
    };
  }

  if (state.contradictions.length > 0) {
    return {
      allowed: false,
      mode: "invalid",
      reason: "Workflow state is contradictory. Resume is fail-closed until doctor reports a clean state.",
      nextCommand: templates.doctor,
    };
  }

  if (state.phaseStatus === "blocked" || state.nextPhase === "blocked") {
    return {
      allowed: false,
      mode: "blocked",
      reason: "Workflow is blocked. Resume is fail-closed for blocked states in BK-047-lite.",
      nextCommand: templates.doctor,
    };
  }

  if (state.nextPhase === "none") {
    return {
      allowed: false,
      mode: "closed",
      reason: "Workflow is already closed (next phase is none). There is nothing to resume.",
      nextCommand: null,
    };
  }

  if (
    state.nextPhase === "build" &&
    state.phaseStatus === "completed" &&
    (state.currentPhase === "start" || state.currentPhase === "plan")
  ) {
    const resumeBuildSlices =
      Array.isArray(state.buildActiveSlices) && state.buildActiveSlices.length > 0
        ? state.buildActiveSlices
        : state.planSlices;

    if (!Array.isArray(resumeBuildSlices) || resumeBuildSlices.length === 0) {
      return {
        allowed: false,
        mode: "manual",
        reason:
          "Resume cannot auto-dispatch build because no slice context was found in the workflow artifact. Provide explicit --active-slice entries manually.",
        nextCommand: templates.build,
      };
    }

    return {
      allowed: true,
      mode: "auto_build",
      reason: "Safe auto-resume is available for build from a completed pre-build phase.",
      dispatchCommand: templates.build,
      resumeBuildSlices,
    };
  }

  if (state.nextPhase === "plan") {
    return {
      allowed: false,
      mode: "manual",
      reason: "Resume is fail-closed for plan because operator slice confirmation is still required.",
      nextCommand: templates.plan,
    };
  }

  if (state.nextPhase === "verify") {
    return {
      allowed: false,
      mode: "manual",
      reason: "Resume is fail-closed for verify because operator evidence and gate inputs are required.",
      nextCommand: templates.verify,
    };
  }

  if (state.nextPhase === "ship") {
    return {
      allowed: false,
      mode: "manual",
      reason: "Resume is fail-closed for ship because operator decision and preflight inputs are required.",
      nextCommand: templates.ship,
    };
  }

  return {
    allowed: false,
    mode: "manual",
    reason: "Resume is fail-closed because the next legal action still requires explicit operator input.",
    nextCommand: templates.build,
  };
}

function loadWorkflowState(projectPath, featureKey) {
  const artifactPath = getWorkflowArtifactPath(projectPath, featureKey);
  const commandTemplates = buildCommandTemplates(featureKey, projectPath);

  if (!fs.existsSync(artifactPath)) {
    const missingSnapshot = {
      featureKey,
      projectPath,
      artifactPath,
      exists: false,
      commandTemplates,
      contradictions: [],
    };
    missingSnapshot.resumeDecision = evaluateResumeDecision(missingSnapshot);
    return missingSnapshot;
  }

  const text = fs.readFileSync(artifactPath, "utf-8");
  const metadataBlock = extractManagedBlock(text, "METADATA");
  const statusBlock = extractManagedBlock(text, "STATUS");
  const planBlock = extractManagedBlock(text, "PLAN");
  const buildBlock = extractManagedBlock(text, "BUILD");
  const verifyBlock = extractManagedBlock(text, "VERIFY");
  const shipBlock = extractManagedBlock(text, "SHIP");
  const lane = parseManagedField(metadataBlock, "Lane") || "unknown";
  const rawNextPhase = parseManagedField(statusBlock, "Next recommended phase") || "unknown";

  const snapshot = {
    featureKey,
    projectPath,
    artifactPath,
    exists: true,
    text,
    blocks: {
      METADATA: metadataBlock,
      STATUS: statusBlock,
      PLAN: planBlock,
      BUILD: buildBlock,
      VERIFY: verifyBlock,
      SHIP: shipBlock,
    },
    lane,
    currentPhase: parseManagedField(metadataBlock, "Current phase") || "unknown",
    phaseStatus: parseManagedField(metadataBlock, "Phase status") || "unknown",
    intakeOutcome: parseManagedField(metadataBlock, "Intake outcome") || "unknown",
    nextPhaseRaw: rawNextPhase,
    nextPhase: normalizeNextPhase(rawNextPhase),
    blockingState: parseManagedField(statusBlock, "Blocking state") || "unknown",
    planSlices: parsePlanSlices(planBlock),
    buildActiveSlices: parseBuildActiveSlices(buildBlock),
    evidenceEntries: parseEvidenceEntries(verifyBlock),
    commandTemplates: buildCommandTemplates(featureKey, projectPath, lane),
  };

  snapshot.contradictions = evaluateContradictions(snapshot);
  snapshot.resumeDecision = evaluateResumeDecision(snapshot);
  return snapshot;
}

module.exports = {
  loadWorkflowState,
};