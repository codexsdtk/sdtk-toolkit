#!/usr/bin/env node
"use strict";

// Offline unit tests for `sdtk doctor` (BK-322): version-fragmentation
// detection across umbrella-bundled and standalone global sub-kit installs.
// Real fs on throwaway temp dirs; no network, no child processes.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { execFileSync } = require("child_process");

const {
  compareVersions,
  resolveBinaryOnPath,
  owningPackage,
  buildDoctorReport,
  KIT_CLIS,
} = require("../src/lib/doctor");

const { collectRepoHealth, renderRepoHealth, mergedPrNumbers, backlogDrift } = require("../src/lib/repo-health");

// Stub git runner: match on a join of the args, first hit wins. Anything
// unmatched returns status 0 empty (a benign default). Lets us drive
// collectRepoHealth deterministically with no real repo.
function stubGit(routes) {
  return (args) => {
    const key = args.join(" ");
    for (const [prefix, resp] of routes) {
      if (key.startsWith(prefix)) {
        return { status: 0, stdout: "", stderr: "", ...resp };
      }
    }
    return { status: 0, stdout: "", stderr: "" };
  };
}
const INSIDE = ["rev-parse --is-inside-work-tree", { stdout: "true\n" }];

// ---------------------------------------------------------------------------
// Fixture: a fake npm global root with the umbrella bundling an OLD wiki kit
// and a NEWER standalone wiki kit installed alongside it — the exact
// fragmentation hit live on 2026-07-10 (PATH served 0.6.0 while 0.8.0 sat
// unused). PATH resolves the umbrella shim.
// ---------------------------------------------------------------------------
function makeFixture({ standaloneWins = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-doctor-test-"));
  const nm = path.join(root, "node_modules");
  const binDir = path.join(root, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  function writePkg(dir, name, version, extra = {}) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name, version, ...extra }, null, 2)
    );
  }

  // Umbrella with bundled old wiki kit.
  const umbrella = path.join(nm, "sdtk-kit");
  writePkg(umbrella, "sdtk-kit", "1.14.0", {
    dependencies: { "sdtk-wiki-kit": "^0.6.0" },
  });
  fs.mkdirSync(path.join(umbrella, "bin"), { recursive: true });
  fs.writeFileSync(
    path.join(umbrella, "bin", "sdtk-wiki.js"),
    '#!/usr/bin/env node\nrequire("sdtk-wiki-kit/bin/sdtk-wiki.js");\n'
  );
  const bundledWiki = path.join(umbrella, "node_modules", "sdtk-wiki-kit");
  writePkg(bundledWiki, "sdtk-wiki-kit", "0.6.0");
  fs.mkdirSync(path.join(bundledWiki, "bin"), { recursive: true });
  fs.writeFileSync(path.join(bundledWiki, "bin", "sdtk-wiki.js"), "// stub\n");

  // Newer standalone wiki kit at the same global root.
  const standaloneWiki = path.join(nm, "sdtk-wiki-kit");
  writePkg(standaloneWiki, "sdtk-wiki-kit", "0.8.0");
  fs.mkdirSync(path.join(standaloneWiki, "bin"), { recursive: true });
  fs.writeFileSync(path.join(standaloneWiki, "bin", "sdtk-wiki.js"), "// stub\n");

  // PATH bin symlink: umbrella shim wins unless standaloneWins.
  const target = standaloneWins
    ? path.join(standaloneWiki, "bin", "sdtk-wiki.js")
    : path.join(umbrella, "bin", "sdtk-wiki.js");
  fs.symlinkSync(target, path.join(binDir, "sdtk-wiki"));

  return { root, binDir, nm, umbrella, bundledWiki, standaloneWiki };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------
test("compareVersions orders semver correctly", () => {
  assert.ok(compareVersions("0.8.0", "0.6.0") > 0);
  assert.ok(compareVersions("0.6.0", "0.8.0") < 0);
  assert.strictEqual(compareVersions("1.18.0", "1.18.0"), 0);
  assert.ok(compareVersions("1.2.10", "1.2.9") > 0, "numeric, not lexicographic");
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
});

// ---------------------------------------------------------------------------
// resolveBinaryOnPath
// ---------------------------------------------------------------------------
test("resolveBinaryOnPath finds the first matching bin on a POSIX PATH", () => {
  const fx = makeFixture();
  const found = resolveBinaryOnPath("sdtk-wiki", { pathEnv: fx.binDir, pathSep: path.delimiter });
  assert.strictEqual(found, path.join(fx.binDir, "sdtk-wiki"));
});

test("resolveBinaryOnPath returns null when absent", () => {
  const fx = makeFixture();
  assert.strictEqual(
    resolveBinaryOnPath("sdtk-nonexistent", { pathEnv: fx.binDir, pathSep: path.delimiter }),
    null
  );
});

// ---------------------------------------------------------------------------
// owningPackage
// ---------------------------------------------------------------------------
test("owningPackage walks up from a bin file to its package.json", () => {
  const fx = makeFixture();
  const pkg = owningPackage(path.join(fx.umbrella, "bin", "sdtk-wiki.js"));
  assert.strictEqual(pkg.name, "sdtk-kit");
  assert.strictEqual(pkg.version, "1.14.0");
  assert.strictEqual(pkg.dir, fx.umbrella);
});

// ---------------------------------------------------------------------------
// buildDoctorReport — the real fragmentation scenario
// ---------------------------------------------------------------------------
test("doctor flags a newer standalone kit shadowed by the umbrella shim", () => {
  const fx = makeFixture();
  const report = buildDoctorReport({ pathEnv: fx.binDir, pathSep: path.delimiter });
  const wiki = report.kits.find((k) => k.cli === "sdtk-wiki");
  assert.ok(wiki, "sdtk-wiki row present");
  assert.strictEqual(wiki.activeVersion, "0.6.0", "PATH serves the bundled 0.6.0");
  assert.ok(/sdtk-kit@1\.14\.0/.test(wiki.activeSource), "active source names the umbrella");
  const versions = wiki.installed.map((c) => c.version).sort();
  assert.deepStrictEqual(versions, ["0.6.0", "0.8.0"], "both copies discovered");
  assert.strictEqual(wiki.warnings.length, 1, "exactly one warning");
  assert.ok(
    wiki.warnings[0].includes("0.8.0") && wiki.warnings[0].includes("0.6.0"),
    "warning names both versions"
  );
  assert.ok(report.hasWarnings, "report-level warning flag set");
});

test("doctor is quiet when the active binary already serves the newest copy", () => {
  const fx = makeFixture({ standaloneWins: true });
  const report = buildDoctorReport({ pathEnv: fx.binDir, pathSep: path.delimiter });
  const wiki = report.kits.find((k) => k.cli === "sdtk-wiki");
  assert.strictEqual(wiki.activeVersion, "0.8.0");
  assert.strictEqual(wiki.warnings.length, 0, "no warning when newest is active");
});

test("doctor reports kits missing from PATH without crashing", () => {
  const fx = makeFixture();
  const report = buildDoctorReport({ pathEnv: fx.binDir, pathSep: path.delimiter });
  const spec = report.kits.find((k) => k.cli === "sdtk-spec");
  assert.ok(spec, "sdtk-spec row present");
  assert.strictEqual(spec.activeVersion, null, "not resolvable");
  assert.ok(spec.warnings.some((w) => w.toLowerCase().includes("not found")), "flagged as missing");
});

test("KIT_CLIS covers all six suite CLIs with their package names", () => {
  const clis = KIT_CLIS.map((k) => k.cli).sort();
  assert.deepStrictEqual(clis, [
    "sdtk-agent", "sdtk-code", "sdtk-design", "sdtk-ops", "sdtk-spec", "sdtk-wiki",
  ]);
  const wiki = KIT_CLIS.find((k) => k.cli === "sdtk-wiki");
  assert.strictEqual(wiki.pkg, "sdtk-wiki-kit");
});

// ---------------------------------------------------------------------------
// BK-344 config health (informational; never changes doctor exit semantics)
// ---------------------------------------------------------------------------
const { buildConfigHealth } = require("../src/lib/doctor");

test("config health: absent config reports present=false", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-doctor-cfg-"));
  const health = buildConfigHealth(dir);
  assert.strictEqual(health.present, false);
  assert.deepStrictEqual(health.findings, []);
});

test("config health: flags UPDATE_ME and 'Set your' placeholders with paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-doctor-cfg-"));
  fs.writeFileSync(
    path.join(dir, "sdtk-spec.config.json"),
    JSON.stringify({
      schemaVersion: 1,
      stack: { backend: "Set your backend stack (example: ...)", frontend: "React 18" },
      commands: { backendTests: "UPDATE_ME: set backend test command", frontendTests: "npm test" },
    })
  );
  const health = buildConfigHealth(dir);
  assert.strictEqual(health.present, true);
  assert.strictEqual(health.parseError, null);
  const paths = health.findings.map((f) => f.path).sort();
  assert.deepStrictEqual(paths, ["commands.backendTests", "stack.backend"]);
});

test("config health: clean config yields zero findings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-doctor-cfg-"));
  fs.writeFileSync(
    path.join(dir, "sdtk-spec.config.json"),
    JSON.stringify({ schemaVersion: 1, commands: { backendTests: "php artisan test" } })
  );
  const health = buildConfigHealth(dir);
  assert.strictEqual(health.findings.length, 0);
});

test("config health: invalid JSON reports parseError instead of throwing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-doctor-cfg-"));
  fs.writeFileSync(path.join(dir, "sdtk-spec.config.json"), "{ not json");
  const health = buildConfigHealth(dir);
  assert.strictEqual(health.present, true);
  assert.ok(health.parseError);
});

// ---------------------------------------------------------------------------
// BK-364 repo-health (stubbed git — no real repo)
// ---------------------------------------------------------------------------
test("repo-health AC-01: behind > threshold flags STALE", () => {
  const git = stubGit([
    INSIDE,
    ["symbolic-ref", { stdout: "refs/remotes/origin/main\n" }],
    ["rev-parse --abbrev-ref", { stdout: "feature\n" }],
    ["rev-list", { stdout: "0\t60\n" }],
  ]);
  const h = collectRepoHealth("/x", { git, behindThreshold: 50 });
  assert.strictEqual(h.behind, 60);
  assert.strictEqual(h.stale, true);
  assert.ok(h.warnings.some((w) => /STALE/.test(w)));
});

test("repo-health AC-01: behind <= threshold does NOT flag STALE", () => {
  const git = stubGit([
    INSIDE,
    ["symbolic-ref", { stdout: "refs/remotes/origin/main\n" }],
    ["rev-parse --abbrev-ref", { stdout: "main\n" }],
    ["rev-list", { stdout: "0\t10\n" }],
  ]);
  const h = collectRepoHealth("/x", { git, behindThreshold: 50 });
  assert.strictEqual(h.stale, false);
  assert.ok(!h.warnings.some((w) => /STALE/.test(w)));
});

test("repo-health AC-02: counts merged branches, excludes current + main", () => {
  const git = (args) => {
    const key = args.join(" ");
    if (key.startsWith("rev-parse --is-inside-work-tree")) return { status: 0, stdout: "true\n" };
    if (key.startsWith("symbolic-ref")) return { status: 0, stdout: "refs/remotes/origin/main\n" };
    if (key.startsWith("rev-parse --abbrev-ref")) return { status: 0, stdout: "feature\n" };
    if (key.startsWith("rev-list")) return { status: 0, stdout: "0\t0\n" };
    if (key.startsWith("for-each-ref")) return { status: 0, stdout: "main\nfeature\nmergedA\nmergedB\nunmerged\n" };
    if (key.startsWith("merge-base --is-ancestor")) {
      // mergedA/mergedB are ancestors (status 0); unmerged is not (status 1)
      return { status: /mergedA|mergedB/.test(key) ? 0 : 1, stdout: "" };
    }
    return { status: 0, stdout: "" };
  };
  const h = collectRepoHealth("/x", { git });
  assert.deepStrictEqual(h.mergedBranches.sort(), ["mergedA", "mergedB"]);
});

test("repo-health AC-03: dirty worktree flagged, clean not", () => {
  const git = (args) => {
    const key = args.join(" ");
    if (key.startsWith("rev-parse --is-inside-work-tree")) return { status: 0, stdout: "true\n" };
    if (key.startsWith("symbolic-ref")) return { status: 0, stdout: "refs/remotes/origin/main\n" };
    if (key.startsWith("rev-parse --abbrev-ref")) return { status: 0, stdout: "main\n" };
    if (key.startsWith("rev-list")) return { status: 0, stdout: "0\t0\n" };
    if (key.startsWith("for-each-ref")) return { status: 0, stdout: "main\n" };
    if (key.startsWith("worktree list")) return { status: 0, stdout: "worktree /repo/main\nworktree /repo/wt-dirty\n" };
    if (key.startsWith("-C /repo/wt-dirty status")) return { status: 0, stdout: " M file.js\n" };
    if (key.startsWith("-C /repo/main status")) return { status: 0, stdout: "" };
    return { status: 0, stdout: "" };
  };
  const h = collectRepoHealth("/x", { git });
  const dirty = h.worktrees.filter((w) => w.dirty).map((w) => w.path);
  assert.deepStrictEqual(dirty, ["/repo/wt-dirty"]);
});

test("repo-health AC-05: non-repo degrades gracefully, available:false", () => {
  const git = () => ({ status: 128, stdout: "", stderr: "fatal: not a git repository" });
  const h = collectRepoHealth("/x", { git });
  assert.strictEqual(h.available, false);
  assert.ok(/not a git repository/.test(h.reason));
  // render must not throw and must produce a single skip line
  const lines = renderRepoHealth(h);
  assert.ok(lines.some((l) => /repo health skipped/.test(l)));
});

test("repo-health AC-05: git missing (status 127) reported as unavailable", () => {
  const git = () => ({ status: 127, stdout: "", stderr: "" });
  const h = collectRepoHealth("/x", { git });
  assert.strictEqual(h.available, false);
  assert.ok(/git is not available/.test(h.reason));
});

test("repo-health AC-06: long merged list capped at 10 + more line", () => {
  const many = Array.from({ length: 20 }, (_, i) => `b${i}`);
  const git = (args) => {
    const key = args.join(" ");
    if (key.startsWith("rev-parse --is-inside-work-tree")) return { status: 0, stdout: "true\n" };
    if (key.startsWith("symbolic-ref")) return { status: 0, stdout: "refs/remotes/origin/main\n" };
    if (key.startsWith("rev-parse --abbrev-ref")) return { status: 0, stdout: "main\n" };
    if (key.startsWith("rev-list")) return { status: 0, stdout: "0\t0\n" };
    if (key.startsWith("for-each-ref")) return { status: 0, stdout: many.join("\n") + "\n" };
    if (key.startsWith("merge-base --is-ancestor")) return { status: 0, stdout: "" };
    return { status: 0, stdout: "" };
  };
  const h = collectRepoHealth("/x", { git });
  assert.strictEqual(h.mergedBranches.length, 20);
  const lines = renderRepoHealth(h);
  assert.ok(lines.some((l) => /\+10 more/.test(l)), "renders +10 more");
});

test("repo-health AC-05/07 integration: real tmp git repo, fast + clean", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-repohealth-"));
  const g = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    g(["init", "-q", "-b", "main"]);
    g(["config", "user.email", "t@t"]);
    g(["config", "user.name", "t"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "1");
    g(["add", "-A"]);
    g(["commit", "-qm", "init"]);
    // a merged branch: create off main, then it's already an ancestor of main
    g(["branch", "already-merged"]);
    const t0 = Date.now();
    const h = collectRepoHealth(dir, { now: t0 });
    const ms = Date.now() - t0;
    assert.strictEqual(h.available, true);
    assert.ok(ms < 2000, `repo health took ${ms}ms (< 2000 target)`);
    // no origin remote -> default falls back to "main"; behind unavailable is fine
    assert.strictEqual(h.defaultBranch, "main");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// BK-374 — backlog drift (offline, from local git history)
// ---------------------------------------------------------------------------

test("BK-374: mergedPrNumbers reads merge + squash commit subjects offline", () => {
  const git = () => ({
    status: 0,
    stdout: "Merge pull request #384 from x/y\nfix: something (#377)\nplain commit\nMerge pull request #380 from a/b",
    stderr: "",
  });
  const nums = mergedPrNumbers(git);
  assert.ok(nums.has(384) && nums.has(380) && nums.has(377));
  assert.strictEqual(nums.has(999), false);
});

test("BK-374: flags a row claiming an open PR that git shows merged; ignores PLANNED citing a merged plan-PR", () => {
  const merged = new Set([384, 382]);
  const fsImpl = {
    readFileSync: () =>
      [
        '| BK-999 | fake impl | P2 | IMPLEMENTED (PR open) | x | shipped in #384 |',
        '| BK-998 | fake plan | P2 | PLANNED | x | plan filed via #382 |',
        '| BK-997 | fake open | P2 | OPEN | x | no pr cited |',
      ].join("\n"),
  };
  const drift = backlogDrift("/x", merged, fsImpl);
  assert.strictEqual(drift.length, 1, "only the open-PR-claim row with a merged PR drifts");
  assert.strictEqual(drift[0].bk, "BK-999");
  assert.deepStrictEqual(drift[0].mergedPrs, [384]);
});

test("BK-374 [F5]: a row citing both an open and a merged PR is NOT flagged (avoids false positive)", () => {
  const merged = new Set([384]); // #390 is open (not in merged set)
  const fsImpl = {
    readFileSync: () =>
      '| BK-500 | x | P2 | IMPLEMENTED (PR open) | y | current work #390; earlier fix shipped in #384 |',
  };
  assert.deepStrictEqual(backlogDrift("/x", merged, fsImpl), [], "an unmerged cited PR justifies 'PR open'");
});

test("BK-374 [F6]: an escaped pipe in the title does not shift the status column", () => {
  const merged = new Set([384]);
  const fsImpl = {
    readFileSync: () =>
      '| BK-501 | runtime claude\\|codex parity | P2 | IMPLEMENTED (PR open) | y | #384 |',
  };
  const drift = backlogDrift("/x", merged, fsImpl);
  assert.strictEqual(drift.length, 1, "status must still be read from the real column");
  assert.strictEqual(drift[0].bk, "BK-501");
});

test("BK-374: no backlog file → empty (not a crash); git history unavailable → null (skip)", () => {
  const missingFs = { readFileSync: () => { const e = new Error("ENOENT"); throw e; } };
  assert.deepStrictEqual(backlogDrift("/x", new Set([1]), missingFs), []);
  const badGit = () => ({ status: 128, stdout: "", stderr: "not a repo" });
  assert.strictEqual(mergedPrNumbers(badGit), null);
  assert.strictEqual(backlogDrift("/x", null, missingFs), null);
});

test("BK-374: collectRepoHealth surfaces drift as a warning, injectable fs", () => {
  const git = stubGit([
    INSIDE,
    ["log --all --pretty=%s", { stdout: "Merge pull request #384 from x/y" }],
  ]);
  const fsImpl = { readFileSync: () => '| BK-777 | x | P2 | IMPLEMENTED (PR open) | y | #384 |' };
  const h = collectRepoHealth("/x", { git, fsImpl });
  assert.strictEqual(h.backlogDrift.length, 1);
  assert.ok(h.warnings.some((w) => w.includes("BK-777") && w.includes("#384") && w.includes("already merged")));
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
