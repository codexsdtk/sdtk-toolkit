# SDTKCODE First Public NPM Release Implement Plan

Date: 2026-03-23  
Owner: SDTK Core Team  
Status: Detailed implementation plan  
Purpose: define the first public npm release wave for `sdtk-code-kit@0.1.0` using the already-proven maintainer-driven local publish model used by `SDTK-SPEC`.

## A. Summary

- This wave makes `sdtk-code-kit@0.1.0` publicly installable on npm for the first time.
- The release model is maintainer-driven local publish, not CI/tag-publish parity.
- The package root must gain the missing public npm metadata: `repository`, `homepage`, `bugs`, and `publishConfig.access: public`.
- Public install/docs truth must flip together across package README, installation guide, usage guide, parity/release docs, and active commercial visibility files.
- Public wording must stay honest: `SDTK-CODE` is installable independently, but real workflow execution still expects upstream `SDTK-SPEC` artifacts such as `CODE_HANDOFF`, `FEATURE_IMPL_PLAN`, and `sdtk-spec.config.json`.
- The pre-publish gate must prove installed-package behavior from the packed package, not only from the source tree.
- The post-publish gate must prove registry truth and isolated install truth from npm.
- Release memory must be captured immediately after the first successful publish so future releases do not require rediscovery.
- CI/tag-publish parity is explicitly deferred and is not a blocker for `0.1.0`.
- This wave does not include `sdtk-suite` repo cutover, umbrella package work, or any SDTK-SPEC release work.

## B. Locked Assumptions

- The first public release model is maintainer-driven local publish.
- The first public target version is `sdtk-code-kit@0.1.0`.
- The first public wave must add and verify:
  - `repository`
  - `homepage`
  - `bugs`
  - `publishConfig.access: public`
- Public install/docs truth must flip in the same wave as the first public release.
- Installed-package truth must remain explicit that real workflow execution still expects upstream `SDTK-SPEC` artifacts.
- CI/tag-publish parity is follow-up hardening only.
- Repo URLs/homepage/bugs should remain aligned to the current engineering repo until a later repo-cutover wave changes them intentionally.

## C. Surface Matrix

### 1. Package Metadata

What changes now:
- `products/sdtk-code/distribution/sdtk-code-kit/package.json`
  - add:
    - `"repository": { "type": "git", "url": "https://github.com/codexsdtk/sdtk-toolkit.git", "directory": "products/sdtk-code/distribution/sdtk-code-kit" }`
    - `"homepage": "https://github.com/codexsdtk/sdtk-toolkit/tree/main/products/sdtk-code/distribution/sdtk-code-kit"`
    - `"bugs": { "url": "https://github.com/codexsdtk/sdtk-toolkit/issues" }`
    - `"publishConfig": { "access": "public" }`
- verify existing fields remain correct and unchanged:
  - `name = sdtk-code-kit`
  - `version = 0.1.0`
  - `bin.sdtk-code = ./bin/sdtk-code.js`

What stays unchanged:
- package name
- CLI command name
- version
- payload model
- scripts model other than keeping release smoke truthful

Why:
- npm public truth requires the missing metadata now, but this first release wave must not drift into rename/version work.

### 2. Installed-Package And Runtime Behavior

What changes now:
- no runtime-feature expansion is planned
- installed-package proof must be captured for:
  - `sdtk-code --version`
  - `sdtk-code --help`
  - `sdtk-code init --runtime claude --skip-runtime-assets`
  - `sdtk-code init --runtime codex --skip-runtime-assets`
  - `sdtk-code runtime install --runtime claude --scope project --project-path <tempProject>`
  - `sdtk-code runtime status --runtime claude --project-path <tempProject>`
  - `sdtk-code runtime uninstall --runtime claude --scope project --project-path <tempProject>`
  - `sdtk-code runtime install --runtime codex --scope user`
  - `sdtk-code runtime status --runtime codex`
  - `sdtk-code runtime uninstall --runtime codex --all`
  - Codex project-scope rejection (`init --runtime codex --runtime-scope project`)
  - bounded workflow smoke using real upstream-like inputs from an isolated temp project

What stays unchanged:
- workflow command surface remains:
  - `start`
  - `plan`
  - `build`
  - `verify`
  - `ship`
- `generate` remains outside the v1 `SDTK-CODE` public command surface
- workflow execution still depends on upstream `SDTK-SPEC` artifacts

Why:
- the public release wave must prove that the shipped package behaves correctly without overstating independence from `SDTK-SPEC`.

### 3. Public Docs Truth

What changes now:
- `products/sdtk-code/distribution/sdtk-code-kit/README.md`
  - remove `internal_only` / not-ready wording
  - add real public install command: `npm install -g sdtk-code-kit@0.1.0`
  - keep explicit upstream boundary note
- `products/sdtk-code/governance/installation-runbook.md`
  - rewrite from internal-only install reality to first-public install + smoke reality
- `products/sdtk-code/governance/usage-guide.md`
  - rewrite “internal workflow-first coding package” to first-public workflow package truth
  - keep boundary note that upstream `SDTK-SPEC` artifacts are required
- `products/sdtk-code/governance/release-packaging.md`
  - replace parity/deferred-only framing with actual first-public maintainer-run packaging/publish flow
- `products/sdtk-code/governance/parity-matrix.md`
  - move release/publication gap statements from “not yet” to “first public release achieved, CI parity still pending”

What stays unchanged:
- no docs-site or landing-site work
- no repo-cutover or public-repo wording changes

Why:
- first public release must flip install truth together across all active package-facing and product-facing docs, but this wave is not a marketing/docs-site expansion.

### 4. Product Metadata And Commercial Visibility Truth

What changes now:
- `products/sdtk-code/agenttoolkits.product.json`
  - flip `visibility` away from `internal_only`
  - keep package name `sdtk-code-kit`
  - keep version `0.1.0`
- `products/sdtk-code/commercial/product-page-metadata.md`
  - remove `Visibility | internal_only`
  - remove scaffold wording that contradicts real first public npm installability
- `products/sdtk-code/commercial/multi-toolkit-metadata.md`
  - remove `Visibility | internal_only`
  - change status from scaffold-only visibility to first-public product-catalog truth
- `products/sdtk-code/commercial/go-live-blueprint.md`
  - remove `Visibility: internal_only`
  - keep future infra sections clearly future-facing

What stays unchanged:
- no real public marketing site launch
- no pricing or commerce rollout
- no claim that `SDTK-CODE` is independent of upstream `SDTK-SPEC`

Why:
- active commercial/product metadata must not contradict public npm truth once the first release is live.

### 5. Release Evidence And Release Memory

What changes now:
- create a maintainer-run publish runbook analogous to the SDTK-SPEC memory doc:
  - `governance/quality/SDTKCODE_NPM_AUTH_AND_PUBLISH_RUNBOOK.md`
- create a first-public release report:
  - `products/sdtk-code/governance/SDTKCODE_FIRST_PUBLIC_NPM_RELEASE_REPORT_20260323.md`
- update doc histories in the package README / runbook / usage-guide as part of the public truth flip

What stays unchanged:
- no CI/tag-publish parity doc as a blocker
- no umbrella release program

Why:
- the first public publish must create reusable release memory immediately, the same way `SDTK-SPEC` now has practical publish memory.

## D. Batch Breakdown

### Batch 1. Freeze Public Metadata And Boundary Truth

Goal:
- complete the package metadata fields and lock public install wording without overstating standalone workflow capability.

In-scope files:
- `products/sdtk-code/distribution/sdtk-code-kit/package.json`
- `products/sdtk-code/distribution/sdtk-code-kit/README.md`
- `products/sdtk-code/governance/installation-runbook.md`
- `products/sdtk-code/governance/usage-guide.md`
- `products/sdtk-code/governance/release-packaging.md`
- `products/sdtk-code/governance/parity-matrix.md`
- `products/sdtk-code/agenttoolkits.product.json`
- `products/sdtk-code/commercial/product-page-metadata.md`
- `products/sdtk-code/commercial/multi-toolkit-metadata.md`
- `products/sdtk-code/commercial/go-live-blueprint.md`

Out-of-scope files:
- runtime implementation
- package name/bin/version changes
- npm publish execution

Deliverables:
- complete public npm metadata
- stable first-public install wording
- explicit upstream boundary wording
- no active `internal_only` contradiction on package/product surfaces

Verification:
- JSON parse checks
- targeted docs grep for `internal_only`
- grep for `not ready for public npm release`
- focused package/docs truth tests if needed

Risks:
- public install wording that implies `SDTK-CODE` can replace `SDTK-SPEC`
- partial truth flip where README changes but governance/commercial metadata still says internal-only

Suggested commit boundary:
- one commit for metadata + public docs/commercial truth

### Batch 2. Installed-Package Prepublish Proof

Goal:
- prove the packed package behaves correctly before any npm publish attempt.

In-scope files:
- tests that lock package metadata truth and installed-package smoke where needed
- any bounded release-verification helpers under `products/sdtk-code/governance/` if needed

Out-of-scope files:
- runtime feature expansion
- CI publish automation

Deliverables:
- local prepublish checklist
- isolated tarball install proof for `0.1.0`
- bounded Claude and Codex runtime smoke from installed package
- bounded installed-package runtime helper smoke for the active public command surface
- bounded workflow smoke from installed package using upstream-like handoff inputs

Verification:
- from `products/sdtk-code/distribution/sdtk-code-kit`:
  - `npm run verify:payload`
  - `npm run pack:smoke`
  - `npm pack`
- isolated tarball install with temp `--prefix`
- installed-package checks:
  - `sdtk-code --version`
  - `sdtk-code --help`
  - `sdtk-code init --runtime claude --skip-runtime-assets`
  - `sdtk-code init --runtime codex --skip-runtime-assets`
  - `sdtk-code runtime install --runtime claude --scope project --project-path <tempProject>`
  - `sdtk-code runtime status --runtime claude --project-path <tempProject>`
  - `sdtk-code runtime uninstall --runtime claude --scope project --project-path <tempProject>`
  - `sdtk-code runtime install --runtime codex --scope user`
  - `sdtk-code runtime status --runtime codex`
  - `sdtk-code runtime uninstall --runtime codex --all`
  - `sdtk-code init --runtime codex --runtime-scope project` -> expected fail
  - bounded `sdtk-code start` smoke with upstream inputs present

Risks:
- pack succeeds but isolated install reveals missing payload or path assumptions
- docs claim standalone installability while the installed package still assumes repo-only context

Suggested commit boundary:
- one commit for prepublish smoke/test hardening

### Batch 3. Maintainer-Run Publish And Post-Publish Verification

Goal:
- execute the first public npm publish and prove registry/install truth from the real npm package.

In-scope files:
- no package behavior changes required by default
- release-memory artifacts created after successful publish

Out-of-scope files:
- CI/tag-publish parity
- repo cutover
- umbrella packages

Deliverables:
- `sdtk-code-kit@0.1.0` published publicly to npm
- registry truth proof
- isolated registry install proof
- installed-package runtime helper proof from the registry-installed package
- post-publish bounded smoke evidence

Verification:
- release traceability precondition:
  - Batch 1 and Batch 2 changes are already committed in the engineering repo
  - `git status --short` is clean before `npm publish`
  - the intended release commit SHA is recorded in the release report
- maintainer CLI auth/preflight:
  - `npm ping`
  - `npm whoami`
  - `npm view sdtk-code-kit version`
  - `npm view sdtk-code-kit dist-tags`
  - `npm view sdtk-code-kit bin`
- publish from package root:
  - `cd products/sdtk-code/distribution/sdtk-code-kit`
  - `npm publish`
- post-publish registry truth:
  - `npm view sdtk-code-kit name version dist-tags.latest`
  - `npm view sdtk-code-kit bin`
- isolated install:
  - `npm install -g sdtk-code-kit@0.1.0 --prefix <tempPrefix>`
  - `<tempPrefix>\\sdtk-code.cmd --version`
  - `<tempPrefix>\\sdtk-code.cmd --help`
  - `<tempPrefix>\\sdtk-code.cmd init --runtime claude --skip-runtime-assets`
  - `<tempPrefix>\\sdtk-code.cmd init --runtime codex --skip-runtime-assets`
  - `<tempPrefix>\\sdtk-code.cmd runtime install --runtime claude --scope project --project-path <tempProject>`
  - `<tempPrefix>\\sdtk-code.cmd runtime status --runtime claude --project-path <tempProject>`
  - `<tempPrefix>\\sdtk-code.cmd runtime uninstall --runtime claude --scope project --project-path <tempProject>`
  - `<tempPrefix>\\sdtk-code.cmd runtime install --runtime codex --scope user`
  - `<tempPrefix>\\sdtk-code.cmd runtime status --runtime codex`
  - `<tempPrefix>\\sdtk-code.cmd runtime uninstall --runtime codex --all`
  - bounded workflow smoke

Risks:
- npm auth/token policy issues during first publish
- first-publish `npm view` returning `404 Not Found` being misread as a blocker
- Windows shim path confusion during isolated verification
- publishing from an uncommitted or dirty engineering worktree would weaken release traceability

Suggested commit boundary:
- Batch 1 and Batch 2 must already be committed on the intended release SHA before publish
- the engineering worktree must be clean at publish time
- release-memory docs are committed immediately after successful publish

### Batch 4. Release Memory And Public Truth Closeout

Goal:
- capture the first-public publish memory so future releases do not depend on tribal knowledge.

In-scope files:
- `governance/quality/SDTKCODE_NPM_AUTH_AND_PUBLISH_RUNBOOK.md`
- `products/sdtk-code/governance/SDTKCODE_FIRST_PUBLIC_NPM_RELEASE_REPORT_20260323.md`
- doc history updates in the public-facing package/governance docs touched in Batch 1

Out-of-scope files:
- CI publish workflow parity
- retry automation
- repo cutover

Deliverables:
- actionable maintainer publish runbook
- release report with exact publish/preflight/post-publish evidence
- final install truth frozen in docs

Verification:
- runbook commands reflect the actual successful publish sequence
- release report records:
  - preflight results
  - publish command
  - post-publish registry truth
  - isolated install truth
  - bounded smoke results

Risks:
- successful publish occurs but reusable release memory is not captured the same day

Suggested commit boundary:
- one docs-only closeout commit immediately after successful publish

## E. First-Public Release Gate

`sdtk-code-kit@0.1.0` is ready for first public publish only when all of the following are true:

1. `products/sdtk-code/distribution/sdtk-code-kit/package.json` contains:
   - `repository`
   - `homepage`
   - `bugs`
   - `publishConfig.access: public`
2. Package README, installation runbook, usage guide, release-packaging guide, and parity matrix all reflect first-public install truth.
3. Product/commercial metadata no longer claims `internal_only`.
4. Public install wording is explicit:
   - install is standalone via `npm install -g sdtk-code-kit@0.1.0`
   - real workflow execution still expects upstream `SDTK-SPEC` artifacts
5. `npm run verify:payload` passes.
6. `npm run pack:smoke` passes.
7. local tarball install from `npm pack` succeeds in an isolated temp prefix.
8. installed-package smoke passes for:
   - `sdtk-code --version`
   - `sdtk-code --help`
   - Claude init smoke
   - Claude runtime install/status/uninstall smoke
   - Codex init smoke
   - Codex runtime install/status/uninstall smoke
   - Codex project-scope rejection
   - bounded workflow smoke with upstream-like inputs
9. Batch 1 and Batch 2 truth is already committed in the engineering repo and `git status --short` is clean before publish.
10. npm auth/preflight passes on the maintainer machine.
11. `npm publish` succeeds for `sdtk-code-kit@0.1.0`.
12. post-publish registry truth is correct:
    - package name
    - version
    - `dist-tags.latest`
    - `bin`
13. isolated install from npm registry succeeds, including bounded runtime-helper smoke for Claude and Codex where applicable.
14. release runbook and release report are created the same day as the successful first publish, including the published commit SHA.

## F. Open Questions

None at the planning level. The locked release model, version target, upstream-boundary truth, and first-public metadata requirements are internally consistent enough to implement without reopening product direction.
