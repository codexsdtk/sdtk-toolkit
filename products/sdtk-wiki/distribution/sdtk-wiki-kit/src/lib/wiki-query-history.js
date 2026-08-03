"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  assertWikiWorkspaceWritePath,
  getWikiQueriesPath,
  resolveProjectPath,
} = require("./wiki-paths");

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function shortHash(value, length = 12) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function timestampParts(date = new Date()) {
  const iso = date.toISOString();
  const stamp = iso.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return {
    iso,
    stamp,
  };
}

function projectFingerprint(projectPath) {
  return shortHash(path.resolve(projectPath), 16);
}

function summarizeAnswer(answer, citations) {
  const answerLength = String(answer || "").length;
  const citationCount = Array.isArray(citations) ? citations.length : 0;
  return `Redacted answer summary; answer length ${answerLength} characters with ${citationCount} source reference(s).`;
}

function sourceRefs(citations) {
  if (!Array.isArray(citations)) return [];
  return citations
    .map((citation) => {
      if (typeof citation === "string") return citation;
      if (citation && typeof citation === "object") {
        return citation.path || citation.sourcePath || citation.id || citation.title || "";
      }
      return "";
    })
    .filter(Boolean)
    .map(toPosix);
}

function relativeGraphPath(result, projectPath) {
  const graphPath = result && result.graphPath ? String(result.graphPath) : "";
  if (!graphPath) return ".sdtk/wiki/graph";
  const relative = path.relative(resolveProjectPath(projectPath), graphPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return ".sdtk/wiki/graph";
  }
  return toPosix(relative);
}

function buildQueryRecord({ projectPath, question, result, createdAt = new Date() }) {
  const time = timestampParts(createdAt);
  const refs = sourceRefs(result.citations);
  const queryId = `query-${shortHash(`${time.iso}:${question}:${result.graphPath || ""}`)}`;
  return {
    schema_version: 1,
    product: "SDTK-WIKI",
    record_type: "sdtk_wiki_query",
    query_id: queryId,
    created_at: time.iso,
    command_surface: "sdtk-wiki ask",
    project_path_fingerprint: projectFingerprint(projectPath),
    question_redacted: "[redacted]",
    answer_summary: summarizeAnswer(result.answer, refs),
    source_refs: refs,
    graph_path: relativeGraphPath(result, projectPath),
    runtime: {
      capability: "wiki.ask",
      confidence: result.confidence || null,
    },
    model: null,
    privacy_mode: "redacted",
    retention_policy: "Project-local redacted query record. Full question and full answer are not stored by default.",
    status: "answered",
    review_status: "unreviewed",
  };
}

function saveQueryHistoryRecord({ projectPath, question, result }) {
  const resolvedProjectPath = resolveProjectPath(projectPath);
  const queriesPath = getWikiQueriesPath(resolvedProjectPath);
  assertWikiWorkspaceWritePath(queriesPath, resolvedProjectPath);
  const record = buildQueryRecord({ projectPath: resolvedProjectPath, question, result });
  const time = timestampParts(new Date(record.created_at));
  const fileName = `${time.stamp}-${shortHash(record.query_id)}.json`;
  const recordPath = path.join(queriesPath, fileName);
  assertWikiWorkspaceWritePath(recordPath, resolvedProjectPath);
  fs.mkdirSync(queriesPath, { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return {
    record,
    recordPath,
  };
}

module.exports = {
  buildQueryRecord,
  saveQueryHistoryRecord,
};
