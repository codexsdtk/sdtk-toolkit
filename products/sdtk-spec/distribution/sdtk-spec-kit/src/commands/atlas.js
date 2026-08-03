"use strict";

const { spawn } = require("child_process");
const {
  USAGE_LINES,
  WIKI_BIN,
  WIKI_MISSING_LINES,
  planDelegation,
  resolveWikiBin,
} = require("../lib/atlas-delegate");
const { CliError } = require("../lib/errors");

/**
 * Spawn the resolved sdtk-wiki entry script with the current Node binary rather
 * than the installed shim, so Windows never has to resolve a .cmd through
 * PATHEXT (BK-F).
 *
 * @param {string} binPath - Absolute path to the sdtk-wiki entry script.
 * @param {string[]} argv - Args to forward.
 * @returns {Promise<number>} Child exit code.
 */
function runWiki(binPath, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...argv], {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      reject(new CliError(`Failed to start ${WIKI_BIN}: ${err.message}`));
    });

    child.on("close", (code, signal) => {
      if (signal) {
        // Ctrl+C on a long-lived `open` / `watch` run is a normal exit here.
        resolve(0);
        return;
      }
      resolve(code === null ? 1 : code);
    });
  });
}

// `deps` = { resolveWikiBin, runWiki } — injected by tests so both the resolved
// and the not-installed branch are exercisable without a real install.
async function cmdAtlas(args, deps = {}) {
  const resolve = deps.resolveWikiBin || resolveWikiBin;
  const run = deps.runWiki || runWiki;

  const plan = planDelegation(args);

  if (plan.usage) {
    for (const line of USAGE_LINES) {
      console.error(line);
    }
    return 1;
  }

  const binPath = resolve();
  if (!binPath) {
    for (const line of WIKI_MISSING_LINES) {
      console.error(line);
    }
    return 2;
  }

  console.log(
    `[atlas] Delegating to "${WIKI_BIN} ${plan.argv.join(" ")}" — sdtk-wiki owns the graph builder.`
  );
  console.log(
    "[atlas] Graph output defaults to .sdtk/wiki/graph; pass --output-dir to choose another location."
  );

  return run(binPath, plan.argv);
}

module.exports = {
  cmdAtlas,
  runWiki,
};

