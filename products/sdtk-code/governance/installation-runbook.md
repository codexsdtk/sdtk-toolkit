# SDTK-CODE Installation Runbook

Last Updated: 2026-03-23
Owner: SDTK Core Team

## Document Role
This file is the install-truth and smoke-runbook appendix for `SDTK-CODE`.

Use this file when you need to:
- confirm the public install contract for `sdtk-code-kit`
- run bounded install/runtime/workflow smoke
- check Gate C0 behavior for Codex

Do not use this file as the main onboarding guide.

Canonical end-user guide:
- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

## 1. Public Install Truth

Current public package truth:
- install package: `sdtk-code-kit`
- latest published version lookup: `npm view sdtk-code-kit version`
- canonical command: `sdtk-code`
- workflow-first commands:
  - `start`
  - `plan`
  - `build`
  - `verify`
  - `ship`
- support commands:
  - `init`
  - `runtime install`
  - `runtime status`
  - `runtime uninstall`
  - `help`
  - `--version`

Still true after public install:
- `SDTK-CODE` does not replace upstream `SDTK-SPEC`
- real workflow execution still expects upstream `SDTK-SPEC` artifacts
- Codex remains user-scope only
- CI/tag-publish parity remains follow-up hardening, not a blocker for the current public package line

## 2. Install And Command Smoke

```powershell
npm install -g sdtk-code-kit
sdtk-code --version
sdtk-code --help
```

Expected:
- version prints `sdtk-code-kit <published-version>`
- help shows the workflow-first command surface
- help does not claim `generate` is part of the public `SDTK-CODE` CLI

## 3. Runtime Smoke

### 3.1 Claude

```powershell
$tempDir = Join-Path $PWD 'tmp-sdtk-code-claude'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

sdtk-code init --runtime claude --project-path $tempDir
sdtk-code runtime install --runtime claude --scope project --project-path $tempDir
sdtk-code runtime status --runtime claude --project-path $tempDir
sdtk-code runtime uninstall --runtime claude --scope project --project-path $tempDir
```

Expected:
- Claude supports both project and user scope
- project scope installs `code-*` skills into `<project>/.claude/skills`
- shared files are written to the project root

### 3.2 Codex

```powershell
$tempDir = Join-Path $PWD 'tmp-sdtk-code-codex'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$env:CODEX_HOME = Join-Path $tempDir '.codex-home'

sdtk-code init --runtime codex --project-path $tempDir
sdtk-code runtime install --runtime codex --scope user
sdtk-code runtime status --runtime codex
sdtk-code runtime uninstall --runtime codex --all
```

Expected:
- Codex uses user scope only
- Codex installs `sdtk-code-*` skills into `$CODEX_HOME/skills` or `~/.codex/skills`
- shared project files are still written to the project root

### 3.3 Gate C0

```powershell
$tempDir = Join-Path $PWD 'tmp-sdtk-code-c0'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

sdtk-code init --runtime codex --runtime-scope project --project-path $tempDir
sdtk-code runtime install --runtime codex --scope project
```

Expected:
- both commands block
- the error explains that Codex does not support project-local scope

## 4. Workflow Smoke

Use this when you want a bounded proof that the installed package can create and advance the workflow artifact.

### 4.1 Minimum project setup

```powershell
$tempDir = Join-Path $PWD 'tmp-sdtk-code-flow'
New-Item -ItemType Directory -Force -Path (Join-Path $tempDir 'docs\dev') | Out-Null
Set-Content -Path (Join-Path $tempDir 'docs\dev\FEATURE_IMPL_PLAN_ORDER_MGMT.md') -Value '# FEATURE_IMPL_PLAN_ORDER_MGMT'
Set-Content -Path (Join-Path $tempDir 'sdtk-spec.config.json') -Value '{ "toolkit": "SDTK-SPEC" }'
```

### 4.2 Feature-lane smoke

```powershell
sdtk-code start --feature-key ORDER_MGMT --lane feature --project-path $tempDir
sdtk-code plan --feature-key ORDER_MGMT --project-path $tempDir --slice "API contract updates"
sdtk-code build --feature-key ORDER_MGMT --project-path $tempDir --active-slice "API contract updates" --complete
sdtk-code verify --feature-key ORDER_MGMT --project-path $tempDir --evidence "pytest -q|Regression suite passed|pass|docs/dev/evidence/ORDER_MGMT/pytest.txt" --spec-status pass --quality-status pass --complete
sdtk-code ship --feature-key ORDER_MGMT --project-path $tempDir --decision ship --preflight "npm pack --dry-run|Package smoke passed|pass|docs/dev/evidence/ORDER_MGMT/pack.txt"
```

Expected:
- `start` creates `docs/dev/CODE_WORKFLOW_ORDER_MGMT.md`
- feature lane routes `start -> plan -> build -> verify -> ship`
- summarized evidence is recorded in the workflow artifact

### 4.3 Intake blocking smoke

Use this to prove blocking behavior:
- if `CODE_HANDOFF_[FEATURE_KEY].json` exists and is invalid, `start` must block
- if the formal handoff says upstream is blocked, `start` must block
- if the formal handoff file is missing, bounded fallback is still allowed

## 5. Shared Files Written By Init

`sdtk-code init` writes these shared project files:
- `AGENTS.md`
- `sdtk-spec.config.json`
- `sdtk-spec.config.profiles.example.json`

Intentional v1 non-behavior:
- no `CLAUDE.md`
- no `CODEX.md`
- no `generate` surface

For full onboarding and workflow usage, use:
- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

## 5.1 Remove Runtime Assets vs Remove the Package

Use:

```powershell
sdtk-code runtime uninstall --runtime claude --scope project --project-path $tempDir
sdtk-code runtime uninstall --runtime codex --all
```

when you want to remove only SDTK-CODE-managed skills from the runtime directories.

Use:

```powershell
npm uninstall -g sdtk-code-kit
```

when you want to remove the global npm package itself.

Important truth:
- `runtime uninstall` does not delete `.claude/`, `.claude/skills/`, `$CODEX_HOME/`, or `$CODEX_HOME/skills`
- `npm uninstall -g sdtk-code-kit` does not remove runtime assets that were already copied into those directories

## 6. Runtime Truth Snapshot

| Runtime | Project scope | User scope | Current truth |
|---|:---:|:---:|---|
| Claude | Yes | Yes | installs `code-*` skills |
| Codex | No | Yes | installs `sdtk-code-*` skills and enforces Gate C0 |

## 7. Payload Truth

Current package payload truth:
- ships runtime assets needed by `init` and `runtime`
- ships `toolkit/templates/CODE_WORKFLOW_TEMPLATE.md`
- does not bulk-sync `toolkit/templates/**`

Historical note:
- older publishability planning assumed no workflow template belonged in the package payload
- that assumption is superseded by the implemented workflow-first rollout

## 8. References

- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`
- `products/sdtk-code/governance/usage-guide.md`
- `products/sdtk-code/governance/workflow-contract.md`
- `products/sdtk-code/governance/workflow-routing-matrix.md`
- `products/sdtk-code/governance/workflow-state-model.md`
