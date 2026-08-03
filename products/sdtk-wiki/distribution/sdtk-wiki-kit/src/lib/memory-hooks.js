"use strict";

// BK-378 W2: install/uninstall the PreCompact capture hook for each runtime.
// The hook FIRES `sdtk-wiki memory capture`, which self-skips (fail-safe) when
// there is no memory file, so the wiring is safe to leave installed globally.
//
// - Claude Code: project-local `.claude/settings.json`, PreCompact matcher
//   "manual". Merged into any existing hooks block.
// - Codex CLI: user-level `~/.codex/hooks.json`, PreCompact matcher "^manual$".
//   The command is git-root-guarded so a single user-level config only runs in
//   repos that actually have a memory file.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CAPTURE_COMMAND = "sdtk-wiki memory capture";
const STATUS_MESSAGE = "Capturing session decisions to wiki memory…";
const HOOK_TIMEOUT = 120;

const RUNTIMES = ["claude", "codex"];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

// Config path per runtime. Claude is project-local; Codex is user-level.
function hookConfigPath(runtime, projectRoot) {
  if (runtime === "claude") {
    return path.join(projectRoot, ".claude", "settings.json");
  }
  if (runtime === "codex") {
    return path.join(os.homedir(), ".codex", "hooks.json");
  }
  throw new Error(`Unknown runtime: ${runtime}`);
}

function hookEntry(runtime) {
  // Both runtimes run the plain capture command. The engine self-guards — it
  // reads `cwd` from the hook payload, walks up to the memory file, and skips
  // fail-safe when the repo does not use the layer. No git dependency: an
  // earlier `git rev-parse --show-toplevel || exit 0` guard silently killed the
  // hook in NON-git repos (git exit 128 → the hook returned before capture ran,
  // so nothing was captured and no log was written).
  return {
    matcher: runtime === "codex" ? "^manual$" : "manual",
    hooks: [
      {
        type: "command",
        command: CAPTURE_COMMAND,
        timeout: HOOK_TIMEOUT,
        statusMessage: STATUS_MESSAGE,
      },
    ],
  };
}

// True when a PreCompact matcher block already contains our capture command.
function blockIsOurs(block) {
  if (!block || !Array.isArray(block.hooks)) return false;
  return block.hooks.some(
    (h) => h && typeof h.command === "string" && h.command.includes(CAPTURE_COMMAND)
  );
}

function installHook(runtime, projectRoot) {
  const file = hookConfigPath(runtime, projectRoot);
  const config = readJson(file) || {};
  if (!config.hooks || typeof config.hooks !== "object") config.hooks = {};
  if (!Array.isArray(config.hooks.PreCompact)) config.hooks.PreCompact = [];

  const already = config.hooks.PreCompact.some(blockIsOurs);
  if (already) {
    return { file, changed: false, message: "already installed" };
  }
  config.hooks.PreCompact.push(hookEntry(runtime));
  writeJson(file, config);
  return { file, changed: true, message: "installed" };
}

function uninstallHook(runtime, projectRoot) {
  const file = hookConfigPath(runtime, projectRoot);
  const config = readJson(file);
  if (!config || !config.hooks || !Array.isArray(config.hooks.PreCompact)) {
    return { file, changed: false, message: "nothing to remove" };
  }
  const before = config.hooks.PreCompact.length;
  config.hooks.PreCompact = config.hooks.PreCompact.filter((b) => !blockIsOurs(b));
  const changed = config.hooks.PreCompact.length !== before;
  if (changed) writeJson(file, config);
  return { file, changed, message: changed ? "removed" : "nothing to remove" };
}

function hookInstalled(runtime, projectRoot) {
  const file = hookConfigPath(runtime, projectRoot);
  const config = readJson(file);
  const installed =
    !!config &&
    !!config.hooks &&
    Array.isArray(config.hooks.PreCompact) &&
    config.hooks.PreCompact.some(blockIsOurs);
  return { file, installed };
}

module.exports = {
  RUNTIMES,
  CAPTURE_COMMAND,
  hookConfigPath,
  hookEntry,
  blockIsOurs,
  installHook,
  uninstallHook,
  hookInstalled,
};
