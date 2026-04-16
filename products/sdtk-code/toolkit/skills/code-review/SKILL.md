---
name: code-review
description: Code review -- requesting and receiving. Use when completing a feature, before merging, or when receiving review feedback.
---

# Code Review

## Critical Constraints
- I do not treat style feedback as a substitute for requirement or spec compliance.
- I do not ship code while critical review issues remain unresolved.

## Overview
Run review in two stages:
1. Spec compliance review
2. Code quality review

Use this skill both when requesting review and when responding to review feedback.

## Process
### Stage 1: Requesting Review
1. Identify the exact scope being reviewed.
2. Gather the requirement or plan reference, the files changed, and the verification evidence already collected.
3. Start with spec compliance:
   - confirm the code matches the requested behavior
   - confirm there is no silent scope creep
   - confirm required tests or verification exist
4. Only after Stage 1 passes, run code quality review.
5. For code quality review, use the checklist at `./references/checklist.md` and the reviewer prompt at `./references/code-reviewer.md` when delegated review is appropriate.

### Stage 2: Receiving Review
1. Read the review comments carefully.
2. Classify each item:
   - critical: blocks merge or release
   - important: should fix before handoff
   - minor: worth fixing if low risk
3. Verify the review comment against the code before changing anything.
4. Fix valid issues with the smallest coherent diff.
5. Re-run verification after fixes.
6. If a review comment is incorrect, push back with technical evidence.

### Stage 3: Pre-Landing Checklist
Always run a final pass on:
- SQL and data safety
- race conditions and concurrency
- LLM trust boundary or unsafe generated input handling
- conditional side effects
- magic numbers or string coupling
- dead code and stale comments
- prompt or instruction drift
- test gaps
- crypto and entropy issues
- time-window assumptions
- type coercion at boundaries
- view or frontend performance traps

Use `./references/checklist.md` as the canonical checklist.

## Review Output Format
- Strengths
- Critical issues
- Important issues
- Minor issues
- Assessment: ready / ready with fixes / not ready

Each issue should include:
- file reference
- what is wrong
- why it matters
- how to fix it

## Red Flags
- Requesting code-quality review before verifying the code matches the spec.
- Accepting review comments without checking the actual code.
- Ignoring a critical issue because tests happen to pass.
- Turning review into an unbounded refactor request.

## Integration
- Use after `code-execute` or `code-parallel` finishes an implementation slice.
- `code-ship` depends on this review gate being complete.
