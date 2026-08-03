"use strict";

// BK-279 — compile annotation marks from the wiki viewer's Design tab into a
// docs/design/feedback/DESIGN_FEEDBACK_<ts>.md file (schema sdtk.design.feedback.v1).
//
// This is a local port of sdtk-design-kit's design-server.js compileFeedbackMarkdown
// (element + pod marks only — the wiki Design tab does not do token sliders). It is
// duplicated here ON PURPOSE: the wiki server must never require() the design-kit at
// runtime (kits stay decoupled / independently versioned). A test asserts the two
// compilers produce identical output for the same element/pod marks so they cannot
// drift silently.

const HARD_SCOPE_PREAMBLE =
  "Hard scope: change ONLY the elements identified below by screen / selector / stable-id / position. " +
  "Do NOT modify sibling screens, parent layout, global CSS, design tokens, or unrelated rules even if you " +
  "notice issues there — surface those as a follow-up note instead of editing them. If a request cannot be " +
  "satisfied without touching outside this scope, ask the user before proceeding.";

function trimText(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizePosition(input) {
  const finite = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
  const pos = input || {};
  return { x: finite(pos.x), y: finite(pos.y), width: finite(pos.width), height: finite(pos.height) };
}

function formatComputedStyle(style) {
  if (!style || typeof style !== "object") return "";
  return Object.keys(style)
    .map((key) => {
      const value = style[key];
      return value ? `${key}: ${trimText(value, 80)}` : null;
    })
    .filter(Boolean)
    .join("; ");
}

function renderTargetLines(target, indent = "") {
  const t = target || {};
  const pos = normalizePosition(t.position);
  return [
    `${indent}selector: ${trimText(t.selector, 200) || "(none)"}`,
    `${indent}label: ${trimText(t.label, 120) || "(unlabeled)"}`,
    `${indent}position: x${pos.x} y${pos.y} ${pos.width}x${pos.height}`,
    `${indent}currentText: ${trimText(t.currentText, 160) || "(empty)"}`,
    `${indent}htmlHint: ${trimText(t.htmlHint, 200) || "(none)"}`,
    `${indent}computedStyle: ${formatComputedStyle(t.computedStyle) || "(none)"}`,
  ];
}

function compileFeedbackMarkdown(marks, options = {}) {
  const list = Array.isArray(marks) ? marks : [];
  const generatedAt = options.generatedAt || new Date().toISOString();
  const manifestRelPath = options.manifestRelPath || "docs/design/prototype/.manifest.json";

  const out = [];
  out.push("---");
  out.push("schema: sdtk.design.feedback.v1");
  out.push(`generatedAt: ${generatedAt}`);
  out.push(`prototypeManifest: ${manifestRelPath}`);
  out.push(`markCount: ${list.length}`);
  out.push("---");
  out.push("");
  out.push("<attached-preview-comments>");
  out.push(HARD_SCOPE_PREAMBLE);

  list.forEach((mark, index) => {
    const kind = mark && mark.kind === "pod" ? "pod" : "element";
    const screenId = trimText(mark && mark.screenId, 120) || "(unknown-screen)";
    const stableId =
      trimText(mark && mark.target && mark.target.stableId, 200) ||
      trimText(mark && mark.stableId, 200) ||
      `mark-${index + 1}`;
    out.push("");
    out.push(`${index + 1}. ${stableId}`);
    out.push(`   targetKind: ${kind}`);
    out.push(`   screen: ${screenId}  (file: docs/design/prototype/screens/${screenId}.html)`);
    if (kind === "pod") {
      const members = Array.isArray(mark.members) ? mark.members : [];
      out.push(`   memberCount: ${members.length}`);
      members.slice(0, 12).forEach((member, mi) => {
        const mStable = trimText(member && member.stableId, 200) || `member-${mi + 1}`;
        out.push(`   member.${mi + 1}: ${mStable}`);
        renderTargetLines(member, "     ").forEach((line) => out.push(line));
      });
    } else {
      renderTargetLines(mark && mark.target, "   ").forEach((line) => out.push(line));
    }
    const note = trimText(mark && mark.note, 600);
    out.push(`   comment: ${note || "(no note — see target)"}`);
  });

  out.push("</attached-preview-comments>");
  out.push("");
  return out.join("\n");
}

function feedbackStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

module.exports = {
  HARD_SCOPE_PREAMBLE,
  compileFeedbackMarkdown,
  feedbackStamp,
};
