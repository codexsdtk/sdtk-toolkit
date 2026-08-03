# SDTK-CODE First Public NPM Release Report

Version: 0.1
Date: 2026-03-23
Owner: Codex Dev

## 1. Summary
- Publish status: SUCCEEDED
- Final published package: `sdtk-code-kit@0.1.0`
- Canonical command: `sdtk-code`
- Public install status: WORKING

`SDTK-CODE` is now publicly installable from npm as `sdtk-code-kit@0.1.0`. The real isolated install flow worked from registry through CLI execution, including bounded Claude and Codex runtime helper smoke and a bounded workflow `start` run with formal upstream handoff inputs.

## 2. Release Commit SHAs

Preparation and release-truth commits involved:
- Batch 1 public metadata/docs truth: `3e8262a`
- Batch 2 prepublish smoke hardening: `98ef744`
- release-gate plan patch preserved before publish: `7fd5b05`

Published commit SHA:
- `7fd5b0545476db410c52440898f9fb01307e0cae`

## 3. Auth And Preflight

### npm auth result
Commands:

```powershell
npm ping
npm whoami
```

Results:
- `npm ping` -> PASS
- `npm whoami` -> `sdtkclikit`

### Registry preflight result
Commands:

```powershell
npm view sdtk-code-kit version
npm view sdtk-code-kit dist-tags
npm view sdtk-code-kit bin
```

Result before publish:
- all three returned `404 Not Found`
- interpretation: expected for the first publish of `sdtk-code-kit`

### Local package preflight result
Repo-root command:

```powershell
python -m unittest tests.test_sdtk_code_cli.SDTKCodeCliTests.test_packed_tarball_supports_bounded_public_smoke
```

Package-root commands run from `products/sdtk-code/distribution/sdtk-code-kit`:

```powershell
npm.cmd run verify:payload
npm.cmd run pack:smoke
```

Results:
- repo-root bounded public smoke -> PASS
- `verify:payload` -> PASS
- `pack:smoke` -> PASS

Confirmed local package truth:
- name: `sdtk-code-kit`
- version: `0.1.0`
- bin: `sdtk-code`

## 4. Publish Action

Exact publish command used:

```powershell
cd products/sdtk-code/distribution/sdtk-code-kit
npm.cmd publish
```

Result:
- PASS

Published package/version:
- `sdtk-code-kit@0.1.0`

Observed low-risk npm warnings during publish:
- npm auto-cleaned `bin[sdtk-code]`
- npm normalized `repository.url` to `git+https://github.com/codexsdtk/sdtk-toolkit.git`

These did not block publish and did not change final registry truth.

## 5. Post-Publish Registry Verification

### Registry truth
Commands:

```powershell
npm view sdtk-code-kit name version dist-tags.latest --json
npm view sdtk-code-kit bin --json
```

Results:
- `name` -> `sdtk-code-kit`
- `version` -> `0.1.0`
- `dist-tags.latest` -> `0.1.0`
- `bin` -> `{ "sdtk-code": "bin/sdtk-code.js" }`

## 6. Isolated Install Verification

Registry-installed package verification passed from an isolated npm prefix.

Command pattern used:

```powershell
npm install -g sdtk-code-kit@0.1.0 --prefix <tempPrefix>
<tempPrefix>\sdtk-code.cmd --version
<tempPrefix>\sdtk-code.cmd --help
```

Observed results:
- install from registry -> PASS
- `sdtk-code --version` -> `sdtk-code-kit 0.1.0`
- `sdtk-code --help` -> PASS

## 7. Bounded Smoke Results

All bounded smoke checks passed from the registry-installed package:

- `sdtk-code --version` -> PASS
- `sdtk-code --help` -> PASS
- Claude `init --runtime claude --skip-runtime-assets` -> PASS
- Claude `runtime install` -> PASS
- Claude `runtime status` -> PASS
- Claude `runtime uninstall` -> PASS
- Codex `init --runtime codex --skip-runtime-assets` -> PASS
- Codex `runtime install` -> PASS
- Codex `runtime status` -> PASS
- Codex `runtime uninstall` -> PASS
- Codex project-scope rejection (`init --runtime codex --runtime-scope project`) -> PASS, correctly blocked
- bounded `sdtk-code start` with formal handoff -> PASS
  - observed intake truth:
    - `Intake: formal SDTK-SPEC handoff`
    - `Outcome: READY_FOR_PLAN`

Successful bounded workflow smoke temp root:
- `C:\Users\nerot\AppData\Local\Temp\sdtk-code-public-smoke-86bae055b6a84b579c2a6445e7aeec57`

## 8. Findings

1. Low: first-publish `npm view sdtk-code-kit ...` returned `404 Not Found` before publish. That was expected and did not block the release.
   - Package root: [package.json](D:/DucTN/Source/Sdkit/products/sdtk-code/distribution/sdtk-code-kit/package.json)
2. Low: npm emitted publish-time normalization warnings for `bin[sdtk-code]` and `repository.url`, but publish still succeeded and registry truth is correct.
   - Package root: [package.json](D:/DucTN/Source/Sdkit/products/sdtk-code/distribution/sdtk-code-kit/package.json)
3. Low: the first isolated workflow smoke initially failed because PowerShell `Set-Content -Encoding utf8` wrote a BOM into a temporary handoff JSON file.
   - This was a test harness issue, not a product bug.
   - The verification passed after rewriting the temporary JSON without BOM.

## 9. Final Public Install Truth

End-user install command:

```powershell
npm install -g sdtk-code-kit@0.1.0
```

End-user verification:

```powershell
sdtk-code --version
sdtk-code --help
```

Boundary truth:
- `sdtk-code-kit` is publicly installable
- canonical command is `sdtk-code`
- real workflow execution still expects upstream `SDTK-SPEC` artifacts
- CI/tag-publish parity remains follow-up hardening, not a blocker for the first public release
