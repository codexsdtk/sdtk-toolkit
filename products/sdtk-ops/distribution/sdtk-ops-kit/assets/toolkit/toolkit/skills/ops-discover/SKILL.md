---
name: ops-discover
description: Discover SDTK-OPS skills. Use when starting a conversation or unsure which skill to use -- lists all operations skills with trigger conditions and priority order.
---

# Ops Discover

## Overview

Use this index skill when the request is operational but the correct SDTK-OPS entry point is unclear. Start with the highest-priority foundational skill that matches the situation, then add domain-specific skills only as needed.

## When to Use

Use for:
- the first turn of an operations task
- unclear routing between planning, debugging, deployment, monitoring, or security
- deciding which skill chain should run first

## OPS_HANDOFF Intake

If `DEV-Run` starts from `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`, inspect the handoff before choosing the first skill.

Read these fields first:
- `handoff_status`
- `suggested_next_ops_path`
- `open_blockers`
- `code_evidence_refs`

Routing rules:
- if `handoff_status` is `READY_FOR_SDTK_OPS`, default to `suggested_next_ops_path.start_with`
- treat `suggested_next_ops_path.suggested_chain` as the default chain unless fresh evidence requires a bounded reroute
- if `handoff_status` is `BLOCKED_FOR_SDTK_OPS`, the handoff is still inspectable but not a normal ready-path execution input
- blocked handoffs should route to bounded triage or clarification only; do not silently reinterpret them as deployment-ready

`SDTK-OPS` consumes the frozen handoff contract.
It does not redefine schema fields or invent alternate handoff names or locations.

## Priority Order

Choose in this order:
1. `ops-verify`
2. `ops-debug`
3. `ops-plan` or `ops-infra-plan`
4. the domain-specific skill
5. `ops-parallel`

Use `ops-parallel` only when the work can safely split after the primary skill choice is clear.

## Core Process

| Skill | Trigger Condition |
|-------|-------------------|
| `ops-verify` | you need evidence before claiming an operational task is complete |
| `ops-debug` | a deployment, service, network, DNS, or runtime issue needs root-cause analysis |
| `ops-plan` | the team needs a step-by-step operational change plan |
| `ops-parallel` | two or more independent operations tasks can proceed without shared state |

## Deployment

| Skill | Trigger Condition |
|-------|-------------------|
| `ops-infra-plan` | you are designing infrastructure, networking, IAM, or resource topology before provisioning |
| `ops-deploy` | you are executing a rollout, promotion, cutover, or rollback |
| `ops-container` | you are building images, Dockerfiles, manifests, or container runtime patterns |
| `ops-ci-cd` | you are setting up or modifying pipelines, artifact flow, or deployment gates |

## Operations

| Skill | Trigger Condition |
|-------|-------------------|
| `ops-monitor` | you need SLOs, alerts, dashboards, logs, traces, or observability coverage |
| `ops-incident` | a production incident is active or incident procedures need to be established |
| `ops-backup` | backup, restore, disaster recovery, RTO, or RPO design is in scope |
| `ops-cost` | you are reviewing spend, right-sizing, or budget controls |

## Security And Compliance

| Skill | Trigger Condition |
|-------|-------------------|
| `ops-security-infra` | infrastructure hardening, secrets, network policy, or security scanning is the main concern |
| `ops-compliance` | audit readiness, evidence collection, retention, or policy enforcement is the main concern |

## Discovery

| Skill | Trigger Condition |
|-------|-------------------|
| `ops-discover` | you need help choosing among SDTK-OPS skills or sequencing them |

## Common Workflow Chains

| Situation | Suggested Chain |
|-----------|-----------------|
| READY `OPS_HANDOFF` intake | `suggested_next_ops_path.start_with` -> `suggested_next_ops_path.suggested_chain` -> `ops-verify` |
| BLOCKED `OPS_HANDOFF` intake | inspect `open_blockers` -> bounded triage or clarification -> `ops-verify` only if a legal scoped OPS action actually runs |
| New service rollout | `ops-infra-plan` -> `ops-container` -> `ops-ci-cd` -> `ops-deploy` -> `ops-monitor` -> `ops-verify` |
| Production incident | `ops-incident` -> `ops-debug` -> `ops-deploy` -> `ops-verify` |
| Backup hardening | `ops-backup` -> `ops-infra-plan` -> `ops-monitor` -> `ops-verify` |
| Cost review | `ops-cost` -> `ops-infra-plan` -> `ops-deploy` -> `ops-verify` |
| Security hardening | `ops-security-infra` -> `ops-infra-plan` -> `ops-ci-cd` -> `ops-verify` |

## Red Flags

| Shortcut Or Smell | Correct Skill |
|-------------------|---------------|
| "Looks healthy enough" | `ops-verify` |
| "Try one more quick fix" | `ops-debug` |
| "Provision first and document later" | `ops-infra-plan` |
| "Just push it to production" | `ops-deploy` |
| "We can add the pipeline checks later" | `ops-ci-cd` |
| "No time for alerts right now" | `ops-monitor` |
| "We will write the post-mortem only if leadership asks" | `ops-incident` |
| "Backups exist, so restore testing can wait" | `ops-backup` |
| "We do not know who owns this spend" | `ops-cost` |
| "Secrets in env files are good enough" | `ops-security-infra` |
| "We will gather audit evidence manually at the end of the year" | `ops-compliance` |

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Start with a domain skill before choosing the primary control skill | Planning, debugging, or verification gaps get missed |
| Use `ops-parallel` before clarifying the main workstream | Parallelism amplifies confusion instead of speeding delivery |
| Treat `ops-discover` as the workflow itself | It is the routing layer, not the execution skill |
