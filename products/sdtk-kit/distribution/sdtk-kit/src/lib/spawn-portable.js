"use strict";

// BK-387 — Windows-portable spawn for `sdtk login` / `sdtk logout`.
//
// Local port of the same resolver sdtk-agent-kit carries (BK-F). It is a port,
// not a require: kits are versioned independently and must not reach into each
// other's internals (the boundary BK-279 established for design-feedback.js).
//
// Why it is needed at all: on Windows the vendor CLIs are npm shims —
// `claude.cmd`, `codex.cmd` — and
//   * CreateProcess only appends ".exe" when resolving a bare name, so a bare
//     "claude" never resolves and spawn returns ENOENT, and
//   * Node refuses to spawn .cmd/.bat with shell:false at all
//     (the CVE-2024-27980 batch-injection hardening).
// Together those make `spawnSync("claude", ...)` fail on a machine where the
// CLI is installed and working, which is exactly what it did: `sdtk login`
// reported "'claude' is not on PATH" against a perfectly good install.
//
// This module resolves argv[0] against PATH x PATHEXT and returns a spawn plan:
//   .exe/.com  -> spawn the resolved absolute path directly
//   .cmd/.bat  -> %ComSpec% /d /s /c "<line>" with windowsVerbatimArguments
//   not found  -> null, so the caller keeps its own fail-closed message
// On every non-Windows platform the plan is the previous behavior byte for
// byte: bare command, untouched args, shell:false.
//
// Argument safety: every token this kit passes is a literal the code itself
// chose ("auth", "login", "--device-auth"), never user input. The guard below
// is kept anyway so that stays true if a caller is ever added — it rejects the
// characters that remain meaningful to cmd.exe after quoting.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
const DIRECT_EXTS = new Set([".com", ".exe"]);
const SHIM_EXTS = new Set([".cmd", ".bat"]);
// % pierces double quotes, ^ escapes, " changes quote state; CR/LF/NUL break
// line integrity.
const CMD_UNSAFE_RE = /[%^"\r\n\u0000]/;

// Windows env-var names are case-insensitive ("Path" vs "PATH"), and injected
// test environments may use either spelling.
function envLookup(env, name) {
  if (!env) return undefined;
  const target = name.toLowerCase();
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === target) return env[key];
  }
  return undefined;
}

function isFile(candidate, fsImpl = fs) {
  try {
    return fsImpl.statSync(candidate).isFile();
  } catch (_) {
    return false;
  }
}

// Resolve a command name the way CreateProcess + PATHEXT would, restricted to
// the extension classes this module knows how to launch safely. A .ps1-only
// shim is not supported: PowerShell has its own parsing rules, and npm always
// writes the .cmd sibling anyway.
function resolveWindowsCommand(command, { env = process.env, cwd = process.cwd(), fsImpl = fs } = {}) {
  const pathext = (envLookup(env, "PATHEXT") || DEFAULT_PATHEXT)
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean);
  const pathQualified = command.includes("/") || command.includes("\\");
  const dirs = pathQualified
    ? [null]
    : String(envLookup(env, "PATH") || "").split(";").filter(Boolean);
  const ownExt = path.extname(command).toLowerCase();

  for (const dir of dirs) {
    const base = dir === null ? path.resolve(cwd, command) : path.join(dir, command);
    const candidates = [];
    if (DIRECT_EXTS.has(ownExt) || SHIM_EXTS.has(ownExt)) candidates.push({ file: base, ext: ownExt });
    for (const ext of pathext) {
      const lower = ext.toLowerCase();
      if (!DIRECT_EXTS.has(lower) && !SHIM_EXTS.has(lower)) continue;
      // PATHEXT is conventionally uppercase while shims on disk are lowercase.
      // Windows filesystems don't care, but probing both keeps resolution exact
      // on the case-sensitive filesystem where these tests actually run.
      candidates.push({ file: base + ext, ext: lower });
      if (ext !== lower) candidates.push({ file: base + lower, ext: lower });
    }
    for (const c of candidates) {
      if (isFile(c.file, fsImpl)) return c;
    }
  }
  return null;
}

// { file, args, spawnOptions, viaCmdShim } — or null when unresolvable on Windows.
function buildSpawnPlan(argv, { platform = process.platform, env = process.env, cwd, fsImpl = fs } = {}) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error("spawn argv is empty or invalid");
  }
  const command = String(argv[0]);
  const args = argv.slice(1).map(String);

  if (platform !== "win32") {
    return { file: command, args, spawnOptions: {}, viaCmdShim: false };
  }

  const resolved = resolveWindowsCommand(command, { env, cwd, fsImpl });
  if (!resolved) return null;
  if (DIRECT_EXTS.has(resolved.ext)) {
    return { file: resolved.file, args, spawnOptions: {}, viaCmdShim: false };
  }

  const tokens = [resolved.file, ...args];
  for (const token of tokens) {
    if (CMD_UNSAFE_RE.test(token)) {
      throw new Error(
        `refusing to dispatch through a .cmd shim: token ${JSON.stringify(token)} contains ` +
          'characters that stay meaningful under cmd.exe parsing (% ^ " or control characters)'
      );
    }
  }
  const line = tokens.map((t) => `"${t}"`).join(" ");
  return {
    file: envLookup(env, "ComSpec") || "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    spawnOptions: { windowsVerbatimArguments: true },
    viaCmdShim: true,
  };
}

// Drop-in for spawnSync at the call sites. Always shell:false; an unresolvable
// Windows command comes back ENOENT-shaped so callers keep their own handling.
function spawnSyncPortable(argv, spawnOptions = {}) {
  const plan = buildSpawnPlan(argv, { env: spawnOptions.env || process.env, cwd: spawnOptions.cwd });
  if (!plan) {
    const command = String(argv[0]);
    const err = new Error(`spawn ${command} ENOENT`);
    err.code = "ENOENT";
    err.syscall = `spawn ${command}`;
    err.path = command;
    return { error: err, status: null, signal: null, stdout: "", stderr: "" };
  }
  return spawnSync(plan.file, plan.args, Object.assign({}, spawnOptions, { shell: false }, plan.spawnOptions));
}

module.exports = { buildSpawnPlan, resolveWindowsCommand, spawnSyncPortable, CMD_UNSAFE_RE };
