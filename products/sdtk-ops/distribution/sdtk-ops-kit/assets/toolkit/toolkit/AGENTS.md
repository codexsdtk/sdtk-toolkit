# SDTK-OPS -- Operations Discipline Toolkit

Purpose: use SDTK-OPS to drive disciplined infrastructure and operations work across planning, deployment, monitoring, incident response, recovery, security hardening, and cost optimization.

Canonical end-user guide:
- `products/sdtk-ops/governance/SDTKOPS_TOOLKIT_USAGE_GUIDE.md`

Document role:
- runtime routing and skill-catalog truth after `sdtk-ops init`
- not the primary install or onboarding guide

## Default Rules

- If the correct entry point is unclear, start with `ops-discover`.
- Use `ops-verify` before marking any operational task complete.
- Use `ops-debug` for evidence-first diagnosis before proposing speculative fixes.
- Use `ops-parallel` only for truly independent slices. If collab or subagent dispatch is unavailable in the active runtime, keep the same slice boundaries but execute them sequentially in one controller session.
- Keep guidance cloud-agnostic unless the task explicitly requires a platform-specific example.
- Do not drift into application specification or coding workflows. Those belong to SDTK-SPEC or SDTK-CODE.
- `ops-discover` is a skill, not a CLI command.
- `generate` remains unsupported and deferred in the current SDTK-OPS CLI surface.

## DEV-Run Intake

When `DEV-Run` begins from `SDTK-CODE`, the only canonical bridge artifact is:
- `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`

Treat that file as the frozen suite contract input.
`SDTK-OPS` consumes it, but does not redefine the schema, rename fields, or move the canonical path.

Ready-path intake:
- inspect `handoff_status` first
- if status is `READY_FOR_SDTK_OPS`, default to `suggested_next_ops_path.start_with`
- treat `suggested_next_ops_path.suggested_chain` as the default route unless fresh evidence requires a bounded reroute
- close with `suggested_next_ops_path.close_with`, which should normally be `ops-verify`

Blocked-path intake:
- if status is `BLOCKED_FOR_SDTK_OPS`, the handoff is still inspectable
- inspect `open_blockers`, `code_evidence_refs`, and prerequisite fields before choosing a next step
- do not treat a blocked handoff as normal ready-path execution
- use `ops-discover` only to select bounded triage or clarification, not to silently reinterpret blocked scope as deployment-ready

Minimum OPS evidence expectations:
- record the consumed handoff path and `handoff_status`
- record whether the chosen first skill followed or overrode `suggested_next_ops_path`, and why
- record which prerequisites, assumptions, dependencies, observability, and rollback items were checked
- record journey-specific operational evidence for the scoped OPS work
- record final `ops-verify` closeout evidence

## Primary Routing Journeys

| Journey | Start With | Suggested Chain | Close With |
|---------|------------|-----------------|------------|
| Deployment | `ops-plan` | `ops-plan` -> `ops-infra-plan` -> `ops-container` -> `ops-ci-cd` -> `ops-deploy` -> `ops-monitor` | `ops-verify` |
| Incident | `ops-incident` | `ops-incident` -> `ops-debug` -> `ops-deploy` if a change or rollback is required -> `ops-monitor` | `ops-verify` |
| Monitoring | `ops-plan` | `ops-plan` -> `ops-monitor` | `ops-verify` |
| Backup or recovery | `ops-plan` | `ops-plan` -> `ops-backup` | `ops-verify` |

## Other Valid Skills

- `ops-security-infra`, `ops-compliance`, and `ops-cost` remain valid SDTK-OPS skills, but they are not the primary routed journeys in the current wave.
- Use `ops-discover` when the correct boundary between deployment, incident, monitoring, backup or recovery, security, compliance, and cost work is unclear.

## Skill Catalog

| Category | Skill | Trigger Condition |
|----------|-------|-------------------|
| Core Process | `ops-verify` | you need evidence before claiming an operational task is complete |
| Core Process | `ops-debug` | a deployment, service, network, DNS, or runtime issue needs root-cause analysis |
| Core Process | `ops-plan` | the team needs a step-by-step operational change plan |
| Core Process | `ops-parallel` | two or more independent operations tasks can proceed without shared state |
| Deployment | `ops-infra-plan` | you are designing infrastructure, networking, IAM, or resource topology before provisioning |
| Deployment | `ops-deploy` | you are executing a rollout, promotion, cutover, or rollback |
| Deployment | `ops-container` | you are building images, Dockerfiles, manifests, or container runtime patterns |
| Deployment | `ops-ci-cd` | you are setting up or modifying pipelines, artifact flow, or deployment gates |
| Operations | `ops-monitor` | you need SLOs, alerts, dashboards, logs, traces, or observability coverage |
| Operations | `ops-incident` | a production incident is active or incident procedures need to be established |
| Operations | `ops-backup` | backup, restore, disaster recovery, RTO, or RPO design is in scope |
| Operations | `ops-cost` | you are reviewing spend, right-sizing, or budget controls |
| Security And Compliance | `ops-security-infra` | infrastructure hardening, secrets, network policy, or security scanning is the main concern |
| Security And Compliance | `ops-compliance` | audit readiness, evidence collection, retention, or policy enforcement is the main concern |
| Discovery | `ops-discover` | you need help choosing among SDTK-OPS skills or sequencing them |

## Runtime Support

| Runtime | Project Scope | User Scope | Default Scope | Notes |
|---------|:-------------:|:----------:|---------------|-------|
| Claude | true | true | project | project-local toolkit supported |
| Codex | true | true | user | Project-local skill runtime is supported only through the explicit local `CODEX_HOME=<project>/.codex` contract; native `.codex/skills` auto-discovery is not claimed. |

## Verification Policy

Use `ops-verify` before marking any operational task complete, including deployment, incident, monitoring, and backup or recovery journeys.
