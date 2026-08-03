# DEV Stage 1 Spec Review

## Required Inputs
- implementation diff or changed files
- `docs/specs/BA_SPEC_[FEATURE_KEY].md`
- `docs/api/[FeaturePascal]_API.yaml` and `docs/api/[FEATURE_KEY]_ENDPOINTS.md` when API scope exists
- `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` when UI scope exists
- `docs/database/DATABASE_SPEC_[FEATURE_KEY].md` when data scope exists

## Required Outputs
- PASS or FAIL verdict
- mismatch table with exact file references
- explicit handoff decision to Stage 2 or back to DEV

## Mandatory Checks
- code matches BA, API, DB, and flow-action requirements line by line
- missing mappings and drift are called out explicitly
- unresolved assumptions that affect behavior are treated as blockers

## Verification Evidence
- quote the exact specification text before declaring a match or mismatch
- use: `Spec says: "[exact quote]" -> Evidence: [match/mismatch + file reference]`

## Forbidden Shortcuts
- Do not start with style or maintainability feedback.
- Do not trust the implementer report without checking artifacts directly.
