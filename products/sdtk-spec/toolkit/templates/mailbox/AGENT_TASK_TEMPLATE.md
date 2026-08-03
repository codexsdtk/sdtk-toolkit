# AGENT TASK TEMPLATE
Issue:
- <ISSUE_KEY> | <TITLE>
Runtime:
- <claude|codex>
Phase:
- <plan|controller-spec|implementation|controller-dev-review|qa-review|controller-acceptance|post-issue-retrospective|ops|other>
Worktree / Repo:
- <ABSOLUTE_PATH>
- Branch: <BRANCH>
Objective:
- <one clear sentence>
Decision Requested:
- <exact decision or ready-state question>
Issue Closeout Mode:
- <full-issue|phase-only>
Execution Permission:
- <read-only|workspace-write-approved>
Permission Approval Status:
- <not-required|human-approved>
Approved By:
- <name/role|n/a>
Approval Reason:
- <short reason|n/a>
Approved Writable Scope:
- <exact writable scope|n/a>
Approval Reference:
- <ticket/comment/reference|n/a>
Formal Outputs To Produce:
1. <tracked artifact path>
2. <tracked artifact path>
Include Boundary:
1. <path or surface>
2. <path or surface>
Exclude Boundary:
1. <excluded path or surface>
2. <excluded path or surface>
Inputs:
- <file 1; authoritative source input, read before any broader search>
- <file 2>
- <file 3>
Boundary Mode:
- <canonical-only|canonical+distribution|other>
Primary Formal Artifact:
- <tracked artifact path that controller will trust first>
Canonical Review-Phase Artifact Rules:
- controller-dev-review => `SDTK_BK###_CONTROLLER_DEV_REVIEW_R#_YYYYMMDD.md` + `APPROVED FOR QA HANDOFF` or `CHANGES REQUIRED BEFORE QA`
- qa-review => `SDTK_BK###_QA_CHECKPOINT_REPORT_R#_YYYYMMDD.md` + `APPROVED FOR CONTROLLER ACCEPTANCE` or `CHANGES REQUIRED BEFORE CONTROLLER ACCEPTANCE`
- controller-acceptance => `SDTK_BK###_CONTROLLER_ACCEPTANCE_R#_YYYYMMDD.md` + `APPROVED FOR COMMIT-READY STATE` or `NOT APPROVED FOR COMMIT-READY STATE`
Carryover Findings / Fixed Truth To Preserve:
- <prior blocker ID or prior approved truth>
- <prior blocker ID or prior approved truth>
Formal Artifact Write Expectation:
- <agent-authored formal artifact|controller-authored fallback allowed if runtime is blocked>
Timebox / Search Budget:
- <deliver-first / max search budget / when to stop and escalate>
Runtime Stall Budget / Fallback Trigger:
- <e.g. 35 minutes / exact trigger that allows controller-local or native fallback>
Execution Rules:
1. Read every listed input first and treat `Inputs:` as the authoritative starting source set unless blocked by a missing exact dependency.
2. Do not run broad repo-wide or directory-wide discovery before you have read the listed inputs; any extra inspection must stay inside `Include Boundary`.
3. <additional critical rule or commit/push restriction if relevant>
Required Verification:
- <command 1>
- <command 2>
- <command 3>
Return Format:
1. metadata
2. short summary
3. exact files changed
4. formal artifact truth
5. execution permission audit
6. exact verification results
7. boundary truth
8. blockers or open questions
9. explicit readiness statement
