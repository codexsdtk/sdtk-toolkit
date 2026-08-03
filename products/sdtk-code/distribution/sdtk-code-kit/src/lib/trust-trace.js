"use strict";

const fs = require("fs");
const path = require("path");
const { eventsDir } = require("./trust-events");

function compareTimestamp(left, right) {
  return String(left.timestamp || "").localeCompare(String(right.timestamp || ""));
}

function normalizeEvent(event) {
  return event && typeof event === "object" ? event : {};
}

function phaseName(event) {
  return typeof event.phase === "string" && event.phase.length > 0 ? event.phase : "ungrouped";
}

function isFailure(event) {
  return event.status === "fail";
}

function isBlocked(event) {
  return event.status === "blocked";
}

function isDecisionGate(event) {
  if (event.event_type === "file_scope_check" && event.status === "fail") {
    return true;
  }
  if (event.event_type === "guardrail_check" && (event.status === "fail" || event.status === "blocked" || event.decision === "deny")) {
    return true;
  }
  return false;
}

function loadEvents(projectPath, opts = {}) {
  const dir = eventsDir(projectPath);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .filter((name) => !opts.date || name === `${opts.date}.jsonl`)
    .sort();

  const events = [];
  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const event = JSON.parse(line);
        if (event && typeof event === "object") {
          events.push(event);
        }
      } catch (_error) {
        // Trust trace replay is resilient: malformed JSONL lines are skipped.
      }
    }
  }
  return events.sort(compareTimestamp);
}

function buildTrace(events) {
  const sorted = Array.isArray(events) ? events.map(normalizeEvent).slice().sort(compareTimestamp) : [];
  const phaseMap = new Map();
  const sourceEventIds = [];
  let failures = 0;
  let blocked = 0;
  let decisionGates = 0;

  for (const event of sorted) {
    const phase = phaseName(event);
    if (!phaseMap.has(phase)) {
      phaseMap.set(phase, { phase, events: [], failures: 0, blocked: 0, decisionGates: 0 });
    }

    const group = phaseMap.get(phase);
    group.events.push(Object.assign({}, event));
    if (typeof event.event_id === "string") {
      sourceEventIds.push(event.event_id);
    }
    if (isFailure(event)) {
      failures += 1;
      group.failures += 1;
    }
    if (isBlocked(event)) {
      blocked += 1;
      group.blocked += 1;
    }
    if (isDecisionGate(event)) {
      decisionGates += 1;
      group.decisionGates += 1;
    }
  }

  return {
    phases: Array.from(phaseMap.values()),
    totals: {
      events: sorted.length,
      failures,
      blocked,
      decisionGates,
    },
    sourceEventIds,
  };
}

function commandText(event) {
  if (typeof event.command === "string" && event.command.length > 0) {
    return event.command;
  }
  return "(no command recorded)";
}

function renderTraceMarkdown(trace, meta = {}) {
  const title = meta.title || `Trust Trace ${meta.featureKey || ""}`.trim() || "Trust Trace";
  const lines = [
    `# ${title}`,
    "",
    "Replay mode: reconstruction only. This report does not re-run commands and does not mutate events.",
    "",
    "## Summary",
    "",
    `- Events: ${trace.totals.events}`,
    `- Failures: ${trace.totals.failures}`,
    `- Blocked: ${trace.totals.blocked}`,
    `- Decision gates: ${trace.totals.decisionGates}`,
    "",
    "## Source Event IDs",
    "",
  ];

  if (trace.sourceEventIds.length === 0) {
    lines.push("- None");
  } else {
    for (const id of trace.sourceEventIds) {
      lines.push(`- \`${id}\``);
    }
  }

  for (const phase of trace.phases) {
    lines.push("", `## Phase: ${phase.phase}`, "", `- Events: ${phase.events.length}`, `- Failures: ${phase.failures}`, `- Blocked: ${phase.blocked}`, `- Decision gates: ${phase.decisionGates}`, "");

    for (const event of phase.events) {
      const gate = isDecisionGate(event) ? " Decision Gate" : "";
      const eventId = event.event_id || "missing-event-id";
      const timestamp = event.timestamp || "unknown-time";
      const type = event.event_type || "unknown";
      const status = event.status || "info";
      lines.push(`- ${timestamp} - ${status} - ${type}${gate} - \`${eventId}\``);
      lines.push(`  - Command: ${commandText(event)}`);
      if (Array.isArray(event.files) && event.files.length > 0) {
        lines.push(`  - Files: ${event.files.join(", ")}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function writeTraceReport(projectPath, featureKey) {
  const project = path.resolve(projectPath || ".");
  const events = loadEvents(project);
  const trace = buildTrace(events);
  const markdown = renderTraceMarkdown(trace, { featureKey, title: `Trust Trace ${featureKey}` });
  const reportDir = path.join(project, "docs", "trust");
  const reportPath = path.join(reportDir, `TRUST_TRACE_${featureKey}.md`);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, markdown, "utf8");
  return { path: reportPath, events: trace.totals.events, trace };
}

module.exports = { loadEvents, buildTrace, renderTraceMarkdown, writeTraceReport };
