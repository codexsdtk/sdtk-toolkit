---
name: screen-design-spec
description: Create or update screen flow-action specifications from requirement sources, including screen flow PlantUML, UI item tables, API mapping tables, and screen-to-API traceability.
---

## Required Inputs (read before proceeding)
Read the following artifacts for the current feature:
1. `docs/specs/BA_SPEC_*.md` - business rules and use cases
2. `docs/architecture/ARCH_DESIGN_*.md` - system components
3. `docs/api/[FEATURE_KEY]_ENDPOINTS.md` - API endpoints, when available

## Input
$ARGUMENTS

# SDTK-SPEC Screen Flow Action Spec

## Critical Constraints
- I do not finalize UI-scope screens without a valid design source type and reference.
- I do not leave broken image paths or incomplete API mappings in the flow-action spec.
- I use new-style PlantUML activity diagram syntax only for the screen flow diagram.
- I do not mix legacy and new-style PlantUML activity syntax in the screen flow diagram.
- Do not mix legacy activity syntax such as `(*)`, `-->`, or `[edge label]` with new-style activity actions like `:Activity;`.
- I keep action-table numbering global across the document even when wireframe markers reset per screen.
- I do not proceed on generated-draft screens if `DESIGN_LAYOUT_[FEATURE_KEY].md` does not exist.

## Outputs
- `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`
- Optional supporting docs:
  - `docs/specs/[FEATURE_KEY]_FIGMA_LAYOUT.md`
  - `docs/specs/[FEATURE_KEY]_DESIGN_SPEC_FROM_EXCEL.md`
  - `docs/specs/assets/[feature_snake]/screens/*`

## Required Inputs
- Feature key/name
- Primary requirement sources (BA spec, architecture, customer design docs)
- Screen source references, using one of these design source modes:
  - `source-backed`: Figma URLs and/or requirement screenshots
  - `generated-draft`: generated layout from `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md`
- API endpoint source (`docs/api/[FEATURE_KEY]_ENDPOINTS.md`) when available

## When To Stop Or Escalate
- Stop if no design source is available for a UI-scope screen (neither Figma/screenshot nor a completed DESIGN_LAYOUT); do not draft a flow-action spec against missing design sources.
- Stop if `DESIGN_LAYOUT_[FEATURE_KEY].md` is referenced as a generated-draft source but does not exist; escalate to `/design-layout` before continuing.
- Stop if the API mapping table cannot be completed because ENDPOINTS.md is missing; record as OQ-xx and continue with explicit gaps noted.
- Stop if legacy PlantUML activity syntax is found in existing source sections; run renumber/migration scripts before adding new content.
- Escalate to `@ba` if UC/BR coverage cannot be confirmed for a screen's flow.
- Escalate to `@arch` if API assignment for a screen is architecturally ambiguous.

## Core Process
1. Read requirement sources and identify in-scope screens, dialogs, and transitions.
2. Read and apply rules from `./references/FLOW_ACTION_SPEC_CREATION_RULES.md`.
3. Determine design source mode per screen:
   - If Figma URL or screenshot exists: use `source-backed`.
   - If no Figma/screenshot but feature has UI scope: use `generated-draft` and reference the corresponding section in `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md`.
   - If screen has no UI scope: use `none`.
4. Build/update section `Feature overview` and `Screen flow action` (PlantUML).
5. For each screen/dialog:
   - Add metadata (screen ID, Design Source Type, Design Source Reference)
   - Add screen image reference (from Figma, screenshot, or rendered `.svg` from generated layout)
   - For generated-draft wireframes, add a wireframe-marker mapping table from the screen-local wireframe markers to the global action-table `No`
   - Add UI item/action table with `No` column
   - Add API mapping table (trigger -> API -> data usage)
6. Build/update `System processing flow` from use-case and process sources.
7. Build/update `Open questions` for unresolved behavior/API/data points.
8. Build/update `Screen - API Mapping` summary section.
9. Update document history and handoff to ARCH/DEV.

## Validation / Quality Gates
- Global numbering consistency: no screen-level reset in action-table `No` column.
- No broken image paths; for generated-draft screens, verify `.svg` exists or use render-skipped note.
- PlantUML renderability and new-style activity syntax consistency: no `(*)`, `-->`, or `[edge label]` mixing.
- Consistency with API endpoints spec.
- EN artifact hygiene: no VI leftovers, no mojibake, no merged heading lines.
- Every UI-scope screen declares a Design Source Type (`source-backed` or `generated-draft`).
- Every generated-draft screen with an embedded wireframe image includes a wireframe-marker mapping table to the global action-table `No`.
- Run validation script before finalizing.

## Order-Critical Hard Gate
Do not finalize any screen section before applying `./references/FLOW_ACTION_SPEC_CREATION_RULES.md`. The rules define mandatory section structure; skipping them produces incomplete specs that will fail ARCH/DEV review.

For generated-draft screens: do not set Design Source Type = `generated-draft` if `DESIGN_LAYOUT_[FEATURE_KEY].md` does not exist. Block until the layout doc is produced.

Do not reset action-table numbering between screens. Numbering must be global across the entire document.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Reset action-table `No` per screen | Breaks global traceability | Keep `No` sequential across the entire document |
| Mix legacy PlantUML syntax (`-->`, `(*)`) with new-style | Renders incorrectly; fails syntax check | Use new-style activity syntax only; run migration script on legacy content |
| Set `generated-draft` when DESIGN_LAYOUT does not exist | References a missing source | Block until `/design-layout` produces the layout doc |
| Leave image path as a broken link | Breaks the rendered spec for reviewers | Verify `.svg` exists; use render-skipped note if unavailable |
| Omit API mapping table for API-connected screens | Hides screen-to-API traceability | Add a complete API mapping table for every screen with API calls |
| Apply FLOW_ACTION_SPEC rules from memory | Rules evolve; memory is stale | Always read `./references/FLOW_ACTION_SPEC_CREATION_RULES.md` first |

## Validation Script
- `.claude/skills/screen-design-spec/scripts/validate_flow_action_spec_numbering.py`
  - `python ".claude/skills/screen-design-spec/scripts/validate_flow_action_spec_numbering.py" --spec "docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md" --en-check`
- `.claude/skills/screen-design-spec/scripts/renumber_flow_action_spec_global.py`
  - Dry-run:
    - `python ".claude/skills/screen-design-spec/scripts/renumber_flow_action_spec_global.py" --spec "docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md"`
  - Apply:
    - `python ".claude/skills/screen-design-spec/scripts/renumber_flow_action_spec_global.py" --spec "docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md" --write`

## Reference Loading Guidance
Read at skill start:
- `./references/FLOW_ACTION_SPEC_CREATION_RULES.md` (required before any screen section)

Read on demand:
- `./references/numbering-rules.md` (when resolving numbering migration questions)
- `./references/figma-mcp.md` (when source-backed mode uses Figma)
- `./references/excel-image-export.md` (when source includes Excel screenshots)
