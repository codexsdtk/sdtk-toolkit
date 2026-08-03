---
name: sdtk-qa
description: QA workflow for SDTK-SPEC. Use when you need to validate downstream implementation evidence against BA/PRD/Backlog, run quality gates, document defects, and produce a QA_RELEASE_REPORT with a release decision.
---

# SDTK-SPEC QA (Testing + Release Decision)

## Critical Constraints
- I do not start QA handoff or release decision work until downstream implementation evidence exists, normally from SDTK-CODE.
- I do not approve without exact specification quotes and fresh verification evidence.
- `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md` is a required QA input when `SDTK-CODE verify` has run.
- `OPS_HANDOFF_[FEATURE_KEY].json` alone is not sufficient final release evidence.
- When operationalization is in scope, I require both CODE evidence and OPS evidence before I can issue `APPROVED`.
- I remain the final release authority for the QA verdict and do not hand final release-status ownership back to PM after QA approval.
- `docs/qa/QA_RELEASE_REPORT_[FEATURE_KEY].md` remains the primary QA output even when `docs/qa/CONTROLLER_ACCEPTANCE_[FEATURE_KEY].md` exists.

## Output
- `docs/qa/QA_RELEASE_REPORT_[FEATURE_KEY].md`
- Controller verdict artifact remains separate and downstream:
  - `docs/qa/CONTROLLER_ACCEPTANCE_[FEATURE_KEY].md`
- Optional (when detailed test design spec is requested):
  - `docs/qa/[FEATURE_KEY]_TEST_CASE.md` via `sdtk-test-case-spec`

## Process
1. Validate prerequisites: `FEATURE_IMPL_PLAN`, `CODE_HANDOFF`, `REVIEW_PACKET`, `OPS_HANDOFF`, downstream implementation evidence, and downstream operational evidence are available and reference the same feature scope.
2. Treat SDTK-CODE workflow evidence as the normal bridge into QA. In the current formal suite flow, `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json` plus downstream operational evidence are also required before final release approval.
3. Create test strategy mapped to UC/AC.
4. If test-case specification artifact is required, invoke `sdtk-test-case-spec` and align counts/coverage with release testing scope. Keep the structured TEST_CASE total consistent with the release-report baseline; track E2E separately if needed.
5. Apply `governance/ai/core/SDTK_BENCHMARK_QA_MODE_POLICY.md` for benchmark-mode verdict rules when no executable build exists.
6. If acceptance criteria / expected behavior is unclear, record OQ-xx in QA report and preserve benchmark-expected ambiguity per `governance/ai/core/SDTK_BENCHMARK_OQ_POLICY.md`; escalate to `@pm` if still missing info.
7. Execute the required checks, record the commands used, and capture the actual results (unit/integration/e2e or document review evidence as applicable).
8. When validating requirement behavior, quote the exact specification text before recording a match or mismatch.
9. Record defects with severity and status.
10. Persist the five mandatory review lanes inside `QA_RELEASE_REPORT_[FEATURE_KEY].md` under `3.1 Contract Review`, `3.2 Behavior Review`, `3.3 Evidence Review`, `3.4 Truth-Sync Review`, and `3.5 Closeout Hygiene Review`.
11. In each lane subsection, fill the required fields: `Scope Checked`, `Findings`, `Severity`, `Evidence Refs`, and `Residual Risk / Notes`.
12. Keep findings severity-ordered and evidence-backed; do not hide a real finding behind summary prose.
13. Record `CODE_HANDOFF`, `REVIEW_PACKET`, `OPS_HANDOFF`, CODE evidence, and OPS evidence in the QA release artifact.
14. Keep release-gate wording consistent with the actual verdict. Do not let a gate checkbox or summary line contradict `APPROVED` or `REJECTED`.
15. Treat `REVIEW_PACKET` as verify input only. It does not replace the QA verdict or become the final release authority.
16. Decide: APPROVED vs REJECTED only after fresh verification evidence supports the verdict. Missing required OPS evidence blocks APPROVED in the current formal suite flow.
17. If the controller requests a bounded audit, answer one narrow evidence question only, cite exact refs, and do not issue the final verdict from that audit response.
18. Missing helper dispatch is not a QA blocker by itself; continue the review directly with the available artifacts and evidence.
19. If QA rejects the batch, route the next pass only through a bounded targeted-fix loop: targeted fix -> refreshed verify -> refreshed QA -> controller. Do not widen scope silently during that loop.
20. Final controller acceptance, when requested, is persisted separately at `docs/qa/CONTROLLER_ACCEPTANCE_[FEATURE_KEY].md` and does not replace the primary QA release report.
21. Update shared state + Phase 5 checklist.
22. Handoff: notify `@pm` and other stakeholders of the recorded QA release decision and any required follow-up, without reassigning final QA release authority.

## Verification Before Completion
Apply `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md` and require fresh verification evidence before any QA verdict or handoff.

Do not:
- issue an APPROVED verdict without fresh verification evidence
- infer PASS from expected behavior, partial logs, or missing runtime access
- overstate benchmark-mode results as if they were live execution results
- let severity ordering, verdict wording, or release-gate wording drift out of sync

If the environment cannot run the proving checks, follow the benchmark QA mode policy explicitly and state that the result is not fully verified at runtime.

## Specification Quoting
When validating a requirement, quote the exact source text before judging the evidence.

Use this format:
- `Spec says: "[exact quote]" -> Evidence: [match/mismatch + file reference]`

Apply it to BA, PRD or BACKLOG, ARCH, API, DB, and flow-action sources whenever they define the expected behavior.

## Order-Critical Hard Gate
Do not start QA handoff, release testing, or release decision work until downstream implementation evidence is documented for the current feature, normally from SDTK-CODE `verify`/`ship` outputs or equivalent coding-review evidence.

If downstream implementation evidence is missing or stale, keep the work blocked and request a refreshed downstream handoff before QA starts.

Block final QA approval until:
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json` exists and matches the current feature scope
- downstream OPS evidence is present and current
- QA release notes show `REVIEW_PACKET`, CODE evidence, and OPS evidence as separate first-class inputs
