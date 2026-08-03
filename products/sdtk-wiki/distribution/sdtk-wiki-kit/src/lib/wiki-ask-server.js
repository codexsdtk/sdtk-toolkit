"use strict";

// Open-source (free edition) stub for the SDTK-WIKI Ask viewer endpoints.
//
// In the full SDTK suite, `sdtk-wiki atlas open` serves an in-browser Ask panel
// backed by a grounded question-answering runtime. That runtime is a paid
// capability and is not bundled in the open-source distribution.
//
// This stub keeps the local Atlas graph/docs viewer fully functional. The
// viewer's Ask endpoints resolve to a clean "not available in the open-source
// edition" response instead of importing any gated runtime, so the free viewer
// has no dependency on the paid runtime while still serving the graph and docs.
//
// See https://sdtk.dev for the full suite.

const DEFAULT_MAX_SOURCES = 6;
const MAX_BODY_BYTES = 1024 * 1024;

const NOT_AVAILABLE_MESSAGE =
  "SDTK-WIKI Ask is a paid capability and is not available in the open-source edition. " +
  "See https://sdtk.dev for the full suite.";

function healthPayload(_ctx) {
  return {
    ok: false,
    available: false,
    edition: "open-source",
    reason: NOT_AVAILABLE_MESSAGE,
  };
}

function readAskHistory(_graphPath, _limit) {
  return {
    ok: false,
    available: false,
    entries: [],
    reason: NOT_AVAILABLE_MESSAGE,
  };
}

async function answerForViewer(_payload, _ctx, _deps) {
  return {
    ok: false,
    available: false,
    error: NOT_AVAILABLE_MESSAGE,
    code: "not_available",
  };
}

module.exports = {
  DEFAULT_MAX_SOURCES,
  MAX_BODY_BYTES,
  answerForViewer,
  healthPayload,
  readAskHistory,
};
