# AGENT REPORT TEMPLATE
1. Metadata
- Worker
- Runtime
- Phase
- Repo / Branch
- Decision Requested
- Issue Closeout Mode
- Runtime Outcome (`completed` | `stalled` | `fallback-used`)
2. Short Summary
- <summary>
3. Exact Files Changed
- <path>
- <path>
4. Carryover Findings Resolution
- <prior blocker or truth preserved or resolved>
- <prior blocker or truth preserved or resolved>
5. Formal Artifact Truth
- primary formal artifact path
- written by agent or controller fallback
- fallback reason when controller authored the artifact
6. Execution Permission Audit
- declared execution permission
- effective runtime permission mode
- permission approval status
- approved by
- approval reason
- approved writable scope
- approval reference
- launcher decision summary
7. Phase Artifact Validation
- canonical filename pass or fail or skipped
- canonical verdict vocabulary pass or fail or skipped
- validator output summary or skip reason
8. Exact Verification Results
- <command> -> <result>
- <command> -> <result>
9. Boundary Truth
- included surfaces actually touched
- excluded surfaces not touched
- formal artifacts created
- boundary mode actually executed
- parent issue status after this batch (`DONE` | `IN_PROGRESS`)
10. Git Truth
- git status --short --untracked-files=all
- git diff --name-only
- git diff --cached --name-only
- git rev-parse HEAD
- git branch --show-current
11. Fallback Truth
- fallback trigger reached or not
- fallback path used or not
- stalled runtime diff accepted: yes or no
- watchdog timeout reached: yes or no
- launcher-authored partial-failure closeout emitted: yes or no
- raw log path
- raw runtime report state before closeout
12. Blockers / Open Questions
- <item>
13. Ready State
- <ready / not ready>
- <reason>
- <next step>
