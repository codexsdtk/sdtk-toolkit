# QA Release Decision

## Required Inputs
- `docs/qa/QA_RELEASE_REPORT_[FEATURE_KEY].md`
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`
- downstream implementation evidence, normally from SDTK-CODE
- downstream operational evidence
- fresh proving checks or benchmark-mode evidence
- open defect list with severity

## Required Outputs
- `APPROVED` or `REJECTED`
- explicit evidence summary
- unresolved risks and assumptions list

## Mandatory Checks
- verdict is backed by fresh command evidence or benchmark policy
- specification quotes are used for requirement-based validation
- verdict is backed by CODE evidence and OPS evidence
- `OPS_HANDOFF` is not treated as sufficient release evidence without downstream operational evidence
- defects and known gaps are visible in the decision

## Forbidden Shortcuts
- Do not issue `APPROVED` based on planned checks.
- Do not hide environment limitations; state when runtime verification was not possible.
