"use strict";

// `sdtk statusline <render|install|uninstall|status|preview>` — Claude Code
// statusLine renderer + installer, plus a Codex-native equivalent. Opt-in
// only: neither `sdtk init` nor `sdtk runtime install` calls this
// automatically (see --help in each for a one-line pointer). `render` is
// what actually runs every refreshInterval — keep it fast and
// dependency-free (no jq, no per-account script file).

const path = require("path");
const {
  COMMAND,
  SAMPLE_FIXTURE,
  renderStatusline,
  planInstall,
  installOne,
  uninstallOne,
  buildStatus,
  untargetedAccounts,
  resolveTargets,
  codexTuiBlock,
  resolveCodexTargets,
  planCodexInstall,
  installCodexOne,
  buildCodexStatus,
} = require("../lib/statusline");

const RUNTIMES = ["claude", "codex"];

const HELP_TEXT = `sdtk statusline <render|install|uninstall|status|preview>

3-line Claude Code statusLine: [model] dir | git:branch (+ credits notice),
a context-window usage bar, and 5h/7d rate-limit bars + session cost. Every
value is read verbatim from the JSON Claude Code pipes in; a field that is
missing/null on your Claude Code version makes its own segment disappear
instead of printing a made-up number.

Codex CLI has NO equivalent "run my command" statusLine hook — it has its
own native, config-driven segment picker instead (a \`[tui]\` table in
\`config.toml\`). \`--runtime codex\` turns ON Codex's own built-in segments
(model/context/rate-limit/tokens) — it does not, and cannot, render our
colored 3-line bar there; that is a Claude Code-only rendering.

Subcommands:
  sdtk statusline install [--runtime claude|codex] [--dir <path>] [--all] [--force]
      claude (default): write the statusLine entry into a Claude Code
      settings.json. No script file is written — the entry just re-invokes
      \`${COMMAND}\`, so every account always runs whatever sdtk-kit version
      is installed.
      codex: append a \`[tui]\` block to config.toml turning on Codex's own
      status-line segments. Append-ONLY and safe: if config.toml already has
      a \`[tui]\` table (Codex's own settings UI can write one), this refuses
      to touch it and prints the two lines to add by hand instead — editing
      inside an existing TOML table safely needs a real parser this toolkit
      does not carry as a dependency for one small feature.
        --dir <path>   Target one specific account config dir (default:
                        $CLAUDE_CONFIG_DIR/~/.claude or $CODEX_HOME/~/.codex
                        — i.e. the account you are invoking sdtk under now).
        --all          Install into every discovered account dir for that
                        runtime on this machine, not just the current one.
        --force         (claude only) Overwrite an existing statusLine that
                        runs a different command (default: skip, don't
                        clobber it). Codex install never auto-edits an
                        existing [tui] table, --force or not.

  sdtk statusline uninstall [--runtime claude|codex] [--dir <path>] [--all] [--force]
      claude: remove the statusLine entry, only if it is the one this
      command installed (unless --force). Backs up settings.json first.
      codex: NOT automated (same reasoning as install) — prints the config
      path and the lines to remove by hand.

  sdtk statusline status [--runtime claude|codex] [--json]
      List every discovered account dir for that runtime and whether the
      statusline (claude) / [tui] status_line table (codex) is present.

  sdtk statusline preview
      Render the built-in sample fixture (no live session needed) — the
      offline sanity check: 3 lines, CTX 24%/76%, 5h 100%, 7d 32%, cost.

  sdtk statusline render
      Reads a Claude Code statusLine JSON payload on stdin, prints the 3
      lines. This is what settings.json's "command" actually runs every
      refreshInterval — not meant to be run by hand (use "preview" for that).

Exit codes:
  0  always for render/preview/status — utilities, not gates.
  0  install/uninstall on success; 1 if every target was skipped (see
     --force) or nothing to do.`;

function parseArgs(args) {
  const opts = { sub: null, json: false, all: false, force: false, dir: undefined, runtime: "claude" };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--help" || a === "-h") return { sub: "help" };
    else if (a === "--json") opts.json = true;
    else if (a === "--all") opts.all = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--dir") opts.dir = args[++i];
    else if (a === "--runtime") opts.runtime = args[++i];
    else if (!a.startsWith("-") && !opts.sub) opts.sub = a;
  }
  return opts;
}

function readStdin() {
  try {
    const fs = require("fs");
    return fs.readFileSync(0, "utf8");
  } catch (_) {
    return "";
  }
}

// "claude2 (.claude-b)" — the slot is what the user typed, the dir is what is on
// disk, and they only look unrelated until you print both.
function nameOf(entry) {
  return entry.slot ? `${entry.slot} (${entry.label})` : entry.label;
}

function renderStatusRows(rows) {
  const lines = [`sdtk statusline — ${rows.length} Claude account dir(s)`, ""];
  for (const r of rows) {
    const marks = [r.current ? "current" : "", r.installed ? "installed" : r.otherCommand ? `other command: ${r.otherCommand}` : "not installed"]
      .filter(Boolean)
      .join(", ");
    lines.push(`  ${(r.slot || "?").padEnd(10)} ${r.label.padEnd(14)} ${marks}`);
  }
  return lines.join("\n");
}

function renderCodexStatusRows(rows) {
  const lines = [`sdtk statusline — ${rows.length} Codex account dir(s)`, ""];
  for (const r of rows) {
    const marks = [r.current ? "current" : "", r.hasTui ? "[tui] status_line present" : "not configured"].filter(Boolean).join(", ");
    lines.push(`  ${(r.slot || "?").padEnd(10)} ${r.label.padEnd(14)} ${marks} (${r.configPath})`);
  }
  return lines.join("\n");
}

function cmdStatusline(args, deps = {}) {
  const opts = parseArgs(args);
  const out = deps.log || console.log;
  const err = deps.err || console.error;

  if (opts.sub === "help" || opts.sub === null) {
    out(HELP_TEXT);
    return 0;
  }

  if (opts.sub === "preview") {
    out(renderStatusline(SAMPLE_FIXTURE, deps));
    return 0;
  }

  if (opts.sub === "render") {
    // Claude Code parses exactly the 3 lines this prints — write raw, no
    // trailing newline after line 3, matching the original bash `printf`
    // (an appended blank 4th line risks an extra empty row in the status bar).
    const write = deps.write || ((s) => process.stdout.write(s));
    const raw = deps.stdin !== undefined ? deps.stdin : readStdin();
    let input = {};
    try {
      input = JSON.parse(raw);
    } catch (_) {
      input = {};
    }
    write(renderStatusline(input, deps));
    return 0;
  }

  if (opts.sub !== "install" && opts.sub !== "uninstall" && opts.sub !== "status") {
    err(`sdtk statusline: unknown subcommand '${opts.sub}'.`);
    out(HELP_TEXT);
    return 2;
  }

  if (!RUNTIMES.includes(opts.runtime)) {
    err(`sdtk statusline: --runtime must be one of: ${RUNTIMES.join(", ")}.`);
    return 2;
  }

  if (opts.sub === "status") {
    if (opts.runtime === "codex") {
      const rows = buildCodexStatus(deps);
      out(opts.json ? JSON.stringify(rows, null, 2) : renderCodexStatusRows(rows));
      return 0;
    }
    const rows = buildStatus(deps);
    out(opts.json ? JSON.stringify(rows, null, 2) : renderStatusRows(rows));
    return 0;
  }

  if (opts.sub === "install") {
    if (opts.runtime === "codex") {
      const plan = planCodexInstall({ ...deps, dir: opts.dir, all: opts.all });
      if (!plan.length) {
        out("No Codex account dir found to install into.");
        return 1;
      }
      let anyInstalled = false;
      for (const entry of plan) {
        if (entry.willSkip) {
          out(`skipped: ${entry.label} — ${entry.configPath} already has a [tui] table; add these lines to it by hand instead:`);
          out("");
          out(codexTuiBlock());
          continue;
        }
        const res = installCodexOne(entry, deps);
        anyInstalled = true;
        out(`installed: ${res.label} (${res.configPath})${res.backupPath ? ` — backup: ${path.basename(res.backupPath)}` : ""}`);
      }
      if (!anyInstalled) {
        out("Nothing auto-installed — see the lines above to add by hand.");
        return 1;
      }
      out("");
      out("Open a new Codex session for it to take effect (config.toml is read at session start).");
      return 0;
    }

    const plan = planInstall({ ...deps, dir: opts.dir, all: opts.all, force: opts.force });
    if (!plan.length) {
      out("No Claude account dir found to install into.");
      return 1;
    }
    let anyInstalled = false;
    for (const entry of plan) {
      if (entry.willSkip) {
        out(`skipped: ${nameOf(entry)} — statusLine already runs a different command (${entry.settingsPath}); use --force to overwrite`);
        continue;
      }
      const res = installOne(entry, deps);
      anyInstalled = true;
      out(`installed: ${nameOf(res)} (${res.settingsPath})${res.backupPath ? ` — backup: ${path.basename(res.backupPath)}` : ""}`);
    }
    // Say what was NOT looked at. `install` scoping to the current account is
    // correct, but staying quiet about the others is how someone installs on one
    // account, reads "installed", and never learns the sibling was left behind.
    const others = untargetedAccounts({ ...deps, dir: opts.dir, all: opts.all });
    if (others.length) {
      out("");
      out(`note: ${others.length} other Claude account dir(s) not targeted — ${others.map(nameOf).join(", ")}. Use --all to include them.`);
    }
    if (!anyInstalled) {
      out("Nothing installed — all targets already run a different statusLine command. Re-run with --force to overwrite.");
      return 1;
    }
    out("");
    out("Open a new Claude Code session (or run /statusline) to see it.");
    return 0;
  }

  // uninstall
  if (opts.runtime === "codex") {
    const targets = resolveCodexTargets({ ...deps, dir: opts.dir, all: opts.all });
    for (const t of targets) {
      const configPath = path.join(t.dir, "config.toml");
      out(`skipped: ${t.label} — codex uninstall isn't automated; remove the status_line/status_line_use_colors lines from [tui] in ${configPath} by hand.`);
    }
    return 1;
  }

  const targets = resolveTargets({ ...deps, dir: opts.dir, all: opts.all });
  let anyRemoved = false;
  for (const t of targets) {
    const entry = { ...t, settingsPath: path.join(t.dir, "settings.json") };
    const res = uninstallOne(entry, { ...deps, force: opts.force });
    if (res.removed) {
      anyRemoved = true;
      out(`removed: ${res.label} (backup: ${path.basename(res.backupPath)})`);
    } else {
      out(`skipped: ${res.label} — ${res.reason}`);
    }
  }
  return anyRemoved ? 0 : 1;
}

module.exports = { cmdStatusline, parseArgs, HELP_TEXT };
