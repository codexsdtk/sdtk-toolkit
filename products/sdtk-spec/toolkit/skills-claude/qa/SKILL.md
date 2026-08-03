---
name: qa
description: QA workflow for SDTK-SPEC. Use when you need to validate downstream implementation evidence against BA/PRD/Backlog, run quality gates, document defects, and produce a QA_RELEASE_REPORT with a release decision.
---

## SDTK-SPEC Pipeline Rules (always apply)
1. Pipeline: PM Initiation -> BA Analysis -> PM Planning -> Architecture Design -> Development Planning + SDTK-CODE Handoff -> QA Validation
2. After completing phase work: update SHARED_PLANNING.md + QUALITY_CHECKLIST.md
3. If unclear: log OQ-xx in artifact, escalate to PM
4. Traceability: REQ -> BR/UC/AC -> design -> backlog -> FEATURE_IMPL_PLAN -> CODE_HANDOFF -> downstream implementation evidence -> OPS_HANDOFF + downstream OPS evidence -> QA
5. QA waits for downstream implementation evidence, normally from SDTK-CODE, plus downstream OPS evidence in the current formal suite flow
6. Do not skip phases. If inputs are missing, ask focused questions.

## Prerequisites (verify before proceeding)
Read QUALITY_CHECKLIST.md and verify:
- Phase 4 DEV gate must show planning/handoff completion.
- Downstream implementation evidence exists for the same feature scope.
- `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md` exists for the same feature scope when `SDTK-CODE verify` has run.
- `OPS_HANDOFF` and downstream OPS evidence exist for the same feature scope.

If prerequisites are not met, report which gate or downstream evidence is missing and suggest user complete `/dev` or the SDTK-CODE flow first.

## Current Context
- Config: !`node -e "try{process.stdout.write(require('fs').readFileSync('sdtk-spec.config.json','utf8'))}catch{process.stdout.write('{}')}"`
- Pipeline: !`node -e "try{process.stdout.write(require('fs').readFileSync('SHARED_PLANNING.md','utf8'))}catch{process.stdout.write('Not initialized')}"`
- Gates: !`node -e "try{process.stdout.write(require('fs').readFileSync('QUALITY_CHECKLIST.md','utf8'))}catch{process.stdout.write('Not initialized')}"`
- State: !`node -e "try{process.stdout.write(require('fs').readFileSync('.sdtk/orchestration-state.json','utf8'))}catch{process.stdout.write('{}')}"`

## Input
$ARGUMENTS

If no arguments are provided, read current feature context from SHARED_PLANNING.md.

# SDTK-SPEC QA (Testing + Release Decision)

## Output
- `docs/qa/QA_RELEASE_REPORT_[FEATURE_KEY].md`
- `docs/qa/CONTROLLER_ACCEPTANCE_[FEATURE_KEY].md` remains a separate downstream controller artifact and does not replace the primary QA output
- Optional (when detailed test design spec is requested):
  - `docs/qa/[FEATURE_KEY]_TEST_CASE.md` via `/test-case-spec`

## Process
1. Validate prerequisites: `FEATURE_IMPL_PLAN`, `CODE_HANDOFF`, `REVIEW_PACKET`, `OPS_HANDOFF`, downstream implementation evidence, and downstream OPS evidence are available and aligned.
2. Treat SDTK-CODE workflow evidence as the normal bridge into QA. In the current formal suite flow, `OPS_HANDOFF` plus downstream OPS evidence are also required before final QA approval.
3. Create test strategy mapped to UC/AC.
4. If test-case specification artifact is required, invoke `/test-case-spec` and align counts/coverage with release testing scope. Keep the structured TEST_CASE total consistent with the release-report baseline; track E2E separately if needed.
5. Apply `governance/ai/core/SDTK_BENCHMARK_QA_MODE_POLICY.md` for benchmark-mode verdict rules when no executable build exists.
6. If acceptance criteria / expected behavior is unclear, record OQ-xx in QA report and preserve benchmark-expected ambiguity per `governance/ai/core/SDTK_BENCHMARK_OQ_POLICY.md`; escalate to PM.
7. Execute/record results (unit/integration/e2e as applicable).
8. Persist the five mandatory review lanes inside `QA_RELEASE_REPORT_[FEATURE_KEY].md` under `3.1 Contract Review`, `3.2 Behavior Review`, `3.3 Evidence Review`, `3.4 Truth-Sync Review`, and `3.5 Closeout Hygiene Review`.
9. In each lane subsection, fill `Scope Checked`, `Findings`, `Severity`, `Evidence Refs`, and `Residual Risk / Notes`.
10. Record defects with severity and status.
11. Record `CODE_HANDOFF`, `REVIEW_PACKET`, `OPS_HANDOFF`, CODE evidence, and OPS evidence in the QA release artifact.
12. If the controller requests a bounded audit, answer one narrow evidence question only, cite exact refs, and do not issue the final verdict from that audit response.
13. Missing helper dispatch is not a QA blocker by itself; continue the review directly with the available artifacts and evidence.
14. Decide: APPROVED vs REJECTED (with reasons). `OPS_HANDOFF` alone is not sufficient final release evidence, and missing required OPS evidence blocks approval.
15. Update shared state + Phase 5 checklist.
16. Handoff: notify PM and stakeholders of the QA verdict and follow-up without reassigning final QA release authority.
