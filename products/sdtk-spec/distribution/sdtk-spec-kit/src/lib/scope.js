"use strict";

const path = require("path");
const os = require("os");

const VALID_SCOPES = ["project", "user"];

/**
 * Returns the default scope for a given runtime.
 * Claude defaults to project-local, Codex defaults to user/global.
 */
function defaultScope(runtime) {
  return runtime === "claude" ? "project" : "user";
}

/**
 * Returns true if the given runtime supports project-local scope.
 */
function isProjectScopeSupported(runtime) {
  return runtime === "claude" || runtime === "codex";
}

function resolveCodexProjectHome(projectPath) {
  return path.join(projectPath || process.cwd(), ".codex");
}

function resolveCodexUserHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function resolveCodexHome(scope, projectPath) {
  return scope === "project"
    ? resolveCodexProjectHome(projectPath)
    : resolveCodexUserHome();
}

/**
 * Resolves the skills directory for a given runtime, scope, and project path.
 */
function resolveSkillsDir(runtime, scope, projectPath) {
  if (runtime === "claude") {
    if (scope === "user") {
      return path.join(os.homedir(), ".claude", "skills");
    }
    return path.join(projectPath || process.cwd(), ".claude", "skills");
  }

  const codexHome = resolveCodexHome(scope, projectPath);
  return path.join(codexHome, "skills");
}

/**
 * SDTK-managed skill directory names per runtime.
 * Used by runtime status to distinguish SDTK skills from unrelated user skills.
 */
const MANAGED_CODEX_SKILLS = [
  "sdtk-api-design-spec", "sdtk-api-doc", "sdtk-arch", "sdtk-ba",
  "sdtk-design-layout", "sdtk-dev", "sdtk-dev-backend", "sdtk-dev-frontend",
  "sdtk-orchestrator", "sdtk-pm", "sdtk-qa", "sdtk-screen-design-spec",
  "sdtk-test-case-spec",
];

const MANAGED_CLAUDE_SKILLS = [
  "api-design-spec", "api-doc", "arch", "ba",
  "design-layout", "dev", "dev-backend", "dev-frontend",
  "orchestrator", "pm", "qa", "screen-design-spec",
  "test-case-spec",
];

function managedSkillNames(runtime) {
  return runtime === "claude" ? MANAGED_CLAUDE_SKILLS : MANAGED_CODEX_SKILLS;
}

module.exports = {
  VALID_SCOPES,
  defaultScope,
  isProjectScopeSupported,
  resolveCodexHome,
  resolveCodexProjectHome,
  resolveCodexUserHome,
  resolveSkillsDir,
  managedSkillNames,
};
