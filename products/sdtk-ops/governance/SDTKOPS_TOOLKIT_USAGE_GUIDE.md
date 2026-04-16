# SDTK-OPS Toolkit Usage Guide

Last Updated: 2026-04-03
Owner: SDTK Core Team

**Purpose:** Canonical end-user guide for the current public `SDTK-OPS` package line.

**Package:** `sdtk-ops-kit`

**CLI:** `sdtk-ops`

## 1. Product Boundary

`SDTK-OPS` is the operations product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

Use it when the active concern is:
- deployment planning and rollout discipline
- environment and runtime verification
- incident response and debugging
- monitoring
- backup or recovery
- infrastructure security, compliance, and cost discipline

Do not use it as:
- an upstream specification workflow
- a coding workflow product
- a generator CLI
- a provider-specific platform pack

Current truthful CLI surface:
- `sdtk-ops help`
- `sdtk-ops init`
- `sdtk-ops update`
- `sdtk-ops runtime install`
- `sdtk-ops runtime status`
- `sdtk-ops runtime uninstall`

Still unsupported:
- `sdtk-ops generate`
- workflow-first commands such as `sdtk-ops deploy`

## 2. Install

```powershell
npm install -g sdtk-ops-kit
```

Then verify:

```powershell
sdtk-ops --version
sdtk-ops --help
```

If you need the latest published version number, run:

```powershell
npm view sdtk-ops-kit version
```

### 2.1 Update an Existing Installation

Use the public `update` command when `sdtk-ops-kit` is already installed and you want the latest published package line plus refreshed runtime or project assets.

#### Step 1: Inspect the plan without making changes

```powershell
sdtk-ops update --check-only
sdtk-ops update --check-only --runtime claude --project-path ./my-project
```

#### Step 2: Apply the refresh

Claude example:

```powershell
sdtk-ops update --runtime claude --project-path ./my-project
```

Codex user-scope example:

```powershell
sdtk-ops update --runtime codex --scope user --project-path ./my-project
```

Project-local Codex refresh is also supported, but only when you intentionally launch the runtime with the explicit local `CODEX_HOME=<project>/.codex` contract. Native `.codex/skills` auto-discovery is still not claimed.

#### Step 3: Understand what `update` actually does

`sdtk-ops update` performs these steps in order:

1. refreshes the npm package with `npm install -g sdtk-ops-kit@<target>`
2. if `--runtime` is provided and `--skip-project-files` is not set, reruns `sdtk-ops init --force`
3. if `--runtime` is provided and `--skip-runtime-assets` is not set, reruns `sdtk-ops runtime install --force`

#### Step 4: Verify the refreshed install

```powershell
sdtk-ops --version
sdtk-ops --help
sdtk-ops runtime status --runtime claude --project-path ./my-project
```

Important truth:
- `update --check-only` is non-destructive and prints the planned npm/init/runtime steps only
- `init --force` refreshes managed project files
- `runtime install --force` refreshes managed runtime assets for the selected runtime and scope
- updating the npm package does **not** automatically reroute active ops work or regenerate downstream evidence
- `--skip-project-files` suppresses `init --force`
- `--skip-runtime-assets` suppresses runtime asset refresh

## 3. Runtime Setup

### Shared init behavior

```powershell
sdtk-ops init --runtime claude --project-path ./my-project
```

`init` copies:
- `AGENTS.md`
- `sdtk-spec.config.json`
- `sdtk-spec.config.profiles.example.json`

### Runtime matrix

| Runtime | Project Scope | User Scope | Default |
|---|:---:|:---:|---|
| Claude | Yes | Yes | `project` |
| Codex | Yes | Yes | `user` |

Codex truth:
- Codex defaults to `user` scope
- project-local installs are supported only through the explicit local `CODEX_HOME=<project>/.codex` contract
- native `.codex/skills` auto-discovery is not claimed

### Claude examples

Project scope:

```powershell
sdtk-ops runtime install --runtime claude --scope project --project-path ./my-project
sdtk-ops runtime status --runtime claude --project-path ./my-project
```

User scope:

```powershell
sdtk-ops runtime install --runtime claude --scope user
sdtk-ops runtime status --runtime claude
```

### Codex examples

```powershell
sdtk-ops runtime install --runtime codex --scope user
sdtk-ops runtime status --runtime codex
```

Project-local Codex example, only after you intentionally launch with `CODEX_HOME=<project>/.codex`:

```powershell
sdtk-ops runtime install --runtime codex --scope project --project-path ./my-project
sdtk-ops runtime status --runtime codex --project-path ./my-project
```

### Remove runtime assets vs remove the package

Use `runtime uninstall` when you want to remove only SDTK-OPS-managed skills:

```powershell
sdtk-ops runtime uninstall --runtime claude --scope project --project-path ./my-project
sdtk-ops runtime uninstall --runtime claude --scope user
sdtk-ops runtime uninstall --runtime codex --all
```

Important truth:
- `runtime uninstall` removes only SDTK-OPS-managed skill folders for the selected runtime and scope
- it does **not** delete parent runtime roots such as `.claude/`, `.claude/skills/`, `$CODEX_HOME/`, or `$CODEX_HOME/skills/`
- this is intentional because those runtime roots may also contain non-SDTK skills installed by the user

Use npm when you want to remove the CLI package itself:

```powershell
npm uninstall -g sdtk-ops-kit
```

That command removes the global package and CLI shim only. It does **not** remove runtime assets that were already installed into Claude or Codex skill folders.

## 4. Operational Entry Model

`SDTK-OPS` is skill-driven after `init`.

Start here:
- if the path is unclear, use `ops-discover`
- if the work needs a reviewable execution plan, use `ops-plan`
- if the issue is active and root cause is not yet known, use `ops-debug` or `ops-incident`
- always close with `ops-verify`

`ops-discover` is a skill, not a CLI command.

## 5. Canonical Journeys

### Deployment

Use when the main concern is rollout, environment validation, containerization, or deployment safety.

Suggested chain:
- `ops-plan`
- `ops-infra-plan`
- `ops-container`
- `ops-ci-cd`
- `ops-deploy`
- `ops-monitor`
- `ops-verify`

### Incident

Use when the main concern is outage response, regression isolation, rollback, or root cause analysis.

Suggested chain:
- `ops-incident`
- `ops-debug`
- `ops-deploy` if a rollback or corrective rollout is required
- `ops-monitor`
- `ops-verify`

### Monitoring

Use when the main concern is SLOs, alerts, dashboards, logs, or traces.

Suggested chain:
- `ops-plan`
- `ops-monitor`
- `ops-verify`

### Backup Or Recovery

Use when the main concern is backup, restore, disaster recovery, RTO, or RPO.

Suggested chain:
- `ops-plan`
- `ops-backup`
- `ops-verify`

### Other valid skills

These remain valid but are not the primary routed journeys in the current public contract:
- `ops-security-infra`
- `ops-compliance`
- `ops-cost`
- `ops-parallel`

## 6. Troubleshooting

If setup blocks:
- confirm `sdtk-ops --version`
- confirm `sdtk-ops --help`
- confirm the correct runtime and scope were chosen
- if you need Codex project-local scope, verify you intentionally launched with `CODEX_HOME=<project>/.codex`

If the path is unclear:
- do not look for missing CLI commands
- start with `ops-discover`
- close with `ops-verify`

## 7. Companion References

- Install and smoke appendix:
  - `products/sdtk-ops/governance/installation-runbook.md`
- Package landing page:
  - `products/sdtk-ops/distribution/sdtk-ops-kit/README.md`
- Product boundary doc:
  - `products/sdtk-ops/toolkit/SDTKOPS_TOOLKIT.md`
- Upgrade notes:
  - `products/sdtk-ops/governance/upgrade-notes.md`
