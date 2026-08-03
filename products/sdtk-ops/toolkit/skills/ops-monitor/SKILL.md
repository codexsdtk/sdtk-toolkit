---
name: ops-monitor
description: Observability and monitoring setup. Use when designing monitoring, defining SLOs/SLIs, configuring alerts, or building dashboards -- covers the three pillars of observability and Golden Signals framework.
---

# Ops Monitor

## Overview

Monitoring exists to detect user-impacting problems early, explain what is happening, and guide a safe response. A service is not production-ready until metrics, logs, traces, alerts, and response expectations are all defined together.

## The Iron Law

```
NO SERVICE IN PRODUCTION WITHOUT MONITORING AND ALERTING
```

## When to Use

Use for:
- new production services
- dashboard and alert design
- SLO and SLI definition
- noisy alert cleanup
- monitoring gaps discovered during incidents

## The Three Pillars

| Pillar | Purpose | Key Question |
|--------|---------|--------------|
| Metrics | trends, alerting, SLO tracking | Is the system healthy over time? |
| Logs | event details, audit trail, debugging context | What happened at a specific time? |
| Traces | request flow across services | Where is the latency or failure path? |

## Golden Signals

| Signal | What To Measure | Example Metrics |
|--------|-----------------|-----------------|
| Latency | request duration for successful and failed work | `http_request_duration_seconds_bucket`, `grpc_server_handling_seconds_bucket` |
| Traffic | request volume or work rate | `http_requests_total`, `rpc_requests_total`, queue throughput |
| Errors | failure rate by type and severity | `http_requests_total{status=~"5.."}`, timeout counters, business error counters |
| Saturation | how close the system is to a limit | CPU, memory, queue depth, disk, connection pool usage |

## SLO And SLI Framework

Define:
- **SLI**
  - what you measure for user-visible behavior
  - examples: availability, latency, correctness
- **SLO**
  - the target and window for that SLI
  - examples: `99.95% availability over 30d`, `99% of requests under 300ms over 30d`

Use `./references/slo-templates.md` for YAML templates that combine availability, latency, correctness, burn-rate alerts, and error-budget policy.

## Error Budget Policy

Use a simple decision policy:
- budget remaining above 50%: normal development
- budget remaining 25% to 50%: reliability review before risky changes
- budget remaining below 25%: prioritize reliability work
- budget exhausted: freeze non-critical deploys until reviewed

## Alert Design

Alerts should:
- page on symptoms, not on every possible internal cause
- link to a runbook for first response
- define at least two severities where appropriate
- be tuned so false positives stay below 15%
- point to the dashboard or query needed for triage

An alert that does not change operator behavior should be removed or rewritten.

## Dashboard Design

| Dashboard | Audience | Required Content |
|-----------|----------|------------------|
| Executive | incident leads, managers | SLO status, error budget, active incidents, high-level trends |
| Service | on-call engineers | Golden Signals, dependency health, deploy markers, recent alerts |
| Debug | responders and service owners | detailed metrics, logs, traces, and breakdowns by instance, region, or endpoint |

## <HARD-GATE>

Before a service is treated as production-ready, all must be true:
- SLIs are defined for user-visible behavior
- SLOs are set with explicit targets and windows
- burn-rate alerts are configured
- a Golden Signals dashboard exists
- the on-call team knows which alerts fire and what they mean

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Alert on every low-level cause | Operators get noise instead of signal |
| Track uptime only | User-visible latency and correctness failures are missed |
| Dashboard with no SLO context | Teams see metrics but not reliability risk |
| No runbook links in alerts | Response time expands during real incidents |
| Collect logs and traces without correlation keys | Cross-system debugging stays slow and manual |

## Execution Handoff

After monitoring is defined:
- validate alerts with a controlled test or drill
- route incident handling through `ops-incident`
- use `ops-debug` for root-cause investigation
- use `ops-verify` before claiming monitoring coverage is complete
