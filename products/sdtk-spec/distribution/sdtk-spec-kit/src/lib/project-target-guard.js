"use strict";

// Free-edition guard: prevents `sdtk-spec init` / `update` from writing managed
// project files into the SDTK maintainer monorepo root. The paid project
// analysis flows are not part of the open-source distribution, so this free
// version only carries the init/update guard messages.

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");

const MAINTAINER_ROOT_MARKERS = [
  "governance/ai/core/IMPROVEMENT_BACKLOG.md",
  "products/sdtk-spec/toolkit/install.ps1",
];
const PROTECTED_FILES = [
  "AGENTS.md",
  "CODEX.md",
  "CLAUDE.md",
  "sdtk-spec.config.json",
  "sdtk-spec.config.profiles.example.json"
];

function isMaintainerRoot(projectPath) {
  const resolved = path.resolve(projectPath);
  return MAINTAINER_ROOT_MARKERS.every((marker) => fs.existsSync(path.join(resolved, marker)));
}

function buildMaintainerRootMessage(cliName, action, projectPath) {
  const lines = [
    `Refusing to write managed project files into the SDTK maintainer repo root: ${projectPath}`,
    `The ${action} flow would overwrite repo-owned files such as ${PROTECTED_FILES.join(", ")}.`,
    "Target a consumer project path instead of the SDTK maintainer monorepo root.",
  ];

  if (action === "update") {
    lines.push(`If you only need package/runtime refresh, rerun ${cliName} update with --skip-project-files.`);
  } else {
    lines.push(`If you only need runtime assets, use ${cliName} runtime install against the desired consumer project path instead of ${cliName} init.`);
  }

  return lines.join("\n");
}

function assertProjectRefreshTargetAllowed(cliName, action, projectPath) {
  if (!isMaintainerRoot(projectPath)) {
    return;
  }

  throw new ValidationError(buildMaintainerRootMessage(cliName, action, projectPath));
}

module.exports = {
  assertProjectRefreshTargetAllowed,
  buildMaintainerRootMessage,
  isMaintainerRoot,
};
