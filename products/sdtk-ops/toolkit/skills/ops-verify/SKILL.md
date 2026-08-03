---
name: ops-verify
description: Verification before completion. Use before claiming any infrastructure change, deployment, or operational task is done -- run verification commands and confirm output, evidence before assertions.
---

# Ops Verify

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you have not run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## OPS_HANDOFF Closeout Checks

If the scoped OPS work came from `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`, verify against the handoff before claiming `DEV-Run` completion.

Check at minimum:
- the consumed handoff path and `handoff_status`
- whether the work followed or overrode `suggested_next_ops_path`, and why
- whether `deployment_prerequisites`, `environment_assumptions`, `infra_runtime_dependencies`, `observability_requirements`, and `rollback_recovery_expectations` were actually checked
- whether journey-specific operational evidence exists for the scoped work
- whether final closeout evidence is explicit and fresh

Blocked-state rule:
- if `handoff_status` is `BLOCKED_FOR_SDTK_OPS`, you may inspect and report the handoff
- you may verify bounded triage work if that work actually ran
- you must not claim normal ready-path operational completion from a blocked handoff

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Claim success from expectation instead of output | You report intent, not evidence |
| Reuse old command output | State may have changed since the earlier run |
| Verify only one layer of a multi-step change | Hidden failure survives past the claim |
| Trust a delegated agent without independent checks | Reported completion may not match the actual result |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit, push, or close a task without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence is not evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter is not compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion is not an excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
[Run test command] [See: 34/34 pass] "All tests pass"
"Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
Write -> Run (pass) -> Revert fix -> Run (MUST FAIL) -> Restore -> Run (pass)
"I've written a regression test" (without red-green verification)
```

**Build:**
```
[Run build] [See: exit 0] "Build passes"
"Linter passed" (linter does not check compilation)
```

**Requirements:**
```
Re-read plan -> Create checklist -> Verify each -> Report gaps or completion
"Tests pass, phase complete"
```

**Agent delegation:**
```
Agent reports success -> Check VCS diff -> Verify changes -> Report actual state
Trust agent report
```

## Infrastructure Verification Patterns

**Health check:**
```
[Run: curl -s https://service.example/health]
[See: {"status":"healthy"}]
"Service healthy"
```

**DNS:**
```
[Run: dig +short api.example.com]
[See: correct IP or CNAME]
"DNS propagated"
```

**Container:**
```
[Run: kubectl get pods -n production]
[See: Running, Ready 1/1]
"Pods healthy"
```

**Cloud resource:**
```
[Run: provider CLI state check]
[See: active or available]
"Resource provisioned"
```

## Why This Matters

From repeated operational failures:
- the user stops trusting status claims that are not backed by evidence
- undefined or unhealthy runtime states can ship into production
- missing requirements or skipped rollback checks lead to incomplete releases
- time gets wasted on false completion -> redirect -> rework
- operational honesty matters as much as implementation honesty

## When To Apply

**ALWAYS before:**
- ANY variation of success or completion claims
- ANY expression of satisfaction
- ANY positive statement about operational state
- Deployment completion
- Incident closure
- Moving to the next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion or correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

This is non-negotiable.
