---
name: ops-cost
description: Cloud cost analysis and optimization. Use when reviewing infrastructure costs, right-sizing resources, or implementing cost reduction strategies -- covers cost allocation, tagging, reserved capacity, and budget alerts.
---

# Ops Cost

## Overview

Cost optimization is not a one-time cleanup. It is an operating loop: make spend visible, find waste, right-size safely, buy commitments with evidence, and review the result every month.

## Five-Step Framework

1. **Visibility**
   - tag all resources by owner, environment, service, and cost center
2. **Identify Waste**
   - find unused, idle, or obviously oversized resources
3. **Right-Size**
   - adjust resources based on measured utilization
4. **Reserved Capacity**
   - buy longer commitments only after usage patterns are stable
5. **Continuous Optimization**
   - review, clean up, and compare month over month

## Waste Types

| Waste Type | Detection Rule | Typical Response |
|------------|----------------|------------------|
| Unused resources | CPU below 5% for 14 or more days | delete or stop |
| Over-provisioned resources | CPU or memory below 30% average | downsize after validation |
| Unattached storage | no active attachment or mount | delete after review |
| Old snapshots | beyond retention with no restore purpose | expire automatically |
| Idle load balancers | no meaningful traffic or backend use | consolidate or remove |

## Right-Sizing

Use a 30-day utilization window before changing production sizing:
- review CPU, memory, storage, and throughput
- recommend smaller instance families or lower replica counts where safe
- validate with load testing or staged rollout before changing production

Route structural changes through `ops-infra-plan` and rollout changes through `ops-deploy`.

## Purchase Types

| Purchase Type | Savings | Commitment | Risk |
|---------------|---------|------------|------|
| On-demand | baseline | none | low |
| Spot or preemptible | 60% to 90% | none | high interruption risk |
| 1-year reserved | medium | 1 year | medium |
| 3-year reserved | high | 3 years | higher lock-in risk |
| Savings plan or equivalent | medium to high | usage commitment | medium |

## <HARD-GATE>

Do not call cost management operationally sound until all are true:
- all production resources are tagged
- monthly cost review is documented
- unused resource cleanup runs at least monthly
- budget alerts are configured per account or environment

## Cost Report Template

Use a recurring report with:
- spending by service
- month-over-month comparison
- optimization opportunities
- reserved-capacity recommendations
- action items with owners and due dates

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| No tagging strategy | Costs cannot be assigned or optimized correctly |
| Buy reserved capacity without usage data | Long-term commitment locks in the wrong shape |
| Ignore data transfer costs | Network spend grows outside compute reviews |
| Run one audit and stop | Waste returns as systems change |
| Optimize cost without performance validation | Reliability drops and rollback follows |

## Execution Handoff

After a cost review:
- send architecture changes to `ops-infra-plan`
- deploy right-sizing changes with `ops-deploy`
- confirm savings and service health with `ops-verify`
