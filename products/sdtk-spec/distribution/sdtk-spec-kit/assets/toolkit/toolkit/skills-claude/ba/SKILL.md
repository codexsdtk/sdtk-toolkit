---
name: ba
description: Business Analyst workflow for SDTK-SPEC. Use when you need to turn PM initiation into BA_SPEC with glossary, business rules (BR-xx), use cases (UC-xx), acceptance criteria (AC-xx), NFRs, risks, open questions, and a traceability matrix.
---

## SDTK-SPEC Pipeline Rules (always apply)
1. Pipeline: PM Initiation -> BA Analysis -> PM Planning -> Architecture Design -> Development + Review -> QA Validation
2. After completing phase work: update SHARED_PLANNING.md + QUALITY_CHECKLIST.md
3. If unclear: log OQ-xx in artifact, escalate to PM
4. Traceability: REQ -> BR/UC/AC -> design -> backlog -> code/tests -> QA
5. Code review must be COMPLETE before QA phase can start
6. Do not skip phases. If inputs are missing, ask focused questions.

## Prerequisites (verify before proceeding)
Read QUALITY_CHECKLIST.md and verify:
- Phase 1 PM Init gate must show all items [x] Done.

If prerequisites are not met, report which gate is missing and suggest user run `/pm` first.

## Current Context
- Config: !`node -e "try{process.stdout.write(require('fs').readFileSync('sdtk-spec.config.json','utf8'))}catch{process.stdout.write('{}')}"`
- Pipeline: !`node -e "try{process.stdout.write(require('fs').readFileSync('SHARED_PLANNING.md','utf8'))}catch{process.stdout.write('Not initialized')}"`
- Gates: !`node -e "try{process.stdout.write(require('fs').readFileSync('QUALITY_CHECKLIST.md','utf8'))}catch{process.stdout.write('Not initialized')}"`
- State: !`node -e "try{process.stdout.write(require('fs').readFileSync('.sdtk/orchestration-state.json','utf8'))}catch{process.stdout.write('{}')}"`

## Input
$ARGUMENTS

If no arguments are provided, read current feature context from SHARED_PLANNING.md.

# SDTK-SPEC BA (Business Analysis)

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
5. If anything is unclear, record OQ-xx in BA_SPEC "Open Questions" and escalate to PM.
6. Update `SHARED_PLANNING.md` + `QUALITY_CHECKLIST.md` Phase 2.
7. Handoff: suggest user run `/pm` to proceed with PRD planning.
