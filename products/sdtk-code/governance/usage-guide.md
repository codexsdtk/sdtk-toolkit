# SDTK-CODE Usage Guide Redirect

Last Updated: 2026-03-23
Owner: SDTK Core Team

## Document Role
This file is now a thin redirect/reference stub.

It no longer acts as the canonical install and usage guide for `SDTK-CODE`.

Use this file when you want to:
- find the canonical end-user guide quickly
- confirm the current public package and command truth
- jump to the install runbook or workflow contract docs

## Current Public Truth

- package: `sdtk-code-kit`
- command: `sdtk-code`
- latest published version lookup: `npm view sdtk-code-kit version`
- default user path: workflow-first
- upstream dependency on `SDTK-SPEC` remains required

Workflow-first surface:
- `start`
- `plan`
- `build`
- `verify`
- `ship`

Support commands:
- `init`
- `runtime install`
- `runtime status`
- `runtime uninstall`
- `help`
- `--version`

Not part of the public v1 surface:
- `generate`

## Where To Go

### Canonical end-user guide
Use this for:
- install
- runtime setup
- upstream input requirements
- feature and bugfix lane usage
- troubleshooting
- quick reference

Path:
- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

### Install-truth and smoke appendix
Use this for:
- install smoke
- runtime smoke
- Gate C0 checks
- payload truth

Path:
- `products/sdtk-code/governance/installation-runbook.md`

### npm package landing page
Use this for:
- package install command
- short package-facing quick start
- concise boundary truth

Path:
- `products/sdtk-code/distribution/sdtk-code-kit/README.md`

### Architecture and boundary doc
Use this for:
- product role in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family
- workflow-layer vs specialist-engine model
- lane and artifact boundary

Path:
- `products/sdtk-code/toolkit/SDTKCODE_TOOLKIT.md`

### Workflow contract docs
Use these for:
- legal workflow transitions
- routing truth
- state and artifact rules

Paths:
- `products/sdtk-code/governance/workflow-contract.md`
- `products/sdtk-code/governance/workflow-routing-matrix.md`
- `products/sdtk-code/governance/workflow-state-model.md`
