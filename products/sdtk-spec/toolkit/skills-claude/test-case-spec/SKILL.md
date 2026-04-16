---
name: test-case-spec
description: Generate screen-based QA test-case markdown in Excel-aligned layout (Statistic + per-screen UTC/ITC worksheets). Use when QA needs reusable test design artifacts before or during execution.
---

## Required Inputs (read before proceeding)
Read the following artifacts for the current feature:
1. `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` - screen/flow references
2. `docs/specs/BA_SPEC_[FEATURE_KEY].md` - business rules, use cases
3. `docs/api/[FEATURE_KEY]_ENDPOINTS.md` - API reference
4. `docs/specs/Q&A.md` or `docs/en/specs/Q&A.md` - clarification source (when available)

## Input
$ARGUMENTS

# SDTK-SPEC Test Case Spec

## Critical Constraints
- I do not invent test coverage beyond BA, flow-action, and API sources.
- I do not let test totals drift away from worksheet rows or the QA baseline.
- I do not emit a final TEST_CASE artifact without applying `./references/TEST_CASE_CREATION_RULES.md`.
- I do not renumber stable case IDs only because of regrouping; stable IDs preserve traceability.

## Outputs
- `docs/qa/[FEATURE_KEY]_TEST_CASE.md`
- Optional project variant:
  - `docs/en/qa/[FEATURE_KEY]_TEST_CASE.md` (only when project uses `docs/en/**`)

## Required Inputs
- Feature key (`FEATURE_KEY`)
- Screen/flow references:
  - `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`
  - `docs/specs/BA_SPEC_[FEATURE_KEY].md`
- API reference:
  - `docs/api/[FEATURE_KEY]_ENDPOINTS.md`
  - (optional) `docs/api/[FeaturePascal]_API.yaml`
- Clarification source:
  - `docs/specs/Q&A.md` or `docs/en/specs/Q&A.md` when available

## When To Stop Or Escalate
- Stop if `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` does not exist; do not design test cases without a finalized flow-action spec as the primary source of truth for UI coverage.
- Stop if the Statistic Summary cannot be completed because test counts cannot be verified against the available flow/action rows; surface the gap rather than estimating.
- Stop if a coverage claim requires a requirement that is marked OQ-xx and still OPEN; track the gap explicitly in the Open Questions section rather than assuming resolution.
- Escalate to `/qa` or `sdtk-qa` if the test-case scope intersects a release decision that requires the QA Release Report.
- Escalate to `@ba` if a BA requirement is ambiguous for a test case that depends on it.

## Core Process
1. Apply `./references/TEST_CASE_CREATION_RULES.md` first.
2. Resolve output path:
   - default `docs/qa/[FEATURE_KEY]_TEST_CASE.md`
   - use `docs/en/qa/...` only if the repo already follows `docs/en/**`.
3. Build/refresh `Statistic Summary (Excel-aligned)` with UT total, IT total, and grand total.
4. Build `Feature Coverage Matrix` from flow/action and API docs.
5. Split UTC/ITC by screen sections (`screen-first`), not by test type only.
6. Fill conflict/permission/error-path cases from Q&A decisions and API contracts.
7. Record unresolved items in section `Open Questions`.
8. Keep section order fixed: Statistic -> Abbreviations -> Scope -> References -> Environment -> Coverage -> Screen-based UTC/ITC -> OQ -> STC/UAT note.
9. Keep one unified 18-column schema for UTC/ITC rows.
10. Keep stable case IDs; do not renumber only because of regrouping.
11. Track unresolved decisions via `OQ-xx` and keep benchmark-expected OQs explicitly OPEN per `governance/ai/core/SDTK_BENCHMARK_OQ_POLICY.md`.

## Validation / Quality Gates
- Statistic Summary totals match the actual row counts in UTC/ITC tables.
- Structured TEST_CASE total stays aligned with the QA release-report baseline; E2E tracked separately if applicable.
- No placeholder tokens such as `??` remain in any field.
- Out-of-scope boundaries are explicitly stated.
- Open OQ-xx items are explicitly listed and not silently collapsed.
- Run `scripts/validate_test_case_spec.py` before finalizing.

## Order-Critical Hard Gate
Do not build the coverage matrix or test rows before applying `./references/TEST_CASE_CREATION_RULES.md`. The rules define mandatory column schema and section order; skipping them produces non-Excel-aligned output that must be reformatted before QA handoff.

Do not finalize the artifact before verifying Statistic Summary totals match table row counts. Drifted totals are a hard failure at QA review.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Skip TEST_CASE_CREATION_RULES.md and free-form the layout | Produces non-conformant column schema | Always read and apply the rules before writing any row |
| Let Statistic Summary totals drift from table row counts | Hard failure at QA review | Verify totals against actual rows before finalizing |
| Renumber stable case IDs during regrouping | Breaks traceability with existing defect refs | Preserve case IDs; regroup without renumbering |
| Leave `??` placeholders in any field | Incomplete test cases cannot be executed | Resolve or escalate every ambiguity before finalizing |
| Invent coverage beyond available sources | Creates untraceable test claims | Only claim coverage for requirements present in BA/flow/API sources |
| Collapse OPEN OQ-xx items silently | Hides unresolved gaps from QA | Keep OQ-xx explicitly OPEN in the Open Questions section |

## Role Integration
- Primary owner: `/qa`.
- `/qa` uses this skill to design/update reusable test-case specs.
- `/qa` still owns release decision artifact (`QA_RELEASE_REPORT_*`).

## Notes
- This skill is for test-case specification artifacts, not test execution logs.
- For release approval and defect triage, continue with `/qa`.

## Validator Script
- `scripts/validate_test_case_spec.py`

### Typical command
```bash
python scripts/validate_test_case_spec.py \
  --file "docs/qa/[FEATURE_KEY]_TEST_CASE.md"
```

## Reference Loading Guidance
Read at skill start:
- `./references/TEST_CASE_CREATION_RULES.md` (required before any row generation)

Read at slice start:
- `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` (required)
- `docs/specs/BA_SPEC_[FEATURE_KEY].md` (required)
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md` (required)

Read on demand:
- `docs/specs/Q&A.md` or `docs/en/specs/Q&A.md` (when clarification is needed)
- `governance/ai/core/SDTK_BENCHMARK_OQ_POLICY.md` (when OQ-xx items need policy guidance)
