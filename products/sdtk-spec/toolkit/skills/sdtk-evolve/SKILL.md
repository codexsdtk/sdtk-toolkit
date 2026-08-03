---
name: sdtk-evolve
description: "Local self-improvement loop for SDTK. Harvest your own past agent sessions for recurring friction and stage at most 4 bounded, evidence-backed lesson edits to .sdtk/evolve/LEARNED.md for explicit human adoption. Use at the end of a substantial session or when the same correction keeps repeating."
---

# SDTK Evolve — learn from your own sessions, behind a human gate

Every turn produced while executing this skill is part of an evolve cycle. Begin your first reply with the literal, versioned marker line `<!-- sdtk-evolve:harvest-session:v1 -->` — future harvests use it to skip evolve-generated content, so the loop never mines itself. (Harvest filters must also skip content carrying the legacy `SDTK-EVOLVE CYCLE` marker from older sessions.)

## Critical Constraints
- I propose **at most 4** bounded edits per cycle — `add`, `delete`, or `replace` of single bullets — and I never rewrite the learned document wholesale.
- I **never edit** `.sdtk/evolve/LEARNED.md`, `state.json`, or any live file myself. `sdtk evolve stage` is the only writer of staging; only the human's `sdtk evolve adopt` applies it (there is **no auto-adopt** — the flag does not exist), and `sdtk evolve revert` restores the pre-adopt backup.
- Every proposed edit carries **evidence** (which sessions, how many occurrences) and a pre-registered falsifiable **bet** ("friction signature X stops appearing"). No measurable bet → the edit is dropped, not softened.
- Redaction is **fail-closed**: secrets, tokens, PII, prompts, and full transcripts never enter a draft. When unsure whether content is sensitive, describe it — never copy it. (`sdtk evolve stage` re-scans and refuses on any hit.)
- I never guess the Codex session-log format: the Codex harvest path follows the format validated by the issue #247 report only, and stays **gated** until the marker-persistence integration proof exists — the Claude path proceeds regardless.
- Opinion-only lessons (no falsifiable claim) may enter only as preference bullets and never override correctness lessons.

## When to run
- End of a substantial session, especially one where the operator corrected you more than once.
- The operator says some variant of "I told you this before".
- `sdtk evolve status` reports unharvested sessions or a due dogfood checkpoint.

## Procedure

1. **Load state.** Run `sdtk evolve status`. Read `.sdtk/evolve/state.json` (last harvest time, adopted lessons with signatures) and `.sdtk/evolve/LEARNED.md` (current lessons + line count vs the **150**-line cap). If the CLI is unavailable, stop and tell the operator to update `sdtk-kit` (the `evolve` CLI ships with sdtk-kit ≥ 1.16.0) — do **not** hand-write staging files.
2. **Harvest.** Scan sessions since the last harvest:
   - **Claude Code (if present on this machine):** `~/.claude/projects/<project-slug>/*.jsonl` — extract per-session digests: user intents, tool usage, and correction signals (negative: "vẫn sai", "làm lại", "that's wrong", "I told you", "again"; positive: "perfect", "đúng rồi", "great").
   - **Codex — format validated, harvest GATED:** the on-disk format is ground-truthed by `governance/ai/reviews/shared/SDTK_BK316_CODEX_HARVEST_VALIDATION_R1_20260710.md` (Codex CLI 0.144.1). When enabled, follow its rules exactly: scan `$CODEX_HOME/sessions/**/*.jsonl` recursively as the primary source (CODEX_HOME defaults to `~/.codex`) plus `archived_sessions/*.jsonl` as legacy input deduped by session id; extract ONLY canonical `response_item` records with `payload.type=="message" && payload.role=="user"`, taking `content[]` blocks of type `input_text` — never `event_msg` duplicates of the same turn, never developer-role records, never `<environment_context>`/AGENTS wrappers; require a filename-matching `session_meta` with non-empty `cwd` (project attribution) or skip the file fail-closed; pre-scan the WHOLE file for the self-pollution marker (v1 or legacy) and exclude the entire file on a match; never read tool `arguments`/`output`; stream large files rather than loading them whole. **Codex harvest remains gated until an integration proof shows the marker persists in a real Codex evolve session (report §7 condition 6)** — until then, note "codex: gated (marker persistence proof pending)" in the report and harvest Claude only.
   - **Filters (both sources):** skip meta prompts (bare skill invocations, pasted-text stubs, system noise) and skip any content carrying the `<!-- sdtk-evolve:harvest-session:v1 -->` marker or the legacy `SDTK-EVOLVE CYCLE` marker (self-pollution guard).
3. **Score recurrence** for every adopted lesson: did its signature re-appear in post-adoption sessions? Render the verdict table — `WORKING` (no recurrence) or `FAILING` (recurred). A lesson FAILING for 2 consecutive cycles **must** get a `replace` or `delete` proposal before any new `add`. The same rule applies when `LEARNED.md` is over the 150-line cap.
4. **Reflect.** From the harvested friction, draft **at most 4** edits targeting the lane sections of `LEARNED.md` (`## Chung`, `## SPEC`, `## CODE`, `## OPS`, `## DESIGN`). Prefer one excellent lesson over four mediocre ones. Write the draft to a scratch file using this contract:

```json
{
  "schema": "sdtk.evolve-draft.v1",
  "generated_at": "<ISO-8601 UTC>",
  "harvest": { "sources": ["claude"], "sessions_scanned": 0, "since": "<ISO-8601 or null>", "codex": "skipped (pending #247)" },
  "recurrence": [
    { "lesson_id": "L-001", "signature": "<toolkit:area:slug>", "before": "4/10", "after": "0/14", "verdict": "WORKING" }
  ],
  "edits": [
    {
      "op": "add",
      "lane": "CODE",
      "content": "<one bullet, imperative, self-contained>",
      "anchor": "<required for delete/replace: substring of the target bullet>",
      "evidence": ["<session/date>: <what happened>, <N> occurrences"],
      "bet": "<friction signature that should stop appearing>",
      "signature": "<toolkit:area:slug>"
    }
  ]
}
```

5. **Stage.** Run `sdtk evolve stage --from <draft-path>`. The CLI validates the draft (budget, ops, lanes, required `evidence`/`bet`/`signature` fields), runs the fail-closed redaction scan, and writes `.sdtk/evolve/staging/<ts>/` (`proposal.md`, `edits.json`, `report.md` with the recurrence table and scorecard).
6. **Present and stop.** Show the operator: the recurrence verdict table, each proposed edit with its evidence and bet, and the exact next commands — `sdtk evolve adopt` to apply (backup taken automatically) or discard the staging folder; `sdtk evolve revert` undoes the last adopt. **Do not adopt on the operator's behalf. End the cycle here.**

## What LEARNED.md is (and is not)
- It is the operator-approved, locally learned layer that sessions read at start (the AGENTS.md/CODEX template carries the pointer). It survives `sdtk update` and re-init because it lives outside every kit-managed file.
- It is **not** yours to edit directly, not a scratchpad, not a place for secrets or project data — lessons are about *how to work*, not *what the code is*.
- Git posture is the operator's choice (commit to share with a team, ignore for personal habits); `sdtk evolve status` shows the current posture.

## Runtime Entrypoint Truth (Codex)
- Project-local Codex support is bounded to explicit `CODEX_HOME=<project>/.codex`; presence of `sdtk-evolve` under `.codex/skills` does not prove direct built-in exposure. Invoke via "Use the sdtk-evolve skill." when no direct syntax is validated.

## Effectiveness discipline
The loop measures itself: recurrence verdicts are the metric, FAILING lessons get culled, and `sdtk evolve status` reminds the operator when the dogfood checkpoint (4 weeks / 20 sessions) is due. Never claim a lesson "works" without the recurrence evidence — flat/noisy results are reported as exactly that.
