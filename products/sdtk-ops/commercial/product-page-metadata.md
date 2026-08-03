# SDTKOPS Product Page Metadata

## Product Identity

| Field | Value |
|-------|-------|
| Code | SDTKOPS |
| Name | Software Development Toolkit - Operations |
| Slug | sdtk-ops |
| Package | sdtk-ops-kit |
| Version lookup | `npm view sdtk-ops-kit version` |
| Brand | AgentToolkits |
| Tagline | Operations discipline: deploy, monitor, respond, recover, optimize. |
| Visibility | public |
| Status | first_public_release |

## Public Product Truth

Canonical install model:
- `npm install -g sdtk-ops-kit`

Canonical command:
- `sdtk-ops`

Current truthful CLI baseline:
- `help`
- `init`
- `runtime install`
- `runtime status`
- `runtime uninstall`

Boundary notes:
- `SDTK-OPS` is a public downstream operations product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family
- the canonical end-user guide is `products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`
- describe `sdtk-ops-kit` as the public npm package
- do not imply new CLI commands, provider packs, Kubernetes coverage, or cloud deployment support

## Machine-Readable Source

The canonical machine-readable metadata is in `agenttoolkits.product.json` at the product root. Product pages should derive content from that JSON file to avoid drift.

## Page Sections

When this product is represented in internal catalog or family-site metadata, it should include:
1. **Hero**: Tagline + public package boundary
2. **Features**: Domain summary + canonical journey framing
3. **Runtime Matrix**: Claude/Codex support table
4. **Quick Start**: `sdtk-ops init` plus skill-driven journey selection
5. **Documentation**: Links to usage guide, installation runbook, package README, and release docs

## Status

This metadata is active public product-page truth for `SDTK-OPS`.

It does not claim:
- a larger CLI suite than the current help/init/runtime baseline
- provider-specific pack support
- cloud, Kubernetes, or production-topology validation
