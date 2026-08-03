---
name: code-discover
description: Discover SDTK-CODE skills. Use when starting a conversation or unsure which skill to use -- establishes skill discovery and invocation.
---

# Code Discover

## Critical Constraints
- I do not guess a workflow when a clearer skill match exists.
- I do not route straight to implementation when planning, verification, or review should happen first.

## Overview
Use this skill when you need to discover which SDTK-CODE skill should be used next.

## Skill Catalog
| Skill | Trigger | Purpose |
|---|---|---|
| `code-tdd` | Before writing implementation code | Enforces failing-test-first discipline. |
| `code-debug` | When a bug or failure appears | Finds root cause before any fix. |
| `code-verify` | Before claiming work is complete | Requires fresh command evidence. |
| `code-plan` | When requirements need an implementation plan | Produces executable task order and verification steps. |
| `code-execute` | When an approved plan exists | Executes work sequentially with checkpoints. |
| `code-review` | When code needs review or review feedback must be handled | Runs spec-first, quality-second review. |
| `code-ship` | When the code is ready to prepare for merge or release | Handles pre-flight, versioning, and release prep. |
| `code-parallel` | When 2+ independent tasks can run safely in parallel | Fans out task slices, then curates fan-in. |
| `code-brainstorm` | Before creative or ambiguous coding work | Explores approaches before planning. |
| `code-finish` | When branch work is complete | Presents merge, PR, keep, or discard options. |
| `code-worktree` | When feature isolation is needed | Creates a safe isolated worktree. |
| `code-discover` | When you are unsure where to start | Explains the toolkit and routing order. |

## Process
1. Read the request and determine whether the user needs planning, execution, verification, review, or shipping.
2. Choose the earliest skill in the workflow that closes the biggest risk.
3. Route to that skill and explain the handoff in one sentence.
4. If multiple skills apply, prefer the one that prevents irreversible mistakes first.

## Priority Order
1. Design and plan first: `code-brainstorm`, `code-plan`
2. Implementation discipline: `code-tdd`, `code-execute`, `code-parallel`
3. Verification and review: `code-debug`, `code-verify`, `code-review`
4. Shipping and closure: `code-ship`, `code-finish`, `code-worktree`

## Red Flags
| Situation | Use Instead |
|---|---|
| Writing code without a failing test | `code-tdd` |
| Fixing a bug by guessing | `code-debug` |
| Saying "done" without proof | `code-verify` |
| Jumping into execution without a plan | `code-plan` |
| Reviewing quality before checking spec compliance | `code-review` |
| Shipping before verification and review finish | `code-ship` |

## Routing Rule
If more than one skill seems applicable, choose the earliest skill in the workflow chain that closes the biggest risk.
