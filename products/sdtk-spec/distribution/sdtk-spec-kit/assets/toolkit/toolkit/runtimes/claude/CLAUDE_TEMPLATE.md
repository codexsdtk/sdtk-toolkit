# CLAUDE.md

Version: 2.1
Last Updated: 2026-04-16
Owner: SDTK-SPEC Core Team

This file defines runtime guidance for Claude Code sessions in projects using the SDTK Suite.

## 1) Rule Priority
1. Explicit user request
2. `AGENTS.md` (project root)
3. Installed skill content (`.claude/skills/*/SKILL.md`)
4. This file (`CLAUDE.md`)
5. `sdtk-spec.config.json`

## 2) Runtime Model
- Suite routing:
  - `SDTK-SPEC`: orchestration, specs, planning, architecture, QA artifacts
  - `SDTK-CODE`: implementation, bug fixing, refactoring, verification, ship flow
  - `SDTK-OPS`: deploy, infra, CI/CD, monitoring, incident, ops verification
- `SDTK-SPEC` phase workflow remains: PM -> BA -> ARCH -> DEV -> QA
- Entry point: `/orchestrator` (recommended) or `/pm`
- Role commands: `/pm`, `/ba`, `/arch`, `/dev`, `/qa`
- Sub-skill commands: `/api-doc`, `/api-design-spec`, `/screen-design-spec`, `/design-layout`, `/test-case-spec`, `/dev-backend`, `/dev-frontend`
- Shared state files:
  - `SHARED_PLANNING.md`
  - `QUALITY_CHECKLIST.md`

## 2.1) Claude Session Start Checklist
Read these in order when they exist:
1. `AGENTS.md`
2. `governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md`
3. `governance/ai/session/SDTK_AGENT_WORKING_RULES.md`
4. issue-specific controller spec and implementation plan

Routing rules:
- requirements/spec/planning/architecture/test artifacts -> `SDTK-SPEC`
- build feature or fix code -> `SDTK-CODE` when available
- deploy/release/infra/ops -> `SDTK-OPS` when available

If only SPEC runtime assets are installed:
- keep `/dev` bounded to planning and `CODE_HANDOFF`
- do not claim that SDTK-CODE or SDTK-OPS runtime assets are already installed

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
- `governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md`
- `governance/ai/session/SDTK_AGENT_WORKING_RULES.md`
- `.claude/skills/<skill>/references/` (skill-local rule files when required)
