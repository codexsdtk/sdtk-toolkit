# SDTK-CODE Workflow Project Test Guide

Version: 0.1
Last Updated: 2026-03-23
Owner: SDTK Core Team

## 1. Purpose

This guide explains how to test `SDTK-CODE` on the real project:

- `D:\Projects\Vaix\AndesCloud\Workflow_20260323`

It is intentionally practical. The goal is not to restate the whole product guide. The goal is to show:

1. where to start after `SDTK-SPEC` has finished
2. what `SDTK-CODE` actually owns
3. what test order is realistic for the `WORKFLOW` feature
4. which commands to run first
5. how to validate a real frontend -> API -> database path without trying to build the whole system in one pass

Canonical general user guide:

- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`

This file is the project-specific execution guide for the `WORKFLOW` pilot.

## 2. Current Project Truth

Assumed project path:

- `D:\Projects\Vaix\AndesCloud\Workflow_20260323`

Current upstream truth from the completed `SDTK-SPEC` run:

- feature key: `WORKFLOW`
- feature name: `Workflow Engine`
- handoff status: `READY_FOR_SDTK_CODE`
- recommended lane: `feature`

Current required upstream inputs already exist:

- `docs/dev/CODE_HANDOFF_WORKFLOW.json`
- `docs/dev/FEATURE_IMPL_PLAN_WORKFLOW.md`
- `docs/architecture/ARCH_DESIGN_WORKFLOW.md`
- `docs/product/BACKLOG_WORKFLOW.md`
- `docs/api/WorkflowEngine_API.yaml`
- `docs/api/WORKFLOW_ENDPOINTS.md`
- `docs/api/WORKFLOW_API_DESIGN_DETAIL.md`
- `docs/database/DATABASE_SPEC_WORKFLOW.md`
- `docs/design/DESIGN_LAYOUT_WORKFLOW.md`
- `docs/specs/WORKFLOW_FLOW_ACTION_SPEC.md`
- `sdtk-spec.config.json`

Stack truth from the handoff:

- backend: Python Django REST Framework
- frontend: React 18 + Vite
- database: PostgreSQL 15
- auth: JWT

## 3. What SDTK-CODE Is And Is Not

`SDTK-CODE` is not a one-command full-stack generator.

It does not mean:

- "generate all frontend screens automatically"
- "generate all backend APIs automatically"
- "wire frontend to backend automatically"
- "provision database automatically"
- "run full QA automatically"

`SDTK-CODE` is a workflow-first coding control layer after upstream handoff.

It does:

- validate intake from `SDTK-SPEC`
- create `CODE_WORKFLOW_[FEATURE_KEY].md`
- let you refine implementation slices
- record build progress
- record verification evidence
- record the final decision for the current implementation pass

The actual code work still happens through the runtime and the coding agent using the upstream spec artifacts.

Important practical consequence:

- do not start by trying to implement all `B1-B4` and `F1-F4`
- start with a narrow vertical slice that proves the full chain works

## 4. Recommended Test Strategy For This Project

Use a 3-stage validation order.

### Stage A. Workflow-control smoke

Goal:

- prove `SDTK-CODE` can ingest the real `WORKFLOW` handoff and create a legal workflow artifact

Do not try to generate real feature code yet.

Expected outcome:

- `docs/dev/CODE_WORKFLOW_WORKFLOW.md` exists
- lane, intake outcome, and next legal phase are correct

### Stage B. Thin vertical slice pilot

Goal:

- prove one real screen can call one real API and persist one real database write

This is the first meaningful full-stack test for `SDTK-CODE`.

Recommended pilot slice for `WORKFLOW`:

- `Workflow Definition Basic Info create`

Why this slice is the right first test:

- it stays in admin scope only
- it uses real `WORKFLOW` documents
- it avoids early approval-engine complexity
- it still proves the chain:
  - UI form
  - frontend API call
  - backend endpoint
  - database insert

Recommended slice mapping:

- `B1-min`: only the schema and migrations needed for category + workflow definition
- `B2-min`: categories list + workflow definition create/list/update endpoints
- `F1-min`: shared API client, auth wrapper, table/form shell
- `F2-min`: Workflow Definition List + Basic Info tab only

Success condition:

1. open admin screen
2. submit basic workflow definition form
3. frontend calls backend successfully
4. row is inserted into PostgreSQL
5. list screen shows the created record

### Stage C. Expand after the pilot passes

Only after Stage B is green should you move to:

- full definition items and approval steps
- applicant flows
- approver flows
- return patterns
- notifications
- external integration dispatch

## 5. Recommended Runtime Choice

For this project, choose one of these deliberately:

### Option 1. Codex

Use this when:

- you want to test the current `sdtk-code` flow in the same ecosystem you are already using now
- you are fine with user-scope runtime assets

Reality:

- Codex supports user scope only
- it is good enough for the workflow-first validation path

### Option 2. Claude

Use this when:

- you want project-scope runtime assets
- you want the runtime behavior to stay closer to the original `SDTK-SPEC` validation flow

Reality:

- Claude supports both project and user scope

Pragmatic recommendation for this project:

- if the goal is to validate `SDTK-CODE` in your current working environment, start with `codex`
- if the goal is smoother project-local runtime behavior for repeated execution inside the same project folder, use `claude`

## 6. Exact First-Run Commands

Run these from:

- `D:\Projects\Vaix\AndesCloud\Workflow_20260323`

### 6.1 Install and verify the package

```powershell
npm install -g sdtk-code-kit@0.1.0
sdtk-code --version
sdtk-code --help
```

### 6.2 Initialize runtime assets

#### Codex path

Use a project-local `CODEX_HOME` during testing so you do not pollute your main user profile:

```powershell
cd D:\Projects\Vaix\AndesCloud\Workflow_20260323
$env:CODEX_HOME = Join-Path $PWD ".codex-home"

sdtk-code init --runtime codex --project-path .
sdtk-code runtime install --runtime codex --scope user
sdtk-code runtime status --runtime codex
```

#### Claude path

```powershell
cd D:\Projects\Vaix\AndesCloud\Workflow_20260323

sdtk-code init --runtime claude --project-path .
sdtk-code runtime install --runtime claude --scope project --project-path .
sdtk-code runtime status --runtime claude --project-path .
```

### 6.3 Start the real `WORKFLOW` coding workflow

The handoff already suggests the correct next command:

```powershell
cd D:\Projects\Vaix\AndesCloud\Workflow_20260323

sdtk-code start --feature-key WORKFLOW --lane feature --project-path .
```

Expected result:

- `docs/dev/CODE_WORKFLOW_WORKFLOW.md` is created
- intake outcome should be `READY_FOR_PLAN`

Before doing anything else, read:

- `docs/dev/CODE_WORKFLOW_WORKFLOW.md`

That file becomes the control-plane memory for the rest of the coding work.

## 7. The Right Way To Continue After `start`

Unlike `SDTK-SPEC`, `SDTK-CODE` is not currently a "wizard" that asks the user whether to run the next phase automatically.

The practical operating loop is:

1. run one `sdtk-code` phase command
2. open the workflow artifact
3. review the recorded state and next legal phase
4. let the coding agent work inside that phase
5. only then run the next `sdtk-code` command

For this reason, the best testing style is:

- command-by-command
- one review point between phases
- no attempt to automate the whole feature in one shot

## 8. Recommended `plan` Command For The Workflow Pilot

After `start`, do not plan the whole system.

`sdtk-code plan --use-seeded-candidates` now exists for cases where you want to accept the formal handoff slice set as-is.

Do not use that shortcut for this Workflow pilot.

Reason:

- the approved pilot intentionally narrows the broader handoff candidates into `B1-min`, `B2-min`, `F1-min`, and `F2-min`
- this project needs an explicit pilot slice selection, not a wholesale acceptance of the broader seeded set

Plan only the first vertical slice:

```powershell
cd D:\Projects\Vaix\AndesCloud\Workflow_20260323

sdtk-code plan --feature-key WORKFLOW --project-path . `
  --in-scope "Pilot vertical slice: Workflow Definition Basic Info create" `
  --in-scope "Frontend form -> backend API -> PostgreSQL insert -> list refresh" `
  --out-scope "Definition item builder" `
  --out-scope "Approval-step builder" `
  --out-scope "Applicant submission flow" `
  --out-scope "Approver action flow" `
  --out-scope "Email approval and integration dispatch" `
  --slice "B1-min: workflow category + workflow definition models and migrations" `
  --slice "B2-min: categories list + definition create/list/update endpoints" `
  --slice "F1-min: shared frontend API client and auth shell" `
  --slice "F2-min: definition list + basic info create/edit screen" `
  --assumption "At least one workflow category can be seeded before UI save flow" `
  --risk "No pre-existing codebase exists yet; app bootstrap may dominate the first build pass" `
  --note "Pilot success is one real insert reaching PostgreSQL through the UI path"
```

What this does:

- narrows the scope to a testable pilot
- avoids drowning the first run in full approval-engine complexity
- gives the coding agent a coherent implementation target

## 9. What The Coding Agent Should Implement In Stage B

Treat the pilot as one narrow feature, not the whole Workflow Engine.

### 9.1 Backend target

Minimum backend deliverables:

- PostgreSQL connection and app bootstrap
- migrations for the minimal category + definition subset
- seed data for definition status and at least one category
- list/create/update APIs for workflow definitions
- list API for categories
- backend unit/integration tests for this pilot scope

Do not implement yet:

- application submission
- approval state machine
- email approval token
- integration dispatcher

### 9.2 Frontend target

Minimum frontend deliverables:

- app shell and routing for the admin workflow definition pages
- API client for category and definition endpoints
- definition list page
- definition basic info create/edit page
- successful save flow with clear error handling

Do not implement yet:

- form item builder
- approval-step builder
- applicant screens
- approver screens

### 9.3 Database proof

The pilot is not complete until you can prove:

- a real row exists in PostgreSQL after saving from the UI

Recommended proof artifacts:

- frontend screenshot or browser capture
- saved API request/response sample
- database query output saved to `docs/dev/evidence/WORKFLOW/`

## 10. Suggested `build` Usage During The Pilot

Use `build` to record real progress after each major pass.

### 10.1 Build pass for app bootstrap and database foundation

```powershell
sdtk-code build --feature-key WORKFLOW --project-path . `
  --active-slice "B1-min: workflow category + workflow definition models and migrations" `
  --note "Bootstrapped Django + PostgreSQL project skeleton for the WORKFLOW pilot" `
  --note "Prepared minimal schema for category and definition persistence"
```

### 10.2 Build pass for API layer

```powershell
sdtk-code build --feature-key WORKFLOW --project-path . `
  --active-slice "B2-min: categories list + definition create/list/update endpoints" `
  --note "Implemented pilot admin APIs for definition basic-info persistence"
```

### 10.3 Build pass for frontend integration

```powershell
sdtk-code build --feature-key WORKFLOW --project-path . `
  --active-slice "F1-min: shared frontend API client and auth shell" `
  --active-slice "F2-min: definition list + basic info create/edit screen" `
  --note "Connected admin screen to pilot backend endpoints"
```

### 10.4 Build completion

Only mark the build pass complete when the UI can submit successfully and the backend persists data:

```powershell
sdtk-code build --feature-key WORKFLOW --project-path . `
  --active-slice "Pilot vertical slice complete" `
  --note "Frontend create flow reaches backend and persists to PostgreSQL" `
  --complete
```

If implementation is blocked, do not force completion:

```powershell
sdtk-code build --feature-key WORKFLOW --project-path . `
  --active-slice "F2-min: definition list + basic info create/edit screen" `
  --debug-note "Backend contract drift between OpenAPI and serializer payload" `
  --blocked
```

## 11. What To Verify Before You Claim The Pilot Works

Do not jump from `build` to "looks okay."

Collect real evidence.

Minimum pilot evidence:

1. backend tests pass for the implemented subset
2. frontend screen renders and submits
3. API response is successful
4. database row is inserted
5. created data is visible again on the list screen

Suggested evidence files:

- `docs/dev/evidence/WORKFLOW/backend-tests.txt`
- `docs/dev/evidence/WORKFLOW/frontend-tests.txt`
- `docs/dev/evidence/WORKFLOW/api-create-definition.txt`
- `docs/dev/evidence/WORKFLOW/db-insert-check.txt`
- `docs/dev/evidence/WORKFLOW/ui-smoke-notes.txt`

### 11.1 Suggested `verify` command

```powershell
sdtk-code verify --feature-key WORKFLOW --project-path . `
  --evidence "python manage.py test|Pilot backend tests pass|pass|docs/dev/evidence/WORKFLOW/backend-tests.txt" `
  --evidence "npm run test --workspace=frontend|Pilot frontend tests pass|pass|docs/dev/evidence/WORKFLOW/frontend-tests.txt" `
  --evidence "POST /api/v1/workflow/definitions|Definition create API succeeded|pass|docs/dev/evidence/WORKFLOW/api-create-definition.txt" `
  --evidence "SELECT code, name FROM cld_dat_workflow_definition|Inserted row confirmed in PostgreSQL|pass|docs/dev/evidence/WORKFLOW/db-insert-check.txt" `
  --spec-status pass `
  --quality-status partial `
  --quality-note "Pilot slice validated, but full workflow engine scope remains unimplemented" `
  --complete
```

Use `partial` for quality if the pilot passed but the whole feature is still far from completion.

## 12. What To Record In `ship`

For the pilot, you usually want `finish`, not `ship`.

Reason:

- you are closing the pilot pass, not releasing the full Workflow Engine

Decision guide for this project:

| Decision | Use when | What to record |
|---|---|---|
| `finish` | The bounded pilot passed, but remaining hardening, deployment, or expansion work is still explicit | For this feature-lane pilot, use at least two `--preflight` entries, plus explicit `--follow-up` and `--note` entries for the remaining work and pilot boundary |
| `ship` | You are claiming the stronger release-style closure for the implemented scope | Use at least two `--preflight` entries and a clearer release boundary than the pilot closeout path |

Practical note:

- for this `WORKFLOW` pilot, `finish` is the truthful choice
- reserve `ship` for a later boundary where the implemented scope is stronger than a bounded vertical-slice pass

Suggested command:

```powershell
sdtk-code ship --feature-key WORKFLOW --project-path . `
  --decision finish `
  --preflight "Pilot vertical slice review|UI -> API -> DB persistence confirmed|pass|docs/dev/evidence/WORKFLOW/db-insert-check.txt" `
  --preflight "Operator readiness review|Auth, settings, and operator assumptions reviewed for the next environment|pass|docs/dev/evidence/WORKFLOW/operator-readiness-review.txt" `
  --follow-up "Expand B2 from basic info CRUD to full definition-item builder" `
  --follow-up "Implement applicant and approver flows only after the pilot stack is stable" `
  --note "Pilot proves SDTK-CODE can drive a real implementation slice from SDTK-SPEC handoff"
```

Reserve `ship` for a genuine deployable release boundary.

If you later run a narrower bugfix-style closeout instead of a feature-lane pilot closeout, the lighter bounded `finish` path can still remain valid with one `--preflight`.

## 13. What Not To Do On The First Test

Do not start with:

- all 13 database tables
- all 24 API endpoints
- all 10 screens
- full approval engine
- email approval flow
- LINE Works or external integration dispatch

That will tell you nothing useful about whether `SDTK-CODE` itself is working well.

What you need first is:

- one real workflow artifact
- one narrow plan
- one successful vertical slice
- one real verify pass with evidence

## 14. Recommended Working Pattern With An Agent

If you want a usage style closer to `SDTK-SPEC`, use this manual operator loop:

1. run `sdtk-code start`
2. ask the agent to read:
   - `docs/dev/CODE_WORKFLOW_WORKFLOW.md`
   - `docs/dev/CODE_HANDOFF_WORKFLOW.json`
   - `docs/dev/FEATURE_IMPL_PLAN_WORKFLOW.md`
3. ask the agent to propose the exact next `plan` command for the narrowest useful slice
4. approve or adjust the slice
5. let the agent implement only that slice
6. run `build`
7. review evidence
8. run `verify`
9. record `finish`

This gives you the same practical review gate that `SDTK-SPEC` gives, even though `SDTK-CODE` itself is not a prompt wizard.

## 15. Recommended Order For The Workflow Project

Use this exact order:

1. install `sdtk-code-kit@0.1.0`
2. initialize runtime assets for Codex or Claude
3. run `sdtk-code start --feature-key WORKFLOW --lane feature --project-path .`
4. inspect `docs/dev/CODE_WORKFLOW_WORKFLOW.md`
5. run `plan` only for the pilot slice
6. implement only:
   - `B1-min`
   - `B2-min`
   - `F1-min`
   - `F2-min`
7. run `build` as progress is made
8. verify real UI -> API -> DB persistence
9. run `verify`
10. run `ship --decision finish`
11. only then expand to:
   - full definition editor
   - submission and approval engine
   - notifications and integration

## 16. Final Recommendation

For this project, the correct first test of `SDTK-CODE` is not:

- "Can it generate the whole system?"

The correct first test is:

- "Can it take a real `SDTK-SPEC` handoff, create a legal workflow artifact, drive one narrow implementation plan, and help deliver one real frontend -> API -> database slice with evidence?"

If that pilot passes, then the toolkit is behaving correctly at the boundary that matters.

## 17. References

- `products/sdtk-code/governance/SDTKCODE_TOOLKIT_USAGE_GUIDE.md`
- `products/sdtk-code/governance/installation-runbook.md`
- `products/sdtk-code/governance/workflow-contract.md`
- `products/sdtk-code/governance/workflow-routing-matrix.md`
- `products/sdtk-code/governance/workflow-state-model.md`
- `D:/Projects/Vaix/AndesCloud/Workflow_20260323/docs/dev/CODE_HANDOFF_WORKFLOW.json`
- `D:/Projects/Vaix/AndesCloud/Workflow_20260323/docs/dev/FEATURE_IMPL_PLAN_WORKFLOW.md`
- `D:/Projects/Vaix/AndesCloud/Workflow_20260323/docs/reports/SDTK_SPEC_CLAUDE_PIPELINE_REPORT_WORKFLOW_20260323.md`
