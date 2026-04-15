"use strict";

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
  const actionLine =
    action === "update"
      ? `Refusing to refresh managed project files into the SDTK maintainer repo root: ${projectPath}`
      : action === "ingest"
        ? `Refusing to use the SDTK maintainer repo root as a project ingest target: ${projectPath}`
        : action === "audit"
          ? `Refusing to use the SDTK maintainer repo root as a project audit target: ${projectPath}`
          : action === "refresh"
            ? `Refusing to use the SDTK maintainer repo root as a project refresh target: ${projectPath}`
            : `Refusing to refresh managed project files into the SDTK maintainer repo root: ${projectPath}`;

  const overwriteLine =
    action === "ingest"
      ? `The ${action} flow must target a consumer project repo and must not derive premium ingest artifacts from repo-owned maintainer files such as ${PROTECTED_FILES.join(", ")}.`
      : action === "audit"
        ? `The ${action} flow must target a consumer project repo and must not run a premium audit against repo-owned maintainer files such as ${PROTECTED_FILES.join(", ")}.`
        : action === "refresh"
          ? `The ${action} flow must target a consumer project repo and must not run a premium refresh against repo-owned maintainer files such as ${PROTECTED_FILES.join(", ")}.`
          : `The ${action} flow would overwrite repo-owned files such as ${PROTECTED_FILES.join(", ")}.`;

  const lines = [
    actionLine,
    overwriteLine,
    "Target a consumer project path instead of the SDTK maintainer monorepo root.",
  ];

  if (action === "update") {
    lines.push(`If you only need package/runtime refresh, rerun ${cliName} update with --skip-project-files.`);
  } else if (action === "ingest") {
    lines.push(`If you only need premium project analysis, rerun ${cliName} project ingest against a consumer project checkout instead of the SDTK maintainer monorepo root.`);
  } else if (action === "audit") {
    lines.push(`If you only need a read-only project audit, rerun ${cliName} project audit against a consumer project checkout instead of the SDTK maintainer monorepo root.`);
  } else if (action === "refresh") {
    lines.push(`If you only need an incremental refresh, rerun ${cliName} project refresh against a consumer project checkout instead of the SDTK maintainer monorepo root.`);
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

