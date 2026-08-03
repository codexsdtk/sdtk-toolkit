"use strict";

// Unified-init orchestrator (pure logic).
//
// BK-268: `sdtk init --runtime <claude|codex>` delegates to each toolkit's own,
// already-shipped `init`. This module re-implements NO init logic, performs NO
// filesystem writes, NO network calls, and runs NO PowerShell of its own — every
// side effect happens inside the delegated per-kit init it spawns.
//
// All effectful operations (process spawn, bin resolution, PowerShell pre-flight,
// logging) are passed in through an injected `deps` seam so the orchestrator runs
// fully offline under test.

const fs = require("fs");
const path = require("path");

const VALID_RUNTIMES = Object.freeze(["claude", "codex"]);

// Mirrors sdtk-spec/src/lib/project-target-guard.js MAINTAINER_ROOT_MARKERS.
// `sdtk init` writes managed project files, so it must refuse the SDTK
// maintainer monorepo root — the same refusal sdtk-spec's own init raises.
// Kept as an explicit umbrella pre-flight (BK-354 F-2) so the refusal no longer
// depends on the fan-out aborting on the first failure: with the fan-out now
// always completing, a non-guarded kit (wiki/agent) would otherwise write into
// the maintainer root after spec refused.
const MAINTAINER_ROOT_MARKERS = Object.freeze([
  "governance/ai/core/IMPROVEMENT_BACKLOG.md",
  "products/sdtk-spec/toolkit/install.ps1",
]);

// Default `deps.maintainerRootCheck`. Returns true when every marker is present
// under the resolved project path. Never throws.
function checkMaintainerRoot(projectPath) {
  const resolved = path.resolve(projectPath || ".");
  try {
    return MAINTAINER_ROOT_MARKERS.every((marker) =>
      fs.existsSync(path.join(resolved, marker))
    );
  } catch (_) {
    return false;
  }
}

// Ordered target registry. `binName` is the bin key in each kit's package.json
// (resolved through its `bin` map at runtime, so a kit renaming its bin file
// across a minor version does not break us — see R1 in the implementation plan).
//
// `acceptsRuntime` toolkits receive --runtime (+ --runtime-scope) so they place
// their skills under the correct runtime home (.claude vs .codex). Of those,
// only `installsRuntimeAssets` toolkits (spec/ops/code, which run install.ps1)
// also accept --skip-runtime-assets. sdtk-design is runtime-aware (it installs
// the design-prototype skill into the matching skills dir) but does not own the
// PowerShell runtime-asset payload. sdtk-wiki and sdtk-agent are not
// runtime-aware (they install no skills) and receive only
// --project-path / --force / --verbose.
const TOOLKITS = Object.freeze([
  { name: "sdtk-spec", kitPkg: "sdtk-spec-kit", binName: "sdtk-spec", acceptsRuntime: true, installsRuntimeAssets: true },
  { name: "sdtk-ops", kitPkg: "sdtk-ops-kit", binName: "sdtk-ops", acceptsRuntime: true, installsRuntimeAssets: true },
  { name: "sdtk-code", kitPkg: "sdtk-code-kit", binName: "sdtk-code", acceptsRuntime: true, installsRuntimeAssets: true },
  { name: "sdtk-design", kitPkg: "sdtk-design-kit", binName: "sdtk-design", acceptsRuntime: true, installsRuntimeAssets: false },
  { name: "sdtk-wiki", kitPkg: "sdtk-wiki-kit", binName: "sdtk-wiki", acceptsRuntime: false, installsRuntimeAssets: false, startsViewer: true },
  { name: "sdtk-agent", kitPkg: "sdtk-agent-kit", binName: "sdtk-agent", acceptsRuntime: false, installsRuntimeAssets: false },
]);

// Mirrors sdtk-{spec,ops,code} scope.js: claude defaults to project, codex to user.
// Used only for the honest scope label in the summary; the orchestrator forwards
// --runtime-scope only when the user supplies it, so each kit applies this same
// default independently.
function defaultScope(runtime) {
  return runtime === "claude" ? "project" : "user";
}

class ToolkitResolveError extends Error {
  constructor(kitPkg) {
    super(`Toolkit '${kitPkg}' could not be resolved. Is it installed as a dependency of sdtk-kit?`);
    this.name = "ToolkitResolveError";
    this.kitPkg = kitPkg;
    this.exitCode = 4;
  }
}

// Resolve a toolkit's executable bin via its package.json `bin` map (drift-safe).
// Default `deps.resolveBin`. Throws ToolkitResolveError when the kit or its bin
// entry cannot be found.
function resolveToolkitBin(kitPkg, binName) {
  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve(`${kitPkg}/package.json`);
  } catch (err) {
    throw new ToolkitResolveError(kitPkg);
  }
  // eslint-disable-next-line global-require
  const pkg = require(pkgJsonPath);
  const binField = pkg.bin;
  let rel;
  if (typeof binField === "string") {
    rel = binField;
  } else if (binField && typeof binField === "object") {
    rel = binField[binName] || Object.values(binField)[0];
  }
  if (!rel) {
    throw new ToolkitResolveError(kitPkg);
  }
  return path.resolve(path.dirname(pkgJsonPath), rel);
}

// Default `deps.powershellCheck`. Single pre-flight availability probe mirroring
// sdtk-code/src/lib/powershell.js resolution (win32 → powershell.exe, else pwsh).
// Runs a no-op command; returns { ok, exe } and never throws.
function checkPowerShellAvailable(spawnSync) {
  const exe = process.platform === "win32" ? "powershell.exe" : "pwsh";
  try {
    const res = spawnSync(
      exe,
      ["-NoProfile", "-NonInteractive", "-Command", "$null"],
      { stdio: "ignore" }
    );
    if (res && res.error && res.error.code === "ENOENT") {
      return { ok: false, exe };
    }
    return { ok: true, exe };
  } catch (err) {
    return { ok: false, exe };
  }
}

// Build the forwarded `init` flag args for one toolkit (no leading "init").
// Runtime kits get --runtime (+ runtime-scope / skip-runtime-assets); non-runtime
// kits receive only the accepted subset.
function buildInitArgs(toolkit, opts) {
  const args = [];
  if (toolkit.acceptsRuntime) {
    args.push("--runtime", opts.runtime);
    if (opts.runtimeScope) {
      args.push("--runtime-scope", opts.runtimeScope);
    }
  }
  if (opts.projectPath) {
    args.push("--project-path", opts.projectPath);
  }
  if (opts.force) {
    args.push("--force");
  }
  if (toolkit.installsRuntimeAssets && opts.skipRuntimeAssets) {
    args.push("--skip-runtime-assets");
  }
  // BK-354 F-2: a viewer-starting kit (sdtk-wiki) must run headless-safe under a
  // fan-out, or its init blocks the whole run trying to open a browser. --no-open
  // builds the graph then returns without holding the process open.
  if (toolkit.startsViewer) {
    args.push("--no-open");
  }
  if (opts.verbose) {
    args.push("--verbose");
  }
  return args;
}

function normalizeExitCode(res) {
  if (res && typeof res.status === "number") {
    return res.status;
  }
  if (res && typeof res.exitCode === "number") {
    return res.exitCode;
  }
  // Spawn failure (e.g. error without numeric status) → non-zero.
  return 1;
}

// Render the final per-toolkit summary table (spec §5). Pure.
function renderSummary(results, opts, scopeLabel) {
  const rows = results.map((r) => {
    const runtimeCol = r.acceptsRuntime ? opts.runtime : "-";
    const scopeCol = r.acceptsRuntime ? scopeLabel : "-";
    return { toolkit: r.name, runtime: runtimeCol, scope: scopeCol, status: r.statusLabel || r.status };
  });
  const headers = { toolkit: "toolkit", runtime: "runtime", scope: "scope", status: "status" };
  const width = (key) =>
    Math.max(headers[key].length, ...rows.map((row) => String(row[key]).length));
  const w = {
    toolkit: width("toolkit"),
    runtime: width("runtime"),
    scope: width("scope"),
    status: width("status"),
  };
  const pad = (val, key) => String(val).padEnd(w[key]);
  const line = (row) =>
    `  ${pad(row.toolkit, "toolkit")}  ${pad(row.runtime, "runtime")}  ${pad(row.scope, "scope")}  ${pad(
      row.status,
      "status"
    )}`.replace(/\s+$/, "");
  const out = ["Summary", line(headers)];
  for (const row of rows) {
    out.push(line(row));
  }
  return out.join("\n");
}

// Core orchestrator. `deps` = { spawn, resolveBin, powershellCheck, log }.
//   spawn(binPath, argv, toolkit) → { status|exitCode, stderr? }
//   resolveBin(kitPkg, binName)   → absolute bin path (throws ToolkitResolveError)
//   powershellCheck()             → { ok, exe }
//   log(line)                     → progress/summary sink
// Returns { exitCode, results }. Never writes files / opens sockets itself.
function runUnifiedInit(opts, deps) {
  const spawn = deps.spawn;
  const resolveBin = deps.resolveBin || resolveToolkitBin;
  const powershellCheck = deps.powershellCheck;
  const log = deps.log || (() => {});

  // 1. Required, validated --runtime (no spawns on failure). Exit 2.
  if (!opts.runtime || !VALID_RUNTIMES.includes(opts.runtime)) {
    log(`Error: --runtime is required and must be one of: ${VALID_RUNTIMES.join(", ")}.`);
    return { exitCode: 2, results: [] };
  }

  // 2. Single PowerShell pre-flight, fail-closed (no spawns on failure). Exit 3.
  const ps = powershellCheck();
  if (!ps || !ps.ok) {
    const exe = (ps && ps.exe) || "pwsh";
    log(
      `Error: PowerShell not found (tried: ${exe}). All runtime toolkit inits require ` +
        "PowerShell. Install PowerShell and ensure it is on PATH, then retry."
    );
    return { exitCode: 3, results: [] };
  }

  // 3. Maintainer-root pre-flight, fail-closed (no spawns on failure). Exit 5.
  // `sdtk init` writes managed project files; refuse the SDTK maintainer root
  // before spawning any kit (some kits — wiki/agent — have no guard of their own
  // and would write into it once the fan-out no longer aborts). runtime install
  // is the safe skills-only path here (see unified-runtime.js).
  const maintainerRootCheck = deps.maintainerRootCheck || checkMaintainerRoot;
  const targetPath = opts.projectPath || process.cwd();
  if (maintainerRootCheck(targetPath)) {
    log(
      `Error: refusing to run 'sdtk init' against the SDTK maintainer repo root: ${targetPath}. ` +
        "It would write managed project files over repo-owned files. Target a consumer " +
        "project path instead, or use 'sdtk runtime install' for skills-only setup."
    );
    return { exitCode: 5, results: [] };
  }

  const scopeLabel = opts.runtimeScope || defaultScope(opts.runtime);
  log(`SDTK unified init — runtime: ${opts.runtime}, scope: ${scopeLabel}`);

  const results = [];
  let firstFailure = 0;
  const total = TOOLKITS.length;

  for (let i = 0; i < total; i += 1) {
    const toolkit = TOOLKITS[i];
    const idx = `[${i + 1}/${total}]`;
    const suffix = toolkit.acceptsRuntime ? "" : "   (not runtime-aware)";

    let binPath;
    try {
      binPath = resolveBin(toolkit.kitPkg, toolkit.binName);
    } catch (err) {
      const code = typeof err.exitCode === "number" ? err.exitCode : 4;
      results.push({
        name: toolkit.name,
        acceptsRuntime: toolkit.acceptsRuntime,
        status: "FAILED",
        statusLabel: `FAILED (kit '${toolkit.kitPkg}' not found)`,
        exitCode: code,
      });
      log(`  ${idx} ${toolkit.name} … FAILED — kit '${toolkit.kitPkg}' not resolvable`);
      if (!firstFailure) {
        firstFailure = code;
      }
      // BK-354 F-2: a failed step must NOT abort the fan-out — record it and
      // keep going so the per-kit status table is always complete.
      continue;
    }

    const argv = ["init", ...buildInitArgs(toolkit, opts)];
    const res = spawn(binPath, argv, toolkit);
    const code = normalizeExitCode(res);

    if (code === 0) {
      results.push({
        name: toolkit.name,
        acceptsRuntime: toolkit.acceptsRuntime,
        status: "OK",
        exitCode: 0,
      });
      log(`  ${idx} ${toolkit.name} … OK${suffix}`);
    } else {
      results.push({
        name: toolkit.name,
        acceptsRuntime: toolkit.acceptsRuntime,
        status: "FAILED",
        statusLabel: `FAILED (exit ${code})`,
        exitCode: code,
      });
      log(`  ${idx} ${toolkit.name} … FAILED (exit ${code})`);
      if (res && res.stderr) {
        log(String(res.stderr).trimEnd());
      }
      if (!firstFailure) {
        firstFailure = code;
      }
      // BK-354 F-2: keep going through the remaining toolkits (no early abort).
    }
  }

  log("");
  log(renderSummary(results, opts, scopeLabel));
  const exitCode = firstFailure || 0;
  if (exitCode === 0) {
    log(`All toolkits initialised for the ${opts.runtime} runtime.`);
    if (opts.runtime === "claude") {
      log("Tip: `sdtk statusline install` adds an optional 3-line Claude Code statusLine (context/rate-limit/cost) — opt-in, not run automatically.");
    }
  }
  return { exitCode, results };
}

module.exports = {
  VALID_RUNTIMES,
  TOOLKITS,
  ToolkitResolveError,
  defaultScope,
  resolveToolkitBin,
  checkPowerShellAvailable,
  checkMaintainerRoot,
  MAINTAINER_ROOT_MARKERS,
  buildInitArgs,
  renderSummary,
  runUnifiedInit,
};
