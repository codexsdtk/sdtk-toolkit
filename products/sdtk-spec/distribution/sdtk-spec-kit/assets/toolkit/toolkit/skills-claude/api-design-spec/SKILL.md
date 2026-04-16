---
name: api-design-spec
description: Generate detailed API design markdown from OpenAPI YAML and API flow list. Use when you need field-level request/response tables plus one visible process-flow diagram per API.
---

## Required Inputs (read before proceeding)
Read the following artifacts for the current feature:
1. `docs/api/[FeaturePascal]_API.yaml` - API contract
2. `docs/api/[feature_snake]_api_flow_list.txt` - flow list

## Input
$ARGUMENTS

# SDTK-SPEC API Design Detail Spec

## Critical Constraints
- I do not drift from the source YAML or flow list.
- I do not leave broken flow image embeds or missing assumptions in the API design detail.
- I do not generate API design detail without a valid YAML source and matching flow list.
- I do not skip the flowchart creation rules; freehand flow sections that bypass `API_DESIGN_FLOWCHART_CREATION_RULES.md` are non-conformant.

## Outputs
- `docs/api/[FEATURE_KEY]_API_DESIGN_DETAIL.md`
- Supporting generated assets:
  - `docs/api/flows/*.puml`
  - `docs/api/images/*.svg`

## Required Inputs
- Feature key (`FEATURE_KEY`)
- API contract YAML:
  - Preferred: `docs/api/[FeaturePascal]_API.yaml`
  - Fallback: a specified YAML file path
- API flow list:
  - Preferred: `docs/api/[feature_snake]_api_flow_list.txt`
  - Fallback: a specified flow list path

## When To Stop Or Escalate
- Stop if the required YAML file does not exist or cannot be resolved; do not fabricate an endpoint table.
- Stop if the flow list is missing or contains no parseable `@startuml ... @enduml` blocks; record the gap and escalate to `/api-doc` for regeneration.
- Stop if YAML and flow list describe fundamentally different endpoint sets; surface the discrepancy as a blocker before generating any section.
- Escalate to `@arch` if a flow block is ambiguous about business logic that would change how a table row is authored.

## Core Process
1. Resolve input files (`yaml`, `flow_list`, `output`).
2. Load and apply `./references/API_DESIGN_FLOWCHART_CREATION_RULES.md` before generating any section.
3. Parse YAML endpoints (method, path, request schema, success/error schema).
4. Parse flow blocks from flow list and map them by normalized `METHOD + path`.
5. Generate detailed markdown sections per API:
   - Flow summary / notes / login bullets from YAML `description`
   - Process flow source block (`text` fenced block)
   - Embedded flowchart image
   - Path parameter table
   - Request table (hierarchy levels + type + format + required)
   - Success response table
   - Error response table (explicit schema if defined, otherwise shared envelope + inferred business statuses from flow)
6. Generate/update `.puml` per API under `docs/api/flows`.
7. Render `.svg` images under `docs/api/images`.

## Validation / Quality Gates
- Every API section has exactly one embedded image; no section is left without a flow visual.
- Every embed path exists on disk; broken image links are a hard failure.
- No render error image output is accepted.
- Markdown tables keep `No` sequential numbering.
- YAML-derived field tables match the YAML source exactly; no invented fields.
- Error response table aligns with actual flow exits, not placeholder `None` values.

## Order-Critical Hard Gate
Do not generate any API section before reading and applying `./references/API_DESIGN_FLOWCHART_CREATION_RULES.md`. Sections generated without that reference produce structurally incorrect output that will fail implementation review.

Do not emit `API_DESIGN_DETAIL.md` if the input YAML and flow list describe incompatible endpoint sets. Fix the upstream sources before proceeding.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Generate sections without reading flowchart rules | Produces non-conformant flow blocks | Always read `API_DESIGN_FLOWCHART_CREATION_RULES.md` first |
| Leave error table as `None` or empty | Hides actual error paths from implementers | Derive error rows from the flow list and YAML error schemas |
| Embed image paths that do not exist on disk | Breaks document rendering for reviewers | Verify `.svg` exists before embedding; fail loudly if missing |
| Invent request fields not present in YAML | Introduces contract drift | Only table fields that exist in the parsed YAML schema |
| Run on an outdated YAML source | Generates stale API design detail | Always confirm the YAML was produced from the current BA/ARCH pass |

## Script
- `.claude/skills/api-design-spec/scripts/generate_api_design_detail.py`

### Typical command
```bash
python ".claude/skills/api-design-spec/scripts/generate_api_design_detail.py" \
  --feature-key WORK_PLANNING_BOARD \
  --yaml "docs/api/WorkPlanningBoard_API.yaml" \
  --flow-list "docs/api/work_planning_board_api_flow_list.txt" \
  --output "docs/api/WORK_PLANNING_BOARD_API_DESIGN_DETAIL.md"
```

### Optional subset generation
```bash
python ".claude/skills/api-design-spec/scripts/generate_api_design_detail.py" \
  --feature-key WORK_PLANNING_BOARD \
  --yaml "docs/api/WorkPlanningBoard_API.yaml" \
  --flow-list "docs/api/work_planning_board_api_flow_list.txt" \
  --output "docs/api/WORK_PLANNING_BOARD_API_DESIGN_DETAIL.md" \
  --include "POST /api/work-assignment/{organization_uuid}"
```

## Orchestrator Integration (Hybrid)
- `apiDesignDetailMode` in `sdtk-spec.config.json` controls orchestration behavior:
  - `auto` (default): generate API design detail when ARCH has API scope and YAML/flow sources are available.
  - `on`: always generate API design detail for API scope (fail if required sources are missing).
  - `off`: skip unless user explicitly requests.

## Reference Loading Guidance
Read at skill start:
- `./references/API_DESIGN_FLOWCHART_CREATION_RULES.md` (required before any section generation)

Read on demand:
- `docs/api/[FeaturePascal]_API.yaml` (required input)
- `docs/api/[feature_snake]_api_flow_list.txt` (required input)
