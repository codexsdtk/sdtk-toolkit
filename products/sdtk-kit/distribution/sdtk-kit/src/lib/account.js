"use strict";

// BK-373 — `sdtk account`: credential-free multi-account visibility and
// shared-session-store setup for Claude Code / Codex CLI.
//
// Design invariant (inherited from BK-371): SDTK NEVER reads, copies, or
// stores a credential file. Account identity comes from shelling out to the
// vendor CLI (`claude auth status` / `codex login status`) — the vendor
// reports who is logged in; SDTK parses the CLI's stdout, never .credentials.json
// or auth.json. The link operation only ever touches `projects/` (Claude) /
// `sessions/` (Codex) trees, never anything else at the account root.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { discoverAccountDirs, aggregateUsage } = require("./usage");

// ---------------------------------------------------------------------------
// 1. Active default — which dir a bare `claude`/`codex` uses right now
// ---------------------------------------------------------------------------

function activeDir(vendor, env = process.env, homedir = os.homedir()) {
  const override = vendor === "claude" ? env.CLAUDE_CONFIG_DIR : env.CODEX_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(homedir, `.${vendor}`);
}

// ---------------------------------------------------------------------------
// 2. Link state — is an account's session store shared with another account?
// ---------------------------------------------------------------------------

// Returns { store, shared } for one account dir. `store` is the realpath of
// the projects/sessions dir (the physical session store); `shared` is true
// when that dir is a symlink (i.e. it points at another account's store).
function storeState(accountDir, vendor, fsImpl = fs) {
  const topName = vendor === "claude" ? "projects" : "sessions";
  const p = path.join(accountDir, topName);
  let linkStat;
  try {
    linkStat = fsImpl.lstatSync(p);
  } catch (_) {
    return { store: null, shared: false, exists: false };
  }
  const shared = linkStat.isSymbolicLink();
  let store;
  try {
    store = fsImpl.realpathSync(p);
  } catch (_) {
    store = null; // dangling symlink
  }
  return { store, shared, exists: true };
}

// ---------------------------------------------------------------------------
// 3. Identity — credential-free, via the vendor CLI (injectable for tests)
// ---------------------------------------------------------------------------

// Default runner shells out to the vendor CLI with the account dir wired into
// the env, and a hard timeout so a hung CLI never hangs `sdtk account`.
// Returns a short human string or null. NEVER touches credential files.
function defaultIdentityRunner(vendor, accountDir) {
  const env = { ...process.env };
  if (vendor === "claude") env.CLAUDE_CONFIG_DIR = accountDir;
  else env.CODEX_HOME = accountDir;
  const cmd = vendor === "claude" ? "claude" : "codex";
  const args = vendor === "claude" ? ["auth", "status"] : ["login", "status"];
  const r = spawnSync(cmd, args, { env, timeout: 8000, encoding: "utf8" });
  if (r.error || r.status !== 0) {
    // Non-zero exit still carries useful text for codex ("Logged in ...");
    // fall through to parse whatever streams produced. A spawn error (CLI
    // missing) has no streams → unknown.
    if (r.error) return null;
  }
  try {
    if (vendor === "claude") {
      const d = JSON.parse((r.stdout || "").trim());
      if (!d.loggedIn) return "not logged in";
      return [d.email, d.subscriptionType].filter(Boolean).join(" · ") || "logged in";
    }
    // `codex login status` prints to STDERR, not stdout (verified on
    // codex-cli 0.144.1) — take the first non-empty line from either stream.
    const text = `${r.stdout || ""}\n${r.stderr || ""}`;
    const line = text.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("WARNING"));
    return line || "unknown";
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. status — assemble the account report (read-only)
// ---------------------------------------------------------------------------

function buildStatus({
  homedir = os.homedir(),
  env = process.env,
  fsImpl = fs,
  identityRunner = defaultIdentityRunner,
  withIdentity = true,
  withHeadroom = true,
  now = Date.now(),
  extraDirs = [],
} = {}) {
  const { accounts: discoveredAccounts, skippedSiblings } = discoverAccountDirs({ homedir, fsImpl });

  // BK-392 — a slot created by `sdtk login` has a config dir but no `projects/`
  // tree until its first session, and discovery lists an account only once that
  // tree exists. So a user who ran `sdtk login` three times saw ONE account in
  // `status`. BK-389 taught `account link` to read the login registry for
  // exactly this reason but left `status` behind; this closes that asymmetry.
  const accounts = discoveredAccounts.slice();
  for (const extra of extraDirs) {
    if (!extra || !extra.vendor || !extra.dir) continue;
    const dir = path.resolve(extra.dir);
    if (accounts.some((a) => path.resolve(a.dir) === dir)) continue;
    let isDir = false;
    try {
      isDir = fsImpl.statSync(dir).isDirectory();
    } catch (_) {
      isDir = false;
    }
    if (!isDir) continue;
    accounts.push({ vendor: extra.vendor, dir, label: path.basename(dir) });
  }

  // Headroom: reuse the BK-371 aggregator (last-5h totals + Codex rate limit).
  let usageByDir = new Map();
  if (withHeadroom) {
    try {
      const usage = aggregateUsage({ now, homedir, fsImpl });
      usageByDir = new Map(usage.accounts.map((a) => [a.dir, a]));
    } catch (_) {
      usageByDir = new Map();
    }
  }

  const active = {
    claude: activeDir("claude", env, homedir),
    codex: activeDir("codex", env, homedir),
  };

  const rows = accounts.map((acct) => {
    const st = storeState(acct.dir, acct.vendor, fsImpl);
    const isActive = path.resolve(acct.dir) === active[acct.vendor];
    const identity = withIdentity ? identityRunner(acct.vendor, acct.dir) : undefined;
    const u = usageByDir.get(acct.dir);
    let headroom = null;
    if (u) {
      if (acct.vendor === "claude") {
        const out5h = u.models.reduce((s, m) => s + (m.last5h ? m.last5h.output : 0), 0);
        headroom = { kind: "tokens", last5hOutput: out5h };
      } else if (u.rateLimits) {
        headroom = {
          kind: "rate",
          usedPercent: u.rateLimits.used_percent,
          resetsAt: u.rateLimits.resets_at,
          asOf: u.rateLimits.asOf,
        };
      }
    }
    return {
      vendor: acct.vendor,
      dir: acct.dir,
      label: acct.label,
      active: isActive,
      store: st.store,
      shared: st.shared,
      identity,
      headroom,
      // Newest limit actually hit, per kind. Empty when none were recorded.
      limits: (u && u.limitEvents) || [],
    };
  });

  // Group accounts by physical store so the caller can show which accounts
  // share history. An account "shares" its store when another account resolves
  // to the same physical store — regardless of which one is the symlink.
  const storeGroups = {};
  for (const r of rows) {
    const key = r.store || `(none):${r.dir}`;
    (storeGroups[key] = storeGroups[key] || []).push(r.label);
  }
  for (const r of rows) {
    const key = r.store || `(none):${r.dir}`;
    r.sharedWith = (storeGroups[key] || []).filter((l) => l !== r.label);
    // A Claude token figure is per-account only while the store is NOT shared.
    // Once shared, both accounts' sessions live in one physical store, so the
    // number is a combined total for neither — report the honest state (Codex
    // rate-limit headroom stays valid; Codex stores are never shared in R1).
    if (r.vendor === "claude" && r.sharedWith.length && r.headroom && r.headroom.kind === "tokens") {
      r.headroom = { kind: "shared", note: "usage not per-account (shared store)" };
    }
  }

  return { schema: "sdtk.account.v1", active, accounts: rows, skippedSiblings, storeGroups };
}

// ---------------------------------------------------------------------------
// 5. link / undo — productize the shared session store (mutating; safe-first)
// ---------------------------------------------------------------------------

function topName(vendor) {
  return vendor === "claude" ? "projects" : "sessions";
}

// Merge every *.jsonl under `srcStore` into `dstStore`, preserving the
// per-project subdir layout. UUID filenames make collisions mean "same
// session already present" — on collision we SKIP and report, never
// overwrite (data is never destroyed).
function mergeStore(srcStore, dstStore, fsImpl) {
  const merged = [];
  const collisions = [];
  const EXCL = (fs.constants && fs.constants.COPYFILE_EXCL) || 1; // atomic no-overwrite
  let dstRoot;
  try {
    dstRoot = fsImpl.realpathSync(dstStore);
  } catch (_) {
    return { merged, collisions };
  }
  // A destination path is safe only if its nearest existing ancestor resolves
  // INSIDE dstRoot — this rejects a symlinked subdir in the destination that
  // would let a copy escape the store (mirrors the BK-371 F2 containment fix).
  function containedParent(dstPath) {
    let dir = path.dirname(dstPath);
    while (true) {
      try {
        const real = fsImpl.realpathSync(dir);
        const relToRoot = path.relative(dstRoot, real);
        return relToRoot === "" || (!relToRoot.startsWith("..") && !path.isAbsolute(relToRoot));
      } catch (_) {
        dir = path.dirname(dir);
        if (dir === path.dirname(dir)) return false; // hit fs root without resolving
      }
    }
  }
  (function walk(rel) {
    const srcDir = path.join(srcStore, rel);
    let entries;
    try {
      entries = fsImpl.readdirSync(srcDir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue; // never follow a link out of the source store
      const childRel = path.join(rel, e.name);
      if (e.isDirectory()) {
        walk(childRel);
        continue;
      }
      if (!e.isFile() || !e.name.endsWith(".jsonl")) continue;
      const dstPath = path.join(dstStore, childRel);
      if (!containedParent(dstPath)) {
        collisions.push(childRel); // destination escapes the store — refuse, report
        continue;
      }
      try {
        fsImpl.mkdirSync(path.dirname(dstPath), { recursive: true });
        // COPYFILE_EXCL makes existence-check + copy atomic: if the dest
        // appears between check and write (a live vendor process), the copy
        // fails EEXIST and we treat it as a collision — never an overwrite.
        fsImpl.copyFileSync(path.join(srcStore, childRel), dstPath, EXCL);
        merged.push(childRel);
      } catch (err) {
        if (err && err.code === "EEXIST") collisions.push(childRel);
        else collisions.push(childRel); // any copy failure: leave source intact, report
      }
    }
  })("");
  return { merged, collisions };
}

// Which reparse point to create, most-preferred first.
//
// On Windows a *symlink* to a directory needs SeCreateSymbolicLinkPrivilege —
// i.e. an elevated shell or Developer Mode — so `symlinkSync(..., "dir")`
// fails EPERM for an ordinary user and the whole feature is unreachable there.
// A *junction* (`mklink /J`) is a mount-point reparse point that needs no
// privilege at all, and Node reports it through lstat as a symlink just like a
// real one, so every check in this file (storeState, already-linked, unlink)
// keeps working unchanged. Junctions only accept a local absolute target,
// which `realpathSync` already gives us. "dir" stays as the fallback for the
// exotic case where a junction cannot be created (e.g. a non-NTFS volume).
function linkTypesFor(platform) {
  return platform === "win32" ? ["junction", "dir"] : ["dir"];
}

// Link `secondary`'s session store into `primary`'s, so both accounts see the
// same sessions (cross-account --resume). Safe-first: the secondary's original
// store is preserved as `<top>.bak.<ts>` for a clean undo; nothing is deleted.
function linkAccount({ primaryDir, secondaryDir, vendor, fsImpl = fs, now = Date.now(), platform = process.platform }) {
  const top = topName(vendor);
  const primaryStore = path.join(primaryDir, top);
  const secTop = path.join(secondaryDir, top);

  fsImpl.mkdirSync(primaryStore, { recursive: true });

  // The primary must be a real directory. If it is itself a symlink (e.g. a
  // user pointed .claude/projects at .claude-b/projects earlier), linking the
  // secondary here would create a self-referential loop (ELOOP) that strands
  // every session. Refuse rather than corrupt.
  if (fsImpl.lstatSync(primaryStore).isSymbolicLink()) {
    return { status: "primary-not-real-dir", vendor, secondaryDir, primaryStore };
  }
  const primaryReal = fsImpl.realpathSync(primaryStore);

  // Already linked to this exact store? Idempotent no-op.
  let secLstat = null;
  try {
    secLstat = fsImpl.lstatSync(secTop);
  } catch (_) {
    secLstat = null;
  }
  if (secLstat && secLstat.isSymbolicLink()) {
    let cur = null;
    try {
      cur = fsImpl.realpathSync(secTop);
    } catch (_) {
      cur = null;
    }
    if (cur === primaryReal) return { status: "already-linked", vendor, secondaryDir };
  }

  let merged = [];
  let collisions = [];
  let backup = null;
  if (secLstat && !secLstat.isSymbolicLink() && secLstat.isDirectory()) {
    const res = mergeStore(secTop, primaryStore, fsImpl);
    merged = res.merged;
    collisions = res.collisions;
    const ts = new Date(now).toISOString().replace(/[:.]/g, "-");
    backup = path.join(secondaryDir, `${top}.bak.${ts}`);
    fsImpl.renameSync(secTop, backup); // preserve originals for undo
  } else if (secLstat && secLstat.isSymbolicLink()) {
    // Symlink pointing somewhere else — drop the link (its target keeps its
    // own files) before re-pointing.
    fsImpl.rmSync(secTop, { force: true });
  }

  // If EVERY link type fails (privileges, an unsupported filesystem, …), roll
  // the backup back into place so the secondary's store is never left missing —
  // a failed link must be a no-op, not data loss.
  let linkType = null;
  let lastError = null;
  for (const type of linkTypesFor(platform)) {
    try {
      fsImpl.symlinkSync(primaryReal, secTop, type);
      linkType = type;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!linkType) {
    if (backup) {
      try {
        fsImpl.renameSync(backup, secTop);
      } catch (_) {
        /* backup path is reported below for manual recovery */
      }
    }
    return { status: "link-failed", vendor, secondaryDir, error: lastError && lastError.code, backup };
  }
  return { status: "linked", vendor, secondaryDir, primaryStore: primaryReal, merged, collisions, backup, linkType };
}

// Undo: restore the secondary to an isolated store. Honest semantics —
// sessions created WHILE linked live physically in the primary store and stay
// there; the secondary is restored from its pre-link backup if present, else
// reset to an empty store. Documented so no one expects the merged sessions to
// migrate back.
function unlinkAccount({ secondaryDir, vendor, fsImpl = fs }) {
  const top = topName(vendor);
  const secTop = path.join(secondaryDir, top);
  let st;
  try {
    st = fsImpl.lstatSync(secTop);
  } catch (_) {
    return { status: "not-present", vendor, secondaryDir };
  }
  if (!st.isSymbolicLink()) return { status: "not-linked", vendor, secondaryDir };

  // Pick the newest pre-link backup that is actually a real directory (not a
  // stray file or symlink someone dropped in with the bak prefix) — verify
  // BEFORE removing the live link so a bogus backup can't leave us with
  // nothing.
  let chosen = null;
  try {
    const names = fsImpl
      .readdirSync(secondaryDir, { withFileTypes: true })
      .filter((e) => e.name.startsWith(`${top}.bak.`))
      .map((e) => e.name)
      .sort();
    for (let i = names.length - 1; i >= 0; i--) {
      const full = path.join(secondaryDir, names[i]);
      const ls = fsImpl.lstatSync(full);
      if (ls.isDirectory() && !ls.isSymbolicLink()) {
        chosen = names[i];
        break;
      }
    }
  } catch (_) {
    chosen = null;
  }

  fsImpl.rmSync(secTop, { force: true });

  let restored = null;
  let restoreError = null;
  if (chosen) {
    try {
      fsImpl.renameSync(path.join(secondaryDir, chosen), secTop);
      restored = chosen;
    } catch (err) {
      // Surface the failure with the backup path — never report success while
      // the store sits empty and the originals wait in the backup.
      restoreError = { code: err && err.code, backup: chosen };
    }
  }
  if (!restored) fsImpl.mkdirSync(secTop, { recursive: true });
  return { status: "unlinked", vendor, secondaryDir, restored, restoreError };
}

// Plan link/undo across all discovered same-vendor accounts: the default dir
// (.claude / .codex) is the primary; dash-variants are secondaries.
// R1 links CLAUDE stores only. Codex shared session stores are an explicit
// non-goal for R1 (plan §4 #3) — Codex sessions are not resumed by id in the
// owner's workflow, and OpenAI revokes duplicated grants aggressively. So even
// though discovery finds `.codex-*` dirs, `link` never touches them.
// `extraSecondaryDirs` covers the dirs `sdtk login <slot>` creates: discovery
// only lists an account once it HAS a projects/ tree, so a slot that was just
// logged in — the exact moment you want to share its store — is invisible to
// it and `sdtk account link` would report "nothing to link". Callers pass the
// slot dirs from the login registry so a fresh slot is linkable immediately.
function planLinkTargets({ homedir = os.homedir(), fsImpl = fs, extraSecondaryDirs = [] } = {}) {
  const { accounts } = discoverAccountDirs({ homedir, fsImpl });
  const byVendor = {};
  for (const a of accounts) {
    if (a.vendor !== "claude") continue; // Codex link is out of R1 scope
    (byVendor[a.vendor] = byVendor[a.vendor] || []).push(a);
  }
  for (const extra of extraSecondaryDirs) {
    if (!extra || extra.vendor !== "claude") continue;
    const dir = path.resolve(extra.dir);
    if (!existsDirSync(dir, fsImpl)) continue;
    const list = (byVendor.claude = byVendor.claude || []);
    if (list.some((a) => a.dir === dir)) continue;
    list.push({ vendor: "claude", dir, label: path.basename(dir) });
  }
  const plan = [];
  for (const vendor of Object.keys(byVendor)) {
    const list = byVendor[vendor];
    const primary = list.find((a) => a.label === `.${vendor}`);
    if (!primary) continue; // no canonical default dir — nothing to anchor on
    for (const sec of list) {
      if (sec.dir === primary.dir) continue;
      plan.push({ vendor, primaryDir: primary.dir, secondaryDir: sec.dir, secondaryLabel: sec.label });
    }
  }
  return plan;
}

function existsDirSync(p, fsImpl = fs) {
  try {
    return fsImpl.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

module.exports = {
  activeDir,
  storeState,
  defaultIdentityRunner,
  buildStatus,
  mergeStore,
  linkAccount,
  unlinkAccount,
  planLinkTargets,
  linkTypesFor,
};
