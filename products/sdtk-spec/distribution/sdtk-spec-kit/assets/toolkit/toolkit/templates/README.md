# Templates (SDTK-SPEC)

Files in `toolkit/templates/` are skeleton artifacts used by `init-feature.ps1`
to bootstrap a new feature across the SDLC phases.

**Note:** These templates produce *scaffold* files with TBD placeholders.
The scaffolds define the document structure for each SDLC phase. Content is
expected to be filled in by human authors or AI agents working through the
6-phase pipeline (PM Init -> BA -> PM Planning -> ARCH -> DEV -> QA).
See `SHARED_PLANNING.md` (generated) for the phase pipeline tracker.

## Tokens
- `{{FEATURE_KEY}}` (UPPER_SNAKE_CASE), example: `WORKFLOW_ENGINE`
- `{{FEATURE_NAME}}`, example: `Workflow Engine`
- `{{FEATURE_PASCAL}}`, example: `WorkflowEngine`
- `{{FEATURE_SNAKE}}` (lower_snake_case), example: `workflow_engine`
- `{{DATE}}` format: `YYYY-MM-DD`
- `{{DATETIME}}` format: `YYYY-MM-DD HH:mm`

## Generate
Run from project root:

`powershell -ExecutionPolicy Bypass -File ".\\toolkit\\\scripts\\init-feature.ps1" -FeatureKey YOUR_FEATURE -FeatureName "Your Feature"`

The script renders templates into `docs/**` and updates:
- `SHARED_PLANNING.md`
- `QUALITY_CHECKLIST.md`

## Stack Configuration
- Stack and command values come from `sdtk-spec.config.json` (project root).
- `init-feature.ps1` reads config values and injects them into templates.

## Added Architecture Outputs
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md`
- `docs/api/[FEATURE_KEY]_API_DESIGN_DETAIL.md`
- `docs/database/DATABASE_SPEC_[FEATURE_KEY].md`
- `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`

## Added QA Outputs
- `docs/qa/[FEATURE_KEY]_TEST_CASE.md`
- `docs/qa/QA_RELEASE_REPORT_[FEATURE_KEY].md`
- `docs/qa/CONTROLLER_ACCEPTANCE_[FEATURE_KEY].md`

## ARCH Orchestration Mapping
- API scope: use `sdtk-api-doc`.
- API detail scope (from YAML + flow list): use `sdtk-api-design-spec` (mode `apiDesignDetailMode: auto|on|off`).
- UI flow-action scope: use `sdtk-screen-design-spec`.

## QA Orchestration Mapping
- QA release decision/report scope: use `sdtk-qa`.
- QA detailed test-case spec scope: use `sdtk-test-case-spec` (mode `testCaseSpecMode: auto|on|off`).

## Rules Used by Toolkit
- API design/flowchart rules:
  - `templates/docs/api/YAML_CREATION_RULES.md`
  - `templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md`
- Compatibility notes kept for legacy references:
  - `templates/docs/api/FLOWCHART_CREATION_RULES.md`
  - `templates/docs/api/API_DESIGN_CREATION_RULES.md`
- Screen flow-action spec rules:
  - `templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md`
  - Numbering mode is fixed: global numbering across full document (no screen-level reset).
- QA test-case spec rules:
  - `templates/docs/qa/TEST_CASE_CREATION_RULES.md`
- Skill-specific local helper refs retained outside `templates/docs/**`:
  - `toolkit/skills/sdtk-screen-design-spec/references/numbering-rules.md`
  - `toolkit/skills/sdtk-screen-design-spec/references/figma-mcp.md`
  - `toolkit/skills/sdtk-screen-design-spec/references/excel-image-export.md`
