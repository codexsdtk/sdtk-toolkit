# SDTK Suite Multi-Agent Software Development Toolkit

Goal: use the SDTK Suite as a coordinated operating model:
- `SDTK-SPEC` governs upstream discovery, planning, design, traceability, and release gates.
- `SDTK-CODE` is the default downstream system for implementation, bug fixing, refactoring, verification, and ship-ready code changes.
- `SDTK-OPS` is the downstream system for deployment, infrastructure, CI/CD, monitoring, incident handling, and operational verification.

`SDTK-SPEC` remains the orchestration and documentation entry point, but the suite is not SPEC-only.

## 0) Default Rules
- If role is not specified, default to PM (entry point) and start at Phase 1.
- Do not skip phases. If inputs are missing, ask focused questions before moving on.
- At the end of every phase, update:
  - `SHARED_PLANNING.md`
  - `QUALITY_CHECKLIST.md`
- Artifact language under `docs/**` should default to English.
- Read stack and command configuration from `sdtk-spec.config.json` in the project root.
- For VI/JP source requirements, keep original text in an appendix and add literal English translation for traceability.
- `/dev` stops at `FEATURE_IMPL_PLAN + CODE_HANDOFF`; SDTK-CODE is the default downstream coding system.
- Verification-before-completion: no phase may declare done, pass, or handoff-ready without fresh command evidence per `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md`.
- `toolkit/skills/skills.catalog.yaml` is the inventory source of truth for the 14 core SDTK-SPEC skills, including the bounded `mailbox-dispatch` controller skill.

## 0.2) Session Bootstrap Protocol
When starting a new session, read context in this order when the files exist:
1. `AGENTS.md`
2. `governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md`
3. `governance/ai/session/SDTK_AGENT_WORKING_RULES.md`
4. `governance/ai/core/IMPROVEMENT_BACKLOG.md`
5. issue-specific controller spec and implementation plan

Do not read the entire historical session archive by default. Use `SDTK_SESSION_MEMORY_*.md` only when chronology or past acceptance details are required.

## 0.1) Clarification Protocol
Apply for all roles (`/pm`, `/ba`, `/arch`, `/dev`, `/qa`):
1. If there is ambiguity or missing data, log `Open Questions` as `OQ-xx` in the current phase artifact.
2. Do not guess for behavior, API contracts, UI/UX, data model, security, or release criteria.
3. Escalate unresolved items to PM with question ID and file reference.
4. PM resolves by:
   - using available docs and making a clear decision, or
   - asking the user if source information is still missing.
5. Record decisions in PRD (`Decision Log`) and update the originating `OQ-xx` with resolution.

## 1) Role Selection In One Message
When the user prefixes a message, execute that role:
- `/pm` (entry point + orchestrator)
- `/ba`
- `/arch`
- `/dev`
- `/qa`
- `/engineer` (escalation for technical blockers)

Notes:
- Supported delivery roles are PM/BA/ARCH/DEV/QA.
- There is no separate `/tester` role. Test-case design belongs to QA with `sdtk-test-case-spec`.

## 2) Standard 6-Phase Pipeline
1. PM Initiation -> `docs/product/PROJECT_INITIATION_[FEATURE_KEY].md`
2. BA Analysis -> `docs/specs/BA_SPEC_[FEATURE_KEY].md`
3. PM Planning -> `docs/product/PRD_[FEATURE_KEY].md` + `docs/product/BACKLOG_[FEATURE_KEY].md`
4. ARCH Design -> `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md` (plus API/layout docs when needed)
5. DEV Planning + SDTK-CODE Handoff -> `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md` + `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
6. QA Testing -> `docs/qa/[FEATURE_KEY]_TEST_CASE.md` + `docs/qa/QA_RELEASE_REPORT_[FEATURE_KEY].md`

Default bridge after Phase 5 planning output:
- `/dev` emits the handoff
- SDTK-CODE performs `start -> plan -> build -> verify -> ship`
- `/qa` consumes downstream implementation evidence plus `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json` and downstream OPS evidence

## 2.1) DEV Handoff Contract
DEV output is planning + readiness gating, not final code delivery:
1. Build or refine `FEATURE_IMPL_PLAN`.
2. Generate `CODE_HANDOFF_[FEATURE_KEY].json`.
3. Keep blockers explicit when the work is not ready for SDTK-CODE.

`/dev` does not auto-run SDTK-CODE.

## 2.2) Suite Product Routing
Use the suite products according to task intent:

- `SDTK-SPEC`
  - feature discovery
  - requirements, BA, PRD, backlog, architecture, QA artifacts
  - handoff generation and release-gate traceability
- `SDTK-CODE`
  - build a feature
  - fix a bug
  - refactor implementation
  - run implementation verification
  - ship code changes
- `SDTK-OPS`
  - deploy or release
  - infrastructure and environment setup
  - CI/CD changes
  - monitoring, incident response, security-infra, backup, compliance

If the current project only has `SDTK-SPEC` runtime assets installed:
- keep `/dev` bounded to planning and `CODE_HANDOFF`
- do not overclaim that SDTK-CODE or SDTK-OPS runtime assets are already installed
- still describe the correct downstream suite path in guidance and handoffs

## 3) Shared State And Quality Gates
- `SHARED_PLANNING.md`: phase status, owners, artifacts, blockers, handoff notes.
- `QUALITY_CHECKLIST.md`: gate checklist by phase.
- No handoff to next phase while current gate is not PASS.
- QA cannot start until downstream implementation evidence exists, normally from SDTK-CODE.
- QA cannot approve until `OPS_HANDOFF` and downstream OPS evidence are present and aligned.

## 4) Minimum Traceability
- PM: `REQ-xx` requirements, scope, success metrics.
- BA: `BR-xx`, `UC-xx`, `AC-xx`, `NFR-xx`, and traceability matrix.
- ARCH: map UC/BR to API/DB/flows/screens.
- DEV: map backlog stories to implementation slices, refs, blockers, and test obligations.
- QA: map downstream implementation evidence and downstream OPS evidence back to UC/AC.

## 5) Feature Bootstrap
Run from project root:

```
sdtk-spec generate --feature-key YOUR_FEATURE --feature-name "Your Feature"
```

## 6) ARCH Deliverables (Extended)
In addition to `ARCH_DESIGN`, ARCH may generate:
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md`
- `docs/api/[FEATURE_KEY]_API_DESIGN_DETAIL.md`
- `docs/database/DATABASE_SPEC_[FEATURE_KEY].md`
- `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`

## 6.1) ARCH Orchestration Mapping
- Use `sdtk-api-doc` when API scope exists.
- Use `sdtk-api-design-spec` when API design detail is required from YAML + flow list.
- Use `sdtk-screen-design-spec` when UI flow-action specification is needed.
- Controlled by `sdtk-spec.config.json`:
  - `orchestration.apiDesignDetailMode = auto|on|off`
  - `auto`: generate when API scope and required sources are available.
  - `on`: always generate for API scope.
  - `off`: skip unless explicitly requested.

## 6.2) QA Orchestration Mapping
- Use `sdtk-test-case-spec` when detailed worksheet-style test-case artifacts are required.
- Use `sdtk-qa` for execution report and release decision.
- QA accepts downstream implementation evidence from SDTK-CODE as the default handoff bridge, plus `OPS_HANDOFF + OPS evidence` in the current formal suite flow.
- Controlled by `sdtk-spec.config.json`:
  - `orchestration.testCaseSpecMode = auto|on|off`
  - `auto`: generate when QA requires test-case artifacts.
  - `on`: always generate in QA phase.
  - `off`: skip unless explicitly requested.

## 6.3) Maintainer Assets
- Skill inventory: `toolkit/skills/skills.catalog.yaml`
- Handoff templates: `toolkit/templates/handoffs/`
- Example scenarios: `examples/`
- Readiness audit: `toolkit/scripts/check-runtime-readiness.ps1`
- SDTK-CODE handoff generator: `toolkit/scripts/generate-code-handoff.ps1`

## 7) Mandatory Rule References
Canonical source-of-truth for shared rule files now lives under `toolkit/templates/docs/**`.
Use those paths when editing or reviewing the source toolkit.

Shared canonical rule files:
- `toolkit/templates/docs/api/YAML_CREATION_RULES.md` -- API YAML docs
- `toolkit/templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md` -- API design detail + flow docs
- `toolkit/templates/docs/api/FLOWCHART_CREATION_RULES.md` -- API flow compatibility note
- `toolkit/templates/docs/api/API_DESIGN_CREATION_RULES.md` -- API design compatibility note
- `toolkit/templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md` -- Screen flow-action specs
- `toolkit/templates/docs/qa/TEST_CASE_CREATION_RULES.md` -- QA test-case specs

Retained skill-specific local references:
- `toolkit/skills/sdtk-screen-design-spec/references/numbering-rules.md` -- Flow-action numbering policy
- `toolkit/skills/sdtk-screen-design-spec/references/figma-mcp.md` -- Figma MCP integration
- `toolkit/skills/sdtk-screen-design-spec/references/excel-image-export.md` -- Excel image export

Runtime-installed mirrors may surface these rule files under skill-local runtime paths such as `.claude/skills/<skill>/references/` or `$CODEX_HOME/skills/<skill>/references/`. Do not treat those runtime copies as the maintainer source of truth.

Workflow governance docs:
- `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md` -- verification-before-completion gate
- `governance/ai/core/SDTK_SKILL_AUTHORING_AND_TESTING.md` -- maintainer authoring/test guide
Flow-action numbering policy:
- Use one global numbering mode for the whole document (no per-screen reset).
