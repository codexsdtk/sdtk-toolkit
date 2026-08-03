"use strict";

const fs = require("fs");
const path = require("path");
const { extractManagedBlock, getWorkflowArtifactPath } = require("./workflow-artifact");

const LATEST_HANDOFF_SCHEMA_VERSION = "0.2";
const ACCEPTED_HANDOFF_SCHEMA_VERSIONS = new Set(["0.1", "0.2"]);
const HANDOFF_STATUSES = new Set(["READY_FOR_SDTK_CODE", "BLOCKED_FOR_SDTK_CODE"]);
const HANDOFF_LANES = new Set(["feature", "bugfix"]);
const OPS_HANDOFF_SCHEMA_VERSION = "0.1";
const OPS_HANDOFF_READY_STATUS = "READY_FOR_SDTK_OPS";

function normalizePathForDoc(projectPath, targetPath) {
  return path.relative(projectPath, targetPath).split(path.sep).join("/");
}

function getCodeHandoffPath(projectPath, featureKey) {
  return path.join(projectPath, "docs", "dev", `CODE_HANDOFF_${featureKey}.json`);
}

function getOpsHandoffPath(projectPath, featureKey) {
  return path.join(projectPath, "docs", "dev", `OPS_HANDOFF_${featureKey}.json`);
}

function buildPathEntry(key, projectPath, relativePath) {
  const normalized = relativePath.split("/").join(path.sep);
  const fullPath = path.join(projectPath, normalized);
  return {
    key,
    path: fullPath,
    exists: fs.existsSync(fullPath),
  };
}

function uniquePathEntries(entries) {
  const seen = new Set();
  const result = [];

  for (const entry of entries) {
    const key = `${entry.key}::${entry.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }

  return result;
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

function createIntakeResult({
  projectPath,
  featureKey,
  lane,
  requiredInputs,
  optionalInputs,
  missingInputs,
  blocked,
  intakeOutcome,
  nextPhase,
  phaseStatus,
  blockingState,
  intakeSource,
  handoffStatus,
  compatibilityWarnings = [],
  blockingMessage,
  blockingDetails = [],
  candidateSlices = [],
  candidatePlanningNotes = [],
}) {
  return {
    requiredInputs: uniquePathEntries(requiredInputs || []),
    optionalInputs: uniquePathEntries(optionalInputs || []),
    missingInputs: uniquePathEntries(missingInputs || []),
    blocked,
    intakeOutcome,
    nextPhase,
    phaseStatus,
    blockingState,
    suggestedEngineSkills: getSuggestedEngineSkills(lane, blocked),
    normalizePath: (targetPath) => normalizePathForDoc(projectPath, targetPath),
    intakeSource,
    handoffStatus,
    compatibilityWarnings,
    blockingMessage,
    blockingDetails,
    featureKey,
    lane,
    candidateSlices,
    candidatePlanningNotes,
  };
}

function createBlockedFormalIntake({
  projectPath,
  featureKey,
  lane,
  handoffStatus,
  requiredInputs,
  optionalInputs,
  blockingState,
  blockingMessage,
  blockingDetails = [],
  compatibilityWarnings = [],
}) {
  const missingInputs = (requiredInputs || []).filter((entry) => !entry.exists);

  return createIntakeResult({
    projectPath,
    featureKey,
    lane,
    requiredInputs,
    optionalInputs,
    missingInputs,
    blocked: true,
    intakeOutcome: "BLOCKED_UPSTREAM_HANDOFF",
    nextPhase: "blocked",
    phaseStatus: "blocked",
    blockingState,
    intakeSource: "formal_handoff",
    handoffStatus,
    compatibilityWarnings,
    blockingMessage,
    blockingDetails,
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRelativePath(value, label) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${label} must be a non-empty repo-relative forward-slash path.`);
  }

  const trimmed = value.trim();
  if (trimmed.includes("\\")) {
    throw new Error(`${label} must use repo-relative forward-slash paths: ${trimmed}`);
  }
  if (trimmed.startsWith("/")) {
    throw new Error(`${label} must be repo-relative, not absolute: ${trimmed}`);
  }
  if (/^[A-Za-z]:/.test(trimmed)) {
    throw new Error(`${label} must be repo-relative, not drive-qualified: ${trimmed}`);
  }

  return trimmed;
}

function requireArray(payload, key) {
  if (!Array.isArray(payload[key])) {
    throw new Error(`${key} must be an array.`);
  }
  return payload[key];
}

function collectSoftWarnings(payload) {
  const warnings = [];

  if (payload.schema_version === "0.1") {
    warnings.push(
      'Formal handoff compatibility warning: schema_version "0.1" is still accepted, but richer BK-057 planning context is unavailable.'
    );
  }

  if (payload.generated_by !== "sdtk-dev") {
    warnings.push(
      `Formal handoff compatibility warning: generated_by is ${JSON.stringify(
        payload.generated_by
      )}; expected "sdtk-dev".`
    );
  }

  if (!isNonEmptyString(payload.generated_at)) {
    warnings.push("Formal handoff compatibility warning: generated_at is missing or empty.");
  }

  return warnings;
}

function normalizeStringArray(entries, label) {
  if (!Array.isArray(entries)) {
    throw new Error(`${label} must be an array.`);
  }

  return entries.map((entry) => String(entry).trim()).filter(Boolean);
}

function normalizeOptionalStringArray(entries, label) {
  if (entries == null) {
    return [];
  }

  return normalizeStringArray(entries, label);
}

function normalizeImpactMap(impactMap) {
  if (impactMap == null) {
    return null;
  }
  if (!impactMap || typeof impactMap !== "object" || Array.isArray(impactMap)) {
    throw new Error("impact_map must be an object.");
  }

  return {
    api_refs: normalizeStringArray(requireArray(impactMap, "api_refs"), "impact_map.api_refs").map((entry, index) =>
      normalizeRelativePath(entry, `impact_map.api_refs[${index}]`)
    ),
    database_refs: normalizeStringArray(requireArray(impactMap, "database_refs"), "impact_map.database_refs").map(
      (entry, index) => normalizeRelativePath(entry, `impact_map.database_refs[${index}]`)
    ),
    ui_refs: normalizeStringArray(requireArray(impactMap, "ui_refs"), "impact_map.ui_refs").map((entry, index) =>
      normalizeRelativePath(entry, `impact_map.ui_refs[${index}]`)
    ),
    flow_refs: normalizeStringArray(requireArray(impactMap, "flow_refs"), "impact_map.flow_refs").map((entry, index) =>
      normalizeRelativePath(entry, `impact_map.flow_refs[${index}]`)
    ),
  };
}

function buildImpactPlanningNotes(impactMap) {
  if (!impactMap) {
    return [];
  }

  const categoryLabels = {
    api_refs: "API refs",
    database_refs: "Database refs",
    ui_refs: "UI refs",
    flow_refs: "Flow refs",
  };

  return Object.entries(categoryLabels)
    .filter(([key]) => Array.isArray(impactMap[key]) && impactMap[key].length > 0)
    .map(([key, label]) => `Seeded impact ${label}: ${impactMap[key].join(", ")}`);
}

function buildCandidatePlanningSeed(
  lane,
  implementationSlices,
  testObligations,
  { schemaVersion, impactMap = null, recoveryNotes = [] } = {}
) {
  if (lane !== "feature") {
    return {
      candidateSlices: [],
      candidatePlanningNotes: [],
    };
  }

  const candidatePlanningNotes = [
    "Seeded from the formal SDTK-SPEC handoff. Confirm or refine these candidate slices during `sdtk-code plan`.",
  ];

  if (schemaVersion === "0.2") {
    candidatePlanningNotes.push(
      "Seeded build order: implementation_slices order from the formal SDTK-SPEC handoff is the recommended downstream sequence."
    );
    candidatePlanningNotes.push(...buildImpactPlanningNotes(impactMap));
  }

  if (testObligations.length > 0) {
    candidatePlanningNotes.push(
      ...testObligations.map((entry) => `Seeded test obligation: ${entry}`)
    );
  }

  if (schemaVersion === "0.2" && recoveryNotes.length > 0) {
    candidatePlanningNotes.push(
      ...recoveryNotes.map((entry) => `Seeded recovery note: ${entry}`)
    );
  }

  return {
    candidateSlices: implementationSlices,
    candidatePlanningNotes,
  };
}

function humanizeFeatureKey(featureKey) {
  return String(featureKey)
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(" ");
}

function uniqueStrings(entries) {
  return [...new Set((entries || []).map((entry) => String(entry).trim()).filter(Boolean))];
}

function uniqueObjects(entries, keyBuilder) {
  const seen = new Set();
  const results = [];
  for (const entry of entries || []) {
    const key = keyBuilder(entry);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(entry);
  }
  return results;
}

function parseBulletEntries(sectionText) {
  if (!sectionText) {
    return [];
  }

  return sectionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseBlockSection(blockText, heading) {
  if (!blockText) {
    return [];
  }

  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = blockText.match(new RegExp(`### ${escapedHeading}\\r?\\n([\\s\\S]*?)(?=\\r?\\n### |$)`));
  return match ? parseBulletEntries(match[1]) : [];
}

function parseInlineSliceSection(planBlock) {
  if (!planBlock) {
    return [];
  }

  const match = planBlock.match(/## 4\. Plan \/ Slices\r?\n([\s\S]*?)(?=\r?\n### Planning Notes)/);
  return match ? parseBulletEntries(match[1]) : [];
}

function isPlaceholderSlice(value) {
  return [
    "Pending confirmation during workflow planning.",
    "Pending lane-specific planning or build guidance.",
    "Lightweight bugfix planning not recorded yet.",
    "No active build slices recorded yet.",
    "Pending build-phase execution.",
  ].includes(value);
}

function cleanSliceEntries(entries) {
  return uniqueStrings(entries).filter((entry) => !isPlaceholderSlice(entry));
}

function deriveScopeSliceId(title, index) {
  const prefixed = title.match(/^([A-Z]\d+(?:-[A-Za-z0-9]+)?)\s*:/);
  if (prefixed) {
    return prefixed[1];
  }

  const tokenized = title.match(/^([A-Z]\d+(?:-[A-Za-z0-9]+)?)\b/);
  if (tokenized) {
    return tokenized[1];
  }

  return `S${index + 1}`;
}

function deriveOpsImpactSummary(title) {
  const lower = title.toLowerCase();

  if (/\b(database|migration|schema|sql|table|db)\b/.test(lower)) {
    return "Requires rollout sequencing plus migration and recovery safety checks.";
  }
  if (/\b(api|service|endpoint|backend|auth)\b/.test(lower)) {
    return "Requires runtime service deployment plus API smoke validation.";
  }
  if (/\b(ui|screen|frontend|page|form|layout)\b/.test(lower)) {
    return "Requires user-facing rollout validation for the updated UI surface.";
  }
  if (/\b(flow|interaction|integration|dispatch)\b/.test(lower)) {
    return "Requires end-to-end runtime validation across the affected interaction path.";
  }

  return "Requires bounded runtime rollout and post-deploy validation for the scoped slice.";
}

function parseWorkflowScopeSlices(workflowText, handoffPayload) {
  const planBlock = extractManagedBlock(workflowText, "PLAN");
  const buildBlock = extractManagedBlock(workflowText, "BUILD");

  let sliceTitles = cleanSliceEntries(parseBlockSection(planBlock, "Finalized Slices After `plan`"));
  if (sliceTitles.length === 0) {
    sliceTitles = cleanSliceEntries(parseInlineSliceSection(planBlock));
  }
  if (sliceTitles.length === 0) {
    sliceTitles = cleanSliceEntries(parseBlockSection(buildBlock, "Active Slices"));
  }
  if (sliceTitles.length === 0) {
    sliceTitles = uniqueStrings(handoffPayload.implementation_slices || []);
  }

  return sliceTitles.map((title, index) => ({
    slice_id: deriveScopeSliceId(title, index),
    title,
    ops_impact_summary: deriveOpsImpactSummary(title),
  }));
}

function inferEvidenceKind(checkName, refPath) {
  const combined = `${checkName} ${refPath}`.toLowerCase();
  if (/\b(review|checklist|approval|captain)\b/.test(combined)) {
    return "review";
  }
  if (/\b(pack|build|bundle|artifact)\b/.test(combined)) {
    return "build";
  }
  if (/\b(pytest|npm test|test|regression|smoke|verify)\b/.test(combined)) {
    return "test";
  }
  return "artifact";
}

function parseEvidenceEntriesFromWorkflow(workflowText) {
  const entries = [];
  const regex = /^- `([^`]+)` \| `([^`]+)` \| ([^\r\n]+?) \| Raw output: `([^`]+)`$/gm;
  let match;
  while ((match = regex.exec(workflowText)) !== null) {
    entries.push({
      checkName: match[1],
      result: match[2],
      summary: match[3].trim(),
      rawOutputRef: match[4],
    });
  }
  return entries;
}

function buildCodeEvidenceRefs(projectPath, featureKey, workflowText) {
  const workflowPath = getWorkflowArtifactPath(projectPath, featureKey);
  const refs = [
    {
      label: `${humanizeFeatureKey(featureKey)} code workflow artifact`,
      path: normalizePathForDoc(projectPath, workflowPath),
      kind: "workflow",
    },
  ];

  for (const entry of parseEvidenceEntriesFromWorkflow(workflowText)) {
    refs.push({
      label: `${entry.checkName} evidence`,
      path: entry.rawOutputRef,
      kind: inferEvidenceKind(entry.checkName, entry.rawOutputRef),
      notes: entry.summary,
    });
  }

  return uniqueObjects(refs, (entry) => `${entry.kind}::${entry.path}`);
}

function hasRequiredRef(payload, prefix) {
  return Array.isArray(payload.required_refs)
    ? payload.required_refs.some((entry) => String(entry).startsWith(prefix))
    : false;
}

function buildDeploymentPrerequisites(preflightEntries) {
  return uniqueStrings(
    preflightEntries.map((entry) => `${entry.checkName}: ${entry.summary}`)
  );
}

function buildEnvironmentAssumptions(handoffPayload, decision) {
  const assumptions = [
    "OPS intake remains anchored to the current formal CODE_HANDOFF and repo config contract.",
    `DEV-Run should use ${handoffPayload.repo_config_ref} as the current repo command/config reference.`,
  ];

  if (decision === "finish") {
    assumptions.push(
      'The CODE closeout used "finish", so remaining hardening or deployment work stays explicit during DEV-Run intake.'
    );
  }

  if (hasRequiredRef(handoffPayload, "docs/api/")) {
    assumptions.push("Runtime execution can reach the service or API surfaces referenced by the scoped slices.");
  }
  if (hasRequiredRef(handoffPayload, "docs/database/")) {
    assumptions.push("Runtime rollout preserves compatible database state for the scoped slices.");
  }

  return uniqueStrings(assumptions);
}

function buildInfraRuntimeDependencies(handoffPayload) {
  const dependencies = [
    {
      dependency: "sdtk-spec.config.json",
      requirement: "Use the repo command and environment contract from sdtk-spec.config.json during DEV-Run execution.",
    },
  ];

  if (hasRequiredRef(handoffPayload, "docs/api/")) {
    dependencies.push({
      dependency: "Application service runtime",
      requirement: "Deploy and validate the API or service surfaces referenced by the scoped slices.",
    });
  }
  if (hasRequiredRef(handoffPayload, "docs/database/")) {
    dependencies.push({
      dependency: "Database / schema state",
      requirement: "Provision compatible database state, migration handling, and recovery safety for the scoped slices.",
    });
  }
  if (hasRequiredRef(handoffPayload, "docs/design/")) {
    dependencies.push({
      dependency: "Frontend or admin delivery surface",
      requirement: "Expose the updated UI surface and verify that the scoped routes remain reachable after rollout.",
    });
  }

  return uniqueObjects(dependencies, (entry) => entry.dependency);
}

function buildObservabilityRequirements(handoffPayload) {
  const requirements = [
    "DEV-Run must capture deployment and post-deploy validation evidence for the scoped slices.",
  ];

  if (hasRequiredRef(handoffPayload, "docs/api/")) {
    requirements.push("API or service health plus bounded smoke results must be observable during OPS rollout.");
  }
  if (hasRequiredRef(handoffPayload, "docs/database/")) {
    requirements.push("Migration and persistence outcomes must be observable through logs, health checks, or equivalent evidence.");
  }

  return uniqueStrings(requirements);
}

function buildRollbackRecoveryExpectations(handoffPayload, decision) {
  const expectations = [
    "Rollback or recovery steps must be explicit before runtime rollout begins.",
  ];

  if (hasRequiredRef(handoffPayload, "docs/database/")) {
    expectations.push("Database-affecting slices require rollback-safe migrations or documented restore steps.");
  }
  if (decision === "finish") {
    expectations.push("Remaining hardening items carried from CODE closeout must stay explicit if rollback readiness is incomplete.");
  }

  return uniqueStrings(expectations);
}

function buildSuggestedNextOpsPath(lane, decision) {
  const suggestedChain =
    lane === "bugfix"
      ? ["ops-plan", "ops-deploy"]
      : ["ops-plan", "ops-deploy", "ops-monitor"];

  return {
    start_with: suggestedChain[0],
    suggested_chain: suggestedChain,
    close_with: "ops-verify",
    why:
      decision === "finish"
        ? "CODE closed a bounded implementation pass and DEV-Run should carry the explicit hardening or deployment follow-up into the OPS path."
        : "CODE closed the scoped implementation with the stronger closeout bundle and DEV-Run can continue with the normal OPS path.",
  };
}

function buildOptionalReferenceEntries(handoffPayload) {
  const refs = [];

  if (isNonEmptyString(handoffPayload.feature_impl_plan_path)) {
    refs.push({
      label: "Upstream feature implementation plan",
      path: handoffPayload.feature_impl_plan_path.trim(),
      kind: "artifact",
    });
  }

  if (Array.isArray(handoffPayload.optional_refs)) {
    handoffPayload.optional_refs.forEach((entry, index) => {
      if (isNonEmptyString(entry)) {
        refs.push({
          label: `Optional upstream ref ${index + 1}`,
          path: entry.trim(),
          kind: "artifact",
        });
      }
    });
  }

  return uniqueObjects(refs, (entry) => entry.path);
}

function buildOptionalOpsNotes(decision, followUps, shipNotes) {
  const notes = [];

  if (decision === "finish") {
    notes.push('CODE closeout used "finish", so remaining hardening or deployment work stays explicit for DEV-Run.');
  }

  notes.push(...normalizeOptionalNotes(shipNotes));
  notes.push(...normalizeOptionalNotes((followUps || []).map((entry) => `Follow-up: ${entry}`)));

  return uniqueStrings(notes);
}

function normalizeOptionalNotes(entries) {
  return (entries || []).map((entry) => String(entry).trim()).filter(Boolean);
}

function readJsonObject(jsonPath, label) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return payload;
}

function loadFormalCodeHandoffForOps(projectPath, featureKey, lane) {
  const handoffPath = getCodeHandoffPath(projectPath, featureKey);
  if (!fs.existsSync(handoffPath)) {
    return null;
  }

  const payload = readJsonObject(handoffPath, "CODE_HANDOFF");

  if (!ACCEPTED_HANDOFF_SCHEMA_VERSIONS.has(payload.schema_version)) {
    throw new Error(`CODE_HANDOFF schema_version must be one of: ${[...ACCEPTED_HANDOFF_SCHEMA_VERSIONS].join(", ")}.`);
  }
  if (payload.feature_key !== featureKey) {
    throw new Error(`CODE_HANDOFF feature_key must match ${featureKey}.`);
  }
  if (!HANDOFF_LANES.has(payload.recommended_lane) || payload.recommended_lane !== lane) {
    throw new Error(`CODE_HANDOFF recommended_lane must match the current lane "${lane}".`);
  }
  if (!HANDOFF_STATUSES.has(payload.handoff_status) || payload.handoff_status !== "READY_FOR_SDTK_CODE") {
    throw new Error('CODE_HANDOFF must remain "READY_FOR_SDTK_CODE" for canonical OPS emission.');
  }
  if (payload.repo_config_ref !== "sdtk-spec.config.json") {
    throw new Error('CODE_HANDOFF repo_config_ref must remain "sdtk-spec.config.json".');
  }
  if (!Array.isArray(payload.implementation_slices) || payload.implementation_slices.length === 0) {
    throw new Error("CODE_HANDOFF must keep at least one implementation_slices entry.");
  }

  return {
    handoffPath,
    payload,
  };
}

function emitOpsHandoffForCompletedCloseout({
  projectPath,
  featureKey,
  lane,
  decision,
  preflightEntries,
  shipFollowUps,
  shipNotes,
}) {
  let formalCodeHandoff;
  try {
    formalCodeHandoff = loadFormalCodeHandoffForOps(projectPath, featureKey, lane);
  } catch (error) {
    return {
      emitted: false,
      reason: `skipped because the current formal CODE_HANDOFF is invalid (${error.message})`,
    };
  }

  if (!formalCodeHandoff) {
    return {
      emitted: false,
      reason:
        "skipped because compatibility fallback workflows do not emit the canonical CODE -> OPS bridge without docs/dev/CODE_HANDOFF_[FEATURE_KEY].json",
    };
  }

  const workflowPath = getWorkflowArtifactPath(projectPath, featureKey);
  const workflowText = fs.readFileSync(workflowPath, "utf-8");
  const scopeSlices = parseWorkflowScopeSlices(workflowText, formalCodeHandoff.payload);
  const codeEvidenceRefs = buildCodeEvidenceRefs(projectPath, featureKey, workflowText);
  const opsHandoffPath = getOpsHandoffPath(projectPath, featureKey);
  const relativeWorkflowPath = normalizePathForDoc(projectPath, workflowPath);
  const relativeCodeHandoffPath = normalizePathForDoc(projectPath, formalCodeHandoff.handoffPath);
  const optionalRefs = buildOptionalReferenceEntries(formalCodeHandoff.payload);
  const notes = buildOptionalOpsNotes(decision, shipFollowUps, shipNotes);

  const payload = {
    schema_version: OPS_HANDOFF_SCHEMA_VERSION,
    feature_key: featureKey,
    feature_name: humanizeFeatureKey(featureKey),
    delivery_lane: lane,
    generated_by: "sdtk-code",
    generated_at: new Date().toISOString(),
    handoff_status: OPS_HANDOFF_READY_STATUS,
    producer_owner: "DEV-Code",
    consumer_owner: "DEV-Run",
    code_workflow_path: relativeWorkflowPath,
    code_handoff_path: relativeCodeHandoffPath,
    repo_config_ref: formalCodeHandoff.payload.repo_config_ref,
    scope_slices: scopeSlices,
    code_evidence_refs: codeEvidenceRefs,
    deployment_prerequisites: buildDeploymentPrerequisites(preflightEntries),
    environment_assumptions: buildEnvironmentAssumptions(formalCodeHandoff.payload, decision),
    infra_runtime_dependencies: buildInfraRuntimeDependencies(formalCodeHandoff.payload),
    observability_requirements: buildObservabilityRequirements(formalCodeHandoff.payload),
    rollback_recovery_expectations: buildRollbackRecoveryExpectations(
      formalCodeHandoff.payload,
      decision
    ),
    open_blockers: [],
    suggested_next_ops_path: buildSuggestedNextOpsPath(lane, decision),
  };

  if (optionalRefs.length > 0) {
    payload.optional_refs = optionalRefs;
  }
  if (notes.length > 0) {
    payload.notes = notes;
  }

  fs.writeFileSync(opsHandoffPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");

  return {
    emitted: true,
    opsHandoffPath,
    handoffStatus: OPS_HANDOFF_READY_STATUS,
    scopeSliceCount: scopeSlices.length,
    evidenceRefCount: codeEvidenceRefs.length,
  };
}

function validateRequiredRefCoverage(requiredRefs, implementationSlices, featureKey) {
  const archPath = `docs/architecture/ARCH_DESIGN_${featureKey}.md`;
  const backlogPath = `docs/product/BACKLOG_${featureKey}.md`;

  for (const mustHave of [archPath, backlogPath]) {
    if (!requiredRefs.includes(mustHave)) {
      throw new Error(`required_refs must include: ${mustHave}`);
    }
  }

  const sliceText = implementationSlices.map((entry) => String(entry).toLowerCase()).join(" || ");
  if (!sliceText) {
    return;
  }

  if (/\b(api|endpoint|contract|service|backend)\b/.test(sliceText)) {
    if (!requiredRefs.some((entry) => entry.startsWith("docs/api/"))) {
      throw new Error(
        "implementation_slices reference API or backend scope, so required_refs must include at least one docs/api/* source."
      );
    }
  }

  if (/\b(database|migration|schema|table|sql|db)\b/.test(sliceText)) {
    if (!requiredRefs.some((entry) => entry.startsWith("docs/database/"))) {
      throw new Error(
        "implementation_slices reference database scope, so required_refs must include at least one docs/database/* source."
      );
    }
  }

  if (/\b(ui|screen|frontend|page|form|layout)\b/.test(sliceText)) {
    if (!requiredRefs.some((entry) => entry.startsWith("docs/design/"))) {
      throw new Error(
        "implementation_slices reference UI scope, so required_refs must include at least one docs/design/* source."
      );
    }
  }

  if (/\b(flow|interaction)\b/.test(sliceText)) {
    if (!requiredRefs.some((entry) => entry.startsWith("docs/specs/") && entry.endsWith("_FLOW_ACTION_SPEC.md"))) {
      throw new Error(
        "implementation_slices reference flow scope, so required_refs must include docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md."
      );
    }
  }
}

function buildInputEntries(projectPath, payload, featureKey, handoffPath) {
  const requiredInputs = [
    {
      key: "CODE_HANDOFF",
      path: handoffPath,
      exists: true,
    },
  ];
  const optionalInputs = [];

  if (isNonEmptyString(payload.feature_impl_plan_path)) {
    requiredInputs.push(buildPathEntry("FEATURE_IMPL_PLAN", projectPath, payload.feature_impl_plan_path.trim()));
  }

  if (isNonEmptyString(payload.repo_config_ref)) {
    requiredInputs.push(buildPathEntry("SDTK_CONFIG", projectPath, payload.repo_config_ref.trim()));
  }

  if (Array.isArray(payload.required_refs)) {
    payload.required_refs.forEach((entry, index) => {
      if (isNonEmptyString(entry)) {
        requiredInputs.push(buildPathEntry(`REQUIRED_REF_${index + 1}`, projectPath, entry.trim()));
      }
    });
  }

  if (Array.isArray(payload.optional_refs)) {
    payload.optional_refs.forEach((entry, index) => {
      if (isNonEmptyString(entry)) {
        optionalInputs.push(buildPathEntry(`OPTIONAL_REF_${index + 1}`, projectPath, entry.trim()));
      }
    });
  }

  return {
    requiredInputs: uniquePathEntries(requiredInputs),
    optionalInputs: uniquePathEntries(optionalInputs),
  };
}

function resolveFormalHandoffIntake(projectPath, featureKey, lane) {
  const handoffPath = path.join(projectPath, "docs", "dev", `CODE_HANDOFF_${featureKey}.json`);
  if (!fs.existsSync(handoffPath)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(handoffPath, "utf-8"));
  } catch (error) {
    return createBlockedFormalIntake({
      projectPath,
      featureKey,
      lane,
      handoffStatus: "INVALID_JSON",
      requiredInputs: [
        {
          key: "CODE_HANDOFF",
          path: handoffPath,
          exists: true,
        },
      ],
      optionalInputs: [],
      blockingState: "invalid_handoff_contract",
      blockingMessage: `SDTK-CODE handoff contract is invalid: failed to parse JSON (${error.message}).`,
    });
  }

  let compatibilityWarnings = collectSoftWarnings(payload);
  const { requiredInputs, optionalInputs } = buildInputEntries(projectPath, payload, featureKey, handoffPath);

  try {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Formal handoff root value must be a JSON object.");
    }

    if (!ACCEPTED_HANDOFF_SCHEMA_VERSIONS.has(payload.schema_version)) {
      throw new Error(`schema_version must be one of: ${[...ACCEPTED_HANDOFF_SCHEMA_VERSIONS].join(", ")}.`);
    }

    const schemaVersion = payload.schema_version;

    if (!isNonEmptyString(payload.feature_key)) {
      throw new Error("feature_key must be a non-empty string.");
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(payload.feature_key.trim())) {
      throw new Error("feature_key must use UPPER_SNAKE_CASE.");
    }
    if (payload.feature_key.trim() !== featureKey) {
      throw new Error(`feature_key must match CLI --feature-key: ${featureKey}`);
    }

    if (!HANDOFF_STATUSES.has(payload.handoff_status)) {
      throw new Error('handoff_status must be "READY_FOR_SDTK_CODE" or "BLOCKED_FOR_SDTK_CODE".');
    }

    if (!HANDOFF_LANES.has(payload.recommended_lane)) {
      throw new Error('recommended_lane must be "feature" or "bugfix".');
    }
    if (payload.recommended_lane !== lane) {
      throw new Error(`recommended_lane must match CLI --lane: ${lane}`);
    }

    const featureImplPlanPath = normalizeRelativePath(
      payload.feature_impl_plan_path,
      "feature_impl_plan_path"
    );
    const expectedPlanPath = `docs/dev/FEATURE_IMPL_PLAN_${featureKey}.md`;
    if (featureImplPlanPath !== expectedPlanPath) {
      throw new Error(`feature_impl_plan_path must match the current feature key: ${expectedPlanPath}`);
    }

    const repoConfigRef = normalizeRelativePath(payload.repo_config_ref, "repo_config_ref");
    if (repoConfigRef !== "sdtk-spec.config.json") {
      throw new Error('repo_config_ref must be exactly "sdtk-spec.config.json".');
    }

    const requiredRefs = requireArray(payload, "required_refs").map((entry, index) =>
      normalizeRelativePath(entry, `required_refs[${index}]`)
    );
    const optionalRefs = requireArray(payload, "optional_refs").map((entry, index) =>
      normalizeRelativePath(entry, `optional_refs[${index}]`)
    );
    const openBlockers = normalizeStringArray(requireArray(payload, "open_blockers"), "open_blockers");
    const implementationSlices = normalizeStringArray(
      requireArray(payload, "implementation_slices"),
      "implementation_slices"
    );
    const testObligations = normalizeStringArray(requireArray(payload, "test_obligations"), "test_obligations");
    const impactMap = schemaVersion === "0.2" ? normalizeImpactMap(payload.impact_map) : null;
    const recoveryNotes = schemaVersion === "0.2" ? normalizeOptionalStringArray(payload.recovery_notes, "recovery_notes") : [];

    if (schemaVersion === "0.2" && !impactMap) {
      compatibilityWarnings = [
        ...compatibilityWarnings,
        'Formal handoff compatibility warning: schema_version "0.2" is present without impact_map; richer impact seeding is unavailable.',
      ];
    }

    validateRequiredRefCoverage(requiredRefs, implementationSlices, featureKey);

    const missingInputs = requiredInputs.filter((entry) => !entry.exists);
    const missingOptional = optionalInputs.filter((entry) => !entry.exists);
    if (missingInputs.length > 0) {
      const missingList = missingInputs
        .map((entry) => normalizePathForDoc(projectPath, entry.path))
        .join(", ");
      throw new Error(`formal handoff references missing required paths: ${missingList}`);
    }
    if (missingOptional.length > 0) {
      const missingList = missingOptional
        .map((entry) => normalizePathForDoc(projectPath, entry.path))
        .join(", ");
      throw new Error(`formal handoff references missing optional paths: ${missingList}`);
    }

    if (payload.handoff_status === "READY_FOR_SDTK_CODE") {
      if (openBlockers.length > 0) {
        throw new Error("READY_FOR_SDTK_CODE requires empty open_blockers.");
      }
      if (implementationSlices.length === 0) {
        throw new Error("READY_FOR_SDTK_CODE requires at least one implementation_slices entry.");
      }
      if (testObligations.length === 0) {
        throw new Error("READY_FOR_SDTK_CODE requires at least one test_obligations entry.");
      }
    } else if (openBlockers.length === 0) {
      throw new Error("BLOCKED_FOR_SDTK_CODE requires at least one open_blockers entry.");
    }

    if (payload.handoff_status === "BLOCKED_FOR_SDTK_CODE") {
      return createBlockedFormalIntake({
        projectPath,
        featureKey,
        lane,
        handoffStatus: payload.handoff_status,
        requiredInputs,
        optionalInputs,
        blockingState: "blocked_upstream_handoff",
        blockingMessage: "SDTK-CODE handoff is blocked by upstream /dev blockers:",
        blockingDetails: openBlockers,
        compatibilityWarnings,
      });
    }

    const candidatePlanningSeed = buildCandidatePlanningSeed(lane, implementationSlices, testObligations, {
      schemaVersion,
      impactMap,
      recoveryNotes,
    });

    return createIntakeResult({
      projectPath,
      featureKey,
      lane,
      requiredInputs,
      optionalInputs,
      missingInputs: [],
      blocked: false,
      intakeOutcome: lane === "feature" ? "READY_FOR_PLAN" : "READY_FOR_BUILD_BUGFIX",
      nextPhase: lane === "feature" ? "plan" : "build",
      phaseStatus: "completed",
      blockingState: "clear",
      intakeSource: "formal_handoff",
      handoffStatus: payload.handoff_status,
      compatibilityWarnings,
      ...candidatePlanningSeed,
    });
  } catch (error) {
    return createBlockedFormalIntake({
      projectPath,
      featureKey,
      lane,
      handoffStatus: payload && payload.handoff_status ? String(payload.handoff_status) : "INVALID_CONTRACT",
      requiredInputs,
      optionalInputs,
      blockingState: "invalid_handoff_contract",
      blockingMessage: `SDTK-CODE handoff contract is invalid: ${error.message}`,
      compatibilityWarnings,
    });
  }
}

module.exports = {
  emitOpsHandoffForCompletedCloseout,
  getOpsHandoffPath,
  resolveFormalHandoffIntake,
};
