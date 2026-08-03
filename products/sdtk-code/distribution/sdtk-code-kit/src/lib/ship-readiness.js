"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Pure scorer — no fs, no git. All signals supplied by the caller.
// ---------------------------------------------------------------------------

const GATE_POINTS = {
  pass: 1.0,
  partial: 0.5,
  fail: 0,
  absent: 0,
};

function gateScore(gate) {
  const factor = GATE_POINTS[typeof gate === "string" ? gate : "absent"];
  return factor !== undefined ? factor : 0;
}

function codeVerifyPoints(verifyGates) {
  const gates = verifyGates && typeof verifyGates === "object" ? verifyGates : {};
  const spec = gateScore(gates.spec) * 10;
  const quality = gateScore(gates.quality) * 10;
  const evidence = gateScore(gates.evidence) * 10;
  return { spec, quality, evidence, total: spec + quality + evidence };
}

function codeVerifyNote(verifyGates) {
  const gates = verifyGates && typeof verifyGates === "object" ? verifyGates : {};
  const parts = [];
  for (const key of ["spec", "quality", "evidence"]) {
    const g = typeof gates[key] === "string" ? gates[key] : "absent";
    if (g !== "pass") {
      parts.push(`${key}:${g}`);
    }
  }
  return parts.length > 0 ? `non-pass gates: ${parts.join(", ")}` : "all gates pass";
}

function fileScopePoints(verdict) {
  if (verdict === "pass") return 10;
  if (verdict === "needs_human") return 5;
  return 0;
}

// Deterministic, component-based readiness scorer.
// signals === null triggers ENV_BLOCKED immediately.
// Components that are N/A (DESIGN when uiScope=false) are excluded from max.
function computeReadiness(signals) {
  if (signals === null || signals === undefined) {
    return {
      score: 0,
      max: 0,
      components: [],
      verdict: "ENV_BLOCKED",
      blockers: ["Signals could not be gathered — check project path and workflow artifacts."],
      warnings: [],
    };
  }

  const components = [];
  let score = 0;
  let max = 0;
  const blockers = [];
  const warnings = [];

  function addComponent(name, points, compMax, note) {
    components.push({ name, points, max: compMax, note: note || "" });
    score += points;
    max += compMax;
  }

  // 1. SPEC (15 pts) — hasCodeHandoff
  const hasCode = Boolean(signals.hasCodeHandoff);
  addComponent("SPEC", hasCode ? 15 : 0, 15, hasCode ? "CODE handoff present" : "CODE handoff not found");
  if (!hasCode) {
    warnings.push("CODE handoff not found — SPEC component scored 0.");
  }

  // 2. DESIGN (15 pts) — only when uiScope === true
  if (signals.uiScope === true) {
    const hasDesign = Boolean(signals.hasDesignHandoff);
    addComponent("DESIGN", hasDesign ? 15 : 0, 15, hasDesign ? "DESIGN handoff present" : "DESIGN handoff not found");
    if (!hasDesign) {
      warnings.push("DESIGN handoff not found — DESIGN component scored 0.");
    }
  }

  // 3. CODE_VERIFY (30 pts) — verifyGates spec(10) + quality(10) + evidence(10)
  const vg = signals.verifyGates && typeof signals.verifyGates === "object" ? signals.verifyGates : {};
  const cvPts = codeVerifyPoints(signals.verifyGates);
  addComponent("CODE_VERIFY", cvPts.total, 30, codeVerifyNote(signals.verifyGates));
  const evidenceGate = typeof vg.evidence === "string" ? vg.evidence : "absent";
  if (evidenceGate === "fail" || evidenceGate === "absent") {
    blockers.push(`CODE verification evidence missing or failed (evidence gate: ${evidenceGate}).`);
  }

  // 4. GUARDRAIL (15 pts) — denyCount===0 → full; any deny → 0 + blocker
  const guardrail = signals.guardrail && typeof signals.guardrail === "object" ? signals.guardrail : {};
  const denyCount = typeof guardrail.denyCount === "number" ? guardrail.denyCount : 0;
  const guardrailPts = denyCount === 0 ? 15 : 0;
  addComponent(
    "GUARDRAIL",
    guardrailPts,
    15,
    denyCount === 0 ? "no unresolved deny events" : `${denyCount} unresolved deny event(s)`
  );
  if (denyCount > 0) {
    blockers.push(`Unresolved guardrail deny events: ${denyCount}.`);
  }

  // 5. FILE_SCOPE (10 pts) — pass→10, needs_human→5+warning, fail→0+blocker, absent→0
  const fsObj = signals.fileScope && typeof signals.fileScope === "object" ? signals.fileScope : {};
  const fsVerdict = typeof fsObj.verdict === "string" ? fsObj.verdict : "absent";
  const fsPts = fileScopePoints(fsVerdict);
  addComponent(
    "FILE_SCOPE",
    fsPts,
    10,
    `file-scope verdict: ${fsVerdict}`
  );
  if (fsVerdict === "needs_human") {
    warnings.push("File-scope gate needs human review — partial credit only.");
  } else if (fsVerdict === "fail") {
    blockers.push("File-scope check failed — out-of-scope file edits detected.");
  }

  // 6. OPS (15 pts) — hasOpsHandoff
  const hasOps = Boolean(signals.hasOpsHandoff);
  addComponent("OPS", hasOps ? 15 : 0, 15, hasOps ? "OPS handoff present" : "OPS handoff evidence absent");
  if (!hasOps) {
    warnings.push("OPS handoff evidence absent — OPS component scored 0.");
  }

  // Verdict mapping (most-restrictive-wins, deterministic)
  let verdict;
  if (blockers.length > 0) {
    verdict = "FAIL";
  } else if (warnings.length > 0) {
    verdict = "PASS_WITH_NOTES";
  } else {
    verdict = "PASS";
  }

  return { score, max, components, verdict, blockers, warnings };
}

// ---------------------------------------------------------------------------
// Thin signal gatherer — reads fs artifacts; wraps exceptions → null.
// Not the test target; computeReadiness is the tested unit.
// ---------------------------------------------------------------------------

function parseGateField(verifyBlock, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = verifyBlock.match(new RegExp(`- ${escaped}: \`([^\\r\\n\`]+)\``));
  return match ? match[1] : null;
}

function extractVerifyBlock(text) {
  const match = text.match(/<!-- SDTK-CODE:VERIFY:START -->([\s\S]*?)<!-- SDTK-CODE:VERIFY:END -->/);
  return match ? match[1] : null;
}

function readAllEvents(eventsDir) {
  const events = [];
  let files;
  try {
    files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".jsonl"));
  } catch (_e) {
    return events;
  }
  for (const file of files) {
    const filePath = path.join(eventsDir, file);
    try {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line));
        } catch (_e) {
          // skip malformed line
        }
      }
    } catch (_e) {
      // skip unreadable file
    }
  }
  return events;
}

function gatherSignals(projectPath, featureKey) {
  try {
    const resolved = path.resolve(projectPath || ".");
    const signals = {};

    // SPEC handoff
    const codeHandoffPath = path.join(resolved, "docs", "dev", `CODE_HANDOFF_${featureKey}.json`);
    signals.hasCodeHandoff = fs.existsSync(codeHandoffPath);

    // OPS handoff
    const opsHandoffPath = path.join(resolved, "docs", "dev", `OPS_HANDOFF_${featureKey}.json`);
    signals.hasOpsHandoff = fs.existsSync(opsHandoffPath);

    // UI scope detection: check CODE_HANDOFF required_refs for docs/design/ entries
    signals.uiScope = false;
    signals.hasDesignHandoff = false;
    if (signals.hasCodeHandoff) {
      try {
        const codeHandoff = JSON.parse(fs.readFileSync(codeHandoffPath, "utf8"));
        if (Array.isArray(codeHandoff.required_refs)) {
          signals.uiScope = codeHandoff.required_refs.some(
            (r) => typeof r === "string" && r.startsWith("docs/design/")
          );
        }
      } catch (_e) {
        // ignore malformed CODE_HANDOFF for signal gathering
      }
    }
    if (signals.uiScope) {
      const designHandoffPath = path.join(resolved, "docs", "dev", `DESIGN_HANDOFF_${featureKey}.md`);
      signals.hasDesignHandoff = fs.existsSync(designHandoffPath);
    }

    // verifyGates from CODE_WORKFLOW artifact VERIFY block
    signals.verifyGates = { spec: "absent", quality: "absent", evidence: "absent" };
    const workflowPath = path.join(resolved, "docs", "dev", `CODE_WORKFLOW_${featureKey}.md`);
    if (fs.existsSync(workflowPath)) {
      try {
        const text = fs.readFileSync(workflowPath, "utf8");
        const verifyBlock = extractVerifyBlock(text);
        if (verifyBlock) {
          const specGate = parseGateField(verifyBlock, "Spec/compliance gate");
          const qualityGate = parseGateField(verifyBlock, "Quality gate");
          const evidenceGate = parseGateField(verifyBlock, "Evidence gate");
          if (specGate) signals.verifyGates.spec = specGate;
          if (qualityGate) signals.verifyGates.quality = qualityGate;
          if (evidenceGate) signals.verifyGates.evidence = evidenceGate;
        }
      } catch (_e) {
        // leave verifyGates as absent
      }
    }

    // Trust events: guardrail_check and file_scope_check
    signals.guardrail = { denyCount: 0, askCount: 0 };
    signals.fileScope = { verdict: "absent" };
    const eventsDir = path.join(resolved, ".sdtk", "trust", "events");
    if (fs.existsSync(eventsDir)) {
      const events = readAllEvents(eventsDir);
      let denyCount = 0;
      let infoCount = 0;
      const fileScopeEvents = [];
      for (const event of events) {
        if (event.event_type === "guardrail_check") {
          if (event.status === "blocked") denyCount++;
          else infoCount++;
        }
        if (event.event_type === "file_scope_check") {
          fileScopeEvents.push(event);
        }
      }
      signals.guardrail = { denyCount, askCount: infoCount };
      if (fileScopeEvents.length > 0) {
        const last = fileScopeEvents[fileScopeEvents.length - 1];
        let verdict = "pass";
        if (last.status === "blocked") verdict = "fail";
        else if (last.status === "needs_human") verdict = "needs_human";
        signals.fileScope = { verdict };
      }
    }

    return signals;
  } catch (_error) {
    // Any top-level read failure → null signals → ENV_BLOCKED in computeReadiness
    return null;
  }
}

module.exports = { computeReadiness, gatherSignals };
