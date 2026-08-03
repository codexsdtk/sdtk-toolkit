# SDTK-CODE Workflow Routing Matrix

Version: 0.1
Last Updated: 2026-03-20
Owner: SDTK Core Team
Status: Batch 0 locked routing matrix

## 1. Purpose
This matrix defines how the v1 workflow-first layer routes to the existing `code-*` engine.

It is a routing contract, not a new skill catalog.

## 2. Default User Surface vs Internal Engine
Default normal-mode surface:
- `start`
- `plan`
- `build`
- `verify`
- `ship`

Internal engine:
- `code-brainstorm`
- `code-plan`
- `code-tdd`
- `code-execute`
- `code-parallel`
- `code-debug`
- `code-verify`
- `code-review`
- `code-ship`
- `code-finish`
- `code-worktree`
- `code-discover`

Expert mode remains direct raw `code-*` usage in the runtime.

## 3. Phase-To-Engine Mapping
| Workflow phase | Primary engine skills | Conditional engine skills | Notes |
|---|---|---|---|
| `start` | `code-discover` | `code-brainstorm` | `code-brainstorm` is used only when the slice is still ambiguous after intake grounding. |
| `plan` | `code-plan` | `code-brainstorm` | `code-brainstorm` is optional when the solution path is still unclear. |
| `build` | `code-worktree`, `code-tdd`, `code-execute` | `code-parallel` | `code-parallel` is allowed only for clearly independent tasks. |
| `verify` | `code-verify`, `code-review` | none | Review order remains evidence first, then spec/compliance, then quality. |
| `ship` | `code-ship`, `code-finish` | none | `ship` records final decision without expanding into full release governance. |

## 4. Cross-Cutting Reactive Skill
`code-debug` is cross-cutting and reactive.

It is not mapped as a normal planned phase.

Trigger rule:
- use `code-debug` when execution, verification, or pre-flight checks fail

Typical trigger points:
- `build`
- `verify`
- `ship`

## 5. Lane-Specific Routing
### Feature lane
Expected path:
1. `start`
2. `plan`
3. `build`
4. `verify`
5. `ship`

Feature emphasis:
- explicit slicing
- TDD-first execution
- conservative use of `code-parallel`

### Bugfix lane
Expected path:
1. `start`
2. `build`
3. `verify`
4. `ship`

Bugfix emphasis:
- lighter planning
- debug-first reaction when failure reproduction exists
- mandatory regression evidence before closure

## 6. Routing Rules
### Normal mode
Normal mode should:
- start from workflow commands
- use the workflow artifact as execution memory
- route to the existing engine skills conceptually and in docs/help text

### Expert mode
Expert mode should:
- allow direct raw `code-*` usage
- avoid forcing users through workflow commands
- document deviations when a workflow artifact already exists

V1 does not require a separate CLI expert-mode flag.

## 7. Runtime Notes
### Claude
- strongest intended runtime for v1
- full intended workflow surface
- `code-*` names remain the same

### Codex
- user scope only
- `code-parallel` must degrade to sequential fallback when collaboration/subagent behavior is unavailable
- workflow routing must not assume unavailable multi-agent behavior

## 8. What This Matrix Prevents
This matrix exists to prevent:
- exposing 12 raw skills as the default product UX
- creating duplicate wrapper skills for every workflow phase
- treating `code-debug` as a fixed linear phase
- drifting into PM/BA/ARCH/QA scope
- overpromising hidden autonomous execution
