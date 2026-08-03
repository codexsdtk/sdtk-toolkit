"use strict";

const os = require("os");
const path = require("path");

const VALID_SCOPES = ["project", "user"];

function defaultScope(runtime) {
  return runtime === "claude" ? "project" : "user";
}

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

const MANAGED_CLAUDE_SKILLS = [
  "code-brainstorm",
  "code-debug",
  "code-discover",
  "code-execute",
  "code-finish",
  "code-parallel",
  "code-plan",
  "code-review",
  "code-ship",
  "code-tdd",
  "code-verify",
  "code-worktree",
];

const MANAGED_CODEX_SKILLS = MANAGED_CLAUDE_SKILLS.map((name) => `sdtk-${name}`);

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
