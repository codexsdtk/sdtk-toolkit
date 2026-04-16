"use strict";

const { cmdBuild } = require("./commands/build");
const { cmdDoctor } = require("./commands/doctor");
const { cmdHelp } = require("./commands/help");
const { cmdInit } = require("./commands/init");
const { cmdPlan } = require("./commands/plan");
const { cmdResume } = require("./commands/resume");
const { cmdRuntime } = require("./commands/runtime");
const { cmdShip } = require("./commands/ship");
const { cmdStart } = require("./commands/start");
const { cmdStatus } = require("./commands/status");
const { cmdUpdate } = require("./commands/update");
const { cmdVerify } = require("./commands/verify");
const { ValidationError } = require("./lib/errors");

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

const COMMANDS = new Set([
  "help",
  "version",
  "init",
  "runtime",
  "start",
  "plan",
  "build",
  "verify",
  "ship",
  "status",
  "doctor",
  "resume",
  "update",
]);

async function run(argv) {
  const { command, args } = parseCommand(argv);

  if (!COMMANDS.has(command)) {
    throw new ValidationError(
      `Unknown command: "${command}". Run "sdtk-code --help" for available commands.`
    );
  }

  switch (command) {
    case "help":
      return cmdHelp();
    case "version":
      console.log(`sdtk-code-kit ${getVersion()}`);
      return 0;
    case "init":
      return cmdInit(args);
    case "runtime":
      return cmdRuntime(args);
    case "start":
      return cmdStart(args);
    case "plan":
      return cmdPlan(args);
    case "build":
      return cmdBuild(args);
    case "verify":
      return cmdVerify(args);
    case "ship":
      return cmdShip(args);
    case "status":
      return cmdStatus(args);
    case "doctor":
      return cmdDoctor(args);
    case "resume":
      return cmdResume(args);
    case "update":
      return cmdUpdate(args);
  }
}

module.exports = {
  run,
};
