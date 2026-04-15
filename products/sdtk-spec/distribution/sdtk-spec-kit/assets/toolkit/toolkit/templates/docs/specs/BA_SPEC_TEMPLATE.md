# BA SPEC: {{FEATURE_KEY}} ({{FEATURE_NAME}})

**Document ID:** BA_SPEC_{{FEATURE_KEY}}
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** BA Agent
**Status:** DRAFT - Ready for PM Review

---

## Abbreviations

| No | Abbreviation | Meaning |
| ---: | --- | --- |
| 1 | API | Application Programming Interface |
| 2 | DB | Database |
| 3 | UI | User Interface |
| 4 | UX | User Experience |
| 5 | BR | Business Rule |
| 6 | UC | Use Case |
| 7 | AC | Acceptance Criteria |
| 8 | NFR | Non-Functional Requirement |
| 9 | OQ | Open Question |
| 10 | REQ | Requirement |

---

## 1. DOMAIN ANALYSIS

### 1.1 Domain Glossary

| No | Term | Definition | Example |
| ---: | --- | --- | --- |
| 1 | TBD | TBD | TBD |

### 1.2 Business Rules

| No | Rule ID | Rule Description | Type | Related REQ |
| ---: | --- | --- | --- | --- |
| 1 | BR-01 | TBD | Mandatory | REQ-01 |

### 1.3 Non-Functional Requirements

| No | NFR ID | Category | Requirement | Target |
| ---: | --- | --- | --- | --- |
| 1 | NFR-01 | Performance | TBD | TBD |

---

## 2. USE CASES

| No | UC ID | Use Case Name | Primary Actor | Related REQ |
| ---: | --- | --- | --- | --- |
| 1 | UC-01 | TBD | TBD | REQ-01 |

---

## 3. DATA MODEL (Logical)

| No | Entity | Description | Key Fields |
| ---: | --- | --- | --- |
| 1 | TBD | TBD | TBD |

---

## 4. CONTRACTS SUMMARY

### 4.1 API Endpoints (High-level)

| No | Endpoint | Method | Purpose | Related UC |
| ---: | --- | --- | --- | --- |
| 1 | `/api/v1/...` | GET | TBD | UC-01 |

### 4.2 UI Screens (if applicable)

| No | Screen ID | Screen Name | Purpose | Related UC |
| ---: | --- | --- | --- | --- |
| 1 | SCR-01 | TBD | TBD | UC-01 |

### 4.3 Acceptance Criteria (high-level)

| No | AC ID | Acceptance Criteria | Related UC | Related BR |
| ---: | --- | --- | --- | --- |
| 1 | AC-01-01 | TBD | UC-01 | BR-01 |

---

## 5. RISKS & OPEN QUESTIONS

### 5.1 Risks

| No | Risk ID | Risk | Probability | Impact | Mitigation |
| ---: | --- | --- | --- | --- | --- |
| 1 | R-01 | TBD | Medium | Medium | TBD |

### 5.2 Open Questions

| No | Q-ID | Question | Type | Priority | Decision Owner (PM/User) | Status (OPEN/RESOLVED) | Notes/Options | Resolution |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | OQ-01 | TBD | Business | High | PM | OPEN | TBD | TBD |

---

## 6. TRACEABILITY SUMMARY

| No | REQ ID | Use Cases | Business Rules | Acceptance Criteria | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | REQ-01 | UC-01 | BR-01 | AC-01-01 | COVERED |

---

## 7. HANDOFF

HANDOFF TO PM:
`@pm BA_SPEC_{{FEATURE_KEY}} is ready. Please create PRD_{{FEATURE_KEY}}.md + BACKLOG_{{FEATURE_KEY}}.md`

Next:
`@arch please design architecture for {{FEATURE_KEY}} after PM review`

NOTE:
`@pm please resolve Open Questions (OQ-xx) above; if any cannot be resolved from existing docs, please confirm with the user (final stakeholder).`

---

## APPENDIX A: Source Requirements (Original VI/JP) - keep as-is

If the input requirements were provided in Vietnamese/Japanese, paste them here unchanged.

## APPENDIX B: English Translation (of Appendix A)

Provide an English translation of Appendix A (literal, for traceability).

---

## Document History

| No | Version | Date | Author | Changes |
| ---: | --- | --- | --- | --- |
| 1 | 1.0.0 | {{DATE}} | BA Agent | Initial template-based version |
