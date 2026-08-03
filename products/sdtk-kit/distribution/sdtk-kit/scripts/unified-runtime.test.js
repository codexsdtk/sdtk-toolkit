#!/usr/bin/env node
"use strict";

// Offline unit tests for the unified skills-only runtime orchestrator (BK-314).
// Mirrors unified-init.test.js: no real PowerShell, no child processes — every
// effectful dep (spawn / resolveBin / powershellCheck / log) is injected.

const assert = require("assert");
const {
  runUnifiedRuntime,
  buildRuntimeArgs,
  RUNTIME_SUBCOMMANDS,
} = require("../src/lib/unified-runtime");
const { ToolkitResolveError } = require("../src/lib/unified-init");
const { parseFlags, buildOpts } = require("../src/commands/runtime");

// The runtime family fans out to the runtime-aware kits only.
const RUNTIME_KITS = ["sdtk-spec", "sdtk-ops", "sdtk-code", "sdtk-design"];
const NON_RUNTIME_KITS = ["sdtk-wiki", "sdtk-agent"];

function makeDeps({ failures = {}, unresolvable = new Set(), psOk = true } = {}) {
  const spawnCalls = [];
  const logs = [];
  return {
    spawnCalls,
    logs,
    deps: {
      spawn(binPath, argv, toolkit) {
        spawnCalls.push({ binPath, argv, toolkit: toolkit.name });
        const code = failures[toolkit.name] || 0;
        return { status: code, stderr: code ? `stub stderr for ${toolkit.name}` : "" };
      },
      resolveBin(kitPkg, binName) {
        if (unresolvable.has(kitPkg)) {
          throw new ToolkitResolveError(kitPkg);
        }
        return `/stub/node_modules/${kitPkg}/bin/${binName}.js`;
      },
      powershellCheck() {
        return { ok: psOk, exe: "pwsh" };
      },
      log(line) {
        logs.push(line);
      },
    },
  };
}

function argvFor(spawnCalls, name) {
  const call = spawnCalls.find((c) => c.toolkit === name);
  return call ? call.argv : null;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ── R1 — install fans out to runtime kits only, minimal argv ────────────────
test("R1 install claude spawns exactly the four runtime kits with runtime install argv", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedRuntime("install", { runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 0);
  for (const kit of RUNTIME_KITS) {
    assert.deepStrictEqual(
      argvFor(h.spawnCalls, kit),
      ["runtime", "install", "--runtime", "claude"],
      `${kit} argv`
    );
  }
  for (const kit of NON_RUNTIME_KITS) {
    assert.strictEqual(argvFor(h.spawnCalls, kit), null, `${kit} must not be spawned`);
  }
});

// ── R2 — scope forwarded only when supplied ─────────────────────────────────
test("R2 explicit scope is forwarded to every runtime kit", () => {
  const h = makeDeps();
  runUnifiedRuntime("install", { runtime: "codex", scope: "user" }, h.deps);
  for (const kit of RUNTIME_KITS) {
    assert.deepStrictEqual(
      argvFor(h.spawnCalls, kit),
      ["runtime", "install", "--runtime", "codex", "--scope", "user"],
      `${kit} argv`
    );
  }
});

// ── R3 — per-subcommand flag forwarding ─────────────────────────────────────
test("R3 install forwards --force/--project-path/--verbose but never --all", () => {
  const h = makeDeps();
  runUnifiedRuntime(
    "install",
    { runtime: "claude", force: true, all: true, projectPath: "/tmp/p", verbose: true },
    h.deps
  );
  for (const kit of RUNTIME_KITS) {
    assert.deepStrictEqual(
      argvFor(h.spawnCalls, kit),
      ["runtime", "install", "--runtime", "claude", "--project-path", "/tmp/p", "--force", "--verbose"],
      `${kit} argv`
    );
  }
});

test("R3b uninstall forwards --all but never --force", () => {
  const h = makeDeps();
  runUnifiedRuntime("uninstall", { runtime: "claude", all: true, force: true }, h.deps);
  for (const kit of RUNTIME_KITS) {
    assert.deepStrictEqual(
      argvFor(h.spawnCalls, kit),
      ["runtime", "uninstall", "--runtime", "claude", "--all"],
      `${kit} argv`
    );
  }
});

test("R3c status forwards --project-path only (no --force/--all)", () => {
  const h = makeDeps();
  runUnifiedRuntime(
    "status",
    { runtime: "claude", projectPath: "/tmp/p", force: true, all: true },
    h.deps
  );
  for (const kit of RUNTIME_KITS) {
    assert.deepStrictEqual(
      argvFor(h.spawnCalls, kit),
      ["runtime", "status", "--runtime", "claude", "--project-path", "/tmp/p"],
      `${kit} argv`
    );
  }
});

// ── R4 — validation, no spawns ──────────────────────────────────────────────
test("R4 missing runtime → exit 2, no spawns", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedRuntime("install", {}, h.deps);
  assert.strictEqual(exitCode, 2);
  assert.strictEqual(h.spawnCalls.length, 0);
});

test("R4b invalid runtime → exit 2, no spawns", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedRuntime("install", { runtime: "bogus" }, h.deps);
  assert.strictEqual(exitCode, 2);
  assert.strictEqual(h.spawnCalls.length, 0);
});

test("R4c invalid subcommand → exit 2, no spawns", () => {
  const h = makeDeps();
  const { exitCode } = runUnifiedRuntime("bogus", { runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 2);
  assert.strictEqual(h.spawnCalls.length, 0);
});

// ── R5 — PowerShell pre-flight applies to install/uninstall, not status ─────
test("R5 powershell missing → exit 3 for install and uninstall, no spawns", () => {
  for (const sub of ["install", "uninstall"]) {
    const h = makeDeps({ psOk: false });
    const { exitCode } = runUnifiedRuntime(sub, { runtime: "claude" }, h.deps);
    assert.strictEqual(exitCode, 3, `${sub} exit`);
    assert.strictEqual(h.spawnCalls.length, 0, `${sub} spawns`);
  }
});

test("R5b status runs without PowerShell (pure reads in every kit)", () => {
  const h = makeDeps({ psOk: false });
  const { exitCode } = runUnifiedRuntime("status", { runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 0);
  assert.strictEqual(h.spawnCalls.length, RUNTIME_KITS.length);
});

// ── R6 — order + skipped summary rows ───────────────────────────────────────
test("R6 registry order spec→ops→code→design; wiki/agent get skipped summary rows", () => {
  const h = makeDeps();
  const { results } = runUnifiedRuntime("install", { runtime: "claude" }, h.deps);
  assert.deepStrictEqual(
    h.spawnCalls.map((c) => c.toolkit),
    RUNTIME_KITS
  );
  assert.deepStrictEqual(
    results.map((r) => r.name),
    [...RUNTIME_KITS, ...NON_RUNTIME_KITS]
  );
  const summary = h.logs.join("\n");
  for (const kit of NON_RUNTIME_KITS) {
    assert.ok(summary.includes(`${kit}`), `${kit} in summary`);
  }
  assert.ok(summary.includes("skipped (no skills)"), "skip label in summary");
});

// ── R7/R8 — fail-fast vs keep-going ─────────────────────────────────────────
test("R7 fail-fast: middle failure stops later kits, exit = child code", () => {
  const h = makeDeps({ failures: { "sdtk-ops": 5 } });
  const { exitCode } = runUnifiedRuntime("install", { runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 5);
  assert.deepStrictEqual(
    h.spawnCalls.map((c) => c.toolkit),
    ["sdtk-spec", "sdtk-ops"]
  );
});

test("R8 keep-going: failure does not stop the rest; exit = first failure", () => {
  const h = makeDeps({ failures: { "sdtk-ops": 5 } });
  const { exitCode } = runUnifiedRuntime(
    "install",
    { runtime: "claude", keepGoing: true },
    h.deps
  );
  assert.strictEqual(exitCode, 5);
  assert.deepStrictEqual(h.spawnCalls.map((c) => c.toolkit), RUNTIME_KITS);
});

// ── R9 — unresolvable kit ───────────────────────────────────────────────────
test("R9 unresolvable kit → exit 4, fail-fast stops there", () => {
  const h = makeDeps({ unresolvable: new Set(["sdtk-code-kit"]) });
  const { exitCode } = runUnifiedRuntime("install", { runtime: "claude" }, h.deps);
  assert.strictEqual(exitCode, 4);
  assert.deepStrictEqual(
    h.spawnCalls.map((c) => c.toolkit),
    ["sdtk-spec", "sdtk-ops"]
  );
});

// ── R10 — orchestrator uses only injected deps ──────────────────────────────
test("R10 buildRuntimeArgs is pure and subcommand-aware", () => {
  assert.deepStrictEqual(
    buildRuntimeArgs("install", { runtime: "claude", scope: "project", force: true }),
    ["runtime", "install", "--runtime", "claude", "--scope", "project", "--force"]
  );
  assert.deepStrictEqual(
    buildRuntimeArgs("uninstall", { runtime: "codex", all: true }),
    ["runtime", "uninstall", "--runtime", "codex", "--all"]
  );
  assert.deepStrictEqual(RUNTIME_SUBCOMMANDS, ["install", "uninstall", "status"]);
});

// ── R11 — umbrella flag parsing (--global shorthand, --scope wins) ──────────
test("R11 --global maps to scope user; explicit --scope wins over --global", () => {
  assert.strictEqual(buildOpts(parseFlags(["--runtime", "claude", "--global"])).scope, "user");
  assert.strictEqual(
    buildOpts(parseFlags(["--runtime", "claude", "--global", "--scope", "project"])).scope,
    "project"
  );
  assert.strictEqual(buildOpts(parseFlags(["--runtime", "claude"])).scope, undefined);
});

test("R11b unknown flag rejected by the umbrella runtime parser", () => {
  assert.throws(() => parseFlags(["--runtime", "claude", "--bogus"]), /Unknown flag/);
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
console.log(`unified-runtime tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
