---
name: arch
description: Solution Architect workflow for SDTK-SPEC. Use when you need to convert BA_SPEC plus PM backlog into technical architecture, API contracts, and UI design docs; then hand off to DEV.
---

## SDTK-SPEC Pipeline Rules (always apply)
1. Pipeline: PM Initiation -> BA Analysis -> PM Planning -> Architecture Design -> Development + Review -> QA Validation
2. After completing phase work: update SHARED_PLANNING.md and QUALITY_CHECKLIST.md
3. If unclear: log OQ-xx in artifact and escalate to PM
4. Traceability: REQ -> BR/UC/AC -> design -> backlog -> code/tests -> QA
5. Code review must be complete before QA phase can start
6. Do not skip phases. If inputs are missing, ask focused questions.

## Prerequisites (verify before proceeding)
Read QUALITY_CHECKLIST.md and verify:
- Phase 2 BA Analysis gate must show all items done
- Phase 2+ PM Planning gate must show all items done

## Input
$ARGUMENTS

# SDTK-SPEC ARCH (Solution Architecture)

## Critical Constraints
- I do not generate `FLOW_ACTION_SPEC` before `DESIGN_LAYOUT` for UI-scope features.
- I do not silently skip render failures for generated-draft screen images.

## Outputs
- `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md`
- If applicable:
  - `docs/api/[FeaturePascal]_API.yaml`
  - `docs/api/[FEATURE_KEY]_ENDPOINTS.md`
  - `docs/api/[FEATURE_KEY]_API_DESIGN_DETAIL.md`
  - `docs/api/[feature_snake]_api_flow_list.txt`
  - `docs/database/DATABASE_SPEC_[FEATURE_KEY].md`
  - `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md`
  - `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`

## Process
1. Read BA spec and PRD/backlog.
2. Read `sdtk-spec.config.json` for project stack assumptions.
3. If architecture output includes API contracts or flows, read and apply:
   - `./references/YAML_CREATION_RULES.md`
   - `./references/API_DESIGN_FLOWCHART_CREATION_RULES.md`
4. If architecture output includes screen flow-action specs, read and apply `./references/FLOW_ACTION_SPEC_CREATION_RULES.md`.
5. For API scope:
   - generate or update YAML, endpoints markdown, and flow list
   - if API detail is required, use `/api-design-spec`
6. For UI scope:
   - generate or update `docs/design/DESIGN_LAYOUT_[FEATURE_KEY].md`
   - run `.claude/skills/design-layout/scripts/render_design_layout_images.py` to attempt screen preview rendering
   - then generate or update `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md` using `/screen-design-spec`
   - when no Figma or screenshot exists, use `generated-draft` with `DESIGN_LAYOUT` as the design source
   - if rendering fails, use the render-skipped note instead of a broken image reference
7. Define system components, data model, API endpoints, flows, screen layouts, and security decisions.
8. Ensure mapping UC/BR to DB/API/screens and keep EN artifact hygiene.
9. If anything is unclear, record OQ-xx in `ARCH_DESIGN` and escalate to PM.
10. Update shared state and Phase 3 checklist.
11. Handoff: suggest `/dev` to prepare `FEATURE_IMPL_PLAN + CODE_HANDOFF` after the design is complete.
