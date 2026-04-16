# SDTK Active Bootstrap

Version: 1.0
Last Updated: 2026-04-16
Owner: SDTK Core Team

Purpose: give new sessions a compact bootstrap layer without requiring a long manual prompt.

## 1) Suite Routing Truth
- Default unprefixed user requests start with Orchestrator Intake.
- Orchestrator classifies intent first, then routes to the smallest sufficient SDTK product, role, and skill.
- PM starts only when the request is ready for formal SDTK-SPEC product initiation.
- Compact intent routing:
  - Raw idea -> brainstorm / requirement clarification in `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`
  - Formal feature delivery -> `SDTK-SPEC`
  - build/fix/refactor/debug -> `SDTK-CODE`
  - deploy/release/infra/CI/CD -> `SDTK-OPS`
  - "what should we do next" -> Orchestrator state review
- `SDTK-SPEC`
  - orchestration, discovery, specs, planning, architecture, QA artifacts
- `SDTK-CODE`
  - implementation, bug fixing, refactoring, verification, ship flow
- `SDTK-OPS`
  - deploy, infra, release, CI/CD, monitoring, incident, ops verification

## 2) Session Start Order
Read these in order:
1. `AGENTS.md`
2. this file
3. `governance/ai/session/SDTK_AGENT_WORKING_RULES.md`
4. backlog and issue-specific spec/plan files

## 3) Consumer Project Notes
- This file is a bootstrap layer, not a complete historical memory archive.
- If the user sends a raw idea, clarify the requirement in `docs/discovery/REQUIREMENT_[FEATURE_KEY].md` before formal PM initiation.
- Start PM initiation only after the discovery artifact is marked `READY_FOR_PM_INITIATION`.
- Use `NEEDS_MORE_DISCOVERY` or `NOT_ACTIONABLE_YET` when the request is not ready.
- Treat the discovery artifact as a lightweight bridge into PM initiation, not a PRD replacement.
- If the request is implementation or operations work, route to SDTK-CODE or SDTK-OPS when available instead of forcing the task into SPEC-only wording.
- Ask clarification when the request is ambiguous, the target path/repo is missing, there is no acceptance boundary, or the next step could mutate external state.
- Proceed when intent and target are clear, the task is read-only analysis, the plan/spec is approved, or the change is bounded and verifiable.
- Update project-specific truths here after install if the repo has:
  - a private/public repo split
  - published package versions
  - active product lane priorities
  - a production domain or support address
