"use strict";

// BK-272: sdtk-wiki kanban — open the viewer on the Dashboard (Kanban board) panel.
// Follows the same flow as cmdAtlasOpen; Dashboard is the default active panel.

const fs = require("fs");
const path = require("path");
const { resolveWikiConfig } = require("../lib/wiki-config");
const { openViewer, runBuild } = require("../lib/wiki-runner");
const { parseFlags } = require("../lib/args");
const { OPEN_FLAG_DEFS } = require("../lib/wiki-flags");

const KANBAN_FLAG_DEFS = {
  ...OPEN_FLAG_DEFS,
  "project-path": { type: "string", alias: "project" },
};

function hasHelp(args) {
  return args.includes("-h") || args.includes("--help");
}

async function cmdKanban(args) {
  if (hasHelp(args)) {
    console.log(`Usage:
  sdtk-wiki kanban [--project <dir>] [--port <n>] [--no-open]

Purpose:
  Open the SDTK-WIKI viewer showing the Agent Kanban board (Dashboard panel).
  The board reads SHARED_PLANNING.md and QUALITY_CHECKLIST.md from the project
  directory and polls /api/kanban every 3 s while the Dashboard panel is active.

Options:
  --project, --project-path <dir>  Project root containing SHARED_PLANNING.md
                                   and QUALITY_CHECKLIST.md (default: cwd)
  --host <host>                    Local server host (default: 127.0.0.1)
  --port <n>                       Local server port (default: from config or 7654)
  --workspace <name=path>          Register an extra viewer workspace (repeatable)
  --no-open                        Print the viewer URL without opening a browser
  --tunnel                         Expose the board via a public cloudflared URL
                                   for a host browser (use inside Docker/WSL2).
                                   Requires cloudflared; Ctrl+C stops both.
  -h, --help                       Show this help and exit

Example:
  sdtk-wiki kanban --project /path/to/project
  sdtk-wiki kanban --no-open`);
    return 0;
  }

  const { flags } = parseFlags(args, KANBAN_FLAG_DEFS);
  const config = resolveWikiConfig(flags);

  console.log("[kanban] Building doc graph (native Node)...");
  try {
    await runBuild(config);
  } catch (err) {
    console.error("[kanban] Build error: " + err.message);
    console.error("[kanban] Docs View / Knowledge Graph may be stale. Opening any existing viewer.");
  }

  const viewerPath = path.join(config.outputDir, "viewer.html");
  const legacyViewerPath = path.join(config.legacyAtlasDir || "", "viewer.html");

  // Use legacy atlas dir if the wiki output dir has no viewer yet
  const activeConfig = fs.existsSync(viewerPath)
    ? config
    : { ...config, outputDir: config.legacyAtlasDir };

  const noOpen = !!flags["no-open"];
  // BK-354 F-3: --no-open must KEEP the server alive (parity with
  // `atlas open --no-open`). It is the remote/headless/tunnel flag — closing
  // the server here left the printed URL dead on arrival, which made the kanban
  // command unusable for the exact dashboard/tunnel scenario it exists for.
  await openViewer(activeConfig, noOpen);

  console.log("[kanban] Dashboard (Kanban board) is the active panel.");
  console.log("[kanban] Edit SHARED_PLANNING.md or QUALITY_CHECKLIST.md to see live updates.");
  console.log("[kanban] Press Ctrl+C to stop the viewer server.");
  await new Promise(() => {});
  return 0;
}

module.exports = { cmdKanban };
