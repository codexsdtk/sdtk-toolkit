
# Root Cause Tracing

## Overview

Failures often appear deep in an operational stack: a load balancer returns 502, a pod restarts, or a deployment step times out. The instinct is to fix where the error appears, but that only treats the symptom.

**Core principle:** Trace backward through the call chain until you find the original trigger, then fix at the source.

## When to Use

Use this technique when:
- the error appears deep in execution rather than at the entry point
- multiple layers are involved
- it is unclear where invalid data or state originated
- you need to find which system, pipeline step, or configuration change triggered the failure

## The Tracing Process

### 1. Observe the Symptom

```
Error: https://api.example.com returns 502 through the load balancer
```

### 2. Find the Immediate Cause

Ask: what directly causes this symptom?

```
Load balancer target health checks are failing
```

### 3. Ask: What Called This?

Trace one level back at a time:

```
Load balancer target marked unhealthy
-> readiness probe failing on application pods
-> application cannot open a database connection
-> connection string secret missing in deployment environment
```

### 4. Keep Tracing Up

Ask what introduced the bad value or broken state:

- Was the secret renamed?
- Was the manifest updated only in one environment?
- Did a pipeline step skip secret injection?
- Did an operator apply the wrong values file?

### 5. Find the Original Trigger

Example original trigger:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: api-secrets-prod
        key: database_url
```

But the deployment applied to staging uses `api-secrets-staging`, and the values file still points to the prod secret name. The readiness failure is a symptom. The wrong values reference is the source.

## Adding Stack Traces And Instrumentation

When you cannot trace manually, add instrumentation at the boundary you suspect:

```bash
echo "=== ingress ==="
curl -Ik https://api.example.com/health

echo "=== workload ==="
kubectl get pods -n production
kubectl logs deploy/api -n production --tail=100

echo "=== runtime env ==="
kubectl exec deploy/api -n production -- env | grep DATABASE_URL || true

echo "=== dependency reachability ==="
kubectl exec deploy/api -n production -- sh -c 'nc -zv db.internal 5432'
```

Analyze the output in order:
- traffic entry
- workload health
- environment propagation
- downstream dependency reachability

## Real Example: Missing Secret Reference

**Symptom:** public endpoint returns 502

**Trace chain:**
1. ingress reports targets unhealthy
2. readiness probe on the app fails
3. app logs show database connection failure
4. `DATABASE_URL` is unset inside the running pod
5. Helm values file points to the wrong secret name

**Root cause:** wrong configuration at deployment source

**Fix:** correct the values file and redeploy

**Also add defense in depth:**
- validate required secrets before rollout
- fail the pipeline if mandatory env vars are absent
- alert on repeated readiness failures
- log explicit startup errors for missing config

## Key Principle

```
Found immediate cause
-> Can trace one level up?
-> Keep tracing
-> Is this the source?
-> Fix at source
-> Add validation at each layer
```

**NEVER fix only where the error appears.** Trace back to the original trigger.

## Tracing Tips

- Log before the dangerous operation, not after it fails
- Capture enough context to compare healthy vs broken paths
- Include environment, target, region, namespace, revision, or release identifiers
- Save the exact command output you used so `ops-verify` can confirm the fix later

## Real-World Impact

Root-cause tracing turns "the load balancer is broken" into a precise failure chain. That reduces guesswork, shortens incidents, and prevents the same class of outage from recurring.
