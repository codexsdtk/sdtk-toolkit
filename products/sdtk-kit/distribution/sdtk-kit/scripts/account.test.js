#!/usr/bin/env node
"use strict";

// Offline unit tests for `sdtk account` (BK-373): credential-free multi-account
// visibility + shared-session-store link/undo. Real fs against throwaway temp
// home dirs (symlinks need a real filesystem); no network, no real shell-out
// (identity is injected), no real $HOME.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  activeDir,
  storeState,
  buildStatus,
  mergeStore,
  linkAccount,
  unlinkAccount,
  planLinkTargets,
  linkTypesFor,
} = require("../src/lib/account");
const { aggregateUsage } = require("../src/lib/usage");

const { cmdAccount, renderStatus } = require("../src/commands/account");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// Build a throwaway fake $HOME with the requested account dirs. `accounts` is
// { ".claude": {jsonl:[...] , decoy:true}, ".claude-b": {...}, ... }.
function makeHome(accounts) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-acct-home-"));
  for (const [name, spec] of Object.entries(accounts)) {
    const dir = path.join(home, name);
    const vendor = name.startsWith(".codex") ? "codex" : "claude";
    const top = vendor === "claude" ? "projects" : "sessions";
    const store = path.join(dir, top, "proj");
    fs.mkdirSync(store, { recursive: true });
    for (const f of spec.jsonl || []) {
      fs.writeFileSync(path.join(store, f), '{"type":"assistant"}\n');
    }
    if (spec.decoy) {
      fs.writeFileSync(path.join(dir, ".credentials.json"), '{"note":"decoy"}');
      fs.writeFileSync(path.join(dir, "auth.json"), '{"note":"decoy"}');
    }
  }
  return home;
}

function rmHome(home) {
  fs.rmSync(home, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// activeDir
// ---------------------------------------------------------------------------

test("activeDir: default is ~/.claude, env override wins", () => {
  assert.strictEqual(activeDir("claude", {}, "/home/x"), path.join("/home/x", ".claude"));
  assert.strictEqual(activeDir("claude", { CLAUDE_CONFIG_DIR: "/home/x/.claude-b" }, "/home/x"), "/home/x/.claude-b");
  assert.strictEqual(activeDir("codex", { CODEX_HOME: "/tmp/cx" }, "/home/x"), "/tmp/cx");
});

// ---------------------------------------------------------------------------
// storeState
// ---------------------------------------------------------------------------

test("storeState: real projects dir -> not shared; symlinked -> shared", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": {} });
  try {
    // make .claude-b/projects a symlink to .claude/projects
    fs.rmSync(path.join(home, ".claude-b", "projects"), { recursive: true, force: true });
    fs.symlinkSync(path.join(home, ".claude", "projects"), path.join(home, ".claude-b", "projects"), "dir");

    const a = storeState(path.join(home, ".claude"), "claude");
    const b = storeState(path.join(home, ".claude-b"), "claude");
    assert.strictEqual(a.shared, false);
    assert.strictEqual(b.shared, true);
    assert.strictEqual(a.store, b.store, "both resolve to the same physical store");
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// buildStatus (identity injected — no shell-out)
// ---------------------------------------------------------------------------

test("buildStatus: lists accounts, marks active, groups shared stores, uses injected identity", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": {} });
  try {
    fs.rmSync(path.join(home, ".claude-b", "projects"), { recursive: true, force: true });
    fs.symlinkSync(path.join(home, ".claude", "projects"), path.join(home, ".claude-b", "projects"), "dir");

    const status = buildStatus({
      homedir: home,
      env: {},
      withHeadroom: false,
      identityRunner: (vendor, dir) => `id:${path.basename(dir)}`,
    });
    assert.strictEqual(status.schema, "sdtk.account.v1");
    const byLabel = Object.fromEntries(status.accounts.map((a) => [a.label, a]));
    assert.strictEqual(byLabel[".claude"].active, true);
    assert.strictEqual(byLabel[".claude-b"].active, false);
    assert.deepStrictEqual(byLabel[".claude"].sharedWith, [".claude-b"]);
    assert.deepStrictEqual(byLabel[".claude-b"].sharedWith, [".claude"]);
    assert.strictEqual(byLabel[".claude"].identity, "id:.claude");
  } finally {
    rmHome(home);
  }
});

test("buildStatus --no-identity path: withIdentity=false leaves identity undefined and shells out to nothing", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] } });
  try {
    let called = false;
    const status = buildStatus({
      homedir: home,
      env: {},
      withHeadroom: false,
      withIdentity: false,
      identityRunner: () => {
        called = true;
        return "SHOULD_NOT_RUN";
      },
    });
    assert.strictEqual(called, false, "identityRunner must not be called when withIdentity=false");
    assert.strictEqual(status.accounts[0].identity, undefined);
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// Credential-free proof (BK-371 trust boundary extends to BK-373)
// ---------------------------------------------------------------------------

test("buildStatus never opens a credential file (recording fs spy)", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"], decoy: true }, ".codex": { jsonl: [], decoy: true } });
  try {
    const opened = [];
    const spy = new Proxy(fs, {
      get(target, prop) {
        if (prop === "readFileSync") {
          return (p, enc) => {
            opened.push(String(p));
            return target.readFileSync(p, enc);
          };
        }
        return target[prop];
      },
    });
    buildStatus({ homedir: home, env: {}, withIdentity: false, fsImpl: spy });
    const badOpen = opened.find((p) => p.endsWith(".credentials.json") || p.endsWith("auth.json"));
    assert.strictEqual(badOpen, undefined, `credential file was opened: ${badOpen}`);
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// mergeStore
// ---------------------------------------------------------------------------

test("mergeStore: copies new files, skips (never overwrites) collisions", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-acct-merge-"));
  try {
    const src = path.join(home, "src");
    const dst = path.join(home, "dst");
    fs.mkdirSync(path.join(src, "proj"), { recursive: true });
    fs.mkdirSync(path.join(dst, "proj"), { recursive: true });
    fs.writeFileSync(path.join(src, "proj", "new.jsonl"), "SRC_NEW");
    fs.writeFileSync(path.join(src, "proj", "dup.jsonl"), "SRC_DUP");
    fs.writeFileSync(path.join(dst, "proj", "dup.jsonl"), "DST_ORIGINAL");

    const res = mergeStore(src, dst, fs);
    assert.deepStrictEqual(res.merged, [path.join("proj", "new.jsonl")]);
    assert.deepStrictEqual(res.collisions, [path.join("proj", "dup.jsonl")]);
    assert.strictEqual(fs.readFileSync(path.join(dst, "proj", "dup.jsonl"), "utf8"), "DST_ORIGINAL", "collision must not overwrite");
    assert.strictEqual(fs.readFileSync(path.join(dst, "proj", "new.jsonl"), "utf8"), "SRC_NEW");
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// linkAccount / unlinkAccount
// ---------------------------------------------------------------------------

test("linkAccount: merges secondary into primary, preserves a backup, symlinks the store", () => {
  const home = makeHome({ ".claude": { jsonl: ["primary.jsonl"] }, ".claude-b": { jsonl: ["b1.jsonl", "b2.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    const r = linkAccount({ primaryDir, secondaryDir, vendor: "claude", now: Date.parse("2026-07-21T00:00:00Z") });
    assert.strictEqual(r.status, "linked");
    assert.strictEqual(r.merged.length, 2, "both B files merged into A");
    // secondary/projects is now a symlink to primary's store
    assert.strictEqual(fs.lstatSync(path.join(secondaryDir, "projects")).isSymbolicLink(), true);
    assert.strictEqual(fs.realpathSync(path.join(secondaryDir, "projects")), fs.realpathSync(path.join(primaryDir, "projects")));
    // a backup of B's original store exists
    const bak = fs.readdirSync(secondaryDir).find((n) => n.startsWith("projects.bak."));
    assert.ok(bak, "pre-link backup preserved");
    // B's files are now resumable via the shared store
    const shared = fs.readdirSync(path.join(primaryDir, "projects", "proj")).sort();
    assert.deepStrictEqual(shared, ["b1.jsonl", "b2.jsonl", "primary.jsonl"]);
  } finally {
    rmHome(home);
  }
});

test("linkAccount: idempotent — re-linking an already-linked store is a no-op", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    linkAccount({ primaryDir, secondaryDir, vendor: "claude" });
    const second = linkAccount({ primaryDir, secondaryDir, vendor: "claude" });
    assert.strictEqual(second.status, "already-linked");
  } finally {
    rmHome(home);
  }
});

test("unlinkAccount: restores the secondary from its pre-link backup", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    linkAccount({ primaryDir, secondaryDir, vendor: "claude" });
    const u = unlinkAccount({ secondaryDir, vendor: "claude" });
    assert.strictEqual(u.status, "unlinked");
    assert.ok(u.restored, "restored from backup");
    // secondary/projects is a real dir again (not a symlink) holding B's original file
    assert.strictEqual(fs.lstatSync(path.join(secondaryDir, "projects")).isSymbolicLink(), false);
    assert.ok(fs.existsSync(path.join(secondaryDir, "projects", "proj", "b.jsonl")));
  } finally {
    rmHome(home);
  }
});

test("unlinkAccount: a never-linked (real dir) store reports not-linked, unchanged", () => {
  const home = makeHome({ ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const secondaryDir = path.join(home, ".claude-b");
    const u = unlinkAccount({ secondaryDir, vendor: "claude" });
    assert.strictEqual(u.status, "not-linked");
    assert.ok(fs.existsSync(path.join(secondaryDir, "projects", "proj", "b.jsonl")), "real store untouched");
  } finally {
    rmHome(home);
  }
});

test("link then unlink then re-link round-trips without data loss", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    linkAccount({ primaryDir, secondaryDir, vendor: "claude", now: 1 });
    unlinkAccount({ secondaryDir, vendor: "claude" });
    // B has its own file back
    assert.ok(fs.existsSync(path.join(secondaryDir, "projects", "proj", "b.jsonl")));
    // A retained the merged copy (shared history stays in the primary — documented)
    assert.ok(fs.existsSync(path.join(primaryDir, "projects", "proj", "b.jsonl")));
    const relink = linkAccount({ primaryDir, secondaryDir, vendor: "claude", now: 2 });
    assert.strictEqual(relink.status, "linked");
    assert.strictEqual(fs.lstatSync(path.join(secondaryDir, "projects")).isSymbolicLink(), true);
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// Cross-family review fixes (Codex, 2026-07-21)
// ---------------------------------------------------------------------------

test("[F1] link/undo plan is Claude-only — Codex dirs are never linked in R1", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {}, ".codex": {}, ".codex-b": {} });
  try {
    const plan = planLinkTargets({ homedir: home });
    assert.ok(plan.length >= 1);
    assert.ok(plan.every((p) => p.vendor === "claude"), "no codex entry may appear in the link plan");
  } finally {
    rmHome(home);
  }
});

test("[F2] linkAccount refuses when the primary store is itself a symlink (no self-referential loop)", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    // make primary/projects a symlink → a real dir elsewhere
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-elsewhere-"));
    fs.rmSync(path.join(primaryDir, "projects"), { recursive: true, force: true });
    fs.symlinkSync(elsewhere, path.join(primaryDir, "projects"), "dir");
    const r = linkAccount({ primaryDir, secondaryDir: path.join(home, ".claude-b"), vendor: "claude" });
    assert.strictEqual(r.status, "primary-not-real-dir");
    // secondary untouched
    assert.ok(fs.existsSync(path.join(home, ".claude-b", "projects", "proj", "b.jsonl")));
    fs.rmSync(elsewhere, { recursive: true, force: true });
  } finally {
    rmHome(home);
  }
});

test("[F3] linkAccount rolls the backup back when symlink creation fails (no data loss)", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    // fsImpl whose symlinkSync always fails (simulates Windows no-privilege)
    const failingFs = new Proxy(fs, {
      get(t, p) {
        if (p === "symlinkSync") return () => { const e = new Error("EPERM"); e.code = "EPERM"; throw e; };
        return t[p];
      },
    });
    const r = linkAccount({ primaryDir, secondaryDir, vendor: "claude", fsImpl: failingFs });
    assert.strictEqual(r.status, "link-failed");
    // secondary store restored to a real dir holding its original file
    assert.strictEqual(fs.lstatSync(path.join(secondaryDir, "projects")).isSymbolicLink(), false);
    assert.ok(fs.existsSync(path.join(secondaryDir, "projects", "proj", "b.jsonl")), "no data loss on failed link");
  } finally {
    rmHome(home);
  }
});

test("[F4] mergeStore never overwrites an existing dest even under a race (COPYFILE_EXCL)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-f4-"));
  try {
    const src = path.join(home, "src");
    const dst = path.join(home, "dst");
    fs.mkdirSync(path.join(src, "p"), { recursive: true });
    fs.mkdirSync(path.join(dst, "p"), { recursive: true });
    fs.writeFileSync(path.join(src, "p", "x.jsonl"), "SRC");
    fs.writeFileSync(path.join(dst, "p", "x.jsonl"), "DST_ORIGINAL");
    const res = mergeStore(src, dst, fs);
    assert.deepStrictEqual(res.collisions, [path.join("p", "x.jsonl")]);
    assert.strictEqual(fs.readFileSync(path.join(dst, "p", "x.jsonl"), "utf8"), "DST_ORIGINAL");
  } finally {
    rmHome(home);
  }
});

test("[F5] mergeStore refuses a destination that escapes the store via a symlinked subdir", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-f5-"));
  try {
    const src = path.join(home, "src");
    const dst = path.join(home, "dst");
    const outside = path.join(home, "outside");
    fs.mkdirSync(path.join(src, "p"), { recursive: true });
    fs.mkdirSync(dst, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(src, "p", "x.jsonl"), "SRC");
    // dst/p is a symlink pointing outside the store
    fs.symlinkSync(outside, path.join(dst, "p"), "dir");
    const res = mergeStore(src, dst, fs);
    assert.deepStrictEqual(res.merged, [], "nothing may be written through the escaping symlink");
    assert.strictEqual(fs.existsSync(path.join(outside, "x.jsonl")), false, "no file escaped the store");
  } finally {
    rmHome(home);
  }
});

test("[F8] unlinkAccount ignores a non-directory backup entry and resets to empty instead", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    linkAccount({ primaryDir, secondaryDir, vendor: "claude", now: 1 });
    // remove the real backup, drop a decoy FILE with the bak prefix
    for (const n of fs.readdirSync(secondaryDir)) {
      if (n.startsWith("projects.bak.")) fs.rmSync(path.join(secondaryDir, n), { recursive: true, force: true });
    }
    fs.writeFileSync(path.join(secondaryDir, "projects.bak.decoy"), "not a dir");
    const u = unlinkAccount({ secondaryDir, vendor: "claude" });
    assert.strictEqual(u.status, "unlinked");
    assert.strictEqual(u.restored, null, "a non-directory bak entry must not be promoted");
    assert.strictEqual(fs.lstatSync(path.join(secondaryDir, "projects")).isSymbolicLink(), false);
  } finally {
    rmHome(home);
  }
});

test("[F9] a shared Claude store reports non-attributable headroom, not a bogus per-account zero", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    linkAccount({ primaryDir, secondaryDir, vendor: "claude" });
    const status = buildStatus({ homedir: home, env: {}, withIdentity: false });
    for (const a of status.accounts.filter((x) => x.vendor === "claude")) {
      if (a.headroom) assert.strictEqual(a.headroom.kind, "shared", `${a.label} should report shared, not a per-account token count`);
    }
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// planLinkTargets
// ---------------------------------------------------------------------------

test("planLinkTargets: default dir is primary, dash-variants are secondaries", () => {
  const home = makeHome({ ".claude": {}, ".claude-b": {}, ".claude-work": {}, ".codex": {} });
  try {
    const plan = planLinkTargets({ homedir: home });
    const claude = plan.filter((p) => p.vendor === "claude");
    assert.strictEqual(claude.length, 2, "two secondaries for claude");
    assert.ok(claude.every((p) => path.basename(p.primaryDir) === ".claude"));
    assert.ok(!plan.some((p) => p.vendor === "codex"), "lone .codex has no secondary → no plan entry");
  } finally {
    rmHome(home);
  }
});

test("planLinkTargets: dash-variant without a canonical default dir yields no plan (nothing to anchor)", () => {
  const home = makeHome({ ".claude-b": {} });
  try {
    const plan = planLinkTargets({ homedir: home });
    assert.strictEqual(plan.length, 0);
  } finally {
    rmHome(home);
  }
});

// ---------------------------------------------------------------------------
// cmdAccount entrypoint
// ---------------------------------------------------------------------------

test("cmdAccount status --json emits sdtk.account.v1 and exit 0", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] } });
  try {
    const out = [];
    const code = cmdAccount(["status", "--json", "--no-identity"], {
      homedir: home,
      env: {},
      withHeadroom: false,
      log: (s) => out.push(s),
    });
    const parsed = JSON.parse(out.join("\n"));
    assert.strictEqual(parsed.schema, "sdtk.account.v1");
    assert.strictEqual(code, 0);
  } finally {
    rmHome(home);
  }
});

test("cmdAccount link --dry-run touches nothing and exits 0", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const before = fs.lstatSync(path.join(home, ".claude-b", "projects")).isSymbolicLink();
    const out = [];
    const code = cmdAccount(["link", "--dry-run"], { homedir: home, log: (s) => out.push(s) });
    const after = fs.lstatSync(path.join(home, ".claude-b", "projects")).isSymbolicLink();
    assert.strictEqual(before, after, "dry-run must not create a symlink");
    assert.strictEqual(code, 0);
    assert.ok(out.join("\n").includes("dry-run"));
  } finally {
    rmHome(home);
  }
});

test("cmdAccount link actually links, then --undo restores; both exit 0", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const c1 = cmdAccount(["link"], { homedir: home, log: () => {} });
    assert.strictEqual(c1, 0);
    assert.strictEqual(fs.lstatSync(path.join(home, ".claude-b", "projects")).isSymbolicLink(), true);
    const c2 = cmdAccount(["link", "--undo"], { homedir: home, log: () => {} });
    assert.strictEqual(c2, 0);
    assert.strictEqual(fs.lstatSync(path.join(home, ".claude-b", "projects")).isSymbolicLink(), false);
  } finally {
    rmHome(home);
  }
});

test("cmdAccount guide and help exit 0 and touch no filesystem", () => {
  const out = [];
  assert.strictEqual(cmdAccount(["guide"], { log: (s) => out.push(s) }), 0);
  assert.strictEqual(cmdAccount(["--help"], { log: (s) => out.push(s) }), 0);
  assert.ok(out.join("\n").includes("account link"));
});

// ---------------------------------------------------------------------------
// BK-389 — Windows link type + slot-aware link targets
// ---------------------------------------------------------------------------

// The defect this guards: symlinkSync(..., "dir") needs an elevated shell on
// Windows, so `sdtk account link` failed EPERM for every ordinary user. A
// junction needs no privilege. Asserted negatively too — "dir" alone on win32
// is the bug, so the test must fail if someone reverts to it.
test("linkTypesFor: Windows prefers a junction (no admin needed), POSIX uses a dir symlink", () => {
  assert.deepStrictEqual(linkTypesFor("win32"), ["junction", "dir"]);
  assert.notDeepStrictEqual(linkTypesFor("win32"), ["dir"]);
  assert.deepStrictEqual(linkTypesFor("linux"), ["dir"]);
  assert.deepStrictEqual(linkTypesFor("darwin"), ["dir"]);
});

test("linkAccount: reports the link type it used, and falls back when the first type fails", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    // Simulate win32: "junction" is unsupported on this POSIX host, so the real
    // fs throws and the loop must fall through to "dir" rather than give up.
    const attempted = [];
    const fsSpy = Object.create(fs);
    fsSpy.symlinkSync = (target, p, type) => {
      attempted.push(type);
      if (type === "junction") throw Object.assign(new Error("EPERM"), { code: "EPERM" });
      return fs.symlinkSync(target, p, type);
    };
    const r = linkAccount({ primaryDir, secondaryDir, vendor: "claude", fsImpl: fsSpy, platform: "win32" });
    assert.strictEqual(r.status, "linked");
    assert.deepStrictEqual(attempted, ["junction", "dir"], "junction is tried first, dir is the fallback");
    assert.strictEqual(r.linkType, "dir");
  } finally {
    rmHome(home);
  }
});

test("linkAccount: every link type failing is a no-op — the store is restored, not lost", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b1.jsonl"] } });
  try {
    const primaryDir = path.join(home, ".claude");
    const secondaryDir = path.join(home, ".claude-b");
    const fsSpy = Object.create(fs);
    fsSpy.symlinkSync = () => {
      throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    };
    const r = linkAccount({ primaryDir, secondaryDir, vendor: "claude", fsImpl: fsSpy, platform: "win32" });
    assert.strictEqual(r.status, "link-failed");
    assert.strictEqual(r.error, "EPERM");
    // The secondary still owns a real store holding its original session.
    const secStore = path.join(secondaryDir, "projects");
    assert.strictEqual(fs.lstatSync(secStore).isSymbolicLink(), false);
    assert.deepStrictEqual(fs.readdirSync(path.join(secStore, "proj")), ["b1.jsonl"]);
  } finally {
    rmHome(home);
  }
});

// A slot dir created by `sdtk login` has no projects/ tree until its first
// session, and discovery only lists dirs that have one — so the moment you most
// want to share the store, the account was invisible and link said "nothing to
// link". Passing the slot dirs in fixes exactly that.
test("planLinkTargets: a freshly created slot dir (no projects/ yet) is linkable via extraSecondaryDirs", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] } });
  try {
    const fresh = path.join(home, ".claude-2");
    fs.mkdirSync(fresh, { recursive: true });

    assert.deepStrictEqual(planLinkTargets({ homedir: home }), [], "discovery alone cannot see it");

    const plan = planLinkTargets({ homedir: home, extraSecondaryDirs: [{ vendor: "claude", dir: fresh }] });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].secondaryDir, fresh);
    assert.strictEqual(plan[0].primaryDir, path.join(home, ".claude"));

    // And linking it actually produces a working shared store.
    const r = linkAccount({ primaryDir: plan[0].primaryDir, secondaryDir: fresh, vendor: "claude" });
    assert.strictEqual(r.status, "linked");
    assert.strictEqual(
      fs.realpathSync(path.join(fresh, "projects", "proj", "a.jsonl")),
      fs.realpathSync(path.join(home, ".claude", "projects", "proj", "a.jsonl")),
      "the primary's session is now resumable from the new slot"
    );
  } finally {
    rmHome(home);
  }
});

test("planLinkTargets: extraSecondaryDirs never duplicates an already-discovered account, and skips non-claude", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const known = path.join(home, ".claude-b");
    const plan = planLinkTargets({
      homedir: home,
      extraSecondaryDirs: [
        { vendor: "claude", dir: known }, // already discovered
        { vendor: "codex", dir: path.join(home, ".codex-2") }, // out of R1 scope
        { vendor: "claude", dir: path.join(home, ".claude-ghost") }, // does not exist
      ],
    });
    assert.deepStrictEqual(plan.map((p) => p.secondaryDir), [known]);
  } finally {
    rmHome(home);
  }
});


// ---------------------------------------------------------------------------
// BK-392 — status must see slots that have no sessions yet, and limit events
// ---------------------------------------------------------------------------

// The bug: `sdtk login` creates a config dir, but discovery lists an account
// only once it has a projects/ tree. A user who ran `sdtk login` three times
// saw ONE account in `status`. BK-389 fixed exactly this for `account link` and
// left `status` behind — this pins both halves.
test("[BK-392] buildStatus lists a freshly created slot dir that has no projects/ yet", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] } });
  try {
    const fresh = path.join(home, ".claude-2");
    fs.mkdirSync(fresh, { recursive: true });

    const without = buildStatus({ homedir: home, withIdentity: false });
    assert.deepStrictEqual(without.accounts.map((a) => a.label), [".claude"],
      "discovery alone cannot see it — this is the defect");

    const withSlots = buildStatus({
      homedir: home, withIdentity: false,
      extraDirs: [{ vendor: "claude", dir: fresh }],
    });
    assert.deepStrictEqual(withSlots.accounts.map((a) => a.label).sort(), [".claude", ".claude-2"]);
  } finally {
    rmHome(home);
  }
});

test("[BK-392] extraDirs never duplicates a discovered account and skips missing dirs", () => {
  const home = makeHome({ ".claude": { jsonl: ["a.jsonl"] }, ".claude-b": { jsonl: ["b.jsonl"] } });
  try {
    const status = buildStatus({
      homedir: home, withIdentity: false,
      extraDirs: [
        { vendor: "claude", dir: path.join(home, ".claude-b") },   // already discovered
        { vendor: "claude", dir: path.join(home, ".claude-ghost") }, // does not exist
        { vendor: "claude", dir: path.join(home, ".claude") },      // the default itself
      ],
    });
    assert.deepStrictEqual(status.accounts.map((a) => a.label).sort(), [".claude", ".claude-b"]);
  } finally {
    rmHome(home);
  }
});

// Claude records a limit only AFTER it is hit, as a 429 line. There is no local
// headroom figure — these tests pin that we report the event, never a quota.
function homeWith429(lines) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-lim-"));
  const dir = path.join(home, ".claude", "projects", "proj");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "s.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return home;
}
function limitLine(text, ts) {
  return { apiErrorStatus: 429, timestamp: ts, message: { content: [{ type: "text", text }] } };
}

test("[BK-392] limit events are classified by kind and the newest of each wins", () => {
  const home = homeWith429([
    limitLine("You've hit your session limit · resets 3:50pm (UTC)", "2026-07-01T00:00:00.000Z"),
    limitLine("You've hit your session limit · resets 8:10am (UTC)", "2026-07-20T00:00:00.000Z"),
    limitLine("You've hit your weekly limit · resets 2pm (UTC)", "2026-07-14T00:00:00.000Z"),
    limitLine("You've hit your monthly spend limit · raise it at claude.ai", "2026-07-29T00:00:00.000Z"),
    { type: "assistant", message: { content: [{ type: "text", text: "no limit here" }] } },
  ]);
  try {
    const u = aggregateUsage({ homedir: home, now: Date.parse("2026-07-29T12:00:00.000Z") });
    const acct = u.accounts.find((a) => a.label === ".claude");
    const byKind = new Map(acct.limitEvents.map((e) => [e.kind, e]));
    assert.deepStrictEqual([...byKind.keys()].sort(),
      ["monthly spend", "session (5h)", "weekly"]);
    assert.ok(byKind.get("session (5h)").text.includes("8:10am"),
      "the NEWER session event must win, not the first one seen");
    assert.strictEqual(acct.limitEvents.length, 3, "a non-429 line must not become an event");
  } finally {
    rmHome(home);
  }
});

test("[BK-392] a 429 with no readable text, and malformed lines, produce no event", () => {
  const home = homeWith429([
    { apiErrorStatus: 429, timestamp: "2026-07-20T00:00:00.000Z", message: { content: [] } },
    { apiErrorStatus: 500, timestamp: "2026-07-20T00:00:00.000Z", message: { content: [{ text: "server limit" }] } },
  ]);
  try {
    fs.appendFileSync(path.join(home, ".claude", "projects", "proj", "s.jsonl"), "{not json\n");
    const u = aggregateUsage({ homedir: home, now: Date.parse("2026-07-29T12:00:00.000Z") });
    const acct = u.accounts.find((a) => a.label === ".claude");
    assert.deepStrictEqual(acct.limitEvents, [], "only a real 429 with text counts");
  } finally {
    rmHome(home);
  }
});

test("[BK-392] the rendered status labels limits as history, never as remaining quota", () => {
  const home = homeWith429([
    limitLine("You've hit your weekly limit · resets 2pm (UTC)", "2026-07-14T00:00:00.000Z"),
  ]);
  try {
    const status = buildStatus({ homedir: home, withIdentity: false, now: Date.parse("2026-07-29T12:00:00.000Z") });
    const out = renderStatus(status);
    assert.ok(/limit hit: weekly · 2026-07-14/.test(out), out);
    assert.ok(/not remaining quota/.test(out), "the honesty note must be present");
    assert.ok(!/remaining|headroom: \d+%/.test(out.split("not remaining quota")[0]),
      "must never present a Claude percentage it cannot know");
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
