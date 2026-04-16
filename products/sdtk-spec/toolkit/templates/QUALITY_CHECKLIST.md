# QUALITY CHECKLIST
## Multi-Agent Development Pipeline Gates (v2.1 - 6 Phases)

**Current Feature:** `{{FEATURE_KEY}}`
**Last Updated:** `{{DATETIME}}`
**Overall Status:** `PHASE 1 PM INITIATION - IN PROGRESS`

---

## PHASE 1: PM INITIATION (Project Kickoff) CHECKLIST

| # | Criteria | Status | Verified By | Notes/Issues | Date |
|---|----------|--------|-------------|--------------|------|
| 1 | Requirements received from stakeholders | [ ] Pending | PM Agent | | |
| 2 | Business problem clearly defined | [ ] Pending | PM Agent | | |
| 3 | High-level scope documented (REQ-xx) + Open Questions (OQ-xx) captured | [ ] Pending | PM Agent | | |
| 4 | Stakeholders identified | [ ] Pending | PM Agent | | |
| 5 | Success criteria defined (measurable) | [ ] Pending | PM Agent | | |
| **6** | **PM INITIATION COMPLETE** | [ ] Pending | **PM Gate** | **@ba please analyze** | |

---

## PHASE 2: BA (Business Analysis) CHECKLIST

| # | Criteria | Status | Verified By | Notes/Issues | Date |
|---|----------|--------|-------------|--------------|------|
| 1 | Domain Glossary complete (all terms defined) | [ ] Pending | BA Agent | | |
| 2 | Business Rules numbered and complete (BR-01...) | [ ] Pending | BA Agent | | |
| 3 | Use Cases cover 100% requirements (UC-01...) | [ ] Pending | BA Agent | | |
| 4 | Data entities and relationships documented | [ ] Pending | BA Agent | | |
| 5 | Risks identified + prioritized (High/Med/Low) | [ ] Pending | BA Agent | | |
| 6 | Open questions listed for PM/ARCH review | [ ] Pending | BA Agent | | |
| **7** | **BA SPECS READY** | [ ] Pending | **BA Gate** | **@pm specs ready for PRD** | |

---

## PHASE 2+: PM PLANNING CHECKLIST

| # | Criteria | Status | Verified By | Notes/Issues | Date |
|---|----------|--------|-------------|--------------|------|
| 1 | PRD aligns 100% with BA specs + resolves/records OQ decisions | [ ] Pending | PM Agent | | |
| 2 | Backlog 100% traceable to BA Use Cases | [ ] Pending | PM Agent | | |
| 3 | Story priorities reflect business value (MoSCoW) | [ ] Pending | PM Agent | | |
| 4 | Success metrics defined and measurable | [ ] Pending | PM Agent | | |
| 5 | Release criteria objective and testable | [ ] Pending | PM Agent | | |
| 6 | Effort estimates realistic (Fibonacci story points) | [ ] Pending | PM Agent | | |
| **7** | **PM BACKLOG READY** | [ ] Pending | **PM Gate** | **@arch please design** | |

---

## PHASE 3: ARCH (Solution Architecture) CHECKLIST

| # | Criteria | Status | Verified By | Notes/Issues | Date |
|---|----------|--------|-------------|--------------|------|
| 1 | System architecture diagram complete + assumptions/OQ documented | [ ] Pending | ARCH Agent | | |
| 2 | Database schema/ERD documented + `DATABASE_SPEC_[FEATURE_KEY].md` updated (if DB scope) | [ ] Pending | ARCH Agent | | |
| 3 | API contract docs updated (`[FeaturePascal]_API.yaml` + `[FEATURE_KEY]_ENDPOINTS.md`) when API scope exists | [ ] Pending | ARCH Agent | | |
| 4 | API flow list updated (`[feature_snake]_api_flow_list.txt`) when API scope exists | [ ] Pending | ARCH Agent | | |
| 5 | API design detail updated (`[FEATURE_KEY]_API_DESIGN_DETAIL.md`) when API scope exists and mode is `auto/on` | [ ] Pending | ARCH Agent | Mode from `sdtk-spec.config.json` | |
| 6 | Flow-action screen spec updated (`[FEATURE_KEY]_FLOW_ACTION_SPEC.md`) when UI flow scope exists | [ ] Pending | ARCH Agent | | |
| 7 | Screen layout spec updated (`DESIGN_LAYOUT_[FEATURE_KEY].md`) when UI scope exists | [ ] Pending | ARCH Agent | | |
| 8 | Security model documented (auth/authz) | [ ] Pending | ARCH Agent | | |
| **9** | **ARCH DESIGN READY** | [ ] Pending | **ARCH Gate** | **@dev please plan and prepare SDTK-CODE handoff** | |

---

## PHASE 4: DEV (Implementation Planning + SDTK-CODE Handoff) CHECKLIST

| # | Criteria | Status | Verified By | Notes/Issues | Date |
|---|----------|--------|-------------|--------------|------|
| 1 | `FEATURE_IMPL_PLAN` matches ARCH design + backlog + clarifications logged (OQ-xx) | [ ] Pending | Dev Agent | | |
| 2 | Implementation slices are explicit and scope-bounded | [ ] Pending | Dev Agent | | |
| 3 | Required refs include all mandatory upstream source documents | [ ] Pending | Dev Agent | | |
| 4 | Test obligations are explicit enough for downstream verification | [ ] Pending | Dev Agent | | |
| 5 | Readiness decision is explicit (`READY_FOR_SDTK_CODE` or `BLOCKED_FOR_SDTK_CODE`) | [ ] Pending | Dev Agent | | |
| 6 | `CODE_HANDOFF_[FEATURE_KEY].json` generated or validated successfully | [ ] Pending | Dev Agent | | |
| **7** | **DEV READY FOR SDTK-CODE** | [ ] Pending | **Dev Gate** | **If ready: suggest `sdtk-code start ...`; if blocked: keep blockers visible** | |

---

## PHASE 5: QA (Quality Assurance) CHECKLIST

| # | Criteria | Status | Verified By | Notes/Issues | Date |
|---|----------|--------|-------------|--------------|------|
| 1 | Test Strategy covers all critical paths + unclear ACs escalated (OQ-xx) | [ ] Pending | QA Agent | | |
| 2 | Test case specification updated (`[FEATURE_KEY]_TEST_CASE.md`) when detailed test design scope exists | [ ] Pending | QA Agent | | |
| 3 | CODE evidence reviewed and aligned to `CODE_HANDOFF_[FEATURE_KEY].json` | [ ] Pending | QA Agent | | |
| 4 | `OPS_HANDOFF_[FEATURE_KEY].json` reviewed and aligned to tested scope | [ ] Pending | QA Agent | | |
| 5 | OPS evidence reviewed and sufficient | [ ] Pending | QA Agent | Missing required OPS evidence blocks approval | |
| 6 | **E2E Tests:** P1 flows PASS (if applicable) | [ ] Pending | QA Agent | | |
| 7 | **Defects:** 0 HIGH severity open | [ ] Pending | QA Agent | | |
| 8 | **Coverage:** meets targets | [ ] Pending | QA Agent | | |
| 9 | No flaky tests | [ ] Pending | QA Agent | | |
| 10 | Performance meets NFRs | [ ] Pending | QA Agent | | |
| 11 | Release Report complete | [ ] Pending | QA Agent | | |
| **12** | **QA APPROVED** | [ ] Pending | **QA Gate** | **Record QA final decision; notify @pm for stakeholder communication and PM closure follow-up** | |

---

## PHASE 6: PM CLOSURE CHECKLIST

| # | Criteria | Status | Verified By | Notes/Issues | Date |
|---|----------|--------|-------------|--------------|------|
| 1 | QA release decision reviewed by PM | [ ] Pending | PM Agent | | |
| 2 | Outstanding OQ/risks triaged for next iteration | [ ] Pending | PM Agent | | |
| 3 | Final status communicated to stakeholders | [ ] Pending | PM Agent | No prose-only `committed`, `pushed`, `publish-ready`, or `ship complete` claim without exact git evidence | |
| **4** | **FEATURE CLOSURE COMPLETE** | [ ] Pending | **PM Gate** | **Pipeline complete** | |

---

## FINAL RELEASE GATE

```
RELEASE STATUS: IN PROGRESS

FINAL VERIFICATION:
[ ] Phase 1 PM Init
[ ] Phase 2 BA
[ ] Phase 2+ PM Plan
[ ] Phase 3 ARCH
[ ] Phase 4 DEV + SDTK-CODE Handoff
[ ] Phase 5 QA
[ ] Phase 6 PM Closure
```
