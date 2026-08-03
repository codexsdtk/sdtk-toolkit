"use strict";

const fs = require("fs");
const path = require("path");
const { CliError, ValidationError } = require("./errors");
const {
  assertWikiWorkspaceWritePath,
  getWikiGraphPath,
  getWikiPagesPath,
  getPreferredWikiContentPath,
  getWikiProvenanceSourcesPath,
  getWikiRawSourcesPath,
  getWikiReportsPath,
  getWikiWorkspacePath,
  isPathInsideOrEqual,
  resolveProjectPath,
} = require("./wiki-paths");

const REQUIRED_PAGE_FIELDS = [
  "schema_version",
  "product",
  "managed_by",
  "page_id",
  "source_path",
  "source_hash",
  "title",
  "family",
  "role",
];

const REQUIRED_PERSONAL_BRAIN_FIELDS = [
  "id",
  "title",
  "type",
  "status",
  "created_at",
  "updated_at",
  "aliases",
  "tags",
  "related_pages",
  "source_refs",
  "confidence",
  "review_status",
];

const CATEGORY_DEFS = [
  ["schema", "Frontmatter and schema"],
  ["duplicates", "Duplicate page IDs"],
  ["brokenLinks", "Broken internal links"],
  ["orphans", "Orphan pages"],
  ["missingReciprocal", "Missing reciprocal related_pages"],
  ["provenance", "Provenance gaps"],
  ["downstream", "Downstream integration gaps"],
  ["thin", "Thin pages"],
  ["stale", "Stale pages"],
  ["markers", "TODO/Open Questions/Gaps"],
  ["contradictions", "Candidate contradictions"],
  ["sourceQuality", "Source quality"],
  ["personalBrainQuality", "Local wiki quality gate"],
];

const REQUIRED_PERSONAL_BRAIN_SECTIONS = {
  source: ["Summary", "Source Metadata", "Source Quality", "Provenance"],
  tool_entity: ["Summary", "Key Facts", "Discovery Source", "Extracted Snippet", "Topic Labels", "Why It Matters", "When To Use", "Related Repos", "Overlaps / Differences", "Open Questions", "Provenance"],
  concept: ["Summary", "Key Axes", "Implementations / Examples", "Patterns", "Recommendations / Caveats", "Open Questions", "Related Pages", "Source References"],
  comparison: ["Summary", "Decision Axes", "Comparison Matrix", "Candidate Tools / Repos", "Recommendations", "Caveats", "Source Confidence", "Open Questions", "Source References"],
  synthesis: ["Summary", "Landscape Snapshot", "Key Patterns", "Decision Axes", "Recommended Review Path", "Caveats", "Source Confidence", "Related Comparisons", "Open Questions", "Source References"],
  maintenance: ["Source Quality Findings", "Unsupported Items"],
};

const PERSONAL_BRAIN_STUB_CHAR_LIMIT = 600;
const PERSONAL_BRAIN_GIANT_PAGE_BYTES = 50000;
const LINT_CONTEXT_CHAR_LIMIT = 96;
const STRICT_SEMANTIC_PERSONAL_BRAIN_TYPES = new Set(["tool_entity", "concept", "comparison", "synthesis"]);

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function stripQuotes(value) {
  const text = String(value || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseInlineList(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }
  return text
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function parseFrontmatter(text) {
  const source = String(text || "");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { fields: {}, body: source, hasFrontmatter: false };
  }

  const block = match[1].split(/\r?\n/);
  const fields = {};
  for (const line of block) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    fields[key] = key === "related_pages" ? parseInlineList(rawValue) : stripQuotes(rawValue);
  }

  return {
    fields,
    body: source.slice(match[0].length),
    hasFrontmatter: true,
  };
}

function readJsonIfPresent(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    return { __lintError: `Could not parse JSON at ${filePath}: ${error.message}` };
  }
}

function listMarkdownPages(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const files = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if (entry.name === "_index.md") continue;
        files.push(absolute);
      }
    }
  }

  walk(rootPath);
  return files;
}

function truncateForReport(value, limit = LINT_CONTEXT_CHAR_LIMIT) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function isExternalMarkdownTarget(rawTarget) {
  const target = String(rawTarget || "").trim();
  return (
    target.startsWith("#") ||
    /^(?:https?:|mailto:|tel:)/i.test(target) ||
    /^(?:h|ht|htt|http|https)\.{3,}(?:\s|$)/i.test(target)
  );
}

function extractMarkdownLinks(body) {
  const links = [];
  const matcher = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = matcher.exec(body || "")) !== null) {
    const rawLabel = String(match[1] || "").trim();
    const rawTarget = String(match[2] || "").trim();
    if (!rawTarget) continue;
    if (isExternalMarkdownTarget(rawTarget)) {
      continue;
    }
    links.push({
      target: rawTarget,
      label: rawLabel,
      context: truncateForReport(rawLabel || rawTarget),
    });
  }
  return links;
}

function formatBrokenLinkFinding(pageRelPath, link) {
  const target = typeof link === "string" ? link : link.target;
  const context = typeof link === "string" ? "" : link.context;
  const parts = [
    `page: \`${pageRelPath}\``,
    `missing target: \`${truncateForReport(target)}\``,
  ];
  if (context) {
    parts.push(`context: \`${context}\``);
  }
  return parts.join("; ") + ".";
}

function hasHeading(body, heading) {
  const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^##\\s+${escaped}\\s*$`, "im").test(String(body || ""));
}

function hasSourceRefs(fields) {
  const raw = String(fields.source_refs || "").trim();
  return Boolean(raw && raw !== "[]" && raw !== "[\"\"]");
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function createFindings() {
  return Object.fromEntries(CATEGORY_DEFS.map(([key]) => [key, []]));
}

function appendFinding(findings, category, text) {
  findings[category].push(text);
}

function graphDegreeMap(graphPayload) {
  const degrees = new Map();
  if (!graphPayload || graphPayload.__lintError) return degrees;
  const edges = Array.isArray(graphPayload.edges) ? graphPayload.edges : [];
  for (const edge of edges) {
    const source = typeof edge.source === "string" ? edge.source : null;
    const target = typeof edge.target === "string" ? edge.target : null;
    if (source) degrees.set(source, (degrees.get(source) || 0) + 1);
    if (target) degrees.set(target, (degrees.get(target) || 0) + 1);
  }
  return degrees;
}

function readLintInputs(projectPath, findings) {
  const pagesRoot = getWikiPagesPath(projectPath);
  const pageFiles = listMarkdownPages(pagesRoot);
  const provenance = readJsonIfPresent(getWikiProvenanceSourcesPath(projectPath), { sources: [] });
  const raw = readJsonIfPresent(getWikiRawSourcesPath(projectPath), { sources: [] });
  const graph = readJsonIfPresent(path.join(getWikiGraphPath(projectPath), "SDTK_DOC_GRAPH.json"), {
    edges: [],
  });
  const graphIndex = readJsonIfPresent(path.join(getWikiGraphPath(projectPath), "SDTK_DOC_INDEX.json"), {
    documents: [],
  });

  if (provenance && provenance.__lintError) {
    appendFinding(findings, "provenance", provenance.__lintError);
  }
  if (raw && raw.__lintError) {
    appendFinding(findings, "sourceQuality", raw.__lintError);
  }
  if (graph && graph.__lintError) {
    appendFinding(findings, "downstream", graph.__lintError);
  }
  if (graphIndex && graphIndex.__lintError) {
    appendFinding(findings, "sourceQuality", graphIndex.__lintError);
  }

  const sources = provenance && Array.isArray(provenance.sources) ? provenance.sources : [];
  const rawSources = raw && Array.isArray(raw.sources) ? raw.sources : [];
  const graphDocuments = graphIndex && Array.isArray(graphIndex.documents) ? graphIndex.documents : [];
  return { graph, graphDocuments, pageFiles, pagesRoot, rawSources, sources };
}

function normalizeSourcePath(value) {
  return toPosix(value).replace(/^\.\//, "");
}

function sourceRecordPath(record) {
  if (!record || typeof record !== "object") return "";
  return normalizeSourcePath(record.sourcePath || record.path || record.id || "");
}

function resolveSourceFilePath(projectPath, sourcePath) {
  if (!sourcePath) return null;
  const nativePath = sourcePath.replace(/\//g, path.sep);
  const candidate = path.isAbsolute(nativePath) ? path.resolve(nativePath) : path.resolve(projectPath, nativePath);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  return candidate;
}

function extractGithubRepos(text) {
  const repos = [];
  const seen = new Set();
  const matcher = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)/gi;
  let match;
  while ((match = matcher.exec(String(text || ""))) !== null) {
    const owner = match[1];
    const repo = match[2].replace(/[).,;:]+$/g, "").replace(/\.git$/i, "");
    if (!repo || repo.includes("...")) continue;
    const url = `https://github.com/${owner}/${repo}`;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push({ owner, repo, url });
  }
  return repos;
}

function detectMojibakeExamples(text) {
  const examples = [];
  const matcher = /�|Ã.|Â.|â€|ðŸ/gi;
  let match;
  while ((match = matcher.exec(String(text || ""))) !== null) {
    const start = Math.max(0, match.index - 20);
    const end = Math.min(text.length, match.index + 40);
    examples.push(text.slice(start, end).replace(/\s+/g, " ").trim());
    if (examples.length >= 3) break;
  }
  return examples;
}

function weakTitle(title, sourcePath) {
  const text = String(title || "").trim();
  const stem = path.basename(sourcePath || "", path.extname(sourcePath || ""));
  return (
    text.length < 6 ||
    /^untitled|note|readme$/i.test(text) ||
    text === stem.replace(/[_-]+/g, " ")
  );
}

function analyzeSourceQuality(projectPath, inputs, findings) {
  const provenancePaths = new Set(inputs.sources.map(sourceRecordPath).filter(Boolean));
  const rawPaths = new Set(inputs.rawSources.map(sourceRecordPath).filter(Boolean));
  const graphPaths = new Set(
    inputs.graphDocuments
      .map((record) => normalizeSourcePath(record && (record.id || record.path)))
      .filter(Boolean)
  );
  const repoToSources = new Map();
  const urlToSources = new Map();

  for (const sourcePath of rawPaths) {
    if (!provenancePaths.has(sourcePath)) {
      appendFinding(
        findings,
        "sourceQuality",
        `Raw source \`${sourcePath}\` is registered but absent from graph/provenance source coverage.`
      );
    }
  }

  for (const sourcePath of provenancePaths) {
    if (graphPaths.size > 0 && !graphPaths.has(sourcePath)) {
      appendFinding(
        findings,
        "sourceQuality",
        `Provenance source \`${sourcePath}\` is absent from graph document index.`
      );
    }
  }

  for (const record of inputs.sources) {
    const sourcePath = sourceRecordPath(record);
    const resolved = resolveSourceFilePath(projectPath, sourcePath);
    const title = String((record && record.title) || "");
    if (!resolved) {
      appendFinding(
        findings,
        "sourceQuality",
        `Source \`${sourcePath || "(missing)"}\` could not be read for source-quality lint.`
      );
      continue;
    }

    const text = fs.readFileSync(resolved, "utf-8");
    const repos = extractGithubRepos(text);
    const mojibakeExamples = detectMojibakeExamples(text);

    if (mojibakeExamples.length > 0) {
      appendFinding(
        findings,
        "sourceQuality",
        `Source \`${sourcePath}\` has mojibake-like text examples: ${mojibakeExamples.map((item) => `\`${item}\``).join("; ")}.`
      );
    }

    if (repos.length === 0) {
      appendFinding(findings, "sourceQuality", `Source \`${sourcePath}\` has no detected GitHub/source URL.`);
    }

    if (weakTitle(title, sourcePath)) {
      appendFinding(findings, "sourceQuality", `Source \`${sourcePath}\` has a weak or filename-derived title \`${title || "(missing)"}\`.`);
    }

    if (repos.length === 0) {
      appendFinding(findings, "sourceQuality", `Source \`${sourcePath}\` has low-confidence extraction because no valid GitHub repo candidate was detected.`);
    }

    if (repos.length > 0) {
      const sourceUrl = repos[0].url;
      const existing = urlToSources.get(sourceUrl.toLowerCase()) || [];
      existing.push(sourcePath);
      urlToSources.set(sourceUrl.toLowerCase(), existing);
    }

    for (const repo of repos) {
      const existing = repoToSources.get(repo.url.toLowerCase()) || [];
      existing.push(sourcePath);
      repoToSources.set(repo.url.toLowerCase(), existing);
    }
  }

  for (const [url, paths] of urlToSources.entries()) {
    if (paths.length > 1) {
      appendFinding(
        findings,
        "sourceQuality",
        `Duplicate source URL candidate \`${url}\` appears in ${paths.map((item) => `\`${item}\``).join(", ")}.`
      );
    }
  }

  for (const [repo, paths] of repoToSources.entries()) {
    if (paths.length > 1) {
      appendFinding(
        findings,
        "sourceQuality",
        `Duplicate GitHub repo candidate \`${repo}\` appears in ${paths.map((item) => `\`${item}\``).join(", ")}.`
      );
    }
  }
}

function analyzePages(projectPath) {
  const findings = createFindings();
  const inputs = readLintInputs(projectPath, findings);
  const pages = [];
  const pagesById = new Map();
  const inboundMarkdown = new Map();
  const inboundRelated = new Map();

  for (const filePath of inputs.pageFiles) {
    const relPath = toPosix(path.relative(inputs.pagesRoot, filePath));
    const parsed = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
    const fields = parsed.fields;
    const page = {
      filePath,
      relPath,
      body: parsed.body,
      fields,
      pageId: fields.page_id || "",
      sourcePath: fields.source_path || "",
      sourceHash: fields.source_hash || "",
      relatedPages: Array.isArray(fields.related_pages) ? fields.related_pages : [],
      links: extractMarkdownLinks(parsed.body),
    };
    pages.push(page);

    if (!parsed.hasFrontmatter) {
      appendFinding(findings, "schema", `\`${relPath}\` is missing parseable frontmatter.`);
    }

    const missingFields = REQUIRED_PAGE_FIELDS.filter((field) => !fields[field]);
    if (missingFields.length > 0) {
      appendFinding(
        findings,
        "schema",
        `\`${relPath}\` is missing required fields: ${missingFields.join(", ")}.`
      );
    }
    if (fields.product && fields.product !== "SDTK-WIKI") {
      appendFinding(findings, "schema", `\`${relPath}\` has unexpected product \`${fields.product}\`.`);
    }
    if (fields.managed_by && fields.managed_by !== "sdtk-wiki") {
      appendFinding(findings, "schema", `\`${relPath}\` has unexpected managed_by \`${fields.managed_by}\`.`);
    }

    if (page.pageId) {
      if (!pagesById.has(page.pageId)) {
        pagesById.set(page.pageId, []);
      }
      pagesById.get(page.pageId).push(page);
    }
  }

  for (const [pageId, records] of pagesById.entries()) {
    if (records.length > 1) {
      appendFinding(
        findings,
        "duplicates",
        `\`${pageId}\` appears in ${records.map((record) => `\`${record.relPath}\``).join(", ")}.`
      );
    }
  }

  const pagesByRelPath = new Map(pages.map((page) => [toPosix(path.normalize(page.relPath)), page]));
  for (const page of pages) {
    for (const link of page.links) {
      const target = typeof link === "string" ? link : link.target;
      const rawPath = target.split("#")[0].trim();
      if (!rawPath) continue;
      const resolved = path.resolve(path.dirname(page.filePath), rawPath);
      if (!isPathInsideOrEqual(resolved, inputs.pagesRoot) || !fs.existsSync(resolved)) {
        appendFinding(findings, "brokenLinks", formatBrokenLinkFinding(page.relPath, link));
        continue;
      }
      const targetRel = toPosix(path.relative(inputs.pagesRoot, resolved));
      if (pagesByRelPath.has(targetRel)) {
        inboundMarkdown.set(targetRel, (inboundMarkdown.get(targetRel) || 0) + 1);
      }
    }

    for (const targetId of page.relatedPages) {
      const targetRecords = pagesById.get(targetId) || [];
      if (targetRecords.length === 0) {
        appendFinding(
          findings,
          "missingReciprocal",
          `\`${page.relPath}\` declares related page \`${targetId}\`, but no target page exists.`
        );
        continue;
      }
      for (const target of targetRecords) {
        inboundRelated.set(target.pageId, (inboundRelated.get(target.pageId) || 0) + 1);
        if (!target.relatedPages.includes(page.pageId)) {
          appendFinding(
            findings,
            "missingReciprocal",
            `\`${page.pageId}\` references \`${targetId}\`, but the target does not reference \`${page.pageId}\`.`
          );
        }
      }
    }
  }

  const provenanceBySource = new Map(
    inputs.sources
      .filter((record) => record && typeof record.sourcePath === "string")
      .map((record) => [record.sourcePath, record])
  );
  const degrees = graphDegreeMap(inputs.graph);

  for (const page of pages) {
    const sourceRecord = page.sourcePath ? provenanceBySource.get(page.sourcePath) : null;
    if (page.sourcePath && !sourceRecord) {
      appendFinding(
        findings,
        "provenance",
        `\`${page.relPath}\` references source \`${page.sourcePath}\` missing from provenance sources.`
      );
      appendFinding(
        findings,
        "stale",
        `\`${page.relPath}\` may be stale because source \`${page.sourcePath}\` is absent from provenance.`
      );
    } else if (
      page.sourcePath &&
      sourceRecord &&
      typeof sourceRecord.sourceHash === "string" &&
      page.sourceHash &&
      sourceRecord.sourceHash !== page.sourceHash
    ) {
      appendFinding(
        findings,
        "provenance",
        `\`${page.relPath}\` source hash differs from provenance for \`${page.sourcePath}\`.`
      );
      appendFinding(
        findings,
        "stale",
        `\`${page.relPath}\` may be stale because its source hash differs from provenance.`
      );
    }

    const inboundLinks = inboundMarkdown.get(page.relPath) || 0;
    const relatedInboundCount = inboundRelated.get(page.pageId) || 0;
    // BK-318: a page whose underlying source has real atlas-graph edges is not
    // an orphan — the degree map was already computed but never consulted here,
    // which false-flagged ~98% of atlas pages (their connectivity lives in the
    // graph, not in per-page frontmatter).
    const graphDegree = page.sourcePath ? degrees.get(page.sourcePath) || 0 : 0;
    if (inboundLinks === 0 && relatedInboundCount === 0 && graphDegree === 0) {
      appendFinding(findings, "orphans", `\`${page.relPath}\` has no inbound wiki links, reciprocal relationships, or graph edges.`);
    }
    if (
      page.sourcePath &&
      graphDegree === 0 &&
      inboundLinks === 0 &&
      relatedInboundCount === 0 &&
      page.relatedPages.length === 0
    ) {
      appendFinding(
        findings,
        "downstream",
        `\`${page.relPath}\` has no downstream integration signal for source \`${page.sourcePath}\`.`
      );
    }

    const compactBody = page.body.replace(/\s+/g, " ").trim();
    if (compactBody.length < 120) {
      appendFinding(findings, "thin", `\`${page.relPath}\` is thin (${compactBody.length} normalized characters).`);
    }

    const markerLabels = [];
    if (/\bTODO\b/i.test(page.body)) markerLabels.push("TODO");
    if (/open questions/i.test(page.body)) markerLabels.push("Open Questions");
    if (/\bgaps?\b/i.test(page.body)) markerLabels.push("Gaps");
    if (markerLabels.length > 0) {
      appendFinding(findings, "markers", `\`${page.relPath}\` contains ${markerLabels.join(", ")} markers.`);
    }

    if (
      /\b(?:conflict|contradict|inconsistent)\b/i.test(page.body) ||
      /\bmust\b[\s\S]{0,160}\bmust not\b/i.test(page.body) ||
      /\bmust not\b[\s\S]{0,160}\bmust\b/i.test(page.body)
    ) {
      appendFinding(
        findings,
        "contradictions",
        `\`${page.relPath}\` contains heuristic contradiction language and should be reviewed manually.`
      );
    }
  }

  analyzeSourceQuality(projectPath, inputs, findings);

  const personalBrainAnalysis = analyzePersonalBrainPages(projectPath, findings);

  return {
    findings,
    pageCount: pages.length + personalBrainAnalysis.count,
    personalBrainMetrics: personalBrainAnalysis.metrics,
  };
}

function analyzePersonalBrainPages(projectPath, findings) {
  const contentRoot = getPreferredWikiContentPath(projectPath);
  const personalBrainRoot = contentRoot.path;
  const contentRelative = toPosix(contentRoot.relative);
  const pageFiles = listMarkdownPages(personalBrainRoot);
  const pages = [];
  const metrics = {
    pageCount: pageFiles.length,
    contentRoot: personalBrainRoot,
    contentMode: contentRoot.mode,
    contentRelative,
    byType: {},
    frontmatterCoverage: 0,
    requiredSectionCoverage: 0,
    sourceRefsCoverage: 0,
    stubRatio: 0,
    sourcePageCount: 0,
    sourceThinAnchorCount: 0,
    sourceThinAnchorRatio: 0,
    semanticPageCount: 0,
    semanticStubCount: 0,
    semanticStubRatio: 0,
    giantPageCount: 0,
    brokenInternalLinks: 0,
    conceptCount: 0,
    entityCount: 0,
    comparisonCount: 0,
    synthesisCount: 0,
    sourceEvidenceCoverage: 0,
  };
  let frontmatterCount = 0;
  let sectionRequiredTotal = 0;
  let sectionPresentTotal = 0;
  let sourceRefsEligible = 0;
  let sourceRefsPresent = 0;
  let sourceEvidenceEligible = 0;
  let sourceEvidencePresent = 0;
  let stubCount = 0;

  for (const filePath of pageFiles) {
    const relPath = toPosix(path.relative(personalBrainRoot, filePath));
    const parsed = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
    const fields = parsed.fields;
    const type = String(fields.type || "unknown");
    pages.push({ filePath, relPath, fields, body: parsed.body, hasFrontmatter: parsed.hasFrontmatter, type });
    metrics.byType[type] = (metrics.byType[type] || 0) + 1;
    if (type === "source") metrics.sourcePageCount += 1;
    if (STRICT_SEMANTIC_PERSONAL_BRAIN_TYPES.has(type)) metrics.semanticPageCount += 1;
    if (type === "concept") metrics.conceptCount += 1;
    if (type === "tool_entity") metrics.entityCount += 1;
    if (type === "comparison") metrics.comparisonCount += 1;
    if (type === "synthesis") metrics.synthesisCount += 1;

    if (!parsed.hasFrontmatter) {
      appendFinding(findings, "schema", `${contentRelative}/${relPath} is missing parseable frontmatter.`);
      continue;
    }
    frontmatterCount += 1;

    const missingFields = REQUIRED_PERSONAL_BRAIN_FIELDS.filter((field) => !fields[field]);
    if (missingFields.length > 0) {
      appendFinding(
        findings,
        "schema",
        `${contentRelative}/${relPath} is missing required local wiki fields: ${missingFields.join(", ")}.`
      );
    }

    const requiredSections = REQUIRED_PERSONAL_BRAIN_SECTIONS[type] || [];
    sectionRequiredTotal += requiredSections.length;
    const missingSections = requiredSections.filter((section) => !hasHeading(parsed.body, section));
    sectionPresentTotal += requiredSections.length - missingSections.length;
    if (missingSections.length > 0) {
      appendFinding(
        findings,
        "personalBrainQuality",
        `${contentRelative}/${relPath} is missing required sections for ${type}: ${missingSections.join(", ")}.`
      );
    }

    if (!["root"].includes(type)) {
      sourceRefsEligible += 1;
      if (hasSourceRefs(fields)) sourceRefsPresent += 1;
      else appendFinding(findings, "personalBrainQuality", `${contentRelative}/${relPath} has no source_refs coverage.`);
    }

    if (["tool_entity", "concept", "comparison", "synthesis"].includes(type)) {
      sourceEvidenceEligible += 1;
      if (hasSourceRefs(fields) && /(?:source|provenance|evidence)/i.test(parsed.body)) {
        sourceEvidencePresent += 1;
      } else {
        appendFinding(findings, "personalBrainQuality", `${contentRelative}/${relPath} lacks source evidence coverage in body/frontmatter.`);
      }
    }

    const compactBody = parsed.body.replace(/\s+/g, " ").trim();
    if (type === "source") {
      metrics.sourceThinAnchorCount += 1;
    } else if (compactBody.length < PERSONAL_BRAIN_STUB_CHAR_LIMIT && STRICT_SEMANTIC_PERSONAL_BRAIN_TYPES.has(type)) {
      stubCount += 1;
      metrics.semanticStubCount += 1;
      appendFinding(findings, "personalBrainQuality", `${contentRelative}/${relPath} appears stub-like (${compactBody.length} normalized characters).`);
    }

    const byteSize = fs.statSync(filePath).size;
    if (byteSize > PERSONAL_BRAIN_GIANT_PAGE_BYTES) {
      metrics.giantPageCount += 1;
      appendFinding(findings, "personalBrainQuality", `${contentRelative}/${relPath} is very large (${byteSize} bytes) and may need splitting.`);
    }
  }

  for (const page of pages) {
    for (const link of extractMarkdownLinks(page.body)) {
      const target = typeof link === "string" ? link : link.target;
      const rawPath = target.split("#")[0].trim();
      if (!rawPath) continue;
      const resolved = path.resolve(path.dirname(page.filePath), rawPath);
      if (!isPathInsideOrEqual(resolved, personalBrainRoot) || !fs.existsSync(resolved)) {
        appendFinding(findings, "brokenLinks", formatBrokenLinkFinding(`${contentRelative}/${page.relPath}`, link));
        metrics.brokenInternalLinks += 1;
      }
    }
  }

  metrics.frontmatterCoverage = pageFiles.length > 0 ? frontmatterCount / pageFiles.length : 1;
  metrics.requiredSectionCoverage = sectionRequiredTotal > 0 ? sectionPresentTotal / sectionRequiredTotal : 1;
  metrics.sourceRefsCoverage = sourceRefsEligible > 0 ? sourceRefsPresent / sourceRefsEligible : 1;
  metrics.stubRatio = pageFiles.length > 0 ? stubCount / pageFiles.length : 0;
  metrics.sourceThinAnchorRatio = metrics.sourcePageCount > 0 ? metrics.sourceThinAnchorCount / metrics.sourcePageCount : 0;
  metrics.semanticStubRatio = metrics.semanticPageCount > 0 ? metrics.semanticStubCount / metrics.semanticPageCount : 0;
  metrics.sourceEvidenceCoverage = sourceEvidenceEligible > 0 ? sourceEvidencePresent / sourceEvidenceEligible : 1;

  if (pageFiles.length === 0) {
    appendFinding(findings, "personalBrainQuality", "No local wiki pages were found under wiki/ or legacy .sdtk/wiki/personal-brain.");
  }
  if (metrics.frontmatterCoverage < 1) {
    appendFinding(findings, "personalBrainQuality", `Frontmatter coverage is ${formatPercent(metrics.frontmatterCoverage)}; expected 100%.`);
  }
  if (metrics.requiredSectionCoverage < 0.95) {
    appendFinding(findings, "personalBrainQuality", `Required section coverage is ${formatPercent(metrics.requiredSectionCoverage)}; expected at least 95%.`);
  }
  if (metrics.sourceRefsCoverage < 0.9) {
    appendFinding(findings, "personalBrainQuality", `Source refs coverage is ${formatPercent(metrics.sourceRefsCoverage)}; expected at least 90%.`);
  }
  if (metrics.semanticStubRatio > 0.1) {
    appendFinding(findings, "personalBrainQuality", `Semantic stub ratio is ${formatPercent(metrics.semanticStubRatio)}; expected at most 10% for tool/concept/comparison/synthesis pages.`);
  }
  if (metrics.entityCount > 0 && metrics.conceptCount === 0) {
    appendFinding(findings, "personalBrainQuality", "Tool/entity pages exist but no concept pages were generated.");
  }
  if (metrics.conceptCount > 0 && metrics.comparisonCount === 0) {
    appendFinding(findings, "personalBrainQuality", "Concept pages exist but no comparison pages were generated.");
  }
  if (metrics.comparisonCount > 0 && metrics.synthesisCount === 0) {
    appendFinding(findings, "personalBrainQuality", "Comparison pages exist but no synthesis pages were generated.");
  }

  return { count: pageFiles.length, metrics };
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function totalFindings(findings) {
  return CATEGORY_DEFS.reduce((sum, [key]) => sum + findings[key].length, 0);
}

function renderPersonalBrainMetrics(metrics) {
  if (!metrics) return ["## Local Wiki Quality Metrics", "", "- No local wiki metrics available.", ""];
  const typeRows = Object.entries(metrics.byType || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `| ${type} | ${count} |`);
  return [
    "## Local Wiki Quality Metrics",
    "",
    `- wiki content root: ${metrics.contentRoot}`,
    `- wiki content mode: ${metrics.contentMode}`,
    `- local wiki pages: ${metrics.pageCount}`,
    `- frontmatter coverage: ${formatPercent(metrics.frontmatterCoverage)}`,
    `- required section coverage: ${formatPercent(metrics.requiredSectionCoverage)}`,
    `- source refs coverage: ${formatPercent(metrics.sourceRefsCoverage)}`,
    `- source evidence coverage: ${formatPercent(metrics.sourceEvidenceCoverage)}`,
    `- source pages: ${metrics.sourcePageCount}`,
    `- source pages accepted as provenance anchors: ${metrics.sourceThinAnchorCount}`,
    `- source-page thin-anchor ratio: ${formatPercent(metrics.sourceThinAnchorRatio)}`,
    `- strict semantic pages: ${metrics.semanticPageCount}`,
    `- strict semantic stub pages: ${metrics.semanticStubCount}`,
    `- semantic stub ratio: ${formatPercent(metrics.semanticStubRatio)}`,
    `- stub ratio policy: source pages are measured separately; strict stub findings apply to tool_entity, concept, comparison, and synthesis pages.`,
    `- giant page warnings: ${metrics.giantPageCount}`,
    `- broken local wiki internal links: ${metrics.brokenInternalLinks}`,
    `- entity pages: ${metrics.entityCount}`,
    `- concept pages: ${metrics.conceptCount}`,
    `- comparison pages: ${metrics.comparisonCount}`,
    `- synthesis pages: ${metrics.synthesisCount}`,
    "",
    "| Page type | Count |",
    "|---|---:|",
    ...(typeRows.length > 0 ? typeRows : ["| none | 0 |"]),
    "",
  ];
}

function renderReport({ projectPath, workspaceRoot, findings, pageCount, personalBrainMetrics }) {
  const summaryRows = CATEGORY_DEFS.map(
    ([key, label]) => `| ${label} | ${findings[key].length} |`
  );
  const detailSections = CATEGORY_DEFS.flatMap(([key, label]) => {
    const items = findings[key];
    return [
      `## ${label}`,
      "",
      ...(items.length > 0 ? items.map((item) => `- ${item}`) : ["- None."]),
      "",
    ];
  });

  return [
    "# SDTK-WIKI Lint Report",
    "",
    `Date: ${todayStamp()}`,
    `Project root: \`${projectPath}\``,
    `Workspace root: \`${workspaceRoot}\``,
    `Pages scanned: ${pageCount}`,
    `Total findings: ${totalFindings(findings)}`,
    "",
    "Report-only and non-destructive: lint writes this report and does not auto-modify wiki or source content.",
    "Candidate contradictions are heuristic only and require manual review.",
    "",
    "## Summary",
    "",
    "| Category | Count |",
    "|---|---:|",
    ...summaryRows,
    "",
    ...renderPersonalBrainMetrics(personalBrainMetrics),
    ...detailSections,
  ].join("\n");
}

function runWikiLint(options = {}) {
  const projectPath = resolveProjectPath(options.projectPath);
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new ValidationError(`--project-path is not a valid directory: ${projectPath}`);
  }

  const workspaceRoot = getWikiWorkspacePath(projectPath);
  if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    throw new ValidationError(
      `No SDTK-WIKI workspace found at ${workspaceRoot}. Run "sdtk-wiki init" first.`
    );
  }

  const analysis = analyzePages(projectPath);
  const reportsRoot = getWikiReportsPath(projectPath);
  try {
    assertWikiWorkspaceWritePath(reportsRoot, projectPath);
    fs.mkdirSync(reportsRoot, { recursive: true });
    const reportPath = path.join(reportsRoot, `lint-report-${todayStamp()}.md`);
    assertWikiWorkspaceWritePath(reportPath, projectPath);
    const report = renderReport({
      projectPath,
      workspaceRoot,
      findings: analysis.findings,
      pageCount: analysis.pageCount,
      personalBrainMetrics: analysis.personalBrainMetrics,
    });
    fs.writeFileSync(reportPath, report + "\n", "utf-8");
    return {
      reportPath,
      totalFindings: totalFindings(analysis.findings),
      findings: analysis.findings,
      personalBrainMetrics: analysis.personalBrainMetrics,
    };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Failed to write SDTK-WIKI lint report: ${error.message}`);
  }
}

module.exports = {
  CATEGORY_DEFS,
  REQUIRED_PERSONAL_BRAIN_FIELDS,
  REQUIRED_PAGE_FIELDS,
  analyzePages,
  parseFrontmatter,
  renderReport,
  runWikiLint,
};
