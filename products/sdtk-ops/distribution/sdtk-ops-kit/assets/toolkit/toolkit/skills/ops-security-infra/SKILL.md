---
name: ops-security-infra
description: Infrastructure security. Use when hardening infrastructure, managing secrets, defining network policies, or setting up security scanning in CI/CD -- covers STRIDE for infrastructure, secrets management, and detection-as-code.
---

# Ops Security Infra

## Overview

Infrastructure security must be designed into identity, network, secrets, logging, and delivery paths at the same time. The goal is not perfect theoretical safety. The goal is to remove obvious exposure, narrow trust boundaries, and make security controls reviewable and repeatable.

## When to Use

Use for:
- infrastructure hardening reviews
- IAM and access-boundary changes
- secrets-management design
- network policy and ingress review
- CI/CD security scanning design
- detection rule delivery and coverage tracking

## STRIDE For Infrastructure

| Threat | Infrastructure Example | Primary Control |
|--------|------------------------|-----------------|
| Spoofing | compromised IAM role or forged workload identity | MFA, short-lived credentials, strong workload identity |
| Tampering | unauthorized infrastructure-as-code or config change | peer review, protected branches, signed change path |
| Repudiation | operator denies a risky change | immutable audit logging |
| Information Disclosure | secrets exposed in config, logs, or state files | secret manager, redaction, encryption |
| Denial of Service | public endpoints or shared resources overwhelmed | rate limiting, WAF, scaling limits, network controls |
| Elevation of Privilege | broad admin roles or wildcard policies | least-privilege IAM and isolated admin paths |

## Network Security

Use these defaults:
- security groups and firewall rules default deny
- no `0.0.0.0/0` access except for intentionally public load balancers or edge endpoints
- private services stay private by default
- Kubernetes network policies start from deny-all and then allow only required traffic
- management interfaces live behind stronger access controls than the workload path

## Secrets Management

| Option | When To Use | Security Level |
|--------|-------------|----------------|
| Cloud KMS | key management and envelope encryption | high |
| Secret Manager | application and infrastructure secrets at runtime | high |
| HashiCorp Vault | complex multi-platform secret workflows and dynamic credentials | high |
| Sealed Secrets | Kubernetes-native encrypted secret delivery | medium to high |

Rules:
- never hardcode secrets in repo files
- never log secrets or raw tokens
- prefer short-lived credentials over long-lived static keys
- rotate secrets on a fixed schedule and on compromise

## <HARD-GATE>

NEVER:
- store secrets in git
- log secrets
- leave credentials unrotated beyond 90 days without reviewed exception

ALWAYS:
- prefer short-lived credentials such as OIDC or STS where available
- audit secret access
- review who can decrypt or retrieve production secrets

## CI CD Security Pipeline

The pipeline should scan:
- static code issues with Semgrep or equivalent
- dependency and image vulnerabilities with Trivy or equivalent
- secret exposure with Gitleaks or equivalent

Use `./references/cicd-security-pipeline.md` for a GitHub Actions example.

## Detection As Code

Treat security detections as code:
- keep rules in version control
- validate them in CI before deployment
- map each rule to MITRE ATT&CK coverage where that model is relevant
- record known false positives and data-source dependencies
- deploy through a controlled pipeline, not ad hoc console edits

The goal is awareness and repeatability, not a specific SIEM vendor.

## Security Hardening Checklist

Review these items:
1. default-deny network posture
2. encryption at rest
3. encryption in transit
4. secrets in a manager, not config files
5. least-privilege IAM
6. security scanning in CI/CD
7. immutable or strongly protected audit logging
8. container image scanning
9. SSH key rotation or stronger admin access controls
10. MFA for privileged infrastructure access

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Overly permissive IAM | One compromise turns into full-environment access |
| Secrets in environment dumps or logs | Detection becomes recovery plus disclosure response |
| Security treated as a final review step | Core architecture assumptions stay unsafe |
| No audit logging for privileged actions | Investigation and compliance both fail |
| Security scans exist but do not block anything | Vulnerable changes keep shipping |

## Reference Files

Use:
- `./references/cicd-security-pipeline.md`
- `./references/security-headers.md`

## Execution Handoff

After defining the security change:
- send infrastructure boundary changes to `ops-infra-plan`
- route CI/CD controls through `ops-ci-cd`
- verify the final control state with `ops-verify`
