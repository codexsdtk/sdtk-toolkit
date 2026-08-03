---
name: orchestrator
description: Classify intent and route to the correct SDTK product workflow — SDTK-CODE start→plan→build→verify→ship, SDTK-SPEC PM→BA→ARCH→DEV→QA, or SDTK-OPS — using two-stage classify→registry routing with coarse-to-fine product selection.
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

## Stage 1 — Classify Intent
Before selecting any role or product lane, classify the incoming request:

| Request type | Classification |
|---|---|
| Raw / unclear idea | `brainstorm-discovery` |
| Analyze, clarify, or investigate an issue | `code-brainstorm` or `discovery` |
| Build a feature, fix a bug, or refactor | `sdtk-code` |
| Formal project spec or feature delivery pipeline | `sdtk-spec` |
| Deploy, infra, CI/CD, incident, monitoring | `sdtk-ops` |
| Code review or release decision | `review-qa` |
| Atlas / wiki graph or Ask | `atlas-wiki` |
| "What should we do next?" | `orchestrator-state-review` |

If the classification is ambiguous: **ask one focused question**, do not guess.
Cap re-routes at 2. If a third route would be needed, escalate to the user with an explicit summary.

## Stage 2 — Coarse-to-Fine Route
After classifying intent, pick the **product** first, then the **skill within** that product:

- `brainstorm-discovery` → create or update `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`; PM initiation only after `READY_FOR_PM_INITIATION`
- `code-brainstorm` → `/code-brainstorm` skill before entering the CODE workflow
- `sdtk-code` → `start -> plan -> build -> verify -> ship` workflow
- `sdtk-spec` → PM → BA → ARCH → DEV (planning + `CODE_HANDOFF`) → SDTK-CODE → QA
- `sdtk-ops` → the relevant journey start skill → `ops-verify`
- `review-qa` → evidence-first review → QA → controller

## Few-Shot Routing Examples

| User request | Chosen route |
|---|---|
| "Analyze why the auth module is slow" | SDTK-CODE · `/code-brainstorm` |
| "Fix the login validation bug" | SDTK-CODE · `start -> build -> verify -> ship` |
| "Design and spec the notification feature" | SDTK-SPEC · PM → BA → ARCH → DEV |
| "Deploy the v2 release to production" | SDTK-OPS · `ops-plan -> ops-deploy -> ops-verify` |

## Per-Route Handoff Line (P5)
On each routing decision, emit one explicit handoff line before starting work:
> Route: `<product>` · Reason: `<one-line rationale>` · Next: `<skill or workflow to invoke>`

## SDTK-SPEC Feature Bootstrap
Run from the project root to initialize skeleton artifacts:
```
sdtk-spec generate --feature-key YOUR_FEATURE --feature-name "Your Feature"
```

## Execute pipeline (one phase per turn)
- Default role: Orchestrator Intake. Select PM only when the request is ready for formal SDTK-SPEC product initiation.
- Respect role tags: `PM`, `BA`, `ARCH`, `DEV`, `QA`.
- For each SDTK-SPEC phase:
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
