"use strict";

const fs = require("fs");
const path = require("path");
const { parseFlags, requireFlag, validateChoice } = require("../lib/args");
const { verify, resolvePayloadFile } = require("../lib/toolkit-payload");
const { runScript } = require("../lib/powershell");
const { ValidationError } = require("../lib/errors");
const {
  VALID_SCOPES,
  defaultScope,
  isProjectScopeSupported,
  managedSkillNames,
  resolveCodexProjectHome,
  resolveCodexUserHome,
  resolveSkillsDir,
} = require("../lib/scope");

const FLAG_DEFS = {
  runtime: { type: "string" },
  scope: { type: "string" },
  "project-path": { type: "string" },
  force: { type: "boolean" },
  all: { type: "boolean" },
  verbose: { type: "boolean" },
};

const VALID_RUNTIMES = ["codex", "claude"];
const SUBCOMMANDS = ["install", "uninstall", "status"];

function validateScopeForRuntime(runtime, scope, label) {
  if (scope === "project" && !isProjectScopeSupported(runtime)) {
    throw new ValidationError(
      `${runtime} does not support project-local runtime assets. Use --${label} user instead.`
    );
  }
}

async function cmdRuntimeInstall(flags) {
  const runtime = requireFlag(flags, "runtime", "runtime");
  validateChoice(runtime, VALID_RUNTIMES, "runtime");

  const scope = flags.scope || defaultScope(runtime);
  validateChoice(scope, VALID_SCOPES, "scope");
  validateScopeForRuntime(runtime, scope, "scope");

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  verify();

  const scriptName =
    runtime === "claude"
      ? "toolkit/scripts/install-claude-skills.ps1"
      : "toolkit/scripts/install-codex-skills.ps1";
  const script = resolvePayloadFile(scriptName);
  const params = { Scope: scope };
  if (scope === "project") {
    params.ProjectPath = projectPath;
  }
  if (flags.force) {
    params.Force = true;
  }
  if (!flags.verbose) {
    params.Quiet = true;
  }

  console.log(`Installing ${runtime} runtime assets...`);
  console.log(`  Runtime: ${runtime}`);
  console.log(`  Scope:   ${scope}`);
  if (scope === "project") {
    console.log(`  Project: ${projectPath}`);
  }
  if (runtime === "codex" && scope === "project") {
    console.log(`  Codex home contract: ${resolveCodexProjectHome(projectPath)}`);
    console.log("  Note: Launch Codex with CODEX_HOME=<project>/.codex to activate this project-local install.");
    console.log("  Note: Native .codex/skills auto-discovery is not claimed.");
  }
  console.log("");

  const result = await runScript(script, params, { silent: !flags.verbose });
  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    throw new ValidationError(`Runtime install failed (exit code ${result.exitCode}).`);
  }

  console.log("");
  console.log(`${runtime} runtime assets installed successfully.`);
  return 0;
}

async function cmdRuntimeUninstall(flags) {
  const runtime = requireFlag(flags, "runtime", "runtime");
  validateChoice(runtime, VALID_RUNTIMES, "runtime");

  const scope = flags.scope || defaultScope(runtime);
  validateChoice(scope, VALID_SCOPES, "scope");
  validateScopeForRuntime(runtime, scope, "scope");

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  verify();

  const scriptName =
    runtime === "claude"
      ? "toolkit/scripts/uninstall-claude-skills.ps1"
      : "toolkit/scripts/uninstall-codex-skills.ps1";
  const script = resolvePayloadFile(scriptName);
  const params = {};
  params.Scope = scope;
  if (scope === "project") {
    params.ProjectPath = projectPath;
  }
  if (flags.all) {
    params.All = true;
  }
  if (!flags.verbose) {
    params.Quiet = true;
  }

  const result = await runScript(script, params, { silent: !flags.verbose });
  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    throw new ValidationError(`Runtime uninstall failed (exit code ${result.exitCode}).`);
  }

  console.log(`Uninstalled ${runtime} runtime assets for scope ${scope}.`);
  return 0;
}

function cmdRuntimeStatus(flags) {
  const runtime = requireFlag(flags, "runtime", "runtime");
  validateChoice(runtime, VALID_RUNTIMES, "runtime");

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
  const scopes = ["project", "user"];

  console.log(`Runtime: ${runtime}`);
  console.log("");

  if (runtime === "codex") {
    console.log("Codex scope truth:");
    console.log(`  Project-local root: ${resolveCodexProjectHome(projectPath)}`);
    console.log(`  User/global root:   ${resolveCodexUserHome()}`);
    console.log("  Project-local Codex support requires launching Codex with CODEX_HOME=<project>/.codex.");
    console.log("  Native .codex/skills auto-discovery is not claimed.");
    console.log("");
  }

  for (const scope of scopes) {
    const skillsDir = resolveSkillsDir(runtime, scope, projectPath);
    const managed = managedSkillNames(runtime);
    const exists = fs.existsSync(skillsDir);
    let installedNames = [];

    if (exists) {
      try {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        installedNames = entries
          .filter((entry) => entry.isDirectory() && managed.includes(entry.name))
          .map((entry) => entry.name)
          .sort();
      } catch {
        installedNames = [];
      }
    }

    const skillCount = installedNames.length;
    const allInstalled = skillCount === managed.length;
    const hasManagedSkills = skillCount > 0;
    const status = !exists || !hasManagedSkills
      ? "not installed"
      : allInstalled
        ? `installed (${skillCount}/${managed.length} SDTK-OPS skills)`
        : `partial (${skillCount}/${managed.length} SDTK-OPS skills)`;

    console.log(`  Scope: ${scope}`);
    console.log(`    Path:   ${skillsDir}`);
    if (runtime === "codex" && scope === "project") {
      console.log("    Activation: explicit CODEX_HOME=<project>/.codex contract required");
    }
    console.log(`    Status: ${status}`);
    if (exists && hasManagedSkills && skillCount < managed.length) {
      const missing = managed.filter((name) => !installedNames.includes(name));
      console.log(`    Missing: ${missing.join(", ")}`);
    }
    console.log("");
  }

  return 0;
}

async function cmdRuntime(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  const subcommand = positional[0];

  if (!subcommand) {
    throw new ValidationError(
      `Missing subcommand. Usage: sdtk-ops runtime <${SUBCOMMANDS.join("|")}> [options]`
    );
  }
  if (!SUBCOMMANDS.includes(subcommand)) {
    throw new ValidationError(
      `Unknown subcommand: "${subcommand}". Must be one of: ${SUBCOMMANDS.join(", ")}`
    );
  }

  switch (subcommand) {
    case "install":
      return cmdRuntimeInstall(flags);
    case "uninstall":
      return cmdRuntimeUninstall(flags);
    case "status":
      return cmdRuntimeStatus(flags);
    default:
      throw new ValidationError(`Unsupported runtime subcommand: "${subcommand}".`);
  }
}

module.exports = {
  cmdRuntime,
};
