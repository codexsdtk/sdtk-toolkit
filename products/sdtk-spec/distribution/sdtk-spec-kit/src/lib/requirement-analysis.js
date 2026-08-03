"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ensureGeneratedScaffold } = require("../commands/generate");
const { parseFlags, requireFlag, validatePattern } = require("./args");
const { ValidationError } = require("./errors");

const FEATURE_KEY_REGEX = /^[A-Z][A-Z0-9_]*$/;

const FLAG_DEFS = {
  source: { type: "string" },
  // Primary, scope-neutral flags (+ backward-compatible feature-* aliases).
  key: { type: "string" },
  name: { type: "string" },
  "feature-key": { type: "string" },
  "feature-name": { type: "string" },
  "project-path": { type: "string" },
  force: { type: "boolean" },
  json: { type: "boolean" },
  verbose: { type: "boolean" },
};

const ANALYSIS_STATUS = "SOURCE_INTAKE_READY_FOR_AGENT_ANALYSIS";
const DESIGN_HANDOFF_ARTIFACTS = [
  "docs/design/SCREEN_INVENTORY_<KEY>.md",
  "docs/design/SCREEN_INVENTORY_<KEY>.json",
  "docs/design/USER_FLOWS_<KEY>.md",
  "docs/design/USER_FLOWS_<KEY>.json",
  "docs/specs/DOMAIN_MODEL_<KEY>.md",
  "docs/specs/DOMAIN_MODEL_<KEY>.json",
  "docs/design/SPEC_TO_DESIGN_HANDOFF_<KEY>.json",
];

const MOJIBAKE_MARKERS = [
  "ﾃ",
  "ﾄ",
  "ﾆ",
  "蘯",
  "盻",
  "黛",
  "笏",
  "竊",
  "冢",
  "\uFFFD",
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFileSafe(filePath, content, force) {
  if (fs.existsSync(filePath) && !force) {
    throw new ValidationError(
      `Refusing to overwrite existing file: ${filePath}. Re-run with --force if replacement is intended.`
    );
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function copyFileSafe(sourcePath, targetPath, force) {
  if (fs.existsSync(targetPath) && !force) {
    throw new ValidationError(
      `Refusing to overwrite existing source copy: ${targetPath}. Re-run with --force if replacement is intended.`
    );
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function countMarker(text, marker) {
  let count = 0;
  let idx = text.indexOf(marker);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(marker, idx + marker.length);
  }
  return count;
}

function detectEncodingDiagnostics(text) {
  const markerCounts = {};
  let totalMarkers = 0;
  for (const marker of MOJIBAKE_MARKERS) {
    const count = countMarker(text, marker);
    if (count > 0) {
      markerCounts[marker] = count;
      totalMarkers += count;
    }
  }
  return {
    readEncoding: "utf8",
    likelyMojibake: totalMarkers >= 10,
    mojibakeMarkerCount: totalMarkers,
    mojibakeMarkers: markerCounts,
    recommendation:
      totalMarkers >= 10
        ? "Source text contains many mojibake markers. Preserve raw source, keep line traceability, and request a clean UTF-8 export when exact wording matters."
        : "No high-volume mojibake marker pattern detected by the deterministic scanner.",
  };
}

function buildRequirementIntakeMarkdown(featureKey, featureName, sourceInfo, diagnostics, scaffold) {
  const lines = [
    `# Requirement Intake ${featureKey}`,
    "",
    "## Intake Status",
    "",
    `- Analysis status: ${ANALYSIS_STATUS}`,
    `- Scaffold status: ${scaffold.status}`,
    "- Runtime boundary: source intake only; semantic PM/BA/ARCH analysis is performed by agents in the scaffold artifacts.",
    "",
    "## Source",
    "",
    `- Feature: ${featureName}`,
    `- Source path: ${sourceInfo.sourcePath}`,
    `- Preserved copy: ${sourceInfo.preservedCopyRelativePath}`,
    `- SHA-256: ${sourceInfo.sha256}`,
    `- Preserved copy SHA-256: ${sourceInfo.preservedCopySha256}`,
    `- Size bytes: ${sourceInfo.sizeBytes}`,
    `- Line count: ${sourceInfo.lineCount}`,
    "",
    "## Encoding Diagnostics",
    "",
    `- Read encoding: ${diagnostics.readEncoding}`,
    `- Likely mojibake: ${diagnostics.likelyMojibake}`,
    `- Mojibake marker count: ${diagnostics.mojibakeMarkerCount}`,
    `- Recommendation: ${diagnostics.recommendation}`,
    "",
    "## Generated Scaffold",
    "",
    "- `sdtk-spec generate` remains the 17-file scaffold source of truth.",
    "- The generated files are structural scaffolds with placeholders until PM/BA/ARCH/DEV/QA agents fill them.",
    `- Missing scaffold files before analyze: ${scaffold.missingBefore.length}`,
    `- Missing scaffold files after analyze: ${scaffold.missingAfter.length}`,
    "",
    "## Next Action",
    "",
    `- Use task packet: .sdtk/spec/tasks/${featureKey}/README.md`,
    "- Run the SDTK-SPEC PM/BA/ARCH/DEV/QA workflow against the preserved source and generated scaffold.",
    "- Cite source lines or source sections where possible.",
    "- Mark missing or low-confidence details as open questions instead of inventing screens, fields, APIs, data models, or visual constraints.",
    "",
    "## Open Questions",
    "",
    "- OQ-INTAKE-01: PM/BA must confirm product scope from the preserved source.",
    "- OQ-INTAKE-02: BA/ARCH must extract screens, flows, domain model, APIs, data model, design constraints, and non-goals from source evidence.",
    "- OQ-INTAKE-03: Any unclear source language or encoding risk must be resolved before downstream implementation handoff.",
    "",
  ];
  return lines.join("\n");
}

function taskHeader(featureKey, featureName, sourceInfo) {
  return [
    `Feature key: ${featureKey}`,
    `Feature name: ${featureName}`,
    `Preserved source: ${sourceInfo.preservedCopyRelativePath}`,
    `Source SHA-256: ${sourceInfo.sha256}`,
    "Inputs allowed: requirements/**. Forbidden: docs/ui/**",
  ].join("\n");
}

function artifactListForFeature(featureKey) {
  return DESIGN_HANDOFF_ARTIFACTS.map((item) => item.replace("<KEY>", featureKey));
}

function buildInputBoundarySection() {
  return [
    "## Input Boundary",
    "",
    "Inputs allowed: requirements/**. Forbidden: docs/ui/**",
    "",
    "- Allowed before handoff completion: requirement source files, the preserved `.sdtk/spec/requirements/sources/**` copy, and generated SPEC scaffold artifacts under `docs/**`.",
    "- Forbidden before handoff completion: `docs/ui/**`, reference sample HTML/PNG exports, copied sample layouts, and visual benchmark outputs.",
    "- `docs/ui/**` is evaluation-only after SDTK output generation/handoff; it must not be used as a generation input.",
    "- If worker history shows reads under `docs/ui/**` before `SPEC_TO_DESIGN_HANDOFF` is complete, the lane validator must report `PROVENANCE_VIOLATION`.",
    "",
  ];
}

function buildRequiredDesignHandoffSection(featureKey) {
  return [
    "## Required Design Handoff Artifacts",
    "",
    ...artifactListForFeature(featureKey).map((item) => `- \`${item}\``),
    "",
  ];
}

function buildProvenanceContractSection(featureKey) {
  return [
    "## SPEC To DESIGN Provenance Contract",
    "",
    `Every screen in \`docs/design/SPEC_TO_DESIGN_HANDOFF_${featureKey}.json\` must include:`,
    "",
    "- `id`",
    "- `title`",
    "- `source_quote`: at least 30 Unicode code points copied literally from the requirement source",
    "- `source_line_range`: `[start_line, end_line]` using 1-based source line numbers",
    "",
    "Deterministic verifier requirements:",
    "",
    "- `source_quote` must exist literally in the requirement source after UTF-8 BOM stripping and CRLF-to-LF newline normalization.",
    "- `source_line_range` must be inside the source file bounds and must contain the quoted text.",
    "- Screen `id` and `title` must not match an explicit post-generation sample filename/name list supplied to the verifier.",
    "- Missing screens, malformed JSON, missing fields, invalid ranges, or copied sample-derived names must fail as `PROVENANCE_VIOLATION`.",
    "- Runtime must not infer screens, fields, routes, palette, or ecommerce semantics from the raw requirement text.",
    "",
  ];
}

function buildTaskPacketFiles(featureKey, featureName, sourceInfo) {
  const header = taskHeader(featureKey, featureName, sourceInfo);
  return {
    "README.md": [
      `# Agent Task Packet ${featureKey}`,
      "",
      header,
      "",
      "## Purpose",
      "",
      "This packet routes source analysis to the SDTK-SPEC agent pipeline. Runtime `analyze` preserved the source and bootstrapped the standard 17-file scaffold; agents now perform the actual PM/BA/ARCH/DEV/QA analysis.",
      "",
      ...buildInputBoundarySection(),
      ...buildRequiredDesignHandoffSection(featureKey),
      ...buildProvenanceContractSection(featureKey),
      "## Required Agent Sequence",
      "",
      "1. PM/BA: read the preserved source and `docs/discovery/REQUIREMENT_<KEY>.md`.",
      "2. PM/BA: fill project initiation, BA spec, PRD, backlog, and open questions using source evidence.",
      "3. ARCH: extract screens, flows, domain model, APIs, data model, design constraints, and non-goals from source evidence.",
      "4. DEV/QA: prepare implementation and test handoffs only after PM/BA/ARCH artifacts are evidence-backed.",
      "5. All roles: update `SHARED_PLANNING.md` and `QUALITY_CHECKLIST.md` before handoff.",
      "",
      "## Guardrails",
      "",
      "- Do not invent screens, fields, APIs, data models, visual constraints, or acceptance criteria without source evidence or user confirmation.",
      "- Do not read `docs/ui/**` or sample layout exports before `SPEC_TO_DESIGN_HANDOFF` is complete.",
      "- Cite source lines or sections where possible.",
      "- Mark low-confidence or missing details as open questions.",
      "",
    ].join("\n"),
    "01_REQUIREMENT_TO_PM_BA.md": [
      `# 01 Requirement To PM/BA ${featureKey}`,
      "",
      header,
      "",
      ...buildInputBoundarySection(),
      "## PM Tasks",
      "",
      "- Read the preserved source and intake requirement artifact.",
      "- Fill `docs/product/PROJECT_INITIATION_<KEY>.md`.",
      "- Fill `docs/product/PRD_<KEY>.md` and `docs/product/BACKLOG_<KEY>.md` only with source-backed requirements or explicit decisions.",
      "- Record unresolved items as `OQ-*` open questions.",
      "",
      "## BA Tasks",
      "",
      "- Fill `docs/specs/BA_SPEC_<KEY>.md` with business rules, use cases, acceptance criteria, non-functional requirements, and traceability.",
      "- Preserve original VI/JP source excerpts in an appendix when needed and add literal English translation for traceability.",
      "- Update `SHARED_PLANNING.md` and `QUALITY_CHECKLIST.md` before ARCH handoff.",
      "",
    ].join("\n"),
    "02_BA_TO_ARCH_SCREEN_FLOW_DOMAIN.md": [
      `# 02 BA To ARCH Screen Flow Domain ${featureKey}`,
      "",
      header,
      "",
      ...buildInputBoundarySection(),
      ...buildRequiredDesignHandoffSection(featureKey),
      ...buildProvenanceContractSection(featureKey),
      "## ARCH Tasks",
      "",
      "- Extract screens, user flows, domain entities, data model, APIs, and design constraints from the preserved source and BA artifact.",
      "- Fill `docs/specs/<KEY>_FLOW_ACTION_SPEC.md`.",
      "- Fill `docs/architecture/ARCH_DESIGN_<KEY>.md`.",
      "- Fill `docs/database/DATABASE_SPEC_<KEY>.md`.",
      "- Fill `docs/api/<Pascal>_API.yaml`, `docs/api/<KEY>_ENDPOINTS.md`, `docs/api/<KEY>_API_DESIGN_DETAIL.md`, and `docs/api/<snake>_api_flow_list.txt` when API scope is source-backed.",
      "- Fill `docs/design/DESIGN_LAYOUT_<KEY>.md` only with source-backed layout constraints or explicit decisions.",
      "- Fill `docs/design/SPEC_TO_DESIGN_HANDOFF_<KEY>.json` only from explicit source evidence and include `source_quote` plus `source_line_range` for every screen.",
      "",
      "## Evidence Rule",
      "",
      "- Every screen, flow, entity, field, API, and design constraint must cite source evidence or be marked as an open question.",
      "",
    ].join("\n"),
    "03_ARCH_TO_DEV_QA_HANDOFF.md": [
      `# 03 ARCH To DEV/QA Handoff ${featureKey}`,
      "",
      header,
      "",
      ...buildInputBoundarySection(),
      "## DEV Planning Tasks",
      "",
      "- Fill `docs/dev/FEATURE_IMPL_PLAN_<KEY>.md` after PM/BA/ARCH artifacts are reviewed.",
      "- Keep `/dev` output bounded to planning and CODE handoff readiness.",
      "- Do not start SDTK-CODE implementation until source-backed scope and blockers are clear.",
      "",
      "## QA Tasks",
      "",
      "- Fill `docs/qa/<KEY>_TEST_CASE.md` and `docs/qa/QA_RELEASE_REPORT_<KEY>.md` from source-backed acceptance criteria and downstream implementation evidence.",
      "- Confirm `SHARED_PLANNING.md` and `QUALITY_CHECKLIST.md` are updated before release decision.",
      "",
      "## Handoff Rule",
      "",
      "- Missing source evidence remains a blocker or open question; do not convert uncertainty into implementation scope.",
      "",
    ].join("\n"),
  };
}

function writeTaskPacket(projectPath, featureKey, featureName, sourceInfo, force) {
  const taskRootRel = path.join(".sdtk", "spec", "tasks", featureKey);
  const taskRoot = path.join(projectPath, taskRootRel);
  const files = buildTaskPacketFiles(featureKey, featureName, sourceInfo);
  const written = {};
  for (const [fileName, content] of Object.entries(files)) {
    const rel = path.join(taskRootRel, fileName).replace(/\\/g, "/");
    writeFileSafe(path.join(taskRoot, fileName), `${content}\n`, force);
    written[fileName] = rel;
  }
  return {
    root: taskRootRel.replace(/\\/g, "/"),
    files: written,
  };
}

function buildState(featureKey, featureName, sourceInfo, diagnostics, scaffold, artifacts, taskPacket) {
  return {
    schemaVersion: "sdtk.spec.requirementIntake.v1",
    featureKey,
    featureName,
    generatedAt: new Date().toISOString(),
    source: sourceInfo,
    encodingDiagnostics: diagnostics,
    scaffoldStatus: scaffold.status,
    scaffold: {
      expectedFileCount: scaffold.expectedFiles.length,
      expectedFiles: scaffold.expectedFiles.map((item) => item.replace(/\\/g, "/")),
      missingBefore: scaffold.missingBefore,
      missingAfter: scaffold.missingAfter,
    },
    analysisStatus: ANALYSIS_STATUS,
    artifacts,
    taskPacket,
    designHandoffContract: {
      requiredArtifacts: artifactListForFeature(featureKey).map((item) => item.replace(/\\/g, "/")),
      requiredScreenFields: ["id", "title", "source_quote", "source_line_range"],
      sourceQuoteMinimumCodePoints: 30,
      forbiddenInputPattern: "docs/ui/**",
      violationCode: "PROVENANCE_VIOLATION",
    },
    nextRecommendedAction:
      `Open ${taskPacket.files["README.md"]} and run the PM/BA/ARCH/DEV/QA agent workflow against the preserved source.`,
  };
}

async function runRequirementAnalyze(args) {
  const { flags } = parseFlags(args, FLAG_DEFS);

  const sourcePath = path.resolve(requireFlag(flags, "source", "source"));
  // Accept --key/--name or the backward-compatible --feature-key/--feature-name.
  const featureKey = flags.key || flags["feature-key"];
  const featureName = flags.name || flags["feature-name"];
  if (!featureKey) {
    throw new ValidationError("Missing required flag: --key (alias: --feature-key)");
  }
  if (!featureName) {
    throw new ValidationError("Missing required flag: --name (alias: --feature-name)");
  }
  validatePattern(
    featureKey,
    FEATURE_KEY_REGEX,
    "key",
    "Must be UPPER_SNAKE_CASE (e.g., SHOPEASE, ORDER_TRACKING)."
  );

  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new ValidationError(`Requirement source file does not exist: ${sourcePath}`);
  }

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  ensureDir(projectPath);

  const scaffold = await ensureGeneratedScaffold({
    featureKey,
    featureName,
    projectPath,
    force: Boolean(flags.force),
    verbose: Boolean(flags.verbose),
  });

  const sourceBuffer = fs.readFileSync(sourcePath);
  const sourceText = normalizeNewlines(sourceBuffer.toString("utf8"));
  const lines = sourceText.split("\n");
  const diagnostics = detectEncodingDiagnostics(sourceText);
  const sourceHash = sha256(sourceBuffer);
  const sourceCopyRel = path.join(
    ".sdtk",
    "spec",
    "requirements",
    "sources",
    featureKey,
    path.basename(sourcePath)
  );
  const sourceCopyPath = path.join(projectPath, sourceCopyRel);

  copyFileSafe(sourcePath, sourceCopyPath, flags.force);

  const sourceInfo = {
    sourcePath,
    preservedCopyRelativePath: sourceCopyRel.replace(/\\/g, "/"),
    preservedCopySha256: sha256(fs.readFileSync(sourceCopyPath)),
    sha256: sourceHash,
    sizeBytes: sourceBuffer.length,
    lineCount: lines.length,
  };

  const requirementRel = path.join("docs", "discovery", `REQUIREMENT_${featureKey}.md`);
  const stateRel = path.join(".sdtk", "spec", "requirements", `ANALYSIS_STATE_${featureKey}.json`);
  const requirementPath = path.join(projectPath, requirementRel);
  const statePath = path.join(projectPath, stateRel);

  const taskPacket = writeTaskPacket(projectPath, featureKey, featureName, sourceInfo, flags.force);
  const artifacts = {
    requirement: requirementRel.replace(/\\/g, "/"),
    state: stateRel.replace(/\\/g, "/"),
    sourceCopy: sourceCopyRel.replace(/\\/g, "/"),
  };
  const state = buildState(featureKey, featureName, sourceInfo, diagnostics, scaffold, artifacts, taskPacket);

  writeFileSafe(
    requirementPath,
    buildRequirementIntakeMarkdown(featureKey, featureName, sourceInfo, diagnostics, scaffold),
    flags.force
  );
  writeFileSafe(statePath, `${JSON.stringify(state, null, 2)}\n`, flags.force);

  const result = {
    analyze: {
      featureKey,
      featureName,
      projectPath,
      sourcePath,
      artifacts,
      taskPacket,
      scaffoldStatus: scaffold.status,
      analysisStatus: ANALYSIS_STATUS,
      encodingDiagnostics: diagnostics,
    },
  };

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("[analyze] Requirement source intake complete.");
    console.log(`  Requirement: ${result.analyze.artifacts.requirement}`);
    console.log(`  State:       ${result.analyze.artifacts.state}`);
    console.log(`  Source copy: ${result.analyze.artifacts.sourceCopy}`);
    console.log(`  Task packet: ${result.analyze.taskPacket.root}`);
    console.log(`  Scaffold:    ${result.analyze.scaffoldStatus}`);
    console.log(`  Analysis:    ${result.analyze.analysisStatus}`);
    console.log(`  Mojibake:    ${diagnostics.likelyMojibake} (${diagnostics.mojibakeMarkerCount} markers)`);
  }

  return 0;
}

module.exports = {
  runRequirementAnalyze,
  detectEncodingDiagnostics,
};
