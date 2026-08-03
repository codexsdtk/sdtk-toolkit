# bugfix-hotfix-flow

## Requirement Summary
- Small but risky bug fix or hotfix where the team needs speed without losing traceability.
- Designed to show which SDTK controls can be narrowed and which ones remain mandatory.

## Run Order
1. PM initiation with a tightly scoped change note
2. BA analysis focused on affected requirements and acceptance criteria
3. PM planning with a narrow backlog slice
4. ARCH design only for affected architecture, API, DB, or UI surfaces
5. DEV implementation and two-stage review
6. QA validation and release decision

## What Can Be Reduced
- PM and BA artifact depth can be shorter than a net-new feature.
- ARCH scope can be limited to changed components and impacted artifacts only.

## What Remains Mandatory
- `SHARED_PLANNING.md` and `QUALITY_CHECKLIST.md`
- explicit impacted requirements and acceptance criteria
- affected ARCH outputs when API, DB, or UI behavior changes
- DEV Stage 1 and Stage 2 review gates
- QA evidence before release decision

## What Must Not Be Bypassed
- verification-before-completion policy
- ARCH hard gate for UI scope (`DESIGN_LAYOUT` before `FLOW_ACTION_SPEC`)
- QA handoff gate requiring both DEV review stages PASS

## Common Mistakes
- treating a hotfix as permission to skip BA or QA traceability
- editing API or DB behavior without refreshing impacted ARCH artifacts
- approving the fix from intuition instead of fresh proving evidence
