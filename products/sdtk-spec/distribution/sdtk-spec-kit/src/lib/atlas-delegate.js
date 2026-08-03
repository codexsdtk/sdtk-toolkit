"use strict";

const path = require("path");
const { ValidationError } = require("./errors");

// BK-347: sdtk-wiki owns the graph builder. sdtk-spec keeps the R1 "atlas"
// namespace as a compatibility entry point and forwards every invocation to
// sdtk-wiki, which does the same job in pure Node — no interpreter prerequisite.
//
// The two flag surfaces are identical (project-path / output-dir / scan-root /
// force / no-build / no-open / host / port / verbose), so args forward verbatim
// and no translation layer exists to drift.
const WIKI_PKG = "sdtk-wiki-kit";
const WIKI_BIN = "sdtk-wiki";

const SUBCOMMAND_ARGV = {
  init: ["init"],
  build: ["atlas", "build"],
  open: ["atlas", "open"],
  watch: ["atlas", "watch"],
  status: ["atlas", "status"],
};

const ATLAS_SUBCOMMANDS = new Set(Object.keys(SUBCOMMAND_ARGV));

const USAGE_LINES = [
  "[atlas] Usage: sdtk-spec atlas <subcommand> [options]",
  "  Subcommands: init, build, open, watch, status",
  "  All subcommands delegate to sdtk-wiki, which owns the graph builder.",
  "  Run 'sdtk-wiki atlas --help' for the full option list.",
];

const WIKI_MISSING_LINES = [
  "[atlas] sdtk-spec atlas delegates to sdtk-wiki, which is not installed.",
  "[atlas] Install the wiki kit, then rerun:",
  `[atlas]   npm install -g ${WIKI_PKG}`,
  `[atlas]   ${WIKI_BIN} atlas build`,
  "[atlas] Or install the whole suite at once: npm install -g sdtk-kit",
];

/**
 * Map an `sdtk-spec atlas ...` invocation onto the sdtk-wiki argv that performs
 * the same work. Pure: no filesystem or process access.
 *
 * @param {string[]} args - Args after the `atlas` verb.
 * @returns {{ usage: true } | { usage: false, subcommand: string, argv: string[] }}
 * @throws {ValidationError} When the subcommand is not part of the atlas family.
 */
function planDelegation(args) {
  if (!args || args.length === 0) {
    return { usage: true };
  }

  const [subcommand, ...rest] = args;

  if (!ATLAS_SUBCOMMANDS.has(subcommand)) {
    throw new ValidationError(
      `Unknown atlas subcommand: "${subcommand}". Valid subcommands: init, build, open, watch, status.`
    );
  }

  return {
    usage: false,
    subcommand,
    argv: [...SUBCOMMAND_ARGV[subcommand], ...rest],
  };
}

/**
 * Resolve the sdtk-wiki entry script through its package.json `bin` map, the
 * same drift-safe path the umbrella uses to reach sub-kits.
 *
 * @returns {string | null} Absolute path to the sdtk-wiki entry script, or null
 *   when sdtk-wiki-kit is not installed alongside sdtk-spec-kit.
 */
function resolveWikiBin() {
  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve(`${WIKI_PKG}/package.json`);
  } catch (_) {
    return null;
  }

  // eslint-disable-next-line global-require
  const pkg = require(pkgJsonPath);
  const binField = pkg.bin;
  let rel;
  if (typeof binField === "string") {
    rel = binField;
  } else if (binField && typeof binField === "object") {
    rel = binField[WIKI_BIN] || Object.values(binField)[0];
  }
  if (!rel) {
    return null;
  }

  return path.resolve(path.dirname(pkgJsonPath), rel);
}

module.exports = {
  ATLAS_SUBCOMMANDS,
  SUBCOMMAND_ARGV,
  USAGE_LINES,
  WIKI_BIN,
  WIKI_MISSING_LINES,
  WIKI_PKG,
  planDelegation,
  resolveWikiBin,
};
