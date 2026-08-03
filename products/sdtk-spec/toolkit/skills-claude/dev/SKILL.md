---
name: dev
description: Developer planning workflow for SDTK-SPEC. Use when you need to convert ARCH_DESIGN plus BACKLOG into a scoped implementation plan, readiness decision, and formal SDTK-CODE handoff.
---

## SDTK-SPEC Pipeline Rules (always apply)
1. Pipeline: PM Initiation -> BA Analysis -> PM Planning -> Architecture Design -> Development Planning + SDTK-CODE Handoff -> QA Validation
2. After completing phase work: update SHARED_PLANNING.md + QUALITY_CHECKLIST.md
3. If unclear: log OQ-xx in artifact, escalate to PM (PM asks user if needed)
4. Traceability: REQ -> BR/UC/AC -> design -> backlog -> FEATURE_IMPL_PLAN -> CODE_HANDOFF -> downstream implementation evidence -> QA
5. `/dev` stops at planning plus handoff; downstream code execution belongs to SDTK-CODE by default
6. Do not skip phases. If inputs missing, ask focused questions.

## Prerequisites (verify before proceeding)
Read QUALITY_CHECKLIST.md and verify:
- Phase 3 ARCH Design gate must show all items [x] Done.

If prerequisites are not met: report which gate is missing, suggest user run `/arch` first.

## Current Context
- Config: !`node -e "try{process.stdout.write(require('fs').readFileSync('sdtk-spec.config.json','utf8'))}catch{process.stdout.write('{}')}"`
- Pipeline: !`node -e "try{process.stdout.write(require('fs').readFileSync('SHARED_PLANNING.md','utf8'))}catch{process.stdout.write('Not initialized')}"`
- Gates: !`node -e "try{process.stdout.write(require('fs').readFileSync('QUALITY_CHECKLIST.md','utf8'))}catch{process.stdout.write('Not initialized')}"`
- State: !`node -e "try{process.stdout.write(require('fs').readFileSync('.sdtk/orchestration-state.json','utf8'))}catch{process.stdout.write('{}')}"`

## Input
$ARGUMENTS

If no arguments provided, read current feature context from SHARED_PLANNING.md.

# SDTK-SPEC DEV (Planning + SDTK-CODE Handoff)

## Outputs
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`

## Process
1. Read `ARCH_DESIGN_*` + backlog.
2. Read `sdtk-spec.config.json` for project stack + test/lint commands.
3. Write or refine `FEATURE_IMPL_PLAN_*`:
   - implementation slices in the recommended downstream build order
   - required refs
   - optional refs
   - test obligations written as implementation-ready acceptance mapping statements
   - blockers and OQ items
4. If anything is unclear: record OQ-xx in `FEATURE_IMPL_PLAN` and escalate to PM (suggest user run `/pm` for a decision if still missing info).
5. Decide readiness:
   - `READY_FOR_SDTK_CODE`, or
   - `BLOCKED_FOR_SDTK_CODE`
6. Generate `CODE_HANDOFF_*` with `toolkit/scripts/generate-code-handoff.ps1`.
   - Canonical writer rule: the machine-readable JSON is generator-owned; do not hand-author or patch the JSON shape manually.
   - If an existing `CODE_HANDOFF_*` file is non-canonical, regenerate it with the script and `-Force` instead of editing keys by hand.
   - Use the script-owned snake_case contract only. Do not emit legacy camelCase keys such as `featureKey`, `requiredRefs`, `optionalRefs`, `openBlockers`, `implementationSlices`, `testObligations`, or `suggestedNextCommand`.
   - Current canonical emission is schema `0.2`; the generator auto-derives `impact_map` from the current handoff refs and may include optional `recovery_notes`.
   - For approval/workflow features, follow `toolkit/templates/handoffs/DEV_TO_SDTK_CODE.md` as the authoritative domain note. Keep state-machine-first slice ordering, populate workflow `impact_map` refs explicitly, cover all four workflow test-obligation categories, and carry unresolved workflow `OQ-xx` items as `open_blockers` instead of hiding them.
7. Update `SHARED_PLANNING.md` + `QUALITY_CHECKLIST.md` Phase 4.
8. If ready, suggest:
   - `sdtk-code start --feature-key <KEY> --lane <feature|bugfix> --project-path .`
9. Do not claim that `/dev` executed downstream code, build, verify, ship, or QA handoff.
