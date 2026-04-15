# SDTK-SPEC Multi-Agent Software Development Toolkit

This guide explains how to run SDTK-SPEC as a runtime-agnostic toolkit with adapters for Codex and Claude Code.
It is product-specific to `SDTK-SPEC` within the broader `SDTK Suite` family (`SDTK-SPEC`, `SDTK-CODE`, `SDTK-OPS`).
Use the root `README.md` for suite-level framing and `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md` for the downstream coding product.

Canonical install/runtime source of truth:
- `governance/ai/cli/SDTK_RUNTIME_AND_FEATURE_STATUS.md`

## 1. What SDTK-SPEC Is
SDTK-SPEC is a practical delivery framework for software teams.
It provides:
- a fixed SDLC workflow,
- reusable documentation templates,
- specialized skills for each phase,
- and explicit quality gates.

This guide stays product-specific to SDTK-SPEC. `SDTK-OPS` is a real suite product surface, but its runnable product guidance lives in its own SDTK-OPS docs rather than this SDTK-SPEC guide.

## 1.1 Current Source-Proof Status
The current repo source is ahead of the latest public `sdtk-spec-kit` package line. In addition to the shipped mailbox-dispatch skill, the source tree now contains two bounded proof families:
- `service/request tracker` golden samples + executable fixture and acceptance harness
- `approval/workflow` golden samples + executable fixture and acceptance harness
These proof surfaces strengthen the lean small-app factory claim in source control. Treat public package claims separately until the next SPEC release is published.

## 2. SDLC Model
Default flow:
1. PM initiation
2. BA analysis
3. PM planning
4. Architecture design
5. Development planning + SDTK-CODE handoff
6. QA validation and release decision

SDTK-SPEC and SDTK-CODE stay separate:
- SDTK-SPEC owns upstream docs, planning, and handoff generation
- SDTK-CODE owns downstream coding workflow (`start -> plan -> build -> verify -> ship`)
- QA remains in SDTK-SPEC and normally consumes downstream evidence from SDTK-CODE

## 2.1 Atlas And Project Intelligence Surfaces
In the current source line, SDTK-SPEC also exposes two adjacent capability groups:

- Free Atlas document graph:
  - `sdtk-spec atlas init|build|open|watch|status`
  - local markdown graph only
  - no auth or entitlement required
- Premium Atlas/project intelligence:
  - `sdtk-spec atlas ask`
  - `sdtk-spec project ingest|audit|refresh`
  - requires auth + entitlement sync + premium pack availability
  - writes staged artifacts under `<project>/.sdtk/project/`
  - does not mutate live `/docs/`

## 3. Runtime-Adaptive Installation
From project root:

### 3.1 Codex runtime
`powershell -ExecutionPolicy Bypass -File ".\toolkit\install.ps1" -Runtime codex`

### 3.2 Claude Code runtime
`powershell -ExecutionPolicy Bypass -File ".\toolkit\install.ps1" -Runtime claude`

### 3.3 Common installer options
- `-Force`: overwrite existing adapter/config files in project root.
- `-RuntimeScope`: `project` or `user` -- controls where skill files are installed (default: `project` for Claude, `user` for Codex).
- `-SkipRuntimeAssets`: skip skill file installation for the selected runtime.
- `-SkipSkills`: **(deprecated)** use `-SkipRuntimeAssets` instead.

## 4. What Installer Copies
Always:
- `toolkit/AGENTS.md` -> `AGENTS.md`
- `toolkit/sdtk-spec.config.json` -> `sdtk-spec.config.json`
- `toolkit/sdtk-spec.config.profiles.example.json` -> `sdtk-spec.config.profiles.example.json`

By runtime:
- `codex` -> `toolkit/runtimes/codex/CODEX_TEMPLATE.md` -> `CODEX.md`
- `claude` -> `toolkit/runtimes/claude/CLAUDE_TEMPLATE.md` -> `CLAUDE.md`

Runtime behavior (scope-aware installation):
- `codex`: installs skills into `$CODEX_HOME/skills/` or `~/.codex/skills/` by default, and into `<project>/.codex/skills/` only through the explicit local `CODEX_HOME=<project>/.codex` contract. Native `.codex/skills` auto-discovery is not claimed.
- `claude`: installs skills into `.claude/skills/` in the project root (project scope, default) or `~/.claude/skills/` (user scope).

## 5. Feature Bootstrap
After install:

`powershell -ExecutionPolicy Bypass -File ".\toolkit\scripts\init-feature.ps1" -FeatureKey WORKFLOW_ENGINE -FeatureName "Workflow Engine"`

Use `-ProjectPath` when toolkit is not directly under project root.
Use `-ValidateOnly` to verify inputs/templates without writing files.

## 6. Role Tags
Use the same role tags across runtimes:
- `/pm`
- `/ba`
- `/arch`
- `/dev`
- `/qa`
- `/engineer` (technical escalation)

Default role is `/pm` when role is not specified.

## 7. Orchestration Mapping
Architecture phase:
- API contract/flow scope -> `sdtk-api-doc`
- API design detail from YAML + flow list -> `sdtk-api-design-spec`
- UI flow-action scope -> `sdtk-screen-design-spec`

DEV phase:
- `/dev` creates `FEATURE_IMPL_PLAN` + `CODE_HANDOFF`
- `toolkit/scripts/generate-code-handoff.ps1` generates the canonical machine-readable handoff JSON
- legacy prompt templates under `toolkit/skills/sdtk-dev/prompts/` remain available as manual helper assets only

QA phase:
- detailed reusable test-case artifact -> `sdtk-test-case-spec`
- execution report and release decision -> `sdtk-qa`
- normal prerequisite is downstream implementation evidence, normally from SDTK-CODE

## 8. Hybrid Controls (`sdtk-spec.config.json`)
- `orchestration.apiDesignDetailMode = auto|on|off`
- `orchestration.testCaseSpecMode = auto|on|off`

## 8.1 Skill Catalog and Handoff Assets
- `toolkit/skills/skills.catalog.yaml` is the canonical inventory for the 14 core SDTK-SPEC skills, including the bounded `mailbox-dispatch` controller skill.
- `toolkit/templates/handoffs/` provides the standard PM/BA/ARCH/DEV/QA handoff prompts and review gates.
- Every core `SKILL.md` includes `## Critical Constraints` derived from the active hard gates and verification policy.
- Use `governance/ai/core/SDTK_SKILL_AUTHORING_AND_TESTING.md` when creating or updating skills.

## 9. Workflow Quality Contracts

### Verification Before Completion
All phases apply `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md`. No workflow step may report done, pass, or release-ready without fresh command evidence. Red flags include `should pass`, `probably works`, and trusting agent reports without verification.

### Order-Critical Hard Gates
Three hard gates enforce mandatory sequencing:
- ARCH: `DESIGN_LAYOUT` must be generated before `FLOW_ACTION_SPEC` for UI-scope features
- DEV: `FEATURE_IMPL_PLAN` must be approved before `READY_FOR_SDTK_CODE` can be emitted
- QA: downstream implementation evidence must exist before QA handoff starts

### `/dev` Ownership
The default `/dev` role does not implement code in this wave.
It:
1. refines `FEATURE_IMPL_PLAN`
2. determines readiness
3. emits `CODE_HANDOFF`
4. suggests the exact `sdtk-code start ...` command when ready

### Specification Quoting
QA validation and reusable test-case design must quote exact requirement text when judging a match or mismatch.
Use:
- `Spec says: "[exact quote]" -> Evidence: [match/mismatch + file reference]`

### Assumptions Discipline
`FLOW_ACTION_SPEC_TEMPLATE.md` and `API_DESIGN_DETAIL_TEMPLATE.md` require a top-level `## Assumptions` section so inferred or deferred decisions stay explicit during ARCH output review.

### Subagent Model Selection
When dispatching manual helper tasks via `sdtk-dev`, use:
- Fast or cheap model for mechanical single-file changes
- Standard model for multi-file integration tasks
- Most capable model for architecture and design decisions

## 10. Artifact Structure
Shared state:
- `SHARED_PLANNING.md`
- `QUALITY_CHECKLIST.md`

Phase outputs:
- `docs/product/`
- `docs/specs/`
- `docs/architecture/`
- `docs/api/`
- `docs/design/`
- `docs/dev/`
- `docs/qa/`
- `docs/database/`

## 11. Rule Sources
- API YAML rules:
  - `toolkit/templates/docs/api/YAML_CREATION_RULES.md`
- API design detail + flowchart rules:
  - `toolkit/templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md`
- Compatibility notes kept for legacy references:
  - `toolkit/templates/docs/api/FLOWCHART_CREATION_RULES.md`
  - `toolkit/templates/docs/api/API_DESIGN_CREATION_RULES.md`
- Screen flow-action rules:
  - `toolkit/templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md`
- QA test-case rules:
  - `toolkit/templates/docs/qa/TEST_CASE_CREATION_RULES.md`
- Skill-specific local references intentionally retained:
  - `toolkit/skills/sdtk-screen-design-spec/references/numbering-rules.md`
  - `toolkit/skills/sdtk-screen-design-spec/references/figma-mcp.md`
  - `toolkit/skills/sdtk-screen-design-spec/references/excel-image-export.md`

## 12. Examples
Use `examples/` for onboarding-ready scenario packs:
- `enterprise-crud-ui-api-db`
- `api-only-service`
- `admin-console-flow-action`
- `bugfix-hotfix-flow`

## 13. Runtime Readiness Audit
Run the audit script before maintainer testing or runtime troubleshooting:

`powershell -ExecutionPolicy Bypass -File ".\toolkit\scripts\check-runtime-readiness.ps1" -Runtime <claude|codex>`

Use `-Json` for machine-readable output.

## 14. Output Language
- Feature artifacts under `docs/**`: default English.
- Toolkit guidance docs: English or Vietnamese.
