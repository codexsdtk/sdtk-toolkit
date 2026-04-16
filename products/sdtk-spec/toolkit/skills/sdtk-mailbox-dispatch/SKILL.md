---
name: sdtk-mailbox-dispatch
description: Controller-owned mailbox delegation for SDTK-SPEC. Use when PM or Orchestrator needs to assign a bounded phase to Claude or Codex, preserve exact include/exclude boundaries, review raw reports against formal artifacts, and run a mandatory post-issue mailbox retrospective.
---

# SDTK Mailbox Dispatch

Use this skill only for controller-owned delegation. It is the shipped SDTK-SPEC mailbox flow for bounded PM or Orchestrator dispatch, not a generic autonomous worker platform.

## Critical Constraints
- I do not use mailbox dispatch for broad exploratory planning when the controller already has enough local context to plan safely.
- I do not mix transient runtime files under `governance/ai/agent-mailbox/runtime/` into feature commit boundaries.
- I do not widen include/exclude boundaries, fallback rules, or verification commands without an explicit controller decision.
- I do not leak internal backlog IDs into runtime-facing docs, templates, samples, or public guidance.

## Use When
- one bounded issue phase should be delegated through the mailbox runtime
- runtime choice between Claude and Codex matters
- the task needs exact include/exclude boundaries and a stable review packet
- the phase is implementation, review, QA, or controller acceptance
- you want the closeout loop to absorb new mailbox lessons automatically

## Do Not Use
- broad exploratory planning when the controller already has enough local context
- unbounded multi-issue orchestration or a generic worker platform
- tasks that require a direct external-CLI-to-chat-session bridge

## Required Inputs
Read these shipped toolkit surfaces before dispatching or reviewing a run:
- `toolkit/templates/mailbox/AGENT_TASK_TEMPLATE.md`
- `toolkit/templates/mailbox/AGENT_REPORT_TEMPLATE.md`
- `toolkit/scripts/agents/run-claude-task.ps1`
- `toolkit/scripts/agents/run-codex-task.ps1`
- current issue spec/plan/review artifacts for the bounded phase
- current git truth for the included surfaces

## Workflow
1. Decide whether the controller should plan locally first. Default to local planning when the codebase context is already strong.
2. Choose runtime:
   - Claude for controller spec drafting, wording-heavy review, and SDTK-SPEC shaping
   - Codex for code changes, tests, workflow/harness changes, and verification-heavy implementation
3. Write the task packet with exact boundary truth, boundary mode, carryover findings, formal artifact write expectation, explicit execution permission, a complete approval record for any writable implementation run, an explicit runtime-stall budget plus fallback trigger, and a clear closeout mode (`full-issue` or `phase-only`).
4. For implementation runs, list the exact authoritative input files needed to start the patch; do not rely on repo-wide example hunts as an unstated discovery step.`r`n5. Dispatch through the mailbox launcher into `governance/ai/agent-mailbox/runtime/...`.
6. Review the raw report against git truth and the formal artifact on disk. Prefer the formal artifact when console output is lossy. If an implementation run timed out or exited without a usable report, expect a launcher-authored partial-failure blocker report instead of a missing report file.
7. For `controller-dev-review`, `qa-review`, and `controller-acceptance`, keep the primary formal artifact on the canonical filename family and canonical verdict vocabulary for that phase. The launcher validates `toolkit/scripts/agents/validate-mailbox-formal-artifact.py` automatically when the artifact exists.
8. Promote only approved code/docs/tests/artifacts into tracked paths.
9. Run a default post-issue retrospective before the next mailbox-driven issue:
   - update the mailbox contract/spec if a real new lesson appeared
   - otherwise record `no new mailbox lessons` in the closeout summary

## Boundary Rules
- Treat runtime files under `governance/ai/agent-mailbox/runtime/` as transient.
- Do not mix mailbox runtime dirt into feature commit boundaries.
- State explicitly whether a batch is `canonical-only` or includes packaged distribution parity.
- Keep review, QA, and controller-acceptance phases read-only by default; writable implementation runs require explicit human-approved permission metadata in the task packet.
- Keep internal backlog IDs out of runtime-facing docs, templates, and public guidance.
- Treat listed Inputs: as the authoritative starting source set for implementation runs; broad repo-wide discovery is a fallback only when a direct dependency is missing.

## Fallback Rules
- If an external runtime stalls, use a bounded fallback path instead of blocking the issue. Long-running Codex implementation runs should now terminate within the declared stall budget and emit a launcher-authored partial-failure blocker report when a usable report is missing.
- For long implementation passes, one bounded external attempt is enough before controller-local or native fallback if the trigger defined in the task packet is reached.
- If quota or permission prevents the agent from writing the formal artifact, the controller may author it directly, but the artifact must state the fallback reason.
- QA and controller acceptance may inherit fresh controller verification only when the implementation scope is unchanged and the inheritance is declared explicitly.
- If the controller fixes a bounded hygiene defect between phases, later mailbox tasks must review current repo truth and treat the resolved defect as fixed instead of repeating stale findings from earlier raw reports.

## Default Phase Order
1. `controller-spec` or `plan`
2. `implementation`
3. `controller-dev-review`
4. `qa-review`
5. `controller-acceptance`
6. `commit/push`
7. `post-issue-retrospective`
