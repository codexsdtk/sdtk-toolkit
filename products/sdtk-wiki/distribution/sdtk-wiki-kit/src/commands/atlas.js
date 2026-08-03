"use strict";

const fs = require("fs");
const { ValidationError } = require("../lib/errors");
const {
  isWikiBuilt,
  isWikiInitialized,
  readBuildMeta,
  readGraphMeta,
  resolveWikiConfig,
  writeWikiConfig,
} = require("../lib/wiki-config");
const { ensureWorkspace, getWorkspaceStatus } = require("../lib/wiki-workspace");
const { openViewer, runBuild } = require("../lib/wiki-runner");
const { readWorkspaces, addWorkspace, injectWorkspacesNav } = require("../lib/wiki-workspaces");
const {
  BASE_FLAG_DEFS,
  OPEN_FLAG_DEFS,
  WATCH_FLAG_DEFS,
  parseWikiFlags,
} = require("../lib/wiki-flags");

const ATLAS_COMMANDS = new Set(["build", "open", "watch", "status"]);

function hasHelp(args) {
  return args.includes("-h") || args.includes("--help");
}

function cmdAtlasOverviewHelp() {
  console.log(`Usage:
  sdtk-wiki atlas <command> --help

Commands:
  build       SDTK-WIKI graph build via the atlas compatibility namespace.
  open        SDTK-WIKI viewer open via the atlas compatibility namespace.
  watch       SDTK-WIKI watcher via the atlas compatibility namespace.
  status      SDTK-WIKI graph status via the atlas compatibility namespace.

Compatibility:
  "atlas" remains the R1 compatibility namespace for existing workflows.
  sdtk-wiki defaults to .sdtk/wiki/graph.
  Legacy .sdtk/atlas remains readable and is never auto-deleted.`);
  return 0;
}

function cmdAtlasSubcommandHelp(subcommand) {
  const descriptions = {
    build: "Build the SDTK-WIKI graph from project-local sources.",
    open: "Open the SDTK-WIKI graph viewer.",
    watch: "Watch project-local sources and refresh the graph.",
    status: "Report SDTK-WIKI graph workspace status.",
  };

  const baseOptions = `  --project-path <path>       Project root. Defaults to the current directory.
  --output-dir <path>         Graph output dir. Defaults to .sdtk/wiki/graph.
  --scan-root <path>          Repeatable markdown scan root (defaults from config).
  --workspace <name=path>     Register an extra workspace (e.g. a brain vault)
                              in the viewer switcher. Repeatable.
  --verbose                   Print builder details.
  -h, --help                  Show this help.`;

  const serveOptions = `  --port <port>               Viewer port. Defaults to 8765.
  --no-open                   Start the viewer server without launching a
                              browser (stays alive until Ctrl+C).
  --tunnel                    Expose the viewer via a public cloudflared URL
                              for a host browser (use inside Docker/WSL2).
                              Requires cloudflared; Ctrl+C stops both.`;
  const hostOption = `  --host <host>               Viewer host. Defaults to 127.0.0.1.`;

  const optionBlocks = {
    build: baseOptions,
    open: `${baseOptions}\n${hostOption}\n${serveOptions}`,
    watch: `${baseOptions}\n${serveOptions}`,
    status: baseOptions,
  };

  console.log(`Usage:
  sdtk-wiki atlas ${subcommand} [options]

Purpose:
  ${descriptions[subcommand]}

Options:
${optionBlocks[subcommand]}

Workspace:
  Graph target: .sdtk/wiki/graph (legacy .sdtk/atlas remains readable).
  Local and deterministic — no activation, network, or LLM involved.`);
  return 0;
}

async function cmdAtlasBuild(args) {
  const { flags } = parseWikiFlags(args, BASE_FLAG_DEFS);
  const config = resolveWikiConfig(flags);
  ensureWorkspace(config.projectPath, config.outputDir);

  if (!isWikiInitialized(config.outputDir)) {
    console.log("[wiki] SDTK-WIKI not initialized. Run: sdtk-wiki init");
    console.log(`[wiki] Output dir: ${config.outputDir}`);
  }

  // BK-319 (L-6): register + render the multi-workspace switcher at build time.
  if (flags.workspace) {
    addWorkspace(config.outputDir, flags.workspace);
  }
  const startMs = Date.now();
  const buildResult = await runBuild(config);
  const durationMs = Date.now() - startMs;
  injectWorkspacesNav(config.outputDir, readWorkspaces(config.outputDir));

  console.log("");
  console.log("[wiki] Build summary:");
  console.log(`  Documents:  ${buildResult.docCount}`);
  console.log(`  Graph nodes: ${buildResult.nodeCount}`);
  console.log(`  Graph edges: ${buildResult.edgeCount}`);
  console.log(`  Wiki pages:  ${buildResult.pageCount}`);
  console.log(`  Output dir:  ${config.outputDir}`);
  if (buildResult.provenancePath) {
    console.log(`  Provenance:  ${buildResult.provenancePath}`);
  }
  console.log(`  Duration:    ${(durationMs / 1000).toFixed(1)}s`);
  if (buildResult.generated) {
    console.log(`  Generated:   ${buildResult.generated}`);
  }
  return 0;
}

function resolveReadableViewerConfig(config) {
  if (isWikiBuilt(config.outputDir)) {
    return { config, source: "wiki" };
  }
  if (isWikiBuilt(config.legacyAtlasDir)) {
    return {
      config: {
        ...config,
        outputDir: config.legacyAtlasDir,
      },
      source: "legacy-atlas",
    };
  }
  return { config, source: "missing" };
}

async function cmdAtlasOpen(args) {
  const { flags } = parseWikiFlags(args, OPEN_FLAG_DEFS);
  const config = resolveWikiConfig(flags);
  // BK-319 (L-6): register + render the multi-workspace switcher.
  if (flags.workspace) {
    addWorkspace(config.outputDir, flags.workspace);
  }
  injectWorkspacesNav(config.outputDir, readWorkspaces(config.outputDir));
  const resolved = resolveReadableViewerConfig(config);

  if (resolved.source === "missing") {
    console.error("[wiki] No SDTK-WIKI graph build found.");
    console.error(`  Expected: ${config.outputDir}/viewer.html`);
    console.error(`  Legacy readable fallback: ${config.legacyAtlasDir}/viewer.html`);
    console.error("  Run: sdtk-wiki init");
    console.error("  Or:  sdtk-wiki atlas build");
    return 1;
  }

  if (resolved.source === "legacy-atlas") {
    console.log(`[wiki] Using legacy Atlas output read-only: ${resolved.config.outputDir}`);
    console.log("[wiki] No files will be migrated or deleted.");
  }

  const noOpen = !!flags["no-open"];
  await openViewer(resolved.config, noOpen);

  console.log("[wiki] Press Ctrl+C to stop the viewer server.");
  await new Promise(() => {});
  return 0;
}

async function cmdAtlasWatch(args) {
  const { flags } = parseWikiFlags(args, WATCH_FLAG_DEFS);
  const config = resolveWikiConfig(flags);

  if (!isWikiInitialized(config.outputDir)) {
    console.log("[wiki] SDTK-WIKI not initialized. Running init first...");
    writeWikiConfig(config);
    console.log(`[wiki] Initialized SDTK-WIKI config: ${config.configPath}`);
  }

  const DEBOUNCE_MS = 800;
  let debounceTimer = null;
  let rebuilding = false;

  async function rebuild(reason) {
    if (rebuilding) return;
    rebuilding = true;
    console.log(`\n[wiki] Change detected (${reason}). Rebuilding...`);
    try {
      const buildResult = await runBuild(config);
      console.log(`[wiki] Rebuild complete: ${buildResult.docCount} docs, ${buildResult.nodeCount} nodes, ${buildResult.pageCount} pages.`);
    } catch (err) {
      console.error(`[wiki] Rebuild failed: ${err.message}`);
    } finally {
      rebuilding = false;
    }
  }

  console.log("[wiki] Running initial build...");
  try {
    const buildResult = await runBuild(config);
    console.log(`[wiki] Initial build complete: ${buildResult.docCount} docs, ${buildResult.pageCount} pages.`);
  } catch (err) {
    console.error(`[wiki] Initial build failed: ${err.message}`);
  }

  let viewerServer = null;
  if (!flags["no-open"] && isWikiBuilt(config.outputDir)) {
    const result = await openViewer(config, false);
    viewerServer = result.server;
  }

  const watchers = [];
  for (const scanRoot of config.scanRoots) {
    if (!fs.existsSync(scanRoot)) {
      console.log(`[wiki] Warning: scan root does not exist, skipping watch: ${scanRoot}`);
      continue;
    }

    try {
      const watcher = fs.watch(scanRoot, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith(".md")) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          rebuild(`${eventType}: ${filename}`);
        }, DEBOUNCE_MS);
      });

      watcher.on("error", (err) => {
        console.error(`[wiki] Watch error on ${scanRoot}: ${err.message}`);
      });

      watchers.push(watcher);
      console.log(`[wiki] Watching: ${scanRoot}`);
    } catch (err) {
      console.error(`[wiki] Could not watch ${scanRoot}: ${err.message}`);
    }
  }

  if (watchers.length === 0) {
    console.error("[wiki] No scan roots could be watched. Exiting.");
    return 1;
  }

  console.log("[wiki] Watching for markdown changes. Press Ctrl+C to stop.");

  function shutdown() {
    console.log("\n[wiki] Stopping watch...");
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const w of watchers) {
      try { w.close(); } catch (_) {}
    }
    if (viewerServer) {
      try { viewerServer.close(); } catch (_) {}
    }
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
  return 0;
}

async function cmdAtlasStatus(args) {
  const { flags } = parseWikiFlags(args, BASE_FLAG_DEFS);
  let config;
  try {
    config = resolveWikiConfig(flags);
  } catch (err) {
    console.error(`[wiki] Config error: ${err.message}`);
    return 1;
  }

  const initialized = isWikiInitialized(config.outputDir);
  const built = isWikiBuilt(config.outputDir);
  const legacyBuilt = isWikiBuilt(config.legacyAtlasDir);
  const workspaceStatus = getWorkspaceStatus(config.projectPath);

  console.log("[wiki] Status");
  console.log("=".repeat(40));
  console.log(`  Initialized:       ${initialized ? "yes" : "no"}`);
  console.log(`  Built:             ${built ? "yes" : "no"}`);
  console.log(`  Manifest:          ${workspaceStatus.manifestExists ? "yes" : "no"}`);
  console.log(`  Schema version:    ${workspaceStatus.schemaVersion || "n/a"}`);
  console.log(`  Legacy readable:   ${legacyBuilt ? "yes" : "no"}`);
  console.log(`  Project root:      ${config.projectPath}`);
  console.log(`  Workspace root:    ${workspaceStatus.workspace.workspaceRoot}`);
  console.log(`  Output dir:        ${config.outputDir}`);
  console.log(`  Legacy Atlas dir:  ${config.legacyAtlasDir}`);
  console.log(`  Scan roots:        ${config.scanRoots.join(", ")}`);
  console.log(`  Viewer host:       ${config.host}:${config.port}`);

  if (built) {
    const meta = readBuildMeta(config.outputDir);
    const graphMeta = readGraphMeta(config.outputDir);
    if (meta) {
      console.log(`  Last build:        ${meta.generated || "unknown"}`);
      console.log(`  Documents:         ${meta.count}`);
    }
    if (graphMeta) {
      console.log(`  Graph nodes:       ${graphMeta.nodeCount}`);
      console.log(`  Graph edges:       ${graphMeta.edgeCount}`);
    }
  } else if (legacyBuilt) {
    console.log("");
    console.log("[wiki] Legacy .sdtk/atlas build is readable for open/status fallback.");
    console.log("[wiki] It will not be auto-migrated or deleted.");
  }

  if (!initialized) {
    console.log("");
    console.log("[wiki] Hint: run 'sdtk-wiki init' to initialize SDTK-WIKI for this project.");
  } else if (!built) {
    console.log("");
    console.log("[wiki] Hint: run 'sdtk-wiki atlas build' to build the local document graph.");
  }

  return 0;
}

async function cmdAtlas(args) {
  if (!args || args.length === 0) {
    return cmdAtlasOverviewHelp();
  }

  const [subcommand, ...rest] = args;
  if (subcommand === "-h" || subcommand === "--help") {
    return cmdAtlasOverviewHelp();
  }

  if (!ATLAS_COMMANDS.has(subcommand)) {
    throw new ValidationError(
      `Unknown atlas command: "${subcommand}". Run "sdtk-wiki atlas --help".`
    );
  }

  if (hasHelp(rest)) {
    return cmdAtlasSubcommandHelp(subcommand);
  }

  switch (subcommand) {
    case "build":
      return cmdAtlasBuild(rest);
    case "open":
      return cmdAtlasOpen(rest);
    case "watch":
      return cmdAtlasWatch(rest);
    case "status":
      return cmdAtlasStatus(rest);
  }
}

module.exports = {
  ATLAS_COMMANDS,
  cmdAtlas,
  cmdAtlasOverviewHelp,
  cmdAtlasSubcommandHelp,
};
