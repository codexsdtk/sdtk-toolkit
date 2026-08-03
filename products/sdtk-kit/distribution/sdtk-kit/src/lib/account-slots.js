"use strict";

// BK-385 — named account slots for `sdtk login` / `sdtk logout`.
//
// A "slot" is a human name for one vendor account: claude1, claude2, codex1,
// claude-work. Each slot maps to a config dir (CLAUDE_CONFIG_DIR / CODEX_HOME)
// and gets a launcher of the same name on PATH, so `claude2` starts a session
// on that account and `claude2 --resume <id>` reopens one — the launcher just
// forwards every argument to the real CLI.
//
// Credential-free, like the rest of `sdtk account` (BK-373): SDTK creates the
// directory, writes the launcher, and then DELEGATES to the vendor's own login
// (`claude auth login` / `codex login`). It never reads, copies, or stores a
// credential, and never parses the vendor's auth files.
//
// Everything here is pure or takes an injected fs/env/homedir so the command
// layer stays a thin shell and the logic is testable offline.

const fs = require("fs");
const os = require("os");
const path = require("path");

const VENDORS = Object.freeze(["claude", "codex"]);
const REGISTRY_REL = path.join(".sdtk", "accounts.json");
const REGISTRY_SCHEMA = "sdtk.accounts.v1";
const LAUNCHER_MARKER = "sdtk-managed-launcher";

// --- slot names -------------------------------------------------------------

// "claude2" -> { vendor:"claude", suffix:"2" }; "claude-work" -> suffix "work".
// The bare vendor name is refused on purpose: a launcher called `claude` would
// exec itself forever, and it would shadow the real CLI.
function parseSlot(name) {
  const raw = String(name == null ? "" : name).trim();
  if (!raw) return { ok: false, error: "Slot name is required (e.g. claude2, codex1, claude-work)." };
  const vendor = VENDORS.find((v) => raw === v || raw.startsWith(v));
  if (!vendor) {
    return { ok: false, error: `Slot must start with 'claude' or 'codex' (got '${raw}').` };
  }
  if (raw === vendor) {
    return {
      ok: false,
      error:
        `'${vendor}' is the bare CLI itself, not a slot. Use ${vendor}1, ${vendor}2, … ` +
        `— ${vendor}1 adopts the existing ~/.${vendor} account.`,
    };
  }
  const suffix = raw.slice(vendor.length).replace(/^-+/, "");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(suffix)) {
    return { ok: false, error: `Invalid slot suffix '${suffix}'. Use letters, digits and dashes.` };
  }
  return { ok: true, vendor, suffix, slot: raw };
}

// Candidate dirs for a slot, most-preferred first. An EXISTING candidate is
// adopted rather than creating a parallel dir — this is what lets claude1 pick
// up ~/.claude and claude2 pick up a legacy ~/.claude-b without re-logging in.
//   claudeN  -> N==1: ~/.claude (the vendor default)
//               N>=2: ~/.claude-N, then the legacy letter form (2->b, 3->c, …)
//   claude-x -> ~/.claude-x
function candidateDirs(vendor, suffix, homedir = os.homedir()) {
  const dot = (name) => path.join(homedir, name);
  if (/^\d+$/.test(suffix)) {
    const n = Number(suffix);
    if (n === 1) return [dot(`.${vendor}`)];
    const letter = String.fromCharCode(96 + n); // 2 -> 'b'
    const legacy = n <= 26 ? [dot(`.${vendor}-${letter}`)] : [];
    return [dot(`.${vendor}-${n}`), ...legacy];
  }
  return [dot(`.${vendor}-${suffix}`)];
}

// Resolve a slot to a concrete dir. `adopted` = the dir already existed.
function resolveSlotDir(vendor, suffix, { homedir = os.homedir(), fsImpl = fs, dirOverride } = {}) {
  if (dirOverride) {
    return { dir: path.resolve(dirOverride), adopted: existsDir(path.resolve(dirOverride), fsImpl), explicit: true };
  }
  const candidates = candidateDirs(vendor, suffix, homedir);
  for (const c of candidates) {
    if (existsDir(c, fsImpl)) return { dir: c, adopted: true, explicit: false };
  }
  return { dir: candidates[0], adopted: false, explicit: false };
}

function existsDir(p, fsImpl = fs) {
  try {
    return fsImpl.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

// The reverse of candidateDirs: given a config dir, what does a human call it?
//
// This exists because the two namespaces do not look alike. A user types
// `claude2`; on disk that may be ~/.claude-2, or ~/.claude-b if the dir predates
// the slot system and got adopted (see candidateDirs). Any diagnostic that
// prints only the directory makes the user do that translation in their head,
// and they cannot — nothing on screen connects ".claude-b" to "claude2".
function slotNameForDir(dir, { homedir = os.homedir(), fsImpl = fs } = {}) {
  if (!dir) return null;
  const target = path.resolve(dir);

  // The registry is what `sdtk login` actually recorded, so it wins — it is the
  // only thing that can name a dir chosen with an explicit --dir override.
  const reg = readRegistry({ homedir, fsImpl });
  for (const [slot, entry] of Object.entries(reg.slots || {})) {
    if (entry && entry.dir && path.resolve(entry.dir) === target) return slot;
  }

  // No registry entry (never logged in through `sdtk login`, or it was pruned):
  // derive the name the same way candidateDirs would have produced the dir.
  const base = path.basename(target);
  for (const vendor of VENDORS) {
    if (base === `.${vendor}`) return `${vendor}1`;
    const prefix = `.${vendor}-`;
    if (!base.startsWith(prefix)) continue;
    const suffix = base.slice(prefix.length);
    if (/^\d+$/.test(suffix)) return `${vendor}${suffix}`;
    // Legacy letter form, the mapping candidateDirs still honours: b -> 2, c -> 3.
    if (/^[a-z]$/.test(suffix)) return `${vendor}${suffix.charCodeAt(0) - 96}`;
    return `${vendor}-${suffix}`;
  }
  return null;
}

// --- launcher ---------------------------------------------------------------

function envVarFor(vendor) {
  return vendor === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
}

// The launcher is a real executable, not a shell alias: aliases only exist in
// interactive shells of one shell family, so they break in scripts, cron, and
// zsh/fish. `exec "$@"` forwarding is what makes `claude2 --resume <id>` work
// with no extra code.
function launcherScript({ vendor, slot, dir, platform = process.platform }) {
  const envVar = envVarFor(vendor);
  if (platform === "win32") {
    // `setlocal` keeps the env var from leaking into a caller that used `call`,
    // and `call` is required because the vendor CLI is itself a .cmd shim —
    // invoking one batch file from another without `call` transfers control and
    // never returns, which loses the exit code.
    return [
      "@echo off",
      `rem ${LAUNCHER_MARKER} (slot: ${slot}) — regenerate with: sdtk login ${slot}`,
      "setlocal",
      `set "${envVar}=${dir}"`,
      `call ${vendor} %*`,
      "exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n");
  }
  return [
    "#!/bin/sh",
    `# ${LAUNCHER_MARKER} (slot: ${slot}) — regenerate with: sdtk login ${slot}`,
    `export ${envVar}="${dir}"`,
    `exec ${vendor} "$@"`,
    "",
  ].join("\n");
}

function launcherFileName(slot, platform = process.platform) {
  return platform === "win32" ? `${slot}.cmd` : slot;
}

// Pick where launchers go. Prefer a directory that is ALREADY on PATH so the
// new command works immediately; fall back to ~/.local/bin plus an explicit
// hint. Never silently installs somewhere the user cannot see: the chosen dir
// is always reported back to the caller.
function resolveBinDir({
  env = process.env,
  homedir = os.homedir(),
  fsImpl = fs,
  platform = process.platform,
  override,
} = {}) {
  if (override) return { dir: path.resolve(override), onPath: isOnPath(path.resolve(override), env, platform), chosen: "override" };
  const candidates = [path.join(homedir, ".local", "bin"), "/usr/local/bin", path.join(homedir, "bin")];
  for (const c of candidates) {
    if (isOnPath(c, env, platform) && isWritableDir(c, fsImpl)) {
      return { dir: c, onPath: true, chosen: "path" };
    }
  }
  return { dir: candidates[0], onPath: false, chosen: "fallback" };
}

function isOnPath(dir, env = process.env, platform = process.platform) {
  const sep = platform === "win32" ? ";" : ":";
  const entries = String(env.PATH || "").split(sep).filter(Boolean);
  const norm = (p) => path.resolve(p).replace(/[\\/]+$/, "");
  return entries.some((e) => norm(e) === norm(dir));
}

// Writable, or creatable because its parent is writable.
function isWritableDir(dir, fsImpl = fs) {
  try {
    fsImpl.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (_) {
    /* fall through — may not exist yet */
  }
  if (existsDir(dir, fsImpl)) return false; // exists but not writable
  try {
    fsImpl.accessSync(path.dirname(dir), fs.constants.W_OK);
    return true;
  } catch (_) {
    return false;
  }
}

// --- shell-alias shadowing --------------------------------------------------

// Bash resolves aliases BEFORE PATH, so a pre-existing `alias claude2=...`
// silently wins over a launcher of the same name and the slot looks broken.
// Report the exact file so the user can delete one line.
const SHELL_FILES = Object.freeze([".bashrc", ".bash_aliases", ".zshrc", ".profile"]);

function findShadowingAliases(command, { homedir = os.homedir(), fsImpl = fs } = {}) {
  const hits = [];
  const re = new RegExp(`^\\s*alias\\s+${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
  for (const f of SHELL_FILES) {
    const file = path.join(homedir, f);
    let text;
    try {
      text = fsImpl.readFileSync(file, "utf-8");
    } catch (_) {
      continue;
    }
    text.split(/\r?\n/).forEach((line, i) => {
      if (re.test(line)) hits.push({ file, line: i + 1, text: line.trim() });
    });
  }
  return hits;
}

// --- headless detection (codex device-code login) ---------------------------

// Codex ships two login flows. The default one opens a browser and waits for it
// to call back into /auth/callback ON THIS MACHINE; `--device-auth` instead
// prints a link plus a one-time code you enter from any other device. In a
// container or over SSH there is no browser and the callback is unreachable, so
// the default flow simply fails — which is exactly where users get stuck.
//
// The risk here is asymmetric: guessing "headless" when a browser exists still
// works (device-code is just a few seconds longer), while guessing "browser" on
// a headless box breaks the login outright. So we lean to device-code, always
// print the decision, and leave --no-device-auth as the override.
//
// Claude has no equivalent flag — its login needs no mode choice — so this is
// consulted for codex only.
function detectHeadless({ env = process.env, fsImpl = fs, platform = process.platform } = {}) {
  const reasons = [];
  try {
    if (fsImpl.existsSync("/.dockerenv")) reasons.push("/.dockerenv present (container)");
  } catch (_) {
    /* probing must never throw */
  }
  if (env.SSH_CONNECTION || env.SSH_TTY) reasons.push("SSH session");
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) {
    reasons.push("no DISPLAY/WAYLAND_DISPLAY");
  }
  return { headless: reasons.length > 0, reasons };
}

// Resolve the effective device-auth choice for a vendor. Explicit flags always
// win over detection; returns the reason so the caller can print it.
function resolveDeviceAuth(vendor, { deviceAuth, noDeviceAuth, env, fsImpl, platform } = {}) {
  if (vendor !== "codex") return { use: false, source: "n/a" };
  if (noDeviceAuth) return { use: false, source: "explicit --no-device-auth" };
  if (deviceAuth) return { use: true, source: "explicit --device-auth" };
  const det = detectHeadless({ env, fsImpl, platform });
  if (det.headless) return { use: true, source: `auto (${det.reasons.join(", ")})` };
  return { use: false, source: "auto (browser environment)" };
}

// --- first-run onboarding ---------------------------------------------------

// BK-391 — why `sdtk login` must mark onboarding complete.
//
// Claude Code keeps TWO independent pieces of state per config dir:
//   .credentials.json  -> what `claude auth status` reads
//   .claude.json       -> config, including `hasCompletedOnboarding`
//
// `claude auth login` writes the credentials (and `oauthAccount`) but NEVER
// sets `hasCompletedOnboarding`. The first interactive run therefore hits
//     if (!config.hasCompletedOnboarding) { ...run Onboarding... }
// and the onboarding flow contains its OWN login step which does not consult
// the credentials that already exist. The user authenticates a second time,
// against the same client_id, redirect_uri and scopes as the first.
//
// Reproduced with SDTK removed entirely (2026-07-29, Claude Code v2.1.220):
//     CLAUDE_CONFIG_DIR=/tmp/probe claude auth login   -> "Login successful."
//     CLAUDE_CONFIG_DIR=/tmp/probe claude auth status  -> loggedIn: true
//     CLAUDE_CONFIG_DIR=/tmp/probe claude              -> asks to log in again
// So this is vendor behavior, not an SDTK defect — but SDTK is what puts users
// on that path, by authenticating BEFORE the first interactive run. Normally a
// user just runs `claude`, and the login inside the wizard IS their only login.
//
// What marking the flag skips, verified against the shipped binary: the theme
// picker (changeable later with /theme) and the redundant login step. It does
// NOT skip anything security-relevant — the trust dialog and the external
// CLAUDE.md imports dialog are gated separately and still run, and the
// onboarding flow contains no terms/privacy/consent step.
//
// Boundary: this reads and writes ONLY `.claude.json`, and only the single
// `hasCompletedOnboarding` key. It never reads, copies or writes
// `.credentials.json` — the credential-free invariant is unchanged.

const CLAUDE_CONFIG_FILE = ".claude.json";

function onboardingFile(dir) {
  return path.join(dir, CLAUDE_CONFIG_FILE);
}

// { exists, completed, malformed } — never throws.
function onboardingState(dir, { fsImpl = fs } = {}) {
  const file = onboardingFile(dir);
  let raw;
  try {
    raw = fsImpl.readFileSync(file, "utf-8");
  } catch (_) {
    return { file, exists: false, completed: false, malformed: false };
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { file, exists: true, completed: false, malformed: true };
    }
    return { file, exists: true, completed: data.hasCompletedOnboarding === true, malformed: false };
  } catch (_) {
    // Someone else's file that we cannot parse: report it, never rewrite it.
    return { file, exists: true, completed: false, malformed: true };
  }
}

// Set `hasCompletedOnboarding: true`, preserving every other key byte-for-byte
// in value. Refuses on malformed JSON rather than replacing a file it cannot
// understand — clobbering a user's config to save them one prompt is a bad trade.
function markOnboardingComplete(dir, { fsImpl = fs } = {}) {
  const state = onboardingState(dir, { fsImpl });
  if (state.malformed) {
    return { status: "refused", reason: "existing .claude.json is not valid JSON", file: state.file };
  }
  if (state.completed) return { status: "already", file: state.file };

  let data = {};
  if (state.exists) {
    try {
      data = JSON.parse(fsImpl.readFileSync(state.file, "utf-8"));
    } catch (_) {
      return { status: "refused", reason: "could not re-read .claude.json", file: state.file };
    }
  }
  data.hasCompletedOnboarding = true;
  try {
    fsImpl.mkdirSync(path.dirname(state.file), { recursive: true });
    fsImpl.writeFileSync(state.file, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  } catch (err) {
    return { status: "failed", reason: err && err.message, file: state.file };
  }
  return { status: "set", file: state.file, created: !state.exists };
}

// --- registry ---------------------------------------------------------------

function registryPath(homedir = os.homedir()) {
  return path.join(homedir, REGISTRY_REL);
}

function readRegistry({ homedir = os.homedir(), fsImpl = fs } = {}) {
  try {
    const d = JSON.parse(fsImpl.readFileSync(registryPath(homedir), "utf-8"));
    if (d && d.slots && typeof d.slots === "object") return { schema: REGISTRY_SCHEMA, slots: d.slots };
  } catch (_) {
    /* missing or malformed → start clean; the registry is a convenience index,
       never the source of truth (the dirs and launchers are). */
  }
  return { schema: REGISTRY_SCHEMA, slots: {} };
}

function writeRegistry(reg, { homedir = os.homedir(), fsImpl = fs } = {}) {
  const file = registryPath(homedir);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, `${JSON.stringify({ schema: REGISTRY_SCHEMA, slots: reg.slots }, null, 2)}\n`, "utf-8");
  return file;
}

// --- plan -------------------------------------------------------------------

// Pure: everything `sdtk login <slot>` is about to do, with no side effects.
// The command layer prints this and then executes it.
function planLogin(slotName, opts = {}) {
  const parsed = parseSlot(slotName);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { vendor, suffix, slot } = parsed;
  const homedir = opts.homedir || os.homedir();
  const fsImpl = opts.fsImpl || fs;
  const platform = opts.platform || process.platform;

  const { dir, adopted } = resolveSlotDir(vendor, suffix, { homedir, fsImpl, dirOverride: opts.dir });
  const command = opts.command || slot;
  const bin = resolveBinDir({ env: opts.env, homedir, fsImpl, platform, override: opts.binDir });
  const launcherPath = path.join(bin.dir, launcherFileName(command, platform));
  const device = resolveDeviceAuth(vendor, {
    deviceAuth: opts.deviceAuth,
    noDeviceAuth: opts.noDeviceAuth,
    env: opts.env,
    fsImpl,
    platform,
  });

  return {
    ok: true,
    slot,
    vendor,
    dir,
    adopted,
    command,
    envVar: envVarFor(vendor),
    binDir: bin.dir,
    binOnPath: bin.onPath,
    launcherPath,
    launcherBody: launcherScript({ vendor, slot, dir, platform }),
    shadowingAliases: findShadowingAliases(command, { homedir, fsImpl }),
    deviceAuth: device,
    loginArgv: vendor === "claude" ? ["auth", "login"] : ["login", ...(device.use ? ["--device-auth"] : [])],
    logoutArgv: vendor === "claude" ? ["auth", "logout"] : ["logout"],
  };
}

module.exports = {
  VENDORS,
  REGISTRY_SCHEMA,
  LAUNCHER_MARKER,
  parseSlot,
  candidateDirs,
  resolveSlotDir,
  slotNameForDir,
  envVarFor,
  launcherScript,
  launcherFileName,
  resolveBinDir,
  isOnPath,
  detectHeadless,
  resolveDeviceAuth,
  findShadowingAliases,
  registryPath,
  readRegistry,
  writeRegistry,
  planLogin,
  onboardingState,
  markOnboardingComplete,
};
