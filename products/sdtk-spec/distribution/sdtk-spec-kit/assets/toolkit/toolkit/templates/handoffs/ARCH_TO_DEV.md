# ARCH to DEV Handoff

## Required Inputs
- `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md`
- `docs/product/BACKLOG_[FEATURE_KEY].md`
- when applicable:
  - `docs/api/[FeaturePascal]_API.yaml`
  - `docs/api/[FEATURE_KEY]_ENDPOINTS.md`
  - `docs/database/DATABASE_SPEC_[FEATURE_KEY].md`
  - `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md`
  - `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`

## Required Outputs
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- readiness decision for SDTK-CODE handoff

## Mandatory Checks
- ARCH outputs are current and reference the same feature scope.
- UI scope includes `DESIGN_LAYOUT` before `FLOW_ACTION_SPEC`.
- API and DB source-of-truth files are available when implementation depends on them.

## Forbidden Shortcuts
- Do not emit the SDTK-CODE handoff before `FEATURE_IMPL_PLAN` is written and approved.
- Do not treat architecture assumptions as verified facts without citing the source.

## Handoff Message Shape
- Feature: `[FEATURE_KEY]`
- Required implementation slice: file or module scope
- Required proving checks: test obligations for downstream execution
- Upstream blockers or assumptions: explicit list
