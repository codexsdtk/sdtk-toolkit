---
name: ops-backup
description: Backup and disaster recovery. Use when designing backup strategies, disaster recovery plans, or restore procedures -- covers RTO/RPO definition, backup verification, and cross-region replication.
---

# Ops Backup

## Overview

Backups are only valuable if they can be restored inside the time and data-loss limits the business expects. Define recovery targets first, automate execution, store copies away from the primary failure zone, and test restores on a schedule.

## The Iron Law

```
NO BACKUP STRATEGY IS COMPLETE UNTIL A RESTORE HAS BEEN TESTED
```

## RTO And RPO Framework

- **RTO**
  - recovery time objective
  - how long the service can be unavailable
- **RPO**
  - recovery point objective
  - how much data loss is acceptable

## Service Tiers

| Tier | RPO | RTO | Replication Scope |
|------|-----|-----|-------------------|
| Critical | under 5 min | under 30 min | cross-region |
| Important | under 1 hour | under 4 hours | cross-availability-zone |
| Standard | under 24 hours | under 24 hours | same region |

## Backup Strategies

| Strategy | When To Use | Typical RPO | Storage Cost |
|----------|-------------|-------------|--------------|
| Full | small datasets or periodic baselines | longer | high |
| Incremental | regular backups with storage efficiency | medium | low |
| Differential | simpler restore chain with moderate storage use | medium | medium |
| Continuous replication | critical systems with near-real-time recovery needs | very low | high |

## <HARD-GATE>

Do not claim backup coverage until all are true:
- execution is automated
- backup data is encrypted at rest with GPG, KMS, or equivalent
- an off-site copy exists in a different region or failure domain
- retention and cleanup are enforced automatically
- restore testing happens at least quarterly with documented results
- monitoring alerts fire on backup failure

## Monthly Restore Drill

Run this procedure:
1. select a recent backup at random
2. restore it into an isolated environment
3. verify data integrity
4. verify the application can use the restored data
5. record total restore time and any issues
6. update the runbook if the drill exposed gaps

## Disaster Recovery Plan Template

| Component | Primary Region | DR Region | Failover Method | RTO |
|-----------|----------------|-----------|-----------------|-----|
| api | primary-a | secondary-a | redeploy from immutable artifact | 30 min |
| database | primary-a | secondary-a | replica promote or restore | 30 min |
| object storage | primary-a | secondary-a | replicated bucket failover | 60 min |

## Script Patterns

Use `./references/backup-script-patterns.md` for backup, encryption, verification, upload, and retention patterns. Treat provider-specific storage commands as replaceable implementation details.

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Never test restores | Teams discover backup gaps during the outage |
| Keep backup copies in the same failure domain | Regional or account-level failure destroys recovery path |
| Skip encryption | Backup media becomes a security incident |
| No retention policy | Storage grows without limit and old data stays forever |
| Manual backup execution | The process fails precisely when people are busiest |

## Execution Handoff

After backup design is approved:
- implement storage and retention changes through `ops-infra-plan`
- validate restore evidence with `ops-verify`
- use `ops-monitor` so backup failures page the right team
