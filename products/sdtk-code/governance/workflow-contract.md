# SDTK-CODE Workflow Contract

Version: 0.2
Last Updated: 2026-04-07
Owner: SDTK Core Team
Status: Batch 0 locked contract

## 1. Purpose
This document locks the v1 workflow-first contract for `SDTK-CODE`.

It exists to prevent drift between:
- product docs
- workflow artifact design
- future CLI workflow commands
- expert-mode guidance

## 2. Product Boundary
`SDTK-CODE` remains a separate product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

`SDTK-SPEC` owns:
- docs-first SDLC orchestration
- PM, BA, and ARCH artifact generation
- QA artifact and release-governance flow
- implementation-readiness planning under upstream `/dev`
- formal `CODE_HANDOFF_[FEATURE_KEY].json` scope

`SDTK-CODE` owns:
- implementation workflow after handoff
- execution-planning refinement only after valid intake
- TDD, debugging, verification, review, and ship discipline
- deterministic downstream `OPS_HANDOFF_[FEATURE_KEY].json` production from completed code closeout

`SDTK-CODE` does not own:
- PM initiation
- BA analysis
- ARCH generation
- QA artifact generation
- public release governance
- upstream implementation-readiness planning

## 3. Workflow Surface
The normal v1 workflow surface is:
- `sdtk-code start`
- `sdtk-code plan`
- `sdtk-code build`
- `sdtk-code verify`
- `sdtk-code ship`

Support commands remain:
- `sdtk-code help`
- `sdtk-code version`
- `sdtk-code init`
- `sdtk-code runtime`

The workflow commands are planned as real CLI subcommands, but they are control-plane commands only.

They may:
- validate current state
- validate required inputs
- create or update the workflow artifact
- block illegal transitions
- print or persist next-step guidance tied to the existing `code-*` engine

They may not:
- invoke hidden remote AI execution
- claim to replace direct runtime skill usage
- become a second wrapper-skill catalog

## 4. Internal Engine Contract
The 12 existing `code-*` skills remain the internal execution engine.

They remain:
- the specialist building blocks behind the workflow layer
- expert-mode direct entrypoints
- unchanged in identity for this implementation wave

This wave must not rename or rewrite the 12 skills unless a later approved batch explicitly requires it.

## 5. Required Inputs
`start` begins only after upstream `SDTK-SPEC` handoff artifacts exist.

Preferred intake artifact:
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`

Compatibility fallback when the formal handoff file is missing:
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `sdtk-spec.config.json`
- relevant architecture, API, DB, and flow/screen specs for the current slice when applicable

Formal handoff intake rules:
- when `CODE_HANDOFF_[FEATURE_KEY].json` exists, `start` must validate it before doing compatibility discovery
- invalid or blocked formal handoff must block cleanly and must not silently fall back
- compatibility fallback remains bounded transition behavior, not the preferred feature-lane contract
- `FEATURE_IMPL_PLAN_[FEATURE_KEY].md` remains the upstream implementation-readiness plan; `sdtk-code plan` refines execution slices only after intake succeeds
- current canonical `/dev` generator emits `CODE_HANDOFF` schema `0.2`; `SDTK-CODE` still accepts `0.1` for truthful compatibility
- when schema `0.2` enrichment is present, feature-lane seeded planning preserves `implementation_slices` order and surfaces bounded `impact_map`, stronger `test_obligations`, and optional `recovery_notes`

For v1, `sdtk-spec.config.json` is the required repo command/config contract. This contract does not rely on an alternative equivalent input path.

## 6. Lane Contract
V1 supports exactly two explicit lanes:
- `feature`
- `bugfix`

`start` must require explicit lane selection:
- `sdtk-code start --lane feature`
- `sdtk-code start --lane bugfix`

If `--lane` is omitted, `start` must block and require explicit choice.

Lane intake rules:
- `feature` prefers formal SDTK-SPEC handoff and uses compatibility fallback only when the formal handoff file is missing
- `bugfix` also prefers formal handoff, but bounded compatibility fallback remains more acceptable when the formal handoff file is missing

Deferred lanes:
- `hardening`
- `review-only`
- `ship-only`

## 7. Workflow Artifact Contract
V1 uses exactly one coordination artifact per feature or bugfix:
- `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md`

The executable template source of truth must live at:
- `products/sdtk-code/toolkit/templates/CODE_WORKFLOW_TEMPLATE.md`

Governance docs may describe the contract, but the runtime template source of truth belongs under `toolkit/templates/`.

The workflow artifact must remain lightweight and authoritative.

It must store:
- metadata
- input references
- scope lock
- plan or slice summary
- state/checklist summary
- summarized evidence and review notes
- ship or finish decision

It must not inline full raw command output.

Verify-side downstream review packet:
- `sdtk-code verify` also emits `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md`
- the packet is an evidence package for QA/controller review, not a final approval artifact
- exactness-required packet sections must use exact repo-relative paths only; no wildcard/glob shortcuts
- raw evidence refs must point to files that already exist under `docs/dev/evidence/[FEATURE_KEY]/` before verify can claim the check ran
- the packet must carry an explicit workflow-stage snapshot plus explicit include/exclude boundary lists for downstream review

Downstream review truth for later phases:
- controller review must consume actual git evidence, not prose-only claims
- required controller git commands are:
  - `git status --short --untracked-files=all`
  - `git diff --cached --name-only`
  - `git show HEAD --name-only`
  - `git rev-parse HEAD`
  - `git rev-parse origin/main`
  - `git log --oneline -3`
- rejected batches route only through a bounded targeted-fix loop with explicit finding scope and refresh order: `verify -> QA -> controller`

## 8. Downstream OPS Bridge
Canonical downstream `CODE -> OPS` bridge artifact:
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`

Producer rules:
- `SDTK-CODE` emits the canonical `OPS_HANDOFF` during completed `ship` closeout
- the producer path is formal-handoff-backed only; compatibility fallback does not invent a fake downstream bridge without the current `CODE_HANDOFF_[FEATURE_KEY].json`
- the emitted handoff must not broaden scope beyond the current `CODE_HANDOFF` plus current `CODE_WORKFLOW`

## 9. Evidence Storage Rule
The workflow artifact stores summarized evidence only.

Raw command output must be stored separately and referenced from the artifact.

V1 standard path for raw evidence files:
- `docs/dev/evidence/[FEATURE_KEY]/`

The workflow artifact should reference raw evidence files by relative path.

## 10. Normal Mode And Expert Mode
Normal mode:
- enter through workflow commands
- update the workflow artifact as the execution memory
- follow legal workflow transitions

Expert mode:
- directly invoke raw `code-*` skills inside the runtime
- remains available in Claude and Codex
- does not require a dedicated CLI expert-mode flag in v1

If a workflow artifact already exists, expert-mode deviations should be attachable to that artifact through notes or deviation entries.

## 11. Runtime Truth
Claude remains the strongest intended runtime for v1.

Codex rules remain:
- user scope only
- `code-parallel` falls back to sequential behavior when collaboration/subagent behavior is unavailable
- workflow commands must not assume capabilities that Codex cannot reliably support

## 12. Out Of Scope For This Wave
This execution wave does not include:
- PM, BA, ARCH, or QA role duplication in SDTK-CODE
- wrapper-skill sprawl
- public release/publication work
- package version changes
- SDTK-SPEC mainline changes
- SDTK-OPS changes
- hidden autonomous orchestration

## 13. Locked Decisions Summary
- `SDTK-CODE` stays a separate product.
- `SDTK-SPEC` remains the upstream docs-first system.
- The 12 `code-*` skills stay intact as the internal engine.
- Workflow-first becomes the default user-facing surface.
- `start` requires explicit `--lane`.
- V1 lanes are `feature` and `bugfix` only.
- The artifact name is `CODE_WORKFLOW_[FEATURE_KEY].md`.
- Completed formal-handoff-backed closeout emits `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`.
- The template path is `toolkit/templates/CODE_WORKFLOW_TEMPLATE.md`.
- V1 expert mode is raw direct `code-*` usage only.
- The artifact stores summarized evidence and references raw evidence stored separately.
