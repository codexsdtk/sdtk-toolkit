---
name: api-doc
description: Generate OpenAPI 3.x YAML and PlantUML flow diagrams for a feature following this toolkit's API conventions. Use when you need to create/update docs/api/* (API spec + flow list) from BA_SPEC/ARCH_DESIGN.
---

## Required Inputs (read before proceeding)
Read the following artifacts for the current feature:
1. `docs/specs/BA_SPEC_*.md` - business rules, use cases
2. `docs/architecture/ARCH_DESIGN_*.md` - system components, data model

## Input
$ARGUMENTS

# SDTK-SPEC API Documentation

## Critical Constraints
- I do not invent API paths or payload contracts that contradict BA or ARCH artifacts.
- I do not leave YAML, endpoint markdown, and flow-list outputs out of sync.
- I do not emit a final API doc without applying canonical YAML and flowchart rules.
- I do not proceed if BA_SPEC or ARCH_DESIGN is absent or clearly incomplete for the current feature scope.

## Outputs
- `docs/api/[FeaturePascal]_API.yaml`
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md`
- `docs/api/[feature_snake]_api_flow_list.txt`
- Optional downstream (via `/api-design-spec`):
  - `docs/api/[FEATURE_KEY]_API_DESIGN_DETAIL.md`

## Required Inputs
- Feature name and key
- Entities and key fields
- Use cases (UC-xx) and business rules (BR-xx)
- Auth/permission model
- `docs/specs/BA_SPEC_[FEATURE_KEY].md` or `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md`

## When To Stop Or Escalate
- Stop if no BA_SPEC or ARCH_DESIGN exists for the current feature; surface as a blocker before generating any artifact.
- Stop if path naming policy cannot be resolved without a product decision; record as OQ-xx and escalate to `@pm`.
- Stop if required UC/BR coverage cannot be confirmed from available sources; do not invent coverage.
- Escalate to `@arch` if the data model or endpoint scope is structurally ambiguous.

## Core Process
1. Read `docs/specs/BA_SPEC_[FEATURE_KEY].md` and/or `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md`.
2. Read and apply split API rule sources:
   - `./references/YAML_CREATION_RULES.md` for YAML contract rules
   - `./references/API_DESIGN_FLOWCHART_CREATION_RULES.md` for flow list / flowchart rules
3. Define endpoints mapped to UC-xx; keep path naming consistent across CRUD/search/list/mst patterns and apply `governance/ai/core/SDTK_API_PATH_STYLE_POLICY.md` for canonical resource naming.
4. For each endpoint, document request/response schema and error cases.
5. Generate/update endpoint markdown (`[FEATURE_KEY]_ENDPOINTS.md`) with summary tables, API type grouping, and screen-logic mapping.
6. Generate PlantUML flows including auth, permission check, validation, main logic, and error exits.
7. Ensure traceability notes reference UC/BR where relevant.
8. For benchmark runs, if the requirement or upstream artifacts mark an OQ as expected OPEN, keep that ambiguity explicit in flow list / endpoint docs instead of silently collapsing it.
9. Validate English output hygiene when generating English artifacts:
   - no mixed-language leftovers in narrative text
   - no mojibake/encoding corruption markers
   - terminology consistency across endpoint detail, summary tables, and flow labels
10. If orchestrator mode requires API design detail generation (`apiDesignDetailMode=auto/on`), handoff to `/api-design-spec` after YAML + flow list are updated.

## Validation / Quality Gates
- YAML, ENDPOINTS.md, and flow list are consistent: the same resource uses the same path segment across all three.
- Every UC-xx in scope has at least one endpoint mapped.
- Every endpoint has a defined success response and at least one error case.
- All path segments match the canonical naming policy.
- No OQ-xx is silently collapsed; unresolved items remain explicit.
- English artifact hygiene passes (no language leftovers, no mojibake).

## Order-Critical Hard Gate
Do not finalize YAML or ENDPOINTS.md before reading and applying both reference rule files. Generating endpoints without `YAML_CREATION_RULES.md` and `API_DESIGN_FLOWCHART_CREATION_RULES.md` produces non-conformant output that will fail downstream review.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Invent endpoint paths not in BA/ARCH | Creates untracked contract drift | Map every endpoint to an explicit UC-xx or BR-xx |
| Apply path naming from memory without reading policy | Policy details evolve; memory is stale | Always read `SDTK_API_PATH_STYLE_POLICY.md` first |
| Leave YAML and ENDPOINTS.md out of sync | Downstream tools depend on consistency | Cross-check path/method/schema for each endpoint across all three outputs |
| Silently collapse an OQ-xx marked as OPEN | Hides unresolved decisions | Keep OQ-xx explicit; escalate to `@pm` if resolution is needed |
| Skip flowchart rules and free-style PlantUML | Produces flows that deviate from SDTK conventions | Apply `API_DESIGN_FLOWCHART_CREATION_RULES.md` before generating any flow |

## Reference Loading Guidance
Read at skill start:
- `./references/YAML_CREATION_RULES.md`
- `./references/API_DESIGN_FLOWCHART_CREATION_RULES.md`

Read on demand:
- `governance/ai/core/SDTK_API_PATH_STYLE_POLICY.md` (always required for path naming)
- `docs/specs/API_DOC_SKILL_ANALYSIS.md` (if present; deeper domain analysis only)
