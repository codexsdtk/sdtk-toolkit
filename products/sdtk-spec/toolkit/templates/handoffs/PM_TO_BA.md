# PM to BA Handoff

## Required Inputs
- `docs/product/PROJECT_INITIATION_[FEATURE_KEY].md`
- source requirement notes or attachments
- current `SHARED_PLANNING.md`
- (Optional) `docs/product/CONDENSED_UPSTREAM_INPUT_[FEATURE_KEY].md` if a
  condensation step was run before PM initiation. If present, BA must
  read it alongside the Project Initiation doc. All condensed content is DRAFT
  and requires human review before adoption.

## Required Outputs
- `docs/specs/BA_SPEC_[FEATURE_KEY].md`
- updated `SHARED_PLANNING.md`
- updated `QUALITY_CHECKLIST.md`

## Mandatory Checks
- `REQ-xx` scope is explicit and testable.
- in-scope and out-of-scope are visible.
- unresolved ambiguities are logged as `OQ-xx`, not hidden.

## Forbidden Shortcuts
- Do not skip glossary, BR, UC, AC, or traceability expectations.
- Do not invent missing stakeholder decisions without logging them.

## Handoff Message Shape
- Feature: `[FEATURE_KEY]`
- PM scope summary: 3 to 7 bullets
- Known open questions: `OQ-xx` list or `None`
- Expected BA focus: rules, use cases, acceptance criteria, NFRs
