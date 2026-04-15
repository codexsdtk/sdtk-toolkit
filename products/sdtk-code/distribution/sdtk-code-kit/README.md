# sdtk-code-kit

`SDTK-CODE` is the coding-process product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

## Document Role
This README is the npm package landing page for `sdtk-code-kit`.

Use it to confirm:
- package name and install command
- canonical command surface
- runtime scope truth
- upstream dependency boundary

For the full end-user guide, use:
- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

## Public Package Truth

- package: `sdtk-code-kit`
- command: `sdtk-code`
- latest published version lookup: `npm view sdtk-code-kit version`
- primary workflow-first surface:
  - `start`
  - `plan`
  - `build`
  - `verify`
  - `ship`
  - `status`
  - `doctor`
  - `resume`
- support commands:
  - `init`
  - `update`
  - `runtime install`
  - `runtime status`
  - `runtime uninstall`
  - `help`
  - `--version`

Not part of the v1 public surface:
- `generate`

## Install

```powershell
npm install -g sdtk-code-kit
sdtk-code --version
sdtk-code --help
```

If you need the exact latest published version number, run:

```powershell
npm view sdtk-code-kit version
```

## Update Existing Installation

Use the public `update` command when `sdtk-code-kit` is already installed and you want the newest published package line.

```powershell
sdtk-code update --check-only
sdtk-code update --runtime claude --project-path ./my-project
```

Codex user-scope variant:

```powershell
sdtk-code update --runtime codex --scope user --project-path ./my-project
```

Project-local Codex refresh is also supported, but only when you intentionally launch the runtime with the explicit local `CODEX_HOME=<project>/.codex` contract. Native `.codex/skills` auto-discovery is still not claimed.

Then verify:

```powershell
sdtk-code --version
sdtk-code runtime status --runtime claude --project-path ./my-project
```

Important truth:
- `sdtk-code update` still uses `npm install -g sdtk-code-kit@<target>` as the package refresh mechanism
- `update --check-only` is non-destructive and prints the planned commands only
- `init --force` refreshes managed project files
- `runtime install --force` refreshes managed runtime assets
- existing workflow docs are not automatically regenerated

## First Quick Start

Initialize the workspace first:

```powershell
sdtk-code init --runtime codex --project-path ./my-project
```

After upstream `SDTK-SPEC` inputs already exist, start the workflow:
- preferred: `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- bounded fallback when the formal handoff file is missing:
  - `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
  - `sdtk-spec.config.json`

```powershell
sdtk-code start --feature-key ORDER_MGMT --lane feature --project-path ./my-project
```

Use Claude instead when you want the simplest project-scope runtime path:

```powershell
sdtk-code init --runtime claude --project-path ./my-project
```

## Runtime Truth

| Runtime | Project scope | User scope | Current truth |
|---|:---:|:---:|---|
| Claude | Yes | Yes | installs `code-*` skills |
| Codex | Yes | Yes | installs `sdtk-code-*` skills; default is user scope and project-local installs require the explicit local `CODEX_HOME=<project>/.codex` contract |

## Remove Runtime Assets vs Remove the Package

Use:

```powershell
sdtk-code runtime uninstall --runtime claude --scope project --project-path ./my-project
sdtk-code runtime uninstall --runtime codex --all
```

when you want to remove only SDTK-CODE-managed runtime skill folders.

Important truth:
- `runtime uninstall` removes only SDTK-CODE-managed skill folders for the selected runtime and scope
- it does **not** delete parent runtime roots such as `.claude/`, `.claude/skills/`, `$CODEX_HOME/`, or `$CODEX_HOME/skills/`

Use:

```powershell
npm uninstall -g sdtk-code-kit
```

when you want to remove the global npm package and CLI shim only.

That npm command does **not** remove runtime assets that were already copied into Claude or Codex skill folders.

## Upstream Dependency

`SDTK-CODE` is publicly installable, but real workflow execution still expects upstream `SDTK-SPEC` artifacts.

Task-breakdown truth:
- upstream `SDTK-SPEC` `/dev` still owns implementation-readiness planning and formal handoff scope
- `FEATURE_IMPL_PLAN_[FEATURE_KEY].md` remains the upstream readiness plan
- `sdtk-code plan` refines downstream execution slices only after intake succeeds

Preferred intake artifact:
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`

Bounded fallback when the formal handoff file is missing:
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `sdtk-spec.config.json`
- relevant architecture, API, database, and flow/screen specs for the current slice when applicable

Blocking truth:
- invalid or upstream-blocked formal handoff must stop `sdtk-code start`
- no silent fallback is allowed when the formal handoff file already exists but is invalid

## Downstream OPS Bridge

Completed closeout from a formal-handoff-backed workflow writes the canonical downstream bridge:
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`

Important boundary:
- this bridge is produced by `SDTK-CODE` for downstream `SDTK-OPS`
- compatibility fallback workflows do not invent a fake `OPS_HANDOFF` without the current `CODE_HANDOFF_[FEATURE_KEY].json`

## Workflow Recovery

First-wave bounded recovery commands for `SDTK-CODE`:
- `sdtk-code status`
- `sdtk-code doctor`
- `sdtk-code resume`

Behavior truth in this wave:
- `status` is minimal and actionable: current phase, next phase, blocking state, resume guidance
- `doctor` is diagnostic only (no auto-repair)
- `resume` is fail-closed when operator-only inputs are still required
- auto-dispatch is intentionally narrow to machine-safe build transitions only
- lifecycle truth remains inside `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md` (no second persistence store)
## Verify Output Truth

`sdtk-code verify` records summarized evidence in `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md` and also emits:
- `docs/dev/REVIEW_PACKET_[FEATURE_KEY].md`

Important boundary:
- the review packet is an evidence package for downstream QA/controller review
- it does not replace QA release authority and it is not a final approval artifact

## References

- Canonical end-user guide:
  - `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`
- Install and smoke appendix:
  - `products/sdtk-code/governance/installation-runbook.md`
- Product boundary and architecture:
  - `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md`
