# sdtk-ops-kit

> Skill-driven operations toolkit for deployment, verification, monitoring, incident response, backup or recovery, security, compliance, and cost discipline.

## Package

- Package: `sdtk-ops-kit`
- CLI: `sdtk-ops`
- Latest published version lookup: `npm view sdtk-ops-kit version`

## Install

```bash
npm install -g sdtk-ops-kit
```

Then verify the installed command:

```bash
sdtk-ops --version
sdtk-ops --help
```

If you need the exact latest published version number, run:

```bash
npm view sdtk-ops-kit version
```

## Update Existing Installation

Use the public `update` command when `sdtk-ops-kit` is already installed and you want the newest published package line.

```bash
sdtk-ops update --check-only
sdtk-ops update --runtime claude --project-path ./my-project
```

Codex user-scope variant:

```bash
sdtk-ops update --runtime codex --scope user --project-path ./my-project
```

Project-local Codex refresh is also supported, but only when you intentionally launch the runtime with the explicit local `CODEX_HOME=<project>/.codex` contract. Native `.codex/skills` auto-discovery is still not claimed.

Then verify:

```bash
sdtk-ops --version
sdtk-ops runtime status --runtime claude --project-path ./my-project
```

Important truth:
- `sdtk-ops update` still uses `npm install -g sdtk-ops-kit@<target>` as the package refresh mechanism
- `update --check-only` is non-destructive and prints the planned commands only
- `init --force` refreshes managed project files
- `runtime install --force` refreshes managed runtime assets
- existing ops evidence is not rewritten automatically

## Supported Command Surface

`SDTK-OPS` keeps a deliberately small CLI surface.

| Command | Purpose |
|---|---|
| `sdtk-ops help` | Show the supported command surface and routing guidance |
| `sdtk-ops init` | Copy shared project files and prepare runtime installation |
| `sdtk-ops update` | Refresh the installed package line and optionally rerun bounded managed-file/runtime refresh steps |
| `sdtk-ops runtime install` | Install runtime assets for Claude or Codex |
| `sdtk-ops runtime status` | Check installed runtime assets |
| `sdtk-ops runtime uninstall` | Remove runtime assets cleanly |

Not supported:
- `sdtk-ops generate`
- workflow-first commands such as `sdtk-ops deploy`, `sdtk-ops incident`, or `sdtk-ops monitor`

## Runtime Matrix

| Runtime | Project Scope | User Scope | Notes |
|---|:---:|:---:|---|
| Claude | Yes | Yes | Default scope is project |
| Codex | Yes | Yes | Default scope is user; project-local installs require the explicit local `CODEX_HOME=<project>/.codex` contract |

Important truth:
- Claude supports `project` and `user` scope.
- Codex defaults to `user` scope and supports `project` scope only through the explicit local `CODEX_HOME=<project>/.codex` contract.
- Codex installs collision-avoiding `sdtk-ops-*` skill names.

## Remove Runtime Assets vs Remove the Package

`runtime uninstall` removes only the SDTK-OPS-managed skill folders for the selected runtime and scope.
It does not delete `.claude/`, `.claude/skills/`, `$CODEX_HOME/`, or `$CODEX_HOME/skills/`, because those roots may contain non-SDTK user assets.

Use runtime cleanup first:

```bash
sdtk-ops runtime uninstall --runtime claude --scope project --project-path ./my-project
sdtk-ops runtime uninstall --runtime claude --scope user
sdtk-ops runtime uninstall --runtime codex --all
```

Use npm uninstall separately when you also want to remove the globally installed CLI package:

```bash
npm uninstall -g sdtk-ops-kit
```

That npm command removes the package only. It does not remove runtime assets already copied into Claude or Codex skill directories.

## Quick Start

### 1. Initialize a project

```bash
sdtk-ops init --runtime claude --project-path ./my-project
```

`init` copies:
- `AGENTS.md`
- `sdtk-spec.config.json`
- `sdtk-spec.config.profiles.example.json`

### 2. Install runtime assets

Claude project scope:

```bash
sdtk-ops runtime install --runtime claude --scope project --project-path ./my-project
```

Claude user scope:

```bash
sdtk-ops runtime install --runtime claude --scope user
```

Codex user scope:

```bash
sdtk-ops runtime install --runtime codex --scope user
```

Codex project-local scope, only when you intentionally launch with `CODEX_HOME=<project>/.codex`:

```bash
sdtk-ops runtime install --runtime codex --scope project --project-path ./my-project
```

Project-local Codex installs remain bounded explicit-local support. Native `.codex/skills` auto-discovery is not claimed.

### 3. Choose the right skill journey

Use `ops-discover` when the correct operational path is unclear.

Canonical journeys:
- deployment: `ops-plan -> ops-infra-plan -> ops-container -> ops-ci-cd -> ops-deploy -> ops-monitor -> ops-verify`
- incident: `ops-incident -> ops-debug -> ops-deploy` when rollback or corrective rollout is needed, then `ops-monitor -> ops-verify`
- monitoring: `ops-plan -> ops-monitor -> ops-verify`
- backup or recovery: `ops-plan -> ops-backup -> ops-verify`

Always close work with `ops-verify`.

## DEV-Run Intake Contract

When operationalization begins from `SDTK-CODE`, the only canonical intake artifact is:

- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`

`SDTK-OPS` consumes that frozen contract as input.
It does not redefine the schema, rename fields, or move the canonical handoff path.

Ready-path intake:
- inspect `handoff_status`
- if status is `READY_FOR_SDTK_OPS`, start from `suggested_next_ops_path.start_with`
- treat `suggested_next_ops_path.suggested_chain` as the default route unless fresh evidence requires a bounded reroute
- close accepted work with `suggested_next_ops_path.close_with`, normally `ops-verify`

Blocked-path intake:
- if status is `BLOCKED_FOR_SDTK_OPS`, the handoff is still inspectable
- inspect `open_blockers`, `code_evidence_refs`, and the prerequisite fields before choosing the next step
- do not treat blocked handoff state as normal ready-path execution

Minimum OPS evidence expectations for this wave:
- record the consumed handoff path and `handoff_status`
- record whether the chosen first OPS step followed or overrode `suggested_next_ops_path`, and why
- record checked prerequisites, assumptions, dependencies, observability requirements, and rollback or recovery expectations
- record journey-specific operational evidence
- record final `ops-verify` closeout evidence

This wave does not define a final OPS evidence schema and does not implement QA bridge logic.

## Product Boundary

`SDTK-OPS` is the downstream operations product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

It is:
- skill-driven
- operations-focused
- suitable for deployment, verification, monitoring, incident response, backup, security, compliance, and cost work

It is not:
- a workflow-first CLI like `SDTK-CODE`
- a generator product
- a provider-pack catalog
- a Kubernetes or cloud-platform package

## Package Validation

Maintainers validating a release candidate from source can run:

```bash
npm run build:payload
npm run verify:payload
npm test
npm run pack:smoke
```

Those commands validate payload integrity, runtime behavior, and isolated packed-package smoke before publish.

## Documentation

- Usage guide:
  - `https://github.com/codexsdtk/sdtk-toolkit/blob/main/products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`
- Installation runbook:
  - `https://github.com/codexsdtk/sdtk-toolkit/blob/main/products/sdtk-ops/governance/installation-runbook.md`
- Product boundary doc:
  - `https://github.com/codexsdtk/sdtk-toolkit/blob/main/products/sdtk-ops/toolkit/SDTKOPS_TOOLKIT.md`
