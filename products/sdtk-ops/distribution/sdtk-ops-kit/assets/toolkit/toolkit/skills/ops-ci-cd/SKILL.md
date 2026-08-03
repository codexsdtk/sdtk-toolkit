---
name: ops-ci-cd
description: CI/CD pipeline design and management. Use when setting up or modifying build, test, and deployment pipelines -- covers pipeline stages, branch strategies, artifact management, and secret handling.
---

# Ops CI CD

## Overview

A pipeline should make the safe path the default path. It must build the artifact, test it, scan it, promote it, and leave an auditable trail of what ran and what was deployed.

## Standard Pipeline Flow

Use this default flow:

```text
commit
  -> build
  -> unit test
  -> lint and SAST
  -> integration test
  -> security scan
  -> build artifact
  -> deploy staging
  -> smoke test
  -> deploy production
  -> health check
```

Do not collapse build, scan, and deploy into one opaque job.

## Branch And Promotion Strategy

Prefer:
- trunk-based development with short-lived branches
- automatic promotion to staging after required checks pass
- manual or policy-gated promotion to production
- immutable artifact promotion instead of rebuilding per environment

## Pipeline Config Patterns

Keep pipeline definitions:
- small enough to review
- explicit about dependencies between jobs
- strict about required checks
- separate from infrastructure design details that belong in `ops-infra-plan`

Use `./references/pipeline-examples.md` for GitHub Actions and GitLab CI examples.

## <HARD-GATE>

NEVER:
- hardcode secrets in pipeline files
- pass long-lived cloud credentials through plain environment variables when OIDC or equivalent short-lived auth is available
- skip secret rotation or access auditing

ALWAYS:
- use platform secret stores
- scope credentials to the minimum required permissions
- rotate and review access on a defined schedule

## Artifact Management

Pipeline outputs should be:
- versioned with semver and git SHA
- immutable once published
- stored with retention rules
- traceable from deployment record back to commit and build

## Pipeline Optimization

Optimize only after correctness:
- cache dependencies and build layers
- parallelize independent jobs
- use matrix builds only when they produce clear value
- skip unaffected jobs based on changed files when dependency rules are reliable

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Secrets committed in YAML | Rotation and audit control are lost immediately |
| No staging environment | Production becomes the first integration test |
| Manual deploy steps outside pipeline | Audit trail and repeatability disappear |
| Skip security scanning to save time | Vulnerabilities ship by default |
| No build cache or job parallelism | Pipeline slows down until teams bypass it |
