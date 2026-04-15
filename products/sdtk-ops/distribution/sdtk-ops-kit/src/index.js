"use strict";

const { cmdHelp } = require("./commands/help");
const { cmdInit } = require("./commands/init");
const { cmdRuntime } = require("./commands/runtime");
const { cmdUpdate } = require("./commands/update");
const { ValidationError } = require("./lib/errors");

const COMMANDS = new Set(["help", "version", "init", "runtime", "update"]);

function getVersion() {
  const pkg = require("../package.json");
  return pkg.version;
}

function parseCommand(argv) {
  if (!argv || argv.length === 0) {
    return { command: "help", args: [] };
  }

  const [first, ...rest] = argv;
  if (first === "-h" || first === "--help") {
    return { command: "help", args: [] };
  }
  if (first === "-v" || first === "--version") {
    return { command: "version", args: [] };
  }

  return { command: first, args: rest };
}

async function run(argv) {
  const { command, args } = parseCommand(argv);

  if (command === "generate") {
    throw new ValidationError(
      'The "generate" command is not part of the supported SDTK-OPS workflow-entry surface. Supported commands: help, init, runtime. If the correct journey is unclear, start with the "ops-discover" skill.'
    );
  }

  if (!COMMANDS.has(command)) {
    throw new ValidationError(
      `Unknown command: "${command}". Run "sdtk-ops --help" for available commands.`
    );
  }

  switch (command) {
    case "help":
      return cmdHelp();
    case "version":
      console.log(`sdtk-ops-kit ${getVersion()}`);
      return 0;
    case "init":
      return cmdInit(args);
    case "runtime":
      return cmdRuntime(args);
    case "update":
      return cmdUpdate(args);
    default:
      throw new ValidationError(`Unsupported command: "${command}".`);
  }
}

module.exports = {
  getVersion,
  parseCommand,
  run,
};
