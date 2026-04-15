# Changelog

All notable changes to this project are documented in this file.
## [0.4.1] - 2026-04-16
### Fixed
- Hardened the Atlas viewer against inline-script breakage when indexed markdown contains literal `</script>` content.
- Normalized embedded Atlas asset URLs so quoted remote image links no longer resolve as broken `%22https://...%22` requests.
- Added an inline Atlas viewer favicon to remove the remaining local viewer `favicon.ico` 404 noise after Atlas build/open flows.

## [0.4.0] - 2026-04-15
### Added
- Introduced the free SDTK Atlas workflow in `sdtk-spec-kit` with local graph build, browser viewer launch, rebuild watch mode, and status inspection commands.
- Added entitlement-gated Atlas Ask and project intelligence command surfaces to the public SDTK-SPEC CLI line for Pro-capable environments.
### Changed
- Bundled the Atlas runtime assets directly into the distributed `sdtk-spec-kit` payload so Atlas behavior no longer depends on maintainer-repo-only tooling.
- Refined the Atlas viewer shell, rendering behavior, and Mermaid-backed note rendering support as part of the shipped package line.
### Fixed
- Aligned packaged Atlas runtime behavior with current source truth so public releases can receive the current viewer/runtime fixes instead of the pre-Atlas baseline.

## [0.3.16] - 2026-04-09
### Added
- Shipped controller-enforced bounded execution envelopes for mailbox implementation runs so Codex and Claude dry-runs start from authoritative `Inputs:` instead of broad repo-wide discovery.
- Added public dry-run regression coverage for mailbox bounded execution prompt construction across both shipped launchers.
### Changed
- Synced mailbox task templates, mailbox-dispatch skills, and the automation contract/spec so controllers must provide authoritative input sets for bounded implementation runs.
- Hardened Codex partial-failure closeout so git warning noise cannot prevent a watchdog blocker report from being materialized.
### Fixed
- Reduced the specific discovery-driven mailbox stall pattern observed during BK-067 by pushing execution-discipline rules into the launcher prompt envelope instead of leaving them implicit in the task packet.

## [0.3.15] - 2026-04-08
### Changed
- Completed BK-070 specialist-skill professionalization and canonical/shared reference normalization for the first-generation SDTK-SPEC specialist skills.
- Claude runtime installs now materialize specialist rule files as skill-local `references/` directories instead of relying on the old shared `.claude/skills/references/` catch-all.
- Synced active docs, installer truth, and shipped sdtk-spec-kit payload so source, runtime behavior, and package contents now match the BK-070 contract.
### Fixed
- Removed obsolete duplicated canonical shared-rule files from targeted specialist skills while preserving the genuinely local screen-design helper references.
- Fixed packaged Claude runtime install parity so sdtk-spec runtime install --runtime claude matches current source behavior in both project and user scope.
## [0.3.14] - 2026-04-08
### Added
- Shipped automated runtime-facing backlog-ID leakage checks and mailbox formal-artifact phase validation into the public `sdtk-spec-kit` package.
### Changed
- Synced the packaged SPEC payload so the shipped mailbox wrappers, templates, skills, condensation guidance, and code-handoff guidance match the current source toolkit truth.
### Fixed
- Packaged mailbox runners now carry the formal-artifact validator script in the npm payload and resolve it from the packaged toolkit path instead of the maintainer repo path.
- Release metadata now uses normalized npm `bin` and `repository.url` fields without stale parity expectations.

## [0.3.13] - 2026-04-07
### Added
- Shipped the bounded `sdtk-mailbox-dispatch` / `mailbox-dispatch` controller skill for PM and Orchestrator with toolkit-local mailbox task/report templates and launcher wrappers.
### Changed
- Expanded the canonical SDTK-SPEC skill inventory from 13 to 14 core skills and synced install/runtime/docs truth to the shipped mailbox-dispatch surface.
- Rebuilt the packaged `sdtk-spec-kit` payload and manifest so npm installs now carry the mailbox skill plus the current canonical toolkit templates and guidance.
### Fixed
- Runtime/install expectations and packaged payload parity now reflect the shipped mailbox dispatch flow instead of the earlier internal pilot-only state.
## [0.3.12] - 2026-04-03
### Changed
- Added maintainer-root guards to public `init` and `update` flows for `sdtk-spec`, `sdtk-code`, and `sdtk-ops` so managed project files cannot overwrite the SDTK maintainer monorepo root.
- Added the same maintainer-root guard to canonical raw `toolkit/install.ps1` scripts for `SDTK-SPEC`, `SDTK-CODE`, and `SDTK-OPS`.
- Synced packaged toolkit payloads so published npm installs carry the same maintainer-root protection as the source repo.
### Fixed
- `sdtk-spec update`, `sdtk-code update`, `sdtk-ops update`, and raw source-repo installer flows now fail safely on the maintainer monorepo root instead of overwriting `AGENTS.md`, `CODEX.md`, `CLAUDE.md`, and SDTK config files.

## [0.3.9] - 2026-03-20
### Added
- Regression prompt for Claude Code verification of the generated-doc fixes
- Explicit wireframe-marker mapping contract between generated-draft screen images and global FLOW_ACTION_SPEC action-table numbering
### Changed
- Claude runtime installer now ships the full project-local skill assets needed by ARCH doc-generation flows
- Generated-draft flow-action guidance now requires file-relative image links, new-style PlantUML activity syntax, and local-wireframe/global-table mapping discipline
- DESIGN_LAYOUT guidance now treats wireframe markers as screen-local visual references and prefers circled-number markers in generated docs
### Fixed
- API design detail generation now matches server-prefixed flow headers and normalized path parameters
- FLOW_ACTION_SPEC validation now catches broken docs-root image paths, mixed PlantUML activity syntax, and missing wireframe mapping tables
- DESIGN_LAYOUT screen rendering now warns on missing or legacy markers and renders Unicode markers through PlantUML with explicit UTF-8 settings

## [0.3.8] - 2026-03-19
### Added
- Canonical SDTK core hardening inventory with `toolkit/skills/skills.catalog.yaml`
- `## Critical Constraints` sections across all 13 core SDTK skills
- Standard handoff templates for PM/BA/ARCH/DEV/QA under `toolkit/templates/handoffs/`
- `## Assumptions` sections in flow-action and API design detail templates
- Public example scenario packs under `examples/`
- Maintainer runtime readiness audit via `toolkit/scripts/check-runtime-readiness.ps1`
- Initial `SDTK-CODE` v1 scaffold and 12-skill coding workflow toolkit under `products/sdtk-code/`
### Changed
- QA workflow and reusable test-case design now require exact requirement quoting against evidence
- User-facing docs and landing/docs copy are synced with the current SDTK feature set
### Fixed
- `build-toolkit-manifest.ps1` now enumerates the full payload reliably during manifest rebuilds

## [0.3.7] - 2026-03-17
### Added
- Skill-triggering behavioral tests for PM/BA/ARCH/DEV/QA routing
- SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md - canonical evidence-before-claims gate
- Subagent prompt templates for DEV execution and review (implementer, spec-reviewer, code-quality-reviewer)
- SDTK_SKILL_AUTHORING_AND_TESTING.md - maintainer guide for skill authoring
- Hard gates for order-critical violations (sdtk-arch, sdtk-dev, sdtk-qa)
- Model selection guidance in sdtk-dev
- DOT flowcharts in sdtk-orchestrator, sdtk-arch, internal/benchmark-optimizer
- Anti-pattern tables in core workflow skills
- Codex parity for verification-before-completion policy
### Fixed
- build-toolkit-manifest.ps1 fileCount bug (was hardcoded 6, now reflects actual file count)

## [0.1.0] - 2026-02-20
### Added
- Initial repository governance structure (`governance/`, `product/`, `toolkit/`).
- Commercial release readiness audit artifact.
- Legal and release-governance baseline files.
