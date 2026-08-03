"use strict";

// `sdtk evolve` state machine (BK-316 PR-B) — the single writer of the local
// self-improvement loop's live state. The `/evolve` skill (sdtk-spec-kit)
// harvests and reflects in-session and hands a draft here; this module
// validates it fail-closed, stages it for human review, and applies it only
// through the explicit human `adopt` (no auto-adopt exists anywhere).
//
// Layout under <project>/.sdtk/evolve/:
//   LEARNED.md            adopted lessons (lane sections; read at session start
//                         via the CLAUDE/CODEX template pointer)
//   staging/<ts>/         proposal.md + edits.json + report.md (+ backup/ at adopt)
//   state.json            adopted-lesson registry (ids, signatures, dates)
//
// Zero deps, no network, no child processes. Pure fs.

const fs = require("fs");
const path = require("path");

const DRAFT_SCHEMA = "sdtk.evolve-draft.v1";
const LANES = Object.freeze(["Chung", "SPEC", "CODE", "OPS", "DESIGN"]);
const EDIT_BUDGET = 4;
const LEARNED_LINE_CAP = 150;
const VALID_OPS = Object.freeze(["add", "delete", "replace"]);

const LEARNED_HEADER = [
  "# SDTK Learned Lessons",
  "",
  "_Locally learned, owner-approved lessons. Managed by the `/evolve` skill +",
  "`sdtk evolve`; proposed offline, adopted only by an explicit human",
  "`sdtk evolve adopt`. Never edit this file directly — stage an edit instead._",
  "",
].join("\n");

// Deny-list secret patterns (floor, not ceiling). A hit anywhere in a draft
// refuses the stage write entirely — fail-closed, never scrub-and-continue.
const SECRET_PATTERNS = [
  /bearer\s+[a-z0-9._-]{16,}/i,
  /sk-[a-z0-9]{16,}/i,
  /ghp_[a-z0-9]{20,}/i,
  /gho_[a-z0-9]{20,}/i,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[a-z0-9_\-./+]{12,}/i,
];

// ── paths ────────────────────────────────────────────────────────────────────

function evolveRoot(projectPath) {
  return path.join(path.resolve(projectPath || process.cwd()), ".sdtk", "evolve");
}

function learnedPath(projectPath) {
  return path.join(evolveRoot(projectPath), "LEARNED.md");
}

function statePath(projectPath) {
  return path.join(evolveRoot(projectPath), "state.json");
}

function stagingRoot(projectPath) {
  return path.join(evolveRoot(projectPath), "staging");
}

function readState(projectPath) {
  try {
    return JSON.parse(fs.readFileSync(statePath(projectPath), "utf8"));
  } catch {
    return { schema: "sdtk.evolve-state.v1", counter: 0, lessons: [], last_adopt_staging: "" };
  }
}

function writeState(projectPath, state) {
  fs.mkdirSync(evolveRoot(projectPath), { recursive: true });
  fs.writeFileSync(statePath(projectPath), `${JSON.stringify(state, null, 2)}\n`);
}

// ── validation ───────────────────────────────────────────────────────────────

function validateDraft(draft) {
  const errors = [];
  if (!draft || typeof draft !== "object") {
    return ["draft is not an object"];
  }
  if (draft.schema !== DRAFT_SCHEMA) {
    errors.push(`schema must be "${DRAFT_SCHEMA}"`);
  }
  const edits = Array.isArray(draft.edits) ? draft.edits : null;
  if (!edits || edits.length === 0) {
    errors.push("edits must be a non-empty array");
    return errors;
  }
  if (edits.length > EDIT_BUDGET) {
    errors.push(`edit budget exceeded: at most ${EDIT_BUDGET} edits per cycle (got ${edits.length})`);
  }
  edits.forEach((e, i) => {
    const at = `edits[${i}]`;
    if (!VALID_OPS.includes(e.op)) {
      errors.push(`${at}.op must be one of: ${VALID_OPS.join(", ")}`);
    }
    if (!LANES.includes(e.lane)) {
      errors.push(`${at}.lane must be one of: ${LANES.join(", ")}`);
    }
    if ((e.op === "add" || e.op === "replace") && !(typeof e.content === "string" && e.content.trim())) {
      errors.push(`${at}.content is required for ${e.op}`);
    }
    if ((e.op === "delete" || e.op === "replace") && !(typeof e.anchor === "string" && e.anchor.trim())) {
      errors.push(`${at}.anchor is required for ${e.op}`);
    }
    if (!Array.isArray(e.evidence) || e.evidence.length === 0) {
      errors.push(`${at}.evidence is required (which sessions, how many occurrences)`);
    }
    if (!(typeof e.bet === "string" && e.bet.trim())) {
      errors.push(`${at}.bet is required (the pre-registered falsifiable bet)`);
    }
    if (!(typeof e.signature === "string" && e.signature.trim())) {
      errors.push(`${at}.signature is required (friction signature for recurrence scoring)`);
    }
  });
  return errors;
}

// Walk every string in the draft; report JSON-paths of secret hits WITHOUT
// echoing the matched content.
function scanForSecrets(value, at = "", hits = []) {
  if (typeof value === "string") {
    if (SECRET_PATTERNS.some((re) => re.test(value))) {
      hits.push(`${at || "<root>"}: secret-pattern match`);
    }
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanForSecrets(v, `${at}[${i}]`, hits));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      scanForSecrets(v, at ? `${at}.${k}` : k, hits);
    }
  }
  return hits;
}

// ── staging ──────────────────────────────────────────────────────────────────

function listStagings(projectPath) {
  const root = stagingRoot(projectPath);
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name))
    .sort();
}

function latestStaging(projectPath) {
  const all = listStagings(projectPath);
  return all.length ? all[all.length - 1] : null;
}

function newStagingDir(projectPath) {
  const root = stagingRoot(projectPath);
  fs.mkdirSync(root, { recursive: true });
  const base = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  for (let seq = 1; ; seq += 1) {
    const dir = path.join(root, `${base}_${String(seq).padStart(2, "0")}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
      return dir;
    }
  }
}

function readStagingDraft(stagingDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(stagingDir, "edits.json"), "utf8"));
  } catch {
    return null;
  }
}

function learnedLineCount(projectPath) {
  try {
    return fs.readFileSync(learnedPath(projectPath), "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

function renderRecurrenceTable(recurrence) {
  if (!Array.isArray(recurrence) || recurrence.length === 0) {
    return "_No adopted lessons to score yet._";
  }
  const rows = recurrence.map((r) =>
    `| ${r.lesson_id || "-"} | \`${r.signature || "-"}\` | ${r.before || "-"} | ${r.after || "-"} | **${r.verdict || "-"}** |`);
  return [
    "| Lesson | Signature | Before | After | Verdict |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function renderProposal(draft) {
  const lines = ["# SDTK Evolve — staged proposal", ""];
  draft.edits.forEach((e, i) => {
    lines.push(`## Edit ${i + 1}: ${e.op} → \`## ${e.lane}\``);
    if (e.anchor) {
      lines.push(`- anchor: \`${e.anchor}\``);
    }
    if (e.content) {
      lines.push(`- content: ${e.content}`);
    }
    lines.push(`- evidence: ${(e.evidence || []).join(" · ")}`);
    lines.push(`- bet: ${e.bet}`);
    lines.push(`- signature: \`${e.signature}\``);
    lines.push("");
  });
  return lines.join("\n");
}

function renderReport(draft) {
  const h = draft.harvest || {};
  return [
    "# SDTK Evolve — cycle report",
    "",
    `- generated: ${draft.generated_at || "-"}`,
    `- harvest sources: ${(h.sources || []).join(", ") || "-"} (sessions: ${h.sessions_scanned ?? "-"}, codex: ${h.codex || "-"})`,
    `- proposed edits: ${draft.edits.length} (budget ${EDIT_BUDGET})`,
    "",
    "## Recurrence scorecard",
    "",
    renderRecurrenceTable(draft.recurrence),
    "",
    "_Review the proposal, then run `sdtk evolve adopt` to apply (a backup is",
    "taken automatically) or delete this staging folder to discard._",
    "",
  ].join("\n");
}

function stageDraft(projectPath, draftPath) {
  let draft;
  try {
    draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  } catch (err) {
    return { ok: false, errors: [`cannot read draft: ${err.message}`] };
  }

  const errors = validateDraft(draft);
  if (errors.length) {
    return { ok: false, errors };
  }

  const secretHits = scanForSecrets(draft);
  if (secretHits.length) {
    return {
      ok: false,
      errors: secretHits.map((h) => `redaction (fail-closed): ${h} — remove or describe instead of copying`),
    };
  }

  // Cap rule (D-2): over-cap LEARNED.md requires delete/replace before add.
  const hasAdd = draft.edits.some((e) => e.op === "add");
  const hasPrune = draft.edits.some((e) => e.op === "delete" || e.op === "replace");
  if (hasAdd && !hasPrune && learnedLineCount(projectPath) > LEARNED_LINE_CAP) {
    return {
      ok: false,
      errors: [
        `LEARNED.md is over the ${LEARNED_LINE_CAP}-line cap: propose delete/replace edits before any add`,
      ],
    };
  }

  // FAILING-twice rule (§8 tier 2): a lesson FAILING in this draft AND in the
  // most recent staged cycle must receive a delete/replace targeting its
  // signature before any new add-only cycle is accepted.
  const prevDraft = readStagingDraft(latestStaging(projectPath) || "");
  const prevFailing = new Set(
    ((prevDraft && prevDraft.recurrence) || [])
      .filter((r) => r.verdict === "FAILING")
      .map((r) => r.signature)
  );
  const repeatFailing = ((draft.recurrence || []))
    .filter((r) => r.verdict === "FAILING" && prevFailing.has(r.signature))
    .map((r) => r.signature);
  const prunedSignatures = new Set(
    draft.edits.filter((e) => e.op === "delete" || e.op === "replace").map((e) => e.signature)
  );
  const unpruned = repeatFailing.filter((sig) => !prunedSignatures.has(sig));
  if (unpruned.length) {
    return {
      ok: false,
      errors: unpruned.map(
        (sig) => `lesson \`${sig}\` is FAILING for a second consecutive cycle: propose a replace/delete for it before adding new lessons`
      ),
    };
  }

  const stagingDir = newStagingDir(projectPath);
  fs.writeFileSync(path.join(stagingDir, "edits.json"), `${JSON.stringify(draft, null, 2)}\n`);
  fs.writeFileSync(path.join(stagingDir, "proposal.md"), renderProposal(draft));
  fs.writeFileSync(path.join(stagingDir, "report.md"), renderReport(draft));
  return { ok: true, stagingDir, edits: draft.edits.length };
}

// ── learned-document surgery ─────────────────────────────────────────────────

function scaffoldLearned() {
  return `${LEARNED_HEADER}\n${LANES.map((l) => `## ${l}\n`).join("\n")}`;
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Apply one bounded edit to the learned doc. Returns the new doc, or null when
// the edit is a no-op (duplicate add / anchor not found).
function applyEdit(doc, edit) {
  const lines = doc.split("\n");
  if (edit.op === "add") {
    const exists = lines.some((ln) => ln.startsWith("- ") && norm(ln.slice(2)) === norm(edit.content));
    if (exists) {
      return null;
    }
    const heading = `## ${edit.lane}`;
    const idx = lines.findIndex((ln) => ln.trim() === heading);
    if (idx === -1) {
      lines.push("", heading, `- ${edit.content.trim()}`);
      return lines.join("\n");
    }
    // insert after the last bullet already under this lane heading
    let insertAt = idx + 1;
    for (let i = idx + 1; i < lines.length; i += 1) {
      if (lines[i].startsWith("## ")) {
        break;
      }
      if (lines[i].startsWith("- ") || lines[i].trim() === "") {
        insertAt = i + 1;
      }
    }
    lines.splice(insertAt, 0, `- ${edit.content.trim()}`);
    // keep a blank separator so the bullet never butts against the next heading
    if (insertAt + 1 < lines.length && lines[insertAt + 1].startsWith("## ")) {
      lines.splice(insertAt + 1, 0, "");
    }
    return lines.join("\n");
  }

  const anchor = norm(edit.anchor);
  const hit = lines.findIndex((ln) => ln.startsWith("- ") && norm(ln).includes(anchor));
  if (hit === -1) {
    return null;
  }
  if (edit.op === "delete") {
    lines.splice(hit, 1);
  } else {
    lines[hit] = `- ${edit.content.trim()}`;
  }
  return lines.join("\n");
}

// ── adopt / revert ───────────────────────────────────────────────────────────

function adoptStaging(projectPath, stagingDir) {
  if (!stagingDir || !fs.existsSync(stagingDir)) {
    return { ok: false, errors: ["no staged proposal found — run the /evolve skill, then `sdtk evolve stage`"] };
  }
  const draft = readStagingDraft(stagingDir);
  if (!draft) {
    return { ok: false, errors: [`staging has no readable edits.json: ${stagingDir}`] };
  }

  const lPath = learnedPath(projectPath);
  const sPath = statePath(projectPath);
  const state = readState(projectPath);

  // Backup BEFORE applying — revert restores exactly this.
  const backupDir = path.join(stagingDir, "backup");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "LEARNED.md"),
    fs.existsSync(lPath) ? fs.readFileSync(lPath, "utf8") : scaffoldLearned()
  );
  fs.writeFileSync(path.join(backupDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);

  let doc = fs.existsSync(lPath) ? fs.readFileSync(lPath, "utf8") : scaffoldLearned();
  let applied = 0;
  const now = new Date().toISOString();

  for (const edit of draft.edits) {
    const next = applyEdit(doc, edit);
    if (next === null) {
      continue;
    }
    doc = next;
    applied += 1;
    if ((edit.op === "add" || edit.op === "replace") && !state.lessons.some((l) => l.signature === edit.signature)) {
      state.counter += 1;
      state.lessons.push({
        id: `L-${String(state.counter).padStart(3, "0")}`,
        signature: edit.signature,
        lane: edit.lane,
        bet: edit.bet,
        adopted_at: now,
        staging: path.basename(stagingDir),
      });
    }
    if (edit.op === "delete") {
      state.lessons = state.lessons.filter((l) => l.signature !== edit.signature);
    }
  }

  fs.mkdirSync(evolveRoot(projectPath), { recursive: true });
  fs.writeFileSync(lPath, doc.endsWith("\n") ? doc : `${doc}\n`);
  state.last_adopt_staging = stagingDir;
  writeState(projectPath, state);
  return { ok: true, applied, skipped: draft.edits.length - applied, learnedPath: lPath, backupDir };
}

function revertLastAdopt(projectPath) {
  const state = readState(projectPath);
  const stagingDir = state.last_adopt_staging;
  const backupDir = stagingDir ? path.join(stagingDir, "backup") : "";
  if (!backupDir || !fs.existsSync(path.join(backupDir, "LEARNED.md"))) {
    return { ok: false, errors: ["no adopt backup found — nothing to revert"] };
  }
  fs.writeFileSync(learnedPath(projectPath), fs.readFileSync(path.join(backupDir, "LEARNED.md"), "utf8"));
  fs.writeFileSync(statePath(projectPath), fs.readFileSync(path.join(backupDir, "state.json"), "utf8"));
  return { ok: true, restoredFrom: backupDir };
}

// ── status ───────────────────────────────────────────────────────────────────

// Heuristic git posture without spawning git: n/a outside a repo; ignored when
// a root .gitignore line covers .sdtk or .sdtk/evolve; tracked otherwise.
function gitPosture(projectPath) {
  const root = path.resolve(projectPath || process.cwd());
  let dir = root;
  let repoRoot = null;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      repoRoot = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  if (!repoRoot) {
    return "n/a";
  }
  try {
    const ignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
    const covers = ignore.split("\n").map((l) => l.trim()).some((l) =>
      ["/.sdtk", ".sdtk", ".sdtk/", "/.sdtk/", ".sdtk/*", ".sdtk/evolve", ".sdtk/evolve/"].includes(l)
      || l === ".sdtk/evolve/LEARNED.md"
    );
    return covers ? "ignored" : "tracked";
  } catch {
    return "tracked";
  }
}

const CHECKPOINT_DAYS = 28;

function buildStatus(projectPath) {
  const state = readState(projectPath);
  const lPath = learnedPath(projectPath);
  const learnedExists = fs.existsSync(lPath);
  const firstAdopt = state.lessons.length ? state.lessons[0].adopted_at : null;
  const checkpointDue = Boolean(
    firstAdopt && Date.now() - Date.parse(firstAdopt) >= CHECKPOINT_DAYS * 24 * 3600 * 1000
  );
  const latest = latestStaging(projectPath);
  return {
    learnedExists,
    learnedLines: learnedExists ? fs.readFileSync(lPath, "utf8").split("\n").length : 0,
    lineCap: LEARNED_LINE_CAP,
    lessons: state.lessons.length,
    lessonRows: state.lessons,
    latestStaging: latest ? path.basename(latest) : null,
    lastAdoptStaging: state.last_adopt_staging ? path.basename(state.last_adopt_staging) : null,
    gitPosture: gitPosture(projectPath),
    checkpointDue,
    checkpointDays: CHECKPOINT_DAYS,
    firstAdoptedAt: firstAdopt,
  };
}

module.exports = {
  DRAFT_SCHEMA,
  LANES,
  EDIT_BUDGET,
  LEARNED_LINE_CAP,
  evolveRoot,
  learnedPath,
  statePath,
  validateDraft,
  scanForSecrets,
  stageDraft,
  listStagings,
  latestStaging,
  adoptStaging,
  revertLastAdopt,
  buildStatus,
};
