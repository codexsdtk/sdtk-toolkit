---
name: code-execute
description: Executing implementation plans. Use when you have a written plan and need to execute it step by step with review checkpoints.
---

# Code Execute

## Critical Constraints
- I do not skip ahead of the written plan or silently change task order.
- I do not continue after a failed checkpoint without recording the issue and correcting course.


## Overview

Load the approved implementation plan, review it critically, execute tasks in order, and stop whenever checkpoints fail.

**Announce at start:** "I'm using the code-execute skill to implement this plan."


## Process

### Step 1: Load and Review Plan
1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with the user before starting
4. If no concerns: create a task list and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the code-finish skill to complete this work."
- **REQUIRED SUB-SKILL:** Use code-finish
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**
- **code-worktree** - Set up an isolated workspace before starting when the work should not happen in the current tree.
- **code-plan** - Creates the plan this skill executes
- **code-finish** - Complete development after all tasks
