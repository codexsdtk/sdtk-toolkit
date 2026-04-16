# admin-console-flow-action

## Requirement Summary
- Admin feature with multiple screens, dialogs, and state-changing actions.
- Designed to stress screen flow-action quality, screen-to-API mapping, and generated-draft layout fallback.

## Run Order
1. PM initiation
2. BA analysis
3. PM planning
4. ARCH design with `DESIGN_LAYOUT` before `FLOW_ACTION_SPEC`
5. DEV implementation and two-stage review
6. QA validation and release decision

## Expected Outputs
- `DESIGN_LAYOUT`
- `FLOW_ACTION_SPEC`
- rendered screen previews or explicit render-skipped notes
- API mapping and screen-to-API summary

## Mandatory Verification Points
- every UI-scope screen declares a design source mode
- `Attribute`, `DB Column`, `Size`, and `Default Value` are filled when API and DB source-of-truth is stable
- no broken screen image references remain

## Common Mistakes
- generating flow-action specs before layout exists
- leaving mapping columns blank after API and DB artifacts are already stable
- mixing UI-only labels with canonical API field names without explanation
