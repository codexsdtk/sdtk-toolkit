# SDTKCODE Product Page Metadata

## Product Identity

| Field | Value |
|-------|-------|
| Code | SDTKCODE |
| Name | Software Development Toolkit - Code |
| Slug | sdtk-code |
| Package | sdtk-code-kit |
| Version lookup | `npm view sdtk-code-kit version` |
| Brand | AgentToolkits |
| Tagline | Coding process discipline: TDD, debugging, verification, review, and shipping. |
| Visibility | public |
| Status | public npm release |

## Public Package Truth

Canonical install:
- `npm install -g sdtk-code-kit`

Canonical command:
- `sdtk-code`

Boundary note:
- `SDTK-CODE` is publicly installable as a workflow-first coding package
- real workflow execution still expects upstream `SDTK-SPEC` artifacts such as `CODE_HANDOFF`, `FEATURE_IMPL_PLAN`, and `sdtk-spec.config.json`

## Machine-Readable Source

The canonical machine-readable metadata is in `agenttoolkits.product.json` at the product root. Product pages should derive content from that JSON file to avoid drift.

## Page Sections

When this product page is rendered from active metadata, it should include:
1. **Hero**: Tagline + install command
2. **Features**: Domain summary + workflow-first command surface
3. **Runtime Matrix**: Claude/Codex support table
4. **Workflow Boundary**: explicit note that `SDTK-SPEC` remains the upstream handoff producer
5. **Documentation**: Links to usage guide, installation runbook, release packaging, and changelog/reporting artifacts

## Status

This metadata is active public package truth for `sdtk-code-kit`.

It does not claim that:
- a standalone marketing site rollout is complete
- `SDTK-CODE` replaces upstream `SDTK-SPEC`
