
# Incident Runbook Template

```markdown
# Runbook: [Service Or Failure Scenario]

## Quick Reference
- **Service**: [service name and repo link]
- **Owner Team**: [team name and contact channel]
- **On-Call Rotation**: [schedule link or contact path]
- **Dashboards**: [monitoring links]
- **Last Tested**: [date of drill or last validation]

## Detection
- **Alert**: [alert name and system]
- **Symptoms**: [what users and metrics look like]
- **False Positive Check**: [how to confirm it is real]

## Diagnosis
1. Check service health: `[command]`
2. Review error rate and latency dashboards: `[links]`
3. Check recent deployments or config changes: `[command or link]`
4. Review dependency health: `[links or commands]`

## Remediation

### Option A: Rollback
```bash
# Identify the last known good revision
[rollback-history-command]

# Roll back to the prior revision
[rollback-command]

# Verify the rollback finished
[status-command]
```

### Option B: Restart
```bash
# Use a rolling restart where possible
[restart-command]

# Monitor progress
[status-command]
```

### Option C: Scale Up
```bash
# Increase capacity if the issue is load-related
[scale-command]

# Verify capacity and error rate
[verify-command]
```

## Verification
- [ ] Error rate returned to baseline
- [ ] Latency is within SLO
- [ ] No new alerts firing for 10 minutes
- [ ] User-facing functionality manually verified

## Communication
- Internal: [incident channel or update path]
- External: [status page or customer update path]
- Follow-up: Create post-mortem within 48 hours
```
