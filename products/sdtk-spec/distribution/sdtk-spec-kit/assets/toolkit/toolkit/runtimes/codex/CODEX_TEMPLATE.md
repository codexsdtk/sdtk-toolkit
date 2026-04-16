# CODEX.md

Version: 1.1
Last Updated: 2026-04-16
Owner: SDTK-SPEC Core Team

This file defines runtime guidance for Codex sessions in projects using the SDTK Suite.

## 1) Rule Priority
1. Explicit user request
2. `AGENTS.md` (project root)
3. `toolkit/AGENTS.md`
4. This file (`CODEX.md`)
5. Other supporting docs

## 2) Runtime Model
- Suite routing:
  - `SDTK-SPEC`: orchestration, specs, planning, architecture, QA artifacts
  - `SDTK-CODE`: implementation, bug fixing, refactoring, verification, ship flow
  - `SDTK-OPS`: deploy, infra, CI/CD, monitoring, incident, ops verification
- `SDTK-SPEC` phase workflow remains: PM -> BA -> ARCH -> DEV -> QA
- Role tags: `/pm`, `/ba`, `/arch`, `/dev`, `/qa`
- Shared state files:
  - `SHARED_PLANNING.md`
  - `QUALITY_CHECKLIST.md`

## 2.1) Codex Session Start Checklist
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
1. Start with `/pm` to define feature scope.
2. Move phase-by-phase without skipping gates.
3. Keep traceability from requirements to design, implementation, and tests.
4. Require code review completion before QA release decision.

## 4) References
- `toolkit/SDTK_TOOLKIT.md`
- `toolkit/AGENTS.md`
- `governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md`
- `governance/ai/session/SDTK_AGENT_WORKING_RULES.md`
- `sdtk-spec.config.json`
