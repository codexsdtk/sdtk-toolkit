---
name: ops-incident
description: Incident response and management. Use when a production incident occurs or when establishing incident response procedures -- covers severity classification, response coordination, post-mortem facilitation, and on-call design.
---

# Ops Incident

## Overview

Incident response must turn chaos into a structured workflow: classify severity, assign roles, build a timeline, test one hypothesis path at a time, stabilize the system, and capture systemic follow-up before memory fades.

## The Iron Law

```
NO INCIDENT RESOLVED WITHOUT A TIMELINE, IMPACT ASSESSMENT, AND ACTION ITEMS WITHIN 48 HOURS
```

## Severity Classification Matrix

| Level | Name | Criteria | Response Time | Update Cadence | Escalation |
|-------|------|----------|---------------|----------------|------------|
| SEV1 | Critical | full service outage, data loss risk, security breach | under 5 min | every 15 min | leadership immediately |
| SEV2 | Major | degraded service for more than 25% of users, key feature down | under 15 min | every 30 min | engineering manager within 15 min |
| SEV3 | Moderate | minor feature broken, workaround available | under 1 hour | every 2 hours | team lead next standup |
| SEV4 | Low | cosmetic issue, no user impact, tech debt trigger | next business day | daily | backlog triage |

Escalate severity when:
- impact scope doubles
- no root cause is identified after 30 minutes for SEV1 or 2 hours for SEV2
- a paying customer is blocked, minimum SEV2
- any data integrity concern appears, immediate SEV1

## The Four-Phase Process

### 1. Detection And Declaration

- acknowledge the page or signal
- classify severity using the matrix
- declare the incident and open a timeline immediately
- state current impact, suspected scope, and next update time

### 2. Structured Response

Assign roles:
- **Incident Commander**
  - owns timeline, severity, decisions, and cadence
- **Technical Lead**
  - drives diagnosis and remediation with `ops-debug`
- **Scribe**
  - records timestamps, evidence, commands, and decisions
- **Communications Lead**
  - sends stakeholder updates on schedule

Response rules:
- timebox each hypothesis path to 15 minutes before re-evaluating
- fix the bleeding first, then optimize
- keep one source of truth for status and impact

### 3. Resolution And Stabilization

- apply the lowest-risk effective mitigation
- verify recovery through metrics, not by visual guesswork
- monitor for 15 to 30 minutes after recovery
- do not close the incident until the service is stable

### 4. Post-Mortem

- schedule the review within 48 hours
- document impact, timeline, root cause, contributing factors, and action items
- convert learning into runbook, alert, test, or design changes

## <HARD-GATE>

Incident review and post-mortem must stay blameless:
- say "the system allowed this failure mode"
- do not frame the review as "which person caused it"
- protect psychological safety so the real causes are visible

## Operational Metrics

| Metric | Target |
|--------|--------|
| MTTD | under 5 minutes |
| MTTR for SEV1 | under 30 minutes |
| Post-mortems within 48 hours | 100% |
| Action item completion | 90% |
| Repeat incidents | 0 for the same unresolved cause |

## Reference Files

Use:
- `./references/runbook-template.md`
- `./references/postmortem-template.md`
- `./references/communication-templates.md`

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Start fixing before declaring severity and roles | Communication and triage fragment immediately |
| Chase multiple hypotheses at once | The team loses evidence and ownership |
| Close the incident when errors drop briefly | Latent instability returns and the timeline becomes unclear |
| Write a blame document instead of a post-mortem | Systemic fixes are replaced by defensiveness |
| Skip action item ownership and due dates | The same incident class repeats |

## Execution Handoff

During incident response:
- use `ops-debug` for diagnosis
- use `ops-monitor` to confirm recovery against live signals
- use `ops-verify` before declaring the system stable
