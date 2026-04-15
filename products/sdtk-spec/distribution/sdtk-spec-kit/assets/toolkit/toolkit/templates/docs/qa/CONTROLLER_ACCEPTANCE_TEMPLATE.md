# CONTROLLER ACCEPTANCE: {{FEATURE_KEY}} ({{FEATURE_NAME}})

**Document ID:** CONTROLLER_ACCEPTANCE_{{FEATURE_KEY}}
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** Controller
**Status:** DRAFT

---

This artifact records the final controller batch-review verdict for `{{FEATURE_KEY}}`. It does not replace `QA_RELEASE_REPORT_{{FEATURE_KEY}}.md` as the primary QA output.

## 1. Verdict Summary

| Field | Value |
|------|-------|
| Outcome | TBD (`APPROVED` / `TARGETED_FIX_REQUIRED` / `REJECTED / REPLAN_REQUIRED`) |
| Decision Date | {{DATE}} |
| Controller Identity | TBD |
| Controller-Approved | TBD (`Yes` / `No`) |
| Commit-Ready | TBD (`Yes` / `No`) |
| Publish-Ready | TBD (`Yes` / `No`) |

---

## 2. Inputs Consumed

- `docs/qa/QA_RELEASE_REPORT_{{FEATURE_KEY}}.md`
- `docs/dev/REVIEW_PACKET_{{FEATURE_KEY}}.md`
- `docs/dev/CODE_WORKFLOW_{{FEATURE_KEY}}.md`
- `docs/dev/FEATURE_IMPL_PLAN_{{FEATURE_KEY}}.md`
- `docs/dev/CODE_HANDOFF_{{FEATURE_KEY}}.json`
- Any bounded audit outputs that materially informed the controller verdict

---

## 3. Severity-Ordered Findings

| No | Severity | Finding | Evidence Refs | Required Action |
|----|----------|---------|---------------|-----------------|
| 1 | TBD | TBD | TBD | TBD |

---

## 4. Commit Boundary Decision

### Include List

- TBD

### Exclude List

- TBD

### Rationale

- TBD

### Git Evidence Required

- `git status --short --untracked-files=all`
- `git diff --cached --name-only`
- `git show HEAD --name-only`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git log --oneline -3`

---

## 5. Readiness Label

- Label: TBD (`review-clean` / `commit-ready` / `publish-ready`)
- Rationale: TBD
- `publish-ready` must not be used as a fake ship or PM-closure claim when that later evidence does not yet exist.

---

## 6. Residual Follow-ups

| No | Follow-Up | Owner | Target Phase / Backlog Ref |
|----|-----------|-------|----------------------------|
| 1 | TBD | TBD | TBD |

---

## 7. QA / Release Interaction Note

- `QA_RELEASE_REPORT_{{FEATURE_KEY}}.md` remains the primary QA output.
- This controller artifact records final controller acceptance for the reviewed batch and does not override QA release authority.
- Rejected or targeted-fix outcomes route only through the bounded refresh order `verify -> QA -> controller`.
