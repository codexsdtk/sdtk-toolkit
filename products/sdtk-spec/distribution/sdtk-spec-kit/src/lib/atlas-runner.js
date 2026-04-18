"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { DependencyError, CliError } = require("./errors");
const { resolveBuilderPath } = require("./atlas-config");
const { openBrowser } = require("./browser-open");

const HEALTH_CHECK_RETRIES = 20;
const HEALTH_CHECK_INTERVAL_MS = 300;

/**
 * Find an available Python executable.
 * Returns 'python3' on Unix, 'python' on Windows as first try.
 *
 * @returns {Promise<string>} Resolved python executable name.
 */
function findPython() {
  return new Promise((resolve, reject) => {
    const candidates = process.platform === "win32"
      ? ["python", "python3"]
      : ["python3", "python"];

    let idx = 0;
    function tryNext() {
      if (idx >= candidates.length) {
        reject(
          new DependencyError(
            "Python not found. Install Python 3.8+ and ensure it is in PATH.\n" +
              "Atlas build requires Python to run the local builder."
          )
        );
        return;
      }
      const candidate = candidates[idx++];
      execFile(candidate, ["--version"], { timeout: 5000 }, (err) => {
        if (!err) {
          resolve(candidate);
        } else {
          tryNext();
        }
      });
    }
    tryNext();
  });
}

/**
 * Run the Atlas Python builder with explicit project/output args.
 *
 * @param {Object} config - Resolved AtlasConfig.
 * @returns {Promise<{ docCount: number, nodeCount: number, edgeCount: number, generated: string }>}
 */
async function runBuild(config) {
  const builderPath = resolveBuilderPath();
  if (!fs.existsSync(builderPath)) {
    throw new DependencyError(
      `Atlas builder not found: ${builderPath}\n` +
        "This is a packaging error. Reinstall sdtk-spec-kit."
    );
  }

  const pythonExe = await findPython();

  const args = [
    builderPath,
    "--project-root",
    config.projectPath,
    "--output-dir",
    config.outputDir,
  ];

  for (const sr of config.scanRoots) {
    args.push("--scan-root", sr);
  }

  for (const ex of config.excludes) {
    args.push("--exclude", ex);
  }

  if (config.verbose) {
    args.push("--verbose");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExe, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      // Stream output unless silent
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(
          new DependencyError(
            `Python executable not found: ${pythonExe}\n` +
              "Install Python 3.8+ and ensure it is in PATH."
          )
        );
      } else {
        reject(new CliError(`Failed to start Atlas builder: ${err.message}`));
      }
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new CliError(
            `Atlas build failed (exit code ${code}).\n` +
              (stderr ? `Builder error output:\n${stderr}` : "See output above for details.")
          )
        );
        return;
      }

      // Parse result JSON from stdout line
      const resultLine = stdout.split("\n").find((l) => l.startsWith("[atlas:result] "));
      if (resultLine) {
        try {
          const result = JSON.parse(resultLine.replace("[atlas:result] ", ""));
          resolve({
            docCount: result.doc_count || 0,
            nodeCount: result.node_count || 0,
            edgeCount: result.edge_count || 0,
            generated: result.generated || "",
          });
          return;
        } catch (_) {
          // fall through to defaults
        }
      }

      resolve({ docCount: 0, nodeCount: 0, edgeCount: 0, generated: "" });
    });
  });
}

/**
 * Check whether a port is in use (server is listening).
 *
 * @param {string} host
 * @param {number} port
 * @returns {Promise<boolean>}
 */
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

/**
 * Wait for the local server to become reachable.
 *
 * @param {string} host
 * @param {number} port
 * @returns {Promise<void>}
 */
async function waitForServer(host, port) {
  for (let i = 0; i < HEALTH_CHECK_RETRIES; i++) {
    const ok = await isPortOpen(host, port);
    if (ok) return;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }
  throw new CliError(
    `Atlas viewer server did not start on http://${host}:${port}\n` +
      "Try passing a different --port if the port is occupied."
  );
}

/**
 * Probe a local Atlas endpoint and capture its HTTP status.
 *
 * @param {string} url
 * @returns {Promise<{ ok: boolean, statusCode: number, body: string }>}
 */
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

    req.on("error", () => {
      resolve({ ok: false, statusCode: 0, body: "" });
    });

    req.end();
  });
}

/**
 * Check whether an existing server on the requested port is a usable Atlas server.
 *
 * @param {string} host
 * @param {number} port
 * @param {string} viewerUrl
 * @returns {Promise<{ reusable: boolean, health: { ok: boolean, statusCode: number }, viewer: { ok: boolean, statusCode: number } }>}
 */
async function probeExistingAtlasServer(host, port, viewerUrl) {
  const health = await probeUrl(`http://${host}:${port}/api/health`);
  const viewer = await probeUrl(`${viewerUrl}?embedded=1&probe=1`);
  return {
    reusable: health.ok && viewer.ok,
    health: { ok: health.ok, statusCode: health.statusCode },
    viewer: { ok: viewer.ok, statusCode: viewer.statusCode },
  };
}

/**
 * Start a lightweight Node.js static file server for the atlas output dir.
 * Binds to loopback by default. Prevents path traversal outside outputDir/projectPath.
 *
 * @param {string} host
 * @param {number} port
 * @param {string} outputDir   - Directory to serve static atlas files from.
 * @param {string} projectPath - Project root for /api/note path traversal bound.
 * @returns {Promise<http.Server>}
 */
function startAtlasServer(host, port, outputDir, projectPath) {
  return new Promise((resolve, reject) => {
    const MIME_TYPES = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".md": "text/plain; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
    };

    const server = http.createServer((req, res) => {
      const url = req.url || "/";

      // Health check endpoint
      if (url === "/api/health" || url === "/api/health/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // Serve full note content with path traversal protection
      if (url.startsWith("/api/note")) {
        const qs = new URL(url, `http://${host}:${port}`).searchParams;
        const notePath = qs.get("path");
        if (!notePath) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing path parameter" }));
          return;
        }

        // Path traversal protection: resolve and verify it stays within projectPath
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
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Read error" }));
        }
        return;
      }

      // Static files from outputDir
      let filePath = url.split("?")[0];
      if (filePath === "/" || filePath === "") {
        filePath = "/viewer.html";
      }

      const resolved = path.resolve(outputDir, filePath.replace(/^\/+/, ""));
      // Path traversal protection: must stay inside outputDir
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
      } catch (err) {
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
        reject(new CliError(`Atlas server error: ${err.message}`));
      }
    });

    server.listen(port, host, () => {
      resolve(server);
    });
  });
}

/**
 * Open or reuse the local Atlas viewer server and optionally launch a browser.
 *
 * @param {Object} config - Resolved AtlasConfig.
 * @param {boolean} noOpen - If true, skip browser launch.
 * @returns {Promise<{ url: string, server: http.Server | null }>}
 */
async function openViewer(config, noOpen = false) {
  const { host, port, outputDir } = config;
  const viewerUrl = `http://${host}:${port}/viewer.html`;

  // Check if a server is already running on this port
  const alreadyRunning = await isPortOpen(host, port);

  let server = null;
  if (!alreadyRunning) {
    console.log(`[atlas] Starting local atlas viewer on http://${host}:${port} ...`);
    server = await startAtlasServer(host, port, outputDir, config.projectPath);
    await waitForServer(host, port);
    console.log(`[atlas] Viewer server ready: ${viewerUrl}`);
  } else {
    const probe = await probeExistingAtlasServer(host, port, viewerUrl);
    if (!probe.reusable) {
      throw new CliError(
        `Port ${port} is already occupied by an incompatible Atlas server.\n` +
          `  Health endpoint status: ${probe.health.statusCode || "unreachable"}\n` +
          `  Viewer endpoint status: ${probe.viewer.statusCode || "unreachable"}\n` +
          "Stop the existing process on that port, then rerun the command, or pass --port <number>."
      );
    }
    console.log(`[atlas] Reusing existing server at http://${host}:${port}`);
  }

  if (!noOpen) {
    console.log("[atlas] Opening viewer in default browser...");
    await openBrowser(viewerUrl);
  } else {
    console.log(`[atlas] Viewer URL: ${viewerUrl}`);
    console.log("[atlas] --no-open specified; skipping browser launch.");
  }

  return { url: viewerUrl, server };
}

module.exports = {
  runBuild,
  openViewer,
  startAtlasServer,
  findPython,
};
