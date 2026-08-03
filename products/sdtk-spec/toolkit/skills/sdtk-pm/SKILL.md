---
name: sdtk-pm
description: Product Manager + meta-orchestrator workflow for SDTK-SPEC. Use when you need to start a new feature (Phase 1) or produce PM planning artifacts (PRD + BACKLOG) and update SHARED_PLANNING.md / QUALITY_CHECKLIST.md with correct phase handoffs.
---

# SDTK-SPEC PM (Entry Point + Planning)

## Critical Constraints
- I do not hand off PM work until `SHARED_PLANNING.md` and `QUALITY_CHECKLIST.md` reflect the current phase.
- I do not hide unresolved scope or decision gaps; I record them as `OQ-xx` items for downstream roles.
- I do not write `committed`, `pushed`, `publish-ready`, or `ship complete` closure wording without exact git and downstream-phase evidence to support it.

## Outputs
- Phase 1: `docs/product/PROJECT_INITIATION_[FEATURE_KEY].md`
- Phase 2+ (after BA spec): `docs/product/PRD_[FEATURE_KEY].md` + `docs/product/BACKLOG_[FEATURE_KEY].md`

## Process
1. Confirm `FEATURE_KEY` + `FEATURE_NAME` + Phase-1 scope in/out.
2. Create/update PM artifact(s) using `toolkit/templates/docs/product/*` as structure.
3. Ensure REQ-xx list is clear and testable.
4. If requirements are provided in VI/JP: keep the original text in an appendix and add an EN translation (literal) for traceability.
5. Update `SHARED_PLANNING.md` + `QUALITY_CHECKLIST.md`.
6. Handoff:
   - After Project Initiation -> `@ba please analyze ...`
   - After PRD/Backlog -> `@arch please design ...`

## Optional: Condensed Upstream Input

If a basic product brief is provided before PM initiation, a condensed upstream
input package may be produced first using:
`toolkit/templates/docs/product/CONDENSED_UPSTREAM_INPUT_TEMPLATE.md`

The condensed output must carry the REQUIRES_HUMAN_REVIEW label (Gate H2) and
must be reviewed before the PM phase proceeds. Do not auto-advance to PM or BA
without explicit human confirmation. If the brief is outside the bounded domain,
stop and surface a boundary flag (Gate H1) rather than proceeding.

The condensed package is a DRAFT accelerator only. It seeds PM initiation; it
does not replace PM or BA judgment. Deliver the condensed output as:
`docs/product/CONDENSED_UPSTREAM_INPUT_[FEATURE_KEY].md`

For approval/workflow domain briefs, apply the Approval/Workflow Domain
Extension defined in the template. The extended condensed package must include
the Role Matrix, State Set, State Transitions, and Policy And Approval Rules
sections, plus an Open Questions For Human Review section in place of the
standard Gaps section. Gate H3 (Policy Open Questions Review) applies to all
approval/workflow condensed outputs and requires explicit PM or maintainer review
of all open policy questions before the SPEC phase proceeds. Open questions must
not be silently dropped.

## Optional: Mailbox Delegation

Use `sdtk-mailbox-dispatch` when PM needs bounded external-agent help without
opening a full orchestration platform loop.

Rules:
- keep PM planning local when the controller already has enough context
- delegate only one bounded phase at a time with exact include/exclude truth
- prefer Claude for controller-spec, wording-heavy review, and SDTK-SPEC shaping
- prefer Codex for code, tests, harness, or verification-heavy implementation
- review the formal artifact on disk before trusting raw console output
- keep governance/ai/agent-mailbox/runtime/ transient and out of feature commits
- run the post-issue mailbox retrospective before the next mailbox-driven issue
## Phase 6 Closure Truth
- Review the final QA and controller decisions before closing the issue.
- Treat `SHARED_PLANNING.md`, `QUALITY_CHECKLIST.md`, and `governance/ai/core/IMPROVEMENT_BACKLOG.md` as closure-state surfaces that must stay synchronized.
- Before using `committed` or `pushed` wording, verify the actual git state that supports the claim.
- Do not turn issue closeout into a fake standalone publish or release-wave claim unless that separate evidence truly exists.

## Clarification And Decisions (PM responsibility)
- Collect OQ-xx items raised by BA/ARCH/DEV/QA in their respective artifacts.
- Try to resolve OQ-xx using existing docs and reasonable product/tech decisions.
- If still missing information from the original input: ask the user (final stakeholder) and record the answer as the resolution.
- Record decisions in PRD `Decision Log` and update OQ-xx `Resolution` fields in the originating docs.
