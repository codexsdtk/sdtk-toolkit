"use strict";

// SDTK-WIKI viewer tunnel helper.
//
// Inside a Docker/WSL2 container the viewer server is reachable at
// 127.0.0.1:<port> from *within* the container, but a browser running on the
// host has no route to it (and no browser exists in the container to open).
// `cloudflared tunnel --url http://127.0.0.1:<port>` connects out from the
// container and prints a public https://<slug>.trycloudflare.com URL that the
// host browser can open directly — no `docker run -p` mapping required.

const { spawn } = require("child_process");
const fs = require("fs");

// cloudflared prints the ephemeral URL as e.g.
//   https://random-words-1234.trycloudflare.com
const TRYCLOUDFLARE_URL_RE = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i;

// Pull the first trycloudflare URL out of a chunk of cloudflared output.
// Pure + exported so the parser is unit-testable without spawning anything.
function extractTunnelUrl(text) {
  if (!text) return null;
  const match = String(text).match(TRYCLOUDFLARE_URL_RE);
  return match ? match[0] : null;
}

// Best-effort detection of running inside a container. Docker (and most OCI
// runtimes) create /.dockerenv; the env override lets other setups opt in.
function isContainer() {
  if (process.env.SDTK_IN_CONTAINER === "1") return true;
  try {
    return fs.existsSync("/.dockerenv");
  } catch (_) {
    return false;
  }
}

// Start a cloudflared quick tunnel to `localUrl` and resolve once the public
// URL appears. Rejects on a missing binary, early exit, or timeout. The caller
// owns the returned child process and MUST kill it on shutdown.
function startTunnel(localUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 40000;
  const binary = options.binary || "cloudflared";
  const spawnFn = options.spawnFn || spawn;

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawnFn(binary, ["tunnel", "--url", localUrl], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      reject(new Error(`Could not start ${binary}: ${err.message}`));
      return;
    }

    let settled = false;
    const finishOk = (publicUrl) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ proc, publicUrl });
    };
    const finishErr = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { proc.kill(); } catch (_) {}
      reject(err);
    };

    const timer = setTimeout(() => {
      finishErr(
        new Error(
          `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for a cloudflared tunnel URL.`
        )
      );
    }, timeoutMs);

    const scan = (chunk) => {
      const url = extractTunnelUrl(chunk);
      if (url) finishOk(url);
    };
    // cloudflared prints the URL banner on stderr; watch both streams.
    if (proc.stdout) proc.stdout.on("data", scan);
    if (proc.stderr) proc.stderr.on("data", scan);

    proc.once("error", (err) => {
      if (err && err.code === "ENOENT") {
        finishErr(
          new Error(
            `cloudflared is not installed or not on PATH. ` +
              `Install it: https://developers.cloudflare.com/cloudflare-tunnel/downloads/`
          )
        );
      } else {
        finishErr(new Error(`cloudflared error: ${err ? err.message : "unknown"}`));
      }
    });

    proc.once("exit", (code) => {
      finishErr(
        new Error(`cloudflared exited (code ${code}) before printing a tunnel URL.`)
      );
    });
  });
}

module.exports = {
  TRYCLOUDFLARE_URL_RE,
  extractTunnelUrl,
  isContainer,
  startTunnel,
};
