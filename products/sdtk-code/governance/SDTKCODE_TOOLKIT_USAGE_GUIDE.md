# SDTK-CODE Toolkit Usage Guide

Last Updated: 2026-04-03
Owner: SDTK Core Team

**Purpose:** Step-by-step guide for installing and using `SDTK-CODE` as a workflow-first coding toolkit after upstream `SDTK-SPEC` handoff artifacts already exist.

**Current shipped technical interface:** `sdtk-code-kit` package + `sdtk-code` CLI

**Product boundary:** `SDTK-CODE` is downstream from `SDTK-SPEC`. It does not replace upstream planning, architecture, or handoff generation.

---

## Table of Contents

1. [Purpose And Boundary](#1-purpose-and-boundary)
2. [Prerequisites](#2-prerequisites)
3. [Installation](#3-installation)
4. [Runtime Setup](#4-runtime-setup)
5. [Required Upstream Inputs](#5-required-upstream-inputs)
6. [Quick Start](#6-quick-start)
7. [Workflow-First Usage](#7-workflow-first-usage)
8. [Runtime Helper Commands](#8-runtime-helper-commands)
9. [Expert Mode](#9-expert-mode)
10. [Troubleshooting And Verification](#10-troubleshooting-and-verification)
11. [Quick Reference](#11-quick-reference)

---

## 1. Purpose And Boundary

`SDTK-CODE` is the coding-process product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

Use it to:
- start a coding workflow from upstream handoff inputs
- refine slices before implementation
- record build progress
- capture summarized verification evidence
- record the final ship or finish decision
- inspect lifecycle state with status/doctor before recovery
- resume safely when the next step is machine-determinable

Do not use it to replace:
- upstream `SDTK-SPEC` planning
- upstream handoff generation
- BA, ARCH, or QA artifact generation

Current public workflow surface:
- `sdtk-code start`
- `sdtk-code plan`
- `sdtk-code build`
- `sdtk-code verify`
- `sdtk-code ship`
- `sdtk-code status`
- `sdtk-code doctor`
- `sdtk-code resume`

Support commands:
- `sdtk-code init`
- `sdtk-code update`
- `sdtk-code runtime install`
- `sdtk-code runtime status`
- `sdtk-code runtime uninstall`
- `sdtk-code help`
- `sdtk-code --version`

Not part of the v1 public surface:
- `sdtk-code generate`

## 2. Prerequisites

Before you use `SDTK-CODE`, make sure you have:
- Node.js 18.13+
- PowerShell 5.1+ on Windows, or `pwsh` 7+ where applicable
- a project directory where upstream `SDTK-SPEC` artifacts already exist or will be prepared before `start`
- either Claude or Codex as your target runtime

What must already be true upstream:
- `SDTK-SPEC` has already produced the coding handoff inputs
- the working project contains `sdtk-spec.config.json`
- the project contains either the preferred formal handoff or the bounded fallback inputs

## 3. Installation

Install the public package:

```powershell
npm install -g sdtk-code-kit
```

Verify the install:

```powershell
sdtk-code --version
sdtk-code --help
```

If you need the latest published version number, run:

```powershell
npm view sdtk-code-kit version
```

What install does:
- makes the `sdtk-code` command available
- ships runtime assets for `init` and `runtime`
- ships `CODE_WORKFLOW_TEMPLATE.md` for workflow-first execution

What install does not do:
- it does not generate upstream `SDTK-SPEC` artifacts for you
- it does not make `SDTK-CODE` independent from upstream `SDTK-SPEC`
- it does not add a `generate` surface to the public `SDTK-CODE` CLI

### 3.1 Update an Existing Installation

Use the public `update` command when `sdtk-code-kit` is already installed and you want the latest published package line plus refreshed runtime or project assets.

#### Step 1: Inspect the plan without making changes

```powershell
sdtk-code update --check-only
sdtk-code update --check-only --runtime claude --project-path ./my-project
```

#### Step 2: Apply the refresh

Claude example:

```powershell
sdtk-code update --runtime claude --project-path ./my-project
```

Codex user-scope example:

```powershell
sdtk-code update --runtime codex --scope user --project-path ./my-project
```

Project-local Codex refresh is also supported, but only when you intentionally launch the runtime with the explicit local `CODEX_HOME=<project>/.codex` contract. Native `.codex/skills` auto-discovery is still not claimed.

#### Step 3: Understand what `update` actually does

`sdtk-code update` performs these steps in order:

1. refreshes the npm package with `npm install -g sdtk-code-kit@<target>`
2. if `--runtime` is provided and `--skip-project-files` is not set, reruns `sdtk-code init --force`
3. if `--runtime` is provided and `--skip-runtime-assets` is not set, reruns `sdtk-code runtime install --force`

#### Step 4: Verify the refreshed install

```powershell
sdtk-code --version
sdtk-code --help
sdtk-code runtime status --runtime claude --project-path ./my-project
```

Important truth:
- `update --check-only` is non-destructive and prints the planned npm/init/runtime steps only
- `init --force` refreshes managed project files such as `AGENTS.md` and `sdtk-spec.config.json`
- `runtime install --force` refreshes managed skill folders for the chosen runtime and scope
- updating `sdtk-code-kit` does **not** rewrite your existing `docs/dev/CODE_WORKFLOW_*` or upstream `SDTK-SPEC` artifacts automatically
- `--skip-project-files` suppresses `init --force`
- `--skip-runtime-assets` suppresses runtime asset refresh

## 4. Runtime Setup

### 4.1 Shared init behavior

`sdtk-code init` writes shared project files:
- `AGENTS.md`
- `sdtk-spec.config.json`
- `sdtk-spec.config.profiles.example.json`

It also installs runtime assets unless you pass:
- `--skip-runtime-assets`

Deprecated alias:
- `--skip-skills`

### 4.2 Claude

Claude supports:
- project scope
- user scope

Typical project-scope setup:

```powershell
sdtk-code init --runtime claude --project-path ./my-project
sdtk-code runtime status --runtime claude --project-path ./my-project
```

Typical user-scope setup:

```powershell
sdtk-code init --runtime claude --runtime-scope user --project-path ./my-project
sdtk-code runtime install --runtime claude --scope user
sdtk-code runtime status --runtime claude
```

Claude runtime truth:
- installs `code-*` skills
- supports both project and user scope

### 4.3 Codex

Codex supports:
- user scope by default
- project-local scope only through the explicit local `CODEX_HOME=<project>/.codex` contract

Typical user-scope setup:

```powershell
sdtk-code init --runtime codex --project-path ./my-project
sdtk-code runtime install --runtime codex --scope user
sdtk-code runtime status --runtime codex
```

Project-local setup is also supported, but only when you intentionally launch the runtime with `CODEX_HOME=<project>/.codex` first.

Codex runtime truth:
- installs `sdtk-code-*` skills
- uses `$CODEX_HOME/skills` or `~/.codex/skills` by default
- supports project-local installs only through the explicit local `CODEX_HOME=<project>/.codex` contract
- native `.codex/skills` auto-discovery is not claimed

### 4.4 Project-local Codex truth

Project-local Codex installs are supported only in explicit-local sessions.

These are valid only after you intentionally launch with `CODEX_HOME=<project>/.codex`:

```powershell
sdtk-code init --runtime codex --runtime-scope project --project-path ./my-project
sdtk-code runtime install --runtime codex --scope project --project-path ./my-project
```

If you want the simplest project-scope path without setting `CODEX_HOME` locally, use Claude instead.

## 5. Required Upstream Inputs

### 5.1 Preferred input

Preferred formal handoff artifact:
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`

This is the preferred intake path for:
- feature lane
- bugfix lane

Current canonical `/dev` generator truth:
- `CODE_HANDOFF` schema `0.2` is the normal upstream output
- `SDTK-CODE` still accepts `0.1` for bounded compatibility

### 5.2 Bounded fallback

If the formal handoff file is missing, `start` may use bounded compatibility fallback:
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `sdtk-spec.config.json`
- relevant architecture, API, database, and flow/screen specs for the current slice when applicable

Compatibility note:
- feature lane still prefers the formal handoff by default
- bugfix lane is more tolerant of bounded fallback when the formal handoff file is missing

### 5.3 Blocking cases

`sdtk-code start` must block when:
- the formal handoff file exists but is invalid
- the formal handoff file exists and upstream marked it blocked
- neither the formal handoff nor the bounded fallback inputs are sufficient
- `--lane` is omitted

Important rule:
- if the formal handoff file already exists and is invalid, `start` must not silently fall back

## 6. Quick Start

Use this as the shortest truthful first-run path.

### 6.1 Install and initialize

```powershell
npm install -g sdtk-code-kit
sdtk-code init --runtime codex --project-path ./my-project
```

Use Claude instead if you want the simplest project-scope runtime path:

```powershell
sdtk-code init --runtime claude --project-path ./my-project
```

### 6.2 Prepare minimum upstream inputs

Make sure the project contains:
- `sdtk-spec.config.json`
- preferred: `docs/dev/CODE_HANDOFF_ORDER_MGMT.json`

or, if the formal handoff file is missing:
- `docs/dev/FEATURE_IMPL_PLAN_ORDER_MGMT.md`
- the relevant supporting specs required by the current slice

### 6.3 Start the workflow

Feature lane:

```powershell
sdtk-code start --feature-key ORDER_MGMT --lane feature --project-path ./my-project
```

Bugfix lane:

```powershell
sdtk-code start --feature-key LOGIN_FIX --lane bugfix --project-path ./my-project
```

Expected result:
- `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md` is created or refreshed
- the workflow artifact records the intake outcome and next legal phase

## 7. Workflow-First Usage

### 7.1 Feature lane

If the formal handoff already seeded the exact slice set you want, confirm it explicitly:

When the upstream handoff is schema `0.2`, feature-lane planning preserves the listed `implementation_slices` order as the recommended build sequence and surfaces bounded `impact_map`, stronger `test_obligations`, and optional `recovery_notes` into planning notes.

```powershell
sdtk-code start --feature-key ORDER_MGMT --lane feature --project-path ./my-project
sdtk-code plan --feature-key ORDER_MGMT --project-path ./my-project --use-seeded-candidates
```

If you need to refine or narrow the feature plan, keep using explicit slices:

```powershell
sdtk-code plan --feature-key ORDER_MGMT --project-path ./my-project --slice "API contract updates" --slice "UI register flow"
sdtk-code build --feature-key ORDER_MGMT --project-path ./my-project --active-slice "API contract updates"
sdtk-code verify --feature-key ORDER_MGMT --project-path ./my-project --evidence "pytest -q|Regression suite passed|pass|docs/dev/evidence/ORDER_MGMT/pytest.txt" --spec-status pass --quality-status partial
sdtk-code ship --feature-key ORDER_MGMT --project-path ./my-project --decision ship --preflight "npm pack --dry-run|Package smoke passed|pass|docs/dev/evidence/ORDER_MGMT/pack.txt" --preflight "release checklist|Operator handoff reviewed|pass|docs/dev/evidence/ORDER_MGMT/release-checklist.txt"
```

Feature lane meaning:
- `start` validates intake and creates the workflow artifact
- `plan` either confirms the seeded handoff slice set with `--use-seeded-candidates` or refines it with explicit `--slice`
- `build` records active work and progress
- `verify` captures summarized evidence and review status
- `ship` records the final ship or finish decision

### 7.2 Bugfix lane

Normal bugfix path:

```powershell
sdtk-code start --feature-key LOGIN_FIX --lane bugfix --project-path ./my-project
sdtk-code build --feature-key LOGIN_FIX --project-path ./my-project --debug-note "Failure reproduced in session timeout flow" --complete
sdtk-code verify --feature-key LOGIN_FIX --project-path ./my-project --evidence "npm test|Bugfix regression passes|pass|docs/dev/evidence/LOGIN_FIX/regression.txt" --spec-status pass --quality-status pass --complete
sdtk-code ship --feature-key LOGIN_FIX --project-path ./my-project --decision finish --preflight "git diff --check|No whitespace issues remain|pass|docs/dev/evidence/LOGIN_FIX/diff-check.txt"
```

Bugfix lane meaning:
- planning is lighter by default
- you can move from `start` directly to `build`
- regression evidence remains mandatory before closure

### 7.3 Workflow artifact

Canonical workflow artifact:
- `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md`

It stores:
- lane and phase state
- intake outcome
- slice summary
- summarized evidence and review notes
- final ship or finish decision

### 7.4 Finish versus ship

Use this rule before you close a workflow:

| Decision | Use when | Minimum closeout truth in this wave |
|---|---|---|
| `finish` | You are closing a bounded slice or pilot pass and remaining hardening, deployment, or expansion work is still explicit | Feature lane uses a multi-preflight bundle with at least two `--preflight` entries, plus at least one `--follow-up` and at least one `--note`. Bugfix lane may keep the lighter bounded closeout path with one `--preflight`. |
| `ship` | You are recording the stronger closure decision after verify evidence is already strong enough for a fuller release boundary | Any `ship` decision uses a multi-preflight bundle with at least two `--preflight` entries. Add follow-up items or notes when they help explain the stronger release boundary. |

Practical guidance:
- use `finish` for bounded vertical-slice closure, pilot completion, or a controlled partial release boundary
- use `ship` only when you mean the stronger final closure decision for the current implemented scope
- do not use `finish` to hide remaining hardening or deployment work; record that work explicitly

### 7.5 Status / Doctor / Resume

Use the bounded recovery surfaces when workflow execution is interrupted or state looks inconsistent:

```powershell
sdtk-code status --feature-key ORDER_MGMT --project-path ./my-project
sdtk-code doctor --feature-key ORDER_MGMT --project-path ./my-project
sdtk-code resume --feature-key ORDER_MGMT --project-path ./my-project
```

Truth in this wave:
- `status` gives minimal but actionable lifecycle truth from `CODE_WORKFLOW_[FEATURE_KEY].md`
- `doctor` is diagnostic only; it does not auto-repair workflow files
- `resume` fails closed for `plan`, `verify`, and `ship` because operator inputs are required
- auto-resume is intentionally narrow to machine-safe build transitions
## 8. Runtime Helper Commands

### 8.1 Claude examples

Project scope:

```powershell
sdtk-code runtime install --runtime claude --scope project --project-path ./my-project
sdtk-code runtime status --runtime claude --project-path ./my-project
sdtk-code runtime uninstall --runtime claude --scope project --project-path ./my-project
```

User scope:

```powershell
sdtk-code runtime install --runtime claude --scope user
sdtk-code runtime status --runtime claude
sdtk-code runtime uninstall --runtime claude --scope user
```

### 8.2 Codex examples

```powershell
sdtk-code runtime install --runtime codex --scope user
sdtk-code runtime status --runtime codex
sdtk-code runtime uninstall --runtime codex --all
```

Use `--all` when you want a clear uninstall intent for Codex user-scope assets.

### 8.3 Remove Runtime Assets vs Remove the Package

Use `runtime uninstall` when you want to remove only SDTK-CODE-managed skills:

```powershell
sdtk-code runtime uninstall --runtime claude --scope project --project-path ./my-project
sdtk-code runtime uninstall --runtime claude --scope user
sdtk-code runtime uninstall --runtime codex --all
```

Important truth:
- `runtime uninstall` removes only SDTK-CODE-managed `code-*` or `sdtk-code-*` skill folders for the selected runtime and scope
- it does **not** delete parent runtime roots such as `.claude/`, `.claude/skills/`, `$CODEX_HOME/`, or `$CODEX_HOME/skills/`
- this is intentional because those runtime roots may also contain non-SDTK skills installed by the user

Use npm when you want to remove the CLI package itself:

```powershell
npm uninstall -g sdtk-code-kit
```

That command removes the global package and CLI shim only. It does **not** remove runtime assets that were already installed into Claude or Codex skill folders.

## 9. Expert Mode

Expert mode means direct raw `code-*` usage inside Claude or Codex instead of staying on the workflow-first path.

Use expert mode when:
- you already understand the workflow model
- you intentionally need direct specialist-skill control
- you can still keep the workflow artifact coherent if one already exists

Important:
- expert mode remains available
- there is no dedicated public expert-mode CLI flag in v1
- workflow-first remains the default documented path

## 10. Troubleshooting And Verification

### 10.1 Basic install verification

```powershell
sdtk-code --version
sdtk-code --help
```

### 10.2 Runtime verification

Use:
- `sdtk-code runtime status --runtime claude --project-path ./my-project`
- `sdtk-code runtime status --runtime codex`

### 10.3 Common blocking cases

If `start` blocks, check:
- did you pass `--lane` explicitly
- does `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json` exist and parse correctly
- if the formal handoff file is missing, do you have:
  - `FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
  - `sdtk-spec.config.json`
  - the required supporting specs for the slice

### 10.4 Codex project-scope rejection

If you see a Codex project-scope error:
- use `--runtime-scope user`
- or switch to Claude when you need project-scope runtime assets

### 10.5 Verify and ship command requirements

`verify` requires:
- at least one `--evidence`

`ship` requires:
- `--decision <ship|finish>`
- one or more `--preflight` entries

Feature-lane `finish` also requires:
- at least two `--preflight`
- at least one `--follow-up`
- at least one `--note`

Any `ship` decision also requires:
- at least two `--preflight`

Bugfix-lane `finish` may keep the lighter bounded path with:
- one `--preflight`

Reason:
- `finish` is the bounded closeout path when remaining hardening or deployment work is still explicit
- `ship` is the stronger closure decision

### 10.6 Provenance Requirements (`verify` / review packet)

For provenance compliance:

- `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md` must always include `## Provenance`.
- If external references were consulted, record the full provenance log in that section.
- If no external references were consulted, keep the section and record only:
  - `No external source references were consulted for this batch.`
- `verify` always renders `## 11. Reference Disclosure` in `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md`.
- `verify` emits a provenance warning when plan provenance and review-packet disclosure do not align.
### 10.7 Additional references

- install and smoke appendix:
  - `products/sdtk-code/governance/installation-runbook.md`
- workflow contract:
  - `products/sdtk-code/governance/workflow-contract.md`
- routing matrix:
  - `products/sdtk-code/governance/workflow-routing-matrix.md`
- state model:
  - `products/sdtk-code/governance/workflow-state-model.md`

## 11. Quick Reference

| Need | Command |
|---|---|
| Install package | `npm install -g sdtk-code-kit` |
| Check latest published version | `npm view sdtk-code-kit version` |
| Check version | `sdtk-code --version` |
| Show help | `sdtk-code --help` |
| Init for Claude | `sdtk-code init --runtime claude --project-path ./my-project` |
| Init for Codex | `sdtk-code init --runtime codex --project-path ./my-project` |
| Start feature lane | `sdtk-code start --feature-key ORDER_MGMT --lane feature --project-path ./my-project` |
| Start bugfix lane | `sdtk-code start --feature-key LOGIN_FIX --lane bugfix --project-path ./my-project` |
| Confirm seeded feature plan | `sdtk-code plan --feature-key ORDER_MGMT --project-path ./my-project --use-seeded-candidates` |
| Plan feature work explicitly | `sdtk-code plan --feature-key ORDER_MGMT --project-path ./my-project --slice "API contract updates"` |
| Record build progress | `sdtk-code build --feature-key ORDER_MGMT --project-path ./my-project --active-slice "API contract updates"` |
| Record verification evidence | `sdtk-code verify --feature-key ORDER_MGMT --project-path ./my-project --evidence "pytest -q|Regression suite passed|pass|docs/dev/evidence/ORDER_MGMT/pytest.txt" --spec-status pass --quality-status partial` |
| Record final decision | `sdtk-code ship --feature-key ORDER_MGMT --project-path ./my-project --decision ship --preflight "npm pack --dry-run|Package smoke passed|pass|docs/dev/evidence/ORDER_MGMT/pack.txt" --preflight "release checklist|Operator handoff reviewed|pass|docs/dev/evidence/ORDER_MGMT/release-checklist.txt"` |
| Check workflow lifecycle | `sdtk-code status --feature-key ORDER_MGMT --project-path ./my-project` |
| Diagnose workflow state | `sdtk-code doctor --feature-key ORDER_MGMT --project-path ./my-project` |
| Resume when machine-safe | `sdtk-code resume --feature-key ORDER_MGMT --project-path ./my-project` |
| Claude runtime status | `sdtk-code runtime status --runtime claude --project-path ./my-project` |
| Codex runtime status | `sdtk-code runtime status --runtime codex` |
