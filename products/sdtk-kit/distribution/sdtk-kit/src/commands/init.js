"use strict";

// `sdtk init` command (umbrella). Parses flags, wires real effectful deps, and
// delegates to the pure orchestrator in src/lib/unified-init.js.

const { spawnSync } = require("child_process");
const {
  runUnifiedInit,
  resolveToolkitBin,
  checkPowerShellAvailable,
} = require("../lib/unified-init");

// Minimal local flag parser (the umbrella has no shared args lib, and we must not
// import a child kit's internal lib). Supports `--flag value`, `--flag=value`,
// and boolean `--flag`.
const FLAG_DEFS = Object.freeze({
  runtime: "string",
  "runtime-scope": "string",
  global: "boolean",
  "project-path": "string",
  force: "boolean",
  "skip-runtime-assets": "boolean",
  "keep-going": "boolean",
  verbose: "boolean",
});

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    let key = arg.slice(2);
    let value;
    const eq = key.indexOf("=");
    if (eq !== -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    const type = FLAG_DEFS[key];
    if (!type) {
      throw new Error(`Unknown flag: --${key}`);
    }
    if (type === "boolean") {
      flags[key] = true;
    } else {
      if (value === undefined) {
        value = args[i + 1];
        i += 1;
      }
      if (value === undefined) {
        throw new Error(`Flag --${key} requires a value.`);
      }
      flags[key] = value;
    }
  }
  return flags;
}

// Pure flags → orchestrator opts mapping (exported for unit testing).
// --global is a shorthand for --runtime-scope user (installs skills under the
// user/global runtime home: ~/.claude/skills or ~/.codex/skills). An explicit
// --runtime-scope wins if both are supplied.
function buildOpts(flags) {
  const runtimeScope = flags["runtime-scope"] || (flags.global ? "user" : undefined);
  return {
    runtime: flags.runtime,
    runtimeScope,
    projectPath: flags["project-path"],
    force: Boolean(flags.force),
    skipRuntimeAssets: Boolean(flags["skip-runtime-assets"]),
    keepGoing: Boolean(flags["keep-going"]),
    verbose: Boolean(flags.verbose),
  };
}

function cmdInit(args) {
  let flags;
  try {
    flags = parseFlags(args);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 2;
  }

  const opts = buildOpts(flags);

  const deps = {
    spawn(binPath, argv) {
      return spawnSync(process.execPath, [binPath, ...argv], { stdio: "inherit" });
    },
    resolveBin: resolveToolkitBin,
    powershellCheck: () => checkPowerShellAvailable(spawnSync),
    log: (line) => console.log(line),
  };

  const { exitCode } = runUnifiedInit(opts, deps);
  return exitCode;
}

module.exports = {
  cmdInit,
  parseFlags,
  buildOpts,
};
