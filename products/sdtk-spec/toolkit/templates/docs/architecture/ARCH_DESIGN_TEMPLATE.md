# Technical Architecture: {{FEATURE_KEY}} ({{FEATURE_NAME}})

**Document ID:** ARCH_DESIGN_{{FEATURE_KEY}}
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** ARCH Agent
**Status:** DRAFT - Ready for DEV Review

---

## Abbreviations

| No | Abbreviation | Meaning |
| ---: | --- | --- |
| 1 | API | Application Programming Interface |
| 2 | DB | Database |
| 3 | OQ | Open Question |
| 4 | NFR | Non-Functional Requirement |
| 5 | UC | Use Case |

---

## 1. EXECUTIVE SUMMARY

### 1.1 Tech Stack (project-level)
- Backend: {{STACK_BACKEND}}
- Frontend: {{STACK_FRONTEND}}
- Mobile: {{STACK_MOBILE}}
- Database: {{STACK_DATABASE}}
- Auth: {{STACK_AUTH}}

## 2. SCOPE

- In scope (Phase 1):
  - TBD
- Out of scope:
  - TBD

---

## 3. ASSUMPTIONS & OPEN QUESTIONS

### 3.1 Assumptions
- TBD (must be approved by PM if impacting behavior/API/security)

### 3.2 Open Questions (Clarifications Needed)

| No | Q-ID | Question | Decision Owner (PM/User) | Needed By (Phase) | Status (OPEN/RESOLVED) | Notes/Options | Resolution |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | OQ-01 | TBD | PM | Phase 3 (ARCH) | OPEN | TBD | TBD |

---

## 4. SYSTEM ARCHITECTURE

### 4.1 Diagram
TBD (ASCII/PlantUML/Mermaid)

### 4.2 Component Responsibilities

| No | Component | Responsibility | Technology | Notes |
| ---: | --- | --- | --- | --- |
| 1 | API | TBD | TBD | TBD |

---

## 5. DATA MODEL

| No | Table/Entity | Purpose | Key Fields | Notes |
| ---: | --- | --- | --- | --- |
| 1 | TBD | TBD | TBD | TBD |

---

## 6. API DESIGN (if applicable)

- OpenAPI: `docs/api/{{FEATURE_PASCAL}}_API.yaml`
- API endpoints spec (markdown): `docs/api/{{FEATURE_KEY}}_ENDPOINTS.md`
- Flow list: `docs/api/{{FEATURE_SNAKE}}_api_flow_list.txt`

---

## 7. UI DESIGN (if applicable)

- Screen layouts: `docs/design/DESIGN_LAYOUT_{{FEATURE_KEY}}.md`
- Flow-action screen spec: `docs/specs/{{FEATURE_KEY}}_FLOW_ACTION_SPEC.md`
- Related rule file: `toolkit/templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md`

---

## 8. DATABASE DESIGN (if applicable)

- Database spec: `docs/database/DATABASE_SPEC_{{FEATURE_KEY}}.md`

---

## 9. SECURITY & COMPLIANCE

- TBD

## 10. OBSERVABILITY

- TBD

## 11. HANDOFF

HANDOFF TO DEV:
`@dev please implement {{FEATURE_KEY}} based on ARCH_DESIGN + BACKLOG + API/layout/docs`

