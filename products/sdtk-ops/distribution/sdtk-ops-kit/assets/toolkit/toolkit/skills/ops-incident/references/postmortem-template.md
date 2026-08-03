
# Postmortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date**: YYYY-MM-DD
**Severity**: SEV[1-4]
**Duration**: [start time] to [end time] ([total duration])
**Author**: [name]
**Status**: [Draft / Review / Final]

## Executive Summary
[2-3 sentences on what happened, who was affected, and how it was resolved]

## Impact
- **Users affected**: [number or percentage]
- **Revenue impact**: [estimated or N/A]
- **SLO budget consumed**: [X% of monthly error budget]
- **Support tickets created**: [count]

## Timeline (UTC)
| Time | Event |
|------|-------|
| 14:02 | Monitoring alert fires |
| 14:05 | On-call engineer acknowledges page |
| 14:08 | Incident declared and roles assigned |
| 14:12 | Root-cause hypothesis recorded |
| 14:18 | Mitigation started |
| 14:23 | Metrics begin returning to baseline |
| 14:30 | Incident resolved |
| 14:45 | All-clear communicated |

## Root Cause Analysis
### What Happened
[Detailed technical explanation of the failure chain]

### Contributing Factors
1. **Immediate cause**: [the direct trigger]
2. **Underlying cause**: [why the trigger was possible]
3. **Systemic cause**: [what process or design gap allowed it]

### 5 Whys
1. Why did the service fail? [answer]
2. Why did that happen? [answer]
3. Why was that possible? [answer]
4. Why was the guardrail missing? [answer]
5. Why did the system permit the failure mode? [root issue]

## What Went Well
- [things that helped detection or response]
- [tools or practices that reduced impact]

## What Went Poorly
- [gaps that slowed detection or resolution]
- [runbooks, alerts, or ownership issues]

## Action Items
| ID | Action | Owner | Priority | Due Date | Status |
|----|--------|-------|----------|----------|--------|
| 1 | [action] | [owner] | P1 | YYYY-MM-DD | Not Started |
| 2 | [action] | [owner] | P1 | YYYY-MM-DD | Not Started |
| 3 | [action] | [owner] | P2 | YYYY-MM-DD | Not Started |

## Lessons Learned
[Key takeaways that should change design, monitoring, or procedure]
```
