# REQUIREMENT: {{FEATURE_KEY}}

**Document ID:** REQUIREMENT_{{FEATURE_KEY}}
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** Orchestrator / Discovery Agent
**Status:** DRAFT - Pre-PM Discovery

Purpose: lightweight discovery artifact for raw ideas and unclear feature concepts before formal PM initiation.

This artifact is:
- pre-PM initiation
- the canonical clarification record for `docs/discovery/REQUIREMENT_[FEATURE_KEY].md`
- not a replacement for `PROJECT_INITIATION`, PRD, BA spec, backlog, or architecture artifacts

---

## 1. Problem / Idea Summary

**Idea Name:** {{FEATURE_NAME}}

### 1.1 Summary

### 1.2 Success Signal (optional)

---

## 2. User Goal / Desired Outcome

### 2.1 Desired Outcome

### 2.2 Why This Matters Now

---

## 3. Target Users / Stakeholders

| Group | Role / Stakeholder | Need / Expectation |
|---|---|---|
| TG-01 | TBD | TBD |

---

## 4. Current Pain / Trigger

### 4.1 Current Situation

### 4.2 Pain, Friction, or Opportunity

### 4.3 Triggering Context

---

## 5. Proposed Scope

### 5.1 In Scope
- TBD

### 5.2 Candidate Workflows / Lanes Affected (optional)
- TBD

---

## 6. Out of Scope / Non-Goals

- TBD

---

## 7. Assumptions

| ID | Assumption | Confidence | Notes |
|---|---|---|---|
| A-01 | TBD | TBD | TBD |

---

## 8. Constraints / Dependencies

| ID | Constraint / Dependency | Type | Impact | Notes |
|---|---|---|---|---|
| C-01 | TBD | TBD | TBD | TBD |

---

## 9. Open Questions

| OQ-ID | Question | Why It Matters | Owner | Status |
|---|---|---|---|---|
| OQ-01 | TBD | TBD | TBD | OPEN |

---

## 10. Candidate Feature Key

**Candidate Feature Key:** `{{FEATURE_KEY}}`

Naming note:
- use a stable candidate key once the idea is distinct enough to track
- rename only if the scope materially changes before PM initiation

---

## 11. Risks (optional)

| Risk ID | Risk | Impact | Mitigation / Note |
|---|---|---|---|
| R-01 | TBD | TBD | TBD |

---

## 12. Readiness Decision

**Decision:**
- `READY_FOR_PM_INITIATION`
- `NEEDS_MORE_DISCOVERY`
- `NOT_ACTIONABLE_YET`

**Current Decision:** `NEEDS_MORE_DISCOVERY`

Decision rules:
- `READY_FOR_PM_INITIATION`
  - problem is clear
  - target users or stakeholders are identified
  - scope and non-goals are bounded enough for PM kickoff
  - open questions do not block PM initiation
- `NEEDS_MORE_DISCOVERY`
  - direction is promising but key assumptions, constraints, or boundaries remain unresolved
- `NOT_ACTIONABLE_YET`
  - request is too vague, conflicting, speculative, or unsupported to begin PM initiation safely

---

## 13. Handoff Criteria To PM Initiation

Move to `docs/product/PROJECT_INITIATION_[FEATURE_KEY].md` only when:
1. this discovery artifact is marked `READY_FOR_PM_INITIATION`
2. the problem and desired outcome are understandable without relying on chat history alone
3. target users or stakeholders are identified well enough for PM kickoff
4. scope and non-scope are bounded enough to avoid a false PM start
5. remaining open questions are documented and are not blocking PM initiation

PM initiation handoff note:
- this document is the discovery bridge into formal PM initiation
- PM still owns `PROJECT_INITIATION`, PRD, backlog, and downstream SPEC artifacts

---

## APPENDIX A: Original Input (optional)

Paste source requirement text here when useful for traceability.

## APPENDIX B: Literal English Translation (optional)

If Appendix A is VI/JP, add a literal English translation here.
