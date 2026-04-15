# SDTKOPS Go-Live Blueprint

## Product Identity

- **Code**: SDTKOPS
- **Name**: Software Development Toolkit - Operations
- **Slug**: sdtk-ops
- **Package**: sdtk-ops-kit
- **Version lookup**: `npm view sdtk-ops-kit version`
- **Brand**: AgentToolkits
- **Tagline**: Operations discipline: deploy, monitor, respond, recover, optimize.
- **Visibility**: public

## Current Rollout Truth

The current go-live claim for this product is narrow and public:
- the public npm package `sdtk-ops-kit` is live
- the package has a real runnable command baseline
- public package verification, registry verification, and isolated install verification are real
- the skill-routing surface is documented and tested
- bounded Step-7 local Docker validation has been proven on the Workflow project
- a corrective patch release fixed the stale help-surface wording discovered after the first public publish

This blueprint does not claim:
- a larger CLI suite than the current help/init/runtime baseline
- cloud, Kubernetes, or production-environment validation

## Same-Wave Closeout Checklist

- [x] runnable CLI baseline implemented
- [x] skills authored and tested
- [x] canonical usage, install, and boundary docs exist
- [x] public package metadata and README aligned
- [x] public publish and patch-release evidence captured
- [x] landing-site, docs-site, and commercial source surfaces aligned
- [x] bounded local Docker validation evidence captured

## Follow-Up Beyond This Wave

- external billing/licensing flow: deferred
- broader deployment-target validation beyond local Docker: deferred
- site deployment verification remains part of the normal website release process, not the package wave itself

## Status

This blueprint is active first-public-release documentation for `SDTK-OPS`.

The bounded public package wave is closed only when source-facing public surfaces stay aligned with the live public package.
