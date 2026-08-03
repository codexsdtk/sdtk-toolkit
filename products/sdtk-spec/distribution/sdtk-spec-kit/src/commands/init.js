"use strict";

const path = require("path");
const { parseFlags, validateChoice } = require("../lib/args");
const { verify, resolvePayloadFile } = require("../lib/toolkit-payload");
const { runScript } = require("../lib/powershell");
const { ValidationError } = require("../lib/errors");
const { VALID_SCOPES, defaultScope, isProjectScopeSupported } = require("../lib/scope");
const { assertProjectRefreshTargetAllowed } = require("../lib/project-target-guard");
const { detectAndMergeConfig } = require("../lib/stack-detector");

const FLAG_DEFS = {
  runtime: { type: "string" },
  "project-path": { type: "string" },
  "runtime-scope": { type: "string" },
  force: { type: "boolean" },
  "skip-skills": { type: "boolean" },
  "skip-runtime-assets": { type: "boolean" },
  "skip-stack-detect": { type: "boolean" },
  verbose: { type: "boolean" },
};

const VALID_RUNTIMES = ["codex", "claude"];

async function cmdInit(args) {
  const { flags } = parseFlags(args, FLAG_DEFS);

  // Validate runtime
  const runtime = flags.runtime || "codex";
  validateChoice(runtime, VALID_RUNTIMES, "runtime");

  // Resolve scope
  const scope = flags["runtime-scope"] || defaultScope(runtime);
  validateChoice(scope, VALID_SCOPES, "runtime-scope");

  if (scope === "project" && !isProjectScopeSupported(runtime)) {
    throw new ValidationError(
      `${runtime} does not support project-local runtime assets. Use --runtime-scope user instead.`
    );
  }

  // Handle deprecated --skip-skills
  const skipAssets = flags["skip-runtime-assets"] || flags["skip-skills"];
  if (flags["skip-skills"] && !flags["skip-runtime-assets"]) {
    console.warn(
      "Warning: --skip-skills is deprecated. Use --skip-runtime-assets instead."
    );
  }

  // Resolve project path
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  assertProjectRefreshTargetAllowed("sdtk-spec", "init", projectPath);

  // Verify payload integrity before proceeding
  verify();

  // Resolve bundled install.ps1
  const installScript = resolvePayloadFile("toolkit/install.ps1");

  // Build PowerShell parameters
  const params = {
    ProjectPath: projectPath,
    Runtime: runtime,
    Scope: scope,
  };
  if (flags.force) params.Force = true;
  if (skipAssets) params.SkipRuntimeAssets = true;
  if (!flags.verbose) params.Quiet = true;

  console.log(`Initializing SDTK-SPEC workspace...`);
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
    throw new ValidationError(
      `Initialization failed (exit code ${result.exitCode}).`
    );
  }

  // Static stack detection: populate sdtk-spec.config.json so downstream
  // commands (project analysis) and the 17-file scaffold know the
  // project stack without manual entry. Best-effort: never fail init.
  let stackSummary = null;
  if (!flags["skip-stack-detect"]) {
    try {
      stackSummary = detectAndMergeConfig(projectPath);
    } catch (err) {
      if (flags.verbose) {
        console.warn(`Warning: stack detection skipped: ${err.message}`);
      }
    }
  }

  console.log("");
  console.log("SDTK-SPEC workspace initialized successfully.");
  if (runtime === "codex" && scope === "project") {
    console.log(`Project-local Codex skills were installed into ${path.join(projectPath, ".codex", "skills")}.`);
    console.log("Launch Codex with CODEX_HOME=<project>/.codex to activate that local runtime home.");
  }
  console.log("");
  if (stackSummary && stackSummary.written && stackSummary.summary) {
    const d = stackSummary.detected.detection;
    const s = stackSummary.summary;
    const fw = d.framework
      ? `${d.framework}${d.frameworkVersion ? " " + d.frameworkVersion : ""}`
      : d.language || "unknown";
    console.log(`Detected stack: ${fw} (confidence: ${d.confidence}).`);
    if (s.written.length) {
      console.log(`  Auto-filled in sdtk-spec.config.json: ${s.written.join(", ")}.`);
    }
    if (s.preserved.length) {
      console.log(`  Kept your existing values: ${s.preserved.join(", ")}.`);
    }
    if (s.unknown.length) {
      console.log(`  Could not detect (please set manually): ${s.unknown.join(", ")}.`);
    }
    // BK-346: close the loop from detection into a gate-ready config.
    const profileHint = d.framework === "laravel" || d.language === "php"
      ? "php-laravel"
      : d.framework === "django"
        ? "django-react"
        : d.framework === "nextjs" || d.framework === "next"
          ? "node-nextjs"
          : null;
    if (profileHint) {
      console.log(`  Tip: run "sdtk-spec config apply-profile ${profileHint}" to fill stack + gate commands, then verify with "sdtk-spec config check".`);
    } else {
      console.log('  Tip: fill the remaining values with "sdtk-spec config apply-profile <name>" (see sdtk-spec.config.profiles.example.json), then verify with "sdtk-spec config check".');
    }
    console.log("");
  }

  console.log("Next steps:");
  console.log("  1. Review sdtk-spec.config.json (stack auto-detected where possible; fill any remaining placeholders).");
  console.log("  2. Review bootstrap guidance:");
  console.log(`     ${path.join(projectPath, "AGENTS.md")}`);
  if (runtime === "claude") {
    console.log(`     ${path.join(projectPath, "CLAUDE.md")}`);
  } else if (runtime === "codex") {
    console.log(`     ${path.join(projectPath, "CODEX.md")}`);
  }
  console.log(`     ${path.join(projectPath, "governance", "ai", "session", "SDTK_ACTIVE_BOOTSTRAP.md")}`);
  console.log(`     ${path.join(projectPath, "governance", "ai", "session", "SDTK_AGENT_WORKING_RULES.md")}`);
  console.log('  3. Run "sdtk-spec generate --key <KEY> --name <name>" to scaffold the SDLC docs (e.g. --key SHOPEASE --name "ShopEase MVP").');
  return 0;
}

module.exports = {
  cmdInit,
};
