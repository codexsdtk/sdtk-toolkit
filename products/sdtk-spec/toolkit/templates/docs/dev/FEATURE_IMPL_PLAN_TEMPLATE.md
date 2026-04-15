# Feature Implementation Plan: {{FEATURE_KEY}} ({{FEATURE_NAME}})

**Document ID:** FEATURE_IMPL_PLAN_{{FEATURE_KEY}}
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** DEV Agent
**Status:** DRAFT

---

## 1. OVERVIEW

### 1.1 Issue Summary And Scope
- Summarize the bounded implementation goal for this batch.
- State the approved surface boundary explicitly.

### 1.2 Explicit Non-Goals
- List the exact non-goals for this handoff.

### 1.3 Source Documents
- `docs/architecture/ARCH_DESIGN_{{FEATURE_KEY}}.md`
- `docs/product/BACKLOG_{{FEATURE_KEY}}.md`
- (optional) `docs/api/{{FEATURE_PASCAL}}_API.yaml`
- (optional) `docs/design/DESIGN_LAYOUT_{{FEATURE_KEY}}.md`

### 1.4 Tech Stack (project-level)
- Backend: {{STACK_BACKEND}}
- Frontend: {{STACK_FRONTEND}}
- Mobile: {{STACK_MOBILE}}
- Database: {{STACK_DATABASE}}
- Auth: {{STACK_AUTH}}

### 1.5 Issue-Specific Local Commands
- Replace project-level placeholder commands with issue-specific real commands before declaring readiness.
- Backend tests: `{{CMD_BACKEND_TESTS}}`
- Backend typecheck: `{{CMD_BACKEND_TYPECHECK}}`
- Backend lint: `{{CMD_BACKEND_LINT}}`
- Frontend tests: `{{CMD_FRONTEND_TESTS}}`
- Frontend lint: `{{CMD_FRONTEND_LINT}}`
- E2E tests: `{{CMD_E2E_TESTS}}`

---

## 2. IMPLEMENTATION SCOPE

### 2.1 Implementation Slices
- Slice 1: TBD
- Slice 2: TBD

### 2.2 Required Refs
- `docs/architecture/ARCH_DESIGN_{{FEATURE_KEY}}.md`
- `docs/product/BACKLOG_{{FEATURE_KEY}}.md`
- Additional required refs: TBD

### 2.3 Optional Refs
- TBD

### 2.4 Test Obligations
- Use issue-specific real commands only.
- TBD

---

## 3. OPEN BLOCKERS / CLARIFICATIONS

| Q-ID | Question | Decision Owner (PM/User) | Status (OPEN/RESOLVED) | Notes/Options | Resolution |
|------|----------|---------------------------|------------------------|---------------|------------|
| OQ-01 | TBD | PM | OPEN | TBD | TBD |

---

## 4. SDTK-CODE HANDOFF

**Canonical machine artifact:** `docs/dev/CODE_HANDOFF_{{FEATURE_KEY}}.json`
- Generator-owned artifact: write or refresh it with `toolkit/scripts/generate-code-handoff.ps1`
- Do not hand-author the JSON shape or copy planning tables directly into the JSON
- Use canonical snake_case keys only; do not use legacy camelCase keys such as `featureKey`, `requiredRefs`, or `suggestedNextCommand`
- Current canonical generator emission is schema `0.2`; `SDTK-CODE` still accepts `0.1` for bounded compatibility

### 4.1 Handoff Status
- `READY_FOR_SDTK_CODE` or `BLOCKED_FOR_SDTK_CODE`

### 4.2 Recommended Lane
- `feature` or `bugfix`

### 4.3 Required Refs
- `docs/architecture/ARCH_DESIGN_{{FEATURE_KEY}}.md`
- `docs/product/BACKLOG_{{FEATURE_KEY}}.md`
- Additional required refs: TBD

### 4.4 Optional Refs
- TBD

### 4.5 Open Blockers
- TBD

### 4.6 Implementation Slices
- Keep the list in the recommended downstream build order.
- TBD

### 4.7 Impact Map
- Auto-derived from the handoff refs when the canonical generator runs.
- Expected keys: `api_refs`, `database_refs`, `ui_refs`, `flow_refs`

### 4.8 Test Obligations
- Write implementation-ready acceptance mapping statements, not vague labels.
- TBD

### 4.9 Recovery Notes (Optional)
- Add only when `/dev` already knows a recovery-sensitive constraint or a do-not-guess reminder.
- TBD

### 4.10 Suggested Next Command
- If ready:
  - `sdtk-code start --feature-key {{FEATURE_KEY}} --lane feature --project-path .`
- If blocked:
  - no SDTK-CODE start command is suggested until blockers are resolved
