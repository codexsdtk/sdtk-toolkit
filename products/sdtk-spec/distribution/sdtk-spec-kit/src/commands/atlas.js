"use strict";

const fs = require("fs");
const path = require("path");
const { parseFlags } = require("../lib/args");
const {
  resolveAtlasConfig,
  writeAtlasConfig,
  isAtlasInitialized,
  isAtlasBuilt,
  readBuildMeta,
  readGraphMeta,
} = require("../lib/atlas-config");
const { runBuild, openViewer } = require("../lib/atlas-runner");
const { ValidationError } = require("../lib/errors");

// ---------------------------------------------------------------------------
// Shared flag definitions
// ---------------------------------------------------------------------------
const BASE_FLAG_DEFS = {
  "project-path": { type: "string" },
  "output-dir": { type: "string" },
  "scan-root": { type: "string" },
  verbose: { type: "boolean" },
};

const OPEN_FLAG_DEFS = {
  ...BASE_FLAG_DEFS,
  host: { type: "string" },
  port: { type: "string" },
  "no-open": { type: "boolean" },
};

const INIT_FLAG_DEFS = {
  ...OPEN_FLAG_DEFS,
  force: { type: "boolean" },
  "no-build": { type: "boolean" },
};

const WATCH_FLAG_DEFS = {
  ...BASE_FLAG_DEFS,
  port: { type: "string" },
  "no-open": { type: "boolean" },
};

// ---------------------------------------------------------------------------
// Flag parsing with repeatable --scan-root support
// ---------------------------------------------------------------------------

/**
 * Parse args and collect repeated --scan-root values into an array.
 * The base parseFlags only captures the last value for string flags.
 * This thin wrapper collects all occurrences.
 */
function parseAtlasFlags(args, defs) {
  const scanRoots = [];
  // Collect raw --scan-root values before parseFlags strips them
  const filteredArgs = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--scan-root") {
      i++;
      if (i < args.length) {
        scanRoots.push(args[i]);
        i++;
      }
    } else if (arg.startsWith("--scan-root=")) {
      scanRoots.push(arg.slice("--scan-root=".length));
      i++;
    } else {
      filteredArgs.push(arg);
      i++;
    }
  }

  const { flags, positional } = parseFlags(filteredArgs, defs);
  // Inject the collected scan roots as an array
  flags["scan-root"] = scanRoots.length > 0 ? scanRoots : undefined;
  return { flags, positional };
}

// ---------------------------------------------------------------------------
// atlas init
// ---------------------------------------------------------------------------
async function cmdAtlasInit(args) {
  const { flags } = parseAtlasFlags(args, INIT_FLAG_DEFS);
  const config = resolveAtlasConfig(flags);

  if (isAtlasInitialized(config.outputDir) && !flags.force) {
    console.log(`[atlas] Atlas already initialized at: ${config.outputDir}`);
    console.log("[atlas] Use --force to overwrite existing config.");
  } else {
    writeAtlasConfig(config);
    console.log(`[atlas] Initialized Atlas config: ${config.configPath}`);
    console.log(`[atlas] Project root:  ${config.projectPath}`);
    console.log(`[atlas] Output dir:    ${config.outputDir}`);
    console.log(`[atlas] Scan roots:    ${config.scanRoots.join(", ")}`);
  }

  if (flags["no-build"]) {
    console.log("[atlas] --no-build specified; skipping initial build.");
    return 0;
  }

  console.log("");
  const buildResult = await runBuild(config);
  console.log(`[atlas] Build complete: ${buildResult.docCount} docs, ${buildResult.nodeCount} nodes, ${buildResult.edgeCount} edges.`);

  if (flags["no-open"]) {
    console.log("[atlas] --no-open specified; skipping viewer launch.");
    return 0;
  }

  const { url } = await openViewer(config, false);
  console.log(`[atlas] Viewer: ${url}`);
  return 0;
}

// ---------------------------------------------------------------------------
// atlas build
// ---------------------------------------------------------------------------
async function cmdAtlasBuild(args) {
  const { flags } = parseAtlasFlags(args, BASE_FLAG_DEFS);
  const config = resolveAtlasConfig(flags);

  if (!isAtlasInitialized(config.outputDir)) {
    console.log("[atlas] Atlas not initialized. Run: sdtk-spec atlas init");
    console.log(`[atlas] Output dir: ${config.outputDir}`);
  }

  const startMs = Date.now();
  const buildResult = await runBuild(config);
  const durationMs = Date.now() - startMs;

  console.log("");
  console.log("[atlas] Build summary:");
  console.log(`  Documents:  ${buildResult.docCount}`);
  console.log(`  Graph nodes: ${buildResult.nodeCount}`);
  console.log(`  Graph edges: ${buildResult.edgeCount}`);
  console.log(`  Output dir:  ${config.outputDir}`);
  console.log(`  Duration:    ${(durationMs / 1000).toFixed(1)}s`);
  if (buildResult.generated) {
    console.log(`  Generated:   ${buildResult.generated}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// atlas open
// ---------------------------------------------------------------------------
async function cmdAtlasOpen(args) {
  const { flags } = parseAtlasFlags(args, OPEN_FLAG_DEFS);
  const config = resolveAtlasConfig(flags);

  if (!isAtlasBuilt(config.outputDir)) {
    console.error("[atlas] No atlas build found.");
    console.error(`  Expected: ${config.outputDir}/viewer.html`);
    console.error("  Run: sdtk-spec atlas init");
    console.error("  Or:  sdtk-spec atlas build");
    return 1;
  }

  const noOpen = !!flags["no-open"];
  const { url } = await openViewer(config, noOpen);

  if (!noOpen) {
    // If the server was started inline, keep it alive until user exits
    console.log("[atlas] Press Ctrl+C to stop the viewer server.");
    await new Promise(() => {}); // keep alive
  }

  return 0;
}

// ---------------------------------------------------------------------------
// atlas watch
// ---------------------------------------------------------------------------
async function cmdAtlasWatch(args) {
  const { flags } = parseAtlasFlags(args, WATCH_FLAG_DEFS);
  const config = resolveAtlasConfig(flags);

  if (!isAtlasInitialized(config.outputDir)) {
    console.log("[atlas] Atlas not initialized. Running init first...");
    writeAtlasConfig(config);
    console.log(`[atlas] Initialized Atlas config: ${config.configPath}`);
  }

  const DEBOUNCE_MS = 800;
  let debounceTimer = null;
  let rebuilding = false;

  async function rebuild(reason) {
    if (rebuilding) return;
    rebuilding = true;
    console.log(`\n[atlas] Change detected (${reason}). Rebuilding...`);
    try {
      const buildResult = await runBuild(config);
      console.log(`[atlas] Rebuild complete: ${buildResult.docCount} docs, ${buildResult.nodeCount} nodes.`);
    } catch (err) {
      console.error(`[atlas] Rebuild failed: ${err.message}`);
    } finally {
      rebuilding = false;
    }
  }

  // Initial build
  console.log("[atlas] Running initial build...");
  try {
    const buildResult = await runBuild(config);
    console.log(`[atlas] Initial build complete: ${buildResult.docCount} docs.`);
  } catch (err) {
    console.error(`[atlas] Initial build failed: ${err.message}`);
    // Continue watching even if initial build fails
  }

  // Open viewer unless --no-open
  let viewerServer = null;
  if (!flags["no-open"] && isAtlasBuilt(config.outputDir)) {
    const result = await openViewer(config, false);
    viewerServer = result.server;
  }

  // Watch each scan root for markdown changes
  const watchers = [];
  for (const scanRoot of config.scanRoots) {
    if (!fs.existsSync(scanRoot)) {
      console.log(`[atlas] Warning: scan root does not exist, skipping watch: ${scanRoot}`);
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
        console.error(`[atlas] Watch error on ${scanRoot}: ${err.message}`);
      });

      watchers.push(watcher);
      console.log(`[atlas] Watching: ${scanRoot}`);
    } catch (err) {
      console.error(`[atlas] Could not watch ${scanRoot}: ${err.message}`);
    }
  }

  if (watchers.length === 0) {
    console.error("[atlas] No scan roots could be watched. Exiting.");
    return 1;
  }

  console.log("[atlas] Watching for markdown changes. Press Ctrl+C to stop.");

  // Graceful shutdown
  function shutdown() {
    console.log("\n[atlas] Stopping watch...");
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

  // Keep process alive
  await new Promise(() => {});
  return 0;
}

// ---------------------------------------------------------------------------
// atlas status
// ---------------------------------------------------------------------------
async function cmdAtlasStatus(args) {
  const { flags } = parseAtlasFlags(args, BASE_FLAG_DEFS);

  // Use defaults-only resolution (no validation errors for status)
  let config;
  try {
    config = resolveAtlasConfig(flags);
  } catch (err) {
    console.error(`[atlas] Config error: ${err.message}`);
    return 1;
  }

  const initialized = isAtlasInitialized(config.outputDir);
  const built = isAtlasBuilt(config.outputDir);

  console.log("[atlas] Status");
  console.log("=".repeat(40));
  console.log(`  Initialized:   ${initialized ? "yes" : "no"}`);
  console.log(`  Built:         ${built ? "yes" : "no"}`);
  console.log(`  Project root:  ${config.projectPath}`);
  console.log(`  Output dir:    ${config.outputDir}`);
  console.log(`  Scan roots:    ${config.scanRoots.join(", ")}`);
  console.log(`  Viewer host:   ${config.host}:${config.port}`);

  if (built) {
    const meta = readBuildMeta(config.outputDir);
    const graphMeta = readGraphMeta(config.outputDir);
    if (meta) {
      console.log(`  Last build:    ${meta.generated || "unknown"}`);
      console.log(`  Documents:     ${meta.count}`);
    }
    if (graphMeta) {
      console.log(`  Graph nodes:   ${graphMeta.nodeCount}`);
      console.log(`  Graph edges:   ${graphMeta.edgeCount}`);
    }
  }

  if (!initialized) {
    console.log("");
    console.log("[atlas] Hint: run 'sdtk-spec atlas init' to initialize Atlas for this project.");
  } else if (!built) {
    console.log("");
    console.log("[atlas] Hint: run 'sdtk-spec atlas build' to build the local document graph.");
  }

  return 0;
}


// ---------------------------------------------------------------------------
// Top-level atlas dispatcher
// ---------------------------------------------------------------------------
const ATLAS_SUBCOMMANDS = new Set(["init", "build", "open", "watch", "status"]);

async function cmdAtlas(args) {
  if (!args || args.length === 0) {
    console.error("[atlas] Usage: sdtk-spec atlas <subcommand> [options]");
    console.error("  Subcommands: init, build, open, watch, status");
    console.error("  Run 'sdtk-spec --help' for full usage.");
    return 1;
  }

  const [subcommand, ...rest] = args;

  if (!ATLAS_SUBCOMMANDS.has(subcommand)) {
    throw new ValidationError(
      `Unknown atlas subcommand: "${subcommand}". Valid subcommands: init, build, open, watch, status.`
    );
  }

  switch (subcommand) {
    case "init":
      return cmdAtlasInit(rest);
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
  cmdAtlas,
};

