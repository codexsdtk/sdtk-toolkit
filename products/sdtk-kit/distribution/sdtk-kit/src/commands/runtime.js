"use strict";

// `sdtk runtime <install|uninstall|status>` command (umbrella, BK-314).
// Parses flags, wires real effectful deps, and delegates to the pure
// orchestrator in src/lib/unified-runtime.js. Mirrors src/commands/init.js.

const { spawnSync } = require("child_process");
const {
  resolveToolkitBin,
  checkPowerShellAvailable,
} = require("../lib/unified-init");
const { runUnifiedRuntime, RUNTIME_SUBCOMMANDS } = require("../lib/unified-runtime");

// Same minimal local parser pattern as commands/init.js (no child-kit imports).
// The `runtime` noun uses --scope (matching the sub-kit runtime families),
// not init's --runtime-scope; --global stays as the shorthand for --scope user.
const FLAG_DEFS = Object.freeze({
  runtime: "string",
  scope: "string",
  global: "boolean",
  "project-path": "string",
  force: "boolean",
  all: "boolean",
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
// An explicit --scope wins over the --global shorthand.
function buildOpts(flags) {
  const scope = flags.scope || (flags.global ? "user" : undefined);
  return {
    runtime: flags.runtime,
    scope,
    projectPath: flags["project-path"],
    force: Boolean(flags.force),
    all: Boolean(flags.all),
    keepGoing: Boolean(flags["keep-going"]),
    verbose: Boolean(flags.verbose),
  };
}

function cmdRuntime(args) {
  const subcommand = args[0];
  if (!subcommand || subcommand.startsWith("--")) {
    console.error(
      `Error: missing subcommand. Usage: sdtk runtime <${RUNTIME_SUBCOMMANDS.join("|")}> --runtime <claude|codex> [options]`
    );
    return 2;
  }

  let flags;
  try {
    flags = parseFlags(args.slice(1));
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

  const { exitCode } = runUnifiedRuntime(subcommand, opts, deps);
  return exitCode;
}

module.exports = {
  cmdRuntime,
  parseFlags,
  buildOpts,
};
