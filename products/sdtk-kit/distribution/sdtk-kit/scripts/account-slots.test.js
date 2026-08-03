#!/usr/bin/env node
"use strict";

// Offline unit tests for `sdtk login` account slots (BK-385). Real fs against
// throwaway temp homes (mirrors scripts/account.test.js and
// scripts/statusline.test.js); no network, no vendor CLI, no real $HOME, and
// nothing here ever reads a credential file.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseSlot,
  candidateDirs,
  resolveSlotDir,
  slotNameForDir,
  envVarFor,
  launcherScript,
  launcherFileName,
  resolveBinDir,
  isOnPath,
  findShadowingAliases,
  readRegistry,
  writeRegistry,
  registryPath,
  planLogin,
  detectHeadless,
  resolveDeviceAuth,
  LAUNCHER_MARKER,
} = require("../src/lib/account-slots");

const { buildSpawnPlan, resolveWindowsCommand, CMD_UNSAFE_RE } = require("../src/lib/spawn-portable");
const { parseArgs, cmdLogin } = require("../src/commands/login");
const { onboardingState, markOnboardingComplete } = require("../src/lib/account-slots");

// Run cmdLogin with stdout captured, so an integration test can assert on what
// the user is actually told without spraying the test log.
function runLogin(args, deps) {
  const lines = [];
  const orig = console.log;
  console.log = (l = "") => lines.push(String(l));
  try {
    const code = cmdLogin(args, deps || {});
    return { code, out: lines.join("\n") };
  } finally {
    console.log = orig;
  }
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function makeHome(dirs = [], files = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-slots-home-"));
  for (const d of dirs) fs.mkdirSync(path.join(home, d), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(home, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, "utf-8");
  }
  return home;
}

// --- slot parsing -----------------------------------------------------------

test("parseSlot reads the vendor from the prefix", () => {
  assert.deepStrictEqual(
    { v: parseSlot("claude2").vendor, s: parseSlot("claude2").suffix },
    { v: "claude", s: "2" }
  );
  assert.strictEqual(parseSlot("codex1").vendor, "codex");
  assert.strictEqual(parseSlot("claude-work").suffix, "work");
});

test("parseSlot refuses the bare vendor name (a launcher would exec itself)", () => {
  const r = parseSlot("claude");
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /bare CLI/);
});

test("parseSlot refuses an unknown vendor and an empty name", () => {
  assert.strictEqual(parseSlot("foo1").ok, false);
  assert.strictEqual(parseSlot("").ok, false);
  assert.strictEqual(parseSlot("claude/../x").ok, false); // no path traversal in a slot
});

// --- adoption (the (b) decision) -------------------------------------------

test("claude1 maps to the vendor default dir, claude2 to the -2 form", () => {
  assert.deepStrictEqual(candidateDirs("claude", "1", "/h"), ["/h/.claude"]);
  assert.deepStrictEqual(candidateDirs("claude", "2", "/h"), ["/h/.claude-2", "/h/.claude-b"]);
  assert.deepStrictEqual(candidateDirs("codex", "3", "/h"), ["/h/.codex-3", "/h/.codex-c"]);
});

test("an existing legacy ~/.claude-b is ADOPTED as claude2, not duplicated", () => {
  const home = makeHome([".claude", ".claude-b"]);
  const one = resolveSlotDir("claude", "1", { homedir: home });
  const two = resolveSlotDir("claude", "2", { homedir: home });
  assert.strictEqual(one.dir, path.join(home, ".claude"));
  assert.strictEqual(one.adopted, true);
  assert.strictEqual(two.dir, path.join(home, ".claude-b"), "must adopt the legacy dir");
  assert.strictEqual(two.adopted, true);
});

test("a slot with no existing dir resolves to the canonical new dir", () => {
  const home = makeHome([]);
  const r = resolveSlotDir("claude", "3", { homedir: home });
  assert.strictEqual(r.dir, path.join(home, ".claude-3"));
  assert.strictEqual(r.adopted, false);
});

test("--dir overrides resolution entirely", () => {
  const home = makeHome([".claude-b"]);
  const r = resolveSlotDir("claude", "2", { homedir: home, dirOverride: "/tmp/custom" });
  assert.strictEqual(r.dir, path.resolve("/tmp/custom"));
  assert.strictEqual(r.explicit, true);
});

// --- launcher ---------------------------------------------------------------

test("the POSIX launcher exports the vendor env var and forwards all args", () => {
  const body = launcherScript({ vendor: "claude", slot: "claude2", dir: "/h/.claude-b", platform: "linux" });
  assert.match(body, /^#!\/bin\/sh/);
  assert.ok(body.includes(LAUNCHER_MARKER), "must be identifiable as sdtk-managed");
  assert.ok(body.includes('export CLAUDE_CONFIG_DIR="/h/.claude-b"'));
  assert.ok(body.includes('exec claude "$@"'), "arg forwarding is what makes --resume work");
  assert.strictEqual(launcherFileName("claude2", "linux"), "claude2");
});

test("the Windows launcher uses the .cmd form and %*", () => {
  const body = launcherScript({ vendor: "codex", slot: "codex1", dir: "C:\\h\\.codex", platform: "win32" });
  assert.ok(body.startsWith("@echo off"));
  assert.ok(body.includes('set "CODEX_HOME=C:\\h\\.codex"'));
  assert.ok(body.includes("codex %*"));
  assert.strictEqual(launcherFileName("codex1", "win32"), "codex1.cmd");
});

test("envVarFor maps each vendor to its own config variable", () => {
  assert.strictEqual(envVarFor("claude"), "CLAUDE_CONFIG_DIR");
  assert.strictEqual(envVarFor("codex"), "CODEX_HOME");
});

// --- bin dir / PATH ---------------------------------------------------------

test("resolveBinDir prefers a candidate that is already on PATH", () => {
  const home = makeHome([".local/bin"]);
  const binDir = path.join(home, ".local", "bin");
  const r = resolveBinDir({ env: { PATH: `/usr/bin:${binDir}` }, homedir: home, platform: "linux" });
  assert.strictEqual(r.dir, binDir);
  assert.strictEqual(r.onPath, true);
});

test("resolveBinDir falls back and flags the PATH gap when nothing matches", () => {
  const home = makeHome([]);
  const r = resolveBinDir({ env: { PATH: "/usr/bin" }, homedir: home, platform: "linux" });
  assert.strictEqual(r.dir, path.join(home, ".local", "bin"));
  assert.strictEqual(r.onPath, false, "a launcher that cannot resolve must be reported, not hidden");
});

test("isOnPath ignores trailing separators and is platform aware", () => {
  assert.strictEqual(isOnPath("/a/b", { PATH: "/x:/a/b/" }, "linux"), true);
  assert.strictEqual(isOnPath("/a/b", { PATH: "/x:/a/bc" }, "linux"), false);
  assert.strictEqual(isOnPath("C:\\bin", { PATH: "C:\\other;C:\\bin" }, "win32"), true);
});

// --- alias shadowing (the silent-failure guard) -----------------------------

test("a shell alias of the same name is detected with file and line", () => {
  const home = makeHome([], {
    ".bashrc": "# comment\nalias claude2='CLAUDE_CONFIG_DIR=/root/.claude-b claude'\nalias ll='ls -l'\n",
  });
  const hits = findShadowingAliases("claude2", { homedir: home });
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].line, 2);
  assert.ok(hits[0].file.endsWith(".bashrc"));
});

test("a similarly named alias does not false-positive", () => {
  const home = makeHome([], { ".bashrc": "alias claude22='x'\nalias myclaude2='y'\n" });
  assert.strictEqual(findShadowingAliases("claude2", { homedir: home }).length, 0);
});

// --- registry ---------------------------------------------------------------

test("the registry round-trips and tolerates a malformed file", () => {
  const home = makeHome([]);
  writeRegistry({ slots: { claude2: { vendor: "claude", dir: "/h/.claude-b", command: "claude2" } } }, { homedir: home });
  assert.strictEqual(readRegistry({ homedir: home }).slots.claude2.command, "claude2");
  fs.writeFileSync(registryPath(home), "{ not json", "utf-8");
  assert.deepStrictEqual(readRegistry({ homedir: home }).slots, {}, "a broken index must not break the CLI");
});

// --- plan (end to end, still side-effect free) ------------------------------

test("planLogin describes the whole operation without touching anything", () => {
  const home = makeHome([".claude", ".claude-b", ".local/bin"], {
    ".bashrc": "alias claude2='CLAUDE_CONFIG_DIR=/root/.claude-b claude'\n",
  });
  const binDir = path.join(home, ".local", "bin");
  const plan = planLogin("claude2", { homedir: home, env: { PATH: binDir }, platform: "linux" });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.vendor, "claude");
  assert.strictEqual(plan.dir, path.join(home, ".claude-b"), "adopts the legacy dir");
  assert.strictEqual(plan.command, "claude2");
  assert.strictEqual(plan.launcherPath, path.join(binDir, "claude2"));
  assert.deepStrictEqual(plan.loginArgv, ["auth", "login"]);
  assert.deepStrictEqual(plan.logoutArgv, ["auth", "logout"]);
  assert.strictEqual(plan.shadowingAliases.length, 1, "must surface the shadowing alias");
  // Nothing was created by planning.
  assert.strictEqual(fs.existsSync(plan.launcherPath), false);
  assert.strictEqual(fs.existsSync(registryPath(home)), false);
});

test("planLogin wires codex device-auth through to the vendor argv", () => {
  const home = makeHome([]);
  const browserEnv = { PATH: "", DISPLAY: ":0" };
  const plain = planLogin("codex2", { homedir: home, env: browserEnv, platform: "linux", fsImpl: noDockerFs() });
  const device = planLogin("codex2", { homedir: home, env: browserEnv, platform: "linux", deviceAuth: true });
  assert.deepStrictEqual(plain.loginArgv, ["login"]);
  assert.deepStrictEqual(device.loginArgv, ["login", "--device-auth"]);
  assert.strictEqual(device.envVar, "CODEX_HOME");
});

// --- headless detection / device-code selection -----------------------------

// An fs whose existsSync says "/.dockerenv is absent" but otherwise behaves
// normally, so detection can be tested without depending on the real host.
function noDockerFs() {
  return Object.assign(Object.create(fs), {
    existsSync: (p) => (p === "/.dockerenv" ? false : fs.existsSync(p)),
  });
}
function dockerFs() {
  return Object.assign(Object.create(fs), {
    existsSync: (p) => (p === "/.dockerenv" ? true : fs.existsSync(p)),
  });
}

test("detectHeadless recognises a container, SSH, and a display-less Linux box", () => {
  assert.strictEqual(detectHeadless({ env: { DISPLAY: ":0" }, fsImpl: dockerFs(), platform: "linux" }).headless, true);
  assert.strictEqual(
    detectHeadless({ env: { SSH_CONNECTION: "1.2.3.4 22" }, fsImpl: noDockerFs(), platform: "linux" }).headless,
    true
  );
  assert.strictEqual(detectHeadless({ env: {}, fsImpl: noDockerFs(), platform: "linux" }).headless, true);
});

test("detectHeadless leaves a desktop session alone", () => {
  const d = detectHeadless({ env: { DISPLAY: ":0" }, fsImpl: noDockerFs(), platform: "linux" });
  assert.strictEqual(d.headless, false);
  assert.deepStrictEqual(d.reasons, []);
  // macOS/Windows have no DISPLAY concept, so its absence must not count.
  assert.strictEqual(detectHeadless({ env: {}, fsImpl: noDockerFs(), platform: "darwin" }).headless, false);
});

test("codex device-code is auto-selected when headless, and reports why", () => {
  const r = resolveDeviceAuth("codex", { env: {}, fsImpl: dockerFs(), platform: "linux" });
  assert.strictEqual(r.use, true);
  assert.match(r.source, /^auto \(/, "the reason must be printable, never silent");
  assert.match(r.source, /dockerenv/);
});

test("explicit flags beat detection in both directions", () => {
  const forcedOff = resolveDeviceAuth("codex", { noDeviceAuth: true, env: {}, fsImpl: dockerFs(), platform: "linux" });
  assert.strictEqual(forcedOff.use, false);
  assert.match(forcedOff.source, /explicit/);
  const forcedOn = resolveDeviceAuth("codex", {
    deviceAuth: true,
    env: { DISPLAY: ":0" },
    fsImpl: noDockerFs(),
    platform: "linux",
  });
  assert.strictEqual(forcedOn.use, true);
  assert.match(forcedOn.source, /explicit/);
});

test("claude never gets a device-auth flag — it has no such mode", () => {
  const r = resolveDeviceAuth("claude", { env: {}, fsImpl: dockerFs(), platform: "linux" });
  assert.strictEqual(r.use, false);
  const plan = planLogin("claude2", { homedir: makeHome([]), env: { PATH: "" }, platform: "linux", fsImpl: dockerFs() });
  assert.deepStrictEqual(plan.loginArgv, ["auth", "login"], "claude argv must stay clean");
});

test("a headless codex plan carries --device-auth end to end", () => {
  const home = makeHome([]);
  const plan = planLogin("codex1", { homedir: home, env: { PATH: "" }, platform: "linux", fsImpl: dockerFs() });
  assert.deepStrictEqual(plan.loginArgv, ["login", "--device-auth"]);
  assert.strictEqual(plan.deviceAuth.use, true);
});

test("planLogin surfaces the parse error instead of throwing", () => {
  const plan = planLogin("nope", { homedir: makeHome([]) });
  assert.strictEqual(plan.ok, false);
  assert.match(plan.error, /claude.*codex/);
});

// --- Windows shim dispatch (BK-387 regression) ------------------------------

// The reported failure: on Windows `claude` is an npm shim `claude.cmd`.
// CreateProcess only appends .exe for a bare name, and Node refuses to spawn
// .cmd with shell:false, so `sdtk login` reported "'claude' is not on PATH"
// against a working install. These simulate a Windows PATH with real files, so
// they run on the Linux CI box.
function fakeWindowsPath(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-winpath-"));
  for (const f of files) fs.writeFileSync(path.join(dir, f), "shim", "utf-8");
  return dir;
}

test("a bare command resolves to its .cmd shim on Windows", () => {
  const dir = fakeWindowsPath(["claude.cmd"]);
  const r = resolveWindowsCommand("claude", { env: { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" } });
  assert.ok(r, "claude.cmd must resolve — this is the exact bug that shipped");
  assert.strictEqual(r.ext, ".cmd");
  assert.strictEqual(r.file, path.join(dir, "claude.cmd"));
});

test("a .cmd shim is dispatched through cmd.exe, never spawned directly", () => {
  const dir = fakeWindowsPath(["claude.cmd"]);
  const plan = buildSpawnPlan(["claude", "auth", "login"], {
    platform: "win32",
    env: { PATH: dir, ComSpec: "C:\\Windows\\system32\\cmd.exe" },
  });
  assert.strictEqual(plan.viaCmdShim, true);
  assert.strictEqual(plan.file, "C:\\Windows\\system32\\cmd.exe");
  assert.deepStrictEqual(plan.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.ok(plan.args[3].includes("auth"));
  assert.ok(plan.args[3].includes("login"));
  assert.strictEqual(plan.spawnOptions.windowsVerbatimArguments, true);
});

test("an .exe is spawned directly, not wrapped in a shell", () => {
  const dir = fakeWindowsPath(["codex.exe"]);
  const plan = buildSpawnPlan(["codex", "login"], { platform: "win32", env: { PATH: dir } });
  assert.strictEqual(plan.viaCmdShim, false);
  assert.strictEqual(plan.file, path.join(dir, "codex.exe"));
  assert.deepStrictEqual(plan.args, ["login"]);
});

test("PATH is read case-insensitively, as Windows does", () => {
  const dir = fakeWindowsPath(["claude.cmd"]);
  assert.ok(resolveWindowsCommand("claude", { env: { Path: dir } }), "'Path' spelling must work too");
});

test("an unresolvable Windows command yields null so the caller can fail closed", () => {
  const dir = fakeWindowsPath([]);
  assert.strictEqual(resolveWindowsCommand("claude", { env: { PATH: dir } }), null);
  assert.strictEqual(buildSpawnPlan(["claude"], { platform: "win32", env: { PATH: dir } }), null);
});

test("non-Windows platforms keep the previous bare-name behavior exactly", () => {
  const plan = buildSpawnPlan(["claude", "auth", "login"], { platform: "linux", env: {} });
  assert.strictEqual(plan.file, "claude");
  assert.deepStrictEqual(plan.args, ["auth", "login"]);
  assert.strictEqual(plan.viaCmdShim, false);
});

test("cmd.exe metacharacters are rejected but ordinary paths with spaces are not", () => {
  assert.strictEqual(CMD_UNSAFE_RE.test("C:\\Program Files\\nodejs\\claude.cmd"), false);
  for (const bad of ["%PATH%", "a^b", 'a"b']) {
    assert.strictEqual(CMD_UNSAFE_RE.test(bad), true, `${bad} must be rejected`);
  }
});

test("the Windows launcher calls the shim and propagates its exit code", () => {
  const body = launcherScript({ vendor: "claude", slot: "claude2", dir: "C:\\Users\\x\\.claude-2", platform: "win32" });
  assert.ok(body.includes("setlocal"), "must not leak the env var into a calling script");
  assert.ok(body.includes("call claude %*"), "batch-to-batch needs `call` or control never returns");
  assert.ok(body.includes("exit /b %ERRORLEVEL%"));
});

// --- --launcher-only (BK-388) -----------------------------------------------

test("--launcher-only and --no-launcher are parsed as opposites", () => {
  assert.strictEqual(parseArgs(["claude2", "--launcher-only"]).launcherOnly, true);
  assert.strictEqual(parseArgs(["claude2", "--launcher-only"]).noLauncher, undefined);
  assert.strictEqual(parseArgs(["claude2", "--no-launcher"]).noLauncher, true);
  assert.strictEqual(parseArgs(["claude2", "--no-launcher"]).launcherOnly, undefined);
  assert.strictEqual(parseArgs(["claude2"]).launcherOnly, undefined);
});

test("--launcher-only still parses the slot and other flags", () => {
  const o = parseArgs(["codex2", "--launcher-only", "--command", "cx"]);
  assert.strictEqual(o.slot, "codex2");
  assert.strictEqual(o.command, "cx");
  assert.strictEqual(o.launcherOnly, true);
});

// --- --share-sessions (BK-389) ----------------------------------------------

test("--share-sessions is parsed and is independent of the other flags", () => {
  assert.strictEqual(parseArgs(["claude2", "--share-sessions"]).shareSessions, true);
  assert.strictEqual(parseArgs(["claude2"]).shareSessions, undefined);
  const o = parseArgs(["claude2", "--launcher-only", "--share-sessions"]);
  assert.strictEqual(o.launcherOnly, true);
  assert.strictEqual(o.shareSessions, true);
});

// End-to-end through cmdLogin: --launcher-only never shells out to the vendor,
// so this exercises the whole slot -> dir -> launcher -> shared-store path with
// no network, no real $HOME and no credential ever touched.
function withSlotHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-slot-home-"));
  const bin = path.join(home, "bin");
  fs.mkdirSync(bin, { recursive: true });
  // A pre-existing session under the default account — the thing claude2 must
  // be able to --resume once the store is shared.
  const proj = path.join(home, ".claude", "projects", "proj");
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, "sess-1.jsonl"), '{"type":"assistant"}\n');
  try {
    return fn({ home, bin });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("sdtk login claude2 --launcher-only --share-sessions makes claude1's session visible to claude2", () => {
  withSlotHome(({ home, bin }) => {
    const r = runLogin(["claude2", "--launcher-only", "--share-sessions", "--bin-dir", bin], { homedir: home });
    assert.strictEqual(r.code, 0);
    assert.ok(/Session store shared with/.test(r.out), `expected a share report, got:\n${r.out}`);
    assert.ok(/never --resume the SAME session id/.test(r.out), "the two-writer hazard is stated");

    // The slot dir now reads the default account's physical store.
    const slotStore = path.join(home, ".claude-2", "projects");
    assert.strictEqual(fs.lstatSync(slotStore).isSymbolicLink(), true);
    assert.strictEqual(
      fs.realpathSync(path.join(slotStore, "proj", "sess-1.jsonl")),
      fs.realpathSync(path.join(home, ".claude", "projects", "proj", "sess-1.jsonl"))
    );
    // …and the launcher exists, so `claude2 --resume <id>` can actually reach it.
    assert.ok(fs.existsSync(path.join(bin, launcherFileName("claude2"))));
  });
});

test("--share-sessions on claude1 refuses instead of linking the default account to itself", () => {
  withSlotHome(({ home, bin }) => {
    const r = runLogin(["claude1", "--launcher-only", "--share-sessions", "--bin-dir", bin], { homedir: home });
    assert.strictEqual(r.code, 0);
    assert.ok(/IS the default account/.test(r.out), `expected a refusal, got:\n${r.out}`);
    // The primary store must stay a real directory — linking it to itself would
    // be an ELOOP that strands every session.
    assert.strictEqual(fs.lstatSync(path.join(home, ".claude", "projects")).isSymbolicLink(), false);
  });
});

test("--share-sessions is a no-op for codex and says so", () => {
  withSlotHome(({ home, bin }) => {
    const r = runLogin(["codex2", "--launcher-only", "--share-sessions", "--bin-dir", bin], { homedir: home });
    assert.strictEqual(r.code, 0);
    assert.ok(/covers Claude only/.test(r.out), `expected a scope note, got:\n${r.out}`);
    assert.strictEqual(fs.existsSync(path.join(home, ".codex-2", "sessions")), false);
  });
});

test("without --share-sessions, --launcher-only still tells the user how to share", () => {
  withSlotHome(({ home, bin }) => {
    const r = runLogin(["claude2", "--launcher-only", "--bin-dir", bin], { homedir: home });
    assert.ok(/--share-sessions/.test(r.out), "the adoption path must surface the shared store");
    // Nothing was linked: the flag is opt-in.
    assert.strictEqual(fs.existsSync(path.join(home, ".claude-2", "projects")), false);
  });
});


// --- first-run onboarding (BK-391) ------------------------------------------
//
// The defect: `claude auth login` writes credentials but never sets
// `hasCompletedOnboarding`, so the next interactive run enters onboarding, whose
// own login step ignores those credentials and asks again. Reproduced with SDTK
// removed entirely, so these tests pin OUR side: mark the flag, touch nothing
// else, and never go near the credential file.

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("markOnboardingComplete creates .claude.json when the dir has none", () => {
  const d = tmpDir("sdtk-onb-");
  try {
    assert.strictEqual(onboardingState(d).completed, false);
    const r = markOnboardingComplete(d);
    assert.strictEqual(r.status, "set");
    assert.strictEqual(r.created, true);
    assert.strictEqual(onboardingState(d).completed, true);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("markOnboardingComplete preserves every other key", () => {
  const d = tmpDir("sdtk-onb-");
  try {
    const file = path.join(d, ".claude.json");
    const original = {
      oauthAccount: { emailAddress: "a@b.c", accountUuid: "u" },
      projects: { "/x": { allowedTools: ["Bash"] } },
      tipsHistory: { t: 2 },
      numStartups: 7,
    };
    fs.writeFileSync(file, JSON.stringify(original));
    markOnboardingComplete(d);
    const after = JSON.parse(fs.readFileSync(file, "utf-8"));
    assert.strictEqual(after.hasCompletedOnboarding, true);
    for (const k of Object.keys(original)) {
      assert.deepStrictEqual(after[k], original[k], `key ${k} must survive untouched`);
    }
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("markOnboardingComplete is idempotent", () => {
  const d = tmpDir("sdtk-onb-");
  try {
    markOnboardingComplete(d);
    const before = fs.readFileSync(path.join(d, ".claude.json"), "utf-8");
    const second = markOnboardingComplete(d);
    assert.strictEqual(second.status, "already");
    assert.strictEqual(fs.readFileSync(path.join(d, ".claude.json"), "utf-8"), before);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("markOnboardingComplete REFUSES malformed JSON instead of clobbering it", () => {
  const d = tmpDir("sdtk-onb-");
  try {
    const file = path.join(d, ".claude.json");
    const junk = "{ this is not json";
    fs.writeFileSync(file, junk);
    const r = markOnboardingComplete(d);
    assert.strictEqual(r.status, "refused");
    assert.strictEqual(fs.readFileSync(file, "utf-8"), junk,
      "a config we cannot parse must be left exactly as found");
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("onboarding handling never touches the credential file", () => {
  const d = tmpDir("sdtk-onb-");
  try {
    const creds = path.join(d, ".credentials.json");
    fs.writeFileSync(creds, '{"secret":"do-not-read"}');
    const before = fs.statSync(creds);
    markOnboardingComplete(d);
    onboardingState(d);
    assert.strictEqual(fs.readFileSync(creds, "utf-8"), '{"secret":"do-not-read"}');
    assert.strictEqual(fs.statSync(creds).mtimeMs, before.mtimeMs);
    // And the source must not even name it.
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "account-slots.js"), "utf-8");
    const onbSection = src.slice(src.indexOf("first-run onboarding"), src.indexOf("--- registry"));
    assert.ok(!onbSection.includes(".credentials.json") || onbSection.includes("never reads"),
      "the onboarding code must not read .credentials.json");
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("--keep-onboarding is parsed and is independent of the other flags", () => {
  assert.strictEqual(parseArgs(["claude2", "--keep-onboarding"]).keepOnboarding, true);
  assert.strictEqual(parseArgs(["claude2"]).keepOnboarding, undefined);
  const o = parseArgs(["claude2", "--keep-onboarding", "--share-sessions"]);
  assert.strictEqual(o.keepOnboarding, true);
  assert.strictEqual(o.shareSessions, true);
});


// ---------------------------------------------------------------------------
// slotNameForDir — the reverse of candidateDirs.
//
// A user types `claude2`; on disk that is ~/.claude-2, or ~/.claude-b when the
// dir predates the slot system and got adopted. Diagnostics that print only the
// directory leave the user to make that connection, and nothing on screen lets
// them. This is the lookup that lets a command print both.
// ---------------------------------------------------------------------------

test("slotNameForDir: the vendor default is slot 1", () => {
  const home = makeHome();
  assert.strictEqual(slotNameForDir(path.join(home, ".claude"), { homedir: home }), "claude1");
  assert.strictEqual(slotNameForDir(path.join(home, ".codex"), { homedir: home }), "codex1");
});

test("slotNameForDir: numeric and legacy-letter dirs resolve to the same slot", () => {
  const home = makeHome();
  assert.strictEqual(slotNameForDir(path.join(home, ".claude-2"), { homedir: home }), "claude2");
  // The case from the field report — candidateDirs still adopts this form.
  assert.strictEqual(slotNameForDir(path.join(home, ".claude-b"), { homedir: home }), "claude2");
  assert.strictEqual(slotNameForDir(path.join(home, ".claude-c"), { homedir: home }), "claude3");
});

test("slotNameForDir: a named slot keeps its name", () => {
  const home = makeHome();
  assert.strictEqual(slotNameForDir(path.join(home, ".claude-work"), { homedir: home }), "claude-work");
});

test("slotNameForDir: the registry wins over the derived name", () => {
  // `sdtk login claude2 --dir /somewhere/odd` produces a dir whose name encodes
  // nothing. Only what login recorded can name it, so the registry is consulted
  // first — otherwise an explicit --dir account would print as unnamed forever.
  const home = makeHome();
  const odd = path.join(home, "custom-config");
  writeRegistry(
    { slots: { claude2: { vendor: "claude", dir: odd, command: "claude2" } } },
    { homedir: home }
  );
  assert.strictEqual(slotNameForDir(odd, { homedir: home }), "claude2");
});

test("slotNameForDir: a registry entry overrides a misleading directory name", () => {
  const home = makeHome();
  const dir = path.join(home, ".claude-b");
  writeRegistry(
    { slots: { "claude-legacy": { vendor: "claude", dir, command: "claude-legacy" } } },
    { homedir: home }
  );
  assert.strictEqual(slotNameForDir(dir, { homedir: home }), "claude-legacy");
});

test("slotNameForDir: an unrelated path is unnamed rather than guessed", () => {
  const home = makeHome();
  assert.strictEqual(slotNameForDir(path.join(home, "notes"), { homedir: home }), null);
  assert.strictEqual(slotNameForDir(null, { homedir: home }), null);
});

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
