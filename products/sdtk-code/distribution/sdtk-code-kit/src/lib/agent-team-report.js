"use strict";

const fs = require("fs");
const path = require("path");
const { safeSegment } = require("./agent-team-export");
const { loadAgentTeamPlan } = require("./agent-team-plan");
const {
  asArray,
  assertPathUnderBase,
  atomicWriteText,
  resolveEvidencePath,
} = require("./agent-team-evidence");
const { READINESS_NOTE, loadReadiness } = require("./agent-team-readiness");

function reportBaseDir(projectPath) {
  return path.resolve(projectPath || ".", ".sdtk", "agent-team", "reports");
}

function resolveReportPath(projectPath, featureKey) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const base = reportBaseDir(projectPath);
  const dir = assertPathUnderBase(path.join(base, safeFeatureKey), base);
  return assertPathUnderBase(path.join(dir, "morning_report.md"), base);
}

function loadEvidenceMap(projectPath, plan) {
  const evidenceMap = {};
  for (const roleSpec of asArray(plan && plan.roles)) {
    const role = roleSpec.role;
    const evidencePath = resolveEvidencePath(projectPath, plan.feature_key, role);
    if (!fs.existsSync(evidencePath)) {
      evidenceMap[role] = null;
      continue;
    }
    try {
      evidenceMap[role] = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    } catch (_error) {
      evidenceMap[role] = { _invalid: true };
    }
  }
  return evidenceMap;
}

function bulletList(items, fallback) {
  if (!Array.isArray(items) || items.length === 0) {
    return `- ${fallback}`;
  }
  return items.map((item) => `- ${String(item)}`).join("\n");
}

function roleStatus(readinessJson, role) {
  return asArray(readinessJson && readinessJson.roles).find((entry) => entry.role === role) || {
    role,
    verdict: "NOT_READY",
    reason: "role missing from readiness.json",
  };
}

function renderEvidenceDetail(roleSpec, evidence) {
  const role = roleSpec.role;
  if (!evidence) {
    return [
      `### ${role}`,
      "",
      "- Evidence: not submitted",
      "",
    ].join("\n");
  }
  if (evidence._invalid) {
    return [
      `### ${role}`,
      "",
      "- Evidence: invalid JSON",
      "",
    ].join("\n");
  }

  const lines = [
    `### ${role}`,
    "",
    `- Summary: ${evidence.summary || "(none)"}`,
    "- Commands run:",
    bulletList(evidence.commands_run, "none"),
    `- Verification evidence: ${evidence.verification_evidence || "(none)"}`,
    "- Blockers:",
    bulletList(evidence.blockers, "none"),
    "- Files touched:",
    bulletList(evidence.files_touched, "none declared"),
    `- Stop condition hit: ${evidence.stop_condition_hit === null || evidence.stop_condition_hit === undefined ? "none" : evidence.stop_condition_hit}`,
  ];

  if (evidence.commit_range) {
    lines.push("- Commit range:");
    lines.push(`- before: ${evidence.commit_range.before || "(none)"}`);
    lines.push(`- after: ${evidence.commit_range.after || "(none)"}`);
  }

  lines.push("");
  return lines.join("\n");
}

function renderMorningReport(plan, evidenceMap, readinessJson) {
  const rows = asArray(plan && plan.roles).map((roleSpec) => {
    const status = roleStatus(readinessJson, roleSpec.role);
    return `| ${roleSpec.role} | ${status.verdict} | ${status.reason || ""} |`;
  });
  const details = asArray(plan && plan.roles).map((roleSpec) => renderEvidenceDetail(roleSpec, evidenceMap[roleSpec.role]));

  return [
    `# Agent Team Morning Report — ${plan.feature_key} (${plan.run_id})`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Overall Verdict",
    "",
    "```text",
    readinessJson.overall_verdict,
    "```",
    "",
    `Reason: ${readinessJson.overall_reason || "(none)"}`,
    "",
    "## Readiness Note",
    "",
    readinessJson.readiness_note || READINESS_NOTE,
    "",
    "## Role Evidence Status",
    "",
    "| Role | Verdict | Reason |",
    "| --- | --- | --- |",
    ...(rows.length > 0 ? rows : ["| (none) | NOT_READY | no roles in plan |"]),
    "",
    "## Evidence Details",
    "",
    ...details,
    "## Next steps",
    "",
    "- Review evidence files before treating READY_TO_SLEEP as final.",
    "- Check code, tests, and product behavior manually before shipping.",
    "- Resolve any NOT_READY or BLOCKED_BY_STOP_CONDITION role before relying on this report.",
    "- This report records submitted evidence only; it does not execute or verify implementation correctness.",
    "",
  ].join("\n");
}

function buildMorningReport(projectPath, featureKey) {
  const safeFeatureKey = safeSegment(featureKey, "feature_key");
  const plan = loadAgentTeamPlan(projectPath, safeFeatureKey);
  const readinessJson = loadReadiness(projectPath, safeFeatureKey);
  const evidenceMap = loadEvidenceMap(projectPath, plan);
  return { plan, readinessJson, evidenceMap, markdown: renderMorningReport(plan, evidenceMap, readinessJson) };
}

function writeReport(projectPath, featureKey, markdown) {
  const outputPath = resolveReportPath(projectPath, featureKey);
  return atomicWriteText(outputPath, markdown, reportBaseDir(projectPath));
}

module.exports = {
  reportBaseDir,
  resolveReportPath,
  loadEvidenceMap,
  renderMorningReport,
  buildMorningReport,
  writeReport,
};
