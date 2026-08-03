#!/usr/bin/env node
"use strict";

// Offline unit tests for `sdtk statusline` (BK-380): Claude Code statusLine
// renderer + settings.json installer. Real fs against throwaway temp home
// dirs (mirrors scripts/account.test.js); no network, no real git shell-out
// (injected via deps.execFileSync), no real $HOME.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  COMMAND,
  SAMPLE_FIXTURE,
  has,
  makeBar,
  fmtRem,
  fmtAbs,
  renderStatusline,
  claudeAccountDirs,
  currentAccountDir,
  isOurEntry,
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
  planCodexInstall,
  installCodexOne,
  buildCodexStatus,
} = require("../src/lib/statusline");

const { cmdStatusline } = require("../src/commands/statusline");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function makeHome(accounts) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-sl-home-"));
  for (const [name, spec] of Object.entries(accounts || {})) {
    const dir = path.join(home, name);
    const vendor = name.startsWith(".codex") ? "codex" : "claude";
    const top = vendor === "claude" ? "projects" : "sessions";
    fs.mkdirSync(path.join(dir, top), { recursive: true });
    if (spec && spec.settings) {
      fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify(spec.settings, null, 2));
    }
    if (spec && spec.configToml !== undefined) {
      fs.writeFileSync(path.join(dir, "config.toml"), spec.configToml);
    }
  }
  return home;
}

function rmHome(home) {
  fs.rmSync(home, { recursive: true, force: true });
}

const stubGit = (branch) => ({
  execFileSync: () => (branch === null ? (() => { throw new Error("not a repo"); })() : `${branch}\n`),
});

// ---------------------------------------------------------------------------
// has() / makeBar / fmtRem / fmtAbs
// ---------------------------------------------------------------------------

test("has(): 0 is present, undefined/null/'' are absent", () => {
  assert.strictEqual(has(0), true);
  assert.strictEqual(has(24), true);
  assert.strictEqual(has(undefined), false);
  assert.strictEqual(has(null), false);
  assert.strictEqual(has(""), false);
});

test("makeBar: 0% is all-empty, 100% is all-filled, absent pct is all-empty", () => {
  const stripped = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  assert.strictEqual(stripped(makeBar(0, "")), "░".repeat(12));
  assert.strictEqual(stripped(makeBar(100, "")), "█".repeat(12));
  assert.strictEqual(stripped(makeBar(undefined, "")), "░".repeat(12));
});

test("fmtRem: clamps negative remainder to 0m, formats d/h/m thresholds", () => {
  const now = 1000000;
  assert.strictEqual(fmtRem(now - 10, now), "0m");
  assert.strictEqual(fmtRem(now + 90 * 60, now), "1h30m");
  assert.strictEqual(fmtRem(now + 2 * 86400 + 3600, now), "2d1h");
  assert.strictEqual(fmtRem(undefined, now), "");
});

test("fmtAbs: absent epoch returns empty string, present formats MM-DD HH:MM", () => {
  assert.strictEqual(fmtAbs(undefined), "");
  const out = fmtAbs(1784775600);
  assert.match(out, /^\d{2}-\d{2} \d{2}:\d{2}$/);
});

// ---------------------------------------------------------------------------
// renderStatusline
// ---------------------------------------------------------------------------

test("renderStatusline: full sample fixture renders all segments, no fabricated numbers", () => {
  const out = renderStatusline(SAMPLE_FIXTURE, stubGit("main"));
  const lines = out.split("\n");
  assert.strictEqual(lines.length, 3);
  assert.match(lines[0], /\[Opus 4\.8\]/);
  assert.match(lines[0], /git:main/);
  assert.match(lines[0], /Now using usage credits/); // five_hour is 100%
  assert.match(lines[1], /24% used \/ 76% left/);
  assert.match(lines[1], /tok in:2 out:1402 max:1000000/);
  assert.match(lines[2], /100% reset:/);
  assert.match(lines[2], /32% reset:/);
  assert.match(lines[2], /cost:\$14\.2030/);
});

test("renderStatusline: missing context_window/rate_limits degrade gracefully, no crash", () => {
  const minimal = { model: { display_name: "Sonnet 5" }, cwd: "/tmp/x" };
  const out = renderStatusline(minimal, stubGit(null));
  const lines = out.split("\n");
  assert.strictEqual(lines.length, 3);
  assert.doesNotMatch(lines[1], /used \/ .* left/); // no CTX % — absent, not fabricated
  assert.doesNotMatch(lines[1], /tok in/); // no token fields at all present
  assert.doesNotMatch(lines[2], /reset:/); // no rate_limits at all
  assert.doesNotMatch(lines[0], /git:/); // git lookup failed → no branch segment
});

test("renderStatusline: 0% context usage still renders (not treated as absent)", () => {
  const input = { context_window: { used_percentage: 0, remaining_percentage: 100 } };
  const out = renderStatusline(input, stubGit(null));
  assert.match(out.split("\n")[1], /0% used \/ 100% left/);
});

test("renderStatusline: five_hour below 100% does not show the credits notice", () => {
  const input = { rate_limits: { five_hour: { used_percentage: 42, resets_at: 123 } } };
  const out = renderStatusline(input, stubGit(null));
  assert.doesNotMatch(out.split("\n")[0], /usage credits/);
});

// ---------------------------------------------------------------------------
// account discovery / install / uninstall
// ---------------------------------------------------------------------------

test("claudeAccountDirs: finds default + dash-variant, ignores unrelated dirs", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {}, ".codex": {}, "not-related": {} });
  try {
    const dirs = claudeAccountDirs({ homedir: home });
    const labels = dirs.map((d) => d.label).sort();
    assert.deepStrictEqual(labels, [".claude", ".claude-b"]);
  } finally {
    rmHome(home);
  }
});

test("currentAccountDir: env CLAUDE_CONFIG_DIR wins over default ~/.claude", () => {
  assert.strictEqual(currentAccountDir({ env: {}, homedir: "/home/u" }), "/home/u/.claude");
  assert.strictEqual(currentAccountDir({ env: { CLAUDE_CONFIG_DIR: "/x/.claude-b" }, homedir: "/home/u" }), "/x/.claude-b");
});

test("isOurEntry: only matches our exact command string", () => {
  assert.strictEqual(isOurEntry({ type: "command", command: COMMAND }), true);
  assert.strictEqual(isOurEntry({ type: "command", command: "some/other/script.sh" }), false);
  assert.strictEqual(isOurEntry(undefined), false);
});

test("planInstall: default targets only the current account (env CLAUDE_CONFIG_DIR)", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {} });
  try {
    const plan = planInstall({ homedir: home, env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude-b") } });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].label, ".claude-b");
  } finally {
    rmHome(home);
  }
});

test("planInstall: --all targets every discovered account dir", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {}, ".claude-work": {} });
  try {
    const plan = planInstall({ homedir: home, all: true });
    assert.strictEqual(plan.length, 3);
  } finally {
    rmHome(home);
  }
});

test("installOne: merges statusLine into existing settings.json, preserves other keys, backs up", () => {
  const home = makeHome({ ".claude": { settings: { theme: "auto", tui: "fullscreen" } } });
  try {
    const plan = planInstall({ homedir: home, env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude") } });
    const res = installOne(plan[0], { now: 111 });
    const written = JSON.parse(fs.readFileSync(res.settingsPath, "utf8"));
    assert.strictEqual(written.theme, "auto");
    assert.strictEqual(written.tui, "fullscreen");
    assert.strictEqual(written.statusLine.command, COMMAND);
    assert.ok(fs.existsSync(res.backupPath));
    const backup = JSON.parse(fs.readFileSync(res.backupPath, "utf8"));
    assert.strictEqual(backup.statusLine, undefined); // backup is pre-install content
  } finally {
    rmHome(home);
  }
});

test("planInstall: an existing different statusLine command is flagged willSkip (no --force)", () => {
  const home = makeHome({ ".claude": { settings: { statusLine: { type: "command", command: "custom.sh" } } } });
  try {
    const plan = planInstall({ homedir: home, env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude") } });
    assert.strictEqual(plan[0].willSkip, true);
    assert.strictEqual(plan[0].hasOther, true);
    const forced = planInstall({ homedir: home, env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude") }, force: true });
    assert.strictEqual(forced[0].willSkip, false);
  } finally {
    rmHome(home);
  }
});

test("uninstallOne: removes our entry, leaves a different command alone unless --force", () => {
  const home = makeHome({
    ".claude": { settings: { statusLine: { type: "command", command: COMMAND } } },
    ".claude-b": { settings: { statusLine: { type: "command", command: "custom.sh" } } },
  });
  try {
    const ours = { dir: path.join(home, ".claude"), label: ".claude", settingsPath: path.join(home, ".claude", "settings.json") };
    const resOurs = uninstallOne(ours, { now: 222 });
    assert.strictEqual(resOurs.removed, true);
    assert.strictEqual(JSON.parse(fs.readFileSync(ours.settingsPath, "utf8")).statusLine, undefined);

    const other = { dir: path.join(home, ".claude-b"), label: ".claude-b", settingsPath: path.join(home, ".claude-b", "settings.json") };
    const resOther = uninstallOne(other, { now: 222 });
    assert.strictEqual(resOther.removed, false);
    assert.match(resOther.reason, /different command/);
  } finally {
    rmHome(home);
  }
});

test("buildStatus: reports installed vs otherCommand vs not-installed per account", () => {
  const home = makeHome({
    ".claude": { settings: { statusLine: { type: "command", command: COMMAND } } },
    ".claude-b": { settings: { statusLine: { type: "command", command: "custom.sh" } } },
    ".claude-c": {},
  });
  try {
    const rows = buildStatus({ homedir: home, env: {} });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    assert.strictEqual(byLabel[".claude"].installed, true);
    assert.strictEqual(byLabel[".claude-b"].otherCommand, "custom.sh");
    assert.strictEqual(byLabel[".claude-c"].installed, false);
    assert.strictEqual(byLabel[".claude-c"].otherCommand, undefined);
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// Codex support (native [tui] status_line, append-only when safe)
// ---------------------------------------------------------------------------

test("hasTuiTable: matches a top-level [tui] header, not a [tui.sub] one", () => {
  assert.strictEqual(hasTuiTable("[tui]\nstatus_line = []\n"), true);
  assert.strictEqual(hasTuiTable("[tui]  # comment\n"), true);
  assert.strictEqual(hasTuiTable("[tui.model_availability_nux]\n\"x\" = 1\n"), false);
  assert.strictEqual(hasTuiTable("[projects.\"/workspace\"]\n"), false);
  assert.strictEqual(hasTuiTable(""), false);
});

test("codexTuiBlock: contains every documented segment and status_line_use_colors", () => {
  const block = codexTuiBlock();
  assert.match(block, /^\[tui\]/);
  for (const seg of CODEX_STATUS_LINE_SEGMENTS) {
    assert.ok(block.includes(`"${seg}"`), `missing segment ${seg}`);
  }
  assert.match(block, /status_line_use_colors = true/);
});

test("codexAccountDirs: finds .codex/.codex-* by sessions/, ignores .claude*", () => {
  const home = makeHome({ ".codex": {}, ".codex-b": {}, ".claude": {} });
  try {
    const dirs = codexAccountDirs({ homedir: home });
    assert.deepStrictEqual(dirs.map((d) => d.label).sort(), [".codex", ".codex-b"]);
  } finally {
    rmHome(home);
  }
});

test("currentCodexDir: env CODEX_HOME wins over default ~/.codex", () => {
  assert.strictEqual(currentCodexDir({ env: {}, homedir: "/home/u" }), "/home/u/.codex");
  assert.strictEqual(currentCodexDir({ env: { CODEX_HOME: "/x/.codex-b" }, homedir: "/home/u" }), "/x/.codex-b");
});

test("planCodexInstall: no config.toml at all -> not willSkip (safe to create)", () => {
  const home = makeHome({ ".codex": {} });
  try {
    const plan = planCodexInstall({ homedir: home, env: { CODEX_HOME: path.join(home, ".codex") } });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].exists, false);
    assert.strictEqual(plan[0].willSkip, false);
  } finally {
    rmHome(home);
  }
});

test("planCodexInstall: config.toml with other tables but no [tui] -> not willSkip", () => {
  const home = makeHome({ ".codex": { configToml: '[projects."/workspace"]\n' } });
  try {
    const plan = planCodexInstall({ homedir: home, env: { CODEX_HOME: path.join(home, ".codex") } });
    assert.strictEqual(plan[0].exists, true);
    assert.strictEqual(plan[0].hasTui, false);
    assert.strictEqual(plan[0].willSkip, false);
  } finally {
    rmHome(home);
  }
});

test("planCodexInstall: an existing [tui] table -> willSkip true (never auto-edited)", () => {
  const home = makeHome({ ".codex": { configToml: "[tui]\nanimations = false\n" } });
  try {
    const plan = planCodexInstall({ homedir: home, env: { CODEX_HOME: path.join(home, ".codex") } });
    assert.strictEqual(plan[0].hasTui, true);
    assert.strictEqual(plan[0].willSkip, true);
  } finally {
    rmHome(home);
  }
});

test("installCodexOne: creates config.toml fresh when absent", () => {
  const home = makeHome({ ".codex": {} });
  try {
    const plan = planCodexInstall({ homedir: home, env: { CODEX_HOME: path.join(home, ".codex") } });
    const res = installCodexOne(plan[0], { now: 333 });
    const written = fs.readFileSync(res.configPath, "utf8");
    assert.match(written, /^\[tui\]/);
    assert.strictEqual(res.backupPath, undefined); // nothing existed to back up
  } finally {
    rmHome(home);
  }
});

test("installCodexOne: appends after existing content, preserves it, backs up", () => {
  const home = makeHome({ ".codex": { configToml: '[projects."/workspace"]\n' } });
  try {
    const plan = planCodexInstall({ homedir: home, env: { CODEX_HOME: path.join(home, ".codex") } });
    const res = installCodexOne(plan[0], { now: 444 });
    const written = fs.readFileSync(res.configPath, "utf8");
    assert.match(written, /\[projects\."\/workspace"\]/); // original content preserved
    assert.match(written, /\[tui\]\nstatus_line = /); // new block appended
    assert.ok(fs.existsSync(res.backupPath));
    assert.strictEqual(fs.readFileSync(res.backupPath, "utf8"), '[projects."/workspace"]\n');
  } finally {
    rmHome(home);
  }
});

test("buildCodexStatus: reports hasTui per account, current flag from CODEX_HOME", () => {
  const home = makeHome({
    ".codex": { configToml: "[tui]\nstatus_line = []\n" },
    ".codex-b": {},
  });
  try {
    const rows = buildCodexStatus({ homedir: home, env: { CODEX_HOME: path.join(home, ".codex-b") } });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    assert.strictEqual(byLabel[".codex"].hasTui, true);
    assert.strictEqual(byLabel[".codex-b"].hasTui, false);
    assert.strictEqual(byLabel[".codex-b"].current, true);
    assert.strictEqual(byLabel[".codex"].current, false);
  } finally {
    rmHome(home);
  }
});

test("cmdStatusline install --runtime codex: creates config.toml, then skips a second run with existing [tui]", () => {
  const home = makeHome({ ".codex": {} });
  try {
    const deps = { homedir: home, env: { CODEX_HOME: path.join(home, ".codex") } };
    const out1 = [];
    assert.strictEqual(cmdStatusline(["install", "--runtime", "codex"], { ...deps, log: (s) => out1.push(s) }), 0);
    assert.ok(out1.join("\n").includes("installed:"));

    const out2 = [];
    const code2 = cmdStatusline(["install", "--runtime", "codex"], { ...deps, log: (s) => out2.push(s) });
    assert.strictEqual(code2, 1);
    assert.ok(out2.join("\n").includes("already has a [tui] table"));
  } finally {
    rmHome(home);
  }
});

test("cmdStatusline uninstall --runtime codex: never auto-edits, always reports skipped", () => {
  const home = makeHome({ ".codex": { configToml: "[tui]\nstatus_line = []\n" } });
  try {
    const out = [];
    const code = cmdStatusline(["uninstall", "--runtime", "codex"], {
      homedir: home,
      env: { CODEX_HOME: path.join(home, ".codex") },
      log: (s) => out.push(s),
    });
    assert.strictEqual(code, 1);
    assert.ok(out.join("\n").includes("isn't automated"));
    // config.toml is untouched
    assert.strictEqual(fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8"), "[tui]\nstatus_line = []\n");
  } finally {
    rmHome(home);
  }
});

test("cmdStatusline: rejects an unknown --runtime value", () => {
  const out = [];
  const code = cmdStatusline(["status", "--runtime", "bogus"], { err: (s) => out.push(s) });
  assert.strictEqual(code, 2);
  assert.ok(out.join("\n").includes("--runtime must be one of"));
});

// ---------------------------------------------------------------------------
// cmdStatusline (CLI wrapper)
// ---------------------------------------------------------------------------

test("cmdStatusline: help and preview exit 0 and touch no filesystem", () => {
  const out = [];
  assert.strictEqual(cmdStatusline(["--help"], { log: (s) => out.push(s) }), 0);
  assert.strictEqual(cmdStatusline(["preview"], { log: (s) => out.push(s), execFileSync: () => "" }), 0);
  assert.ok(out.join("\n").includes("statusline install"));
});

test("cmdStatusline render: reads stdin JSON, prints exactly 3 lines with no trailing newline", () => {
  const out = [];
  cmdStatusline(["render"], { write: (s) => out.push(s), stdin: JSON.stringify(SAMPLE_FIXTURE), execFileSync: () => "" });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].split("\n").length, 3);
  assert.ok(!out[0].endsWith("\n"), "render must not append a trailing newline (matches original printf)");
});

test("cmdStatusline render: malformed stdin does not throw, prints degraded output", () => {
  const out = [];
  const code = cmdStatusline(["render"], { write: (s) => out.push(s), stdin: "not json", execFileSync: () => "" });
  assert.strictEqual(code, 0);
  assert.strictEqual(out[0].split("\n").length, 3);
});

test("cmdStatusline install/status/uninstall end-to-end against a fake home", () => {
  const home = makeHome({ ".claude": {} });
  try {
    const out = [];
    const deps = { log: (s) => out.push(s), homedir: home, env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude") } };
    assert.strictEqual(cmdStatusline(["install"], deps), 0);
    assert.ok(out.join("\n").includes("installed:"));

    out.length = 0;
    assert.strictEqual(cmdStatusline(["status"], { ...deps, log: (s) => out.push(s) }), 0);
    assert.ok(out.join("\n").includes("installed"));

    out.length = 0;
    assert.strictEqual(cmdStatusline(["uninstall"], { ...deps, log: (s) => out.push(s) }), 0);
    assert.ok(out.join("\n").includes("removed:"));
  } finally {
    rmHome(home);
  }
});


// ---------------------------------------------------------------------------
// Multi-account naming + scope disclosure
//
// The bug these close, from a real report: two accounts, statusline missing on
// the second. `sdtk statusline install` had been run repeatedly and changed
// nothing, because (a) it defaults to the CURRENT account only and was being run
// from the other one, and (b) the second account already had a hand-written
// statusLine entry, which install correctly refuses to clobber. Both behaviours
// are right. Staying quiet about them is what cost the day.
//
// The second half is the naming: the user types `claude2`, every diagnostic
// printed `.claude-b`, and nothing on screen connected the two.
// ---------------------------------------------------------------------------

test("status rows carry the slot name, not just the directory", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {} });
  try {
    const rows = buildStatus({ homedir: home, env: {} });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.slot]));
    assert.strictEqual(byLabel[".claude"], "claude1");
    // The whole point: .claude-b is the legacy dir that `claude2` adopts.
    assert.strictEqual(byLabel[".claude-b"], "claude2");
  } finally {
    rmHome(home);
  }
});

test("the numeric dir form resolves to the same slot as the legacy letter form", () => {
  const home = makeHome({ ".claude": {}, ".claude-2": {} });
  try {
    const rows = buildStatus({ homedir: home, env: {} });
    assert.strictEqual(rows.find((r) => r.label === ".claude-2").slot, "claude2");
  } finally {
    rmHome(home);
  }
});

test("a named (non-numeric) slot dir keeps its own name", () => {
  const home = makeHome({ ".claude": {}, ".claude-work": {} });
  try {
    const rows = buildStatus({ homedir: home, env: {} });
    assert.strictEqual(rows.find((r) => r.label === ".claude-work").slot, "claude-work");
  } finally {
    rmHome(home);
  }
});

test("untargetedAccounts: a default install names the account it is NOT touching", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {} });
  try {
    const others = untargetedAccounts({
      homedir: home,
      env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude") },
    });
    assert.strictEqual(others.length, 1);
    assert.strictEqual(others[0].label, ".claude-b");
    assert.strictEqual(others[0].slot, "claude2");
  } finally {
    rmHome(home);
  }
});

test("untargetedAccounts: --all and --dir chose the scope, so there is nothing to warn about", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {} });
  try {
    const env = { CLAUDE_CONFIG_DIR: path.join(home, ".claude") };
    assert.deepStrictEqual(untargetedAccounts({ homedir: home, env, all: true }), []);
    assert.deepStrictEqual(
      untargetedAccounts({ homedir: home, env, dir: path.join(home, ".claude") }),
      []
    );
  } finally {
    rmHome(home);
  }
});

test("untargetedAccounts: a single-account machine gets no noise", () => {
  const home = makeHome({ ".claude": {} });
  try {
    const others = untargetedAccounts({
      homedir: home,
      env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude") },
    });
    assert.deepStrictEqual(others, []);
  } finally {
    rmHome(home);
  }
});

test("install output names both the slot and the sibling it left alone", () => {
  // Reproduces the report exactly: install run from claude1, second account
  // holding a hand-written entry, no flags.
  const home = makeHome({
    ".claude": {},
    ".claude-b": {
      settings: { statusLine: { type: "command", command: "/x/.claude-b/statusline.sh" } },
    },
  });
  const out = [];
  try {
    const code = cmdStatusline(["install"], {
      log: (s) => out.push(s),
      homedir: home,
      env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude") },
    });
    const text = out.join("\n");
    assert.strictEqual(code, 0);
    assert.ok(/installed: claude1 \(\.claude\)/.test(text), `slot missing from install line:\n${text}`);
    assert.ok(/not targeted/.test(text), `no disclosure of the untouched account:\n${text}`);
    assert.ok(/claude2 \(\.claude-b\)/.test(text), `the untouched account is not named:\n${text}`);
    assert.ok(/--all/.test(text), "does not say how to include it");
  } finally {
    rmHome(home);
  }
});

test("the skip line names the slot too, so it can be matched to what was typed", () => {
  const home = makeHome({
    ".claude-b": {
      settings: { statusLine: { type: "command", command: "/x/.claude-b/statusline.sh" } },
    },
  });
  const out = [];
  try {
    const code = cmdStatusline(["install"], {
      log: (s) => out.push(s),
      homedir: home,
      env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude-b") },
    });
    assert.strictEqual(code, 1, "a fully-skipped install must not report success");
    assert.ok(/skipped: claude2 \(\.claude-b\)/.test(out.join("\n")), out.join("\n"));
  } finally {
    rmHome(home);
  }
});

test("--all --force converts every account, which is the documented fix", () => {
  const home = makeHome({
    ".claude": { settings: { statusLine: { type: "command", command: "/x/a.sh" } } },
    ".claude-b": { settings: { statusLine: { type: "command", command: "/x/b.sh" } } },
  });
  try {
    const code = cmdStatusline(["install", "--all", "--force"], {
      log: () => {},
      homedir: home,
      env: { CLAUDE_CONFIG_DIR: path.join(home, ".claude-b") },
    });
    assert.strictEqual(code, 0);
    for (const d of [".claude", ".claude-b"]) {
      const s = JSON.parse(fs.readFileSync(path.join(home, d, "settings.json"), "utf8"));
      assert.strictEqual(s.statusLine.command, COMMAND, `${d} not converted`);
    }
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
(async () => {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  PASS: ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL: ${t.name}`);
      console.error(`        ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${tests.length} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
