# SDTK-CODE Workflow Routing Contract

## 1. Product Identity
`SDTK-CODE` is the coding-only product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

It is a separate product from `SDTK-SPEC`, not a sub-phase inside `SDTK-SPEC`.

`SDTK-CODE` exists to enforce disciplined implementation work:
- execution-planning refinement after valid intake
- TDD-first execution
- systematic debugging
- evidence-first verification
- spec-first and quality-second review
- ship and finish discipline

It does not own PM, BA, ARCH, or QA artifact generation.
It also does not own upstream implementation-readiness planning.

## 2. Upstream Boundary With SDTK-SPEC
`SDTK-SPEC` is the upstream docs-first system.

`SDTK-SPEC` produces the handoff artifacts.
`SDTK-CODE` starts after those handoff artifacts already exist.

Minimum expected inputs:
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `sdtk-spec.config.json`
- relevant architecture, API, DB, and flow/screen specs for the current slice when applicable

Preferred upstream intake artifact:
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`

Compatibility fallback when the formal handoff file is missing:
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `sdtk-spec.config.json`
- relevant architecture, API, DB, and flow/screen specs for the current slice when applicable

Task-breakdown truth:
- upstream `SDTK-SPEC` `/dev` owns implementation-readiness planning and formal handoff scope
- `FEATURE_IMPL_PLAN_[FEATURE_KEY].md` remains the upstream readiness plan
- `sdtk-code plan` refines downstream execution slices only after intake succeeds

Expected outputs from `SDTK-CODE`:
- code changes
- test changes
- summarized verification evidence
- `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md` from `verify` as downstream QA/controller input
- review findings
- ship or finish decisions
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json` on completed formal-handoff-backed closeout

## 3. Default Operating Model
The default product direction is workflow-first.

Normal mode is not "pick one of 12 skills and self-orchestrate from scratch."
Normal mode is:
- start from the workflow layer
- follow lane-aware routing
- keep execution traceable through `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md`

Important current truth:
- the workflow-first direction is locked
- the workflow routing contract now exists
- `start`, `plan`, `build`, `verify`, and `ship` now exist in the current package as control-plane workflow commands

That means this file is the routing contract for the workflow-first model. It describes the full intended workflow surface, which now exists in the CLI as control-plane workflow commands.

## 4. Two-Layer Model
### Workflow layer
This is the planned normal-mode surface.

Workflow phases:
- `start`
- `plan`
- `build`
- `verify`
- `ship`

The workflow layer is control-plane and routing-oriented.
It is intended to:
- validate state and inputs
- decide legal next steps
- update the workflow artifact
- route to the existing specialist engine

### Specialist skill engine
The existing 12 `code-*` skills remain intact.

They are:
- the internal execution engine behind the workflow layer
- the expert-mode direct entrypoints
- not the default onboarding surface

## 5. V1 Lane Model
V1 supports only two explicit lanes:
- `feature`
- `bugfix`

Deferred lanes remain out of scope for v1:
- `hardening`
- `review-only`
- `ship-only`

Lane intent:
- `feature` = full workflow: `start -> plan -> build -> verify -> ship`
- `bugfix` = lighter path: `start -> build -> verify -> ship`

Lane intake note:
- `feature` expects formal handoff by default and uses compatibility fallback only when the handoff file is missing
- `bugfix` also prefers formal handoff, but bounded compatibility fallback remains acceptable when the handoff file is missing

## 6. Workflow Artifact
Canonical workflow artifact:
- `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md`

Canonical template path:
- `products/sdtk-code/toolkit/templates/CODE_WORKFLOW_TEMPLATE.md`

The workflow artifact is not a replacement for `FEATURE_IMPL_PLAN_[FEATURE_KEY].md`.
It is the coding execution memory that sits beside the upstream handoff artifact.

Evidence rule:
- summarized evidence belongs in `CODE_WORKFLOW_[FEATURE_KEY].md`
- raw command output should be stored separately and referenced from the workflow artifact
- `verify` also emits `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md` as an evidence package for QA/controller review, not as final approval

## 7. Phase-To-Engine Mapping
| Workflow phase | Primary engine skills | Conditional engine skills | Notes |
|---|---|---|---|
| `start` | `code-discover` | `code-brainstorm` | Use `code-brainstorm` only when the slice is still ambiguous after intake grounding. |
| `plan` | `code-plan` | `code-brainstorm` | `code-brainstorm` remains optional when the implementation path is unclear. |
| `build` | `code-worktree`, `code-tdd`, `code-execute` | `code-parallel` | `code-parallel` should be used only for clearly independent tasks. |
| `verify` | `code-verify`, `code-review` | none | Review order stays evidence first, then spec/compliance, then quality. |
| `ship` | `code-ship`, `code-finish` | none | Ship stays coding-scope only and does not expand into full release governance. |

### Cross-cutting reactive skill
`code-debug` is cross-cutting and reactive.

It is not a fixed top-level workflow phase.
Trigger it when failures occur during:
- `build`
- `verify`
- `ship` pre-flight or integration checks

## 8. Normal Mode vs Expert Mode
### Normal mode
Normal mode is workflow-first.

It should:
- begin from the workflow layer
- follow the lane model
- use the workflow artifact as the execution memory
- route to the engine skills intentionally rather than making the user choose blindly

### Expert mode
Expert mode is direct raw `code-*` usage inside the runtime.

Examples:
- `/code-plan`
- `/code-tdd`
- `/code-debug`

Expert mode rules:
- raw skill usage remains available
- it is an advanced path, not the default onboarding path
- if a workflow artifact already exists, expert-mode deviations should be recorded against it
- v1 does not require a dedicated CLI expert-mode flag

### Expert-mode deviation recording convention
Batch 7 keeps expert mode lightweight.

If a workflow artifact already exists and you bypass the normal workflow command path with raw `code-*` usage, record the deviation under `## 6. Evidence And Review Notes` using a lightweight note that captures:
- date/time
- current phase
- raw skill used
- reason for bypass
- evidence refs
- outcome or next action

This batch does not add runtime interception or a new artifact section for expert mode.
The rule is documentation plus lightweight recording inside the existing workflow artifact.

## 9. Runtime Truth
| Runtime | Current truth | Workflow note |
|---|---|---|
| Claude | strongest intended runtime for v1 | full workflow direction is designed with Claude in mind |
| Codex | defaults to user scope; project-local installs require the explicit local `CODEX_HOME=<project>/.codex` contract | workflow routing must stay honest about degraded collaboration behavior and not claim native `.codex/skills` auto-discovery |

Codex fallback note:
- `code-parallel` must degrade to sequential fallback when collaboration or subagent behavior is unavailable
- workflow routing must not assume runtime capabilities that Codex cannot reliably support

## 10. Current Practical Reality
The current package can already handle:
- `sdtk-code init`
- `sdtk-code runtime install|uninstall|status`
- runtime skill installation for Claude and Codex

The workflow-first direction now defines the normal practical path:
- `sdtk-code start` for formal-handoff-first intake and artifact initialization
- `sdtk-code plan` for feature-lane refinement and optional lightweight bugfix planning
- `sdtk-code build` for build-progress tracking and next-step routing
- `sdtk-code verify` for summarized evidence capture, `REVIEW_PACKET` generation, and ordered review gating
- `sdtk-code ship` for final ship or finish decision capture
- direct raw `code-*` skills in Claude or Codex as the expert-mode escape hatch and specialist engine
- guided by this workflow routing contract

Current `start` intake truth:
- prefer `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- fall back to `FEATURE_IMPL_PLAN + sdtk-spec.config.json` only when the formal handoff file is missing
- block cleanly when the formal handoff file exists but is invalid or upstream-blocked

## 11. What This Contract Prevents
This routing contract exists to prevent:
- treating `SDTK-CODE` as a loose 12-skill catalog
- creating a second competing wrapper-skill catalog
- drifting into PM/BA/ARCH/QA responsibilities
- modeling `code-debug` as a fixed linear phase
- overpromising workflow command behavior that is not implemented yet
