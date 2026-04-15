# CLAUDE.md

Version: 2.0
Last Updated: 2026-03-05
Owner: SDTK-SPEC Core Team

This file defines runtime guidance for Claude Code sessions in projects using SDTK-SPEC.

## 1) Rule Priority
1. Explicit user request
2. `AGENTS.md` (project root)
3. Installed skill content (`.claude/skills/*/SKILL.md`)
4. This file (`CLAUDE.md`)
5. `sdtk-spec.config.json`

## 2) Runtime Model
- Primary workflow: PM -> BA -> ARCH -> DEV -> QA
- Entry point: `/orchestrator` (recommended) or `/pm`
- Role commands: `/pm`, `/ba`, `/arch`, `/dev`, `/qa`
- Sub-skill commands: `/api-doc`, `/api-design-spec`, `/screen-design-spec`, `/design-layout`, `/test-case-spec`, `/dev-backend`, `/dev-frontend`
- Shared state files:
  - `SHARED_PLANNING.md`
  - `QUALITY_CHECKLIST.md`

## 3) Minimal Session Flow
1. Start with `/orchestrator` or `/pm` to define feature scope.
2. Move phase-by-phase without skipping gates.
3. Keep traceability from requirements to design, implementation, and tests.
4. Require code review completion before QA release decision.

## 4) Installed Skills
Skills are installed at `.claude/skills/` and provide slash commands:

| Command | Purpose |
|---------|---------|
| `/orchestrator` | Full 6-phase SDLC orchestration |
| `/pm` | PM initiation + planning |
| `/ba` | Business analysis |
| `/arch` | Solution architecture |
| `/dev` | Development + code review |
| `/qa` | QA testing + release decision |
| `/api-doc` | OpenAPI YAML + flow diagrams |
| `/api-design-spec` | API design detail spec |
| `/screen-design-spec` | Screen flow-action spec |
| `/design-layout` | UI screen layout wireframes |
| `/test-case-spec` | QA test-case spec |
| `/dev-backend` | Backend code conventions |
| `/dev-frontend` | Frontend code conventions |

Specialist rule reference files are installed inside each skill directory when that skill needs them (for example `.claude/skills/api-doc/references/`).

## 5) References
- `sdtk-spec.config.json`
- `.claude/skills/<skill>/references/` (skill-local rule files when required)
