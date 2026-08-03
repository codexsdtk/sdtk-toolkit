---
name: sdtk-orchestrator
description: "Classify intent and route to the correct SDTK product workflow: SDTK-CODE start→plan→build→verify→ship, SDTK-SPEC PM→BA→ARCH→DEV→QA, or SDTK-OPS. Uses two-stage classify→registry routing with coarse-to-fine product selection."
---

# SDTK Orchestrator (Classify-and-Route)

## Critical Constraints
- I do not skip mandatory phases or hand off without current-phase evidence.
- I do not treat planned commands as equivalent to completed work.
- I preserve truthful fallback behavior and do not overclaim universal helper-dispatch or universal skill exposure across every runtime surface.
- If bounded audits are requested, they stay narrow, evidence-cited, and non-approval-bearing.

## Runtime Entrypoint Truth
- For Codex, project-local orchestrator support is bounded to explicit `CODEX_HOME=<project>/.codex`; `.codex/skills/sdtk-orchestrator` or helper dispatch do not prove direct built-in exposure.
- For Claude, visible-list presence of `orchestrator` does not prove `/orchestrator` or any other direct alias.
- `visible` and `working` are separate runtime checks; `working` requires observable controller action from a bounded request.
- Until runtime-specific direct syntax is validated, continue via the repo-local orchestrator contract in the current session.

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
Cap re-routes at 2. If a third route would be needed, escalate to the user with an explicit summary of what has been tried and why it is blocked.

## Stage 2 — Coarse-to-Fine Route
After classifying intent, pick the **product** first, then the **skill within** that product:

- `brainstorm-discovery` → create or update `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`; PM initiation only after `READY_FOR_PM_INITIATION`
- `code-brainstorm` → `/code-brainstorm` skill before entering the CODE workflow
- `sdtk-code` → `start -> plan -> build -> verify -> ship` workflow; use `code-brainstorm` when the slice is still ambiguous after intake grounding
- `sdtk-spec` → PM → BA → ARCH → DEV (planning + `CODE_HANDOFF`) → SDTK-CODE → QA
- `sdtk-ops` → `ops-discover` (when boundary unclear) or the relevant journey start skill → `ops-verify`
- `review-qa` → evidence-first review → QA → controller
- `atlas-wiki` → `sdtk-spec atlas` or `sdtk-wiki atlas`

## Few-Shot Routing Examples (P3)

| User request | Classified route | Handoff |
|---|---|---|
| "Analyze why the auth module is slow" | `code-brainstorm` | Route: SDTK-CODE · Reason: investigation before code; Skill: `/code-brainstorm` |
| "Fix the login validation bug" | `sdtk-code` / `bugfix` | Route: SDTK-CODE · Reason: bounded fix with known scope; Skill: `start -> build -> verify -> ship` |
| "Design and spec the notification feature" | `sdtk-spec` | Route: SDTK-SPEC · Reason: upstream planning required; Skill: PM → BA → ARCH → DEV |
| "Deploy the v2 release to production" | `sdtk-ops` | Route: SDTK-OPS · Reason: operational rollout; Skill: `ops-plan -> ops-deploy -> ops-verify` |
| "What should we work on next?" | `orchestrator-state-review` | Route: Orchestrator review · Reason: state check; Skill: read SHARED_PLANNING + backlog |

## Routing Guardrails (P4)
- **Ambiguous → ask:** if intent classification is unclear, ask one focused question before routing.
- **Cap re-routes:** do not bounce between products more than twice in one session; escalate to the user on the third re-route attempt.
- **Escalate:** when intent cannot be classified or the re-route limit is hit, state the problem explicitly and ask the user to clarify.
- **Role prefix wins:** if the user explicitly uses `/pm`, `/ba`, `/arch`, `/dev`, `/qa`, `sdtk-code`, or `sdtk-ops`, execute that role directly without re-classifying.

## Per-Route Handoff Line (P5)
On each routing decision, emit one explicit handoff line before starting work:
> Route: `<product>` · Reason: `<one-line rationale>` · Next: `<skill or workflow to invoke>`

## Initialize
- Start as Orchestrator Intake for unprefixed user requests.
- Classify intent before choosing PM/BA/ARCH/DEV/QA or downstream SDTK-CODE/SDTK-OPS paths.
- Use brainstorm / requirement clarification for unclear ideas before formal PM initiation.
- Ensure feature key + feature name exist (ask if missing).
- Read `sdtk-spec.config.json` (project stack + commands) if present.
- If `toolkit/scripts/init-feature.ps1` exists: run it to create skeleton artifacts; otherwise create the same files from `toolkit/templates/`.

## Execute pipeline (one phase per turn)
- Default unprefixed role: Orchestrator Intake. Select PM only when the request is ready for formal SDTK-SPEC product initiation.
- Respect role tags: `/pm`, `/ba`, `/arch`, `/dev`, `/qa`.
- For each SDTK-SPEC phase:
  - Create/update the phase artifact(s) in `docs/`.
  - If phase is ARCH and API contract/flow is in scope, invoke `sdtk-api-doc` to produce/update `docs/api/[FeaturePascal]_API.yaml`, `docs/api/[FEATURE_KEY]_ENDPOINTS.md`, and `docs/api/[feature_snake]_api_flow_list.txt`.
  - If phase is ARCH and API detail spec is in scope, invoke `sdtk-api-design-spec` to produce/update `docs/api/[FEATURE_KEY]_API_DESIGN_DETAIL.md`.
  - If phase is ARCH and UI flow behavior is in scope, invoke `sdtk-screen-design-spec` to produce/update `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`.
  - If phase is DEV, stop at `FEATURE_IMPL_PLAN + CODE_HANDOFF`; do not claim the orchestrator completed downstream code execution.
  - If phase is QA and test-case specification is in scope, invoke `sdtk-test-case-spec` to produce/update `docs/qa/[FEATURE_KEY]_TEST_CASE.md`.
  - If phase is QA and controller review is in scope, preserve `docs/qa/QA_RELEASE_REPORT_[FEATURE_KEY].md` as the primary QA output and `docs/qa/CONTROLLER_ACCEPTANCE_[FEATURE_KEY].md` as the separate persisted controller verdict artifact.
  - If QA or controller rejects a batch, route the next pass only through a bounded targeted-fix loop with explicit allowed surfaces and refresh order: `verify -> QA -> controller`.
  - Update `SHARED_PLANNING.md` (phase row + activity log).
  - Update `QUALITY_CHECKLIST.md` (mark items PASS/Pending).
  - Produce one clear handoff message to the next role only after the current phase evidence supports that handoff.

## SDTK-SPEC Feature Bootstrap
Run from the project root to create skeleton artifacts before phase work begins:
```
sdtk-spec generate --feature-key YOUR_FEATURE --feature-name "Your Feature"
```

## API design detail mode (Hybrid)
- Read `sdtk-spec.config.json` key: `orchestration.apiDesignDetailMode`.
- Supported values:
  - `auto` (default): run `sdtk-api-design-spec` when ARCH has API scope and YAML + flow list are available.
  - `on`: always run `sdtk-api-design-spec` for API scope (fail fast if required inputs are missing).
  - `off`: skip API design detail generation unless user explicitly requests it.

## Test-case spec mode (Hybrid)
- Read `sdtk-spec.config.json` key: `orchestration.testCaseSpecMode`.
- Supported values:
  - `auto` (default): run `sdtk-test-case-spec` when QA phase requires reusable test-case artifact.
  - `on`: always run `sdtk-test-case-spec` for QA phase (fail fast if required inputs are missing).
  - `off`: skip test-case spec generation unless user explicitly requests it.

## Optional: Mailbox Dispatch
- Use `sdtk-mailbox-dispatch` when one bounded controller-owned phase should be delegated to Claude or Codex.
- Keep planning local when the controller already has enough repo context.
- Lock exact include/exclude boundaries, fallback triggers, and verification commands before dispatch.
- Keep mailbox runtime files transient under `governance/ai/agent-mailbox/runtime/`.
- Run the default post-issue mailbox retrospective after repo truth is closed and before the next mailbox-driven issue.

## Flow Overview

```dot
digraph sdtk_orchestrator_flow {
  rankdir=LR;
  Intake [label="Orchestrator\nIntake"];
  Classify [label="Classify\nIntent"];
  Brainstorm [label="code-brainstorm /\nDiscovery"];
  CODE [label="SDTK-CODE\nstart→plan→build→verify→ship"];
  SPEC [label="SDTK-SPEC\nPM→BA→ARCH→DEV"];
  OPS [label="SDTK-OPS"];
  QA [label="QA"];
  Intake -> Classify;
  Classify -> Brainstorm [label="ambiguous"];
  Classify -> CODE [label="build/fix/refactor"];
  Classify -> SPEC [label="spec/feature delivery"];
  Classify -> OPS [label="deploy/infra/ops"];
  SPEC -> DEV_CODE [label="CODE_HANDOFF"];
  DEV_CODE [label="SDTK-CODE"];
  DEV_CODE -> QA [label="implementation evidence"];
  QA -> SPEC;
}
```

Default bridge is `/dev -> SDTK-CODE -> /qa`.

## Verification Before Completion
Apply `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md` whenever you mark a phase complete, mark a gate PASS, or hand off to the next role. Require fresh verification evidence before you state that the phase is done.

Do not:
- say a phase is done or PASS without citing the evidence that proves it
- treat a planned command as equivalent to an executed command
- hand off DEV or QA work with overstated verification status

If the evidence is incomplete, keep the phase open or mark it blocked instead of overstating completion.

## Guardrails
- Do not skip phases; if prerequisites are missing, ask focused questions.
- Keep traceability: REQ -> BR/UC/AC -> design -> backlog -> FEATURE_IMPL_PLAN -> CODE_HANDOFF -> downstream implementation evidence -> QA report.
- Default bridge is `/dev -> SDTK-CODE -> /qa`.
- Preserve truthful fallback behavior when helper dispatch or built-in skill exposure is unavailable; repo-local contract execution remains valid evidence of workflow support.
- Keep bounded audits narrow, evidence-cited, and non-approval-bearing; the controller remains the only final acceptance authority.
- Do not widen a targeted-fix loop beyond the exact findings that triggered the rejection.
- If input requirements are VI/JP: preserve original text + add EN translation in appendix for traceability (at least in Project Initiation and BA spec).

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Default to PM for every unprefixed request | Breaks routing for CODE/OPS work and forces SPEC overhead on implementation tasks | Classify intent first; route to the smallest sufficient product workflow |
| Skip directly from PM to DEV because the request seems small | Breaks traceability and removes BA and ARCH controls | Keep phase order unless the user explicitly narrows scope with acceptable evidence |
| Hand off a phase based on planned checks instead of executed evidence | Creates false PASS status and weakens downstream gates | Require fresh evidence before marking the phase complete |
| Mix generation, review, and release decisions in one uncontrolled turn | Makes status tracking ambiguous | Complete one phase handoff at a time and update shared state before moving on |
| Claim helper-dispatch or skill exposure is universal across every runtime surface | Overstates runtime guarantees and breaks truthful fallback behavior | State the verified surface only and keep the repo-local fallback explicit |
| Use mailbox dispatch as a generic worker platform or reopen broad planning through it | Wastes controller time and weakens boundary discipline | Keep mailbox delegation bounded, preserve exact boundaries, and prefer local planning when context is already strong |
| Let a bounded audit issue the final verdict or replace QA/controller review | Breaks authority boundaries and creates ambiguous approval ownership | Keep audits narrow and evidence-cited, then return the findings to QA/controller |
| Let a rejected batch jump straight to ship or PM closure | Breaks the targeted-fix refresh order and hides unresolved findings | Route rejected batches through the bounded loop `verify -> QA -> controller` before any later phase |
