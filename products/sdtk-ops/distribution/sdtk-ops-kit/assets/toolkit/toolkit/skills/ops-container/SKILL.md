---
name: ops-container
description: Container operations. Use when building Docker images, writing Dockerfiles, creating Kubernetes manifests, or managing container lifecycle -- covers best practices, security scanning, and orchestration patterns.
---

# Ops Container

## Overview

Container workflows fail when image build, runtime security, and orchestration design are treated as separate concerns. Build lean images, run them with explicit security posture, and define manifests that expose health and resource boundaries.

## When to Use

Use for:
- Dockerfile authoring or review
- image build and tagging strategy
- Kubernetes deployment manifest design
- local multi-service orchestration
- container registry policy updates

## Dockerfile Best Practices

Use these defaults:
- multi-stage builds to separate build tools from runtime image
- specific base image tags, never floating `latest`
- minimal runtime packages
- `.dockerignore` to exclude git metadata, secrets, and local caches
- deterministic dependency install steps for repeatable builds

## Security Defaults

Container security starts in the image:
- run as non-root user
- pin base images to explicit versions
- scan images before push
- keep secrets out of the image and build args
- remove unused packages and shells where possible

## <HARD-GATE>

Do not publish or deploy the image unless all are true:
- multi-stage build is used where build tooling is separate from runtime
- container runs as non-root unless a reviewed exception exists
- vulnerability scan passes with no CRITICAL or HIGH findings
- base image tag is specific and reviewable

## Kubernetes Patterns

For production-oriented workloads, define:
- Deployment with explicit resource requests and limits
- readiness, liveness, and startup probes
- rolling update settings that limit simultaneous disruption
- PodDisruptionBudget for critical workloads
- Service type matched to actual exposure need
- ConfigMap and Secret references instead of baked config

Use `./references/k8s-manifest-patterns.md` for concrete manifest examples.

## Health Probes

| Probe | Purpose | Failure Action |
|-------|---------|----------------|
| Liveness | Detect deadlocked or unrecoverable process | restart container |
| Readiness | Control whether traffic reaches the pod | remove pod from service endpoints |
| Startup | Protect slow boot from early liveness failure | delay other probe enforcement until startup completes |

## Docker Compose Pattern

For local or small deployments:
- define each service explicitly
- isolate shared environment variables in files or secret stores
- declare volumes and networks on purpose
- use health checks so service startup order is evidence-based, not timing-based

Do not treat Docker Compose defaults as production architecture.

## Container Registry Discipline

Use a tagging and retention policy:
- tag images with semver and git SHA
- enable scan-on-push where the registry supports it
- expire unneeded intermediate tags
- keep a clear mapping from deployed revision to immutable image digest

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Use `latest` everywhere | Rollback and provenance become guesswork |
| Run as root by default | One container escape becomes much worse |
| Bake secrets into Dockerfile or image | Rotation and access control break immediately |
| Skip resource limits | Noisy neighbors and eviction behavior become unpredictable |
| Omit probes | Broken containers look healthy until users discover them |
