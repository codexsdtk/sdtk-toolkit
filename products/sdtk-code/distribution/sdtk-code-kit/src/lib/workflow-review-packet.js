"use strict";

const fs = require("fs");
const path = require("path");
const { extractManagedBlock } = require("./workflow-artifact");

const PLACEHOLDER_BULLETS = new Set([
  "Pending confirmation during workflow planning.",
  "Pending lane-specific planning or build guidance.",
  "Lightweight bugfix planning not recorded yet.",
  "No active build slices recorded yet.",
  "Pending build-phase execution.",
]);
const STALE_HANDOFF_OUT_OF_SCOPE_PATTERNS = [
  /FEATURE_IMPL_PLAN \+ CODE_HANDOFF/i,
  /no change to the `\/dev` boundary/i,
];

function getReviewPacketPath(projectPath, featureKey) {
  return path.join(projectPath, "docs", "dev", `REVIEW_PACKET_${featureKey}.md`);
}

function normalizeEntries(entries) {
  return (entries || []).map((entry) => String(entry).trim()).filter(Boolean);
}

function uniqueStrings(entries) {
  return [...new Set(normalizeEntries(entries))];
}

function humanizeFeatureKey(featureKey) {
  return String(featureKey)
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(" ");
}

function normalizePathForDoc(projectPath, targetPath) {
  return path.relative(projectPath, targetPath).split(path.sep).join("/");
}

function parseBulletSection(text, heading) {
  if (!text) {
    return [];
  }

  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`### ${escaped}\\r?\\n([\\s\\S]*?)(?=\\r?\\n(?:### |## |---)|$)`));
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

function parseManagedField(blockText, label) {
  if (!blockText) {
    return null;
  }

  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = blockText.match(new RegExp(`- ${escaped}: \`([^\\r\\n\`]+)\``));
  return match ? match[1] : null;
}

function parseInlineSliceSection(planBlock) {
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

function cleanBulletEntries(entries) {
  return uniqueStrings(entries).filter((entry) => !PLACEHOLDER_BULLETS.has(entry));
}

function filterStaleHandoffOutOfScopeEntries(entries) {
  return cleanBulletEntries(entries).filter(
    (entry) => !STALE_HANDOFF_OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(entry))
  );
}

function loadScopeContext(workflowText) {
  const planBlock = extractManagedBlock(workflowText, "PLAN");
  const inScope = cleanBulletEntries(parseBulletSection(planBlock, "In Scope"));
  const outScope = filterStaleHandoffOutOfScopeEntries(parseBulletSection(planBlock, "Out Of Scope"));
  let sliceTitles = cleanBulletEntries(parseBulletSection(planBlock, "Finalized Slices After `plan`"));
  if (sliceTitles.length === 0) {
    sliceTitles = cleanBulletEntries(parseInlineSliceSection(planBlock));
  }

  return {
    inScope:
      inScope.length > 0
        ? inScope
        : sliceTitles.map((entry) => `Approved execution slice: ${entry}`),
    outScope,
    sliceTitles,
  };
}

function loadWorkflowStageSnapshot(workflowText) {
  const metadataBlock = extractManagedBlock(workflowText, "METADATA");
  const statusBlock = extractManagedBlock(workflowText, "STATUS");

  return {
    currentPhase: parseManagedField(metadataBlock, "Current phase") || "unknown",
    phaseStatus: parseManagedField(metadataBlock, "Phase status") || "unknown",
    intakeOutcome: parseManagedField(metadataBlock, "Intake outcome") || "unknown",
    nextPhase: parseManagedField(statusBlock, "Next recommended phase") || "unknown",
    blockingState: parseManagedField(statusBlock, "Blocking state") || "unknown",
  };
}

function loadFeatureImplPlanContext(projectPath, featureKey) {
  const featureImplPlanPath = path.join(projectPath, "docs", "dev", `FEATURE_IMPL_PLAN_${featureKey}.md`);
  if (!fs.existsSync(featureImplPlanPath)) {
    return {
      featureImplPlanPath,
      nonGoals: [],
    };
  }

  const text = fs.readFileSync(featureImplPlanPath, "utf-8");
  return {
    featureImplPlanPath,
    nonGoals: filterStaleHandoffOutOfScopeEntries(
      parseBulletSection(text, "2.5 Explicit Non-Goals For This Handoff")
    ),
  };
}

function loadCodeHandoffContext(projectPath, featureKey) {
  const handoffPath = path.join(projectPath, "docs", "dev", `CODE_HANDOFF_${featureKey}.json`);
  if (!fs.existsSync(handoffPath)) {
    return {
      handoffPath,
      payload: null,
      error: null,
    };
  }

  try {
    return {
      handoffPath,
      payload: JSON.parse(fs.readFileSync(handoffPath, "utf-8")),
      error: null,
    };
  } catch (error) {
    return {
      handoffPath,
      payload: null,
      error: error.message,
    };
  }
}

function renderBulletList(entries, emptyText, formatter = null) {
  if (!entries || entries.length === 0) {
    return `- ${emptyText}`;
  }

  return entries
    .map((entry) => {
      const value = formatter ? formatter(entry) : entry;
      return `- ${value}`;
    })
    .join("\n");
}

function renderTable(headers, rows, emptyText) {
  if (!rows || rows.length === 0) {
    return `- ${emptyText}`;
  }

  const headerRow = `| ${headers.join(" | ")} |`;
  const separatorRow = `| ${headers.map((_, index) => (index === 0 ? "---:" : "---")).join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerRow, separatorRow, bodyRows].join("\n");
}

function buildUpstreamContractRefs(projectPath, featureImplPlanPath, codeHandoffContext) {
  const refs = [normalizePathForDoc(projectPath, featureImplPlanPath)];

  if (codeHandoffContext && codeHandoffContext.payload && !codeHandoffContext.error) {
    refs.push(normalizePathForDoc(projectPath, codeHandoffContext.handoffPath));
    if (Array.isArray(codeHandoffContext.payload.required_refs)) {
      refs.push(...codeHandoffContext.payload.required_refs);
    }
  } else if (codeHandoffContext && codeHandoffContext.error) {
    refs.push(
      `${normalizePathForDoc(projectPath, codeHandoffContext.handoffPath)} (invalid JSON: ${codeHandoffContext.error})`
    );
  }

  return uniqueStrings(refs);
}

function buildLinkedContractRefs(codeHandoffContext) {
  if (!codeHandoffContext || !codeHandoffContext.payload || codeHandoffContext.error) {
    return [];
  }

  return uniqueStrings(
    (codeHandoffContext.payload.required_refs || []).filter((entry) =>
      /docs\/(product|specs|architecture)\//.test(String(entry))
    )
  );
}

function parseProvenanceContext(workflowText) {
  const match = String(workflowText || "").match(/## Provenance\r?\n([\s\S]*?)(?=\r?\n##\s|$)/);
  if (!match) {
    return {
      sectionPresent: false,
      mode: "missing",
      sourceRefs: [],
      body: "",
    };
  }

  const body = String(match[1] || "").trim();
  const sourceRefMatches = [...body.matchAll(/\|\s*\d+\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/g)];
  const sourceRefs = sourceRefMatches
    .map((item) => ({
      source: item[1].trim(),
      location: item[2].trim(),
      consultedDate: item[3].trim(),
      purpose: item[4].trim(),
    }))
    .filter(
      (entry) =>
        ![entry.source, entry.location, entry.consultedDate, entry.purpose].some((value) =>
          /^<.+>$/.test(String(value))
        )
    );

  const hasNoReferenceDeclaration = /no external source references were consulted for this batch\./i.test(body);
  const hasExternalRefs = sourceRefs.length > 0;

  return {
    sectionPresent: true,
    mode: hasExternalRefs ? "external" : hasNoReferenceDeclaration ? "no_reference" : "missing",
    sourceRefs,
    body,
  };
}

function buildReferenceDisclosure(provenanceContext) {
  if (!provenanceContext.sectionPresent) {
    return {
      mode: "missing",
      lines: [
        "- Warning: workflow plan is missing the required `## Provenance` section.",
        "- Expected no-reference declaration: `No external source references were consulted for this batch.`",
      ],
    };
  }

  if (provenanceContext.mode === "external") {
    return {
      mode: "external",
      lines: [
        "- External references were consulted for this batch.",
        "- Source references:",
        ...provenanceContext.sourceRefs.map(
          (entry, index) =>
            `  - ${index + 1}. ${entry.source} | ${entry.location} | ${entry.consultedDate} | ${entry.purpose}`
        ),
      ],
    };
  }

  if (provenanceContext.mode === "no_reference") {
    return {
      mode: "no_reference",
      lines: ["- No external references were consulted for this batch."],
    };
  }

  return {
    mode: "missing",
    lines: [
      "- Warning: unable to classify provenance mode from the workflow plan.",
      "- Provide either a complete provenance log or the no-reference declaration.",
    ],
  };
}
function buildChangedFileRows(changedFiles) {
  return changedFiles.map((entry, index) => [
    String(index + 1),
    `\`${entry.path}\``,
    entry.rationale,
  ]);
}

function buildVerificationRows(evidenceEntries) {
  return evidenceEntries.map((entry, index) => [
    String(index + 1),
    `\`${entry.checkName}\``,
    `\`${entry.result}\``,
    `\`${entry.rawOutputRef}\``,
    entry.summary,
  ]);
}

function buildEvidenceRows(evidenceEntries) {
  return evidenceEntries.map((entry, index) => [
    String(index + 1),
    entry.summary,
    `\`${entry.rawOutputRef}\``,
    `Gate result: ${entry.result}`,
  ]);
}

function buildAutoCaveats(specGateStatus, qualityGateStatus, specNotes, qualityNotes, debugNotes) {
  const results = [];
  const pushGateNotes = (prefix, status, notes, defaultText) => {
    const normalizedNotes = notes.length > 0 ? notes : status !== "pass" ? [defaultText] : [];
    normalizedNotes.forEach((note, index) => {
      results.push({
        id: `AUTO-${prefix}-${index + 1}`,
        statement: note,
        impact: `${prefix.toLowerCase()} gate is currently ${status}.`,
        owner: "SDTK-CODE",
      });
    });
  };

  pushGateNotes("SPEC", specGateStatus, specNotes, `Spec/compliance gate is ${specGateStatus}.`);
  pushGateNotes("QUALITY", qualityGateStatus, qualityNotes, `Quality gate is ${qualityGateStatus}.`);

  debugNotes.forEach((note, index) => {
    results.push({
      id: `AUTO-DEBUG-${index + 1}`,
      statement: note,
      impact: "Reactive debug follow-up remains open from the current verify pass.",
      owner: "SDTK-CODE",
    });
  });

  return results;
}

function buildCaveatRows(explicitCaveats, autoCaveats) {
  return [...explicitCaveats, ...autoCaveats].map((entry, index) => [
    String(index + 1),
    `\`${entry.id}\``,
    entry.statement,
    entry.impact,
    entry.owner,
  ]);
}

function buildExclusionRows(excludedFiles, commitExclude) {
  const rows = excludedFiles.map((entry) => ({
    path: entry.path,
    reason: entry.reason,
  }));

  commitExclude.forEach((entry) => {
    if (!rows.some((row) => row.path === entry)) {
      rows.push({
        path: entry,
        reason: "Excluded from the proposed commit boundary during verify.",
      });
    }
  });

  return rows.map((entry, index) => [
    String(index + 1),
    `\`${entry.path}\``,
    entry.reason,
  ]);
}

function buildTruthSyncRows(truthSyncTargets) {
  return truthSyncTargets.map((entry, index) => [
    String(index + 1),
    entry.target,
    `\`${entry.status}\``,
    entry.rationale,
  ]);
}

function buildCommitBoundary(changedFiles, excludedFiles, commitInclude, commitExclude) {
  const includeList =
    commitInclude.length > 0
      ? uniqueStrings(commitInclude)
      : uniqueStrings(changedFiles.map((entry) => entry.path));
  const excludeList =
    commitExclude.length > 0
      ? uniqueStrings(commitExclude)
      : uniqueStrings(excludedFiles.map((entry) => entry.path));

  return {
    includeList,
    excludeList,
  };
}

function buildReviewerGuidance(
  reviewerGuidance,
  truthSyncTargets,
  specNotes,
  qualityNotes,
  debugNotes,
  changedFiles,
  commitBoundary,
  codeHandoffContext
) {
  const guidance = [...reviewerGuidance];

  guidance.push(...specNotes.map((entry) => `Spec/compliance follow-up: ${entry}`));
  guidance.push(...qualityNotes.map((entry) => `Quality follow-up: ${entry}`));
  guidance.push(...debugNotes.map((entry) => `Debug follow-up: ${entry}`));

  if (truthSyncTargets.length === 0) {
    guidance.push(
      "Truth-sync targets were not explicitly provided during verify; downstream review should confirm whether docs, help, runtime, and tests were intentionally untouched."
    );
  }

  if (changedFiles.length === 0 || commitBoundary.includeList.length === 0) {
    guidance.push(
      "Changed-file or commit-boundary details are incomplete in this verify pass; QA/controller review should treat commit inclusion as provisional until the author records the exact file set."
    );
  }

  if (codeHandoffContext && codeHandoffContext.error) {
    guidance.push(
      `Formal CODE_HANDOFF could not be parsed while generating the review packet: ${codeHandoffContext.error}`
    );
  }

  guidance.push(
    "This packet is an evidence package only; final approval remains with downstream QA and the controller."
  );
  guidance.push(
    "No bounded audits were run during verify; the controller may request a bounded audit later if a narrow question remains."
  );
  guidance.push(
    "If QA or controller rejects this batch, keep the next pass bounded to the recorded findings and refresh in order: verify -> QA -> controller."
  );

  return uniqueStrings(guidance);
}

function createReviewPacket({
  projectPath,
  featureKey,
  workflowText,
  evidenceEntries,
  specGateStatus,
  qualityGateStatus,
  specNotes,
  qualityNotes,
  debugNotes,
  batchSummary,
  changedFiles,
  excludedFiles,
  truthSyncTargets,
  commitInclude,
  commitExclude,
  caveats,
  reviewerGuidance,
}) {
  const featureName = humanizeFeatureKey(featureKey);
  const scopeContext = loadScopeContext(workflowText);
  const featureImplPlanContext = loadFeatureImplPlanContext(projectPath, featureKey);
  const codeHandoffContext = loadCodeHandoffContext(projectPath, featureKey);
  const workflowStageSnapshot = loadWorkflowStageSnapshot(workflowText);
  const reviewPacketPath = getReviewPacketPath(projectPath, featureKey);
  const commitBoundary = buildCommitBoundary(changedFiles, excludedFiles, commitInclude, commitExclude);
  const effectiveBatchSummary =
    (batchSummary && batchSummary.trim()) ||
    (scopeContext.sliceTitles.length > 0
      ? `Verify pass for approved slices: ${scopeContext.sliceTitles.join("; ")}`
      : `Verify pass for ${featureName}.`);
  const autoCaveats = buildAutoCaveats(
    specGateStatus,
    qualityGateStatus,
    specNotes,
    qualityNotes,
    debugNotes
  );
  const effectiveOutOfScope =
    scopeContext.outScope.length > 0
      ? scopeContext.outScope
      : featureImplPlanContext.nonGoals;
  const upstreamContractRefs = buildUpstreamContractRefs(
    projectPath,
    featureImplPlanContext.featureImplPlanPath,
    codeHandoffContext
  );
  const linkedContractRefs = buildLinkedContractRefs(codeHandoffContext);
  const provenanceContext = parseProvenanceContext(workflowText);
  const referenceDisclosure = buildReferenceDisclosure(provenanceContext);
  const guidance = buildReviewerGuidance(
    reviewerGuidance,
    truthSyncTargets,
    specNotes,
    qualityNotes,
    debugNotes,
    changedFiles,
    commitBoundary,
    codeHandoffContext
  );

  const content = [
    `# REVIEW PACKET: ${featureKey}`,
    "",
    "## 1. Review Context",
    `- Feature key: \`${featureKey}\``,
    `- Feature name: ${featureName}`,
    `- Batch summary: ${effectiveBatchSummary}`,
    `- Review date: \`${new Date().toISOString()}\``,
    "- Upstream contract refs:",
    ...upstreamContractRefs.map((entry) => `  - \`${entry}\``),
    "",
    "## 2. Approved Scope Snapshot",
    "### Workflow Stage Snapshot",
    `- Current workflow phase when verify started: \`${workflowStageSnapshot.currentPhase}\``,
    `- Phase status when verify started: \`${workflowStageSnapshot.phaseStatus}\``,
    `- Intake outcome: \`${workflowStageSnapshot.intakeOutcome}\``,
    `- Next recommended phase before verify refresh: \`${workflowStageSnapshot.nextPhase}\``,
    `- Blocking state before verify refresh: \`${workflowStageSnapshot.blockingState}\``,
    "",
    "### In Scope",
    renderBulletList(
      scopeContext.inScope,
      "No explicit in-scope items were recorded beyond the current verify pass."
    ),
    "",
    "### Out Of Scope",
    renderBulletList(
      effectiveOutOfScope,
      "No explicit out-of-scope items were recorded; defer to the upstream feature implementation plan."
    ),
    "",
    "### Linked Backlog / Contract Refs",
    renderBulletList(
      linkedContractRefs,
      "No additional backlog or contract refs were discovered beyond the upstream handoff."
    ),
    "",
    "## 3. Changed Files",
    renderTable(
      ["No", "Path", "Rationale"],
      buildChangedFileRows(changedFiles),
      "No changed-file entries were recorded during verify."
    ),
    "",
    "## 4. Verification Commands Executed",
    renderTable(
      ["No", "Command", "Result", "Evidence Ref", "Notes"],
      buildVerificationRows(evidenceEntries),
      "No verification commands were recorded during verify."
    ),
    "",
    "## 5. Evidence Index",
    renderTable(
      ["No", "Claim", "Evidence Path", "Reviewer Note"],
      buildEvidenceRows(evidenceEntries),
      "No evidence claims were indexed during verify."
    ),
    "",
    "## 6. Known Caveats And Unproven Claims",
    renderTable(
      ["No", "Caveat ID", "Statement", "Impact", "Follow-Up Owner"],
      buildCaveatRows(caveats, autoCaveats),
      "No explicit caveats or unproven claims were recorded during verify."
    ),
    "",
    "## 7. Unrelated Dirt And Exclusions",
    renderTable(
      ["No", "Path", "Exclusion Reason"],
      buildExclusionRows(excludedFiles, commitBoundary.excludeList),
      "No unrelated dirt or exclusions were recorded during verify."
    ),
    "",
    "## 8. Truth-Sync Targets",
    renderTable(
      ["No", "Target Path / Surface", "Status", "Rationale"],
      buildTruthSyncRows(truthSyncTargets),
      "No explicit truth-sync targets were recorded during verify. Downstream review must confirm whether docs, help, runtime, and tests were intentionally untouched."
    ),
    "",
    "## 9. Proposed Commit Boundary",
    "### Include List",
    renderBulletList(
      commitBoundary.includeList,
      "No include list was recorded during verify."
    ),
    "",
    "### Exclude List",
    renderBulletList(
      commitBoundary.excludeList,
      "No exclude list was recorded during verify."
    ),
    "",
    "### Batch Rationale",
    `- ${effectiveBatchSummary}`,
    "",
    "## 10. Reviewer Guidance",
    renderBulletList(
      guidance,
      "No additional reviewer guidance was recorded during verify."
    ),
    "",
    "## 11. Reference Disclosure",
    renderBulletList(
      referenceDisclosure.lines,
      "Reference disclosure details were not generated."
    ),
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(reviewPacketPath), { recursive: true });
  fs.writeFileSync(reviewPacketPath, content, "utf-8");

  return {
    reviewPacketPath,
    hasReferenceDisclosure: content.includes("## 11. Reference Disclosure"),
    provenanceMode: provenanceContext.mode,
    referenceDisclosureMode: referenceDisclosure.mode,
  };
}

module.exports = {
  createReviewPacket,
  getReviewPacketPath,
};
