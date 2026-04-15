"use strict";

const path = require("path");
const { parseFlags, validateChoice } = require("../lib/args");
const { verify, resolvePayloadFile } = require("../lib/toolkit-payload");
const { runScript } = require("../lib/powershell");
const { ValidationError } = require("../lib/errors");
const { VALID_SCOPES, defaultScope, isProjectScopeSupported } = require("../lib/scope");
const { assertProjectRefreshTargetAllowed } = require("../lib/project-target-guard");

const FLAG_DEFS = {
  runtime: { type: "string" },
  "project-path": { type: "string" },
  "runtime-scope": { type: "string" },
  force: { type: "boolean" },
  "skip-skills": { type: "boolean" },
  "skip-runtime-assets": { type: "boolean" },
  verbose: { type: "boolean" },
};

const VALID_RUNTIMES = ["codex", "claude"];

async function cmdInit(args) {
  const { flags } = parseFlags(args, FLAG_DEFS);

  const runtime = flags.runtime || "codex";
  validateChoice(runtime, VALID_RUNTIMES, "runtime");

  const scope = flags["runtime-scope"] || defaultScope(runtime);
  validateChoice(scope, VALID_SCOPES, "runtime-scope");
  if (scope === "project" && !isProjectScopeSupported(runtime)) {
    throw new ValidationError(
      `${runtime} does not support project-local runtime assets. Use --runtime-scope user instead.`
    );
  }

  const skipAssets = flags["skip-runtime-assets"] || flags["skip-skills"];
  if (flags["skip-skills"] && !flags["skip-runtime-assets"]) {
    console.warn("Warning: --skip-skills is deprecated. Use --skip-runtime-assets instead.");
  }

  const projectPath = flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();

  assertProjectRefreshTargetAllowed("sdtk-ops", "init", projectPath);

  verify();

  const installScript = resolvePayloadFile("toolkit/install.ps1");
  const params = {
    ProjectPath: projectPath,
    Runtime: runtime,
    Scope: scope,
  };
  if (flags.force) {
    params.Force = true;
  }
  if (skipAssets) {
    params.SkipRuntimeAssets = true;
  }
  if (!flags.verbose) {
    params.Quiet = true;
  }

  console.log("Initializing SDTK-OPS workspace...");
  console.log(`  Runtime: ${runtime}`);
  console.log(`  Scope:   ${scope}`);
  console.log(`  Project: ${projectPath}`);
  if (runtime === "codex" && scope === "project") {
    console.log(`  Codex home contract: ${path.join(projectPath, ".codex")}`);
    console.log("  Note: Launch Codex with CODEX_HOME=<project>/.codex to use project-local skills.");
    console.log("  Note: This CLI does not claim native .codex/skills auto-discovery.");
  }
  console.log("");

  const result = await runScript(installScript, params, { silent: !flags.verbose });
  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    throw new ValidationError(`Initialization failed (exit code ${result.exitCode}).`);
  }

  console.log("");
  console.log("SDTK-OPS workspace initialized successfully.");
  if (runtime === "codex" && scope === "project") {
    console.log(`Project-local Codex skills were installed into ${path.join(projectPath, ".codex", "skills")}.`);
    console.log("Launch Codex with CODEX_HOME=<project>/.codex to activate that local runtime home.");
  }
  console.log("");
  console.log("Next steps:");
  console.log("  1. Review and customize sdtk-spec.config.json for your operations environment.");
  console.log("  2. Use the installed ops-* skill set for deployment, monitoring, incident, and recovery workflows.");
  return 0;
}

module.exports = {
  cmdInit,
};
