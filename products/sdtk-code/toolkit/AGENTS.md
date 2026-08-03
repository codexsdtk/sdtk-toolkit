# SDTK Orchestrator Routing Contract

Version: 2.0
Last Updated: 2026-07-14

This file is the single source of the SDTK routing contract. `CLAUDE.md` and `CODEX.md` are thin runtime adapters that defer to it; when they appear to disagree with this file, this file wins.

Goal: use the SDTK Suite as a coordinated operating model:
- `SDTK-SPEC` governs upstream discovery, planning, design, traceability, and release gates.
- `SDTK-CODE` is the default downstream system for implementation, bug fixing, refactoring, verification, and ship-ready code changes.
- `SDTK-OPS` is the downstream system for deployment, infrastructure, CI/CD, monitoring, incident handling, and operational verification.

Orchestrator Intake is the always-winning front door for every unprefixed request.

## 1) Default Rules
- If role is not specified, default to Orchestrator Intake, not PM.
- Orchestrator first classifies the user request intent, then routes to the smallest sufficient SDTK product, role, and skill.
- PM starts only when the request is ready for formal SDTK-SPEC product initiation after discovery readiness is confirmed.
- Do not skip phases. If inputs are missing, ask focused questions before moving on.
- At the end of every SDTK-SPEC phase, update:
  - `SHARED_PLANNING.md`
  - `QUALITY_CHECKLIST.md`
- Artifact language under `docs/**` should default to English.
- Read stack and command configuration from `sdtk-spec.config.json` in the project root.
- For VI/JP source requirements, keep original text in an appendix and add literal English translation for traceability.
- `/dev` stops at `FEATURE_IMPL_PLAN + CODE_HANDOFF`; SDTK-CODE is the default downstream coding system.
- Verification-before-completion: no phase may declare done, pass, or handoff-ready without fresh command evidence — run the relevant verification commands in this session and quote their real output in the phase artifact; assumed, remembered, or stale results do not count.
- `toolkit/skills/skills.catalog.yaml` is the inventory source of truth for the 14 core SDTK-SPEC skills, including the bounded `mailbox-dispatch` controller skill.

## 2) Session Bootstrap Protocol
When starting a new session, read context in this order when the files exist:
1. `AGENTS.md`
2. `.sdtk/evolve/LEARNED.md` — locally learned, owner-approved lessons (managed by the evolve skill + `sdtk evolve`; never edit it directly)
3. `governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md`
4. `governance/ai/session/SDTK_AGENT_WORKING_RULES.md`
5. `governance/ai/core/IMPROVEMENT_BACKLOG.md`
6. issue-specific controller spec and implementation plan

Orientation and health:
- If `.sdtk/wiki/` exists, it is the project's committed memory layer: orient with `sdtk-wiki search "<topic>"` (entry points: `.sdtk/wiki/pages/_index.md`, the atlas summary) before falling back to repo-wide searching.
- If any `sdtk-*` CLI behaves unexpectedly (missing verbs, stale help, wrong version), run `sdtk doctor` to detect version fragmentation before debugging further.


Active orchestration check: if `.sdtk/agent-runtime/runs/` holds a run whose state is not terminal (`running` or `waiting_for_approval`), surface it in one line (run id plus the blocking gate, if any) and offer `sdtk-agent run continue` before starting unrelated work, the same way `.sdtk/handoff/` items are surfaced.

## 3) Orchestrator-First Intake Protocol
For every unprefixed user request:
1. Classify the request intent before selecting PM/BA/ARCH/DEV/QA or a downstream product lane.
2. Route to the smallest sufficient workflow:
   - unclear idea or early concept -> brainstorm / requirement clarification, then create or update `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`
   - formal feature discovery or planning -> SDTK-SPEC pipeline
   - implementation, bug fix, refactor, verification, or ship-ready code -> SDTK-CODE
   - deploy, release, infrastructure, CI/CD, monitoring, incident, backup, security-infra, or ops verification -> SDTK-OPS
   - documentation graph or Atlas viewer -> `sdtk-spec atlas` compatibility workflow, or `sdtk-wiki` for canonical SDTK-WIKI work
   - SDTK-WIKI Ask -> native `sdtk-wiki ask` when `.sdtk/wiki/graph` and `wiki.ask` entitlement/runtime preconditions are present
   - review or release decision -> review/QA workflow
3. Ask focused questions only when missing information blocks safe routing.
4. Do not force raw ideas directly into PM Phase 1. Clarify the requirement first in `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`, then start PM initiation only after the artifact is marked `READY_FOR_PM_INITIATION`.
5. When routing creates artifacts, record decisions and open questions in the correct SDTK artifact.

## 4) Intent-To-Skill Routing Matrix
Use this compact matrix during intake so the agent picks the smallest sufficient workflow instead of defaulting everything to PM:

| User intent | Primary route | Output expectation |
|---|---|---|
| Raw idea | Brainstorm / requirement clarification | `docs/discovery/REQUIREMENT_[FEATURE_KEY].md` with clarified problem, scope, assumptions, open questions, and readiness |
| Approved idea ready for product planning | `SDTK-SPEC` PM initiation | `REQUIREMENT_[FEATURE_KEY]` marked `READY_FOR_PM_INITIATION`, then `PROJECT_INITIATION` kickoff |
| Formal feature delivery | `SDTK-SPEC` pipeline | PM -> BA -> ARCH -> DEV planning -> CODE handoff -> QA |
| Build, fix, or refactor implementation | `SDTK-CODE` | code-brainstorm (when slice is ambiguous) -> start -> plan -> build -> verify -> ship |
| Debug failure or unexpected behavior | `SDTK-CODE` debug | Root cause, bounded fix, regression verification |
| Screen/layout design, visual tokens, or prototype evidence before coding | `SDTK-DESIGN` | Reviewable screens/prototype plus a design handoff into SDTK-CODE |
| Deployment, release, infra, or CI/CD work | `SDTK-OPS` | ops-plan -> ops-deploy/ops-incident/ops-monitor -> ops-verify |
| Code review or spec review | Review / QA workflow | Findings, risks, blockers, acceptance signal |
| Atlas graph build or viewer work | `sdtk-spec atlas` compatibility workflow or `sdtk-wiki atlas` for canonical SDTK-WIKI work | Local `.sdtk/atlas` compatibility graph or `.sdtk/wiki` SDTK-WIKI result |
| Question about existing project knowledge or docs | `sdtk-wiki search` (free) or `sdtk-wiki ask` when available | Grounded answer citing project pages before any repo-wide scan |
| SDTK-WIKI Ask | `sdtk-wiki ask` | Grounded answer when `.sdtk/wiki/graph` plus `wiki.ask` entitlement/runtime preconditions are present, otherwise explicit blocker |
| Multi-step durable workflow: 3+ dependent steps, human gates between steps, must survive a pause, or spans multiple lanes/sessions | Propose `sdtk-agent` orchestration (opt-in, token-aware, see the orchestration cost gate in section 5) | `.sdtk/agent-runtime/runs/<run_id>/` ledger plus `reports/final_report.md` |
| "what should we do next" | Orchestrator state review | Recommended next action with rationale and lane choice |

Guardrails:
- Explicit user role prefix wins unless safety or missing critical inputs block execution.
- Raw idea clarification should use `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`; do not widen the discovery-clarification scope into generator automation, package sync, or downstream validation work.
- Ambiguous intent: ask, do not guess. Cap re-routes at 2 to avoid bouncing between products. Escalate to the user when intent cannot be classified or when the re-route limit is hit.

## 5) Proceed-Vs-Ask Decision Rules
Ask clarification when:
1. the requested outcome is ambiguous
2. safety, security, or release impact is unclear
3. the target repo, project, or path is missing
4. implementation is requested without an acceptance boundary
5. the next command could mutate external state
6. the next step would spawn multiple sub-agents or incur significant token cost, such as dispatching an `sdtk-agent` run

Proceed when:
1. the intent and target are clear
2. the task is read-only analysis
3. the user already approved the relevant plan or spec
4. the requested change is bounded and verifiable

### 5.1) Orchestration Cost Gate (sdtk-agent)
`sdtk-agent` chains multiple steps and dispatches each ready task through an adapter, so a single run can spawn many sub-agents and consume significant token budget. Because of that cost, orchestration is always opt-in:

1. Never auto-start an `sdtk-agent` run on the user's behalf. Only propose it.
2. Propose only when a routing trigger is hit (the multi-step row in section 4) and the workflow clears the minimum size (default: 3 dependent steps). One- or two-step bounded tasks route straight to a lane instead of orchestration.
3. When proposing, state the trade-off concretely and let the user decide, defaulting to "no / run inline". Run `sdtk-agent workflow validate` first (it does not spawn anything) to count tasks, human gates, and adapter dispatches, then quote a cost band: dispatch count 3 or fewer is Low, 4-8 is Medium, more than 8 or any loop/retry is High. Example:
   > This request fits sdtk-agent: durable, resumable, with hard approval gates, but it will spawn several agents and cost more tokens than an inline run. Estimate: 9 steps, 3 gates, 11 dispatches (token cost: HIGH). Use sdtk-agent for this, or run it inline? (default: inline)
4. `run start` only creates the ledger and never spawns; treat it as the safe preview point. Dispatch happens on `run continue`, which is an explicit user action. Before a `run continue` that would dispatch several ready tasks at once, report how many tasks and which adapters are about to run, and let the user confirm or step through one task at a time.
5. Honor `.sdtk/agent-runtime/config.json` `orchestration.confirmationMode` (`always` by default): no mode ever allows dispatch without at least one confirmation per run.

## 6) Clarification Protocol
Apply for all roles (`/pm`, `/ba`, `/arch`, `/dev`, `/qa`):
1. If there is ambiguity or missing data, log `Open Questions` as `OQ-xx` in the current phase artifact.
2. Do not guess for behavior, API contracts, UI/UX, data model, security, or release criteria.
3. Escalate unresolved items to PM with question ID and file reference.
4. PM resolves by:
   - using available docs and making a clear decision, or
   - asking the user if source information is still missing.
5. Record decisions in PRD (`Decision Log`) and update the originating `OQ-xx` with resolution.

For raw ideas before PM initiation:
1. Use `docs/discovery/REQUIREMENT_[FEATURE_KEY].md` as the canonical clarification artifact.
2. Record scope, non-goals, assumptions, constraints, open questions, and readiness there before opening `PROJECT_INITIATION`.
3. Treat the discovery artifact as a bridge into PM initiation, not as a PRD replacement.

## 7) Role Selection In One Message
When the user prefixes a message, execute that role:
- `/orchestrator` (default intake + routing)
- `/pm` (formal product initiation + planning)
- `/ba`
- `/arch`
- `/dev`
- `/qa`
- `/engineer` (escalation for technical blockers)

Notes:
- Supported delivery roles are PM/BA/ARCH/DEV/QA.
- There is no separate `/tester` role. Test-case design belongs to QA with `sdtk-test-case-spec`.

## 8) Suite Product Routing
Use the suite products according to task intent:

- `SDTK-SPEC`
  - feature discovery
  - requirements, BA, PRD, backlog, architecture, QA artifacts
  - handoff generation and release-gate traceability
  - entry: `/orchestrator` (recommended), `/pm`, `/ba`, `/arch`, `/dev`, `/qa`
- `SDTK-DESIGN`
  - screen/layout design, visual tokens, prototype evidence, design handoff before coding
  - use before `SDTK-CODE` when implementation needs reviewable screens or a design handoff
- `SDTK-CODE`
  - build a feature
  - fix a bug
  - refactor implementation
  - run implementation verification
  - ship code changes
  - workflow: `start -> plan -> build -> verify -> ship`
  - entry point for ambiguous slices: `code-brainstorm`
  - specialist engine: `code-plan`, `code-execute`, `code-tdd`, `code-debug`, `code-verify`, `code-review`, `code-ship`, `code-finish`, `code-worktree`, `code-discover`, `code-parallel` (sequential fallback when parallel dispatch is unavailable)
- `SDTK-OPS`
  - deploy or release
  - infrastructure and environment setup
  - CI/CD changes
  - monitoring, incident response, security-infra, backup, compliance
  - entry: `ops-discover` (when boundary is unclear), `ops-plan`, `ops-deploy`, `ops-incident`, `ops-monitor`, `ops-backup`, `ops-verify`, `ops-debug`

Cross-cutting capabilities (not a linear lane; usable across every phase):

- `SDTK-WIKI` (memory)
  - project knowledge graph, docs view, and grounded `sdtk-wiki ask`
  - any lane may read from it for recall; build with `sdtk-wiki atlas build`
- `SDTK-AGENT` (orchestration)
  - a durable, file-driven DAG controller that sits above `sdtk-code` agent-team; it does not own a phase, it chains steps across lanes
  - surface: `sdtk-agent run start|continue|status|report`, `gate approve|reject`, `workflow validate`, `adapter hermes-kanban plan`
  - use only when a workflow has 3+ dependent steps, needs human gates between steps, or must survive a pause; otherwise route straight to a lane
  - opt-in and token-aware: always propose-then-confirm before dispatch (see the orchestration cost gate in section 5)
  - the CLI is runtime-neutral and installs no skills; the engine is Free; the hermes-kanban adapter defaults to dry-run and live dispatch stays fail-closed behind explicit configuration plus per-run confirmation

If the current project only has `SDTK-SPEC` runtime assets installed:
- keep `/dev` bounded to planning and `CODE_HANDOFF`
- do not overclaim that SDTK-CODE or SDTK-OPS runtime assets are already installed
- still describe the correct downstream suite path in guidance and handoffs

## 9) Shared State And Quality Gates
- `SHARED_PLANNING.md`: phase status, owners, artifacts, blockers, handoff notes.
- `QUALITY_CHECKLIST.md`: gate checklist by phase.
- No handoff to next phase while current gate is not PASS.
- QA cannot start until downstream implementation evidence exists, normally from SDTK-CODE.
- QA cannot approve until `OPS_HANDOFF` and downstream OPS evidence are present and aligned.
- QA accepts downstream implementation evidence from SDTK-CODE as the default handoff bridge, plus `OPS_HANDOFF + OPS evidence` in the current formal suite flow.

## 10) Runtime Availability Rules
- Route only to products whose runtime assets are installed; do not overclaim.
- For SDTK-SPEC-only installs: keep `/dev` bounded to planning and `CODE_HANDOFF`; do not claim SDTK-CODE or SDTK-OPS are installed.
- For Codex runtimes: project-local skills require the explicit local `CODEX_HOME=<project>/.codex` contract; native `.codex/skills` auto-discovery is not claimed.
- Use `ops-parallel` or `code-parallel` only for truly independent slices. If parallel dispatch is unavailable in the active runtime, execute them sequentially in one controller session.
- `SDTK-AGENT` is runtime-neutral: it installs no skills and behaves identically on Claude and Codex. It is CLI-only, so do not invent a slash command for it.
- The `sdtk-agent` hermes-kanban adapter defaults to dry-run. Live dispatch exists but is fail-closed behind explicit adapter configuration (`mode: live` plus `live_ack`) and a per-run `--confirm`, and it remains an attended, validation-gated capability. Never claim, enable, or attempt live dispatch on the user's behalf.

## 11) Discovery And PM Readiness
- PM initiation starts only after `docs/discovery/REQUIREMENT_[FEATURE_KEY].md` is marked `READY_FOR_PM_INITIATION`.
- Use `NEEDS_MORE_DISCOVERY` or `NOT_ACTIONABLE_YET` when the request is not ready.
- The discovery artifact is a pre-PM clarification bridge, not a PRD or BA replacement.
