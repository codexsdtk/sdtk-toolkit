# SDTK Agent Working Rules

Version: 1.0
Last Updated: 2026-04-16
Owner: SDTK Core Team

Purpose: keep agent behavior stable across fresh sessions.

## 1) Working Contract
1. Start unprefixed requests with Orchestrator Intake.
2. Classify intent before choosing PM/BA/ARCH/DEV/QA or a downstream product lane.
3. Clear spec before implementation for non-trivial work.
4. Do not widen issue scope without approval.
5. Verify before claiming done.
6. Keep changes bounded and auditable.
7. Do not commit secrets or `.env` files.

## 2) Product Routing
- Raw idea -> brainstorm / requirement clarification in `docs/discovery/REQUIREMENT_[FEATURE_KEY].md` before PM initiation
- Formal feature delivery -> `SDTK-SPEC`
- `SDTK-SPEC` for specs, planning, architecture, QA artifacts, release gates
- `SDTK-CODE` for build, implementation, bug fixing, refactor, debug, verify, ship
- `SDTK-OPS` for deploy, infra, CI/CD, monitoring, incident, ops work
- "what should we do next" -> Orchestrator state review using the smallest sufficient workflow

Ask clarification when:
- the request is ambiguous
- the target repo, project, or path is missing
- implementation is requested without an acceptance boundary
- the next step could mutate external state

Proceed when:
- intent and target are clear
- the task is read-only analysis
- the plan/spec is approved
- the requested change is bounded and verifiable

If a task is code or ops work, do not keep it framed as SPEC-only.

Discovery gating:
- For raw ideas, create or update `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`.
- Start PM initiation only after the artifact is marked `READY_FOR_PM_INITIATION`.
- Use `NEEDS_MORE_DISCOVERY` or `NOT_ACTIONABLE_YET` when the request is not ready.
- Do not treat the discovery artifact as a replacement for `PROJECT_INITIATION`, PRD, BA spec, or backlog.

## 3) Verification Contract
- No `done`, `pass`, or `ready` claim without fresh command evidence.
- If verification is blocked, state the blocker and keep the task open.
