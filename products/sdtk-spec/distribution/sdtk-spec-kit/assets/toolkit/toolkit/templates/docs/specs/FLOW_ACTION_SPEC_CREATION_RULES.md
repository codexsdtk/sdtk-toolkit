# Flow Action Spec Creation Rules for AI Agents

This document defines reusable rules for creating and updating screen flow-action specifications
(for example `docs/specs/*_FLOW_ACTION_SPEC.md`).

## 1. Scope and Goal

- Produce a screen-level specification that is traceable from BA/ARCH to FE/BE implementation.
- Keep one source of truth for:
  - screen flow
  - UI items and actions
  - API calls per action
  - screen-to-API mapping
- Keep documentation implementation-aware and review-friendly.

## 2. Mandatory Document Structure

A flow-action spec should include, at minimum:

1. `Abbreviations`
2. `Feature overview`
3. `Assumptions`
4. `Screen flow action` (with PlantUML)
5. `Screen layout spec by flow action`
6. `System processing flow`
7. `Open questions`
8. `Screen - API mapping`
9. `Document history`

If a section is not in scope, keep the section and mark explicitly as `N/A` with reason.

## 3. Table Standards

- Every table must include a `No` column (sequential numbering).
- Use stable headers for action tables:
  - `No | Item Name | Item Type | Attribute | DB Column | Size | Default Value | Action | Description | Note`
- Use stable headers for API mapping tables:
  - `No | Trigger/When | UI item (No / Item Name) | API to call | Data usage / Notes`
- Use stable headers for screen mapping:
  - `No | Screen (section) | Screen ID | Read/Search APIs | Write APIs | Notes / Q&A refs`
- Table rows must keep column count consistent with the header (no broken or merged rows).
- Avoid single-line merged content that collapses multiple logical items into one table row.

### 3.1 Action Table Mapping Completion Rules

- After API endpoint spec and database spec are available, the action-table columns `Attribute`, `DB Column`, `Size`, and `Default Value` must not be left blank when the mapping can be derived from current source-of-truth inputs.
- Fill these four columns only after the relevant API contract and DB schema are stable enough to be treated as the current source of truth for the active phase.
- Source priority for filling the four columns:
  1. `docs/api/*_ENDPOINTS.md` and OpenAPI YAML for request/response contract
  2. `docs/database/DATABASE_SPEC_*.md` for physical column names, nullability, storage shape, and query-source aliases
  3. confirmed flow/business rules for default state and behavior
  4. design source (Figma/Excel) for screen label and control type only
- `Attribute` rules:
  - input item: use the canonical request payload path
  - display item: use the canonical response path
  - UI-only item: use `ui.*` namespace
- `DB Column` rules:
  - use physical DB column names or query-source aliases from the API/database spec
  - if multiple columns participate, list them explicitly
  - if the control is UI-only, write `N/A`
- `Size` rules:
  - document data format/type, not pixel width
  - prefer canonical forms such as `uuid`, `DATE (YYYY-MM-DD)`, `DATETIME`, `TIME (HH:mm)`, `boolean`, `array[uuid]`, `enum(...)`, `JSON string`
  - prefer DB storage type first; if not available, fall back to API schema type/format
- `Default Value` rules:
  - use confirmed business, UI, or runtime defaults
  - if the default comes from settings or environment, state that clearly
  - if not finalized, use `TBD` and keep or raise an open-question reference in `Note`
- If screen labels conflict with canonical API/DB naming, preserve the original screen label in the visible screen columns, but keep `Attribute` and `DB Column` aligned to API/DB source of truth and explain the mismatch in `Note`.

### 3.2 Language and Encoding Standards (EN Artifacts)

- For EN artifacts (`docs/en/**` or explicitly requested EN version), narrative text must be English.
- JP labels, if provided by the input, should be kept in a clearly marked appendix or note column, not in the default item table columns.
- Do not leave mixed-language fragments in one sentence/cell (for example VI+EN mixed text).
- If original VI/JP text is required for traceability, keep it in a clearly marked appendix block (`Original Text`), then provide EN translation.
- Save files as UTF-8 and avoid mojibake/broken glyphs (`�`, `ↁE`, garbled sequences).
- Keep canonical terminology stable across documents (for example: `resource`, `task`, `external member`).

### 3.3 Markdown Structure Hygiene

- Keep each heading on its own line; do not concatenate multiple headings/sections on one line.
- Keep metadata blocks (`Information`, `Note`, `Behavior notes`) as structured bullet blocks, not single compressed lines.
- Keep image, table, and separator (`---`) boundaries explicit to preserve parser/render stability.

### 3.4 Assumptions Section

- Every flow-action spec must include a top-level `## Assumptions` section.
- Use this table format exactly: `# | Assumption | Verified | Risk if wrong`.
- Keep assumptions explicit when downstream mapping or behavior depends on an unresolved decision.
- If an assumption affects UI behavior, API mapping, or DB mapping, reflect the risk in `Note` and keep or raise the related `OQ-xx` item.

## 4. Item Numbering and Duplication Rules

- Use one numbering mode only: `global across document`.
- Number values must increase across all action tables in the document.
- DESIGN_LAYOUT wireframe markers are a separate screen-local visual system. They may reset per screen and do not need to numerically equal the global action-table `No`.
- Avoid duplicate item descriptions for the same UI control across screens unless behavior differs.
- If duplicate number is intentional (rare), annotate reason in `Note`.

## 5. Screen Section Rules

For each screen section:

- Provide metadata:
  - official screen name
  - Screen ID
  - Design Source Type
  - Design Source Reference
- Embed one representative image per screen (from Figma, screenshot, or generated layout).
- Provide one action table.
- Provide one API mapping table.
- If a screen has dialogs, create explicit dialog sub-sections with their own tables and API mapping.

## 5.1 Design Source Modes

Each screen section must declare a design source using one of these modes:

| Mode | When | Design Source Reference |
|------|------|----------------------|
| `source-backed` | Figma URL or screenshot is available | Figma URL or screenshot path |
| `generated-draft` | No Figma/screenshot, but feature has UI scope | Section reference in `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md` |
| `none` | Feature has no UI scope for this screen | State `N/A - no UI scope` |

Rules:
- For UI-scope features, `none` is only valid when the specific screen truly has no visual layout.
- When using `generated-draft`, the `DESIGN_LAYOUT_[FEATURE_KEY].md` must exist before the flow-action spec is finalized.
- The flow-action spec and the design-layout doc must remain separate documents.
- When Figma becomes available later, update the source mode from `generated-draft` to `source-backed`.

## 5.2 Wireframe Marker Mapping for Generated-Draft Screens

For generated-draft screens with rendered design-layout images:

- Treat wireframe markers as screen-local visual references only.
- Keep action-table `No` global across the document per section 4.
- Add a wireframe marker mapping table directly under the screen image.
- Use this stable header:
  - `No | Wireframe Marker | Action Table No | Item Name | Notes`
- Map only the items visibly present on the wireframe image.
- If an action-table row is not visible on the wireframe, state `Not shown on wireframe` in `Notes` instead of inventing a marker.
- If the wireframe label and the action-table label differ slightly, keep the action-table item name and explain the label difference in `Notes`.

## 6. API Traceability Rules

- Every actionable UI event that changes state must map to a write API.
- Every data-loading UI event must map to a read/search API.
- If one endpoint serves multiple actions (initial load, search, refresh), state this explicitly.
- If no API is called for an action, state `No API` and explain why.

## 7. PlantUML Rules for Screen Flow

- Use new-style PlantUML activity diagram syntax only for screen-flow diagrams.
- Allowed activity constructs include: `start`, `stop`, `partition "..." {}`, `:Activity;`, `->`, `if/then/else/endif`, `fork`, `fork again`, `end fork`, and `note right/left`.
- Do not mix legacy activity syntax such as `(*)`, `-->`, or `[edge label]` with new-style activity actions like `:Activity;`.
- Validate renderability before handoff. If a renderer is unavailable in the current environment, at minimum keep the block internally consistent with new-style activity syntax only.
- Use `\\n` for multi-line labels in activity nodes and notes.
- Keep diagram at navigation/action level (not low-level SQL or backend internals).
- Ensure screen names in PlantUML match section names in layout spec.

## 8. Data Source and Asset Rules

- Prioritize source order:
  1. Confirmed design source (for example Figma)
  2. Confirmed requirement files (Excel/spec)
  3. User-provided screenshots
- Store images in repository-relative filesystem paths.
- Reference images in markdown using file-relative paths from the spec file's directory.
- Do not keep temporary local absolute paths in markdown.

### 8.1 Rendered Screen Images for Generated-Draft Screens

When `Design Source Type` is `generated-draft`:
- Screen preview images may be rendered from `DESIGN_LAYOUT_[FEATURE_KEY].md` PlantUML SALT wireframes.
- Renderer: `toolkit/skills/sdtk-design-layout/scripts/render_design_layout_images.py`
- Expected output path (filesystem): `docs/specs/assets/<feature_snake>/screens/<screen_id>.svg`
- Markdown image path (file-relative from `docs/specs/*_FLOW_ACTION_SPEC.md`): `assets/<feature_snake>/screens/<screen_id>.svg`
- DESIGN_LAYOUT markers inside the image are screen-local visual references and may reset per screen; use the wireframe mapping table to bridge them to the global action-table `No`.
- If the rendered `.svg` file exists, use the file-relative markdown path in the `Screen image:` reference.
- If rendering is unavailable or the `.svg` does not exist, replace the image line with:
  `> Screen image not rendered in this environment. See Design Source Reference for layout.`
- Do not leave a broken image reference pointing to a non-existent file.

## 9. Consistency with Other Specs

- Align terms with:
  - BA spec glossary
  - API endpoints spec
  - Database spec
- If terminology differs across docs, raise an open question and add a temporary mapping note.
- Keep endpoint paths in flow-action spec consistent with API endpoint spec.

## 10. Open Questions and Uncertainty Handling

- Capture unresolved items in `Open questions` table.
- Do not invent UI behavior or API contracts when source is ambiguous.
- Mark uncertain mappings as `Draft` and include impacted files/sections.

## 11. Change Management

- On each update:
  - update impacted screen sections
  - update API mapping tables
  - update screen-to-API mapping summary
  - append one row in document history
- Never overwrite past history rows.

## 12. Final Checklist Before Handoff

- PlantUML renders successfully.
- All mandatory sections exist.
- All tables include `No`.
- Numbering is global across the document (no resets).
- No broken image links (for `generated-draft` screens: `.svg` exists or render-skipped note is present).
- Screen/API mappings are consistent with `*_ENDPOINTS.md`.
- Assumptions section exists and unresolved assumptions are traceable.
- Open questions are explicit and traceable.
- For EN artifact: no leftover VI text outside allowed `Original Text` appendix blocks.
- No mojibake/encoding corruption markers.
- Headings/tables are structurally clean (no merged lines that break readability/traceability).
