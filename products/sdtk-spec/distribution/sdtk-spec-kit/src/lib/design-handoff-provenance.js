"use strict";

const fs = require("fs");
const path = require("path");

const PROVENANCE_VIOLATION = "PROVENANCE_VIOLATION";
const MIN_SOURCE_QUOTE_CODE_POINTS = 30;

function stripUtf8Bom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function readSourceText(sourcePath) {
  return normalizeNewlines(stripUtf8Bom(fs.readFileSync(sourcePath, "utf8")));
}

function codePointLength(value) {
  return Array.from(value).length;
}

function normalizedSampleName(value) {
  return String(value || "")
    .replace(/\.[^.\\/]+$/u, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function extractScreens(handoff) {
  if (!handoff || typeof handoff !== "object") {
    return [];
  }
  if (Array.isArray(handoff.screens)) {
    return handoff.screens;
  }
  if (Array.isArray(handoff.screen_inventory)) {
    return handoff.screen_inventory;
  }
  if (handoff.handoff && Array.isArray(handoff.handoff.screens)) {
    return handoff.handoff.screens;
  }
  if (handoff.design && Array.isArray(handoff.design.screens)) {
    return handoff.design.screens;
  }
  return [];
}

function addViolation(violations, screenRef, field, message) {
  violations.push({
    code: PROVENANCE_VIOLATION,
    screen: screenRef,
    field,
    message,
  });
}

function validateLineRange(sourceLines, quote, lineRange) {
  if (!Array.isArray(lineRange) || lineRange.length !== 2) {
    return "source_line_range must be [start_line, end_line].";
  }

  const [startLine, endLine] = lineRange;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return "source_line_range values must be integers.";
  }
  if (startLine < 1 || endLine < 1 || startLine > endLine || endLine > sourceLines.length) {
    return `source_line_range must be within source bounds 1..${sourceLines.length}.`;
  }

  const selectedText = sourceLines.slice(startLine - 1, endLine).join("\n");
  if (!selectedText.includes(quote)) {
    return "source_quote must appear within the declared source_line_range.";
  }
  return null;
}

function validateDesignHandoffProvenance(options) {
  const handoffPath = options && options.handoffPath;
  const sourcePath = options && options.sourcePath;
  const sampleNames = options && Array.isArray(options.sampleNames) ? options.sampleNames : [];

  const violations = [];
  if (!handoffPath || !fs.existsSync(handoffPath)) {
    addViolation(violations, "(handoff)", "handoffPath", `Handoff JSON does not exist: ${handoffPath || ""}`);
    return { ok: false, code: PROVENANCE_VIOLATION, violations };
  }
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    addViolation(violations, "(source)", "sourcePath", `Requirement source does not exist: ${sourcePath || ""}`);
    return { ok: false, code: PROVENANCE_VIOLATION, violations };
  }

  let handoff;
  try {
    handoff = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
  } catch (error) {
    addViolation(violations, "(handoff)", "json", `Handoff JSON is invalid: ${error.message}`);
    return { ok: false, code: PROVENANCE_VIOLATION, violations };
  }

  const sourceText = readSourceText(sourcePath);
  const sourceLines = sourceText.split("\n");
  const screens = extractScreens(handoff);
  const normalizedSamples = new Set(sampleNames.map(normalizedSampleName).filter(Boolean));

  if (screens.length === 0) {
    addViolation(violations, "(handoff)", "screens", "Handoff must include at least one screen.");
  }

  screens.forEach((screen, index) => {
    const screenRef = screen && (screen.id || screen.title) ? screen.id || screen.title : `screens[${index}]`;
    const id = screen && typeof screen.id === "string" ? screen.id.trim() : "";
    const title = screen && typeof screen.title === "string" ? screen.title.trim() : "";
    const quote = screen && typeof screen.source_quote === "string" ? normalizeNewlines(screen.source_quote) : "";
    const lineRange = screen && screen.source_line_range;

    if (!id) {
      addViolation(violations, screenRef, "id", "Screen id is required.");
    }
    if (!title) {
      addViolation(violations, screenRef, "title", "Screen title is required.");
    }
    if (!quote) {
      addViolation(violations, screenRef, "source_quote", "source_quote is required.");
    } else {
      if (codePointLength(quote) < MIN_SOURCE_QUOTE_CODE_POINTS) {
        addViolation(
          violations,
          screenRef,
          "source_quote",
          `source_quote must be at least ${MIN_SOURCE_QUOTE_CODE_POINTS} Unicode code points.`
        );
      }
      if (!sourceText.includes(quote)) {
        addViolation(violations, screenRef, "source_quote", "source_quote must exist literally in the requirement source.");
      }
      const lineRangeError = validateLineRange(sourceLines, quote, lineRange);
      if (lineRangeError) {
        addViolation(violations, screenRef, "source_line_range", lineRangeError);
      }
    }

    for (const candidate of [id, title]) {
      const normalized = normalizedSampleName(candidate);
      if (normalized && normalizedSamples.has(normalized)) {
        addViolation(
          violations,
          screenRef,
          "title",
          "Screen id/title matches an explicit sample filename/name supplied for post-generation evaluation."
        );
      }
    }
  });

  return {
    ok: violations.length === 0,
    code: violations.length === 0 ? "OK" : PROVENANCE_VIOLATION,
    handoffPath: path.resolve(handoffPath),
    sourcePath: path.resolve(sourcePath),
    screenCount: screens.length,
    violations,
  };
}

function assertValidDesignHandoffProvenance(options) {
  const result = validateDesignHandoffProvenance(options);
  if (!result.ok) {
    const details = result.violations.map((item) => `${item.screen} ${item.field}: ${item.message}`).join("; ");
    const error = new Error(`${PROVENANCE_VIOLATION}: ${details}`);
    error.code = PROVENANCE_VIOLATION;
    error.result = result;
    throw error;
  }
  return result;
}

module.exports = {
  PROVENANCE_VIOLATION,
  MIN_SOURCE_QUOTE_CODE_POINTS,
  validateDesignHandoffProvenance,
  assertValidDesignHandoffProvenance,
  normalizedSampleName,
};
