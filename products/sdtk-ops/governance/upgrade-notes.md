# SDTKOPS Upgrade Notes

Version: 0.2.1
Last Updated: 2026-03-25
Owner: SDTK Core Team

This document records the current upgrade boundary from the first public `0.2.0` package line to the help-surface correction release `0.2.1`.

## 1. Upgrade Identity

- Previous public line: `sdtk-ops-kit@0.2.0`
- Current public line: `sdtk-ops-kit@0.2.1`
- CLI remains: `sdtk-ops`

## 2. Upgrade Command

```powershell
npm install -g sdtk-ops-kit@0.2.1
```

Then verify after upgrade:

```powershell
sdtk-ops --version
sdtk-ops --help
```

## 3. What Changes At 0.2.1

- the help surface no longer claims the old internal-only package scope
- the package remains publicly installable from npm
- the runtime matrix stays the same
- the command surface stays the same

Still unchanged:
- Claude supports `project` and `user`
- Codex supports `user` only
- Gate C0 remains truthful
- `generate` remains unsupported

## 4. If You Installed 0.2.0

Treat `0.2.1` as the corrective public patch release for the stale help-surface wording shipped in `0.2.0`.

Recommended actions:
1. install `sdtk-ops-kit@0.2.1`
2. rerun `sdtk-ops --version`
3. rerun `sdtk-ops --help` and confirm it no longer says the old internal-only package scope
4. rerun `sdtk-ops init` for any project that needs refreshed shared files
5. rerun `sdtk-ops runtime install` where runtime assets should match the new package line

Useful checks:

```powershell
sdtk-ops runtime status --runtime claude --project-path .
sdtk-ops runtime status --runtime codex
```

## 5. Isolated Upgrade Validation

If you want a cleaner validation path, install into a temporary npm prefix instead of a maintainer's long-lived global prefix.

Example shape:

```powershell
$tempPrefix = Join-Path $env:TEMP "sdtk-ops-upgrade-check"
npm install -g sdtk-ops-kit@0.2.1 --prefix $tempPrefix
& "$tempPrefix\\sdtk-ops.cmd" --version
& "$tempPrefix\\sdtk-ops.cmd" --help
```

## 6. Companion References

- Canonical usage guide:
  - `products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`
- Installation appendix:
  - `products/sdtk-ops/governance/installation-runbook.md`
- Package landing page:
  - `products/sdtk-ops/distribution/sdtk-ops-kit/README.md`
