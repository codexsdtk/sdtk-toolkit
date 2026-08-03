# UI Numbering Policy

## Scope

- `FLOW_ACTION_SPEC` action tables use one numbering mode only: global across the full document.
- `DESIGN_LAYOUT` wireframe markers are screen-local visual references and may reset per screen.
- Do not force wireframe marker values to numerically equal the global action-table `No`.

## DESIGN_LAYOUT Rules

- Every visible wireframe control should have a visible local marker.
- Prefer Unicode circled-number markers in generated design docs.
- Avoid parenthetical `(N)` markers because they blend into UI text and can conflict with SALT parser behavior.
- Local wireframe markers only cover items visibly present on that screen.

## FLOW_ACTION_SPEC Rules

- Keep action-table `No` values global across the document.
- For each generated-draft screen with an embedded wireframe image, add a wireframe marker mapping table:
  - `No | Wireframe Marker | Action Table No | Item Name | Notes`
- The mapping table bridges screen-local wireframe markers to global action-table numbers.
- If an action-table item is not visible on the wireframe, note that explicitly instead of inventing a marker.

## Non-1:1 Mapping Cases

- If the wireframe label and the action-table label differ slightly, use the action-table item name in the mapping table and explain the label difference in `Notes`.
- If multiple action-table rows map to one visual region, spell that out in `Notes`.
- If a dialog, hidden state, or validation item is not shown on the wireframe, mark it as `Not shown on wireframe`.
