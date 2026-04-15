# SDTKOPS Installation Runbook

Last Updated: 2026-03-25
Owner: SDTK Core Team

This runbook is the install and smoke appendix for the current public `SDTK-OPS` package line.
It also serves as the bounded patch-release verification appendix for the current public help-surface correction line.

## 1. Package Identity

- Package: `sdtk-ops-kit`
- Latest published version lookup: `npm view sdtk-ops-kit version`
- CLI: `sdtk-ops`

## 2. Prerequisites

- Node.js `18.13.0` or newer
- PowerShell `5.1+` on Windows, or `pwsh` where applicable
- Claude or Codex as the target runtime

## 3. Install

```powershell
npm install -g sdtk-ops-kit
```

Then verify:

```powershell
sdtk-ops --version
sdtk-ops --help
```

## 4. Supported Runtime Matrix

| Runtime | Project Scope | User Scope | Notes |
|---|:---:|:---:|---|
| Claude | Yes | Yes | Default scope is project |
| Codex | No | Yes | Gate C0 blocks project-local install |

## 5. Initialize A Project

```powershell
cd /path/to/project
sdtk-ops init --runtime claude --project-path .
```

Files copied by `init`:
- `AGENTS.md`
- `sdtk-spec.config.json`
- `sdtk-spec.config.profiles.example.json`

## 6. Runtime Install Examples

Claude project scope:

```powershell
sdtk-ops runtime install --runtime claude --scope project --project-path .
sdtk-ops runtime status --runtime claude --project-path .
sdtk-ops runtime uninstall --runtime claude --scope project --project-path .
```

Claude user scope:

```powershell
sdtk-ops runtime install --runtime claude --scope user
sdtk-ops runtime status --runtime claude
sdtk-ops runtime uninstall --runtime claude --scope user
```

Codex user scope:

```powershell
sdtk-ops runtime install --runtime codex --scope user
sdtk-ops runtime status --runtime codex
sdtk-ops runtime uninstall --runtime codex --all
```

Codex Gate C0:

```powershell
sdtk-ops runtime install --runtime codex --scope project
```

That command must fail truthfully.

Important uninstall truth:
- `runtime uninstall` removes only SDTK-OPS-managed skills for the selected runtime and scope
- it does **not** delete `.claude/`, `.claude/skills/`, `$CODEX_HOME/`, or `$CODEX_HOME/skills`
- `npm uninstall -g sdtk-ops-kit` removes the npm package only and does not remove runtime assets already copied into those directories

## 7. Isolated Install Smoke

For release validation or post-publish verification, use an isolated npm prefix instead of the maintainer's real global prefix.

Example shape:

```powershell
$tempPrefix = Join-Path $env:TEMP "sdtk-ops-public-smoke"
npm install -g sdtk-ops-kit --prefix $tempPrefix
& "$tempPrefix\\sdtk-ops.cmd" --version
& "$tempPrefix\\sdtk-ops.cmd" --help
```

When you are done with package-level validation, remove the package with:

```powershell
npm uninstall -g sdtk-ops-kit
```

Then validate:
- Claude project scope
- Claude user scope
- Codex user scope
- Codex project-scope rejection

## 8. Package-Local Validation For Maintainers

From `products/sdtk-ops/distribution/sdtk-ops-kit/`:

```powershell
npm run build:payload
npm run verify:payload
npm test
npm run pack:smoke
```

Use these commands to validate:
- payload integrity
- runtime matrix behavior
- isolated packed-package smoke

## 9. Truthful Limits

- `generate` remains unsupported
- `SDTK-OPS` is not a workflow-first CLI like `SDTK-CODE`
- no provider-specific pack surface is implied by this install runbook

## 10. Companion Documents

- Canonical usage guide:
  - `products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`
- Package landing page:
  - `products/sdtk-ops/distribution/sdtk-ops-kit/README.md`
- Product boundary doc:
  - `products/sdtk-ops/toolkit/SDTKOPS_TOOLKIT.md`
