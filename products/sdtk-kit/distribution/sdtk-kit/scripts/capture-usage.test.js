#!/usr/bin/env node
"use strict";

// BK-377 — tests for the delegated-dispatch usage capture helper.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { extractUsage, appendUsage } = require("./agents/capture-usage");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("extractUsage normalizes a Claude headless result (modelUsage + usage)", () => {
  const result = {
    is_error: false,
    num_turns: 21,
    duration_ms: 104400,
    total_cost_usd: 0.7117,
    session_id: "abc",
    usage: { input_tokens: 42, output_tokens: 7399, cache_read_input_tokens: 1057872, cache_creation_input_tokens: 47207 },
    modelUsage: { "claude-sonnet-5": { inputTokens: 42, outputTokens: 7399, cacheReadInputTokens: 1057872, cacheCreationInputTokens: 47207, costUSD: 0.7117 } },
  };
  const e = extractUsage(result);
  assert.strictEqual(e.numTurns, 21);
  assert.strictEqual(e.totalCostUSD, 0.7117);
  assert.strictEqual(e.models.length, 1);
  assert.strictEqual(e.models[0].model, "claude-sonnet-5");
  assert.strictEqual(e.models[0].outputTokens, 7399);
  assert.strictEqual(e.usage.cacheReadInputTokens, 1057872);
  assert.strictEqual(e.sessionId, "abc");
});

test("extractUsage never throws on garbage / missing fields → zeros", () => {
  for (const bad of [null, undefined, 42, "x", {}, { modelUsage: "nope" }]) {
    const e = extractUsage(bad);
    assert.strictEqual(e.numTurns, 0);
    assert.strictEqual(e.totalCostUSD, 0);
    assert.deepStrictEqual(e.models, []);
  }
});

test("appendUsage writes an array and appends a second dispatch (rework round)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-capture-"));
  try {
    const f1 = appendUsage(root, "BK-371", "S3", extractUsage({ num_turns: 100 }));
    const f2 = appendUsage(root, "BK-371", "S3", extractUsage({ num_turns: 12 }));
    assert.strictEqual(f1, f2, "same stage file");
    const arr = JSON.parse(fs.readFileSync(f1, "utf8"));
    assert.strictEqual(arr.length, 2, "second dispatch appended, not overwritten");
    assert.strictEqual(arr[0].numTurns, 100);
    assert.strictEqual(arr[1].numTurns, 12);
    assert.ok(f1.endsWith(path.join("BK-371", "usage", "S3.json")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("[F4] appendUsage preserves a pre-existing non-array file to a .corrupt sidecar, never destroys it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-capture2-"));
  try {
    const dir = path.join(root, "BK-1", "usage");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "S1.json"), "not json at all");
    const f = appendUsage(root, "BK-1", "S1", extractUsage({ num_turns: 5 }));
    const arr = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.strictEqual(arr.length, 1);
    const sidecar = fs.readdirSync(dir).find((n) => n.startsWith("S1.corrupt."));
    assert.ok(sidecar, "original bytes preserved to a .corrupt sidecar");
    assert.strictEqual(fs.readFileSync(path.join(dir, sidecar), "utf8"), "not json at all");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("[F3] appendUsage rejects path-traversal in bk/stage (no writing outside the handoff tree)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-capture3-"));
  try {
    assert.throws(() => appendUsage(root, "../..", "S1", extractUsage({})), /unsafe bk/);
    assert.throws(() => appendUsage(root, "BK-1", "../package", extractUsage({})), /unsafe stage/);
    assert.throws(() => appendUsage(root, "BK/../x", "S1", extractUsage({})), /unsafe bk/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
