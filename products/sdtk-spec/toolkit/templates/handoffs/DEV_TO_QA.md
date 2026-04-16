# DEV to QA Handoff (Legacy / Transition Only)

## Status
This template is not the default SDTK-SPEC path in this wave.
Default bridge:
- `/dev` -> `CODE_HANDOFF`
- SDTK-CODE downstream implementation
- `/qa` after downstream implementation evidence exists

## Required Inputs
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`
- downstream implementation evidence, normally from SDTK-CODE
- downstream operational evidence
- fresh proving checks used for QA handoff

## Required Outputs
- QA test scope
- explicit release-risk notes
- updated `SHARED_PLANNING.md`
- updated `QUALITY_CHECKLIST.md`

## Mandatory Checks
- downstream implementation evidence exists and is current
- `OPS_HANDOFF` and downstream operational evidence exist and are current
- `OPS_HANDOFF` alone is not treated as sufficient release evidence
- verification evidence is fresh
- known limitations or assumptions are recorded, not hidden

## Forbidden Shortcuts
- Do not use this template as the default replacement for the SDTK-CODE bridge.
- Do not describe expected behavior as if it were verified runtime evidence.
