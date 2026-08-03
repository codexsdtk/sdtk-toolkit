# Software Development Toolkit - Operations (SDTK-OPS)

## Document Role
This file is the architecture and product-boundary document for `SDTK-OPS`.

Use this file to understand:
- how `SDTK-OPS` fits inside the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family
- what the current skill-driven entry model owns
- which journeys are canonical in the current wave
- what stays outside `SDTK-OPS` scope

Do not use this file as the primary install or onboarding guide.

Canonical end-user guide:
- `products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`

## 1. Overview

`SDTK-OPS` is the operations-process product in the `SDTK-SPEC -> SDTK-CODE -> SDTK-OPS` family.

It is not a workflow-first CLI like `SDTK-CODE`.

The truthful current CLI surface is:
- `sdtk-ops help`
- `sdtk-ops init`
- `sdtk-ops runtime install`
- `sdtk-ops runtime status`
- `sdtk-ops runtime uninstall`

The current public package is:
- `sdtk-ops-kit`
- CLI command: `sdtk-ops`
- Latest published version lookup: `npm view sdtk-ops-kit version`

The truthful current operational surface after `init` is skill-driven:
- the 15 `ops-*` skills remain the real operating surface
- `ops-discover` remains a skill, not a CLI command
- `ops-verify` remains the required closing skill for every canonical journey
- `generate` remains unsupported and deferred

## 2. Boundary With SDTK-SPEC And SDTK-CODE

`SDTK-SPEC` is upstream and remains the docs-first specification and handoff system.

`SDTK-SPEC` owns:
- specification and handoff generation
- PM, BA, ARCH, DEV, and QA orchestration
- upstream workflow contracts and design artifacts

`SDTK-CODE` owns:
- coding-process execution after handoff
- workflow-first build, verify, and closeout discipline
- implementation evidence for the coded slice

`SDTK-OPS` owns:
- operational planning and deployment discipline
- environment/runtime validation
- monitoring, incident response, and backup or recovery execution
- infrastructure security, compliance, and cost work when those are the active concern

`SDTK-OPS` does not own:
- upstream requirements or architecture generation
- coding workflow execution
- provider-specific platform packs in the current wave
- broader launch marketing claims beyond the current public package

## 3. DEV-Run Intake Contract

`DEV-Run` is executed via `SDTK-OPS`.

When `DEV-Run` begins from coded scope, the only canonical `CODE -> OPS` bridge artifact is:
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`

`SDTK-OPS` reads that frozen contract as input.
It does not redefine the schema, rename fields, move the file, or silently normalize producer output into a different contract.

Ready-path intake rules:
- inspect `handoff_status` first
- if `handoff_status` is `READY_FOR_SDTK_OPS`, start with `suggested_next_ops_path.start_with` unless fresh evidence requires a bounded reroute
- treat `suggested_next_ops_path.suggested_chain` as the default first routing sequence
- close with `suggested_next_ops_path.close_with`, which should normally be `ops-verify`

Blocked-path intake rules:
- if `handoff_status` is `BLOCKED_FOR_SDTK_OPS`, the handoff is still inspectable
- inspect `open_blockers`, `code_evidence_refs`, and the prerequisite fields before choosing any action
- do not treat blocked handoff state as normal ready-path execution
- use `ops-discover` to select bounded triage or clarification only when blocker text supports that path

Bounded OPS evidence expectations in this wave:
- record the consumed handoff path and `handoff_status`
- record the selected first OPS step and whether it followed or overrode `suggested_next_ops_path`
- record checked prerequisites, assumptions, dependencies, observability requirements, and rollback or recovery expectations
- record journey-specific operational evidence for the scoped OPS work
- record final `ops-verify` closeout evidence

This wave does not define a final OPS evidence schema and does not implement QA bridge logic.

## 4. Entry And Routing Model

After `sdtk-ops init`, choose a journey directly when the goal is clear.

If the correct path is unclear:
- start with `ops-discover`

Always:
- close every canonical journey with `ops-verify`
- keep `generate` out of the documented command path

| Journey | Start With | Suggested Chain | Close With |
|---------|------------|-----------------|------------|
| Deployment | `ops-plan` | `ops-plan` -> `ops-infra-plan` -> `ops-container` -> `ops-ci-cd` -> `ops-deploy` -> `ops-monitor` | `ops-verify` |
| Incident | `ops-incident` | `ops-incident` -> `ops-debug` -> `ops-deploy` if a change or rollback is required -> `ops-monitor` | `ops-verify` |
| Monitoring | `ops-plan` | `ops-plan` -> `ops-monitor` | `ops-verify` |
| Backup or recovery | `ops-plan` | `ops-plan` -> `ops-backup` | `ops-verify` |

Other valid but non-primary routed skills in this wave:
- `ops-security-infra`
- `ops-compliance`
- `ops-cost`
- `ops-parallel`

## 5. Skill Catalog

### 5.1 Core Process

| Skill | Purpose |
|-------|---------|
| `ops-verify` | verify commands, state, and evidence before declaring work complete |
| `ops-debug` | diagnose operational failures systematically and trace root cause |
| `ops-plan` | write reviewable operational plans with rollback and verification steps |
| `ops-parallel` | split truly independent operations tasks into parallel workstreams |

### 5.2 Deployment

| Skill | Purpose |
|-------|---------|
| `ops-infra-plan` | design infrastructure architecture and provisioning order before apply |
| `ops-deploy` | execute deployments with health gates, rollout strategy, and rollback discipline |
| `ops-container` | define secure image build and container orchestration patterns |
| `ops-ci-cd` | build and manage pipelines, promotion flow, artifact handling, and secret controls |

### 5.3 Operations

| Skill | Purpose |
|-------|---------|
| `ops-monitor` | define SLOs, alerts, dashboards, logs, and traces |
| `ops-incident` | coordinate incident response, stabilization, and post-mortem follow-up |
| `ops-backup` | design backup, restore, and disaster recovery procedures |
| `ops-cost` | review spend, identify waste, and plan safe right-sizing |

### 5.4 Security And Compliance

| Skill | Purpose |
|-------|---------|
| `ops-security-infra` | harden infrastructure, secrets, network policy, and security scanning |
| `ops-compliance` | automate audit readiness, evidence collection, retention, and policy enforcement |

### 5.5 Discovery

| Skill | Purpose |
|-------|---------|
| `ops-discover` | choose the correct SDTK-OPS entry point and sequencing |

## 6. Runtime Truth

### Claude
- supports project and user scope
- default scope is project
- uses the `ops-*` runtime payload after install

### Codex
- defaults to user scope
- default scope is user
- uses collision-avoiding `sdtk-ops-*` skill directory names
- supports project-local installs only through the explicit local `CODEX_HOME=<project>/.codex` contract
- native `.codex/skills` auto-discovery is not claimed

## 7. Documentation Map

Use these documents by role:

- Canonical end-user install and usage guide:
  - `products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`
- Install-truth and smoke appendix:
  - `products/sdtk-ops/governance/installation-runbook.md`
- Workflow-entry and reference stub:
  - `products/sdtk-ops/governance/usage-guide.md`
- Package landing page:
  - `products/sdtk-ops/distribution/sdtk-ops-kit/README.md`
- Runtime routing inventory:
  - `products/sdtk-ops/toolkit/AGENTS.md`
- Release docs:
  - `products/sdtk-ops/governance/release-packaging.md`
  - `products/sdtk-ops/governance/release-evidence.md`

## 8. Scope

`SDTK-OPS` v1 contains 15 core skills and stays cloud-agnostic.

Not part of the current supported wave:
- provider-specific packs such as AWS, GCP, or Azure variants
- a workflow-first CLI command suite such as `sdtk-ops deploy`
- cloud, Kubernetes, or production-topology guarantees beyond the current validated local Docker proof
