# CLAUDE.md

Version: 3.0
Last Updated: 2026-07-14
Owner: SDTK-SPEC Core Team

Runtime adapter for Claude Code sessions in projects using the SDTK Suite. The full routing contract — lanes, intake protocol, intent-to-skill matrix, proceed-vs-ask rules, quality gates, orchestration cost gate — lives in `AGENTS.md` (single source). This file only adds what is specific to the Claude runtime.

<!-- SDTK:SHARED:BEGIN (keep byte-identical with the CODEX runtime adapter; the routing contract itself lives in AGENTS.md) -->
## 1) Rule Priority
1. Explicit user request
2. `AGENTS.md` (project root) — the single source of the SDTK routing contract
3. Installed skill content of the active runtime
4. This runtime adapter file
5. `sdtk-spec.config.json`

## 2) Session Contract
1. Read `AGENTS.md` first and follow its Session Bootstrap Protocol (section 2) — including `.sdtk/evolve/LEARNED.md`, the `.sdtk/wiki` memory-layer orientation, and the active `sdtk-agent` run check.
2. Default unprefixed entry point is Orchestrator Intake: classify intent, then route with the Intent-To-Skill matrix (`AGENTS.md` section 4) and the Proceed-Vs-Ask rules (section 5), always choosing the smallest sufficient workflow.
3. Raw ideas go through `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`; PM initiation starts only at `READY_FOR_PM_INITIATION`. Use `NEEDS_MORE_DISCOVERY` or `NOT_ACTIONABLE_YET` when the request is not ready.
4. `sdtk-agent` orchestration is opt-in and token-aware behind the cost gate (`AGENTS.md` section 5.1): propose-then-confirm, never auto-start a run.
5. Route only to products whose runtime assets are installed; do not overclaim (`AGENTS.md` sections 8 and 10).
6. If any `sdtk-*` CLI behaves unexpectedly (missing verbs, stale help, wrong version), run `sdtk doctor` before debugging further.
<!-- SDTK:SHARED:END -->

## 3) Claude Runtime Specifics
Skills are installed at `.claude/skills/` and surface as slash commands. Rows apply only when the owning kit's runtime assets are installed:

| Command | Purpose |
|---------|---------|
| `/orchestrator` | Classify intent and route to the correct product workflow |
| `/pm` | PM initiation + planning |
| `/ba` | Business analysis |
| `/arch` | Solution architecture |
| `/dev` | Development planning + code handoff |
| `/qa` | QA testing + release decision |
| `/api-doc` | OpenAPI YAML + flow diagrams |
| `/api-design-spec` | API design detail spec |
| `/screen-design-spec` | Screen flow-action spec |
| `/design-layout` | UI screen layout wireframes |
| `/test-case-spec` | QA test-case spec |
| `/dev-backend` | Backend code conventions |
| `/dev-frontend` | Frontend code conventions |
| `/code-brainstorm` | Brainstorm and clarify before coding (SDTK-CODE entry for ambiguous slices) |
| `start` / `plan` / `build` / `verify` / `ship` | SDTK-CODE workflow phases |

Specialist rule reference files are installed inside each skill directory when that skill needs them (for example `.claude/skills/api-doc/references/`).

`sdtk-agent` is CLI-only: it installs no skill and has no slash command. Drive it through the `sdtk-agent` CLI (`run start|continue|status|report`, `gate approve|reject`, `workflow validate`), never a `/agent` command.

## 4) References
- `AGENTS.md` (routing contract — single source)
- `sdtk-spec.config.json`
- `governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md`
- `governance/ai/session/SDTK_AGENT_WORKING_RULES.md`
- `.claude/skills/<skill>/references/` (skill-local rule files when required)
