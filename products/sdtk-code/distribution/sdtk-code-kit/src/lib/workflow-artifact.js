"use strict";

const fs = require("fs");
const path = require("path");
const { IntegrityError, ValidationError } = require("./errors");
const { resolvePayloadFile } = require("./toolkit-payload");

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const PRODUCT_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");
const SOURCE_TEMPLATE_PATH = path.join(
  PRODUCT_ROOT,
  "toolkit",
  "templates",
  "CODE_WORKFLOW_TEMPLATE.md"
);
const PAYLOAD_TEMPLATE_PATH = resolvePayloadFile("toolkit/templates/CODE_WORKFLOW_TEMPLATE.md");
const DEFAULT_MANAGED_BLOCKS = ["METADATA", "INPUTS", "PLAN", "BUILD", "STATUS"];
const LEGACY_PLAN_SECTION_RE =
  /## 3\. Scope Lock[\s\S]*?(?=<!-- SDTK-CODE:STATUS:START -->|## 5\. Status Checklist)/;
const STATUS_BLOCK_RE = /(?=<!-- SDTK-CODE:STATUS:START -->)/;
const LEGACY_VERIFY_SECTION_RE =
  /## 6\. Evidence And Review Notes[\s\S]*?(?=## 7\. Ship \/ Finish Decision)/;
const LEGACY_SHIP_SECTION_RE = /## 7\. Ship \/ Finish Decision[\s\S]*$/;

function resolveWorkflowTemplatePath() {
  if (fs.existsSync(PAYLOAD_TEMPLATE_PATH)) {
    return PAYLOAD_TEMPLATE_PATH;
  }
  if (fs.existsSync(SOURCE_TEMPLATE_PATH)) {
    return SOURCE_TEMPLATE_PATH;
  }
  throw new IntegrityError(
    `SDTK-CODE workflow template not found. Expected ${PAYLOAD_TEMPLATE_PATH} or ${SOURCE_TEMPLATE_PATH}.`
  );
}

function getWorkflowArtifactPath(projectPath, featureKey) {
  return path.join(projectPath, "docs", "dev", `CODE_WORKFLOW_${featureKey}.md`);
}

function renderCheckboxList(entries, formatter, emptyText) {
  if (!entries || entries.length === 0) {
    return `- ${emptyText}`;
  }
  return entries.map((entry) => formatter(entry)).join("\n");
}

function renderRequiredInputs(requiredInputs, normalizePath) {
  return renderCheckboxList(
    requiredInputs,
    (entry) => `- [${entry.exists ? "x" : " "}] ${entry.key}: \`${normalizePath(entry.path)}\``,
    "No required inputs recorded."
  );
}

function renderOptionalInputs(optionalInputs, normalizePath) {
  return renderCheckboxList(
    optionalInputs,
    (entry) => `- ${entry.key}: \`${normalizePath(entry.path)}\``,
    "No additional inputs discovered yet."
  );
}

function renderMissingInputs(missingInputs, normalizePath) {
  return renderCheckboxList(
    missingInputs,
    (entry) => `- ${entry.key}: \`${normalizePath(entry.path)}\``,
    "None."
  );
}

function renderBulletList(entries, emptyText) {
  if (!entries || entries.length === 0) {
    return `- ${emptyText}`;
  }
  return entries.map((entry) => `- ${entry}`).join("\n");
}

function humanizeIntakeSource(intakeSource) {
  switch (intakeSource) {
    case "formal_handoff":
      return "formal SDTK-SPEC handoff";
    case "legacy_compatibility":
      return "legacy compatibility intake";
    default:
      return intakeSource || "unknown";
  }
}

function renderPlanBlock(data) {
  const planningNotes = [];
  if (data.planningMode === "bugfix-light") {
    planningNotes.push(
      "Bugfix lane normally skips `plan`; this lightweight planning step was recorded as an explicit deviation."
    );
  }
  if (Array.isArray(data.planNotes) && data.planNotes.length > 0) {
    planningNotes.push(...data.planNotes);
  }
  const candidateSlices = Array.isArray(data.candidateSlices) ? data.candidateSlices : [];
  const candidatePlanningNotes = Array.isArray(data.candidatePlanningNotes)
    ? data.candidatePlanningNotes
    : [];
  const shouldRenderSeededCandidates =
    data.currentPhase === "start" &&
    data.lane === "feature" &&
    data.slices.length === 0 &&
    candidateSlices.length > 0;

  if (shouldRenderSeededCandidates) {
    planningNotes.unshift(...candidatePlanningNotes);
  }

  const lines = [
    "<!-- SDTK-CODE:PLAN:START -->",
    "## 3. Scope Lock",
    "### In Scope",
    renderBulletList(data.inScope, "Pending confirmation during workflow planning."),
    "",
    "### Out Of Scope",
    renderBulletList(data.outScope, "Pending confirmation during workflow planning."),
    "",
    "### Assumptions",
    renderBulletList(data.assumptions, "No explicit planning assumptions recorded."),
    "",
    "### Risks",
    renderBulletList(data.risks, "No explicit planning risks recorded."),
    "",
    "## 4. Plan / Slices",
  ];

  if (shouldRenderSeededCandidates) {
    lines.push(
      "### Seeded Candidate Slices From Formal Handoff",
      renderBulletList(candidateSlices, "No candidate slices seeded from the formal handoff."),
      "",
      "### Finalized Slices After `plan`",
      renderBulletList(data.slices, "Pending confirmation during workflow planning."),
      ""
    );
  } else {
    lines.push(
      renderBulletList(
        data.slices,
        data.lane === "bugfix"
          ? "Lightweight bugfix planning not recorded yet."
          : "Pending lane-specific planning or build guidance."
      ),
      ""
    );
  }

  lines.push(
    "### Planning Notes",
    renderBulletList(planningNotes, "No additional planning notes recorded."),
    "<!-- SDTK-CODE:PLAN:END -->"
  );

  return lines.join("\n");
}

function renderBuildBlock(data) {
  const currentPhase = data.currentPhase || "start";
  const buildStatus = currentPhase === "build" ? data.phaseStatus : "pending";
  const executionMode = data.parallelReason ? "parallel" : "sequential";

  return [
    "<!-- SDTK-CODE:BUILD:START -->",
    "### Build Progress",
    `- Build status: \`${buildStatus}\``,
    `- Execution mode: \`${executionMode}\``,
    "",
    "### Active Slices",
    renderBulletList(
      data.activeSlices,
      currentPhase === "build"
        ? "No active build slices recorded yet."
        : "Pending build-phase execution."
    ),
    "",
    "### Build Notes",
    renderBulletList(data.buildNotes, "No build notes recorded yet."),
    "",
    "### Debug Notes",
    renderBulletList(data.debugNotes, "No debug notes recorded."),
    "",
    "### Parallelization Justification",
    renderBulletList(
      data.parallelReason ? [data.parallelReason] : [],
      "Not using explicit parallel execution in this build pass."
    ),
    "<!-- SDTK-CODE:BUILD:END -->",
  ].join("\n");
}

function renderEvidenceList(entries, emptyText = "No summarized verification evidence recorded yet.") {
  if (!entries || entries.length === 0) {
    return `- ${emptyText}`;
  }

  return entries
    .map(
      (entry) =>
        `- \`${entry.checkName}\` | \`${entry.result}\` | ${entry.summary} | Raw output: \`${entry.rawOutputRef}\``
    )
    .join("\n");
}

function renderVerifyBlock(data) {
  return [
    "<!-- SDTK-CODE:VERIFY:START -->",
    "## 6. Evidence And Review Notes",
    "### Review Packet",
    data.reviewPacketPath
      ? `- Review packet: \`${data.reviewPacketPath}\``
      : "- Review packet not generated yet.",
    "",
    "### Evidence Summary",
    renderEvidenceList(data.evidenceEntries),
    "",
    "### Raw Output References",
    `- Store raw command output under \`docs/dev/evidence/${data.featureKey}/\` and reference it from this section.`,
    "",
    "### Review Gate Status",
    `- Evidence gate: \`${data.evidenceGate}\``,
    `- Spec/compliance gate: \`${data.specGateStatus}\``,
    `- Quality gate: \`${data.qualityGateStatus}\``,
    "",
    "### Spec / Compliance Notes",
    renderBulletList(data.specNotes, "No spec/compliance notes recorded yet."),
    "",
    "### Quality Notes",
    renderBulletList(data.qualityNotes, "No quality review notes recorded yet."),
    "",
    "### Debug Follow-Up",
    renderBulletList(data.verifyDebugNotes, "No reactive debug follow-up recorded."),
    "<!-- SDTK-CODE:VERIFY:END -->",
  ].join("\n");
}

function renderShipBlock(data) {
  return [
    "<!-- SDTK-CODE:SHIP:START -->",
    "## 7. Ship / Finish Decision",
    "### Final Decision",
    `- Decision: \`${data.shipDecision}\``,
    `- Ship status: \`${data.shipStatus}\``,
    "",
    "### Preflight Summary",
    renderEvidenceList(data.preflightEntries, "No ship preflight entries recorded yet."),
    "",
    "### Follow-Up Items",
    renderBulletList(data.shipFollowUps, "No follow-up items recorded."),
    "",
    "### Ship Notes",
    renderBulletList(data.shipNotes, "No additional ship notes recorded."),
    "",
    "### Debug Follow-Up",
    renderBulletList(data.shipDebugNotes, "No reactive debug follow-up recorded."),
    "<!-- SDTK-CODE:SHIP:END -->",
  ].join("\n");
}

function renderManagedBlocks(data) {
  const currentPhase = data.currentPhase || "start";
  const isClosedWorkflow = data.nextPhase === "none";
  const suggestedEngine =
    isClosedWorkflow || !Array.isArray(data.suggestedEngineSkills) || data.suggestedEngineSkills.length === 0
      ? "none (workflow closed)"
      : data.suggestedEngineSkills.map((value) => `\`${value}\``).join(", ");

  return {
    METADATA: [
      "<!-- SDTK-CODE:METADATA:START -->",
      "## 1. Metadata",
      `- Feature key: \`${data.featureKey}\``,
      `- Lane: \`${data.lane}\``,
      `- Current phase: \`${currentPhase}\``,
      `- Phase status: \`${data.phaseStatus}\``,
      `- Intake outcome: \`${data.intakeOutcome}\``,
      `- Last updated: \`${data.lastUpdated}\``,
      "<!-- SDTK-CODE:METADATA:END -->",
    ].join("\n"),
    INPUTS: [
      "<!-- SDTK-CODE:INPUTS:START -->",
      "## 2. Inputs",
      "### Intake Source",
      `- Source: \`${humanizeIntakeSource(data.intakeSource)}\``,
      `- Formal handoff status: \`${data.handoffStatus}\``,
      "",
      "### Intake Notes",
      renderBulletList(data.compatibilityWarnings, "No compatibility notes recorded."),
      "",
      "### Required Inputs",
      renderRequiredInputs(data.requiredInputs, data.normalizePath),
      "",
      "### Additional Discovered Inputs",
      renderOptionalInputs(data.optionalInputs, data.normalizePath),
      "",
      "### Missing Required Inputs",
      renderMissingInputs(data.missingInputs, data.normalizePath),
      "<!-- SDTK-CODE:INPUTS:END -->",
    ].join("\n"),
    PLAN: renderPlanBlock(data),
    BUILD: renderBuildBlock(data),
    VERIFY: renderVerifyBlock(data),
    SHIP: renderShipBlock(data),
    STATUS: [
      "<!-- SDTK-CODE:STATUS:START -->",
      "## 5. Status Checklist",
      `- Current phase: \`${currentPhase}\``,
      `- Next recommended phase: \`${data.nextPhase}\``,
      `- Suggested engine entrypoints: ${suggestedEngine}`,
      `- Blocking state: \`${data.blockingState}\``,
      "<!-- SDTK-CODE:STATUS:END -->",
    ].join("\n"),
  };
}

function renderNewArtifact(templateText, data) {
  const blocks = renderManagedBlocks(data);
  const replacements = {
    "__FEATURE_KEY__": data.featureKey,
    "__LANE__": data.lane,
    "__PHASE_STATUS__": data.phaseStatus,
    "__INTAKE_OUTCOME__": data.intakeOutcome,
    "__LAST_UPDATED__": data.lastUpdated,
    "__REQUIRED_INPUTS__": renderRequiredInputs(data.requiredInputs, data.normalizePath),
    "__ADDITIONAL_INPUTS__": renderOptionalInputs(data.optionalInputs, data.normalizePath),
    "__MISSING_INPUTS__": renderMissingInputs(data.missingInputs, data.normalizePath),
    "__NEXT_PHASE__": data.nextPhase,
    "__SUGGESTED_ENGINE__": data.suggestedEngineSkills.map((value) => `\`${value}\``).join(", "),
    "__BLOCKING_STATE__": data.blockingState,
  };

  let rendered = templateText;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.split(token).join(value);
  }

  for (const [name, block] of Object.entries(blocks)) {
    const regex = new RegExp(
      `<!-- SDTK-CODE:${name}:START -->[\\s\\S]*?<!-- SDTK-CODE:${name}:END -->`
    );
    rendered = rendered.replace(regex, block);
  }

  return rendered;
}

function replaceManagedBlock(text, blockName, replacement) {
  const regex = new RegExp(
    `<!-- SDTK-CODE:${blockName}:START -->[\\s\\S]*?<!-- SDTK-CODE:${blockName}:END -->`
  );
  if (!regex.test(text)) {
    if (blockName === "PLAN" && LEGACY_PLAN_SECTION_RE.test(text)) {
      return text.replace(LEGACY_PLAN_SECTION_RE, `${replacement}\n\n`);
    }
    if (blockName === "BUILD" && STATUS_BLOCK_RE.test(text)) {
      return text.replace(STATUS_BLOCK_RE, `${replacement}\n\n`);
    }
    if (blockName === "VERIFY" && LEGACY_VERIFY_SECTION_RE.test(text)) {
      return text.replace(LEGACY_VERIFY_SECTION_RE, `${replacement}\n\n`);
    }
    if (blockName === "SHIP" && LEGACY_SHIP_SECTION_RE.test(text)) {
      return text.replace(LEGACY_SHIP_SECTION_RE, replacement);
    }
    throw new ValidationError(
      `Existing workflow artifact is missing managed block ${blockName}. Re-run with --force to reinitialize it.`
    );
  }
  return text.replace(regex, replacement);
}

function extractManagedBlock(text, blockName) {
  const regex = new RegExp(
    `<!-- SDTK-CODE:${blockName}:START -->([\\s\\S]*?)<!-- SDTK-CODE:${blockName}:END -->`
  );
  const match = text.match(regex);
  return match ? match[1] : null;
}

function parseMetadataField(metadataBlock, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`- ${escapedLabel}: \`([^\\r\\n\`]+)\``);
  const match = metadataBlock.match(regex);
  return match ? match[1] : null;
}

function parseManagedField(blockText, label) {
  if (!blockText) {
    return null;
  }
  return parseMetadataField(blockText, label);
}

function loadWorkflowArtifactState(projectPath, featureKey) {
  const artifactPath = getWorkflowArtifactPath(projectPath, featureKey);
  if (!fs.existsSync(artifactPath)) {
    throw new ValidationError(
      `Workflow artifact not found: ${artifactPath}. Run "sdtk-code start --lane <feature|bugfix> --feature-key ${featureKey}" first.`
    );
  }

  const text = fs.readFileSync(artifactPath, "utf-8");
  const metadataBlock = extractManagedBlock(text, "METADATA");
  if (!metadataBlock) {
    throw new ValidationError(
      `Workflow artifact is missing the METADATA block: ${artifactPath}. Re-run "sdtk-code start --force" to reinitialize it.`
    );
  }

  const state = {
    artifactPath,
    text,
    featureKey: parseMetadataField(metadataBlock, "Feature key"),
    lane: parseMetadataField(metadataBlock, "Lane"),
    currentPhase: parseMetadataField(metadataBlock, "Current phase"),
    phaseStatus: parseMetadataField(metadataBlock, "Phase status"),
    intakeOutcome: parseMetadataField(metadataBlock, "Intake outcome"),
    lastUpdated: parseMetadataField(metadataBlock, "Last updated"),
  };

  for (const [key, value] of Object.entries(state)) {
    if (key === "artifactPath" || key === "text" || key === "lastUpdated") {
      continue;
    }
    if (!value) {
      throw new ValidationError(
        `Workflow artifact is missing required metadata field "${key}": ${artifactPath}. Re-run "sdtk-code start --force" to repair it.`
      );
    }
  }

  return state;
}

function createOrUpdateWorkflowArtifact(options) {
  const templatePath = resolveWorkflowTemplatePath();
  const templateText = fs.readFileSync(templatePath, "utf-8");
  const artifactPath = getWorkflowArtifactPath(options.projectPath, options.featureKey);
  const artifactDir = path.dirname(artifactPath);
  fs.mkdirSync(artifactDir, { recursive: true });

  const data = {
    ...options,
    currentPhase: options.currentPhase || "start",
    inScope: options.inScope || [],
    outScope: options.outScope || [],
    assumptions: options.assumptions || [],
    risks: options.risks || [],
    slices: options.slices || [],
    planNotes: options.planNotes || [],
    candidateSlices: options.candidateSlices || [],
    candidatePlanningNotes: options.candidatePlanningNotes || [],
    activeSlices: options.activeSlices || [],
    buildNotes: options.buildNotes || [],
    debugNotes: options.debugNotes || [],
    parallelReason: options.parallelReason || null,
    evidenceEntries: options.evidenceEntries || [],
    evidenceGate: options.evidenceGate || "pending",
    specGateStatus: options.specGateStatus || "pending",
    qualityGateStatus: options.qualityGateStatus || "pending",
    specNotes: options.specNotes || [],
    qualityNotes: options.qualityNotes || [],
    verifyDebugNotes: options.verifyDebugNotes || [],
    shipDecision: options.shipDecision || "pending",
    shipStatus: options.shipStatus || "pending",
    preflightEntries: options.preflightEntries || [],
    shipFollowUps: options.shipFollowUps || [],
    shipNotes: options.shipNotes || [],
    shipDebugNotes: options.shipDebugNotes || [],
    reviewPacketPath: options.reviewPacketPath || null,
    intakeSource: options.intakeSource || "legacy_compatibility",
    handoffStatus: options.handoffStatus || "missing",
    compatibilityWarnings: options.compatibilityWarnings || [],
    lastUpdated: new Date().toISOString(),
  };
  const managedBlocks = options.managedBlocks || DEFAULT_MANAGED_BLOCKS;

  let nextText;
  if (!fs.existsSync(artifactPath) || options.force) {
    nextText = renderNewArtifact(templateText, data);
  } else {
    nextText = fs.readFileSync(artifactPath, "utf-8");
    const blocks = renderManagedBlocks(data);
    for (const blockName of managedBlocks) {
      nextText = replaceManagedBlock(nextText, blockName, blocks[blockName]);
    }
  }

  fs.writeFileSync(artifactPath, nextText, "utf-8");
  return artifactPath;
}

module.exports = {
  createOrUpdateWorkflowArtifact,
  extractManagedBlock,
  getWorkflowArtifactPath,
  loadWorkflowArtifactState,
  parseManagedField,
  resolveWorkflowTemplatePath,
};
