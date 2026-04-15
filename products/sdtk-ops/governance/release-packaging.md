# SDTKOPS Public Release Packaging Prep

Version: 0.2.1
Last Updated: 2026-03-25
Owner: SDTK Core Team

This document records the package-local release boundary for the current public `SDTK-OPS` patch line.
The current bounded follow-up is `0.2.1`, which corrects stale help-surface wording from `0.2.0`.

## 1. Release Identity

- Package: `sdtk-ops-kit`
- Current target version: `0.2.1`
- CLI: `sdtk-ops`

## 2. Locked Release Boundary

- supported commands remain:
  - `help`
  - `init`
  - `runtime install`
  - `runtime status`
  - `runtime uninstall`
- `generate` remains unsupported
- runtime truth remains:
  - Claude: `project` + `user`
  - Codex: `user` only
  - Gate C0 remains required

## 3. Package Metadata Expectations

Before publish work starts, `products/sdtk-ops/distribution/sdtk-ops-kit/package.json` must contain:
- `version = 0.2.1`
- `repository`
- `homepage`
- `bugs`
- `publishConfig.access = public`
- `prepublishOnly`

## 4. Package-Local Prepublish Gate

Run from `products/sdtk-ops/distribution/sdtk-ops-kit/`:

```powershell
npm run build:payload
npm run verify:payload
npm test
npm run pack:smoke
```

These commands are the package-local release gate for the first public package contract.

## 5. Evidence Directory Convention

Raw patch-release evidence should live under:

```text
products/sdtk-ops/governance/release-artifacts/public-v0.2.1/
```

Expected evidence categories:
- npm auth preflight
- package-local checks
- repo-root public smoke
- publish log
- registry verification
- isolated install proof
- Gate C0 proof

## 6. Packaging Notes

- `prepublishOnly` should run payload verification before `npm publish`.
- `pack:smoke` remains the isolated packed-package proof path.
- A dedicated public npm auth and publish runbook will carry the maintainer auth and registry flow; this file stays focused on packaging readiness.

## 7. Stop Rules

Do not move into real publish execution if:
- package metadata is still missing public fields
- package-local gate fails
- docs still claim unsupported runtime behavior
- docs still claim unsupported commands

## 8. Companion Documents

- Package landing page:
  - `products/sdtk-ops/distribution/sdtk-ops-kit/README.md`
- Canonical usage guide:
  - `products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`
- Install appendix:
  - `products/sdtk-ops/governance/installation-runbook.md`
