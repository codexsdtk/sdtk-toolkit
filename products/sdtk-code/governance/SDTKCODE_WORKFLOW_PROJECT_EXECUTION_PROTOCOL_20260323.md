# SDTK-CODE Workflow Project Execution Protocol

Version: 0.1
Last Updated: 2026-03-23
Owner: SDTK Core Team

## 1. Purpose

This protocol defines the most efficient way to validate `SDTK-CODE` on the real Workflow project without forcing the user into a slow manual loop of:
- run one command
- hit a gap
- write a manual bug report
- wait for a fix
- rerun from scratch

It complements:
- `products/sdtk-code/governance/SDTKCODE_WORKFLOW_PROJECT_TEST_GUIDE_20260323.md`

That guide explains what to test.
This protocol explains how to execute the test efficiently.

## 2. Recommended Operating Model

Use a **single-owner bounded execution loop**.

That means:
- one execution agent owns the Workflow project test pass end-to-end for a bounded stage
- that same agent is allowed to:
  - run commands
  - inspect artifacts
  - identify product gaps
  - fix repo-side toolkit gaps inside a declared scope
  - rerun the stage immediately
- the human should only step in at explicit review gates, not after every small failure

For `SDTK-CODE`, the practical owner should usually be:
- `Codex Code Dev`

Reason:
- most failures during this exercise are expected to be inside `SDTK-CODE` workflow, artifact, runtime, or package behavior
- forcing a human-managed relay after every gap adds latency without improving correctness

## 3. The Right Testing Style

Do not run the full Workflow project as one giant uncontrolled test.

Use a staged protocol with ownership and exit criteria.

### Stage A. Toolkit Control-Plane Readiness

Owner:
- `Codex Code Dev`

Goal:
- prove the toolkit can drive the Workflow project through:
  - `init`
  - `start`
  - `plan`

Allowed repo-side fixes in this stage:
- `SDTK-CODE` workflow artifact behavior
- command help / CLI behavior
- intake / handoff consumption behavior
- runtime or package-local execution behavior
- project guide doc corrections if they are directly needed for the Workflow test

Stop condition:
- stop only if the issue is clearly upstream `SDTK-SPEC`
- or clearly outside `SDTK-CODE` ownership

Exit criteria:
- `start` reaches `READY_FOR_PLAN`
- `CODE_WORKFLOW_WORKFLOW.md` is actionable
- `plan` completes for the chosen pilot slice

### Stage B. Pilot Vertical Slice Execution

Owner:
- `Codex Code Dev`

Goal:
- implement and prove one narrow real slice only:
  - Workflow Definition Basic Info create

Required proof for this stage:
- frontend form exists
- frontend calls backend
- backend persists to PostgreSQL
- list page shows the inserted record

Allowed repo-side fixes in this stage:
- `SDTK-CODE build/verify/ship` workflow gaps
- guidance gaps in the project-specific Workflow test docs
- bounded toolkit issues that block pilot execution

Not allowed in this stage:
- widening to all Workflow Engine slices
- trying to complete applicant/approver/notification/integration flows

Exit criteria:
- the pilot slice works end-to-end
- evidence files exist under `docs/dev/evidence/WORKFLOW/`

### Stage C. Expand Only After Pilot Green

Owner:
- human decides whether to continue with `Codex Code Dev`

Goal:
- only after Stage B passes, expand to larger slice groups

## 4. What The Human Should Stop Doing Manually

Avoid this operating pattern:
- run a command yourself
- inspect one error
- manually summarize it
- hand it off
- wait for one narrow fix
- rerun manually again

That pattern is too expensive when validating a still-maturing workflow toolkit.

Instead, assign the agent a **bounded execution window** and require it to keep iterating until one of these happens:
1. the stage exit criteria are met
2. the issue is outside its ownership
3. the issue requires a human external action
   - example: npm auth, external repo access, environment permission
4. the issue would require scope expansion beyond the declared stage

## 5. Recommended Ownership Split

### Use `Codex Code Dev` for:
- `SDTK-CODE` command gaps
- workflow artifact gaps
- runtime and package-local issues
- project-stage execution of `start`, `plan`, `build`, `verify`, `ship`
- evidence collection for the pilot slice

### Use `Codex Spec Dev` only when:
- the blocker is upstream handoff truth
- `CODE_HANDOFF` generation or contract is wrong
- required upstream refs are wrong or missing due to SDTK-SPEC output truth

### Use the human only when:
- an external decision is needed
- a real product-scope choice must be made
- credentials, infrastructure access, or environment setup must be handled outside the toolkit

## 6. The Most Efficient Practical Loop

For the Workflow project, the best practical loop is:

1. lock the stage scope first
2. assign one owner agent for that stage
3. allow that agent to run/fix/rerun inside the declared scope
4. require one report only at the stage gate, not after every minor failure
5. review that report
6. then move to the next stage

### Good example

Stage A assignment:
- own Workflow test from `init` through successful `plan`
- fix any `SDTK-CODE` repo-side gap found along the way
- stop only for upstream ownership mismatch or external blocker

### Bad example

- user runs `start`
- agent fixes one problem
- user reruns `start`
- user reports the next problem
- agent fixes one more problem
- repeat five times

## 7. Recommended Stage Gates For This Project

### Gate A: Ready For Plan

Required evidence:
- `sdtk-code start --feature-key WORKFLOW --lane feature --project-path . --force`
- `CODE_WORKFLOW_WORKFLOW.md` updated
- seeded candidate slices visible
- `plan` can be run for the pilot slice

### Gate B: Pilot Planned

Required evidence:
- `sdtk-code plan --feature-key WORKFLOW ...` succeeds
- the artifact records the pilot vertical slice cleanly
- no scope drift into full-system implementation

### Gate C: Pilot Built

Required evidence:
- build notes recorded
- active slices recorded
- implementation is still limited to the pilot slice

### Gate D: Pilot Verified

Required evidence:
- backend tests pass for pilot subset
- frontend flow succeeds
- API succeeds
- PostgreSQL insert proved
- list refresh proved

### Gate E: Pilot Ship Decision

Required evidence:
- `verify` and `ship` artifact sections reflect reality
- residual issues are explicit
- recommendation to expand or stop is documented

## 8. Recommended Prompt Style For Future Execution

When assigning a Workflow project test stage, use prompts that say:
- own this stage end-to-end
- fix repo-side toolkit gaps within your ownership
- rerun immediately after each fix
- stop only for external blockers, ownership mismatch, or scope expansion
- produce one stage report at the end

This is the key optimization.

## 9. Concrete Recommendation For The Current Workflow Project

From this point onward, do not use a manual one-command relay.

Use this execution model instead:

1. Stage A owner: `Codex Code Dev`
   - own `init -> start -> plan`
   - fix repo-side `SDTK-CODE` gaps in that range
   - stop only for upstream `SDTK-SPEC` blockers or external blockers

2. Stage B owner: `Codex Code Dev`
   - own one bounded pilot slice only:
     - Workflow Definition Basic Info create
   - fix repo-side `SDTK-CODE build/verify/ship` gaps in that range
   - stop only for scope expansion or external blockers

3. Human review only at stage gates

## 10. Relationship To The Existing Workflow Guide

Use the other guide for:
- exact commands
- pilot slice content
- evidence expectations

Use this protocol for:
- execution ownership
- stop conditions
- when to let the agent keep iterating vs when the human should intervene
