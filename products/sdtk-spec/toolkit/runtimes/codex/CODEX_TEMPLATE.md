# CODEX.md

Version: 1.0
Last Updated: 2026-02-25
Owner: SDTK-SPEC Core Team

This file defines runtime guidance for Codex sessions in projects using SDTK-SPEC.

## 1) Rule Priority
1. Explicit user request
2. `AGENTS.md` (project root)
3. `toolkit/AGENTS.md`
4. This file (`CODEX.md`)
5. Other supporting docs

## 2) Runtime Model
- Primary workflow: PM -> BA -> ARCH -> DEV -> QA
- Role tags: `/pm`, `/ba`, `/arch`, `/dev`, `/qa`
- Shared state files:
  - `SHARED_PLANNING.md`
  - `QUALITY_CHECKLIST.md`

## 3) Minimal Session Flow
1. Start with `/pm` to define feature scope.
2. Move phase-by-phase without skipping gates.
3. Keep traceability from requirements to design, implementation, and tests.
4. Require code review completion before QA release decision.

## 4) References
- `toolkit/SDTK_TOOLKIT.md`
- `toolkit/AGENTS.md`
- `sdtk-spec.config.json`
