"use strict";

// BK-393 — section-level chunking for Ask source selection.
//
// Why this exists: `buildSources` used to hand the model whole documents. On the
// SDTK maintainer corpus that meant a single source could be 112k tokens
// (`governance/ai/core/IMPROVEMENT_BACKLOG.md`, one 449KB markdown table) and a
// 6-source answer could exceed 170k tokens — larger than most context windows,
// for a question a 1.7k-token grep answers. Splitting on markdown headings gives
// the same recall (measured: unchanged within noise on two 60-question
// known-item sets) at a fraction of the payload, and lets Ask carry a HARD
// upper bound: maxSources x maxSourceTokens.
//
// Pure and deterministic: no filesystem, no network, no model. The index already
// stores `headings` per document, so this only formalizes a split the builder
// had implicitly identified.

const DEFAULT_MAX_SOURCE_TOKENS = 800;

// Same 4-chars-per-token approximation `wiki-context-pack.js` uses for its
// budget. It only has to be stable and roughly right — it bounds a payload, it
// is not billed against anything.
function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function isTableRow(line) {
  return /^\s*\|/.test(line || "");
}

function isTableDivider(line) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line || "");
}

// Split markdown on ATX headings. Text before the first heading becomes a
// leading section with an empty heading, so a document with no headings at all
// still yields exactly one section (and never disappears from retrieval).
function splitSections(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections = [];
  let current = { heading: "", level: 0, lines: [] };

  const flush = () => {
    const text = current.lines.join("\n").trim();
    if (text || current.heading) {
      sections.push({ heading: current.heading, level: current.level, text });
    }
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      flush();
      current = { heading: match[2].trim(), level: match[1].length, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return sections;
}

// Enforce the cap on a single section. Paragraph boundaries first, then line
// boundaries (a 449KB markdown table has 8 blank lines and 407 rows — paragraph
// splitting alone leaves it whole), then a hard character slice so the cap is
// a guarantee rather than a preference.
//
// Every piece carries its own heading line, and when the section opens with a
// markdown table its header + divider rows repeat too. A retrieved fragment
// that has lost its heading — or a table row that has lost its column names —
// is not readable by a human or a model, and cannot be cited precisely.
// Both prefixes are charged against the cap, so the cap stays a guarantee.
function capSection(section, maxChars) {
  const cap = Math.max(1, Number(maxChars) || DEFAULT_MAX_SOURCE_TOKENS * 4);
  const text = String((section && section.text) || "").trim();
  const heading = (section && section.heading) || "";
  const level = (section && section.level) || 0;
  if (!text) {
    return [];
  }

  const headingLine = heading ? `${"#".repeat(Math.max(1, level || 2))} ${heading}\n\n` : "";
  if (headingLine.length + text.length <= cap) {
    return [{ heading, level, text: `${headingLine}${text}`, part: 1 }];
  }

  const lines = text.split("\n");
  const tableHeader =
    isTableRow(lines[0]) && isTableDivider(lines[1]) ? `${lines[0]}\n${lines[1]}\n` : "";

  const pieces = [];
  const prefixFor = (isContinuation) => headingLine + (isContinuation ? tableHeader : "");
  const push = (body) => {
    const trimmed = String(body || "").trim();
    if (!trimmed) return;
    pieces.push({
      heading,
      level,
      text: `${prefixFor(pieces.length > 0)}${trimmed}`,
      part: pieces.length + 1,
    });
  };

  // Worst-case prefix, so no piece can overflow once a prefix is attached.
  const room = Math.max(1, cap - prefixFor(true).length);
  const units = text.includes("\n\n")
    ? text.split(/\n{2,}/).map((part) => `${part}\n\n`)
    : lines.map((line) => `${line}\n`);

  let buffer = "";
  for (const unit of units) {
    if (unit.length > room) {
      push(buffer);
      buffer = "";
      for (let offset = 0; offset < unit.length; offset += room) {
        push(unit.slice(offset, offset + room));
      }
      continue;
    }
    if (buffer.length + unit.length > room) {
      push(buffer);
      buffer = "";
    }
    buffer += unit;
  }
  push(buffer);

  const total = pieces.length;
  return pieces.map((piece) => ({ ...piece, partCount: total }));
}

// Split one document's body into capped chunks, each carrying enough provenance
// for a citation to name the section it came from.
function chunkDocument(text, options) {
  const opts = options || {};
  const maxTokens = Number.isFinite(opts.maxSourceTokens) && opts.maxSourceTokens > 0
    ? Math.floor(opts.maxSourceTokens)
    : DEFAULT_MAX_SOURCE_TOKENS;
  const cap = maxTokens * 4;

  const chunks = [];
  for (const section of splitSections(text)) {
    for (const piece of capSection(section, cap)) {
      chunks.push({
        heading: piece.heading,
        level: piece.level,
        text: piece.text,
        part: piece.part,
        partCount: piece.partCount || 1,
        tokens: estimateTokens(piece.text),
      });
    }
  }
  return chunks;
}

// Human-readable pointer for a chunk, used in citations and in the source
// header the model sees: "Section 2. Method" / "Section 2. Method (part 2/9)".
function describeChunk(chunk) {
  if (!chunk) return "";
  const heading = String(chunk.heading || "").trim();
  const base = heading ? `Section ${heading}` : "Opening section";
  if (chunk.partCount && chunk.partCount > 1) {
    return `${base} (part ${chunk.part}/${chunk.partCount})`;
  }
  return base;
}

module.exports = {
  DEFAULT_MAX_SOURCE_TOKENS,
  capSection,
  chunkDocument,
  describeChunk,
  estimateTokens,
  splitSections,
};
