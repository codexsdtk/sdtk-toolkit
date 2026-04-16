---
name: design-layout
description: Generate UI screen layout documentation for a feature, including PlantUML SALT wireframes and item tables. Use when a feature includes frontend or admin screens and you need docs/design deliverables.
---

## Required Inputs (read before proceeding)
Read the following artifacts for the current feature:
1. `docs/specs/BA_SPEC_*.md` - screens and fields
2. `docs/api/[FEATURE_KEY]_ENDPOINTS.md` - API list

## Input
$ARGUMENTS

# SDTK-SPEC Screen Layout Design

## Critical Constraints
- I do not skip screen IDs or item numbering alignment with the wireframe.
- I do not hide render limitations; I record when screen preview rendering is unavailable.
- I do not leave rendered wireframes without visible local item markers that map back to the `Items` table.
- I do not pretend wireframe markers are the same thing as `FLOW_ACTION_SPEC` global action-table numbers.
- I do not invent screens or fields not present in BA_SPEC or the feature scope.

## Output
- `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md`

## Required Inputs
- `docs/specs/BA_SPEC_[FEATURE_KEY].md` (screens, fields, business rules)
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md` (API list for each screen, when available)
- Feature key and feature name

## When To Stop Or Escalate
- Stop if BA_SPEC does not exist or does not contain screen/field definitions for the current feature; surface as a blocker before drafting any wireframe.
- Stop if a required screen's field list or behavior is ambiguous in the source; record as OQ-xx and escalate to `@ba` or `@pm`.
- Stop if PlantUML rendering is unavailable and the feature team requires rendered images before proceeding; record rendering as skipped and note the dependency.
- Escalate to `@arch` if screen scope or API assignment is architecturally uncertain.

## Core Process
1. Read BA spec (screens + fields) and API list.
2. For each screen, include:
   - PlantUML `@startsalt` wireframe first, with visible screen-local markers embedded directly in the SALT labels
   - API list table
   - Item table whose `No` values exactly match the local marker sequence used in the wireframe for that screen
3. Use this wireframe-marker convention so the rendered SVG can be cross-referenced visually:
   - markers are screen-local visual references and reset per screen
   - prefer Unicode circled-number markers in generated docs; avoid parenthetical `(N)` markers because they blend into UI text and can conflict with SALT parsing
   - text label or input prompt: prefix the visible label with the local marker
   - button: place the local marker inside the visible button label
   - table header: prefix the header text with the local marker
   - standalone control, pagination, toggle, or status chip: prefix the visible label with the local marker
   - do not rely on prose, comments, or a separate legend; the marker must be visible inside the rendered wireframe itself
   - the local marker does not need to equal the `FLOW_ACTION_SPEC` global `No`; `screen-design-spec` publishes the mapping table
4. Keep screen IDs consistent (A-*, B-*, C-*).
5. After writing `DESIGN_LAYOUT`, attempt to render screen preview images by default:
   - Run `.claude/skills/design-layout/scripts/render_design_layout_images.py` to extract `@startsalt` blocks and render `.svg` files.
   - Output path: `docs/specs/assets/<feature_snake>/screens/<screen_id>.svg`
   - The renderer warns if a screen wireframe has no visible local markers or still uses legacy `(N)` markers.
   - If PlantUML is unavailable, rendering is skipped with a warning and the render-skipped note is used in `FLOW_ACTION_SPEC`. The layout doc remains valid.

## Validation / Quality Gates
- Every screen in BA scope has a corresponding wireframe section in the layout doc.
- Every `@startsalt` block contains visible screen-local markers; no unlabeled items.
- Item table `No` values match the wireframe local marker sequence for each screen exactly.
- Screen IDs follow the A-*, B-*, C-* convention without gaps or duplicates.
- API list table is present for every screen that makes API calls.
- Render-skipped note is explicit when PlantUML is unavailable; no silent omission.
- No `(N)` parenthetical markers in generated wireframes.

## Order-Critical Hard Gate
Do not write wireframes before reading BA_SPEC screen definitions. Wireframes generated from memory introduce field drift that must be corrected before the flow-action spec can be authored.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Use `(N)` parenthetical markers in wireframes | Conflicts with SALT parsing; indistinguishable from UI text | Use Unicode circled-number markers instead |
| Let Item table `No` drift from wireframe markers | Breaks the cross-reference between table and visual | Align item table `No` to the local marker sequence exactly |
| Claim wireframe markers equal FLOW_ACTION_SPEC global numbers | They are different numbering systems | Always note that markers are screen-local; screen-design-spec publishes the global mapping |
| Skip render attempt without noting the skip | Leaves downstream consumers uncertain about image availability | Always record render-skipped note when PlantUML is unavailable |
| Invent screens or fields not in BA_SPEC | Creates untracked scope | Only add screens and fields explicitly listed in the BA source |

## Screen Image Renderer
- Script: `.claude/skills/design-layout/scripts/render_design_layout_images.py`
- Usage:
  ```
  python ".claude/skills/design-layout/scripts/render_design_layout_images.py" \
    --design-layout "docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md" \
    --feature-key [FEATURE_KEY]
  ```
- Requires: Java + `plantuml.jar`
- Output: `.svg` files under `docs/specs/assets/<feature_snake>/screens/`
- Failure policy: non-blocking. Warns and continues if rendering is unavailable.
