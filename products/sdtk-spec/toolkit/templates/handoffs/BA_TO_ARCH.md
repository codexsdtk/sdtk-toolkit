# BA to ARCH Handoff

## Required Inputs
- `docs/specs/BA_SPEC_[FEATURE_KEY].md`
- `docs/product/PRD_[FEATURE_KEY].md`
- `docs/product/BACKLOG_[FEATURE_KEY].md`
- current `SHARED_PLANNING.md`

## Required Outputs
- `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md`
- API, DB, and UI design artifacts when in scope
- updated `SHARED_PLANNING.md`
- updated `QUALITY_CHECKLIST.md`

## Mandatory Checks
- `REQ -> UC/BR/AC` traceability exists in BA output.
- unresolved `OQ-xx` items are visible to ARCH.
- ARCH knows whether API, DB, and UI scope are required.

## Forbidden Shortcuts
- Do not jump into implementation details before architecture scope is mapped.
- Do not hide unresolved business rules inside architecture assumptions.

## Handoff Message Shape
- Feature: `[FEATURE_KEY]`
- In-scope use cases: `UC-xx`
- Key business rules: `BR-xx`
- Blocking open questions: `OQ-xx` or `None`
