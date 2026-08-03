# SDTK-CODE Publishable CLI Implementation Plan

Version: 0.2
Last Updated: 2026-03-23
Owner: SDTK Core Team
Status: Draft

## 0. Locked First-Publish Decisions
These decisions are now frozen for the first public npm release wave of `SDTK-CODE`.

### 0.1 Release model
The first public release should use the same practical maintainer-driven local publish model that was used successfully for `SDTK-SPEC`.

Implications:
- do not block first public release on GitHub Actions tag-publish parity
- CI/tag-based publish parity may remain a follow-up hardening wave
- the first release must still capture release evidence and post-publish verification truth

### 0.2 Public package metadata
The first public release wave must add and verify the public metadata fields required for npm truth:
- `repository`
- `homepage`
- `bugs`
- `publishConfig.access: public`

These fields should remain aligned to the current engineering repo until a later repo-cutover wave changes them intentionally.

### 0.3 First public version
The first public npm release target is:
- `sdtk-code-kit@0.1.0`

Do not bump this version unless a real publish blocker forces a bounded change and the package/docs truth is updated in the same wave.

### 0.4 Public docs flip scope
The first public release wave must update all public install/product-truth surfaces together.

Minimum required surfaces:
- `products/sdtk-code/distribution/sdtk-code-kit/README.md`
- `products/sdtk-code/governance/installation-runbook.md`
- `products/sdtk-code/governance/usage-guide.md`
- active product metadata/commercial visibility files that still claim `internal_only`

Do not publish the package first and defer these truth flips to a later batch.

### 0.5 Standalone install truth
The public package should be installable independently:
- `npm install -g sdtk-code-kit`

But public docs must remain explicit that real workflow execution still expects upstream `SDTK-SPEC` inputs such as:
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `sdtk-spec.config.json`

Do not let public install wording imply that `SDTK-CODE` replaces or absorbs upstream `SDTK-SPEC`.

### 0.6 Minimum public release gate
Before the first public publish, all of these must pass:
- `npm run verify:payload`
- `npm run pack:smoke`
- isolated `npm install -g sdtk-code-kit`
- `sdtk-code --help` from the installed package
- `sdtk-code init` from the installed package
- bounded Claude runtime smoke
- bounded Codex runtime smoke
- bounded workflow smoke from the installed package
- release report and install truth updated

## 1. Goal
Move `SDTK-CODE` from an internally validated toolkit scaffold to a publishable CLI package with the same practical release discipline already used by `SDTK`.

This plan is intentionally narrow:
- no new skill surface
- no new runtime targets beyond Claude and Codex
- no public marketing/docs-site work until CLI and packaging are real
- no overlap with SDTK PM/BA/ARCH/QA artifact generation

## 2. Current State
`SDTK-CODE` already has:
- product skeleton under `products/sdtk-code/`
- 12 core coding-process skills
- boundary contract with `SDTK`
- product metadata and third-party notices
- repo-level structural validation and tests
- working workflow-first command surface for internal and validation use
- real payload verification and pack smoke scripts in the package root

`SDTK-CODE` does not yet have:
- public package metadata completed
- public install/docs truth aligned
- release evidence for a first public npm release
- isolated public-install proof captured as canonical release memory
- GitHub Actions publish parity with `SDTK`

## 3. Product Contract To Freeze Before More Code
Freeze these decisions first:
1. `SDTK-CODE` starts after `SDTK-SPEC` has produced `FEATURE_IMPL_PLAN` and relevant specs.
2. `SDTK-CODE` owns coding workflow only: `start`, `plan`, `build`, `verify`, `ship`, plus runtime/install helpers.
3. Claude and Codex are both supported public runtimes, with Codex project-scope rejection remaining explicit.
4. `generate` is not part of the first public `SDTK-CODE` command surface.
5. Public installability must not weaken or blur the upstream dependency boundary with `SDTK-SPEC`.

## 4. Implementation Phases

### Phase 1 - Lock Public Contract And Metadata Truth
Deliverables:
- frozen first-public command contract
- complete public package metadata
- explicit standalone-install boundary wording

Required work:
1. Freeze the first-public command surface in docs and package help truth.
2. Add public metadata fields to `products/sdtk-code/distribution/sdtk-code-kit/package.json`.
3. Lock the first-public version at `0.1.0` unless a real blocker forces a bounded change.
4. State clearly that installed `SDTK-CODE` still expects upstream `SDTK-SPEC` artifacts.

Exit criteria:
- no ambiguous public CLI promise remains in active docs
- public metadata truth is complete
- version and boundary wording are frozen for first release

### Phase 2 - Finish Runtime Installer And Installed-Package Behavior
Deliverables:
- proven installed-package `init` and `runtime` behavior
- installed-package runtime smoke for Claude and Codex

Required work:
1. Verify installed-package `init` behavior for Claude and Codex.
2. Verify installed-package `runtime install|uninstall|status` behavior.
3. Capture Codex project-scope rejection truth from the installed package.
4. Fill any remaining installed-package behavior gaps that block public release.

Exit criteria:
- installed package no longer depends on repository-only assumptions
- runtime commands are proven from the installed package, not only the source tree

### Phase 3 - Finalize Package Payload And Verification Truth
Deliverables:
- verified payload assets
- manifest truth aligned to installed-package behavior
- repeatable package dry-run and pack proof

Required work:
1. Finalize payload sync/manifest generation for the public package.
2. Verify the package still ships only the intended narrow template/runtime surface.
3. Ensure `verify:payload` and `pack:smoke` are the canonical pre-publish checks.
4. Add or update tests that lock this package truth.

Exit criteria:
- payload and manifest truth are reproducible
- `npm pack --dry-run` passes with the exact intended public package contents

### Phase 4 - Flip Public Docs And Product Visibility Truth
Deliverables:
- accurate public install runbook
- accurate public usage guide
- accurate package README
- active product metadata no longer claiming `internal_only`

Required work:
1. Update `products/sdtk-code/distribution/sdtk-code-kit/README.md` to public installable truth.
2. Update `products/sdtk-code/governance/installation-runbook.md` to actual public install steps.
3. Update `products/sdtk-code/governance/usage-guide.md` to actual runtime/workflow usage.
4. Update product metadata/commercial visibility docs that still claim `internal_only`.
5. Keep docs explicit that real workflow execution still expects upstream `SDTK-SPEC` inputs.

Exit criteria:
- active public/product docs no longer contradict package reality
- no current-facing surface still describes `SDTK-CODE` as internal-only

### Phase 5 - Execute First Public Release And Capture Release Memory
Deliverables:
- first public npm release of `sdtk-code-kit@0.1.0`
- isolated install verification evidence
- maintainer runbook and release report for reuse

Required work:
1. Run maintainer-driven local publish from the package root.
2. Verify registry truth after publish.
3. Perform isolated fresh install verification.
4. Run bounded installed-package smoke for `--help`, `init`, runtime truth, and workflow truth.
5. Record the final release memory in reusable governance docs.

Exit criteria:
- maintainer-driven public npm publish succeeds
- npm registry truth is correct
- isolated install verification succeeds from the public package
- release report and install truth are captured for reuse

### Phase 6 - Follow-Up Hardening After First Public Release
Deliverables:
- publish workflow parity plan or implementation
- retry/recovery guidance for future releases
- optional CI/tag-publish parity

Required work:
1. Decide whether to keep maintainer-driven local publish as the only release path or add CI/tag-publish parity.
2. Add failed-publish recovery guidance comparable to `SDTK-SPEC`.
3. Optionally add GitHub Actions publish parity after first public release is already proven.

Exit criteria:
- future release operations are simpler and better documented
- first public release no longer depends on rediscovering the flow

## 5. Recommended Order
Run the work in this exact order:
1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6

Do not open docs-site or marketing-facing expansion before Phase 4 is complete. Public install truth must be stable before broader outward-facing expansion.

## 6. Acceptance Gates Before First Publish
`SDTK-CODE` is publishable only when all gates below are true:
- no scaffold command stubs remain in the shipped package
- installer performs real runtime installation from the installed package
- payload assets and manifest are real and reproducible
- Claude runtime smoke passes from the installed package
- Codex runtime smoke passes from the installed package with documented fallback behavior where needed
- public metadata fields are complete and truthful
- package README, installation runbook, and usage guide are aligned to public install truth
- standalone install wording is honest about the upstream `SDTK-SPEC` dependency boundary
- release package verifies locally
- `npm pack --dry-run` succeeds
- maintainer-driven publish succeeds to npm
- isolated fresh install succeeds from the public package
- release report and install truth are captured for reuse

## 7. Immediate Next Batch Recommendation
The next planning/implementation batch should be:
- Phase 1 only

Reason:
- metadata truth, release model, and public boundary wording must be frozen before touching the first public release mechanics
- this keeps `Codex Code dev` from drifting into publish execution before the package truth and public docs surfaces are explicitly locked
