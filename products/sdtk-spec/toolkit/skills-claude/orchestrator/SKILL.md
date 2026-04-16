---
name: orchestrator
description: Orchestrate the SDTK-SPEC 6-phase workflow in Claude Code using SHARED_PLANNING.md + QUALITY_CHECKLIST.md + docs/* artifacts + explicit /dev -> SDTK-CODE -> /qa handoffs.
---

## Critical Constraints
- I do not skip mandatory phases or hand off without current-phase evidence.
- I do not treat visible-list presence as proof of a working direct invocation.
- I do not treat planned commands as equivalent to completed work.
- I preserve truthful fallback behavior and do not overclaim universal helper-dispatch or universal built-in exposure across every Claude surface.

## Claude Runtime Entrypoint Truth
- Visible-list presence of `orchestrator` does not prove `/orchestrator` or any other direct alias.
- `visible` and `working` are separate checks; `working` requires observable controller action from a bounded request.
- Until a Claude-specific direct syntax is validated, the supported controller path remains the repo-local orchestrator contract in the current session.
- Run `sdtk-spec generate --feature-key <KEY> --feature-name "<NAME>" --project-path .` to create skeleton artifacts before phase work begins.

## Execute pipeline (one phase per turn)
- Default role: `PM` if the user did not specify one.
- Respect role tags: `PM`, `BA`, `ARCH`, `DEV`, `QA`.
- For each phase:
  - Create or update the current-phase artifact in `docs/`.
  - If phase is `ARCH` and API contract or flow is in scope, invoke `sdtk-api-doc`.
  - If phase is `ARCH` and API detail spec is in scope, invoke `sdtk-api-design-spec`.
  - If phase is `ARCH` and UI flow behavior is in scope, invoke `sdtk-screen-design-spec`.
  - If phase is `DEV`, stop at `FEATURE_IMPL_PLAN + CODE_HANDOFF`; downstream implementation runs in SDTK-CODE, not here.
  - If phase is `QA` and test-case specification is in scope, invoke `sdtk-test-case-spec`.
  - Update `SHARED_PLANNING.md` and `QUALITY_CHECKLIST.md`.
  - Hand off only after the current phase has fresh evidence.

## Optional: Mailbox Dispatch
- Use `mailbox-dispatch` when one bounded controller-owned phase should be delegated to Claude or Codex.
- Keep planning local when the controller already has enough repo context.
- Lock exact include/exclude boundaries, fallback triggers, and verification commands before dispatch.
- Keep mailbox runtime files transient under `governance/ai/agent-mailbox/runtime/`.
- Run the default post-issue mailbox retrospective after repo truth is closed and before the next mailbox-driven issue.

## Guardrails
- Keep traceability: `REQ -> BR/UC/AC -> design -> backlog -> FEATURE_IMPL_PLAN -> CODE_HANDOFF -> downstream implementation evidence -> QA report`.
- Preserve the repo-local orchestrator contract as the exact fallback when direct built-in exposure or invocation is absent or unvalidated.
- Do not claim that Claude visible-list presence proves `/orchestrator`.
- Do not claim built-in exposure parity across every Claude surface.
