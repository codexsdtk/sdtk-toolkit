# Software Development Toolkit - Code (SDTK-CODE)

## Document Role
This file is the architecture and product-boundary document for `SDTK-CODE`.

Use this file to understand:
- how `SDTK-CODE` fits inside the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family
- what the workflow-first layer owns
- how the workflow layer maps to the existing `code-*` specialist engine
- what stays outside `SDTK-CODE` scope

Do not use this file as the primary install or onboarding guide.

Canonical end-user guide:
- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

## 1. Overview

`SDTK-CODE` is the coding-process product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

It is workflow-first:
- `start`
- `plan`
- `build`
- `verify`
- `ship`

It still keeps the existing specialist engine:
- the 12 `code-*` skills remain intact
- expert mode remains direct raw `code-*` usage inside Claude or Codex

`SDTK-OPS` now exists as a public downstream operations product via the `sdtk-ops-kit` package. Its install and usage truth is documented in the `products/sdtk-ops/` docs rather than in this file.

## 2. Boundary With SDTK-SPEC

`SDTK-SPEC` is upstream and remains the docs-first system.

`SDTK-SPEC` owns:
- PM, BA, and ARCH artifact generation
- docs-first SDLC orchestration
- upstream handoff generation
- QA artifact and release-governance flow

`SDTK-CODE` owns:
- implementation workflow after handoff
- execution-slice refinement and coding-plan discipline after valid intake
- TDD, debugging, verification, review, and ship discipline
- canonical `CODE -> OPS` bridge production from completed formal closeout

`SDTK-CODE` begins only after upstream handoff inputs already exist.

Task-breakdown truth:
- upstream `SDTK-SPEC` `/dev` still owns implementation-readiness planning and formal handoff scope
- `FEATURE_IMPL_PLAN_[FEATURE_KEY].md` remains the upstream readiness plan
- `sdtk-code plan` refines downstream execution slices only after intake succeeds

Preferred intake artifact:
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`

Bounded compatibility fallback when the formal handoff file is missing:
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `sdtk-spec.config.json`
- relevant architecture, API, database, and flow/screen specs for the current slice when applicable

Completed formal closeout also produces:
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`

Compatibility fallback does not replace the formal `CODE_HANDOFF -> OPS_HANDOFF` bridge chain.

## 3. Two-Layer Product Model

### 3.1 Workflow layer
The workflow layer is the default documented surface.

Its job is to:
- validate required inputs
- validate lane and phase state
- create or update the workflow artifact
- route users to the next legal step
- keep execution traceable

### 3.2 Specialist engine
The 12 existing `code-*` skills remain the internal execution engine.

They remain:
- the specialist building blocks behind the workflow layer
- the direct expert-mode entrypoints
- unchanged in identity for this implementation wave

## 4. Lane Model

V1 supports exactly two lanes:
- `feature`
- `bugfix`

Expected lane progression:
- feature: `start -> plan -> build -> verify -> ship`
- bugfix: `start -> build -> verify -> ship`

`code-debug` remains cross-cutting and reactive, not a top-level linear phase.

## 5. Workflow Artifact

Canonical workflow artifact:
- `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md`

Canonical template path:
- `products/sdtk-code/toolkit/templates/CODE_WORKFLOW_TEMPLATE.md`

The workflow artifact stores:
- metadata
- lane and phase state
- intake outcome
- slice summary
- summarized evidence and review notes
- final ship or finish decision

The workflow artifact does not inline full raw command output.

## 6. Runtime Truth

### Claude
- supports project and user scope
- installs `code-*` skills

### Codex
- defaults to user scope
- installs `sdtk-code-*` skills
- supports project-local installs only through the explicit local `CODEX_HOME=<project>/.codex` contract
- native `.codex/skills` auto-discovery is not claimed
- routing assumptions must not depend on unavailable multi-agent behavior

## 7. Documentation Map

Use these documents by role:

- Canonical end-user install and usage guide:
  - `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`
- Install-truth and smoke appendix:
  - `products/sdtk-code/governance/installation-runbook.md`
- Workflow/boundary companion:
  - `products/sdtk-code/governance/usage-guide.md`
- npm package landing page:
  - `products/sdtk-code/distribution/sdtk-code-kit/README.md`
- Contract details:
  - `products/sdtk-code/governance/workflow-contract.md`
  - `products/sdtk-code/governance/workflow-routing-matrix.md`
  - `products/sdtk-code/governance/workflow-state-model.md`

## 8. Upstream Boundary With SDTK-SPEC

`SDTK-SPEC` is the upstream docs-first system. `SDTK-CODE` begins only after valid upstream handoff inputs already exist.

Preferred upstream intake artifact:
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`

Compatibility fallback when the formal handoff file is missing:
- fall back to `FEATURE_IMPL_PLAN + sdtk-spec.config.json` only when the formal handoff file is missing

Task-breakdown truth:
- upstream `SDTK-SPEC` `/dev` owns implementation-readiness planning and formal handoff scope
- `FEATURE_IMPL_PLAN_[FEATURE_KEY].md` remains the upstream readiness plan
- `sdtk-code plan` refines downstream execution slices only after intake succeeds

`SDTK-CODE` expected outputs include:
- code changes
- test changes
- summarized verification evidence
- `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md` from `verify` as downstream QA/controller input — not as final approval
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json` on completed formal-handoff-backed closeout

## 9. Expert Mode And Deviation Recording

Expert mode is direct raw `code-*` usage inside the runtime.

Normal mode is workflow-first (`start -> plan -> build -> verify -> ship`). Expert mode is the direct raw entrypoint for advanced use.

Expert mode rules:
- v1 does not require a dedicated CLI expert-mode flag
- if a workflow artifact already exists and you bypass the normal workflow command path, record the deviation under `## 6. Evidence And Review Notes` in the workflow artifact using a lightweight note that captures:
  - date/time
  - current phase
  - raw skill used
  - reason for bypass
  - evidence refs
  - outcome or next action

## 10. Runtime And Codex Fallback Truth

| Runtime | Current truth |
|---|---|
| Claude | strongest intended runtime for v1; full workflow direction is designed with Claude in mind |
| Codex | defaults to user scope; project-local installs require the explicit `CODEX_HOME=<project>/.codex` contract |

Codex notes:
- workflow routing must not assume runtime capabilities that Codex cannot reliably support
- sequential fallback applies when parallel dispatch is unavailable: keep the same slice boundaries but execute sequentially
