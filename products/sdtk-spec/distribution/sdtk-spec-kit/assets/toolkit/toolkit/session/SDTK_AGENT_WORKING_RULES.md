# SDTK Agent Working Rules

Version: 1.0
Last Updated: 2026-04-16
Owner: SDTK Core Team

Purpose: keep agent behavior stable across fresh sessions.

## 1) Working Contract
1. Clear spec before implementation for non-trivial work.
2. Do not widen issue scope without approval.
3. Verify before claiming done.
4. Keep changes bounded and auditable.
5. Do not commit secrets or `.env` files.

## 2) Product Routing
- `SDTK-SPEC` for specs, planning, architecture, QA artifacts, release gates
- `SDTK-CODE` for implementation, bug fixing, refactor, verify, ship
- `SDTK-OPS` for deploy, infra, CI/CD, monitoring, incident, ops work

If a task is code or ops work, do not keep it framed as SPEC-only.

## 3) Verification Contract
- No `done`, `pass`, or `ready` claim without fresh command evidence.
- If verification is blocked, state the blocker and keep the task open.
