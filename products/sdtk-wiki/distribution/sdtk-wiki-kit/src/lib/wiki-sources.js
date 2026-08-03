"use strict";

// BK-396 — the single list of file extensions SDTK-WIKI treats as a source.
//
// This exists because the list had already drifted once. BK-395 taught the
// BUILDER to index .docx/.xlsx/.pptx but left the STALENESS CHECK watching only
// `.md`, so dropping a new deck into a project made the graph stale without the
// warning that was built to say so — silently, on exactly the files the feature
// had just been added to ingest. One list, imported by both, so that class of
// drift cannot recur.
//
// Adding a format means adding it here AND teaching wiki-build how to read it.

const { OFFICE_EXTENSIONS } = require("./office-ingest");

// Read verbatim: already text, no conversion step.
const PLAIN_TEXT_EXTENSIONS = Object.freeze([".md", ".txt"]);

// Everything the builder will pick up and the staleness check must watch.
const INDEXABLE_EXTENSIONS = Object.freeze([
  ...PLAIN_TEXT_EXTENSIONS,
  ...OFFICE_EXTENSIONS,
]);

function isIndexableSource(name) {
  const lower = String(name || "").toLowerCase();
  return INDEXABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isPlainTextSource(name) {
  const lower = String(name || "").toLowerCase();
  return PLAIN_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

module.exports = {
  INDEXABLE_EXTENSIONS,
  PLAIN_TEXT_EXTENSIONS,
  isIndexableSource,
  isPlainTextSource,
};
