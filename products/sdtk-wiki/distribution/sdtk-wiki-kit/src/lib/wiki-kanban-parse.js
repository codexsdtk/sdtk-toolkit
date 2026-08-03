"use strict";

// BK-272: Agent Kanban — pure parser (no I/O). Caller passes file text.
// Spec §D3: view model; §D4: column derivation rules; §D5: liveness.

const KANBAN_LIVENESS_MIN = 15;
const COLUMNS = ["todo", "in_progress", "pending", "done"];
const AGENT_ORDER = ["PM", "BA", "ARCH", "DEV", "QA"];
const DONE_STATUSES = new Set(["done", "complete", "example complete"]);
const IN_PROGRESS_STATUSES = new Set(["in_progress", "in progress"]);

// BK-354 F-1: agent-runtime run states (mirrors sdtk-agent-kit state-machine
// RUN_STATUS; wiki-kit stays decoupled from that kit — this is display only).
const RUN_TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
// Task/gate states that mean "a worker or a human gate currently owns this step".
const RUN_ACTIVE_TASK_STATUSES = new Set([
  "running",
  "running_external",
  "submitted",
  "waiting_external_evidence",
  "waiting_for_approval",
  "blocked",
]);

// Normalize agent identifier to canonical form (PM/BA/ARCH/DEV/QA)
function normalizeAgent(raw) {
  if (!raw) return null;
  const s = raw.replace(/[`*@]/g, "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("pm")) return "PM";
  if (s.startsWith("ba")) return "BA";
  if (s.startsWith("arch")) return "ARCH";
  if (s.startsWith("dev")) return "DEV";
  if (s.startsWith("qa")) return "QA";
  return null;
}

// BK-354 F-4: the phase label's first *word* token (alphabetic), skipping any
// leading numbered prefix so we never match on a bare digit. "1. PM Init" -> "pm".
// Returns "" when the label has no word token (guards against `"x".includes("")`
// being universally true, which was part of the over-matching bug surface).
function phaseWordToken(phaseKey) {
  const tokens = (phaseKey || "")
    .split(/[\s.]+/)
    .filter((t) => /[a-z]/i.test(t));
  return tokens.length ? tokens[0] : "";
}

// Whole-word (boundary-anchored) match, so a short phase token like "ba" does
// not match inside "database". Empty token never matches.
function wordMatch(haystack, token) {
  if (!token) return false;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:^|[^a-z0-9])" + esc + "(?:[^a-z0-9]|$)", "i").test(
    haystack || ""
  );
}

// Extract a header field matching **FieldName:** `value` or FieldName: value
function getHeaderField(text) {
  for (let i = 1; i < arguments.length; i++) {
    const fieldName = arguments[i];
    const patterns = [
      new RegExp("\\*\\*" + fieldName + "[:\\s]*\\*\\*\\s*[:`]?\\s*`?([^`\\n]+)`?", "i"),
      new RegExp("^\\s*\\*\\*" + fieldName + ":\\*\\*\\s+`?([^`\\n]+)`?", "im"),
      new RegExp("^\\s*" + fieldName + ":\\s+([^\\n]+)", "im"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return m[1].trim().replace(/`/g, "").replace(/\*\*/g, "");
    }
  }
  return null;
}

// Parse a markdown table block from an array of pipe-delimited lines.
// Returns { headerCols: string[], rows: string[][] }
function parseMarkdownTable(tableLines) {
  const rows = [];
  let headerCols = null;
  for (const line of tableLines) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = t.slice(1, t.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (headerCols === null) {
      headerCols = cells.map((c) =>
        c.replace(/\*\*/g, "").replace(/`/g, "").toLowerCase().trim()
      );
      continue;
    }
    if (cells.every((c) => /^[-: ]+$/.test(c) || c === "")) continue;
    rows.push(cells);
  }
  return { headerCols: headerCols || [], rows };
}

// Find the first table in text whose header columns match all required patterns.
function findTable(text, requiredColPatterns) {
  const allLines = text.split("\n");
  let i = 0;
  while (i < allLines.length) {
    const line = allLines[i].trim();
    if (!line.startsWith("|")) {
      i++;
      continue;
    }
    const tableLines = [];
    while (i < allLines.length && allLines[i].trim().startsWith("|")) {
      tableLines.push(allLines[i]);
      i++;
    }
    if (tableLines.length < 2) continue;
    const parsed = parseMarkdownTable(tableLines);
    const matches = requiredColPatterns.every((p) =>
      parsed.headerCols.some((h) => p.test(h))
    );
    if (matches) return parsed;
  }
  return null;
}

// Parse planning file header (featureKey, featureName, lastUpdated)
function parsePlanningHeader(text) {
  return {
    featureKey: getHeaderField(text, "Current Feature", "Feature key"),
    featureName: getHeaderField(text, "Feature Name"),
    lastUpdated: getHeaderField(text, "Last Updated"),
    pipelineStatus: getHeaderField(text, "Pipeline Status", "Status"),
  };
}

// Parse the pipeline status table into phase objects.
// Handles both canonical shape (8 cols) and simplified demo shape (5 cols).
function parsePipelinePhases(text) {
  const result = findTable(text, [/phase/, /status/]);
  if (!result) return [];
  const { headerCols, rows } = result;

  const phaseIdx = headerCols.findIndex((h) => h.includes("phase"));
  const statusIdx = headerCols.findIndex((h) => h.includes("status"));
  const ownerIdx = headerCols.findIndex((h) => h.includes("owner"));
  const artifactIdx = headerCols.findIndex(
    (h) => h.includes("artifact") || h.includes("output")
  );
  const notesIdx = headerCols.findIndex(
    (h) => h.includes("notes") || h.includes("blockers")
  );

  if (phaseIdx < 0 || statusIdx < 0) return [];

  const phases = [];
  for (const cells of rows) {
    const phase = (cells[phaseIdx] || "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim();
    const rawStatus = (cells[statusIdx] || "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim();
    const owner =
      ownerIdx >= 0 ? (cells[ownerIdx] || "").trim() : "";
    const artifact =
      artifactIdx >= 0
        ? (cells[artifactIdx] || "").replace(/`/g, "").trim()
        : "";
    const notes =
      notesIdx >= 0
        ? (cells[notesIdx] || "").replace(/\*\*/g, "").replace(/`/g, "").trim()
        : "";

    if (!phase || !rawStatus) continue;

    phases.push({
      phase,
      rawStatus,
      owner,
      artifact,
      notes,
      agent: normalizeAgent(owner),
    });
  }
  return phases;
}

// Extract blocker strings; returns [] if sentinel NO BLOCKERS or section absent.
function parseBlockers(text) {
  const m = text.match(
    /##\s+CURRENT BLOCKERS[^\n]*([\s\S]*?)(?=\n##\s+|$)/i
  );
  if (!m) return [];
  const section = m[1];
  if (section.includes("NO BLOCKERS")) return [];
  return section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "```" && !l.startsWith("#"));
}

// Extract OPEN open questions from the OQ table.
function parseOpenQuestions(text) {
  const result = findTable(text, [/q-id|^id$/, /status/]);
  if (!result) return [];
  const { headerCols, rows } = result;

  const idIdx = headerCols.findIndex((h) => h === "q-id" || h === "id");
  const statusIdx = headerCols.findIndex((h) => h.includes("status"));
  const ownerIdx = headerCols.findIndex((h) => h.includes("owner"));
  const summaryIdx = headerCols.findIndex((h) => h.includes("summary"));

  return rows
    .filter((cells) => {
      const st = (statusIdx >= 0 ? cells[statusIdx] || "" : "").trim().toUpperCase();
      return st.includes("OPEN");
    })
    .map((cells) => ({
      id: idIdx >= 0 ? (cells[idIdx] || "").trim() : "",
      status: (statusIdx >= 0 ? cells[statusIdx] || "" : "").trim(),
      owner: ownerIdx >= 0 ? (cells[ownerIdx] || "").trim() : "",
      summary: summaryIdx >= 0 ? (cells[summaryIdx] || "").trim() : "",
    }));
}

// Parse activity log lines for timestamps and @handoff hints.
function parseActivityEntries(text) {
  const re = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})[^|\n]*\|[^|\n]*\|[^|\n]*\|[^|\n]*?(\@\w+)?(?=\n|$)/g;
  const entries = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    entries.push({ ts: m[1].trim(), handoffNext: m[2] ? m[2].trim() : null });
  }
  return entries;
}

// Derive pipeline card column per spec §D4.
//
// BK-354 F-5: an open OQ must NOT override the column. Long-lived questions
// (pricing, brand) are normal and stay open for weeks; under the old rule any
// matched open OQ forced the phase to `pending`, so a COMPLETE phase with an
// owner-approved gate rendered as pending and the board looked frozen for the
// life of the OQ. Now the *status* decides the column and the OQ only raises
// the attention badge: done+OQ -> done (badge), in_progress+OQ -> in_progress
// (badge). A hard blocker or a done/gate trust mismatch is a genuine stop and
// still routes to `pending`.
function derivePipelineColumn(rawStatus, hasOpenOQ, hasBlocker, trustMismatch) {
  const s = rawStatus.toLowerCase();
  const isDone = DONE_STATUSES.has(s);
  const isInProgress = IN_PROGRESS_STATUSES.has(s);
  const attention = !!(hasOpenOQ || hasBlocker || trustMismatch);
  const hardStop = !!(hasBlocker || trustMismatch);

  if (isDone && !trustMismatch) {
    return { column: "done", attention };
  }
  if (hardStop) {
    return { column: "pending", attention: true };
  }
  if (isInProgress) {
    return { column: "in_progress", attention };
  }
  if (attention) {
    return { column: "pending", attention: true };
  }
  return { column: "todo", attention: false };
}

// Derive quality card column per spec §D4.
function deriveQualityColumn(checked, phaseHasBlocker, phaseHasOpenOQ, hasIssue, phaseStatus) {
  if (checked) return { column: "done", attention: false };
  if (phaseHasBlocker || phaseHasOpenOQ || hasIssue) {
    return { column: "pending", attention: true };
  }
  const s = (phaseStatus || "").toLowerCase();
  if (s === "in_progress" || s === "in progress") {
    return { column: "in_progress", attention: false };
  }
  return { column: "todo", attention: false };
}

// Derive agent from QUALITY_CHECKLIST.md phase section heading.
function deriveAgentFromPhaseName(name) {
  const u = name.toUpperCase();
  if (u.includes("PM") || u.includes("CLOSURE")) return "PM";
  if (u.includes("BA") || u.includes("BUSINESS ANALYSIS")) return "BA";
  if (u.includes("ARCH") || u.includes("ARCHITECTURE")) return "ARCH";
  if (u.includes("DEV") || u.includes("DEVELOPMENT") || u.includes("IMPLEMENTATION")) return "DEV";
  if (u.includes("QA") || u.includes("QUALITY")) return "QA";
  return "PM";
}

// Parse QUALITY_CHECKLIST.md into phase objects with criteria + gate rows.
function parseQualityCriteria(text) {
  const phases = [];
  const lines = text.split("\n");
  let currentPhase = null;

  for (const line of lines) {
    const phaseMatch = line.match(
      /^#{1,3}\s+PHASE\s+(\d+[+]?)[\s:]+(.+?)\s*(?:CHECKLIST)?\s*$/i
    );
    if (phaseMatch) {
      currentPhase = {
        phaseNum: phaseMatch[1],
        phaseName: phaseMatch[2].replace(/\(.*?\)/g, "").trim(),
        agent: deriveAgentFromPhaseName(phaseMatch[2]),
        criteria: [],
        gate: null,
      };
      phases.push(currentPhase);
      continue;
    }
    if (!currentPhase) continue;

    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (t.replace(/[\-:|]/g, "").trim() === "") continue;

    const cells = t
      .slice(1, t.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 3) continue;

    const numRaw = cells[0].replace(/\*\*/g, "").trim();
    if (!numRaw || numRaw === "#" || numRaw === "num") continue;

    const criteriaRaw = cells[1] || "";
    const statusRaw = cells[2] || "";
    const verifiedByRaw = cells[3] || "";
    const notesRaw = cells[4] || "";

    const criteria = criteriaRaw.replace(/\*\*/g, "").replace(/`/g, "").trim();
    if (!criteria) continue;

    const verifiedByClean = verifiedByRaw.replace(/\*\*/g, "").trim();
    const isGate = verifiedByClean.toLowerCase().includes("gate");

    const checked =
      statusRaw.includes("[x]") ||
      statusRaw.toLowerCase() === "done" ||
      statusRaw.toLowerCase() === "complete";

    const issue = notesRaw.replace(/\*\*/g, "").replace(/`/g, "").trim();
    const agent = normalizeAgent(verifiedByClean) || currentPhase.agent;

    const item = {
      criteria,
      checked,
      isGate,
      issue,
      agent,
      phaseNum: currentPhase.phaseNum,
      phaseName: currentPhase.phaseName,
    };

    if (isGate) {
      currentPhase.gate = item;
    } else {
      currentPhase.criteria.push(item);
    }
  }
  return phases;
}

// Fuzzy-match a phase name in a map to find the closest entry.
function findMatchingEntry(map, targetName) {
  const tn = targetName.toLowerCase().replace(/^\d+[+]?\.\s*/, "").replace(/\s*checklist\s*$/i, "").trim();
  for (const [key, val] of Object.entries(map)) {
    const k = key.replace(/^\d+[+]?\.\s*/, "").trim();
    const firstWord = tn.split(/\s+/)[0];
    if (k.includes(tn) || tn.includes(k) || k.startsWith(firstWord)) {
      return val;
    }
  }
  return null;
}

// BK-354 F-1: derive the read-only "Runs" lane view model from raw agent-runtime
// state.json objects. Pure — the caller performs the file I/O and passes the
// parsed states in. Display only: id, status, and the currently-owning task/gate.
// No writes, no dependency on sdtk-agent-kit.
function parseAgentRuns(rawStates) {
  const runs = [];
  for (const st of rawStates || []) {
    if (!st || !st.run_id) continue;
    const tasks = st.tasks && typeof st.tasks === "object" ? st.tasks : {};
    const taskList = Object.keys(tasks).map((k) => tasks[k]).filter(Boolean);
    // "Current" = the step a worker or human gate owns right now. Prefer a
    // waiting gate so a parked run reads "waiting: <gate>"; else the first
    // actively-owned task. Terminal runs have no current step.
    const current =
      taskList.find((t) => t.status === "waiting_for_approval") ||
      taskList.find((t) => RUN_ACTIVE_TASK_STATUSES.has(t.status)) ||
      null;
    runs.push({
      runId: st.run_id,
      featureKey: st.feature_key || null,
      goal: st.goal || null,
      workflowId: st.workflow_id || null,
      status: st.status || "unknown",
      terminal: RUN_TERMINAL_STATUSES.has(st.status),
      currentTaskId: current ? current.id || null : null,
      currentTaskType: current ? current.type || "task" : null,
      currentTaskStatus: current ? current.status || null : null,
      currentRole: current ? current.role || null : null,
      updatedAt: st.updated_at || null,
    });
  }
  // Active runs first, then most-recently-updated first (stable string compare).
  runs.sort((a, b) => {
    if (a.terminal !== b.terminal) return a.terminal ? 1 : -1;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  return runs;
}

// Main parser — pure, no I/O.
// Input: { planningText, qualityText, now: Date, sourceMtimeMs?, agentRunStates? }
//   sourceMtimeMs  — newest mtime (ms) of the source files; server-computed so the
//                    client never re-parses a timezone-naive stamp (BK-354 F/355b).
//   agentRunStates — raw state.json objects for the read-only Runs lane (F-1).
// Output: { meta, agents, pipeline: { cards }, quality: { cards }, runs }
function parseKanban({ planningText, qualityText, now, sourceMtimeMs, agentRunStates }) {
  const nowDate = now instanceof Date ? now : new Date();
  const errors = [];

  const meta = {
    featureKey: null,
    featureName: null,
    lastUpdated: null,
    generatedAt: nowDate.toISOString(),
    pipelinePresent: !!planningText,
    qualityPresent: !!qualityText,
    // BK-355b: server-computed staleness (minutes since the newest source-file
    // mtime). The client displays this verbatim instead of parsing the file's
    // timezone-naive "Last Updated" stamp in the browser's local zone (which
    // produced a constant multi-hour skew across timezones). null when unknown.
    staleMinutes:
      typeof sourceMtimeMs === "number" && isFinite(sourceMtimeMs)
        ? Math.max(0, Math.floor((nowDate.getTime() - sourceMtimeMs) / 60000))
        : null,
  };

  const pipeline = { cards: [] };
  const quality = { cards: [] };

  let phases = [];
  let blockers = [];
  let openQuestions = [];
  let activityEntries = [];

  // --- Parse SHARED_PLANNING.md ---
  if (planningText) {
    try {
      const header = parsePlanningHeader(planningText);
      meta.featureKey = header.featureKey;
      meta.featureName = header.featureName;
      meta.lastUpdated = header.lastUpdated;
      phases = parsePipelinePhases(planningText);
      blockers = parseBlockers(planningText);
      openQuestions = parseOpenQuestions(planningText);
      activityEntries = parseActivityEntries(planningText);
    } catch (e) {
      errors.push("planning parse error: " + e.message);
    }
  }

  // --- Parse QUALITY_CHECKLIST.md ---
  let qualityPhases = [];
  const qualityGateByPhaseName = {};

  if (qualityText) {
    try {
      const qHeader = parsePlanningHeader(qualityText);
      if (!meta.featureKey) meta.featureKey = qHeader.featureKey;
      if (!meta.lastUpdated) meta.lastUpdated = qHeader.lastUpdated;
      qualityPhases = parseQualityCriteria(qualityText);
      for (const qp of qualityPhases) {
        qualityGateByPhaseName[qp.phaseName.toLowerCase()] = qp.gate;
      }
    } catch (e) {
      errors.push("quality parse error: " + e.message);
    }
  }

  // --- Enrich pipeline phases with OQ/blocker flags ---
  const enrichedPhases = phases.map((phase) => {
    const phaseKey = phase.phase.toLowerCase();
    // BK-354 F-4: the phase's first *word* token, skipping a leading numbered
    // prefix ("1. PM Init" -> "pm"). The old code used the bare first token,
    // which for the scaffold's numbered labels was the digit "1" — so every OQ
    // id containing that digit (OQ-DT-01) matched and pinned all phases to
    // pending+attention. Never match on a bare digit.
    const phaseToken = phaseWordToken(phaseKey);
    const hasOpenOQ = openQuestions.some((oq) => {
      const oqAgent = normalizeAgent(oq.owner);
      // Explicit owner column is authoritative when both sides name an agent.
      if (oqAgent && phase.agent) {
        return oqAgent === phase.agent;
      }
      return (
        wordMatch((oq.id || "").toLowerCase(), phaseToken) ||
        wordMatch((oq.summary || "").toLowerCase(), phaseToken)
      );
    });
    const hasBlocker =
      blockers.length > 0 &&
      blockers.some((b) => {
        const bl = b.toLowerCase();
        return (
          (phase.agent && wordMatch(bl, phase.agent.toLowerCase())) ||
          wordMatch(bl, phaseToken)
        );
      });
    return { ...phase, hasOpenOQ, hasBlocker };
  });

  // --- Build pipeline cards ---
  for (const phase of enrichedPhases) {
    const phaseKey = phase.phase.toLowerCase();

    const matchedGate = findMatchingEntry(qualityGateByPhaseName, phaseKey);
    const statusLower = phase.rawStatus.toLowerCase();
    const isDone = DONE_STATUSES.has(statusLower);
    const trustMismatch =
      matchedGate !== null && isDone && matchedGate !== null && !matchedGate.checked;

    const { column, attention } = derivePipelineColumn(
      phase.rawStatus,
      phase.hasOpenOQ,
      phase.hasBlocker,
      trustMismatch
    );

    const agentLower = (phase.agent || "").toLowerCase();
    const relevantActivity = activityEntries.filter(
      (e) => e.handoffNext && e.handoffNext.toLowerCase().includes(agentLower)
    );
    const lastActivity =
      relevantActivity.length > 0
        ? relevantActivity[relevantActivity.length - 1]
        : activityEntries.length > 0
        ? activityEntries[activityEntries.length - 1]
        : null;

    pipeline.cards.push({
      id: "phase-" + phaseKey.replace(/[^a-z0-9]/g, "-"),
      title: phase.phase
        .replace(/^\*{0,2}\d+[+]?\.\s*\*{0,2}/, "")
        .replace(/\*\*/g, "")
        .trim(),
      agent: phase.agent || "OTHER",
      column,
      rawStatus: phase.rawStatus,
      owner: phase.owner,
      artifact: phase.artifact,
      notes: phase.notes,
      attention,
      lastUpdate: lastActivity ? lastActivity.ts : null,
      handoffNext: lastActivity ? lastActivity.handoffNext : null,
    });
  }

  // --- Build quality cards ---
  const phaseInfoByName = {};
  for (const p of enrichedPhases) {
    phaseInfoByName[p.phase.toLowerCase()] = {
      rawStatus: p.rawStatus,
      hasBlocker: p.hasBlocker,
      hasOpenOQ: p.hasOpenOQ,
    };
  }

  for (const qPhase of qualityPhases) {
    const phaseInfo = findMatchingEntry(phaseInfoByName, qPhase.phaseName);
    const phaseStatus = phaseInfo ? phaseInfo.rawStatus : "";
    const phaseHasBlocker = phaseInfo ? phaseInfo.hasBlocker : false;
    const phaseHasOpenOQ = phaseInfo ? phaseInfo.hasOpenOQ : false;

    const allItems = [
      ...qPhase.criteria,
      ...(qPhase.gate ? [qPhase.gate] : []),
    ];

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      // Issue is meaningful if it's not just an @-mention (those are handoff hints)
      const hasIssue =
        item.issue &&
        item.issue.length > 0 &&
        !item.issue.trim().startsWith("@");

      const { column, attention } = deriveQualityColumn(
        item.checked,
        phaseHasBlocker,
        phaseHasOpenOQ,
        hasIssue,
        phaseStatus
      );

      quality.cards.push({
        id: "q-" + qPhase.phaseNum + "-" + i,
        title: item.criteria,
        agent: item.agent || qPhase.agent || "OTHER",
        phase: qPhase.phaseName,
        column,
        checked: item.checked,
        isGate: item.isGate,
        issue: item.issue,
        attention,
      });
    }
  }

  // --- Derive agents list (canonical order first, extras appended) ---
  const seenAgents = new Set();
  for (const c of [...pipeline.cards, ...quality.cards]) {
    if (c.agent && c.agent !== "OTHER") seenAgents.add(c.agent);
  }
  const agents = AGENT_ORDER.filter((a) => seenAgents.has(a));
  for (const a of seenAgents) {
    if (!AGENT_ORDER.includes(a)) agents.push(a);
  }
  if (agents.length === 0) agents.push(...AGENT_ORDER);

  meta.errors = errors;
  const runs = parseAgentRuns(agentRunStates);
  return { meta, agents, pipeline, quality, runs };
}

module.exports = {
  parseKanban,
  parseAgentRuns,
  derivePipelineColumn,
  KANBAN_LIVENESS_MIN,
  COLUMNS,
  AGENT_ORDER,
};
