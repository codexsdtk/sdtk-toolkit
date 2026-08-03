"use strict";

const {
  isWikiInitialized,
  resolveWikiConfig,
  writeWikiConfig,
} = require("../lib/wiki-config");
const { ensureWorkspace } = require("../lib/wiki-workspace");
const { runBuild } = require("../lib/wiki-runner");
const { INIT_FLAG_DEFS, parseWikiFlags } = require("../lib/wiki-flags");

function hasHelp(args) {
  return args.includes("-h") || args.includes("--help");
}

function cmdInitHelp() {
  console.log(`Usage:
  sdtk-wiki init --help

Purpose:
  Defines the SDTK-WIKI workspace contract for R1.

Workspace contract:
  .sdtk/wiki           New SDTK-WIKI workspace target.
  .sdtk/wiki/graph     New SDTK-WIKI graph output target.
  .sdtk/atlas          Legacy Atlas workspace remains readable.

BK-102 behavior:
  Help exits 0.
  Runtime initialization is implemented in BK-103.

Options:
  --project-path <path>   Project root. Defaults to current working directory.
  --output-dir <path>     Graph output dir under .sdtk/wiki. Defaults to .sdtk/wiki/graph.
  --scan-root <path>      Repeatable markdown scan root. Defaults to ./docs if it exists, otherwise the project root.
  --force                 Overwrite existing config.
  --no-build              Write config only.
  --no-open               Build graph but do not launch viewer.
  --host <host>           Viewer host. Defaults to 127.0.0.1.
  --port <port>           Viewer port. Defaults to 8765.
  --tunnel                Expose the viewer via a public cloudflared URL
                          (open it from your host browser). Use when the
                          viewer runs inside Docker/WSL2. Requires cloudflared;
                          Ctrl+C stops the server and the tunnel.
  --verbose               Print builder details.`);
  return 0;
}

async function cmdInit(args) {
  if (hasHelp(args)) {
    return cmdInitHelp();
  }

  const { flags } = parseWikiFlags(args, INIT_FLAG_DEFS);
  const config = resolveWikiConfig(flags);
  const { workspace } = ensureWorkspace(config.projectPath, config.outputDir);

  if (isWikiInitialized(config.outputDir) && !flags.force) {
    console.log(`[wiki] SDTK-WIKI already initialized at: ${config.outputDir}`);
    console.log("[wiki] Use --force to overwrite existing config.");
  } else {
    writeWikiConfig(config);
    console.log(`[wiki] Initialized SDTK-WIKI config: ${config.configPath}`);
    console.log(`[wiki] Project root:  ${config.projectPath}`);
    console.log(`[wiki] Output dir:    ${config.outputDir}`);
    console.log(`[wiki] Legacy Atlas:  ${config.legacyAtlasDir}`);
    console.log(`[wiki] Scan roots:    ${config.scanRoots.join(", ")}`);
  }
  console.log(`[wiki] Workspace:     ${workspace.workspaceRoot}`);
  console.log(`[wiki] Manifest:      ${workspace.manifestPath}`);

  if (flags["no-build"]) {
    console.log("[wiki] --no-build specified; skipping initial build.");
    return 0;
  }

  console.log("");
  const buildResult = await runBuild(config);
  console.log(`[wiki] Build complete: ${buildResult.docCount} docs, ${buildResult.nodeCount} nodes, ${buildResult.edgeCount} edges.`);

  if (flags["no-open"]) {
    console.log("[wiki] --no-open specified; skipping viewer launch.");
    return 0;
  }

  const { openViewer } = require("../lib/wiki-runner");
  const { url } = await openViewer(config, false);
  console.log(`[wiki] Viewer: ${url}`);
  return 0;
}

module.exports = {
  cmdInit,
  cmdInitHelp,
};
