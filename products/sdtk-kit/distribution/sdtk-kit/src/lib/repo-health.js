"use strict";

// BK-364 — workspace-hygiene report for `sdtk doctor --repo`.
//
// Reports on the git checkout the toolkit is running in (stale checkout,
// merged-branch litter, dirty worktrees, aged uncommitted edits). Read-only:
// only git plumbing that reads state, never a mutation. Every git call is
// wrapped so a non-repo / missing git / individual check failure degrades to a
// single explanatory line and never crashes the command (doctor is diagnostic).
//
// Logic is pure over an injected `git` runner so it is unit-testable without a
// real repository — mirrors the lib/doctor.js (pure) vs commands/doctor.js
// (shell) split already used in this kit.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROTECTED_BRANCHES = new Set(["main", "master", "HEAD"]);
const DEFAULT_BEHIND_THRESHOLD = 50;
const DEFAULT_AGE_DAYS = 7;
const LIST_CAP = 10;

/** Default git runner: native `git`, cross-platform (not a .cmd shim). */
function defaultGit(cwd) {
  return (args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 10000 });
    return {
      status: typeof r.status === "number" ? r.status : (r.error ? 127 : 1),
      stdout: r.stdout || "",
      stderr: r.stderr || "",
    };
  };
}

function resolveDefaultBranch(git) {
  // origin/HEAD -> refs/remotes/origin/<default>; fall back to "main" when unset
  // (fresh clone / no remote HEAD) so behind/ahead never throws (RISK-01).
  const r = git(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  if (r.status === 0 && r.stdout.trim()) {
    return r.stdout.trim().replace(/^refs\/remotes\/origin\//, "");
  }
  return "main";
}

function currentBranch(git) {
  const r = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.status === 0 ? r.stdout.trim() : null;
}

function computeAheadBehind(git, defaultBranch) {
  // rev-list --left-right --count HEAD...origin/<default> -> "<ahead>\t<behind>"
  const r = git(["rev-list", "--left-right", "--count", `HEAD...origin/${defaultBranch}`]);
  if (r.status !== 0) return { ahead: null, behind: null };
  const m = r.stdout.trim().split(/\s+/);
  if (m.length < 2) return { ahead: null, behind: null };
  return { ahead: Number(m[0]), behind: Number(m[1]) };
}

function mergedBranches(git, defaultBranch, current) {
  // One for-each-ref for the branch list, then is-ancestor per local branch.
  // is-ancestor exit: 0=ancestor(merged), 1=not, other=error (RISK-02) — only
  // 0 counts as merged so an errored probe never inflates the litter count.
  const listed = git(["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
  if (listed.status !== 0) return [];
  const branches = listed.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  const merged = [];
  for (const b of branches) {
    if (b === current || PROTECTED_BRANCHES.has(b)) continue; // BR-06
    const anc = git(["merge-base", "--is-ancestor", b, `origin/${defaultBranch}`]);
    if (anc.status === 0) merged.push(b);
  }
  return merged;
}

function worktrees(git, cwd) {
  // Parse `worktree list --porcelain`; flag dirty via status --porcelain per path.
  const r = git(["worktree", "list", "--porcelain"]);
  if (r.status !== 0) return [];
  const out = [];
  for (const block of r.stdout.split("\n")) {
    const line = block.trim();
    if (!line.startsWith("worktree ")) continue; // tolerate main entry / other lines (RISK-03)
    const wtPath = line.slice("worktree ".length).trim();
    const st = git(["-C", wtPath, "status", "--porcelain"]);
    out.push({ path: wtPath, dirty: st.status === 0 && st.stdout.trim().length > 0 });
  }
  return out;
}

function agedUncommitted(git, cwd, nowMs, ageDays) {
  // Tracked, modified-but-uncommitted files whose worktree mtime is older than
  // ageDays. mtime is the honest proxy — git has no "when was this uncommitted
  // edit made" timestamp (decision D1).
  const r = git(["status", "--porcelain"]);
  if (r.status !== 0) return [];
  const cutoff = nowMs - ageDays * 24 * 60 * 60 * 1000;
  const aged = [];
  for (const raw of r.stdout.split("\n")) {
    if (!raw) continue;
    const code = raw.slice(0, 2);
    const file = raw.slice(3).trim();
    if (!file || code.includes("?")) continue; // skip untracked
    const abs = path.isAbsolute(file) ? file : path.join(cwd, file);
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(abs).mtimeMs;
    } catch (_) {
      continue; // deleted / unreadable -> skip, never throw
    }
    if (mtimeMs < cutoff) {
      aged.push({ path: file, ageDays: Math.floor((nowMs - mtimeMs) / 86400000) });
    }
  }
  return aged;
}

/**
 * Collect workspace-health facts for `cwd`. Never throws for repo-state reasons;
 * returns { available:false, reason } when cwd is not a repo or git is missing.
 */
// BK-374 — backlog drift. A row whose STATUS still claims an open PR while the
// cited PR is already merged is stale (measured: BK-371/373 rows read
// "IMPLEMENTED (PR open)" after their PRs merged; every window merge-conflict
// hit this one file). Detected fully offline from local git history — no `gh`,
// no network — so it degrades gracefully and never blocks on connectivity.
const BACKLOG_REL = path.join("governance", "ai", "core", "IMPROVEMENT_BACKLOG.md");
// Status phrasing that explicitly asserts a still-open PR (high precision — a
// bare "PLANNED" row citing its own merged plan-PR must NOT trip this).
const OPEN_PR_CLAIM = /PR open|pending merge|awaiting merge|chờ merge|PR pending/i;

/** Set of PR numbers merged according to LOCAL git history (offline). */
function mergedPrNumbers(git) {
  // --all so a merge reachable through origin/main (but not the current feature
  // branch's HEAD) is still counted — doctor run on a branch forked before a
  // fetched merge should still see the drift (Codex review F7).
  const r = git(["log", "--all", "--pretty=%s", "-n", "5000"]);
  if (r.status !== 0) return null; // history unavailable → caller skips the check
  const nums = new Set();
  for (const subject of r.stdout.split("\n")) {
    const m = subject.match(/Merge pull request #(\d+)/); // this repo's convention
    if (m) nums.add(Number(m[1]));
    const sq = subject.match(/\(#(\d+)\)\s*$/); // squash-merge convention
    if (sq) nums.add(Number(sq[1]));
  }
  return nums;
}

/** Rows whose status claims an open PR that git history shows already merged. */
function backlogDrift(cwd, mergedPrs, fsImpl) {
  if (!mergedPrs) return null; // git history unavailable
  let text;
  try {
    text = fsImpl.readFileSync(path.join(cwd, BACKLOG_REL), "utf8");
  } catch (_) {
    return []; // no backlog file in this repo → nothing to check
  }
  const drifts = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("| BK-")) continue;
    // Split on unescaped pipes only, so a cell containing an escaped `\|`
    // (e.g. a title "claude\|codex") does not shift the status column
    // (Codex review F6).
    const cols = line.split(/(?<!\\)\|/); // | <id> | title | prio | STATUS | owner | notes |
    if (cols.length < 5) continue;
    const status = cols[4];
    if (!OPEN_PR_CLAIM.test(status)) continue;
    const cited = [...new Set([...line.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))];
    if (cited.length === 0) continue;
    const mergedCited = cited.filter((n) => mergedPrs.has(n));
    const anyUnmerged = cited.some((n) => !mergedPrs.has(n));
    // Only flag when EVERY cited PR is merged. A row that also cites a PR git
    // history does not show merged probably has a genuinely-open current PR
    // (the "PR open" status is about that one) — skip it to avoid a false
    // positive from an older merged PR mentioned in prose (Codex review F5).
    if (mergedCited.length && !anyUnmerged) {
      drifts.push({
        bk: cols[1].trim().split(/\s+/)[0],
        status: status.trim(),
        mergedPrs: mergedCited,
      });
    }
  }
  return drifts;
}

function collectRepoHealth(cwd, opts = {}) {
  const {
    now = Date.now(),
    behindThreshold = DEFAULT_BEHIND_THRESHOLD,
    ageDays = DEFAULT_AGE_DAYS,
    git = defaultGit(cwd),
    fsImpl = fs,
  } = opts;

  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    const gitMissing = inside.status === 127;
    return {
      available: false,
      reason: gitMissing ? "git is not available on PATH" : "not a git repository",
      warnings: [],
    };
  }

  const defaultBranch = resolveDefaultBranch(git);
  const current = currentBranch(git);
  const { ahead, behind } = computeAheadBehind(git, defaultBranch);
  const merged = mergedBranches(git, defaultBranch, current);
  const wts = worktrees(git, cwd);
  const aged = agedUncommitted(git, cwd, now, ageDays);
  const drift = backlogDrift(cwd, mergedPrNumbers(git), fsImpl);

  const stale = typeof behind === "number" && behind > behindThreshold;
  const warnings = [];
  if (stale) {
    warnings.push(
      `STALE checkout: ${behind} commits behind origin/${defaultBranch} ` +
        `(> ${behindThreshold}). Sync before trusting local code.`
    );
  }
  if (merged.length > 0) {
    warnings.push(`${merged.length} local branch(es) already merged into origin/${defaultBranch} — safe to delete.`);
  }
  const dirtyCount = wts.filter((w) => w.dirty).length;
  if (dirtyCount > 0) warnings.push(`${dirtyCount} worktree(s) with uncommitted changes.`);
  if (aged.length > 0) warnings.push(`${aged.length} tracked file(s) uncommitted for > ${ageDays} days.`);
  if (drift && drift.length > 0) {
    for (const d of drift) {
      warnings.push(
        `${d.bk} status "${d.status}" cites PR ${d.mergedPrs.map((n) => `#${n}`).join(", ")} which git history shows already merged — update the row.`
      );
    }
  }

  return {
    available: true,
    reason: null,
    defaultBranch,
    current,
    ahead,
    behind,
    stale,
    mergedBranches: merged,
    worktrees: wts,
    agedUncommitted: aged,
    backlogDrift: drift || [],
    warnings,
  };
}

/** Render the collected report as terminal lines (array of strings). */
function renderRepoHealth(health) {
  const lines = [];
  if (!health.available) {
    lines.push(`[doctor:repo] ${health.reason} — repo health skipped.`);
    return lines;
  }
  lines.push(`[doctor:repo] on ${health.current || "?"} vs origin/${health.defaultBranch}`);
  const ab = [];
  if (typeof health.ahead === "number") ab.push(`ahead ${health.ahead}`);
  if (typeof health.behind === "number") ab.push(`behind ${health.behind}`);
  lines.push(`  sync: ${ab.length ? ab.join(", ") : "unavailable"}${health.stale ? "  <-- STALE" : ""}`);

  const cap = (arr, fmt) => {
    const shown = arr.slice(0, LIST_CAP).map(fmt);
    if (arr.length > LIST_CAP) shown.push(`    +${arr.length - LIST_CAP} more`);
    return shown;
  };
  lines.push(`  merged branches: ${health.mergedBranches.length}`);
  lines.push(...cap(health.mergedBranches, (b) => `    ${b}`));
  lines.push(`  worktrees: ${health.worktrees.length} (${health.worktrees.filter((w) => w.dirty).length} dirty)`);
  lines.push(...cap(health.worktrees.filter((w) => w.dirty), (w) => `    dirty: ${w.path}`));
  if (health.agedUncommitted.length) {
    lines.push(`  aged uncommitted: ${health.agedUncommitted.length}`);
    lines.push(...cap(health.agedUncommitted, (a) => `    ${a.path} (${a.ageDays}d)`));
  }
  if (health.backlogDrift && health.backlogDrift.length) {
    lines.push(`  backlog drift: ${health.backlogDrift.length} row(s) cite a merged PR while claiming it open`);
    lines.push(...cap(health.backlogDrift, (d) => `    ${d.bk}: ${d.mergedPrs.map((n) => `#${n}`).join(",")} merged`));
  }
  for (const w of health.warnings) lines.push(`  WARN ${w}`);
  return lines;
}

module.exports = {
  collectRepoHealth,
  renderRepoHealth,
  mergedPrNumbers,
  backlogDrift,
  defaultGit,
  DEFAULT_BEHIND_THRESHOLD,
  DEFAULT_AGE_DAYS,
  LIST_CAP,
};
