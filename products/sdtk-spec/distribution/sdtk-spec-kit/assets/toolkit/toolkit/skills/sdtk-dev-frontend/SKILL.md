---
name: sdtk-dev-frontend
description: Generate/modify React frontend code following the toolkit conventions (list/register/edit/detail pages, components, services, React Query hooks, permission checks). Use when implementing frontend features in that project style.
---

# SDTK-SPEC Frontend (Toolkit conventions)

## Critical Constraints
- I am a bounded DEV specialist aid inside `SDTK-SPEC`, not a separate suite-owner identity.
- I do not implement screens without current layout and flow-action sources.
- I do not bypass existing frontend patterns for loading, permissions, or labels.
- I do not replace the default `sdtk-dev -> CODE_HANDOFF -> SDTK-CODE` path unless the user explicitly asks for a bounded specialist intervention inside current DEV scope.
- I do not invent screen layout, field labels, or API calls that are not present in the approved upstream artifacts.

## Outputs
- Frontend feature files under:
  - `src/frontend/features/{feature}/` (pages, components)
  - `src/frontend/services/{feature}/{feature}Service.js`
  - `src/frontend/services/apiHook/{feature}.js`

## Required Inputs
- `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md` (screen layout and item tables)
- `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` (UI actions and API mapping)
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md` (API contracts for hook/service binding)
- Confirmation that this slice is within approved DEV scope

## When To Stop Or Escalate
- Stop if `DESIGN_LAYOUT_[FEATURE_KEY].md` does not exist or has no screen sections for the current slice; do not implement screens against memory or assumptions.
- Stop if the flow-action spec is missing or incomplete for the screens being implemented; surface as a blocker.
- Stop if an API endpoint required by the screen is not present in ENDPOINTS.md; do not invent API calls.
- Escalate to `sdtk-dev` if the implementation slice scope is unclear or if design decisions are required that go beyond the approved layout.
- Escalate to `@arch` or `sdtk-design-layout` if the existing layout file does not cover a screen required by the current slice.

## Core Process
1. Confirm this frontend slice is a bounded specialist intervention under current DEV scope, not a replacement for `sdtk-dev` ownership or the default downstream `SDTK-CODE` path.
2. Read `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md` for screen structure and item tables.
3. Read `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` for UI actions, API mapping, and flow context.
4. Read `docs/api/[FEATURE_KEY]_ENDPOINTS.md` for API contracts.
5. Check whether this repository already has a frontend reference module and follow its patterns exactly.
6. Follow structure:
   - `src/frontend/features/{feature}/...`
   - `src/frontend/services/{feature}/{feature}Service.js`
   - `src/frontend/services/apiHook/{feature}.js`
7. Implement screens based on `DESIGN_LAYOUT_[FEATURE_KEY].md`; do not add or remove fields without a corresponding layout update.
8. Preserve patterns: React Query hooks, loading states, permission checks, consistent labels.
9. Verify the implemented screens satisfy the flow-action mappings before declaring the slice done.

## Validation / Quality Gates
- Every screen section in the layout spec has a matching page/component implemented.
- React Query hooks exist for every API call made by the feature.
- Loading and error states are handled consistently with existing patterns.
- Permission checks guard all protected actions.
- Field labels match the layout and flow-action spec exactly; no free-form label invention.
- No API call exists in the implementation that is not present in ENDPOINTS.md.

## Order-Critical Hard Gate
Do not implement a screen before reading the corresponding section in `DESIGN_LAYOUT_[FEATURE_KEY].md`. Screens built without a layout reference produce inconsistent UX that must be corrected before QA.

Do not declare a slice done without verifying all implemented screens satisfy the API mappings in the flow-action spec.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Implement screens without reading DESIGN_LAYOUT | Introduces layout drift from spec | Always read the layout doc before implementing any screen |
| Invent API calls not in ENDPOINTS.md | Creates untracked contract dependencies | Only call APIs explicitly defined in the ENDPOINTS file |
| Skip permission checks on protected actions | Security gap that will fail review | Always guard protected actions with the existing permission pattern |
| Use a different structure than the existing frontend reference | Inconsistency maintainers must correct | Read the reference module and match its structure exactly |
| Treat this skill as a replacement for `sdtk-dev` | Collapses bounded specialist scope into general DEV ownership | Keep scope explicitly bounded to the current slice |
| Add field labels from memory | Labels drift from the spec | Copy field label text exactly from the layout or flow-action doc |

## Reference Loading Guidance
Read at slice start:
- `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md` (required)
- `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` (required)
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md` (required)

Read on demand:
- Existing frontend reference module in `src/frontend/` (match its patterns)
- `sdtk-spec.config.json` for stack-specific commands
