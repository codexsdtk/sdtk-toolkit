---
name: ops-compliance
description: Compliance and audit readiness. Use when setting up compliance scanning, audit logging, or preparing evidence for regulatory audits -- covers policy-as-code patterns and evidence collection.
---

# Ops Compliance

## Overview

Compliance automation should make controls testable and evidence easy to retrieve. SDTK-OPS covers the tooling and operational patterns that support compliance work. It does not replace legal interpretation, certification strategy, or third-party auditor management.

## The Iron Law

```
NO AUDIT READINESS WITHOUT IMMUTABLE LOGS AND AUTOMATED EVIDENCE COLLECTION
```

## When to Use

Use for:
- audit logging design
- evidence collection workflows
- policy-as-code adoption
- compliance scanning in CI/CD
- audit readiness reviews before external assessment

## Regulatory Framework Awareness

| Framework | Focus Area | Key Operational Requirements |
|-----------|------------|------------------------------|
| SOC 2 | trust services criteria | access control, change management, logging, availability evidence |
| GDPR | personal data handling | data access controls, deletion workflows, audit trail, breach evidence |
| HIPAA | protected health information | access auditing, retention, encryption, incident evidence |
| PCI-DSS | payment card data security | segmentation, access control, logging, vulnerability management |

These are awareness anchors only. They are not legal or certification guidance.

## Audit Logging Requirements

Every audit trail should answer:
- **WHO**
  - which identity performed the action
- **WHAT**
  - what action or change happened
- **WHEN**
  - timestamp in a consistent standard
- **WHERE**
  - account, region, environment, or system boundary
- **WHETHER**
  - outcome, such as allowed, denied, success, or failure

## Implementation Patterns

Use a layered pattern:
- cloud-provider audit logs for infrastructure and identity changes
- application audit logs in structured JSON for user and system events
- immutable or write-once log storage for retention-sensitive records
- restricted access to log management and export paths

## <HARD-GATE>

Do not claim audit readiness until all are true:
- audit logs are immutable or strongly tamper-resistant
- retention is at least 1 year or stricter if the policy requires it
- tamper monitoring exists for critical logs
- access to log management is restricted and reviewable

## Policy As Code

Policy should be executable:
- define guardrails as code
- run them in CI/CD
- fail deployment when policies are violated

Awareness tools include:
- OPA and Rego
- cloud-native policy engines
- IaC scanners such as Checkov or tfsec

## Evidence Collection Automation

| Control Area | Evidence Type | Collection Method | Frequency |
|--------------|---------------|-------------------|-----------|
| Access review | privileged access report | scheduled export from IAM source | monthly |
| Change management | deployment and approval log | CI/CD pipeline export | per release |
| Backup control | restore drill report | runbook output and stored artifact | quarterly |
| Logging control | retention and tamper status | scripted control check | monthly |
| Vulnerability management | scan summary and remediation status | scanner export | weekly |

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Manual evidence collection | Audit prep becomes a scramble and gaps are hidden |
| Treat compliance as a yearly project | Controls drift the rest of the year |
| Keep policy only in documents | Violations continue because nothing enforces them |
| Store audit logs with normal mutable application data | Tampering and accidental deletion become easier |

## Execution Handoff

After compliance controls are defined:
- implement logging and retention changes through `ops-infra-plan`
- route CI/CD policy enforcement through `ops-ci-cd`
- validate collected evidence with `ops-verify`

