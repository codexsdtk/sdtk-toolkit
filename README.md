# SDTK Suite

<p align="center">
  <a href="https://www.npmjs.com/package/sdtk-spec-kit"><img src="https://img.shields.io/npm/v/sdtk-spec-kit?style=for-the-badge&logo=npm&label=npm" alt="npm version"></a>
  <a href="https://github.com/codexsdtk/sdtk-toolkit/releases"><img src="https://img.shields.io/github/v/release/codexsdtk/sdtk-toolkit?style=for-the-badge" alt="GitHub release"></a>
  <a href="https://github.com/codexsdtk/sdtk-toolkit/actions/workflows/quality-gates.yml"><img src="https://img.shields.io/github/actions/workflow/status/codexsdtk/sdtk-toolkit/quality-gates.yml?branch=main&style=for-the-badge&label=quality%20gates" alt="quality gates"></a>
  <a href="https://github.com/codexsdtk/sdtk-toolkit/blob/main/LICENSE"><img src="https://img.shields.io/github/license/codexsdtk/sdtk-toolkit?style=for-the-badge" alt="license"></a>
</p>

`SDTK Suite` is the family entrypoint for the normalized software-delivery toolkit line in this engineering repo.

Current family framing:
- `SDTK-SPEC` -> upstream docs-first specification and handoff system
- `SDTK-CODE` -> downstream coding workflow product
- `SDTK-OPS` -> downstream operations product with a public npm package, a narrow truthful CLI baseline, and validated local Docker deploy proof

Current product reality:
- `SDTK-SPEC` is the current shipped technical interface via the `sdtk-spec-kit` npm package and the `sdtk-spec` CLI command
- `SDTK-CODE` exists as a real product surface in this repo and owns the post-handoff coding workflow
- `SDTK-OPS` exists as a real public product surface in this repo with the `sdtk-ops-kit` npm package, a skill-driven operations model, and a truthful CLI baseline for `help`, `init`, `update`, and `runtime install|status|uninstall`

## Suite Overview

The suite is organized as:
- `SDTK-SPEC` for upstream discovery, analysis, architecture, and handoff generation
- `SDTK-CODE` for downstream coding workflow execution after handoff
- `SDTK-OPS` for downstream ops/go-live discipline via its public package and product surface under `products/sdtk-ops/`

The intended family flow is:
- `SPEC -> CODE -> OPS`

## Current Source-Repo Proof Status

Current repo truth after the two lean product-value waves:
- bounded proof family #1: `service/request tracker`
- bounded proof family #2: `approval/workflow`
- each family now has:
  - a human-readable `SPEC -> CODE -> OPS` golden-sample bundle
  - an executable fixture and deterministic acceptance harness
- current scorecards:
  - Goal 1 (`basic design input -> bounded A-to-Z small app`): `89 / 100`
  - Goal 2 (`human-in-the-loop across SPEC -> CODE -> OPS`): `92 / 100`

Important distinction:
- latest published public SPEC package is `sdtk-spec-kit@0.4.3` as of 2026-04-16
- repo/source proof can move ahead of the latest public package line

## Check Latest Published Versions

Use the npm registry as the source of truth when you need the latest published package number:

```bash
npm view sdtk-spec-kit version
npm view sdtk-code-kit version
npm view sdtk-ops-kit version
```

## Full Suite Install

If you want all three public toolkit CLIs on one machine, install them together in one npm command:

```bash
npm install -g sdtk-spec-kit sdtk-code-kit sdtk-ops-kit
```

Then verify each CLI separately:

```bash
sdtk-spec --version
sdtk-code --version
sdtk-ops --version
```

Canonical suite-wide install and usage guide:
- `governance/ai/cli/SDTK_SUITE_INSTALL_AND_USAGE_GUIDE.md`

## Full Suite Update

When the public packages are already installed, use the per-package `update` commands to inspect or refresh the installed line:

```bash
sdtk-spec update --check-only
sdtk-code update --check-only
sdtk-ops update --check-only
```

Apply only the package refresh you actually need:

```bash
sdtk-spec update --runtime claude --project-path ./my-project
sdtk-code update --runtime claude --project-path ./my-project
sdtk-ops update --runtime claude --project-path ./my-project
```

Important truth:
- there is still no umbrella suite-wide update command
- each package still uses `npm install -g <package>@<target>` as the package refresh mechanism
- `update --check-only` is non-destructive and prints the planned commands only

## Full Suite Uninstall And Cleanup

If you want to remove all three public CLI packages from one machine, uninstall them together:

```bash
npm uninstall -g sdtk-spec-kit sdtk-code-kit sdtk-ops-kit
```

That removes the npm packages only. It does **not** remove runtime assets already copied into `.claude/skills/`, `~/.claude/skills/`, `$CODEX_HOME/skills/`, or `~/.codex/skills/`.

To remove runtime assets as well, run each toolkit's `runtime uninstall` command for the runtime and scope you previously used:

```bash
sdtk-spec runtime uninstall --runtime claude --scope project
sdtk-code runtime uninstall --runtime claude --scope project --project-path .
sdtk-ops runtime uninstall --runtime claude --scope project --project-path .
```

Those commands remove only the SDTK-managed skill folders for the selected toolkit, runtime, and scope. They do not delete the parent runtime roots, because those directories may contain non-SDTK user assets.

## Current Live Product: SDTK-SPEC

`SDTK-SPEC` is the currently shipped docs-first toolkit for generating consistent software design artifacts across a 6-phase delivery workflow.

## Migration From `sdtk-kit` / `sdtk`

If you previously used the older interface, uninstall the old package and switch to the canonical command:

```bash
npm uninstall -g sdtk-kit
npm install -g sdtk-spec-kit
```

After migrating, replace `sdtk ...` commands with `sdtk-spec ...`.

It gives AI agents and engineering teams a deterministic structure for:
- PM initiation
- BA analysis
- PM planning
- architecture design
- development handoff
- QA release validation

The toolkit ships as an npm CLI package (`sdtk-spec-kit`) and supports both:
- `Claude Code`
- `Codex`

## Why SDTK-SPEC

Most teams can prompt an agent to write a document. Far fewer teams can keep the whole artifact chain consistent.

SDTK-SPEC is built to solve that gap:
- deterministic output structure in `docs/**`
- consistent naming and traceability across PM, BA, ARCH, DEV, and QA artifacts
- runtime-aware installation for Claude and Codex, with an explicit scope matrix
- reusable templates, skills, and quality gates instead of ad hoc prompt loops
- verification-before-completion discipline -- all phase completions require fresh command evidence before handoff
- two-stage DEV review -- artifact/spec compliance gate runs before code quality review; QA handoff is blocked until both pass
- canonical skill inventory in `products/sdtk-spec/toolkit/skills/skills.catalog.yaml` for the 14 core SDTK-SPEC skills, including controller-owned mailbox dispatch
- reusable handoff templates under `products/sdtk-spec/toolkit/templates/handoffs/` to standardize PM, BA, ARCH, DEV, and QA transitions
- public example scenario packs under `examples/` for onboarding and regression review
- runtime readiness auditing through `products/sdtk-spec/toolkit/scripts/check-runtime-readiness.ps1` for Claude and Codex maintainer flows
- repo-native markdown and yaml outputs that fit normal Git and PR review workflows

## What You Get

For each feature, SDTK-SPEC scaffolds and supports a full artifact set including:
- `PROJECT_INITIATION`
- `BA_SPEC`
- `PRD`
- `BACKLOG`
- `ARCH_DESIGN`
- `DATABASE_SPEC`
- OpenAPI YAML
- API endpoints spec
- API design detail
- API flow list
- `DESIGN_LAYOUT`
- `FLOW_ACTION_SPEC`
- implementation plan
- test case spec
- QA release report

The current CLI generates a 17-file feature scaffold and installs the runtime guidance files needed by the target agent environment. Content enrichment still runs phase-by-phase through PM, BA, ARCH, DEV, and QA rather than as a one-shot full-pipeline command.

The current source line also includes:
- a free local Atlas document-graph workflow via `sdtk-spec atlas init|build|open|watch|status`

Important truth:
- free Atlas does not require auth or entitlement
- premium project commands write staged artifacts under `<project>/.sdtk/project/` and do not mutate live `/docs/`

## Installation

### npm CLI

```bash
npm install -g sdtk-spec-kit
```

### Verify

```bash
sdtk-spec --version
```

## Quick Start

### 1. Initialize a project

Claude Code:

```bash
sdtk-spec init --runtime claude
```

Codex:

```bash
sdtk-spec init --runtime codex
```

What this creates in the target project:
- `AGENTS.md`
- `CLAUDE.md` or `CODEX.md`
- `sdtk-spec.config.json`
- `sdtk-spec.config.profiles.example.json`

### 2. Optional Atlas and premium follow-on commands

```bash
# Free local document graph
sdtk-spec atlas init --project-path .

# Premium follow-on workflow
```

Runtime assets:
- `claude`
  - default scope: project
  - installs into `.claude/skills/`
  - user scope available via `--runtime-scope user`
- `codex`
  - default scope: user
  - user-scope installs into `$CODEX_HOME/skills` or `~/.codex/skills`
  - project-local installs target `<project>/.codex/skills` only through the explicit local `CODEX_HOME=<project>/.codex` contract
  - native `.codex/skills` auto-discovery is not claimed

### 2. Generate a feature scaffold

```bash
sdtk-spec generate --feature-key USER_PROFILE --feature-name "User Profile"
```

### 3. Enrich the generated artifacts

Use the installed runtime with the SDTK-SPEC skills and templates to fill each phase:
- PM
- BA
- ARCH
- DEV
- QA

## Runtime Commands

### `sdtk-spec init`

```bash
sdtk-spec init --runtime <codex|claude> [--project-path <path>] [--force] [--runtime-scope <project|user>] [--skip-runtime-assets]
```

### `sdtk-spec generate`

```bash
sdtk-spec generate --feature-key <UPPER_SNAKE_CASE> --feature-name "<text>" [--project-path <path>] [--force] [--validate-only]
```

### `sdtk-spec runtime`

```bash
sdtk-spec runtime install --runtime <codex|claude> [--scope <project|user>]
sdtk-spec runtime uninstall --runtime <codex|claude> [--scope <project|user>]
sdtk-spec runtime status --runtime <codex|claude>
```

### `sdtk-spec update`

```bash
sdtk-spec update [--version <latest|x.y.z>] [--runtime <codex|claude>] [--scope <project|user>] [--project-path <path>] [--check-only] [--skip-project-files] [--skip-runtime-assets] [--verbose]
```

### Help

```bash
sdtk-spec --help
```

## Example Output

```text
your-project/
  AGENTS.md
  CLAUDE.md or CODEX.md
  sdtk-spec.config.json
  sdtk-spec.config.profiles.example.json
  SHARED_PLANNING.md
  QUALITY_CHECKLIST.md
  docs/
    product/
    specs/
    architecture/
    database/
    api/
    design/
    dev/
    qa/
```

## Documentation

Start here:
- root `README.md` for suite-level framing
- `products/sdtk-spec/toolkit/README.md`
- `products/sdtk-spec/toolkit/SDTK_TOOLKIT.md`
- `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md`
- `products/sdtk-spec/toolkit/skills/skills.catalog.yaml`
- `products/sdtk-spec/toolkit/templates/handoffs/`
- `examples/`
- `governance/ai/cli/SDTK_RUNTIME_AND_FEATURE_STATUS.md`
- `governance/ai/cli/SDTK_TOOLKIT_USAGE_GUIDE.md`
- `governance/ai/cli/SDTK_SUITE_INSTALL_AND_USAGE_GUIDE.md`
- `governance/ai/core/SDTK_VERIFICATION_BEFORE_COMPLETION_POLICY.md`
- `governance/ai/core/SDTK_SKILL_AUTHORING_AND_TESTING.md`

Repository operating context:
- `AGENTS.md`
- `governance/ai/core/PROJECT_CONTEXT.md`
- `governance/ai/core/REPO_STRUCTURE.md`

Current suite boundary:
- `products/sdtk-spec/toolkit/**` remains the `SDTK-SPEC` source-of-truth surface
- `products/sdtk-spec/distribution/sdtk-spec-kit/**` remains the active `SDTK-SPEC` package source surface
- `products/sdtk-code/**` remains the `SDTK-CODE` product surface
- `products/sdtk-ops/**` is the `SDTK-OPS` product surface
- `SDTK-OPS` now ships publicly as `sdtk-ops-kit`, keeps a narrow truthful CLI baseline, and does not treat `generate` as a supported command

## Repository Layout

- `products/sdtk-spec/toolkit/`
  - canonical SDTK-SPEC toolkit source: skills, templates, install scripts
- `products/sdtk-spec/distribution/sdtk-spec-kit/`
  - SDTK-SPEC CLI/package source and packaged payload build workspace
- `distribution/`
  - shared distribution surfaces outside the active SDTK-SPEC package source (landing/docs/ops assets and historical package artifacts)
- `governance/`
  - AI governance, runbooks, release controls, review records
- `tests/`
  - quality and regression coverage
- `docs/`
  - canonical generated feature and benchmark artifacts

## Development

From the repository root:

```bash
python scripts/ci/docs_lint.py
python scripts/ci/path_check.py
python scripts/ci/template_token_check.py
powershell -ExecutionPolicy Bypass -File scripts/ci/run-quality-gates.ps1
```

CLI payload and package smoke:

```bash
cd products/sdtk-spec/distribution/sdtk-spec-kit
npm pack --dry-run
```

## Release Notes

Current published package:
- `sdtk-spec-kit`
- latest version lookup: `npm view sdtk-spec-kit version`

Recent shipped improvements include:
- v0.4.3 ships the Orchestrator-first runtime guidance validation lane, packaged discovery requirement template, and SPEC-kit parity checks for generated Claude/Codex runtime outputs
- v0.3.9 hardens Claude-driven ARCH doc generation, including bundled skill assets, API-flow matching, file-relative screen-image references, new-style screen-flow PlantUML, and wireframe-marker mapping
- v0.3.8 adds core hardening assets, runtime readiness audit, example packs, and the initial SDTK-CODE toolkit product
- core hardening additions: skill catalog, critical constraints in every core skill, handoff templates, exact-spec quoting in QA/test-case workflows, public example packs, and runtime readiness auditing
- runtime-scope-aware install behavior: Claude supports project/user scope, Codex defaults to user scope and supports a bounded explicit-local project path through `CODEX_HOME=<project>/.codex`
- public per-package update commands now ship for `sdtk-spec`, `sdtk-code`, and `sdtk-ops`; there is still no umbrella suite-wide update command
- flow-action contract cleanup
- generated-layout fallback for flow-action specs
- screen-preview rendering support from `DESIGN_LAYOUT`

## License

MIT. See `LICENSE`.
