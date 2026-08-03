# api-only-service

## Requirement Summary
- Service feature with API and database scope but no end-user UI screens.
- Designed to show the SDTK path when `DESIGN_LAYOUT` and `FLOW_ACTION_SPEC` are out of scope.

## Run Order
1. PM initiation
2. BA analysis
3. PM planning
4. ARCH design
5. DEV implementation and two-stage review
6. QA validation and release decision

## Expected Outputs
- `ARCH_DESIGN`, API YAML, endpoint markdown, API design detail, DB spec
- no UI artifacts unless an internal admin screen is explicitly added

## Mandatory Verification Points
- API path naming follows the canonical path policy
- API design detail stays synchronized with YAML and flow list
- QA quotes exact BA or API requirements when validating behavior

## Common Mistakes
- generating UI docs out of habit when no UI scope exists
- drifting API design detail away from the source YAML
- approving runtime behavior without fresh service-level evidence
