"use strict";

// `sdtk statusline` — 3-line Claude Code statusLine renderer + installer.
//
// Renders verbatim from the JSON Claude Code pipes into `sdtk statusline
// render` on stdin every refreshInterval. Nothing is invented: a field that
// is missing/null makes its own segment degrade gracefully (omitted) instead
// of printing a fabricated number — see `has()` below, which checks presence
// (including the legitimate value 0), not truthiness.
//
// The installer writes ONE line into a Claude Code `settings.json`:
//   { "statusLine": { "type": "command", "command": "sdtk statusline render", ... } }
// No script file is written per account — the command re-invokes the same
// globally-installed `sdtk` binary every time, so every account always runs
// whatever `sdtk-kit` version is currently installed (no drift, nothing to
// keep in sync, nothing that can silently go stale — unlike a per-account
// copied script). This directly avoids the bug class that motivated this
// feature: a prior manual statusline setup only touched the invoking
// account's own $CLAUDE_CONFIG_DIR, leaving sibling accounts with no
// statusline at all.
//
// Every I/O dependency (fs, homedir, execFile) is injectable so tests never
// touch the real home directory or spawn a real git — mirrors lib/account.js
// and lib/usage.js.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { discoverAccountDirs } = require("./usage");
const { activeDir } = require("./account");
const { slotNameForDir } = require("./account-slots");

const COMMAND = "sdtk statusline render";
const STATUSLINE_ENTRY = Object.freeze({
  type: "command",
  command: COMMAND,
  padding: 1,
  refreshInterval: 5,
});

// Reproduces the exact numbers from the reference mock (24/76 CTX,
// tok in:2 out:1402 max:1000000, 5h 100%, 7d 32%, cost:$14.2030) so
// `sdtk statusline preview` gives a fixed, reviewable rendering with no live
// session required.
const SAMPLE_FIXTURE = Object.freeze({
  session_id: "SAMPLE",
  cwd: "/home/user/project",
  model: { id: "claude-opus-4-8", display_name: "Opus 4.8" },
  workspace: { current_dir: "/home/user/project" },
  version: "2.1.218",
  cost: { total_cost_usd: 14.203 },
  context_window: {
    context_window_size: 1000000,
    current_usage: { input_tokens: 2, output_tokens: 1402 },
    used_percentage: 24,
    remaining_percentage: 76,
  },
  rate_limits: {
    five_hour: { used_percentage: 100, resets_at: Math.floor(Date.now() / 1000) + 2 * 3600 + 14 * 60 },
    seven_day: { used_percentage: 32, resets_at: Math.floor(Date.now() / 1000) + 5 * 86400 + 13 * 3600 },
  },
});

// ---------------------------------------------------------------------------
// 1. Renderer (pure aside from the optional git lookup, which is injectable)
// ---------------------------------------------------------------------------

const ESC = "";
const RESET = `${ESC}[0m`;
const COLOR = {
  blue: `${ESC}[94m`,
  yellow: `${ESC}[93m`,
  gray: `${ESC}[90m`,
  green: `${ESC}[92m`,
  red: `${ESC}[91m`,
  boldGreen: `${ESC}[1;92m`,
  boldWhite: `${ESC}[1;97m`,
  magenta: `${ESC}[95m`,
};

// Presence check matching bash's `[ -n "$VAR" ]` over a jq `// empty` value:
// 0 is present (a real 0%), only null/undefined/"" count as absent.
function has(v) {
  return v !== undefined && v !== null && v !== "";
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

// 12-cell bar; filled cells in `fillColor`, remaining cells gray. Rounding
// matches the original awk: floor(pct/100*width + 0.5), clamped to [0, width].
function makeBar(pct, fillColor, width = 12) {
  let filled = 0;
  if (has(pct)) {
    filled = Math.floor((Number(pct) / 100) * width + 0.5);
    if (filled < 0) filled = 0;
    if (filled > width) filled = width;
  }
  const empty = Math.max(0, width - filled);
  return `${fillColor}${"█".repeat(filled)}${RESET}${COLOR.gray}${"░".repeat(empty)}${RESET}`;
}

// epoch seconds -> relative "2h14m" / "5d13h" / "42m"
function fmtRem(epochSec, now = Math.floor(Date.now() / 1000)) {
  if (!has(epochSec)) return "";
  let rem = Number(epochSec) - now;
  if (rem < 0) rem = 0;
  if (rem >= 86400) {
    const d = Math.floor(rem / 86400);
    const h = Math.floor((rem % 86400) / 3600);
    return `${d}d${h}h`;
  }
  if (rem >= 3600) {
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    return `${h}h${m}m`;
  }
  const m = Math.floor(rem / 60);
  return `${m}m`;
}

// epoch seconds -> absolute "MM-DD HH:MM" in local time.
function fmtAbs(epochSec) {
  if (!has(epochSec)) return "";
  const d = new Date(Number(epochSec) * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Mirrors the original bash script's `${COLUMNS:-$(tput cols)}`, default 200:
// $COLUMNS env var first, then shell out to `tput cols` (queries the
// controlling terminal directly — this is why it can succeed even when
// stdout itself is piped/not a TTY, matching how Claude Code's own
// statusLine subprocess is invoked), then the 200 fallback.
function detectColumns(deps = {}) {
  if (deps.columns) return deps.columns;
  const env = deps.env || process.env;
  const fromEnv = parseInt(env.COLUMNS, 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (process.stdout && process.stdout.columns) return process.stdout.columns;
  try {
    const exec = deps.execFileSync || execFileSync;
    const out = exec("tput", ["cols"], { encoding: "utf8", stdio: ["inherit", "pipe", "ignore"] });
    const fromTput = parseInt(String(out).trim(), 10);
    if (Number.isFinite(fromTput) && fromTput > 0) return fromTput;
  } catch (_) {
    /* fall through to default */
  }
  return 200;
}

function gitBranch(dir, deps) {
  if (!dir) return "";
  const exec = (deps && deps.execFileSync) || execFileSync;
  try {
    return String(
      exec("git", ["-C", dir, "--no-optional-locks", "branch", "--show-current"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ).trim();
  } catch (_) {
    return "";
  }
}

// `deps.columns` overrides terminal width detection (tests); otherwise
// process.stdout.columns (TTY) falling back to 200, matching the original
// `${COLUMNS:-$(tput cols)}` / default-200 behavior for a non-TTY subprocess.
function renderStatusline(input, deps = {}) {
  const data = input && typeof input === "object" ? input : {};

  const dir = data.workspace && data.workspace.current_dir ? data.workspace.current_dir : data.cwd || "";
  const dirName = dir ? path.basename(dir) : "";
  const branch = gitBranch(dir, deps);
  const model = data.model && data.model.display_name;

  const cw = data.context_window || {};
  const ctxUsed = cw.used_percentage;
  const ctxLeft = cw.remaining_percentage;
  const tokIn = cw.current_usage && cw.current_usage.input_tokens;
  const tokOut = cw.current_usage && cw.current_usage.output_tokens;
  const ctxMax = cw.context_window_size;

  const costUsd = data.cost && data.cost.total_cost_usd;

  const rl = data.rate_limits || {};
  const fivePct = rl.five_hour && rl.five_hour.used_percentage;
  const fiveReset = rl.five_hour && rl.five_hour.resets_at;
  const sevenPct = rl.seven_day && rl.seven_day.used_percentage;
  const sevenReset = rl.seven_day && rl.seven_day.resets_at;

  // ---- line 1 ----
  let left1 = "";
  if (has(model)) left1 += `${COLOR.blue}[${model}]${RESET}`;
  if (dirName) {
    if (left1) left1 += "  ";
    left1 += `${COLOR.yellow}${dirName}${RESET}`;
  }
  if (branch) {
    if (left1) left1 += "  ";
    left1 += `${COLOR.gray}|${RESET} ${COLOR.green}git:${branch}${RESET}`;
  }

  let msg = "";
  if (has(fivePct) && Number(fivePct) >= 100) msg = "Now using usage credits";

  let line1;
  if (msg) {
    const width = detectColumns(deps);
    const plainLeft = stripAnsi(left1);
    const pad = width - plainLeft.length - msg.length;
    line1 = pad > 0 ? `${left1}${" ".repeat(pad)}${COLOR.gray}${msg}${RESET}` : `${left1}  ${COLOR.gray}${msg}${RESET}`;
  } else {
    line1 = left1;
  }

  // ---- line 2 ----
  let line2 = `${COLOR.red}CTX${RESET} ${makeBar(ctxUsed, COLOR.blue)}`;
  if (has(ctxUsed) && has(ctxLeft)) {
    line2 += ` ${COLOR.boldGreen}${ctxUsed}% used / ${ctxLeft}% left${RESET}`;
  }
  if (has(tokIn) || has(tokOut) || has(ctxMax)) {
    line2 += ` ${COLOR.gray}| tok in:${has(tokIn) ? tokIn : 0} out:${has(tokOut) ? tokOut : 0} max:${has(ctxMax) ? ctxMax : 0}${RESET}`;
  }

  // ---- line 3 ----
  let line3 = `${COLOR.boldWhite}5h${RESET} ${makeBar(fivePct, COLOR.red)}`;
  if (has(fivePct)) {
    line3 += ` ${COLOR.red}${fivePct}% reset:${fmtRem(fiveReset)} (${fmtAbs(fiveReset)})${RESET}`;
  }
  line3 += ` ${COLOR.gray}|${RESET} ${COLOR.boldWhite}7d${RESET} ${makeBar(sevenPct, COLOR.blue)}`;
  if (has(sevenPct)) {
    line3 += ` ${COLOR.blue}${sevenPct}% reset:${fmtRem(sevenReset)} (${fmtAbs(sevenReset)})${RESET}`;
  }
  if (has(costUsd)) {
    line3 += ` ${COLOR.gray}|${RESET} ${COLOR.magenta}cost:$${Number(costUsd).toFixed(4)}${RESET}`;
  }

  return `${line1}\n${line2}\n${line3}`;
}

// ---------------------------------------------------------------------------
// 2. Install / uninstall / status (settings.json merge only — no script file)
// ---------------------------------------------------------------------------

function claudeAccountDirs({ homedir = os.homedir(), fsImpl = fs, extraDirs = [] } = {}) {
  const { accounts } = discoverAccountDirs({ homedir, fsImpl, extraDirs });
  return accounts.filter((a) => a.vendor === "claude");
}

function currentAccountDir({ env = process.env, homedir = os.homedir() } = {}) {
  return env.CLAUDE_CONFIG_DIR || path.join(homedir, ".claude");
}

function readSettings(settingsPath, fsImpl) {
  try {
    return JSON.parse(fsImpl.readFileSync(settingsPath, "utf8"));
  } catch (_) {
    return {};
  }
}

function isOurEntry(statusLine) {
  return !!(statusLine && statusLine.type === "command" && statusLine.command === COMMAND);
}

// Resolve the target account dir(s) for install/uninstall/status: explicit
// --dir wins; --all fans out to every discovered claude account dir;
// otherwise just the invoking account (CLAUDE_CONFIG_DIR or ~/.claude).
function resolveTargets({ dir, all, fsImpl = fs, homedir = os.homedir(), env = process.env } = {}) {
  if (dir) return [{ vendor: "claude", dir, label: path.basename(dir) }];
  if (all) return claudeAccountDirs({ homedir, fsImpl });
  const cur = currentAccountDir({ env, homedir });
  return [{ vendor: "claude", dir: cur, label: path.basename(cur) }];
}

function planInstall(opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const targets = resolveTargets({ ...opts, fsImpl });
  return targets.map((t) => {
    const settingsPath = path.join(t.dir, "settings.json");
    const settings = readSettings(settingsPath, fsImpl);
    const existing = settings.statusLine;
    return {
      ...t,
      slot: slotNameForDir(t.dir, { homedir: opts.homedir || os.homedir(), fsImpl }),
      settingsPath,
      hasOurs: isOurEntry(existing),
      hasOther: !!existing && !isOurEntry(existing),
      willSkip: !!existing && !isOurEntry(existing) && !opts.force,
    };
  });
}

// Claude account dirs that this invocation is NOT going to touch.
//
// `install` defaults to the current account only, which is right — it should not
// reach into an account you are not in. But in a multi-account setup that is
// exactly how someone runs install, sees "installed", and never learns the other
// account was left behind. That silence is the bug class this whole feature was
// built to remove, so the command has to say what it skipped looking at.
// Empty when --all or --dir was given: then the scope was chosen deliberately.
function untargetedAccounts(opts = {}) {
  if (opts.all || opts.dir) return [];
  const fsImpl = opts.fsImpl || fs;
  const homedir = opts.homedir || os.homedir();
  const targeted = new Set(
    resolveTargets({ ...opts, fsImpl, homedir }).map((t) => path.resolve(t.dir))
  );
  return claudeAccountDirs({ homedir, fsImpl, extraDirs: opts.extraDirs })
    .filter((d) => !targeted.has(path.resolve(d.dir)))
    .map((d) => ({ ...d, slot: slotNameForDir(d.dir, { homedir, fsImpl }) }));
}

function installOne(entry, opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const now = opts.now || Date.now();
  fsImpl.mkdirSync(entry.dir, { recursive: true });
  const settings = readSettings(entry.settingsPath, fsImpl);
  const existed = fsImpl.existsSync(entry.settingsPath);
  let backupPath;
  if (existed) {
    backupPath = `${entry.settingsPath}.bak.${now}`;
    fsImpl.writeFileSync(backupPath, fsImpl.readFileSync(entry.settingsPath, "utf8"));
  }
  settings.statusLine = { ...STATUSLINE_ENTRY };
  fsImpl.writeFileSync(entry.settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { ...entry, backupPath, installed: true };
}

function uninstallOne(entry, opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const now = opts.now || Date.now();
  if (!fsImpl.existsSync(entry.settingsPath)) {
    return { ...entry, removed: false, reason: "no settings.json" };
  }
  const settings = readSettings(entry.settingsPath, fsImpl);
  if (!settings.statusLine) {
    return { ...entry, removed: false, reason: "no statusLine configured" };
  }
  if (!isOurEntry(settings.statusLine) && !opts.force) {
    return { ...entry, removed: false, reason: "statusLine set to a different command (use --force)" };
  }
  const backupPath = `${entry.settingsPath}.bak.${now}`;
  fsImpl.writeFileSync(backupPath, fsImpl.readFileSync(entry.settingsPath, "utf8"));
  delete settings.statusLine;
  fsImpl.writeFileSync(entry.settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { ...entry, backupPath, removed: true };
}

function buildStatus(opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const homedir = opts.homedir || os.homedir();
  const dirs = claudeAccountDirs({ homedir, fsImpl, extraDirs: opts.extraDirs });
  const cur = currentAccountDir({ env: opts.env, homedir });
  return dirs.map((t) => {
    const settingsPath = path.join(t.dir, "settings.json");
    const settings = readSettings(settingsPath, fsImpl);
    return {
      ...t,
      slot: slotNameForDir(t.dir, { homedir, fsImpl }),
      current: path.resolve(t.dir) === path.resolve(cur),
      installed: isOurEntry(settings.statusLine),
      otherCommand: settings.statusLine && !isOurEntry(settings.statusLine) ? settings.statusLine.command : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Codex support — NOT a custom command. Codex CLI (checked against
// codex-cli 0.145.0's own embedded schema, cross-verified against the
// official schema at https://developers.openai.com/codex/config-schema.json)
// has no equivalent of Claude Code's "run my command every refreshInterval"
// statusLine hook — instead it has a native, config-driven segment picker: a
// `[tui]` table in `config.toml` (TOML, not JSON) with `status_line = [...]`
// naming which built-in segments to show (no "command"/script option exists
// in the schema). We cannot render our own colored 3-line bar there; the
// best equivalent is turning on Codex's own segments. Unset defaults to just
// `model-with-reasoning` + `current-dir`; the fuller list below is every
// segment this repo could positively confirm (present in the binary AND
// already active in a real working config.toml on the reporting machine).
//
// This is intentionally append-ONLY and narrow: if `[tui]` already exists in
// the target config.toml (as it may — Codex's own settings UI can write
// this table), we refuse to touch it. Safely editing *inside* an existing
// TOML table (respecting comments, nested sub-tables, arrays, escaping)
// needs a real parser, which this toolkit does not carry as a dependency for
// one small feature. Printing the two lines to add by hand is honest and
// safe; guessing at a text-surgery edit is not.
const CODEX_STATUS_LINE_SEGMENTS = Object.freeze([
  "model-with-reasoning",
  "current-dir",
  "context-remaining",
  "context-used",
  "five-hour-limit",
  "weekly-limit",
  "context-window-size",
  "used-tokens",
  "total-input-tokens",
  "total-output-tokens",
]);

function codexTuiBlock() {
  const arr = CODEX_STATUS_LINE_SEGMENTS.map((s) => `"${s}"`).join(", ");
  return `[tui]\nstatus_line = [${arr}]\nstatus_line_use_colors = true\n`;
}

// A top-level `[tui]` header (not `[tui.sub-table]`), optionally followed by
// a trailing comment — deliberately does NOT match `[tui.model_availability_nux]`.
function hasTuiTable(tomlText) {
  return /^\[tui\]\s*(#.*)?$/m.test(tomlText);
}

function codexAccountDirs({ homedir = os.homedir(), fsImpl = fs, extraDirs = [] } = {}) {
  const { accounts } = discoverAccountDirs({ homedir, fsImpl, extraDirs });
  return accounts.filter((a) => a.vendor === "codex");
}

function currentCodexDir({ env = process.env, homedir = os.homedir() } = {}) {
  return activeDir("codex", env, homedir);
}

function resolveCodexTargets({ dir, all, fsImpl = fs, homedir = os.homedir(), env = process.env } = {}) {
  if (dir) return [{ vendor: "codex", dir, label: path.basename(dir) }];
  if (all) return codexAccountDirs({ homedir, fsImpl });
  const cur = currentCodexDir({ env, homedir });
  return [{ vendor: "codex", dir: cur, label: path.basename(cur) }];
}

function planCodexInstall(opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const targets = resolveCodexTargets({ ...opts, fsImpl });
  return targets.map((t) => {
    const configPath = path.join(t.dir, "config.toml");
    const exists = fsImpl.existsSync(configPath);
    const text = exists ? fsImpl.readFileSync(configPath, "utf8") : "";
    const hasTui = exists && hasTuiTable(text);
    return { ...t, configPath, exists, hasTui, willSkip: hasTui };
  });
}

function installCodexOne(entry, opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const now = opts.now || Date.now();
  fsImpl.mkdirSync(entry.dir, { recursive: true });
  let backupPath;
  let existingText = "";
  if (entry.exists) {
    existingText = fsImpl.readFileSync(entry.configPath, "utf8");
    backupPath = `${entry.configPath}.bak.${now}`;
    fsImpl.writeFileSync(backupPath, existingText);
  }
  let prefix = existingText;
  if (prefix && !prefix.endsWith("\n")) prefix += "\n";
  if (prefix) prefix += "\n"; // blank line separating from any prior content
  fsImpl.writeFileSync(entry.configPath, `${prefix}${codexTuiBlock()}`);
  return { ...entry, backupPath, installed: true };
}

function buildCodexStatus(opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const homedir = opts.homedir || os.homedir();
  const dirs = codexAccountDirs({ homedir, fsImpl, extraDirs: opts.extraDirs });
  const cur = currentCodexDir({ env: opts.env, homedir });
  return dirs.map((t) => {
    const configPath = path.join(t.dir, "config.toml");
    const exists = fsImpl.existsSync(configPath);
    const text = exists ? fsImpl.readFileSync(configPath, "utf8") : "";
    return {
      ...t,
      slot: slotNameForDir(t.dir, { homedir, fsImpl }),
      current: path.resolve(t.dir) === path.resolve(cur),
      configPath,
      hasTui: exists && hasTuiTable(text),
    };
  });
}

module.exports = {
  COMMAND,
  STATUSLINE_ENTRY,
  SAMPLE_FIXTURE,
  has,
  makeBar,
  fmtRem,
  fmtAbs,
  renderStatusline,
  claudeAccountDirs,
  currentAccountDir,
  isOurEntry,
  resolveTargets,
  planInstall,
  untargetedAccounts,
  installOne,
  uninstallOne,
  buildStatus,
  CODEX_STATUS_LINE_SEGMENTS,
  codexTuiBlock,
  hasTuiTable,
  codexAccountDirs,
  currentCodexDir,
  resolveCodexTargets,
  planCodexInstall,
  installCodexOne,
  buildCodexStatus,
};
