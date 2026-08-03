"use strict";

// `sdtk login <slot>` / `sdtk logout <slot>` — BK-385.
//
// Thin shell over src/lib/account-slots.js: resolve the slot, create the config
// dir, install a launcher named after the slot, then hand control to the
// VENDOR's own login so the web/device flow runs exactly as it normally would.
// SDTK never sees a credential.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSyncPortable } = require("../lib/spawn-portable");
const { linkAccount } = require("../lib/account");
const {
  planLogin,
  readRegistry,
  writeRegistry,
  registryPath,
  launcherFileName,
  onboardingState,
  markOnboardingComplete,
} = require("../lib/account-slots");

const HELP_TEXT = `sdtk login <slot> [options]      Log in an account slot and install its command
sdtk logout <slot>               Log the slot out (vendor CLI does the work)

A slot is a named account: claude1, claude2, codex1, claude-work. The vendor is
read from the prefix. Each slot gets its own config dir and a command of the
same name, so:

  sdtk login claude2      # opens the normal login flow for that account
  claude2                 # start a session on it
  claude2 --resume <id>   # reopen a session (all arguments are forwarded)

Numbered slots adopt an existing directory instead of creating a duplicate:
claude1 -> ~/.claude (the default account), claude2 -> ~/.claude-2 or a legacy
~/.claude-b. An existing dir is reused as-is; the vendor CLI decides whether a
login is actually needed.

Options:
  --dir <path>       Use this config dir instead of the resolved default.
  --command <name>   Name the launcher something other than the slot.
  --bin-dir <path>   Install the launcher here instead of the detected dir.
  --device-auth      (codex) Force device-code login.
  --no-device-auth   (codex) Force the browser flow even if headless is detected.
  --no-launcher      Do the login only; do not install or refresh a command.
  --launcher-only    Install/refresh the command only; skip the vendor login.
                     Use it for an account that is already signed in — adopting
                     one should not mean re-authenticating it.
  --share-sessions   (claude) Point this slot's session store at the default
                     account's, so either slot can --resume any conversation.
                     Same operation as \`sdtk account link\`, scoped to one slot.
  --keep-onboarding  (claude) Do NOT mark first-run setup complete after login.
                     The setup wizard then runs once on your next session and
                     will ask you to sign in a second time.
  --print            Show the plan and exit without changing anything.

Session transcripts live INSIDE the config dir (<dir>/projects/<cwd>/<id>.jsonl),
so by default each slot sees only its own history and \`claude2 --resume <id>\`
cannot open a session started under claude1. --share-sessions makes both slots
read one physical store, which is what lets you hand a live conversation to a
second account when the first hits its limit. Never --resume the SAME session id
on two accounts at once: two writers, one transcript.

Codex has two login flows: the default opens a browser and waits for it to call
back into /auth/callback on THIS machine, while device-code prints a link plus a
one-time code you enter from any other device. In a container or over SSH the
browser round-trip cannot complete, so device-code is selected automatically
(reported every time; override with --no-device-auth). Claude needs no such
choice and has no equivalent flag.

One login, not two. Claude Code stores credentials and first-run state in two
independent places: \`claude auth login\` writes the credentials but never sets
\`hasCompletedOnboarding\`, so the next interactive session runs its setup wizard —
and that wizard's own login step ignores the credentials you just obtained and
asks again (same client_id, same scopes). Verified with SDTK removed entirely.
After a successful login this command therefore marks first-run setup complete,
which skips the theme picker (use /theme later) and that redundant login. The
trust prompt and the external-imports prompt are gated separately and still run.
Opt out with --keep-onboarding.

SDTK is credential-free: it creates the directory and the launcher, then runs
the vendor's own \`claude auth login\` / \`codex login\`. It never reads, copies,
or stores authentication files — the onboarding flag lives in \`.claude.json\`
(configuration), never in \`.credentials.json\`.

See also: sdtk account status | sdtk account link | sdtk account guide`;

function parseArgs(args) {
  const opts = { slot: null, help: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dir") opts.dir = args[++i];
    else if (a === "--command") opts.command = args[++i];
    else if (a === "--bin-dir") opts.binDir = args[++i];
    else if (a === "--device-auth") opts.deviceAuth = true;
    else if (a === "--no-device-auth") opts.noDeviceAuth = true;
    else if (a === "--no-launcher") opts.noLauncher = true;
    else if (a === "--launcher-only") opts.launcherOnly = true;
    else if (a === "--share-sessions") opts.shareSessions = true;
    else if (a === "--keep-onboarding") opts.keepOnboarding = true;
    else if (a === "--print") opts.print = true;
    else if (!a.startsWith("-") && !opts.slot) opts.slot = a;
  }
  return opts;
}

function log(line = "") {
  console.log(line);
}

function reportPlan(plan) {
  log(`sdtk login — slot ${plan.slot} (${plan.vendor})`);
  // Deliberately does NOT claim the dir is authenticated: knowing that would
  // mean inspecting credential files, which this toolkit never does. The vendor
  // CLI decides whether the login step is a no-op.
  log(`  config dir : ${plan.dir}${plan.adopted ? "  (existing — reused)" : "  (new)"}`);
  log(`  ${plan.envVar.padEnd(11)}: ${plan.dir}`);
  log(`  command    : ${plan.command} -> ${plan.launcherPath}`);
  // Never silently change the login mode: say which flow will run and why.
  if (plan.vendor === "codex") {
    log(`  login flow : ${plan.deviceAuth.use ? "device code" : "browser"}  [${plan.deviceAuth.source}]`);
    if (plan.deviceAuth.use && plan.deviceAuth.source.startsWith("auto")) {
      log("               (a browser round-trip cannot complete here; override with --no-device-auth)");
    }
  }
}

// A launcher only works if nothing shadows it and its dir is on PATH. Both
// failures are silent from the user's point of view, so both are reported loudly.
function reportReachability(plan) {
  if (!plan.binOnPath) {
    log("");
    log(`  ! ${plan.binDir} is not on your PATH, so \`${plan.command}\` will not resolve yet.`);
    log(`    Add it, then reopen the shell:`);
    log(`      echo 'export PATH="${plan.binDir}:$PATH"' >> ~/.bashrc && . ~/.bashrc`);
  }
  if (plan.shadowingAliases.length) {
    log("");
    log(`  ! A shell alias named '${plan.command}' already exists and WINS over the`);
    log("    launcher (bash resolves aliases before PATH). Remove these line(s):");
    for (const h of plan.shadowingAliases) {
      log(`      ${h.file}:${h.line}   ${h.text}`);
    }
  }
}

function installLauncher(plan, fsImpl = fs) {
  fsImpl.mkdirSync(plan.binDir, { recursive: true });
  fsImpl.writeFileSync(plan.launcherPath, plan.launcherBody, "utf-8");
  if (process.platform !== "win32") {
    try {
      fsImpl.chmodSync(plan.launcherPath, 0o755);
    } catch (_) {
      /* a non-executable launcher is reported by the caller's own check */
    }
  }
}

function saveSlot(plan, homedir) {
  const reg = readRegistry({ homedir });
  reg.slots[plan.slot] = {
    vendor: plan.vendor,
    dir: plan.dir,
    command: plan.command,
    launcher: plan.launcherPath,
    updatedAt: new Date().toISOString(),
  };
  return writeRegistry(reg, { homedir });
}

function runVendor(vendor, argv, dir, envVar) {
  const env = Object.assign({}, process.env, { [envVar]: dir });
  // spawnSyncPortable, not spawnSync: on Windows the vendor CLIs are npm .cmd
  // shims, which a bare-name spawn cannot resolve (CreateProcess only appends
  // .exe) and which Node refuses to run with shell:false at all.
  const res = spawnSyncPortable([vendor, ...argv], { stdio: "inherit", env });
  if (res.error && res.error.code === "ENOENT") {
    console.error(
      `sdtk login: could not find the '${vendor}' CLI on PATH` +
        (process.platform === "win32" ? " (looked for .exe/.cmd/.bat via PATHEXT)" : "") +
        `. Install it, then re-run — or check \`${vendor} --version\` works in this shell.`
    );
    return 4;
  }
  return typeof res.status === "number" ? res.status : 1;
}

// Point this slot's session store at the default account's, so a conversation
// started on one slot can be resumed on the other. Reuses the BK-373 link
// primitive verbatim — same backup, same merge-never-overwrite semantics — and
// only ever touches the projects/ tree, never a credential file.
function shareSessions(plan, homedir) {
  if (plan.vendor !== "claude") {
    log("");
    log(`  ! --share-sessions covers Claude only; ${plan.vendor} session stores are not linked.`);
    return;
  }
  const primaryDir = path.join(homedir, ".claude");
  if (path.resolve(plan.dir) === path.resolve(primaryDir)) {
    log("");
    log(`  --share-sessions: ${plan.slot} IS the default account (${primaryDir}); it already owns`);
    log(`    the shared store. Run it on the OTHER slot instead, e.g. sdtk login claude2 --share-sessions.`);
    return;
  }
  const r = linkAccount({ primaryDir, secondaryDir: plan.dir, vendor: "claude" });
  log("");
  if (r.status === "linked") {
    log(`  Session store shared with ${primaryDir} (${r.merged.length} session(s) merged` +
      `${r.collisions.length ? `, ${r.collisions.length} skipped (already present)` : ""}).`);
    if (r.backup) log(`    Previous store kept at ${r.backup} — undo with: sdtk account link --undo`);
  } else if (r.status === "already-linked") {
    log(`  Session store already shared with ${primaryDir} (no change).`);
  } else if (r.status === "link-failed") {
    log(`  ! Sharing FAILED (${r.error || "error"}); the store was left intact.`);
    if (r.backup) log(`    Your sessions are in ${r.backup}.`);
    return;
  } else if (r.status === "primary-not-real-dir") {
    log(`  ! ${primaryDir}/projects is itself a link; fix that first (sharing would loop).`);
    return;
  } else {
    log(`  Session store: ${r.status}`);
    return;
  }
  log(`    Safety: never --resume the SAME session id on two accounts at once.`);
}


// After a successful vendor login, tell Claude Code that first-run setup is
// done — otherwise the very next `claudeN` runs its onboarding flow, whose own
// login step ignores the credentials we just obtained and asks again. See the
// long note in lib/account-slots.js for the reproduction with SDTK removed.
//
// Only the theme picker and that redundant login step are skipped. The trust
// dialog and the external-imports dialog are gated separately and still run.
function settleOnboarding(plan, opts) {
  if (plan.vendor !== "claude") return; // codex has no equivalent coupling
  if (opts.keepOnboarding) {
    log("");
    log("  (--keep-onboarding: first-run setup left untouched; the wizard will run once");
    log(`   on the next \`${plan.command}\` and will ask you to sign in a second time.)`);
    return;
  }
  const before = onboardingState(plan.dir);
  if (before.completed) return; // nothing to do, say nothing

  const res = markOnboardingComplete(plan.dir);
  log("");
  if (res.status === "set") {
    log(`  First-run setup marked complete for ${plan.dir}.`);
    log(`  Without this, \`${plan.command}\` would run the setup wizard and ask you to sign`);
    log("  in a SECOND time — the wizard's login step does not check existing credentials.");
    log("  Skipped: the theme picker (change it any time with /theme). The trust prompt and");
    log("  the external-imports prompt are separate and still appear.");
  } else if (res.status === "refused" || res.status === "failed") {
    log(`  ! Could not mark first-run setup complete (${res.reason}).`);
    log(`    ${plan.command} will run the setup wizard once and may ask you to sign in again.`);
    log("    That is the vendor's flow, not a lost login — complete it once and it stops.");
  }
}

function cmdLogin(args, deps = {}) {
  const opts = parseArgs(args);
  if (opts.help || !opts.slot) {
    log(HELP_TEXT);
    return opts.slot || opts.help ? 0 : 2;
  }
  const homedir = deps.homedir || os.homedir();
  const plan = planLogin(opts.slot, {
    homedir,
    env: process.env,
    dir: opts.dir,
    command: opts.command,
    binDir: opts.binDir,
    deviceAuth: opts.deviceAuth,
    noDeviceAuth: opts.noDeviceAuth,
  });
  if (!plan.ok) {
    console.error(`sdtk login: ${plan.error}`);
    return 2;
  }

  reportPlan(plan);
  if (opts.print) {
    reportReachability(plan);
    log("");
    log(`  would run  : ${plan.envVar}=${plan.dir} ${plan.vendor} ${plan.loginArgv.join(" ")}`);
    if (opts.shareSessions) {
      log(`  would share: ${path.join(plan.dir, "projects")} -> ${path.join(homedir, ".claude", "projects")}`);
    }
    log("  (--print: nothing was changed)");
    return 0;
  }

  try {
    fs.mkdirSync(plan.dir, { recursive: true });
    if (!opts.noLauncher) installLauncher(plan);
    saveSlot(plan, homedir);
  } catch (err) {
    console.error(`sdtk login: setup failed: ${err.message}`);
    return 1;
  }
  reportReachability(plan);

  if (opts.launcherOnly) {
    // The adoption path: the dir is already signed in, so handing over to the
    // vendor login would re-authenticate an account for no reason.
    if (opts.shareSessions) shareSessions(plan, homedir);
    log("");
    log(`Launcher ready (--launcher-only: no login was attempted).`);
    log(`Start a session with:  ${plan.command}`);
    log(`Check the account with: ${plan.command} ${plan.vendor === "claude" ? "auth status" : "login status"}`);
    // This path used to return before the hint below, so the one command people
    // run when adopting a second account never mentioned the shared store.
    if (!opts.shareSessions) log(`Share session history:  sdtk login ${plan.slot} --share-sessions`);
    return 0;
  }

  log("");
  log(`  Handing over to: ${plan.vendor} ${plan.loginArgv.join(" ")}`);
  log("  (SDTK does not handle credentials — the vendor CLI owns this step.)");
  log("");
  const code = runVendor(plan.vendor, plan.loginArgv, plan.dir, plan.envVar);
  if (code === 0) {
    settleOnboarding(plan, opts);
    if (opts.shareSessions) shareSessions(plan, homedir);
    log("");
    log(`Done. Start a session with:  ${plan.command}`);
    log(`Reopen an old one with:      ${plan.command} --resume <session-id>`);
    if (!opts.shareSessions) {
      log(`Share session history:       sdtk login ${plan.slot} --share-sessions`);
    }
  }
  return code;
}

function cmdLogout(args, deps = {}) {
  const opts = parseArgs(args);
  if (opts.help || !opts.slot) {
    log(HELP_TEXT);
    return opts.slot || opts.help ? 0 : 2;
  }
  const homedir = deps.homedir || os.homedir();
  const plan = planLogin(opts.slot, { homedir, env: process.env, dir: opts.dir });
  if (!plan.ok) {
    console.error(`sdtk logout: ${plan.error}`);
    return 2;
  }
  log(`sdtk logout — slot ${plan.slot} (${plan.vendor}), dir ${plan.dir}`);
  log("  The launcher and config dir are kept; only the vendor session is ended.");
  log("");
  return runVendor(plan.vendor, plan.logoutArgv, plan.dir, plan.envVar);
}

module.exports = { cmdLogin, cmdLogout, HELP_TEXT, parseArgs, installLauncher, launcherFileName, registryPath };
