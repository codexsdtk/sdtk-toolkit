#!/usr/bin/env node
"use strict";

// Offline unit tests for the unified-init orchestrator (BK-268).
// No real PowerShell, no network, no child processes — every effectful dep
// (spawn / resolveBin / powershellCheck / log) is injected as a spy/stub.

const assert = require("assert");
const {
  runUnifiedInit,
  buildInitArgs,
  TOOLKITS,
  ToolkitResolveError,
} = require("../src/lib/unified-init");
const { parseFlags, buildOpts } = require("../src/commands/init");

// spec/ops/code own the PowerShell runtime-asset payload (install.ps1) and so
// also accept --skip-runtime-assets. sdtk-design is runtime-aware (places the
// design-prototype skill under .claude/.codex) but does NOT take that flag.
const ASSET_KITS = ["sdtk-spec", "sdtk-ops", "sdtk-code"];
const RUNTIME_KITS = ["sdtk-spec", "sdtk-ops", "sdtk-code", "sdtk-design"];
const NON_RUNTIME_KITS = ["sdtk-wiki", "sdtk-agent"];

// Build an injected deps object with a recording spawn spy.
// `failures` maps toolkit name → exit code to return (default 0).
// `unresolvable` is a Set of kit package names that resolveBin should reject.
function makeDeps({ failures = {}, unresolvable = new Set(), psOk = true, maintainerRoot = false } = {}) {
  const spawnCalls = [];
  const resolveCalls = [];
  const logs = [];
  return {
    spawnCalls,
    resolveCalls,
    logs,
    deps: {
      spawn(binPath, argv, toolkit) {
        spawnCalls.push({ binPath, argv, toolkit: toolkit.name });
        const code = failures[toolkit.name] || 0;
        return { status: code, stderr: code ? `stub stderr for ${toolkit.name}` : "" };
      },
      resolveBin(kitPkg, binName) {
        resolveCalls.push(kitPkg);
        if (unresolvable.has(kitPkg)) {
          throw new ToolkitResolveError(kitPkg);
        }
        return `/stub/node_modules/${kitPkg}/bin/${binName}.js`;
      },
      powershellCheck() {
        return { ok: psOk, exe: "pwsh" };
      },
      // Hermetic: never touch the real filesystem/cwd for the maintainer check.
      maintainerRootCheck() {
        return maintainerRoot;
      },
      log(line) {
        logs.push(line);
      },
    },
  };
}

// Pull the argv recorded for one toolkit's spawn.
function argvFor(spawnCalls, name) {
  const call = spawnCalls.find((c) => c.toolkit === name);
  return call ? call.argv : null;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ── T1 — runtime claude forwards correctly to runtime kits ──────────────────
test("T1 runtime=claude spawns spec/ops/code with init --runtime claude", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedInit({ runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 0);
  for (const kit of RUNTIME_KITS) {
    const argv = argvFor(h.spawnCalls, kit);
    assert.deepStrictEqual(argv, ["init", "--runtime", "claude"], `${kit} argv`);
  }
});

// ── T2 — runtime codex ──────────────────────────────────────────────────────
test("T2 runtime=codex forwards --runtime codex", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedInit({ runtime: "codex" }, h.deps);
  assert.strictEqual(exitCode, 0);
  for (const kit of RUNTIME_KITS) {
    assert.deepStrictEqual(argvFor(h.spawnCalls, kit), ["init", "--runtime", "codex"]);
  }
});

// ── T3 — flag forwarding (runtime subset vs full) ───────────────────────────
test("T3 forwards shared flags to runtime kits; only subset to design/wiki", () => {
  const h = makeDeps();
  const opts = {
    runtime: "claude",
    runtimeScope: "user",
    projectPath: "/tmp/proj",
    force: true,
    skipRuntimeAssets: true,
    verbose: true,
  };
  runUnifiedInit(opts, h.deps);

  for (const kit of ASSET_KITS) {
    const argv = argvFor(h.spawnCalls, kit);
    assert.deepStrictEqual(
      argv,
      [
        "init",
        "--runtime",
        "claude",
        "--runtime-scope",
        "user",
        "--project-path",
        "/tmp/proj",
        "--force",
        "--skip-runtime-assets",
        "--verbose",
      ],
      `${kit} full forward`
    );
  }
  // design is runtime-aware (gets --runtime/--runtime-scope) but owns no
  // PowerShell payload, so it must NOT receive --skip-runtime-assets.
  {
    const argv = argvFor(h.spawnCalls, "sdtk-design");
    assert.deepStrictEqual(
      argv,
      [
        "init",
        "--runtime",
        "claude",
        "--runtime-scope",
        "user",
        "--project-path",
        "/tmp/proj",
        "--force",
        "--verbose",
      ],
      "sdtk-design runtime-aware forward (no --skip-runtime-assets)"
    );
    assert.ok(!argv.includes("--skip-runtime-assets"), "design must not get --skip-runtime-assets");
  }
  for (const kit of NON_RUNTIME_KITS) {
    const argv = argvFor(h.spawnCalls, kit);
    // BK-354 F-2: sdtk-wiki starts a viewer, so the fan-out passes --no-open to
    // keep it headless-safe; sdtk-agent starts no server and gets the bare subset.
    const expected = kit === "sdtk-wiki"
      ? ["init", "--project-path", "/tmp/proj", "--force", "--no-open", "--verbose"]
      : ["init", "--project-path", "/tmp/proj", "--force", "--verbose"];
    assert.deepStrictEqual(argv, expected, `${kit} subset`);
    assert.ok(!argv.includes("--runtime"), `${kit} must not get --runtime`);
    assert.ok(!argv.includes("--runtime-scope"), `${kit} must not get --runtime-scope`);
    assert.ok(!argv.includes("--skip-runtime-assets"), `${kit} must not get --skip-runtime-assets`);
  }
  // The wiki step must always carry the headless flag.
  assert.ok(argvFor(h.spawnCalls, "sdtk-wiki").includes("--no-open"), "wiki gets --no-open");
});

// ── T4 — missing/invalid runtime → exit 2, zero spawns ──────────────────────
test("T4 missing runtime → exit 2, no spawns", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedInit({}, h.deps);
  assert.strictEqual(exitCode, 2);
  assert.strictEqual(h.spawnCalls.length, 0);
});
test("T4b invalid runtime → exit 2, no spawns", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedInit({ runtime: "bogus" }, h.deps);
  assert.strictEqual(exitCode, 2);
  assert.strictEqual(h.spawnCalls.length, 0);
});

// ── T5 — PowerShell missing → exit 3, zero spawns ───────────────────────────
test("T5 powershell missing → exit 3, no spawns", () => {
  const h = makeDeps({ psOk: false });
  const { exitCode } = runUnifiedInit({ runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 3);
  assert.strictEqual(h.spawnCalls.length, 0);
});

// ── T6 — order spec → ops → code → design → wiki → agent ────────────────────
test("T6 runs all six in registry order", () => {
  const h = makeDeps();
  runUnifiedInit({ runtime: "claude" }, h.deps);
  const order = h.spawnCalls.map((c) => c.toolkit);
  assert.deepStrictEqual(order, [
    "sdtk-spec",
    "sdtk-ops",
    "sdtk-code",
    "sdtk-design",
    "sdtk-wiki",
    "sdtk-agent",
  ]);
});

// ── T7 — fan-out does not abort on failure (BK-354 F-2) ─────────────────────
test("T7 fail-soft default: a middle failure does NOT abort the fan-out; exit = first failure", () => {
  const h = makeDeps({ failures: { "sdtk-code": 7 } });
  const { exitCode, results } = runUnifiedInit({ runtime: "claude" }, h.deps);
  // Aggregate exit is the first failure's code...
  assert.strictEqual(exitCode, 7);
  // ...but every remaining toolkit still ran (per-kit status table complete).
  const order = h.spawnCalls.map((c) => c.toolkit);
  assert.deepStrictEqual(
    order,
    ["sdtk-spec", "sdtk-ops", "sdtk-code", "sdtk-design", "sdtk-wiki", "sdtk-agent"]
  );
  assert.strictEqual(results.find((r) => r.name === "sdtk-code").status, "FAILED");
  assert.strictEqual(results.find((r) => r.name === "sdtk-agent").status, "OK",
    "the step after the failure (agent, 6/6) still runs");
  assert.strictEqual(results.length, 6, "every kit has a status row");
});

// ── T8 — --keep-going ───────────────────────────────────────────────────────
test("T8 keep-going: failure does not stop the rest; aggregate exit non-zero", () => {
  const h = makeDeps({ failures: { "sdtk-code": 5 } });
  const { exitCode, results } = runUnifiedInit({ runtime: "claude", keepGoing: true }, h.deps);
  assert.strictEqual(exitCode, 5);
  assert.strictEqual(h.spawnCalls.length, 6);
  const failed = results.find((r) => r.name === "sdtk-code");
  assert.strictEqual(failed.status, "FAILED");
  const wiki = results.find((r) => r.name === "sdtk-wiki");
  assert.strictEqual(wiki.status, "OK");
  const agent = results.find((r) => r.name === "sdtk-agent");
  assert.strictEqual(agent.status, "OK");
});

// ── T9 — unresolvable kit → exit 4 naming the kit, fan-out still completes ───
test("T9 unresolvable first kit → exit 4, names the kit, remaining kits still run", () => {
  const h = makeDeps({ unresolvable: new Set(["sdtk-spec-kit"]) });
  const { exitCode, results } = runUnifiedInit({ runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 4);
  // BK-354 F-2: an unresolvable kit is recorded FAILED and the fan-out continues.
  const order = h.spawnCalls.map((c) => c.toolkit);
  assert.deepStrictEqual(
    order,
    ["sdtk-ops", "sdtk-code", "sdtk-design", "sdtk-wiki", "sdtk-agent"]
  );
  assert.ok(results[0].statusLabel.includes("sdtk-spec-kit"), "kit named in status");
  assert.strictEqual(results.length, 6, "every kit has a status row");
});
test("T9b unresolvable kit with --keep-going continues, exit 4", () => {
  const h = makeDeps({ unresolvable: new Set(["sdtk-ops-kit"]) });
  const { exitCode } = runUnifiedInit({ runtime: "claude", keepGoing: true }, h.deps);
  assert.strictEqual(exitCode, 4);
  // spec + code + design + wiki + agent spawn; ops is skipped (unresolvable)
  const order = h.spawnCalls.map((c) => c.toolkit);
  assert.deepStrictEqual(order, ["sdtk-spec", "sdtk-code", "sdtk-design", "sdtk-wiki", "sdtk-agent"]);
});

// ── T10 — orchestrator only touches injected deps (no real fs/network/spawn) ─
test("T10 orchestrator uses only injected deps (no real host access)", () => {
  const h = makeDeps();
  // Spy spawn/resolveBin do no real I/O. A successful run that records exactly
  // the expected spy invocations proves the orchestrator never bypassed the seam.
  runUnifiedInit({ runtime: "claude" }, h.deps);
  assert.strictEqual(h.spawnCalls.length, 6, "all process work went through injected spawn");
  assert.deepStrictEqual(h.resolveCalls, [
    "sdtk-spec-kit",
    "sdtk-ops-kit",
    "sdtk-code-kit",
    "sdtk-design-kit",
    "sdtk-wiki-kit",
    "sdtk-agent-kit",
  ]);
  // buildInitArgs is pure: same input → same output, no side effects.
  const a = buildInitArgs(TOOLKITS[0], { runtime: "claude" });
  const b = buildInitArgs(TOOLKITS[0], { runtime: "claude" });
  assert.deepStrictEqual(a, b);
});

// ── T11 — --global shorthand maps to runtime-scope user ─────────────────────
test("T11 --global parses and maps to runtimeScope=user", () => {
  const flags = parseFlags(["--runtime", "claude", "--global"]);
  assert.strictEqual(flags.global, true);
  const opts = buildOpts(flags);
  assert.strictEqual(opts.runtimeScope, "user");
});
test("T11b explicit --runtime-scope wins over --global", () => {
  const opts = buildOpts(parseFlags(["--runtime", "codex", "--global", "--runtime-scope", "project"]));
  assert.strictEqual(opts.runtimeScope, "project");
});
test("T11c no scope flag leaves runtimeScope undefined (kits apply their default)", () => {
  const opts = buildOpts(parseFlags(["--runtime", "codex"]));
  assert.strictEqual(opts.runtimeScope, undefined);
});
test("T11d --global forwards --runtime-scope user to design (runtime-aware)", () => {
  const h = makeDeps();
  runUnifiedInit(buildOpts(parseFlags(["--runtime", "claude", "--global"])), h.deps);
  assert.deepStrictEqual(
    argvFor(h.spawnCalls, "sdtk-design"),
    ["init", "--runtime", "claude", "--runtime-scope", "user"]
  );
});

// ── T12 — BK-354 F-2: headless-safe fan-out completes 6/6 ───────────────────
test("T12 F-2: the wiki step is forwarded --no-open (headless-safe)", () => {
  const h = makeDeps();
  runUnifiedInit({ runtime: "claude", projectPath: "/tmp/p" }, h.deps);
  assert.ok(argvFor(h.spawnCalls, "sdtk-wiki").includes("--no-open"),
    "wiki init must run headless under the fan-out (no browser-open hang)");
  assert.ok(!argvFor(h.spawnCalls, "sdtk-agent").includes("--no-open"),
    "sdtk-agent starts no server and must not receive --no-open");
});
test("T12b F-2: a wiki failure does not skip the remaining steps; 6/6 reported", () => {
  // The dogfood repro: the wiki step failed in a headless box, and step 6/6
  // (sdtk-agent) never ran. It must now run, with a complete per-kit table.
  const h = makeDeps({ failures: { "sdtk-wiki": 1 } });
  const { exitCode, results } = runUnifiedInit({ runtime: "claude" }, h.deps);
  assert.strictEqual(h.spawnCalls.length, 6, "all six steps attempted (6/6)");
  assert.strictEqual(results.length, 6, "per-kit status table is complete");
  assert.strictEqual(results.find((r) => r.name === "sdtk-wiki").status, "FAILED");
  assert.strictEqual(results.find((r) => r.name === "sdtk-agent").status, "OK",
    "step 6/6 sdtk-agent runs even after the wiki step failed");
  assert.strictEqual(exitCode, 1);
});

// ── T13 — BK-354 F-2: maintainer-root pre-flight refuses before any spawn ────
test("T13 maintainer root → refused up front, zero spawns (no mutation)", () => {
  const h = makeDeps({ maintainerRoot: true });
  const { exitCode, results } = runUnifiedInit({ runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 5, "distinct maintainer-root exit code");
  assert.strictEqual(h.spawnCalls.length, 0, "no kit is spawned at the maintainer root");
  assert.strictEqual(results.length, 0);
  assert.ok(h.logs.some((l) => /maintainer/i.test(l)), "refusal names the maintainer root");
});
test("T13b non-maintainer project still runs the full fan-out", () => {
  const h = makeDeps({ maintainerRoot: false });
  const { exitCode } = runUnifiedInit({ runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 0);
  assert.strictEqual(h.spawnCalls.length, 6);
});

// ── runner ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`  ok  ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${t.name}`);
    console.error(`      ${err.message}`);
  }
}
console.log("");
console.log(`unified-init tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
