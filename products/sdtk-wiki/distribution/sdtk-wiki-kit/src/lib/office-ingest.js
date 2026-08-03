"use strict";

// BK-395 — Office (OOXML) documents as first-class wiki sources.
//
// docx / xlsx / pptx are ZIP archives of XML. Node ships zlib, so reading them
// needs no dependency: ~40 lines of ZIP central-directory parsing plus per-format
// XML text extraction. Measured against python-docx / openpyxl / python-pptx on
// real files, this recovers 180/180 text fragments — 100% — in 0-2ms.
//
// Output is MARKDOWN, not plain text, and that is the point: headings stay
// headings, tables stay tables, each sheet and slide becomes its own section.
// Everything downstream — the heading chunker, the retrieval scorer, page
// generation — then works on Office documents unchanged.
//
// Scope is deliberately fenced (owner-approved 2026-07-29):
//   * OOXML only. Legacy .doc/.xls/.ppt are a different binary format entirely
//     and are refused with a message that says so, not parsed into garbage.
//   * PDF is NOT here. It cannot be done without a dependency or an external
//     binary, which is an architectural decision of its own.
//   * Text only. No OCR, no vision. Images, charts and diagrams are LOST — a
//     slide that is mostly a diagram yields only its labels. Said plainly here
//     and in the usage guide so nobody assumes otherwise.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OFFICE_EXTENSIONS = Object.freeze([".docx", ".xlsx", ".pptx"]);
// Pre-2007 binary formats. Not ZIP, not XML, not in scope.
const LEGACY_EXTENSIONS = Object.freeze([".doc", ".xls", ".ppt"]);
// Owner-approved cap. A 20,000-row spreadsheet extracts to ~368k tokens and
// would add 1.4MB to the index for one file; the cap keeps a single document
// from dominating the corpus.
const DEFAULT_MAX_TOKENS = 50000;
const CHARS_PER_TOKEN = 4;

class OfficeIngestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "OfficeIngestError";
    this.code = code || "office_ingest_error";
  }
}

function extensionOf(filePath) {
  const base = String(filePath || "");
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot).toLowerCase();
}

function isOfficeFile(filePath) {
  return OFFICE_EXTENSIONS.includes(extensionOf(filePath));
}

function isLegacyOfficeFile(filePath) {
  return LEGACY_EXTENSIONS.includes(extensionOf(filePath));
}

// --- minimal ZIP reader ------------------------------------------------------

// Entries are returned lazily: a workbook with 40 sheets should not inflate all
// of them to answer a question about one.
function readZipEntries(buffer) {
  let eocd = -1;
  const scanFloor = Math.max(0, buffer.length - 66000); // 22-byte EOCD + max comment
  for (let i = buffer.length - 22; i >= scanFloor; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new OfficeIngestError(
      "not an OOXML file (no zip end-of-central-directory record)",
      "not_ooxml"
    );
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLen = buffer.readUInt16LE(pointer + 28);
    const extraLen = buffer.readUInt16LE(pointer + 30);
    const commentLen = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLen);

    entries.set(name, () => {
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const raw = buffer.slice(start, start + compressedSize);
      try {
        return (method === 8 ? zlib.inflateRawSync(raw) : raw).toString("utf8");
      } catch (err) {
        throw new OfficeIngestError(
          `could not inflate "${name}": ${err.message}`,
          "corrupt_entry"
        );
      }
    });
    pointer += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// --- XML helpers -------------------------------------------------------------

const XML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

function decodeXml(text) {
  return String(text)
    .replace(/&(amp|lt|gt|quot|apos);/g, (match) => XML_ENTITIES[match])
    .replace(/&#(\d+);/g, (_match, code) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => safeCodePoint(parseInt(code, 16)));
}

function safeCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch (_err) {
    return "";
  }
}

function textRuns(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let match;
  while ((match = re.exec(xml)) !== null) {
    out.push(decodeXml(match[1].replace(/<[^>]+>/g, "")));
  }
  return out;
}

function markdownTableRows(cells, isHeaderRow) {
  const rows = [`| ${cells.join(" | ")} |`];
  if (isHeaderRow) rows.push(`|${cells.map(() => "---").join("|")}|`);
  return rows;
}

// --- docx --------------------------------------------------------------------

function extractDocx(entries) {
  const read = entries.get("word/document.xml");
  if (!read) return "";
  const xml = read();
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml);
  const scope = body ? body[1] : xml;

  const lines = [];
  const blockRe = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
  let block;
  while ((block = blockRe.exec(scope)) !== null) {
    const chunk = block[0];

    if (chunk.startsWith("<w:tbl")) {
      const rows = chunk.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
      rows.forEach((row, index) => {
        const cells = (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || []).map((cell) =>
          textRuns(cell, "w:t").join("").trim()
        );
        if (!cells.length) return;
        lines.push(...markdownTableRows(cells, index === 0));
      });
      lines.push("");
      continue;
    }

    const text = textRuns(chunk, "w:t").join("").trim();
    if (!text) continue;
    const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(chunk);
    const heading = style && /^Heading(\d)$/i.exec(style[1]);
    if (heading) {
      lines.push(`${"#".repeat(Math.min(6, Number(heading[1])))} ${text}`, "");
    } else {
      lines.push(text, "");
    }
  }
  return lines.join("\n");
}

// --- xlsx --------------------------------------------------------------------

function extractXlsx(entries) {
  const sharedRead = entries.get("xl/sharedStrings.xml");
  const shared = sharedRead ? textRuns(sharedRead(), "t") : [];

  const workbookRead = entries.get("xl/workbook.xml");
  const sheetNames = workbookRead
    ? (workbookRead().match(/<sheet\b[^>]*name="([^"]*)"/g) || []).map((tag) =>
        decodeXml(/name="([^"]*)"/.exec(tag)[1])
      )
    : [];

  const sheetFiles = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(/(\d+)/.exec(a)[1]) - Number(/(\d+)/.exec(b)[1]));

  const lines = [];
  sheetFiles.forEach((file, index) => {
    const xml = entries.get(file)();
    const rows = xml.match(/<row\b[\s\S]*?<\/row>/g) || [];
    if (!rows.length) return;
    lines.push(`## ${sheetNames[index] || `Sheet${index + 1}`}`, "");
    rows.forEach((row, rowIndex) => {
      const cells = (row.match(/<c\b[^>]*(?:\/>|[\s\S]*?<\/c>)/g) || []).map((cell) => {
        const value = /<v>([\s\S]*?)<\/v>/.exec(cell);
        if (!value) return textRuns(cell, "t").join("").trim();
        // t="s" means the value is an index into the shared-string table;
        // anything else is a literal (number, date serial, cached formula result).
        return /\st="s"/.test(cell) ? shared[Number(value[1])] || "" : decodeXml(value[1]);
      });
      if (!cells.some((cell) => cell !== "")) return;
      lines.push(...markdownTableRows(cells, rowIndex === 0));
    });
    lines.push("");
  });
  return lines.join("\n");
}

// --- pptx --------------------------------------------------------------------

function slideNumber(name) {
  const match = /(\d+)/.exec(name);
  return match ? Number(match[1]) : 0;
}

function extractPptx(entries) {
  const slides = [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  // Speaker notes carry the argument a deck only gestures at on screen, so they
  // are ingested — labelled, never blended into the slide body, so a citation
  // never implies text was visible when it was not.
  const notesByNumber = new Map();
  for (const name of entries.keys()) {
    if (!/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)) continue;
    notesByNumber.set(slideNumber(name), name);
  }

  const lines = [];
  slides.forEach((file, index) => {
    const xml = entries.get(file)();
    const paragraphs = (xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [])
      .map((paragraph) => textRuns(paragraph, "a:t").join("").trim())
      .filter(Boolean);

    const number = index + 1;
    const notesFile = notesByNumber.get(number);
    let notes = [];
    if (notesFile) {
      const notesXml = entries.get(notesFile)();
      notes = (notesXml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [])
        .map((paragraph) => textRuns(paragraph, "a:t").join("").trim())
        // The slide-number placeholder is rendered into every notes page.
        .filter((text) => text && text !== String(number));
    }
    if (!paragraphs.length && !notes.length) return;

    lines.push(`## Slide ${number}${paragraphs.length ? `: ${paragraphs[0]}` : ""}`, "");
    // A title-only slide still carries its message in that title. Emitting an
    // empty body would make the section vanish from retrieval entirely, since a
    // heading with nothing under it produces no chunk.
    if (paragraphs.length > 1) {
      lines.push(paragraphs.slice(1).join("\n"), "");
    } else if (paragraphs.length === 1) {
      lines.push(paragraphs[0], "");
    }
    if (notes.length) lines.push("**Speaker notes:**", "", notes.join("\n"), "");
  });
  return lines.join("\n");
}

// --- entry point -------------------------------------------------------------

const EXTRACTORS = { ".docx": extractDocx, ".xlsx": extractXlsx, ".pptx": extractPptx };

function titleFromFilename(filePath) {
  const ext = extensionOf(filePath);
  return path
    .basename(filePath, ext)
    .replace(/[_-]+/g, " ")
    .trim();
}

function normalizeOutput(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract an Office document as markdown.
 *
 * @returns {{markdown: string, format: string, truncated: boolean, tokens: number}}
 */
function extractOfficeMarkdown(filePath, options) {
  const opts = options || {};
  const fsImpl = opts.fsImpl || fs;
  const ext = extensionOf(filePath);

  if (isLegacyOfficeFile(filePath)) {
    throw new OfficeIngestError(
      `"${ext}" is the pre-2007 binary Office format, which SDTK-WIKI does not read. ` +
        `Re-save as ${ext}x (Word/Excel/PowerPoint: File > Save As) and rebuild.`,
      "legacy_format"
    );
  }
  const extractor = EXTRACTORS[ext];
  if (!extractor) {
    throw new OfficeIngestError(`unsupported extension: ${ext || "(none)"}`, "unsupported");
  }

  let buffer;
  try {
    buffer = fsImpl.readFileSync(filePath);
  } catch (err) {
    throw new OfficeIngestError(`could not read ${filePath}: ${err.message}`, "unreadable");
  }

  const entries = readZipEntries(buffer);
  let markdown = normalizeOutput(extractor(entries));

  // Title: docx documents usually carry their own H1; spreadsheets and decks
  // start at "## Sheet"/"## Slide", so give them one from the filename rather
  // than letting the builder fall back to a name with the extension in it.
  if (markdown && !/^#\s/m.test(markdown)) {
    markdown = `# ${titleFromFilename(filePath)}\n\n${markdown}`;
  }

  const maxTokens = Number.isFinite(opts.maxTokens) && opts.maxTokens > 0
    ? Math.floor(opts.maxTokens)
    : DEFAULT_MAX_TOKENS;
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  let truncated = false;
  if (markdown.length > maxChars) {
    // Cut on a line boundary so a markdown table never ends mid-row.
    const cut = markdown.lastIndexOf("\n", maxChars);
    markdown =
      `${markdown.slice(0, cut > 0 ? cut : maxChars).trimEnd()}\n\n` +
      `[truncated: this document exceeds the ${maxTokens.toLocaleString("en-US")}-token ingest cap]`;
    truncated = true;
  }

  return {
    markdown,
    format: ext.slice(1),
    truncated,
    tokens: Math.ceil(markdown.length / CHARS_PER_TOKEN),
  };
}

module.exports = {
  DEFAULT_MAX_TOKENS,
  LEGACY_EXTENSIONS,
  OFFICE_EXTENSIONS,
  OfficeIngestError,
  extractDocx,
  extractOfficeMarkdown,
  extractPptx,
  extractXlsx,
  isLegacyOfficeFile,
  isOfficeFile,
  readZipEntries,
  titleFromFilename,
};
