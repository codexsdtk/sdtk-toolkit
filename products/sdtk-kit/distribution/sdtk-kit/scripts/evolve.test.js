#!/usr/bin/env node
"use strict";

// Offline unit tests for the `sdtk evolve` state machine (BK-316 PR-B).
// Real fs on throwaway temp dirs; no network, no child processes.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  DRAFT_SCHEMA,
  LANES,
  EDIT_BUDGET,
  LEARNED_LINE_CAP,
  validateDraft,
  scanForSecrets,
  stageDraft,
  latestStaging,
  adoptStaging,
  revertLastAdopt,
  buildStatus,
} = require("../src/lib/evolve");

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-evolve-test-"));
}

function draft(overrides = {}) {
  return {
    schema: "sdtk.evolve-draft.v1",
    generated_at: "2026-07-10T00:00:00Z",
    harvest: { sources: ["claude"], sessions_scanned: 3, since: null, codex: "skipped (pending #247)" },
    recurrence: [],
    edits: [
      {
        op: "add",
        lane: "CODE",
        content: "Verify the current branch inside the same command as every commit.",
        evidence: ["session 2026-07-08: user corrected branch mixups, 3 occurrences"],
        bet: "code:git:branch-mixup stops appearing",
        signature: "code:git:branch-mixup",
      },
    ],
    ...overrides,
  };
}

function writeDraft(dir, d) {
  const p = path.join(dir, "draft.json");
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
  return p;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ── validation ───────────────────────────────────────────────────────────────
test("V1 valid draft passes validation", () => {
  const errs = validateDraft(draft());
  assert.deepStrictEqual(errs, []);
});

test("V2 budget: more than 4 edits refused", () => {
  const e = draft().edits[0];
  const errs = validateDraft(draft({ edits: [e, e, e, e, e] }));
  assert.ok(errs.some((m) => m.includes("at most 4")), errs.join("; "));
});

test("V3 bad op / bad lane / bad schema refused", () => {
  assert.ok(validateDraft(draft({ schema: "nope" })).length > 0);
  const bad1 = draft(); bad1.edits[0].op = "rewrite";
  assert.ok(validateDraft(bad1).length > 0);
  const bad2 = draft(); bad2.edits[0].lane = "MISC";
  assert.ok(validateDraft(bad2).length > 0);
});

test("V4 missing evidence/bet/signature refused (pre-registered bet rule)", () => {
  for (const field of ["evidence", "bet", "signature"]) {
    const d = draft();
    delete d.edits[0][field];
    const errs = validateDraft(d);
    assert.ok(errs.some((m) => m.includes(field)), `${field}: ${errs.join("; ")}`);
  }
});

test("V5 delete/replace require an anchor", () => {
  const d = draft();
  d.edits[0].op = "replace";
  const errs = validateDraft(d);
  assert.ok(errs.some((m) => m.includes("anchor")), errs.join("; "));
});

// ── redaction (fail-closed) ──────────────────────────────────────────────────
test("R1 secret-looking content is detected", () => {
  const hits = scanForSecrets({ note: "use Bearer abcdefghijklmnop1234 please" });
  assert.ok(hits.length > 0);
  assert.ok(scanForSecrets({ k: "sk-abcdefghijklmnop1234567890" }).length > 0);
  assert.ok(scanForSecrets({ k: "ghp_abcdefghijklmnopqrstuvwx1234" }).length > 0);
  assert.ok(scanForSecrets({ k: "AKIAABCDEFGHIJKLMNOP" }).length > 0);
  assert.ok(scanForSecrets({ k: "-----BEGIN RSA PRIVATE KEY-----" }).length > 0);
});

test("R2 clean draft has no hits; hits name the path, not the secret", () => {
  assert.deepStrictEqual(scanForSecrets(draft()), []);
  const hits = scanForSecrets({ edits: [{ content: "token ghp_abcdefghijklmnopqrstuvwx1234" }] });
  assert.ok(hits[0].includes("edits[0].content"));
  assert.ok(!hits[0].includes("ghp_abcdefghijklmnopqrstuvwx1234"));
});

test("R3 stage refuses a secret-bearing draft and writes nothing", () => {
  const proj = tmpProject();
  const d = draft();
  d.edits[0].content = "always send ghp_abcdefghijklmnopqrstuvwx1234 first";
  const res = stageDraft(proj, writeDraft(proj, d));
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.some((m) => m.toLowerCase().includes("redaction")), res.errors.join("; "));
  assert.ok(!fs.existsSync(path.join(proj, ".sdtk", "evolve", "staging")));
});

// ── stage ────────────────────────────────────────────────────────────────────
test("S1 stage writes proposal.md + edits.json + report.md under staging/<ts>", () => {
  const proj = tmpProject();
  const res = stageDraft(proj, writeDraft(proj, draft()));
  assert.strictEqual(res.ok, true, (res.errors || []).join("; "));
  for (const f of ["proposal.md", "edits.json", "report.md"]) {
    assert.ok(fs.existsSync(path.join(res.stagingDir, f)), f);
  }
  const report = fs.readFileSync(path.join(res.stagingDir, "report.md"), "utf8");
  assert.ok(report.includes("sdtk evolve adopt"));
});

test("S2 cap rule: over-cap LEARNED.md refuses add-only drafts", () => {
  const proj = tmpProject();
  const learned = path.join(proj, ".sdtk", "evolve", "LEARNED.md");
  fs.mkdirSync(path.dirname(learned), { recursive: true });
  fs.writeFileSync(learned, Array.from({ length: LEARNED_LINE_CAP + 5 }, (_, i) => `- line ${i}`).join("\n"));
  const res = stageDraft(proj, writeDraft(proj, draft()));
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.some((m) => m.includes(String(LEARNED_LINE_CAP))), res.errors.join("; "));
});

test("S3 FAILING-twice rule: repeat-FAILING lesson without a delete/replace is refused", () => {
  const proj = tmpProject();
  const failRec = [{ lesson_id: "L-001", signature: "code:x:y", before: "3/8", after: "2/9", verdict: "FAILING" }];
  // first staging reports the lesson FAILING once — allowed
  const first = stageDraft(proj, writeDraft(proj, draft({ recurrence: failRec })));
  assert.strictEqual(first.ok, true, (first.errors || []).join("; "));
  // second cycle still FAILING, draft only adds → refused
  const second = stageDraft(proj, writeDraft(proj, draft({ recurrence: failRec })));
  assert.strictEqual(second.ok, false);
  assert.ok(second.errors.some((m) => m.includes("FAILING")), second.errors.join("; "));
  // with a replace targeting the failing signature → accepted
  const d = draft({ recurrence: failRec });
  d.edits.push({
    op: "replace", lane: "CODE", anchor: "old lesson text",
    content: "better lesson", evidence: ["e"], bet: "b", signature: "code:x:y",
  });
  const third = stageDraft(proj, writeDraft(proj, d));
  assert.strictEqual(third.ok, true, (third.errors || []).join("; "));
});

// ── adopt / revert ───────────────────────────────────────────────────────────
test("A1 adopt scaffolds LEARNED.md with lane sections, applies add, backs up, records state", () => {
  const proj = tmpProject();
  const staged = stageDraft(proj, writeDraft(proj, draft()));
  const res = adoptStaging(proj, staged.stagingDir);
  assert.strictEqual(res.ok, true, (res.errors || []).join("; "));
  const learned = fs.readFileSync(path.join(proj, ".sdtk", "evolve", "LEARNED.md"), "utf8");
  for (const lane of LANES) {
    assert.ok(learned.includes(`## ${lane}`), lane);
  }
  assert.ok(learned.includes("Verify the current branch"));
  assert.ok(fs.existsSync(path.join(staged.stagingDir, "backup")));
  const state = JSON.parse(fs.readFileSync(path.join(proj, ".sdtk", "evolve", "state.json"), "utf8"));
  assert.strictEqual(state.lessons.length, 1);
  assert.strictEqual(state.lessons[0].id, "L-001");
  assert.strictEqual(state.lessons[0].signature, "code:git:branch-mixup");
});

test("A2 duplicate add is skipped (normalized dedupe); delete and replace hit anchors", () => {
  const proj = tmpProject();
  const s1 = stageDraft(proj, writeDraft(proj, draft()));
  adoptStaging(proj, s1.stagingDir);
  // duplicate add → applied count 0 for that edit
  const s2 = stageDraft(proj, writeDraft(proj, draft()));
  const r2 = adoptStaging(proj, s2.stagingDir);
  assert.strictEqual(r2.applied, 0);
  // replace then delete
  const dRep = draft();
  dRep.edits = [{
    op: "replace", lane: "CODE", anchor: "verify the current branch",
    content: "Always verify branch in the same shell command as commit and push.",
    evidence: ["e"], bet: "b", signature: "code:git:branch-mixup",
  }];
  const s3 = stageDraft(proj, writeDraft(proj, dRep));
  const r3 = adoptStaging(proj, s3.stagingDir);
  assert.strictEqual(r3.applied, 1);
  let learned = fs.readFileSync(path.join(proj, ".sdtk", "evolve", "LEARNED.md"), "utf8");
  assert.ok(learned.includes("same shell command"));
  const dDel = draft();
  dDel.edits = [{
    op: "delete", lane: "CODE", anchor: "same shell command",
    content: "", evidence: ["e"], bet: "b", signature: "code:git:branch-mixup",
  }];
  const s4 = stageDraft(proj, writeDraft(proj, dDel));
  const r4 = adoptStaging(proj, s4.stagingDir);
  assert.strictEqual(r4.applied, 1);
  learned = fs.readFileSync(path.join(proj, ".sdtk", "evolve", "LEARNED.md"), "utf8");
  assert.ok(!learned.includes("same shell command"));
});

test("A2b adopted bullet keeps a blank line before the next lane heading", () => {
  const proj = tmpProject();
  const s1 = stageDraft(proj, writeDraft(proj, draft()));
  adoptStaging(proj, s1.stagingDir);
  const learned = fs.readFileSync(path.join(proj, ".sdtk", "evolve", "LEARNED.md"), "utf8");
  assert.ok(!/^- .*\n## /m.test(learned), "bullet must not butt directly against the next heading");
});

test("A3 revert restores the exact pre-adopt LEARNED.md and state", () => {
  const proj = tmpProject();
  const s1 = stageDraft(proj, writeDraft(proj, draft()));
  adoptStaging(proj, s1.stagingDir);
  const before = fs.readFileSync(path.join(proj, ".sdtk", "evolve", "LEARNED.md"), "utf8");
  const d2 = draft();
  d2.edits[0].content = "A second, different lesson bullet.";
  d2.edits[0].signature = "code:other:thing";
  const s2 = stageDraft(proj, writeDraft(proj, d2));
  adoptStaging(proj, s2.stagingDir);
  const res = revertLastAdopt(proj);
  assert.strictEqual(res.ok, true, (res.errors || []).join("; "));
  const after = fs.readFileSync(path.join(proj, ".sdtk", "evolve", "LEARNED.md"), "utf8");
  assert.strictEqual(after, before);
});

test("A4 adopt refuses when no staging exists; revert refuses without a backup", () => {
  const proj = tmpProject();
  assert.strictEqual(adoptStaging(proj, latestStaging(proj)).ok, false);
  assert.strictEqual(revertLastAdopt(proj).ok, false);
});

// ── status ───────────────────────────────────────────────────────────────────
test("T1 status is truthful before init and after adopt", () => {
  const proj = tmpProject();
  const empty = buildStatus(proj);
  assert.strictEqual(empty.learnedExists, false);
  assert.strictEqual(empty.lessons, 0);
  const s1 = stageDraft(proj, writeDraft(proj, draft()));
  adoptStaging(proj, s1.stagingDir);
  const st = buildStatus(proj);
  assert.strictEqual(st.learnedExists, true);
  assert.strictEqual(st.lessons, 1);
  assert.ok(st.learnedLines > 0);
  assert.strictEqual(st.lineCap, LEARNED_LINE_CAP);
  assert.ok(["tracked", "ignored", "n/a"].includes(st.gitPosture));
  assert.strictEqual(typeof st.checkpointDue, "boolean");
});

test("T2 exported constants match the locked spec", () => {
  assert.strictEqual(DRAFT_SCHEMA, "sdtk.evolve-draft.v1");
  assert.strictEqual(EDIT_BUDGET, 4);
  assert.strictEqual(LEARNED_LINE_CAP, 150);
  assert.deepStrictEqual(LANES, ["Chung", "SPEC", "CODE", "OPS", "DESIGN"]);
});

// ── runner ───────────────────────────────────────────────────────────────────
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
console.log(`evolve tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
