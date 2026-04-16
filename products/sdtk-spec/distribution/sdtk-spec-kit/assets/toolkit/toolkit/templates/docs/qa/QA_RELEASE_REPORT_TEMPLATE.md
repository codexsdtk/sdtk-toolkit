# QA Release Report: {{FEATURE_KEY}} ({{FEATURE_NAME}})

**Document ID:** QA_RELEASE_REPORT_{{FEATURE_KEY}}
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** QA Agent
**Status:** DRAFT

---

## 1. SUMMARY

| Item | Value |
|------|-------|
| Release Decision | TBD (APPROVED / REJECTED) |
| Build/Commit | TBD |
| Environment | TBD |
| `CODE_HANDOFF` | `docs/dev/CODE_HANDOFF_{{FEATURE_KEY}}.json` |
| `OPS_HANDOFF` | `docs/dev/OPS_HANDOFF_{{FEATURE_KEY}}.json` |
| `REVIEW_PACKET` | `docs/dev/REVIEW_PACKET_{{FEATURE_KEY}}.md` |
| Controller Acceptance Artifact | `docs/qa/CONTROLLER_ACCEPTANCE_{{FEATURE_KEY}}.md` |
| Lane Coverage Status | TBD (COMPLETE / PARTIAL / BLOCKED) |
| Targeted-Fix Route | If rejected: targeted fix -> refreshed verify -> refreshed QA -> controller |
| CODE Evidence | TBD |
| OPS Evidence | TBD |
| Test Case Spec | `docs/qa/{{FEATURE_KEY}}_TEST_CASE.md` (if used) |

---

Current formal suite flow: `DEV-Code -> DEV-Run -> QA`. Final approval requires both CODE evidence and OPS evidence. `QA_RELEASE_REPORT_[FEATURE_KEY].md` remains the primary QA output even when a downstream controller acceptance artifact also exists.

---

## 2. EVIDENCE BRIDGE

### 2.1 CODE EVIDENCE

| Evidence Type | Status | Ref / Command | Notes |
|---------------|--------|---------------|-------|
| `CODE_HANDOFF` reviewed | TBD | `docs/dev/CODE_HANDOFF_{{FEATURE_KEY}}.json` | |
| `REVIEW_PACKET` reviewed | TBD | `docs/dev/REVIEW_PACKET_{{FEATURE_KEY}}.md` | |
| Downstream implementation evidence reviewed | TBD | TBD | |
| `REVIEW_PACKET` used as verify input only | TBD | `docs/dev/REVIEW_PACKET_{{FEATURE_KEY}}.md` | QA verdict remains here |

### 2.2 OPS EVIDENCE

| Evidence Type | Status | Ref / Command | Notes |
|---------------|--------|---------------|-------|
| `OPS_HANDOFF` reviewed | TBD | `docs/dev/OPS_HANDOFF_{{FEATURE_KEY}}.json` | |
| Downstream operational evidence reviewed | TBD | TBD | |

`OPS_HANDOFF` alone is not sufficient final release evidence. When operationalization is in scope, final QA approval requires both the formal handoff and downstream OPS evidence.

---

## 3. QA REVIEW LANE RESULTS

### 3.1 Contract Review

- Scope Checked: TBD
- Findings: TBD
- Severity: TBD
- Evidence Refs: TBD
- Residual Risk / Notes: TBD

### 3.2 Behavior Review

- Scope Checked: TBD
- Findings: TBD
- Severity: TBD
- Evidence Refs: TBD
- Residual Risk / Notes: TBD

### 3.3 Evidence Review

- Scope Checked: TBD
- Findings: TBD
- Severity: TBD
- Evidence Refs: TBD
- Residual Risk / Notes: TBD

### 3.4 Truth-Sync Review

- Scope Checked: TBD
- Findings: TBD
- Severity: TBD
- Evidence Refs: TBD
- Residual Risk / Notes: TBD

### 3.5 Closeout Hygiene Review

- Scope Checked: TBD
- Findings: TBD
- Severity: TBD
- Evidence Refs: TBD
- Residual Risk / Notes: TBD

---

## 4. TEST EXECUTION

| Test Type | Result | Notes |
|-----------|--------|------|
| Unit | TBD | |
| Integration | TBD | |
| E2E | TBD | |
| OPS Verification | TBD | Required for the current formal suite flow |

---

## 5. DEFECTS

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| BUG-01 | MEDIUM | TBD | OPEN |

---

## 6. RELEASE GATE

- [ ] `CODE_HANDOFF` reviewed and aligned to tested scope
- [ ] `REVIEW_PACKET` reviewed and aligned to tested scope
- [ ] `3.1 Contract Review` completed
- [ ] `3.2 Behavior Review` completed
- [ ] `3.3 Evidence Review` completed
- [ ] `3.4 Truth-Sync Review` completed
- [ ] `3.5 Closeout Hygiene Review` completed
- [ ] Findings are severity-ordered and evidence-backed
- [ ] Verdict wording and release-gate wording are consistent
- [ ] `REVIEW_PACKET` remained input-only and did not replace the QA verdict
- [ ] CODE evidence reviewed and sufficient
- [ ] `OPS_HANDOFF` reviewed and aligned to tested scope
- [ ] OPS evidence reviewed and sufficient
- [ ] Missing required OPS evidence blocks `APPROVED`
- [ ] 0 HIGH severity open
- [ ] Coverage meets targets
- [ ] NFRs met (performance/security)

---

## 7. REJECTION / TARGETED-FIX ROUTING

- If the batch is rejected, keep the next pass bounded to the exact findings.
- Required refresh order: targeted fix -> refreshed `verify` -> refreshed QA -> controller.
- Do not widen scope silently during the targeted-fix loop.

---

## 8. HANDOFF

If APPROVED:
`Notify @pm and stakeholders that QA approved {{FEATURE_KEY}}. PM may coordinate closure communication, but QA remains the final release authority for this verdict.`

---

## 9. OPEN QUESTIONS / CLARIFICATIONS

Use this section when acceptance criteria, expected behavior, or scope is unclear. Escalate to PM; if PM cannot resolve from docs, PM must confirm with the user.

| Q-ID | Question | Decision Owner (PM/User) | Status (OPEN/RESOLVED) | Notes/Options | Resolution |
|------|----------|---------------------------|------------------------|---------------|------------|
| OQ-01 | TBD | PM | OPEN | TBD | TBD |
