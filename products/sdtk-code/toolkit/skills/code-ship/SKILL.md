---
name: code-ship
description: Ship and release. Use when implementation is complete, tests pass, and you need to prepare for merge or release -- pre-flight checks, version bump, CHANGELOG, bisectable commits.
---

# Code Ship

## Critical Constraints
- I do not start ship preparation until `code-verify` evidence and `code-review` outcomes are current.
- I do not hide failing tests, unresolved review findings, or release risks behind a version bump.

## Overview
Prepare completed implementation work for merge or release with a disciplined pre-flight process.

## Process
1. Confirm the branch is not `main` or another protected integration branch.
2. Review branch scope:
   - current diff summary
   - commits on the branch
   - uncommitted changes that must be included or split off
3. Merge or rebase from the mainline according to project policy.
4. Run the full verification set that proves ship readiness.
5. Run `code-review` if pre-landing review is stale.
6. Decide version bump level using the project release policy.
7. Update `VERSION` and `CHANGELOG.md` coherently.
8. Split changes into bisectable commits when the diff contains more than one logical unit.
9. Push the branch and open a PR when the project workflow requires one.
10. Report:
   - what is being shipped
   - verification results
   - version change
   - remaining operator notes

## Pre-Flight Checklist
- Latest mainline merged or confirmed unnecessary
- Verification evidence is fresh
- Required review gate completed
- Release notes drafted
- Version bump consistent with scope
- Commits are bisectable
- No hidden migration, config, or rollout risk

## Red Flags
- Shipping from a dirty or stale branch without understanding the diff.
- Updating the version or changelog before tests and review pass.
- Bundling unrelated work into one release commit.
- Treating a push as proof that the code is ready.

## Integration
- Run `code-verify` before this skill.
- Run `code-review` before this skill when the code changed after the last review.
- Finish with `code-finish` if the workflow requires a final branch integration decision.
