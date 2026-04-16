---
name: sdtk-ba
description: Business Analyst workflow for SDTK-SPEC. Use when you need to turn PM initiation into BA_SPEC with glossary, business rules (BR-xx), use cases (UC-xx), acceptance criteria (AC-xx), NFRs, risks, open questions, and a traceability matrix.
---

# SDTK-SPEC BA (Business Analysis)

## Critical Constraints
- I do not mark BA analysis complete until `REQ`, `UC`, `BR`, and `AC` traceability is explicit.
- I do not silently resolve business ambiguities that belong to PM or the user.

## Output
- `docs/specs/BA_SPEC_[FEATURE_KEY].md`

## Optional: Condensed Upstream Input

If a condensed upstream input package was produced before PM initiation, read it
alongside `docs/product/PROJECT_INITIATION_[FEATURE_KEY].md`. The package is at:
`docs/product/CONDENSED_UPSTREAM_INPUT_[FEATURE_KEY].md`

The condensed package is a DRAFT accelerator only. All derived actors, entities,
rules, and acceptance criteria require human review before adoption. Do not treat
draft content as authoritative without explicit PM or maintainer confirmation.

For approval/workflow domain packages, the condensed package also includes a
Role Matrix, State Set, State Transitions, and Policy And Approval Rules
sections. When producing BR-xx and UC-xx items in BA_SPEC, read these sections
alongside the Actors and Workflow Entities sections. Any unresolved open
questions from the Open Questions For Human Review section must be carried
forward as explicit OQ-xx items in BA_SPEC rather than silently resolved.

## Process
1. Read `docs/product/PROJECT_INITIATION_[FEATURE_KEY].md` and any source requirements.
2. Produce:
   - Glossary
   - BR-xx (numbered)
   - UC-xx (cover 100% REQ-xx)
   - AC-xx (mapped to UC/BR)
   - NFR-xx
   - Risks + Open Questions
   - Traceability summary table (REQ -> UC/BR/AC)
3. If source requirements are VI/JP, preserve the original text and add a literal EN translation in appendices.
4. For benchmark runs, apply `governance/ai/core/SDTK_BENCHMARK_OQ_POLICY.md`: keep benchmark-expected open questions explicitly OPEN and do not silently resolve them in BA output.
5. If anything is unclear, record OQ-xx in BA_SPEC "Open Questions" and escalate to `@pm` for a decision.
6. Update `SHARED_PLANNING.md` and `QUALITY_CHECKLIST.md` Phase 2.
7. Handoff: `@pm specs ready for PRD`.
