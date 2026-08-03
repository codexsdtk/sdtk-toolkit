---
name: ops-deploy
description: Deployment execution. Use when deploying infrastructure changes or application releases to any environment -- covers deployment strategies, health check gates, traffic management, and rollback procedures.
---

# Ops Deploy

## Overview

Deployment is an operational change, not a hopeful push. Every rollout needs a pre-flight baseline, a traffic strategy, explicit health gates, and a rollback procedure that is ready before the first change lands.

## The Iron Law

```
NO DEPLOYMENT WITHOUT HEALTH CHECK GATES AND ROLLBACK PROCEDURE
```

## When to Use

Use for:
- application releases
- infrastructure rollouts that can affect service health
- database-linked releases
- traffic routing changes
- staged promotions between environments

## Pre-Flight Checks

Before starting deployment, confirm:
- target revision or artifact is fixed and identifiable
- target environment is healthy before the change
- rollback access, previous revision, and credentials are available
- deployment window avoids known peak traffic or freeze periods
- required backup or snapshot is complete if stateful systems are involved

## Deployment Strategies

| Strategy | When To Use | Rollback Method | Time To Roll Back |
|----------|-------------|-----------------|-------------------|
| Rolling | low-risk stateless changes with healthy autoscaling | roll back deployment revision or image tag | minutes |
| Blue-Green | high-confidence traffic cutover with fast reversal | switch traffic back to blue | seconds to minutes |
| Canary | risky changes that need live traffic sampling | stop promotion and route all traffic to stable version | seconds to minutes |

## Deployment Execution Flow

Execute in this order:
1. pre-flight baseline
2. deploy to target slice or environment
3. health check gate
4. smoke test for critical user path
5. stability window of 15-30 minutes
6. declare complete or roll back

Do not compress these stages into one command sequence with no pause for evidence.

## <HARD-GATE>

Do not advance to the next stage unless all are true:
- health endpoint returns 200 or equivalent healthy state
- error rate is not materially above baseline
- p95 latency is not materially above baseline
- no crash loops, failed probes, or repeated restarts are present

If any gate fails, stop promotion and execute rollback.

## Database Migration Safety

For releases that touch data shape:
- ship backward-compatible schema first
- deploy code that can run against both old and new shape
- migrate data in a controlled step
- remove old schema only after rollback is no longer needed

Never combine irreversible schema change with first traffic cutover unless a specific rollback path exists and has been reviewed.

## Rollback Procedures

| Strategy | Rollback Trigger | Rollback Action | Verification |
|----------|------------------|-----------------|--------------|
| Rolling | error spike or unhealthy pods | roll back workload revision | old revision healthy and stable |
| Blue-Green | failed smoke test after cutover | repoint traffic to blue | blue health and traffic recovery confirmed |
| Canary | canary metrics outside threshold | stop promotion and restore stable routing | stable slice absorbs full traffic cleanly |

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| No health checks between stages | Bad release reaches more users before anyone notices |
| Skip staging because production is "simple" | Hidden config drift appears at the worst time |
| Deploy during peak traffic | Blast radius increases and rollback gets noisier |
| Combine application deploy and risky schema change | Root cause and rollback path become unclear |
| Declare success immediately after deploy command returns | Runtime failure often appears during warmup and live traffic |

## Completion Discipline

A deployment is complete only after:
- the stability window passes
- rollback remains possible or has been intentionally closed
- the exact evidence is recorded
- `ops-verify` confirms the post-deploy state
