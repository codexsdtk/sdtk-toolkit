---
name: code-plan
description: Implementation planning. Use when you have requirements or a spec and need to create a step-by-step implementation plan before writing code.
---

# Code Plan

## Critical Constraints
- I do not start code execution until the implementation plan has explicit task order, verification steps, and dependency boundaries.
- I do not leave assumptions implicit; every unverified assumption must be logged with risk.

## Overview
Turn approved requirements into an execution-ready implementation plan.

The plan must be small enough to execute safely, detailed enough to review, and explicit about verification.

## Process
1. Read the approved requirements, existing code, and any architecture or API references that define scope.
2. Challenge scope before planning:
   - What already exists that partially solves this?
   - What is the minimum viable change?
   - Is the requested change too large for one plan?
3. Break the work into numbered tasks with a clear dependency order.
4. For each task, record:
   - purpose
   - files or modules likely to change
   - verification command or evidence expected
   - likely rollback or containment strategy if the task fails
5. Review the plan against four execution paths for the critical flow:
   - happy path
   - nil or missing-input path
   - empty or no-op path
   - error or failure path
6. Add architecture review notes for:
   - data flow boundaries
   - state transitions
   - dependency graph risks
   - performance hotspots such as N+1, unbounded memory, missing indexes, and duplicate work
   - observability coverage
7. For any task with external side effects, add observable state notes:
   - Customer sees:
   - Operator sees:
   - Database:
   - Logs:
8. Record assumptions in this exact table format:

| # | Assumption | Verified | Risk if wrong |
|---|---|---|---|
| A1 | Example assumption | No | Medium |

9. End the plan with a verification checklist that the implementer can execute without guesswork.
10. Ask for approval before handing the plan to `code-execute` or `code-parallel`.

## Required Plan Shape
A good SDTK-CODE implementation plan includes:
- scope summary
- task list in execution order
- dependency notes
- verification command per task or task group
- open questions
- assumptions table
- observability notes for non-trivial flows
- "not in scope" list for deferred work

## Architecture Review Lens
Before approving the plan, check:
- Data flow: where does data enter, transform, persist, and exit?
- Boundaries: which module owns each responsibility?
- Nil/empty/error/happy: is every important path covered?
- Performance: where could this create N+1, redundant fetches, large payloads, or slow startup?
- Observability: if this fails in production, what would the operator actually see?

## Red Flags
- Plan says "implement feature" without task decomposition.
- Verification is only "run tests" with no task-level proof.
- Assumptions are left in prose instead of the assumptions table.
- The plan introduces extra abstractions without explaining why.
- The plan does not say what is explicitly out of scope.

## Output Contract
Return a plan that an implementer can follow without reconstructing missing context.

When the plan is approved, the next skill is:
- `code-execute` for sequential execution
- `code-parallel` for independent tasks that can be safely fanned out
