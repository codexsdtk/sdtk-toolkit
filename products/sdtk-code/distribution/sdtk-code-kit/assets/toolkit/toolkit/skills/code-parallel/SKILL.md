---
name: code-parallel
description: Parallel development with subagents. Use when facing 2+ independent tasks -- dispatch agents in parallel with context isolation, controller curates results.
---

# Code Parallel

## Critical Constraints
- I do not parallelize tasks that share mutable state, shared files, or unresolved sequencing dependencies.
- I do not mark a task complete until the implementer result and review result are both reconciled by the controller.

## Overview
Use parallel execution only when the work can be safely decomposed into independent task slices.

## Codex Runtime Note
On Codex, collab or subagent dispatch may be unavailable. When that happens, keep the same decomposition logic but execute the slices sequentially in a single session.

## Process
1. Read the approved implementation plan.
2. Identify tasks that are independent enough to run in parallel.
3. Reject parallelization when tasks:
   - touch the same files or shared mutable state
   - depend on the same unfinished migration or contract change
   - require the same reviewer context at the same time
4. For each safe task slice, prepare a self-contained prompt using:
   - `./references/implementer-prompt.md`
   - `./references/spec-reviewer-prompt.md`
   - `./references/code-quality-reviewer-prompt.md`
5. Dispatch the implementer with:
   - full task text
   - local context
   - required verification command
   - expected output files or code areas
6. Review each returned slice in order:
   - spec compliance first
   - code quality second
7. Aggregate the accepted outputs back into the main branch or controller state.
8. Re-run the top-level verification needed for the combined result.
9. If any slice is blocked, either:
   - provide more context
   - split the slice further
   - fall back to sequential execution

## Fan-Out / Fan-In Rules
- Fan out by task, not by file if the task still shares behavior.
- The controller owns context selection, result curation, and final decision making.
- The implementer owns only the assigned slice.
- Reviewers do not trust implementer claims; they verify artifacts directly.

## When To Use
- 2+ independent bug fixes
- isolated implementation tasks under one approved plan
- a task split where each slice can be verified without waiting on another slice

## Do Not Use When
- a shared refactor spans the same files
- the architecture is still unsettled
- one slice defines the API or schema another slice depends on

## Red Flags
- "We can parallelize this" without proving task independence.
- Reusing the same vague context for every subagent.
- Accepting subagent status without review.
- Hiding Codex sequential fallback from the user.
