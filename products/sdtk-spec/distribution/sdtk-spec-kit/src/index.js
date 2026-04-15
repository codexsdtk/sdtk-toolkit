"use strict";

const { cmdHelp } = require("./commands/help");
const { cmdInit } = require("./commands/init");
const { cmdGenerate } = require("./commands/generate");
const { cmdRuntime } = require("./commands/runtime");
const { cmdUpdate } = require("./commands/update");
const { cmdAtlas } = require("./commands/atlas");
const { cmdProject } = require("./commands/project");
const { ValidationError, CliError } = require("./lib/errors");

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

const COMMANDS = new Set(["help", "version", "init", "generate", "runtime", "update", "atlas"]);

async function run(argv) {
  const { command, args } = parseCommand(argv);

  if (!COMMANDS.has(command)) {
    throw new ValidationError(
      `Unknown command: "${command}". Run "sdtk-spec --help" for available commands.`
    );
  }

  switch (command) {
    case "help":
      return cmdHelp();
    case "version":
      console.log(`sdtk-spec-kit ${getVersion()}`);
      return 0;
    case "init":
      return cmdInit(args);
    case "generate":
      return cmdGenerate(args);
    case "runtime":
      return cmdRuntime(args);
    case "update":
      return cmdUpdate(args);
    case "atlas":
      return cmdAtlas(args);
  }
}

module.exports = {
  run,
};

