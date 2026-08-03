# SDTK-CODE Workflow State Model

Version: 0.1
Last Updated: 2026-03-22
Owner: SDTK Core Team
Status: Batch 0 locked state model

## 1. Purpose
This document defines the minimum state model for the v1 workflow-first layer in `SDTK-CODE`.

The model is intentionally small. It exists to:
- support legal transitions
- keep the workflow artifact coherent
- avoid turning v1 into a heavy routing engine

## 2. Core State Fields
Each `CODE_WORKFLOW_[FEATURE_KEY].md` artifact must track at least:
- `feature_key`
- `lane`
- `current_phase`
- `phase_status`
- `intake_outcome`
- `last_updated`

Allowed `lane` values:
- `feature`
- `bugfix`

Allowed `current_phase` values:
- `start`
- `plan`
- `build`
- `verify`
- `ship`

Allowed `phase_status` values:
- `pending`
- `in_progress`
- `completed`
- `blocked`
- `skipped`

Allowed `intake_outcome` values:
- `READY_FOR_PLAN`
- `READY_FOR_BUILD_BUGFIX`
- `BLOCKED_MISSING_INPUTS`
- `BLOCKED_UPSTREAM_HANDOFF`

## 3. Artifact Identity
Canonical workflow artifact path:
- `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md`

Canonical template path:
- `products/sdtk-code/toolkit/templates/CODE_WORKFLOW_TEMPLATE.md`

The workflow artifact is a sibling of `FEATURE_IMPL_PLAN_[FEATURE_KEY].md`, not a replacement for it.

## 4. Start Rules
`start` is the required normal-mode entrypoint.

`start` must:
- require explicit `--lane`
- prefer the formal SDTK-SPEC handoff contract when it exists
- validate required upstream inputs
- create the workflow artifact if missing
- update the workflow artifact if it already exists
- set the intake outcome
- set the next legal phase

If `--lane` is omitted:
- block
- do not create a partial workflow artifact

If required inputs are missing:
- set `intake_outcome = BLOCKED_MISSING_INPUTS`
- set `phase_status = blocked`
- record missing inputs in the artifact only if the artifact is intentionally created as a blocked record

If `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json` exists and is invalid or upstream-blocked:
- set `intake_outcome = BLOCKED_UPSTREAM_HANDOFF`
- set `phase_status = blocked`
- record the blocking detail in the artifact
- do not silently fall back to compatibility intake

If the formal handoff file is missing:
- compatibility fallback to `FEATURE_IMPL_PLAN_[FEATURE_KEY].md + sdtk-spec.config.json` remains allowed in v1

## 5. Legal Lane Progression
### Feature lane
Legal progression:
1. `start`
2. `plan`
3. `build`
4. `verify`
5. `ship`

Expected intake outcome:
- `READY_FOR_PLAN`

Compatibility note:
- feature lane should treat missing formal handoff as compatibility mode, not the preferred intake path

### Bugfix lane
Legal progression:
1. `start`
2. `build`
3. `verify`
4. `ship`

Expected intake outcome:
- `READY_FOR_BUILD_BUGFIX`

Compatibility note:
- bugfix lane may still use compatibility fallback when the formal handoff file is missing

## 6. Illegal Transition Rules
The workflow layer must block these cases:
- `plan` before a valid `start`
- `build` before `plan` for `feature`
- `verify` before `build`
- `ship` before `verify`
- lane change after `start` without an explicit recorded override

V1 should block illegal transitions cleanly and tell the user the next legal step.

## 7. Phase Semantics
### `start`
Purpose:
- validate upstream handoff
- lock lane choice
- create or update the workflow artifact

### `plan`
Purpose:
- refine execution slices from `FEATURE_IMPL_PLAN`
- record assumptions, risks, and next-step guidance

Bugfix note:
- `plan` is normally skipped for `bugfix`
- if used later by explicit override, the deviation must be recorded

### `build`
Purpose:
- record build progress
- track slices in progress
- attach reactive debug notes when execution fails

### `verify`
Purpose:
- record summarized verification evidence
- record review gate status
- block shipping when evidence is insufficient

### `ship`
Purpose:
- record final ship or finish decision
- capture follow-ups or deferred items

## 8. Evidence Model
The workflow artifact stores summarized evidence only.

Minimum summarized evidence fields:
- command or check name
- result summary
- pass/fail/partial interpretation
- reference to raw output location

Raw output storage path:
- `docs/dev/evidence/[FEATURE_KEY]/`

Examples of referenced raw files:
- `docs/dev/evidence/[FEATURE_KEY]/verify-tests.txt`
- `docs/dev/evidence/[FEATURE_KEY]/review-summary.txt`
- `docs/dev/evidence/[FEATURE_KEY]/ship-preflight.txt`

V1 must not inline long raw terminal output in `CODE_WORKFLOW_[FEATURE_KEY].md`.

## 9. Expert-Mode Attachment Rule
Expert mode remains direct raw `code-*` skill usage in the runtime.

If expert-mode work happens while a workflow artifact exists, the artifact should support:
- deviation notes
- updated phase summary
- references to evidence produced outside the normal flow

V1 does not require hard enforcement beyond recording the deviation truthfully.

## 10. Cross-Cutting Failure Rule
`code-debug` is not a top-level workflow phase.

It is a reactive cross-cutting skill that may be triggered during:
- `build`
- `verify`
- `ship`

The workflow artifact should record debug notes under the current phase rather than switching to a separate `debug` phase.

## 11. Minimal Artifact Section Contract
The template must contain at least these sections:
1. Metadata
2. Inputs
3. Scope Lock
4. Plan / Slices
5. Status Checklist
6. Evidence And Review Notes
7. Ship / Finish Decision

This section set is locked for v1 unless a later approved batch changes it explicitly.
