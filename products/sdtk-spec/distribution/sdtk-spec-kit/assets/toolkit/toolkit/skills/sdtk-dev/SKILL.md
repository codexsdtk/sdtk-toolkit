---
name: sdtk-dev
description: Developer planning workflow for SDTK-SPEC. Use when you need to convert ARCH_DESIGN plus BACKLOG into a scoped implementation plan, readiness decision, and formal SDTK-CODE handoff.
---

# SDTK-SPEC DEV (Planning + SDTK-CODE Handoff)

## Critical Constraints
- I do not emit `READY_FOR_SDTK_CODE` until the current `FEATURE_IMPL_PLAN` scope is approved and all required upstream refs are explicit.
- I do not claim downstream implementation is complete from within `/dev`.

## Outputs
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json` after CODE phase completion and human-approved readiness review

## Legacy Prompt Templates
- `./prompts/implementer.md`
- `./prompts/spec-reviewer.md`
- `./prompts/code-quality-reviewer.md`

These prompt templates remain in the repo as transition-only manual helper assets.
They are not the default `/dev` workflow in this wave.
Use them only when the user explicitly requests a manual legacy review or delegated implementation experiment outside the normal `/dev -> SDTK-CODE` path.

## Process
1. Read `ARCH_DESIGN_*` + backlog.
2. Read `sdtk-spec.config.json` for project stack + test/lint commands.
3. Write or refine `FEATURE_IMPL_PLAN_*`:
   - issue summary and scope
   - explicit non-goals
   - implementation slices in the recommended downstream build order
   - required refs
   - optional refs
   - issue-specific test obligations using implementation-ready acceptance mapping statements and real executable commands
   - blockers and open questions
4. If anything is unclear: record OQ-xx in `FEATURE_IMPL_PLAN` and escalate to `@pm` for a decision.
5. Decide readiness:
   - `READY_FOR_SDTK_CODE` when the current slice is concrete enough for downstream coding
   - `BLOCKED_FOR_SDTK_CODE` when blockers remain
6. Generate `CODE_HANDOFF_*` with `toolkit/scripts/generate-code-handoff.ps1`.
   - Canonical writer rule: the machine-readable JSON is generator-owned; do not hand-author or patch the JSON shape manually.
   - If an existing `CODE_HANDOFF_*` file is non-canonical, regenerate it with the script and `-Force` instead of editing keys by hand.
   - Use the script-owned snake_case contract only. Do not emit legacy camelCase keys such as `featureKey`, `requiredRefs`, `optionalRefs`, `openBlockers`, `implementationSlices`, `testObligations`, or `suggestedNextCommand`.
   - Current canonical emission is schema `0.2`; the generator auto-derives `impact_map` from the current handoff refs and may include optional `recovery_notes`.
   - For approval/workflow features, follow `toolkit/templates/handoffs/DEV_TO_SDTK_CODE.md` as the authoritative domain note. Keep state-machine-first slice ordering, populate workflow `impact_map` refs explicitly, cover all four workflow test-obligation categories, and carry unresolved workflow `OQ-xx` items as `open_blockers` instead of hiding them.
7. Mirror the same readiness decision in the final `SDTK-CODE Handoff` section of `FEATURE_IMPL_PLAN`.
   - Do not copy placeholder `UPDATE_ME` commands from `sdtk-spec.config.json` into the handoff plan as if they were executable proof.
8. After CODE_HANDOFF is generated and the feature has been implemented and verified by SDTK-CODE,
   author `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json` for operational readiness handoff.
   - Creation rules: `toolkit/templates/docs/dev/OPS_HANDOFF_CREATION_RULES.md`
   - Schema version must be `"0.1"`. Required top-level fields: `schema_version`, `feature_key`,
     `ops_handoff_status`, `source_handoff_ref`, `non_claims`, `deploy_starter`,
     `env_expectations`, `health_check_baseline`, `monitoring_baseline`, `rollback_starter`,
     `human_gates`. Optional: `open_questions`.
   - The `non_claims` array must include the six minimum entries defined in the creation rules.
     The handoff does not automate deployment, does not configure CI/CD pipelines, does not
     configure a production monitoring platform, and does not provide automated rollback.
   - Gate H5 must be present in `human_gates`. A human controller must review and approve the
     OPS_HANDOFF artifact before any deployment action proceeds. This gate is not optional and
     cannot be satisfied by automated review alone.
   - Set `ops_handoff_status` to `"READY_FOR_OPS_REVIEW"` only after all required fields are
     complete, the authoring checklist in the creation rules passes, and all blocking
     open_questions are resolved. Use `"BLOCKED_FOR_OPS_REVIEW"` when any blocking question
     remains unresolved.
   - Do not hand-author fields derived from CODE_HANDOFF without verifying the source artifact.
     Read `source_handoff_ref` before completing `deploy_starter` and `env_expectations`.
   - This is starter-level guidance for a bounded small-app internal deployment only.
     Do not claim production automation, cloud-platform management, or CI/CD pipeline
     configuration in any field of the OPS_HANDOFF artifact.
9. Update `SHARED_PLANNING.md` + `QUALITY_CHECKLIST.md` Phase 4 to show planning/handoff completion status.
10. Handoff:
   - if ready: suggest the exact `sdtk-code start --feature-key <KEY> --lane <feature|bugfix> --project-path .` command
   - if blocked: list blockers and keep the work in `/dev`

## Delegated Execution Contract
- The implementer subagent receives the full task text directly in the prompt when the user explicitly requests manual legacy execution.
- Required implementer status values:
  - `DONE`
  - `DONE_WITH_CONCERNS`
  - `NEEDS_CONTEXT`
  - `BLOCKED`
- `DONE_WITH_CONCERNS` means the task is complete but the controller must read the concerns before review.
- `NEEDS_CONTEXT` means the controller must supply missing information and re-dispatch.
- `BLOCKED` means do not retry the same task unchanged; resolve the blocker first.
- The spec reviewer must verify real artifacts, not trust implementer claims.
- The code-quality reviewer is a second-stage review and must not run before spec compliance passes.
- This legacy review loop is optional and manual in this wave; it is not the default `/dev` contract.

## Model Selection Guidance
Choose the cheapest model that can safely complete the task without creating avoidable rework.

| Task type | Recommended model tier | Why |
|---|---|---|
| Single-file mechanical change with a clear spec | Fast model | Useful for legacy/manual helper tasks, not the default handoff path |
| Multi-file integration that follows an approved plan | Standard model | Useful when manually validating scope or reviewing downstream constraints |
| Architecture or design tradeoff for the current implementation slice | Most capable model | Requires judgment and ambiguity handling |
| Stage 1 artifact/spec review | Standard model | Legacy/manual review aid only |
| Stage 2 code-quality review | Standard or most capable model | Legacy/manual review aid only |
| Cross-artifact consistency investigation | Most capable model | Requires broader synthesis across docs and handoff inputs |

Blocked-task rule:
- If an implementer returns `BLOCKED`, do not force the same model to retry the same task unchanged.
- First resolve missing context or reduce task scope.
- Escalate to a stronger model only when the blocker is judgment or synthesis bound, not because the prompt was incomplete.

## Verification Before Completion
Apply `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md`.

Do not:
- say the handoff is ready without validating the current refs, blockers, slices, and obligations
- cite downstream readiness without fresh verification evidence for the claim
- use `should`, `probably`, or `seems` in place of executed checks
- rely on partial output, stale command runs, or unchecked agent reports
- manually compose `CODE_HANDOFF` JSON when the canonical generator script is available

If validation fails or cannot be run, report the handoff as blocked and explain the blocker.

## Order-Critical Hard Gate
Do not emit `READY_FOR_SDTK_CODE` until `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md` exists and the current execution scope is explicitly approved in that plan for downstream implementation.

If the plan is missing, incomplete, or still awaiting approval for the current task slice, stop and update the plan first. Do not emit the handoff first and backfill the plan later.

Do not let placeholder commands, vague slice names, or missing required refs stand in for real downstream readiness.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Treat `/dev` as the place where final code and QA handoff happen | Collapses the boundary between SDTK-SPEC and SDTK-CODE | Stop `/dev` at `FEATURE_IMPL_PLAN + CODE_HANDOFF` |
| Emit `READY_FOR_SDTK_CODE` with missing refs or vague slices | Pushes ambiguity downstream and weakens handoff quality | Make refs, slices, obligations, and blockers explicit before the handoff |
| Retry a `BLOCKED` manual helper prompt with the same context | Repeats the same failure mode | Add missing context, split the task, or keep the handoff blocked |
| Copy `UPDATE_ME` placeholder commands into the plan as if they were executable verification | Fakes downstream readiness and weakens verification-before-completion | Replace placeholders with issue-specific real commands or state truthfully that a project-level command is unknown |
