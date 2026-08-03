"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { CliError } = require("./errors");
const { openBrowser } = require("./browser-open");
const { startTunnel, isContainer } = require("./tunnel");
const { parseKanban } = require("./wiki-kanban-parse");
const { buildAtlas } = require("./wiki-build");
const askServer = require("./wiki-ask-server");
const { getWikiGraphPath } = require("./wiki-paths");
const designFeedback = require("./design-feedback");

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-cache",
};

// BK-354 F-1: read-only intake of the agent-runtime ledger for the Runs lane.
// Reads .sdtk/agent-runtime/runs/<id>/state.json under the project root only.
// Never writes; every failure degrades to an empty list (the board must never
// hard-fail because a run's state is missing or malformed).
function readAgentRunStates(projectRoot) {
  const runsDir = path.join(projectRoot, ".sdtk", "agent-runtime", "runs");
  let entries;
  try {
    if (!fs.existsSync(runsDir)) return [];
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const states = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const statePath = path.join(runsDir, ent.name, "state.json");
    // Path containment: the resolved file must stay under runsDir.
    if (!statePath.startsWith(runsDir + path.sep)) continue;
    try {
      if (!fs.existsSync(statePath)) continue;
      states.push(JSON.parse(fs.readFileSync(statePath, "utf-8")));
    } catch (_) {
      // Skip an unreadable/corrupt run; keep the rest of the lane.
    }
  }
  return states;
}

const HEALTH_CHECK_RETRIES = 20;
const HEALTH_CHECK_INTERVAL_MS = 300;

// BK-278 — Design tab assets. The style catalog is a checked-in snapshot of
// sdtk-design-kit's styleCatalog() so the wiki server NEVER requires the
// design-kit at runtime (kits stay decoupled / independently versioned).
const _DESIGN_ASSETS_DIR = path.join(__dirname, "..", "..", "assets", "atlas");
const _STYLE_CATALOG_PATH = path.join(_DESIGN_ASSETS_DIR, "style-catalog.json");
const _DESIGN_PREVIEWS_DIR = path.join(_DESIGN_ASSETS_DIR, "design-previews");

let _styleCatalogCache = null;
function loadStyleCatalog() {
  if (_styleCatalogCache) return _styleCatalogCache;
  try {
    const raw = fs.readFileSync(_STYLE_CATALOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    _styleCatalogCache = Array.isArray(parsed.styles) ? parsed.styles : [];
  } catch (_) {
    _styleCatalogCache = [];
  }
  return _styleCatalogCache;
}

// A preset id is valid only if it appears in the catalog AND is a plain slug
// (defense-in-depth against path traversal in /api/style-preview/<preset>).
function isKnownPresetId(id) {
  if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) return false;
  return loadStyleCatalog().some((s) => s && s.name === id);
}

// BK-279 — in-viewer design pipeline runs. The annotate bridge is injected into
// prototype screens served with ?annotate=1.
const _DESIGN_BRIDGE_PATH = path.join(_DESIGN_ASSETS_DIR, "design-annotate-bridge.js");
const DESIGN_RUN_MAX_IDEA = 1000;

let _bridgeCache = null;
function loadAnnotateBridge() {
  if (_bridgeCache != null) return _bridgeCache;
  try {
    _bridgeCache = fs.readFileSync(_DESIGN_BRIDGE_PATH, "utf-8");
  } catch (_) {
    _bridgeCache = "";
  }
  return _bridgeCache;
}

// Inject the annotate bridge <script> before </body> (or append). The bridge is
// trusted kit-bundled JS; the screen HTML is the only untrusted input and it is
// not interpolated into a script string, so there is no breakout vector here.
function injectAnnotateBridge(html) {
  const bridge = loadAnnotateBridge();
  if (!bridge) return html;
  const tag = `<script data-sdtk-bridge>\n${bridge}\n</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}\n</body>`);
  return html + tag;
}

async function runBuild(config) {
  const result = await buildAtlas({
    projectRoot: config.projectPath,
    outputDir: config.outputDir,
    scanRoots: config.scanRoots && config.scanRoots.length ? config.scanRoots : null,
    excludes: config.excludes && config.excludes.length ? config.excludes : null,
    archiveFrags: config.archive && config.archive.length ? config.archive : null,
    verbose: !!config.verbose,
  });
  return {
    docCount: result.doc_count || 0,
    nodeCount: result.node_count || 0,
    edgeCount: result.edge_count || 0,
    generated: result.generated || "",
    pageCount: result.page_count || 0,
    pagesRoot: result.pages_root || "",
    pageIndexPath: result.page_index_path || "",
    provenancePath: result.provenance_path || "",
    changesPath: result.changes_path || "",
  };
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(host, port) {
  for (let i = 0; i < HEALTH_CHECK_RETRIES; i++) {
    const ok = await isPortOpen(host, port);
    if (ok) return;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }
  throw new CliError(
    `SDTK-WIKI viewer server did not start on http://${host}:${port}\n` +
      "Try passing a different --port if the port is occupied."
  );
}

function probeUrl(url) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch (_) {
      resolve({ ok: false, statusCode: 0, body: "" });
      return;
    }

    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(
      target,
      { method: "GET", timeout: 1200 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (body.length < 512) {
            body += chunk.slice(0, 512 - body.length);
          }
        });
        res.on("end", () => {
          const statusCode = res.statusCode || 0;
          resolve({
            ok: statusCode >= 200 && statusCode < 300,
            statusCode,
            body,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0, body: "" });
    });
    req.on("error", () => resolve({ ok: false, statusCode: 0, body: "" }));
    req.end();
  });
}

async function probeExistingWikiServer(host, port, viewerUrl, expectedProjectPath) {
  const health = await probeUrl(`http://${host}:${port}/api/health`);
  const viewer = await probeUrl(`${viewerUrl}?embedded=1&probe=1`);

  let servedProjectPath = null;
  if (health.ok && health.body) {
    try {
      servedProjectPath = JSON.parse(health.body).project_path || null;
    } catch (_) {}
  }

  // Treat as same project when either side doesn't advertise a path (old server).
  const sameProject =
    !expectedProjectPath || !servedProjectPath || servedProjectPath === expectedProjectPath;

  return {
    reusable: health.ok && viewer.ok && sameProject,
    sameProject,
    servedProjectPath,
    health: { ok: health.ok, statusCode: health.statusCode },
    viewer: { ok: viewer.ok, statusCode: viewer.statusCode },
  };
}

async function findFreePort(host, startPort) {
  for (let p = startPort; p < startPort + 20; p++) {
    const busy = await isPortOpen(host, p);
    if (!busy) return p;
  }
  throw new CliError(
    `Could not find a free port in range ${startPort}–${startPort + 19}. Stop unused viewer servers and try again.`
  );
}

function startWikiServer(host, port, outputDir, projectPath) {
  return new Promise((resolve, reject) => {
    const MIME_TYPES = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".md": "text/plain; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
    };

    const askCtx = {
      projectPath: projectPath || outputDir,
      graphPath: getWikiGraphPath(projectPath || outputDir),
      maxSources: askServer.DEFAULT_MAX_SOURCES,
      defaultUiRuntime: "claude",
      defaultModel: "claude-sonnet-4-6",
    };

    // BK-279 — in-memory design pipeline runs (one active at a time per server).
    // runId → { buffer:[{event,data}], listeners:Set<res>, done:bool, code:int|null, child }
    const designRuns = new Map();
    let activeDesignRunId = null;

    function designRunEmit(run, event, data) {
      const frame = { event, data };
      run.buffer.push(frame);
      if (run.buffer.length > 2000) run.buffer.shift();
      for (const sink of run.listeners) {
        try { sink.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
      }
    }

    // Finish a run once (idempotent): emit done, end live listeners, then drop the
    // run from the map after a grace window so the map cannot grow unbounded while
    // still allowing a late SSE connect to replay the buffer.
    function designRunFinish(runId, run, code) {
      if (run.done) return;
      run.done = true;
      run.code = code;
      designRunEmit(run, "done", { code });
      for (const sink of run.listeners) { try { sink.end(); } catch (_) {} }
      run.listeners.clear();
      if (activeDesignRunId === runId) activeDesignRunId = null;
      setTimeout(() => { designRuns.delete(runId); }, 60000).unref?.();
    }

    const server = http.createServer((req, res) => {
      const url = req.url || "/";
      const method = (req.method || "GET").toUpperCase();
      const pathOnly = url.split("?")[0];

      if (url === "/api/health" || url === "/api/health/") {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(askServer.healthPayload(askCtx)));
        return;
      }

      // BK-274: in-browser Ask history (GET). Always JSON; client degrades on ok:false.
      if (pathOnly === "/api/atlas-ask-history") {
        const result = askServer.readAskHistory(askCtx.graphPath);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(result));
        return;
      }

      // BK-274: in-browser Ask (POST). Every path returns valid JSON — an Ask
      // route must NEVER fall through to the static handler (the original bug).
      if (pathOnly === "/api/atlas-ask") {
        if (method !== "POST") {
          res.writeHead(405, JSON_HEADERS);
          res.end(JSON.stringify({ ok: false, error: "Method not allowed.", code: "method_not_allowed" }));
          return;
        }
        let body = "";
        let aborted = false;
        req.on("data", (chunk) => {
          if (aborted) {
            return;
          }
          body += chunk;
          if (body.length > askServer.MAX_BODY_BYTES) {
            aborted = true;
            res.writeHead(413, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Request body too large.", code: "validation_error" }));
            req.destroy();
          }
        });
        req.on("end", () => {
          if (aborted) {
            return;
          }
          let payload;
          try {
            payload = body ? JSON.parse(body) : {};
          } catch (_) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Invalid JSON body.", code: "validation_error" }));
            return;
          }
          askServer
            .answerForViewer(payload, askCtx)
            .then((result) => {
              res.writeHead(200, JSON_HEADERS);
              res.end(JSON.stringify(result));
            })
            .catch((err) => {
              const status = err && err.httpStatus ? err.httpStatus : 500;
              const code = err && err.code ? err.code : "internal_error";
              res.writeHead(status, JSON_HEADERS);
              res.end(
                JSON.stringify({
                  ok: false,
                  error: err && err.message ? err.message : String(err),
                  code,
                })
              );
            });
        });
        req.on("error", () => {
          if (aborted) {
            return;
          }
          try {
            res.writeHead(500, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Request stream error.", code: "internal_error" }));
          } catch (_) {
            // response already partially sent; nothing further to do.
          }
        });
        return;
      }

      if (url === "/api/kanban" || url === "/api/kanban/") {
        const projectRoot = projectPath || outputDir;
        let planningText = null;
        let qualityText = null;

        const planningFile = path.resolve(projectRoot, "SHARED_PLANNING.md");
        const qualityFile = path.resolve(projectRoot, "QUALITY_CHECKLIST.md");
        const inRoot = (f) =>
          f.startsWith(projectRoot + path.sep) || f === projectRoot;

        let sourceMtimeMs = null;
        try {
          if (inRoot(planningFile) && fs.existsSync(planningFile)) {
            planningText = fs.readFileSync(planningFile, "utf-8");
            sourceMtimeMs = fs.statSync(planningFile).mtimeMs;
          }
        } catch (_) {}
        try {
          if (inRoot(qualityFile) && fs.existsSync(qualityFile)) {
            qualityText = fs.readFileSync(qualityFile, "utf-8");
            const qm = fs.statSync(qualityFile).mtimeMs;
            // BK-355b: "movement" = the newest edit across either source file.
            sourceMtimeMs = sourceMtimeMs === null ? qm : Math.max(sourceMtimeMs, qm);
          }
        } catch (_) {}

        // BK-354 F-1: read-only Runs lane fed from the agent-runtime ledger.
        const agentRunStates = readAgentRunStates(projectRoot);

        let viewModel;
        try {
          viewModel = parseKanban({
            planningText,
            qualityText,
            now: new Date(),
            sourceMtimeMs,
            agentRunStates,
          });
        } catch (e) {
          viewModel = {
            meta: {
              errors: ["Server error: " + e.message],
              pipelinePresent: false,
              qualityPresent: false,
              staleMinutes: null,
            },
            agents: [],
            pipeline: { cards: [] },
            quality: { cards: [] },
            runs: [],
          };
        }

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        });
        res.end(JSON.stringify(viewModel));
        return;
      }

      if (url.startsWith("/api/note")) {
        const qs = new URL(url, `http://${host}:${port}`).searchParams;
        const notePath = qs.get("path");
        if (!notePath) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing path parameter" }));
          return;
        }

        const projectRoot = projectPath || outputDir;
        const resolved = path.resolve(projectRoot, notePath);
        if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Access denied" }));
          return;
        }

        if (!fs.existsSync(resolved)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }

        try {
          const content = fs.readFileSync(resolved, "utf-8");
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(content);
        } catch (_) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Read error" }));
        }
        return;
      }

      // BK-278 P-B — Design tab read routes. All return valid shapes even when
      // files are absent (graceful empty-state, never a hard-fail), and never
      // fall through to the static handler.

      // GET /api/design-manifest → prototype screen list (or {screens:[]}).
      if (pathOnly === "/api/design-manifest") {
        const projectRoot = projectPath || outputDir;
        const manifestPath = path.resolve(
          projectRoot,
          "docs",
          "design",
          "prototype",
          ".manifest.json"
        );
        let screens = [];
        try {
          if (fs.existsSync(manifestPath)) {
            const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            if (Array.isArray(parsed.screens)) {
              screens = parsed.screens.map((s) => ({
                screenId: s.screenId,
                title: s.title || s.screenId,
                role: s.role || "",
              }));
            }
          }
        } catch (_) {
          screens = [];
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ screens }));
        return;
      }

      // GET /api/styles → display-safe style catalog snapshot.
      if (pathOnly === "/api/styles") {
        if (method !== "GET") {
          res.writeHead(405, JSON_HEADERS);
          res.end(JSON.stringify({ error: "Method not allowed.", code: "method_not_allowed" }));
          return;
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ styles: loadStyleCatalog() }));
        return;
      }

      // GET /api/style-preview/<preset> → bundled ~280x180 thumbnail HTML.
      if (pathOnly.startsWith("/api/style-preview/")) {
        // decodeURIComponent throws URIError on a malformed escape (e.g. "%");
        // treat that as an unknown preset rather than crashing the response.
        let presetId;
        try {
          presetId = decodeURIComponent(pathOnly.slice("/api/style-preview/".length));
        } catch (_) {
          res.writeHead(404, JSON_HEADERS);
          res.end(JSON.stringify({ error: "Unknown style preset." }));
          return;
        }
        if (!isKnownPresetId(presetId)) {
          res.writeHead(404, JSON_HEADERS);
          res.end(JSON.stringify({ error: "Unknown style preset." }));
          return;
        }
        const previewPath = path.join(_DESIGN_PREVIEWS_DIR, `${presetId}.html`);
        // presetId is slug-validated above; still confirm containment.
        if (!previewPath.startsWith(_DESIGN_PREVIEWS_DIR + path.sep) || !fs.existsSync(previewPath)) {
          res.writeHead(404, JSON_HEADERS);
          res.end(JSON.stringify({ error: "Preview not found." }));
          return;
        }
        try {
          const data = fs.readFileSync(previewPath);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
          res.end(data);
        } catch (_) {
          res.writeHead(500, JSON_HEADERS);
          res.end(JSON.stringify({ error: "Read error." }));
        }
        return;
      }

      // GET /api/design-run/<runId>/stream → SSE log of a running pipeline.
      if (pathOnly.startsWith("/api/design-run/") && pathOnly.endsWith("/stream")) {
        const runId = pathOnly.slice("/api/design-run/".length, -("/stream".length));
        const run = designRuns.get(runId);
        if (!run) {
          res.writeHead(404, JSON_HEADERS);
          res.end(JSON.stringify({ error: "Unknown run." }));
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        if (typeof res.flushHeaders === "function") res.flushHeaders();
        // Replay buffered frames, then attach (or close if already finished).
        for (const frame of run.buffer) {
          try { res.write(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`); } catch (_) {}
        }
        if (run.done) {
          res.end();
        } else {
          run.listeners.add(res);
          req.on("close", () => { run.listeners.delete(res); });
        }
        return;
      }

      // POST /api/design-run → spawn `sdtk-design start --idea --style` (argv array).
      if (pathOnly === "/api/design-run") {
        if (method !== "POST") {
          res.writeHead(405, JSON_HEADERS);
          res.end(JSON.stringify({ ok: false, error: "Method not allowed.", code: "method_not_allowed" }));
          return;
        }
        let body = "";
        let aborted = false;
        req.on("data", (chunk) => {
          if (aborted) return;
          body += chunk;
          if (body.length > 64 * 1024) {
            aborted = true;
            res.writeHead(413, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Request body too large." }));
            req.destroy();
          }
        });
        req.on("end", () => {
          if (aborted) return;
          let payload;
          try { payload = body ? JSON.parse(body) : {}; }
          catch (_) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Invalid JSON body." }));
            return;
          }
          const idea = typeof payload.idea === "string" ? payload.idea.trim() : "";
          const style = typeof payload.style === "string" ? payload.style.trim() : "";
          if (!idea) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Missing idea." }));
            return;
          }
          if (idea.length > DESIGN_RUN_MAX_IDEA) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: `idea exceeds ${DESIGN_RUN_MAX_IDEA} characters.` }));
            return;
          }
          if (!isKnownPresetId(style)) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Unknown style preset." }));
            return;
          }
          // Supersede any still-running pipeline (one active run per server).
          if (activeDesignRunId) {
            const prev = designRuns.get(activeDesignRunId);
            if (prev && prev.child && !prev.done) {
              try { prev.child.kill(); } catch (_) {}
            }
          }
          const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const run = { buffer: [], listeners: new Set(), done: false, code: null, child: null };
          designRuns.set(runId, run);
          activeDesignRunId = runId;

          const projectRoot = projectPath || outputDir;
          // argv array, shell:false — idea/style are never concatenated into a shell string.
          let child;
          try {
            child = spawn("sdtk-design", ["start", "--idea", idea, "--style", style, "--force"], {
              cwd: projectRoot,
              shell: false,
            });
          } catch (err) {
            run.done = true;
            res.writeHead(503, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: `Could not start sdtk-design: ${err.message}` }));
            return;
          }
          run.child = child;
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ ok: true, runId }));

          child.on("error", (err) => {
            const msg = err && err.code === "ENOENT"
              ? "sdtk-design is not on PATH. Install sdtk-kit (or sdtk-design-kit) to generate from the viewer."
              : `sdtk-design failed to start: ${err.message}`;
            designRunEmit(run, "error", { message: msg });
            designRunFinish(runId, run, -1);
          });
          const onLine = (stream) => (chunk) => {
            String(chunk).split(/\r?\n/).forEach((line) => {
              if (line.length) designRunEmit(run, "log", { stream, line });
            });
          };
          if (child.stdout) child.stdout.on("data", onLine("stdout"));
          if (child.stderr) child.stderr.on("data", onLine("stderr"));
          child.on("close", (code) => {
            designRunFinish(runId, run, code);
          });
        });
        req.on("error", () => {
          if (aborted) return;
          try { res.writeHead(500, JSON_HEADERS); res.end(JSON.stringify({ ok: false, error: "Request stream error." })); } catch (_) {}
        });
        return;
      }

      // POST /api/feedback → compile annotation marks into a DESIGN_FEEDBACK file.
      if (pathOnly === "/api/feedback") {
        if (method !== "POST") {
          res.writeHead(405, JSON_HEADERS);
          res.end(JSON.stringify({ ok: false, error: "Method not allowed.", code: "method_not_allowed" }));
          return;
        }
        let body = "";
        let aborted = false;
        req.on("data", (chunk) => {
          if (aborted) return;
          body += chunk;
          if (body.length > 512 * 1024) {
            aborted = true;
            res.writeHead(413, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Request body too large." }));
            req.destroy();
          }
        });
        req.on("end", () => {
          if (aborted) return;
          let payload;
          try { payload = body ? JSON.parse(body) : {}; }
          catch (_) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Invalid JSON body." }));
            return;
          }
          const marks = Array.isArray(payload.marks) ? payload.marks : [];
          if (marks.length === 0) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "No marks to send." }));
            return;
          }
          const projectRoot = projectPath || outputDir;
          const feedbackDir = path.resolve(projectRoot, "docs", "design", "feedback");
          const designDocsRoot = path.resolve(projectRoot, "docs", "design");
          const generatedAt = new Date();
          const markdown = designFeedback.compileFeedbackMarkdown(marks, {
            generatedAt: generatedAt.toISOString(),
          });
          const relPath = `docs/design/feedback/DESIGN_FEEDBACK_${designFeedback.feedbackStamp(generatedAt)}.md`;
          const outPath = path.resolve(projectRoot, relPath);
          // Containment guard: only ever write under docs/design/feedback.
          if (!outPath.startsWith(feedbackDir + path.sep) && outPath !== feedbackDir) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Refusing to write outside docs/design." }));
            return;
          }
          if (!feedbackDir.startsWith(designDocsRoot)) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: "Refusing to write outside docs/design." }));
            return;
          }
          try {
            fs.mkdirSync(feedbackDir, { recursive: true });
            fs.writeFileSync(outPath, markdown, "utf-8");
          } catch (err) {
            res.writeHead(500, JSON_HEADERS);
            res.end(JSON.stringify({ ok: false, error: `Could not write feedback: ${err.message}` }));
            return;
          }
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ ok: true, path: relPath, markCount: marks.length }));
        });
        req.on("error", () => {
          if (aborted) return;
          try { res.writeHead(500, JSON_HEADERS); res.end(JSON.stringify({ ok: false, error: "Request stream error." })); } catch (_) {}
        });
        return;
      }

      // GET /design/** → serve prototype screen files from the project's
      // docs/design/prototype/ directory (path-traversal guarded).
      if (pathOnly === "/design" || pathOnly.startsWith("/design/")) {
        const projectRoot = projectPath || outputDir;
        const protoRoot = path.resolve(projectRoot, "docs", "design", "prototype");
        const rel = pathOnly.slice("/design".length).replace(/^\/+/, "");
        const resolvedDesign = path.resolve(protoRoot, rel);
        if (!resolvedDesign.startsWith(protoRoot + path.sep) && resolvedDesign !== protoRoot) {
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end("403 Forbidden");
          return;
        }
        if (!fs.existsSync(resolvedDesign) || fs.statSync(resolvedDesign).isDirectory()) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
          return;
        }
        const dExt = path.extname(resolvedDesign).toLowerCase();
        const dType = MIME_TYPES[dExt] || "application/octet-stream";
        // BK-279: inject the annotate bridge into HTML screens when ?annotate=1.
        const wantsAnnotate = dExt === ".html" && /[?&]annotate=1(?:&|$)/.test(url);
        try {
          if (wantsAnnotate) {
            const html = injectAnnotateBridge(fs.readFileSync(resolvedDesign, "utf-8"));
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
            res.end(html);
          } else {
            const data = fs.readFileSync(resolvedDesign);
            res.writeHead(200, { "Content-Type": dType, "Cache-Control": "no-cache" });
            res.end(data);
          }
        } catch (_) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("500 Internal Server Error");
        }
        return;
      }

      let filePath = url.split("?")[0];
      if (filePath === "/" || filePath === "") {
        filePath = "/viewer.html";
      }

      const resolved = path.resolve(outputDir, filePath.replace(/^\/+/, ""));
      if (!resolved.startsWith(outputDir + path.sep) && resolved !== outputDir) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("403 Forbidden");
        return;
      }

      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
        return;
      }

      const ext = path.extname(resolved).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      try {
        const data = fs.readFileSync(resolved);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      } catch (_) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
      }
    });

    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new CliError(
            `Port ${port} is already in use on ${host}.\n` +
              "Pass --port <number> to use a different port, or stop the process using that port."
          )
        );
      } else {
        reject(new CliError(`SDTK-WIKI server error: ${err.message}`));
      }
    });

    // BK-279: kill any still-running design subprocess when the server closes
    // so a Ctrl+C on the viewer does not orphan an `sdtk-design start` child.
    server.once("close", () => {
      for (const run of designRuns.values()) {
        if (run.child && !run.done) {
          try { run.child.kill(); } catch (_) {}
        }
      }
    });

    server.listen(port, host, () => resolve(server));
  });
}

async function openViewer(config, noOpen = false) {
  const { host, outputDir } = config;
  let { port } = config;
  const alreadyRunning = await isPortOpen(host, port);

  let server = null;
  if (!alreadyRunning) {
    console.log(`[wiki] Starting local SDTK-WIKI viewer on http://${host}:${port} ...`);
    server = await startWikiServer(host, port, outputDir, config.projectPath);
    await waitForServer(host, port);
    console.log(`[wiki] Viewer server ready: http://${host}:${port}/viewer.html`);
  } else {
    const viewerUrlForProbe = `http://${host}:${port}/viewer.html`;
    const probe = await probeExistingWikiServer(host, port, viewerUrlForProbe, config.projectPath);

    if (probe.health.ok && probe.viewer.ok && probe.sameProject === false) {
      // Port occupied by a wiki server serving a different project → start on next free port.
      console.log(
        `[wiki] Port ${port} is serving a different project (${probe.servedProjectPath || "unknown"}).`
      );
      port = await findFreePort(host, port + 1);
      console.log(`[wiki] Starting new viewer for this project on http://${host}:${port} ...`);
      server = await startWikiServer(host, port, outputDir, config.projectPath);
      await waitForServer(host, port);
      console.log(`[wiki] Viewer server ready: http://${host}:${port}/viewer.html`);
    } else if (!probe.reusable) {
      throw new CliError(
        `Port ${port} is already occupied by an incompatible process.\n` +
          `  Health endpoint status: ${probe.health.statusCode || "unreachable"}\n` +
          `  Viewer endpoint status: ${probe.viewer.statusCode || "unreachable"}\n` +
          "Stop the existing process on that port, then rerun the command, or pass --port <number>."
      );
    } else {
      console.log(`[wiki] Reusing existing server at http://${host}:${port}`);
    }
  }

  const viewerUrl = `http://${host}:${port}/viewer.html`;

  // --tunnel: expose the local viewer through a public cloudflared URL so a
  // browser on the host (or anywhere) can reach it even when the viewer runs
  // inside a container with no published port and no local browser.
  if (config.tunnel) {
    const localUrl = `http://127.0.0.1:${port}`;
    console.log("[wiki] --tunnel: opening a public cloudflared tunnel (this can take a few seconds)...");
    try {
      const { proc, publicUrl } = await startTunnel(localUrl);
      const publicViewer = `${publicUrl}/viewer.html`;
      // Tear the tunnel down whenever this process goes away so we never
      // orphan a cloudflared child holding a public URL open.
      const killTunnel = () => {
        try { proc.kill(); } catch (_) {}
      };
      process.once("exit", killTunnel);
      process.once("SIGINT", () => { killTunnel(); process.exit(0); });
      process.once("SIGTERM", () => { killTunnel(); process.exit(0); });

      console.log("");
      console.log("  ┌─ SDTK-WIKI viewer is now reachable from any browser ─────────");
      console.log(`  │  ${publicViewer}`);
      console.log("  └─ public cloudflared tunnel · Ctrl+C stops the server + tunnel");
      console.log("");
      return { url: viewerUrl, publicUrl: publicViewer, server, tunnel: proc };
    } catch (err) {
      console.error(`[wiki] Warning: could not start tunnel: ${err.message}`);
      console.error(`[wiki] Falling back to the local viewer URL: ${viewerUrl}`);
      // fall through to the normal open/hint path below
    }
  }

  if (!noOpen) {
    if (isContainer()) {
      // xdg-open cannot reach a browser on the host from inside a container.
      console.log(`[wiki] Viewer URL: ${viewerUrl}`);
      console.log("[wiki] Detected a container — a browser cannot be opened from here.");
      console.log("[wiki] Re-run with --tunnel for a public URL you can open on your host,");
      console.log("[wiki] or open the URL above on your host (requires a published port and --host 0.0.0.0).");
    } else {
      console.log("[wiki] Opening viewer in default browser...");
      await openBrowser(viewerUrl);
    }
  } else {
    console.log(`[wiki] Viewer URL: ${viewerUrl}`);
    console.log("[wiki] --no-open specified; skipping browser launch.");
  }

  return { url: viewerUrl, server };
}

module.exports = {
  openViewer,
  runBuild,
  startWikiServer,
};
