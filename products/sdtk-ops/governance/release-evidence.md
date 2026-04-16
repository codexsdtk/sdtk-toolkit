# SDTKOPS Public Release Evidence Template

Version: 0.2.1
Last Updated: 2026-03-25
Owner: SDTK Core Team

Use this document as the release-memory template for the current public `SDTK-OPS` patch-release line.

This is not a live publish-success report by itself.
Use the dedicated release report and raw evidence folder for the executed patch release.

## Release Identity

| Field | Value |
|---|---|
| Toolkit | `SDTK-OPS` |
| Package | `sdtk-ops-kit` |
| Target version | `0.2.1` |
| CLI | `sdtk-ops` |
| Release status | `patch_release_preparation` |
| Evidence folder | `products/sdtk-ops/governance/release-artifacts/public-v0.2.1/` |

## Expected Release Boundary

- supported commands:
  - `help`
  - `init`
  - `runtime install`
  - `runtime status`
  - `runtime uninstall`
- unsupported:
  - `generate`
- runtime truth:
  - Claude: `project` + `user`
  - Codex: `user` only
  - Gate C0 remains required

## Required Raw Evidence Index

| Artifact | Expected Path |
|---|---|
| npm ping | `release-artifacts/public-v0.2.1/01-npm-ping.txt` |
| npm whoami | `release-artifacts/public-v0.2.1/02-npm-whoami.txt` |
| npm view preflight | `release-artifacts/public-v0.2.1/03-npm-view-preflight.txt` |
| package-local gate | `release-artifacts/public-v0.2.1/04-package-local-gate.txt` |
| repo-root public smoke | `release-artifacts/public-v0.2.1/05-repo-root-public-smoke.txt` |
| npm publish log | `release-artifacts/public-v0.2.1/06-npm-publish.txt` |
| registry verification | `release-artifacts/public-v0.2.1/07-registry-verification.json` |
| isolated install verification | `release-artifacts/public-v0.2.1/08-isolated-install.txt` |
| Gate C0 proof | `release-artifacts/public-v0.2.1/09-gate-c0.txt` |

## Expected Verification Matrix

| Gate | Expected Result | Evidence Path | Status |
|---|---|---|---|
| `npm ping` | pass | `release-artifacts/public-v0.2.1/01-npm-ping.txt` | `pending` |
| `npm whoami` | pass | `release-artifacts/public-v0.2.1/02-npm-whoami.txt` | `pending` |
| `npm view` preflight | pass and target version absent before publish | `release-artifacts/public-v0.2.1/03-npm-view-preflight.txt` | `pending` |
| package-local release gate | pass | `release-artifacts/public-v0.2.1/04-package-local-gate.txt` | `pending` |
| repo-root public smoke | pass | `release-artifacts/public-v0.2.1/05-repo-root-public-smoke.txt` | `pending` |
| `npm publish` | pass | `release-artifacts/public-v0.2.1/06-npm-publish.txt` | `pending` |
| registry verification | pass | `release-artifacts/public-v0.2.1/07-registry-verification.json` | `pending` |
| isolated install verification | pass | `release-artifacts/public-v0.2.1/08-isolated-install.txt` | `pending` |
| Gate C0 proof | pass | `release-artifacts/public-v0.2.1/09-gate-c0.txt` | `pending` |

## Release Decision Template

| Field | Value |
|---|---|
| Decision | `pending` |
| Decision owner | `pending` |
| Review date | `pending` |

## Notes

- Fill this document with real evidence only during the public release execution wave.
- Do not mark publish, registry verification, or isolated install as `pass` until those commands actually run.
- Do not weaken Gate C0 wording in order to make the package sound broader than it is.
