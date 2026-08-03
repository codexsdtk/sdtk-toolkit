# SDTK-CODE Parity Matrix

Version: 0.1
Last Updated: 2026-03-20
Owner: SDTK Core Team

## 1. Purpose
This matrix compares the current `SDTK-CODE` product state against the maturity level already achieved by `SDTK-SPEC`.

It also distinguishes between:
- product direction now locked
- workflow/package implementation now exists
- release/publication maturity now exists; broader hardening still remains lighter

## 2. Product Parity vs SDTK
| Area | SDTK | SDTK-CODE current state | Gap level |
|---|---|---|---|
| Toolkit skill content | mature and shipped | 12-skill v1 content exists | Medium |
| Workflow-first product direction | mature docs-first SDLC spine | workflow-first direction is now locked for SDTK-CODE | Medium |
| Workflow contract docs | mature phase contract | workflow contract, state model, and routing matrix now exist | Medium |
| Workflow artifact contract | mature artifact family | `CODE_WORKFLOW_[FEATURE_KEY].md` contract is locked and `CODE_WORKFLOW_TEMPLATE.md` now exists | Medium |
| Workflow CLI commands | implemented and shipped for SDTK phases | `start`, `plan`, `build`, `verify`, and `ship` implemented | Medium |
| Runtime adapter docs | mature for Claude/Codex | runtime truth is documented | Medium |
| CLI `init` | implemented and shipped | implemented for internal use | Medium |
| CLI `runtime` | implemented and shipped | implemented for internal use | Medium |
| Install script | working runtime-aware installer | working internal installer | Medium |
| Payload sync + manifest | working and published | implemented and verified locally; payload intentionally stays narrow and ships `CODE_WORKFLOW_TEMPLATE.md` only from `toolkit/templates/` | Medium |
| Quality gates | mature and release-tested | structural + CLI regression tests exist; workflow tests now cover `start`, `plan`, `build`, `verify`, and `ship` | Medium |
| User docs | mature and synced | public install docs now align to the workflow-first package truth and the upstream `SDTK-SPEC` boundary | Medium |
| Release packaging | proven on npm + GitHub Release | public npm release executed; registry/install proof and maintainer-run release model now exist for `sdtk-code-kit` | Medium |
| Landing/docs-site/commercial surface | present and maintained | active package/commercial metadata now reflects first-public truth; broader public-facing surface remains lighter | Medium |

## 3. Runtime Parity
| Capability | Claude | Codex | Current truth |
|---|:---:|:---:|---|
| Boundary contract docs | Yes | Yes | documented |
| Workflow routing contract docs | Yes | Yes | documented |
| Manual raw skill usage | Yes | Yes | can be evaluated now |
| Project-scope install | Yes | No | implemented and enforced |
| User-scope install | Yes | Yes | implemented |
| Parallel/subagent execution | stronger | sequential fallback only | documented, not runtime-enforced |

## 4. Direction vs Implementation Truth
### Direction now locked
`SDTK-CODE` now has:
- a locked workflow-first product direction
- a locked workflow contract
- a locked workflow state model
- a locked workflow routing matrix
- a locked canonical workflow artifact name:
  - `docs/dev/CODE_WORKFLOW_[FEATURE_KEY].md`

### Still pending implementation
`SDTK-CODE` does not yet have:
- runtime interception for expert-mode deviations; v1 currently uses documentation-only recording
- exhaustive state-machine model coverage beyond the current regression suite

## 5. Current Honest Statement
`SDTK-CODE` currently has:
- a validated product skeleton
- completed v1 skill content
- a working package CLI layer for `init` and `runtime`
- working `start`, `plan`, `build`, `verify`, and `ship` workflow commands
- a working internal runtime installer layer
- payload sync and payload integrity verification
- narrow workflow payload truth:
  - runtime assets
  - `CODE_WORKFLOW_TEMPLATE.md`
- structural and CLI regression tests
- workflow-first governance contracts and routing docs
- public package metadata and package-facing docs truth for `sdtk-code-kit`

`SDTK-CODE` currently does not have:
- CI/tag-publish parity
- broader public website and release-ops hardening
