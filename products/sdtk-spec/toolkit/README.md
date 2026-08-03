# SDTK-SPEC toolkit

This folder is the product-specific `SDTK-SPEC` source-of-truth surface within the broader `SDTK Suite` family (`SDTK-SPEC`, `SDTK-CODE`, `SDTK-OPS`).
Use the root `README.md` for suite-level framing and `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md` for the downstream coding product.

## Quick Start
1. Copy the `toolkit/` folder into your project root.
2. Run the installer for your target runtime:
   - Codex:
     - `powershell -ExecutionPolicy Bypass -File ".\toolkit\install.ps1" -Runtime codex`
   - Claude Code:
     - `powershell -ExecutionPolicy Bypass -File ".\toolkit\install.ps1" -Runtime claude`
3. Read the full guide:
   - `toolkit/SDTK_TOOLKIT.md`

## Product Summary
SDTK-SPEC standardizes feature delivery with a multi-agent SDLC model.
The current shipped technical interface remains `sdtk-spec-kit` / `sdtk-spec`.
It supports runtime adapters (Codex and Claude Code) while keeping one shared core for templates, skills, and quality gates.
`SDTK-OPS` is a real suite product surface, but the runnable product guidance for SDTK-OPS lives in its own product docs rather than this SDTK-SPEC source folder.

## Highlights
- 6-phase SDLC flow: PM -> BA -> ARCH -> DEV planning/handoff -> QA release decision.
- Default implementation bridge: `/dev` emits `CODE_HANDOFF`, SDTK-CODE performs coding, `/qa` validates downstream evidence.
- Deterministic artifact generation in `docs/**`.
- Rule-based consistency for API specs, flow-action specs, and QA test cases.
- Hybrid orchestration modes for API design detail and test-case generation.
- Canonical skill inventory in `toolkit/skills/skills.catalog.yaml` for all 14 core toolkit skills, including controller-owned mailbox dispatch.
- Reusable handoff templates under `toolkit/templates/handoffs/` to reduce ambiguity between PM, BA, ARCH, DEV, SDTK-CODE, and QA.
- `## Critical Constraints` encoded in every core `SKILL.md` so non-negotiable workflow rules are visible before execution.
- Public onboarding examples under `examples/` for common delivery scenarios.
- Runtime readiness audit via `toolkit/scripts/check-runtime-readiness.ps1`.
- Repo source now contains two bounded proof families (`service/request tracker`, `approval/workflow`) expressed as golden samples plus executable acceptance fixtures.

## Quality Contracts
DEV phase now ends at planning + readiness gating. The canonical outputs are `FEATURE_IMPL_PLAN` and `CODE_HANDOFF`. See `toolkit/skills/sdtk-dev/SKILL.md` for the exact handoff contract.

All phases follow `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md` -- no done/pass/release-ready claim without fresh command evidence.

QA validation and reusable test-case design must quote exact specification text when judging requirement match or mismatch.

`sdtk-dev` still keeps subagent prompt templates for delegated task execution (`implementer`, `spec-reviewer`, `code-quality-reviewer` under `toolkit/skills/sdtk-dev/prompts/`), but they are legacy/manual helper assets rather than the default `/dev` process.

## Maintainer Aids
- Skill catalog: `toolkit/skills/skills.catalog.yaml`
- Skill authoring guide: `governance/ai/core/SDTK_SKILL_AUTHORING_AND_TESTING.md`
- Handoff templates: `toolkit/templates/handoffs/`
- Skill scaffold: `toolkit/scripts/create-skill.ps1`
- Readiness audit: `toolkit/scripts/check-runtime-readiness.ps1`
- SDTK-CODE handoff generator: `toolkit/scripts/generate-code-handoff.ps1`
- Example scenarios: `examples/`
