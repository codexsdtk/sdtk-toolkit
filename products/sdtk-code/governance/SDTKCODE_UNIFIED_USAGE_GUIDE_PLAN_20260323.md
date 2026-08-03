# SDTK-CODE Unified Usage Guide Plan

Date: 2026-03-23
Status: Drafted for review before implementation.

## Purpose

Create one canonical `SDTK-CODE` usage document that is complete enough for a first-time user to:

1. install `sdtk-code-kit@0.1.0`
2. understand runtime scope truth for Claude and Codex
3. prepare the minimum upstream `SDTK-SPEC` inputs
4. run the workflow-first command path correctly
5. verify the installation and first workflow run

The target style should be similar to:
- `governance/ai/cli/SDTK_TOOLKIT_USAGE_GUIDE.md`

But it must remain product-specific to `SDTK-CODE` and must not blur the upstream/downstream boundary with `SDTK-SPEC`.

## Current Source Documents

Primary active docs today:
- `products/sdtk-code/governance/installation-runbook.md`
- `products/sdtk-code/governance/usage-guide.md`
- `products/sdtk-code/distribution/sdtk-code-kit/README.md`
- `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md`

Supporting truth docs that should remain separate:
- `governance/quality/SDTKCODE_NPM_AUTH_AND_PUBLISH_RUNBOOK.md`
- `products/sdtk-code/governance/SDTKCODE_FIRST_PUBLIC_NPM_RELEASE_REPORT_20260323.md`
- `products/sdtk-code/governance/workflow-contract.md`
- `products/sdtk-code/governance/workflow-routing-matrix.md`
- `products/sdtk-code/governance/workflow-state-model.md`

## Review Findings Driving This Plan

### 1. Public usage truth is split across too many docs

The current install + usage path is fragmented across three user-facing surfaces:
- package README
- installation runbook
- usage guide

That makes first-time onboarding slower and increases drift risk.

Evidence:
- `products/sdtk-code/distribution/sdtk-code-kit/README.md:5`
- `products/sdtk-code/governance/installation-runbook.md:15`
- `products/sdtk-code/governance/usage-guide.md:21`

### 2. `usage-guide.md` is partly a repo-validation guide, not a pure installed-package usage guide

It mixes:
- true user guidance
- source-tree package validation
- repo-root test commands

Evidence:
- `products/sdtk-code/governance/usage-guide.md:132`
- `products/sdtk-code/governance/usage-guide.md:163`
- `products/sdtk-code/governance/usage-guide.md:189`

### 3. Package `README.md` mixes end-user usage with maintainer packaging smoke

That makes the npm-facing doc less focused than it should be.

Evidence:
- `products/sdtk-code/distribution/sdtk-code-kit/README.md:85`
- `products/sdtk-code/distribution/sdtk-code-kit/README.md:101`

### 4. `SDTKCODE_TOOLKIT.md` still carries semi-internal wording for install/public reality

It remains useful as a product-boundary document, but it should not be the place users learn current install behavior.

Evidence:
- `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md:131`
- `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md:162`
- `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md:175`

### 5. No single doc currently gives a clean first-run path from npm install to formal handoff-driven workflow start

The current docs explain the concepts, but they do not yet provide one clean canonical sequence with:
- package install
- runtime init
- minimum upstream inputs
- first `start`
- next commands by lane

Evidence:
- `products/sdtk-code/governance/installation-runbook.md:72`
- `products/sdtk-code/governance/usage-guide.md:77`
- `products/sdtk-code/distribution/sdtk-code-kit/README.md:57`

## Target Canonical Document

Recommended new canonical guide:
- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

Why a new file instead of mutating one current file in place:
- keeps the old docs readable during transition
- allows a clean information architecture modeled after `SDTK_TOOLKIT_USAGE_GUIDE.md`
- avoids overloading `installation-runbook.md` with user education and release-history details

## Target Information Architecture

The unified guide should contain these sections.

### 1. Purpose And Boundary
- what `SDTK-CODE` is
- what it is not
- where it starts in the suite
- explicit dependency on upstream `SDTK-SPEC`

### 2. Prerequisites
- Node version
- PowerShell/runtime expectations
- whether Claude or Codex is being used
- what upstream artifacts must already exist

### 3. Installation
- `npm install -g sdtk-code-kit@0.1.0`
- `sdtk-code --version`
- `sdtk-code --help`
- quick explanation of what install does not do

### 4. Runtime Setup
Split by:
- Claude
- Codex

Must clearly explain:
- supported scopes
- default scope
- Gate C0 for Codex
- what files `init` writes
- what runtime helper commands do

### 5. Required Upstream Inputs
Must show the minimal truthful intake contract:
- preferred: `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- fallback: `FEATURE_IMPL_PLAN` + relevant specs + `sdtk-spec.config.json`
- when fallback is allowed
- when `start` must block

### 6. Quick Start
One short end-user path:
1. install
2. init
3. prepare minimum upstream input
4. run `start`
5. follow next commands

### 7. Workflow-First Usage
- feature lane path
- bugfix lane path
- expected workflow artifact
- what each command does at a high level

### 8. Runtime Helper Commands
- `runtime install`
- `runtime status`
- `runtime uninstall`
- Claude/Codex examples

### 9. Expert Mode
- what it means
- when to use it
- how it differs from workflow-first mode
- no overclaim of extra wrapper CLI surface

### 10. Verification And Troubleshooting
- install smoke
- runtime smoke
- intake-block examples
- Codex project-scope rejection
- common user mistakes

### 11. Quick Reference
Short command table like the SDTK-SPEC guide.

## What Each Existing Doc Should Become

### A. `products/sdtk-code/governance/installation-runbook.md`
Rewrite role:
- install-truth and smoke appendix
- shorter than today
- linked from the unified guide

Keep:
- precise runtime smoke examples
- Gate C0 checks
- package truth table

Remove or shrink:
- broad onboarding narrative
- duplicated workflow explanations

### B. `products/sdtk-code/governance/usage-guide.md`
Rewrite role:
- either replace with the new canonical guide content
- or keep as a thin redirect stub pointing to `SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

Recommended path:
- replace with a thin redirect/reference stub after the new guide lands

### C. `products/sdtk-code/distribution/sdtk-code-kit/README.md`
Rewrite role:
- npm package landing page only
- concise install, command surface, boundary truth, links out

Keep:
- package install command
- concise runtime truth
- concise upstream dependency note

Remove:
- long maintainer packaging smoke block
- detailed repo-relative test commands

### D. `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md`
Rewrite role:
- product architecture/boundary document only
- not an install guide

Keep:
- family positioning
- boundary with `SDTK-SPEC`
- workflow-first vs expert-mode product model

Rewrite:
- internal/narrow/publication wording that no longer matches current public truth
- installation section should point to canonical usage guide, not act as current install doc

## Exact Rewrite Targets By File

### `products/sdtk-code/governance/installation-runbook.md`
Rewrite or add:
- `:15-40` keep as truth summary, tighten wording
- `:42-93` keep as smoke appendix
- add explicit note that this file is a verification runbook, not the main onboarding doc
- remove maintainer-release notes from the user path or move them to the end as maintainer appendix

### `products/sdtk-code/governance/usage-guide.md`
Rewrite heavily:
- `:132-178` move repo-root/package-root test content out of the primary user path
- `:189-198` remove source-tree `node .../bin/sdtk-code.js` examples from the main usage path
- replace with installed-package `sdtk-code ...` examples

### `products/sdtk-code/distribution/sdtk-code-kit/README.md`
Rewrite heavily:
- `:85-116` move maintainer packaging smoke out of the package README
- keep README focused on npm users
- add link to the new canonical usage guide

### `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md`
Rewrite selectively:
- `:131-176` remove wording that implies install/public truth is still mainly internal
- keep architecture/boundary focus
- add explicit pointer to the new canonical usage guide for install/how-to

## Proposed Execution Batches

### Batch 1: Lock Document Roles
Goal:
- decide canonical file roles before rewriting content

Files:
- `products/sdtk-code/governance/usage-guide.md`
- `products/sdtk-code/governance/installation-runbook.md`
- `products/sdtk-code/distribution/sdtk-code-kit/README.md`
- `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md`

Deliverable:
- each file has one clear responsibility

### Batch 2: Create Unified Guide
Goal:
- add `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`
- write the full canonical end-user guide

Deliverable:
- one complete install + usage guide modeled after `SDTK_TOOLKIT_USAGE_GUIDE.md`

### Batch 3: Trim And Redirect Existing Docs
Goal:
- reduce duplication
- link each old doc to the unified guide where appropriate

Deliverable:
- package README = short package landing doc
- installation runbook = smoke/runbook appendix
- usage guide = thin redirect or reduced companion doc
- toolkit doc = architecture/boundary doc

### Batch 4: Verification And Truth Audit
Goal:
- confirm all docs agree on:
  - package name
  - command surface
  - runtime scope truth
  - upstream dependency truth
  - feature/bugfix lane path

Verification:
- `python scripts/ci/docs_lint.py`
- `python scripts/ci/path_check.py`
- grep checks for stale internal/source-tree wording in user-facing docs

## Out Of Scope

- changing `SDTK-CODE` runtime behavior
- changing package version
- changing `SDTK-SPEC` or `SDTK-OPS`
- release automation redesign
- npm publish flow changes

## Recommended Next Step

Do not rewrite all four docs ad hoc.

Next step should be:
1. approve this plan
2. assign a focused doc-only batch to create `SDTKCODE_TOOLKIT_USAGE_GUIDE.md`
3. review the new guide before trimming the older docs
