---
name: ops-debug
description: Systematic infrastructure debugging. Use when encountering deployment failure, service outage, network issue, or unexpected infrastructure behavior -- binary search to root cause, evidence-first, no guessing fixes.
---

# Ops Debug

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY infrastructure or operations issue:
- Deployment failures
- Service outages
- Unexpected behavior
- Performance problems
- Build or release failures
- Integration issues
- Network or DNS problems

**Use this ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You have already tried multiple fixes
- Previous fix did not work
- You do not fully understand the issue

**Do not skip when:**
- Issue seems simple (simple bugs have root causes too)
- You are in a hurry (rushing guarantees rework)
- Someone wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Do not skip past errors or warnings
   - They often contain the exact clue you need
   - Read stack traces completely
   - Note line numbers, file paths, error codes, probe failures, and status codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible -> gather more data, do not guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits, manifest changes
   - New dependencies, config changes, secret rotations
   - Environmental differences between healthy and broken systems

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (load balancer -> service -> database, CI -> artifact -> deploy target):**

   **BEFORE proposing fixes, add diagnostic instrumentation:**
   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment and config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   **Infrastructure example (LB -> App -> DB -> DNS -> Network):**
   ```bash
   # Layer 1: Load balancer or ingress
   curl -Ik https://api.example.com/health

   # Layer 2: Application workload
   kubectl get pods -n production
   kubectl logs deploy/api -n production --tail=100

   # Layer 3: Database connectivity
   kubectl exec deploy/api -n production -- sh -c 'nc -zv db.internal 5432'

   # Layer 4: DNS
   dig +short api.example.com

   # Layer 5: Network controls
   kubectl get networkpolicy -n production
   ```

   **This reveals:** Whether the break happens at traffic entry, application runtime, database reachability, DNS resolution, or network controls.

5. **Trace Data Flow**

   **WHEN error is deep in the stack or spread across layers:**

   See `./references/root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does the bad value or bad state originate?
   - What called this with bad input?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working infrastructure or runbooks in the same codebase
   - What works that is similar to what is broken?

2. **Compare Against References**
   - If implementing a pattern, read the reference implementation COMPLETELY
   - Do not skim
   - Understand the pattern fully before applying it

3. **Identify Differences**
   - What is different between working and broken?
   - List every difference, however small
   - Do not assume "that cannot matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, secrets, or environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test the hypothesis
   - One variable at a time
   - Do not fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes -> Phase 4
   - Did it fail? Form a NEW hypothesis
   - DO NOT add more fixes on top

4. **When You Do Not Know**
   - Say "I do not understand X"
   - Do not pretend to know
   - Ask for help
   - Research more

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create a Repeatable Failing Check**
   - Simplest possible reproduction
   - Automated test if possible
   - Diagnostic command or small script if no framework exists
   - MUST have before fixing

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix**
   - Check passes now?
   - No other health checks broken?
   - Issue actually resolved?

4. **If Fix Does Not Work**
   - STOP
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1 and re-analyze with new information
   - **If >= 3: STOP and question the architecture (step 5 below)**
   - DO NOT attempt Fix #4 without architectural discussion

5. **If 3+ Fixes Failed: Question Architecture**

   **Pattern indicating architectural problem:**
   - Each fix reveals new shared state, coupling, or drift in a different place
   - Fixes require broad refactoring to implement
   - Each fix creates new symptoms elsewhere

   **STOP and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we "sticking with it through sheer inertia"?
   - Should we refactor architecture vs. continue fixing symptoms?

   **Discuss with the user before attempting more fixes**

   This is NOT a failed hypothesis. This is a wrong architecture.

## Infrastructure Debugging Patterns

| Symptom | Investigation Path |
|---------|--------------------|
| 5xx errors spike | deployment timing, pod health, resource limits, DB connections |
| High latency | DNS resolution, network hops, DB query time, container CPU throttling |
| Connection refused | security groups, network policies, service mesh, port bindings |
| Intermittent failures | DNS TTL, load balancer health checks, resource saturation, race conditions |
| Container restart loop | OOM kills, liveness probe config, startup dependencies |
| Certificate errors | expiry dates, chain completeness, SANs, renewal automation |

## Red Flags - STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run checks"
- "Skip the failing check, I will verify manually"
- "It is probably X, let me fix that"
- "I do not fully understand but this might work"
- "Pattern says X but I will adapt it differently"
- "Here are the main problems:" followed by fixes without investigation
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** Question the architecture (see Phase 4.5)

## Signals You Are Doing It Wrong

**Watch for these redirections:**
- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You are proposing fixes without understanding
- "Think harder about the system" - Question fundamentals, not just symptoms
- "We are stuck?" - Your approach is not working

**When you see these:** STOP. Return to Phase 1.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, do not need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I will write the check after confirming the fix works" | Unverified fixes do not stick. Prove the failure first. |
| "Multiple fixes at once saves time" | You cannot isolate what worked. It creates new bugs. |
| "Reference is too long, I will adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms is not the same as understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, do not fix again. |

## Common Mistakes

| Mistake | Why it fails |
|---------|--------------|
| Skip reproduction and jump to fixes | You never prove what actually changed |
| Bundle multiple changes into one test | You lose causality and create new uncertainty |
| Stop tracing at the first visible failure | The real trigger stays in place |
| Keep patching after repeated failed fixes | The architecture problem remains unchallenged |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create failing check, fix, verify | Issue resolved, checks pass |

## When Process Reveals "No Root Cause"

If systematic investigation reveals the issue is truly environmental, timing-dependent, or external:

1. You completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, circuit breaker, error message)
4. Add monitoring and logging for future investigation

**But:** most "no root cause" cases are incomplete investigation.

## Supporting Techniques

- **`./references/root-cause-tracing.md`** - Trace failures backward through layers to find the original trigger

**Related skills:**
- **`ops-verify`** - Verify the fix worked before claiming success

## Real-World Impact

From debugging sessions:
- Systematic investigation minimizes thrash
- First-time fix rate improves when evidence replaces guessing
- New bugs introduced by speculative patches drop sharply
