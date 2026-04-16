---
name: ops-infra-plan
description: Infrastructure architecture planning. Use when designing cloud resources, networking, security groups, IAM policies, or IaC modules -- produces a reviewable infrastructure plan before provisioning.
---

# Ops Infra Plan

## Overview

Provisioning without a reviewed design creates hidden coupling, rollback gaps, and security drift. Write the infrastructure plan first, make the dependencies explicit, then provision only what the approved plan covers.

## The Iron Law

```
NO INFRASTRUCTURE PROVISIONING WITHOUT A REVIEWED PLAN
```

## When to Use

Use for:
- new service or environment setup
- network topology changes
- security group, firewall, or IAM changes
- database, cache, queue, or storage provisioning
- scaling architecture updates
- disaster recovery design

## Required Plan Sections

Every infrastructure plan must include:
- **Architecture Diagram (ASCII)**
  - show traffic entry, workload tier, stateful dependencies, and operator control points
- **Resource Inventory**
  - resource name, purpose, environment, owner, critical dependency
- **Networking Design**
  - ingress and egress paths, DNS, load balancing, private connectivity, access boundaries
- **Security Design**
  - identities, secrets flow, encryption posture, least-privilege access, audit boundaries
- **Capacity Estimates**
  - CPU, memory, storage, throughput, and auto-scaling limits
- **Multi-Environment Strategy**
  - dev, staging, and production separation with configuration and data isolation notes
- **Rollback Plan**
  - rollback trigger, exact rollback action, verification evidence, and decision owner
- **Dependency Order**
  - what must exist before provisioning the next layer

## ASCII Diagram Pattern

Use an explicit diagram even for small changes:

```text
Internet
  |
DNS -> Load Balancer
          |
       App Service
          |
   Database / Cache / Queue
          |
  Backups / Logs / Metrics
```

If a system boundary or dependency matters during rollout, it belongs in the diagram.

## Resource Inventory Template

Use a table like this:

| Resource | Purpose | Environment | Owner | Depends On |
|----------|---------|-------------|-------|------------|
| app-lb | Public traffic entry | production | ops | DNS, TLS cert |
| app-service | Stateless workload | production | ops | image, secrets, DB |
| app-db | Primary relational store | production | ops | subnet, backup policy |

## IaC Patterns

Prefer reusable modules and explicit inputs over hand-built resources. Common patterns:
- network foundation first: VPC or equivalent, subnets, routes, security boundaries
- stateless compute behind a load balancer with health checks and auto-scaling
- stateful services with backup, encryption, and maintenance windows defined up front
- alarms and dashboards defined in the same plan as the resource they guard
- environment-specific values separated from reusable module logic

Use `./references/iac-patterns.md` for concrete Terraform-style examples.

## Review Checklist

Review the plan for:
- naming consistency across resources, modules, and environments
- security groups or firewall rules scoped to least privilege
- encryption at rest and in transit
- backup schedule and restore ownership
- observability coverage for each critical resource
- cost estimate, scaling bounds, and obvious waste
- rollback path that works after partial apply

## <HARD-GATE>

Do not provision until all four are true:
- written plan exists and matches the intended scope
- resource inventory is complete
- rollback procedure exists for the first failed step and for partial apply
- security review covers network access, identities, secrets, and encryption

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Provision first, document later | The live system becomes the only source of truth |
| Copy production config into dev | Cost, permissions, and blast radius drift immediately |
| Hardcode IPs, hostnames, or secrets | Reuse fails and rotation becomes dangerous |
| Plan resources without capacity notes | Scaling and cost failures surface during rollout |
| Skip rollback because IaC is "reversible" | Partial apply and data changes still need explicit recovery |

## Execution Handoff

After the plan is approved:
- provision in dependency order
- verify each applied layer before moving forward
- use `ops-verify` before marking any provisioning step complete
