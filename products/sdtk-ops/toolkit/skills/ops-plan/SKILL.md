---
name: ops-plan
description: Infrastructure and operations planning. Use when planning infrastructure changes, deployment strategies, or operational procedures before execution -- numbered steps, dependency ordering, rollback strategy per step.
---

# Ops Plan

## Overview

Write infrastructure and operations plans assuming the implementer has zero context for the system, environment, or operational history. Document exactly what changes, in what order, how to verify each step, and how to roll it back safely.

Keep the plan reviewable, explicit, and small enough to execute without improvisation.

## Scope Check

If the request covers multiple independent systems, environments, or operational initiatives, suggest splitting it into separate plans. One plan should produce one coherent, reviewable operational outcome.

Challenge scope before planning:
- What already exists that partially solves this?
- What is the minimum change that achieves the goal safely?
- Which work is required now, and which work can be deferred?

## OPS_HANDOFF Intake Rules

When the work enters `DEV-Run` through `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`, consume the frozen handoff contract as-is.

Read these fields before planning:
- `handoff_status`
- `scope_slices`
- `code_evidence_refs`
- `deployment_prerequisites`
- `environment_assumptions`
- `infra_runtime_dependencies`
- `observability_requirements`
- `rollback_recovery_expectations`
- `open_blockers`
- `suggested_next_ops_path`

Planning rules:
- if `handoff_status` is `READY_FOR_SDTK_OPS`, the first planned step should normally align to `suggested_next_ops_path.start_with`
- if `handoff_status` is `BLOCKED_FOR_SDTK_OPS`, do not write a normal ready-path execution plan
- a blocked handoff may still receive a bounded triage or clarification plan, but that plan must keep the blocker state explicit
- do not redefine field names, rename the artifact, or patch the handoff schema downstream

## File Structure And Affected Systems

Before defining tasks, map out what will be created or modified and what each item owns.

Include:
- manifests, IaC modules, runbooks, scripts, or policy files
- affected services, environments, regions, or accounts
- external dependencies such as DNS, secrets, CI/CD, or databases

Lock in decomposition here. Each task should have one clear operational responsibility.

## Bite-Sized Task Granularity

Each step should be one operational action that can be verified independently.

Examples:
- update one manifest or values file
- validate one configuration change
- apply one change to staging
- verify one health gate
- record one rollback checkpoint

Do not write giant plan steps like "deploy all infrastructure" or "complete migration".

## Plan Document Header

Every plan MUST start with this header:

```markdown
# [Change Name] Operations Plan

> For implementers: execute steps in order. Do not mark any step complete until `ops-verify` confirms the expected evidence.

**Goal:** [One sentence describing what this change achieves]

**Architecture:** [2-3 sentences about the approach]

**Affected Systems:** [Services, environments, accounts, regions, pipelines]

**Rollback Strategy:** [One sentence summary of rollback posture]

**Risk Level:** [LOW | MEDIUM | HIGH]

---
```

## Required Sections For Infrastructure Plans

Every infrastructure plan must include:
- **Resource Sizing**
  - CPU, memory, storage estimates
  - auto-scaling boundaries
- **Networking**
  - DNS changes
  - ingress or load balancer updates
  - security groups, network policies, firewall rules
- **Security**
  - IAM roles
  - secrets handling
  - network policy or access boundary changes
- **Rollback Checklist per step**
  - use this exact shape:

    | Step | Rollback Action | Verification |
    |------|-----------------|--------------|
    | 1 | Revert manifest to previous revision | Health endpoint returns 200 |

- **Migration Safety**
  - backward compatibility
  - feature flags
  - dual-write, dual-read, or phased rollout needs

## Assumption Tracking

Record assumptions in this exact table format:

| # | Assumption | Verified | Risk if wrong |
|---|------------|----------|---------------|
| A1 | Example assumption | No | Medium |

Do not bury assumptions in prose. If an assumption can break rollout or rollback, it must be tracked explicitly.

## Infrastructure Review Lens

Before approving the plan, check:
- dependency order across systems and environments
- blast radius if one step fails
- rollback feasibility after each step
- health checks, smoke checks, and stability windows
- happy path, no-op path, failure path, and rollback path
- observability coverage during and after the change
- operator-visible evidence for each important milestone

## Task Structure

Use this shape for each task:

````markdown
### Task N: [Change Slice]

**Files / Systems:**
- Modify: `exact/path/to/file`
- Environment: `staging|production|shared`
- Verify: `exact command or evidence`

**Rollback Checklist:**

| Step | Rollback Action | Verification |
|------|-----------------|--------------|
| N | [Exact rollback action] | [Exact evidence] |

- [ ] **Step 1: Prepare the change**
  - update the target manifest, script, or runbook

- [ ] **Step 2: Validate locally or in dry-run mode**
  - run the exact validation command

- [ ] **Step 3: Apply to the target environment**
  - perform one bounded operational change

- [ ] **Step 4: Verify expected state**
  - record the exact health or status evidence

- [ ] **Step 5: Record rollback checkpoint**
  - confirm the rollback command and previous good state
````

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| "Implement the infrastructure" as one step | No safe checkpoint, no isolated rollback |
| Missing rollback action per task | Recovery becomes guesswork during incidents |
| No resource sizing or network notes | Hidden capacity and connectivity risks surface late |
| Security assumptions left implicit | Secrets, IAM, or access drift breaks rollout |
| Verification only at the end | You lose the exact step where the system broke |
| Migration plan ignores backward compatibility | Deploy succeeds but runtime traffic fails |

## Minimum OPS Evidence Expectations

This wave does not define a final OPS evidence schema, but plans derived from `OPS_HANDOFF` must keep these evidence expectations explicit:
- record the consumed handoff path and `handoff_status`
- record whether the first OPS step followed or overrode `suggested_next_ops_path`, and why
- record which prerequisites, assumptions, dependencies, observability requirements, and rollback or recovery expectations were checked
- record journey-specific operational evidence for the scoped work
- record final `ops-verify` closeout evidence

Do not invent QA bridge fields or a new formal OPS artifact schema in this step.

## Execution Handoff

After saving the plan:
- review assumptions, dependencies, and rollback notes
- use `ops-parallel` only for truly independent slices
- invoke `ops-verify` before marking any step complete

The plan is not complete until the implementer can execute it without guessing.
