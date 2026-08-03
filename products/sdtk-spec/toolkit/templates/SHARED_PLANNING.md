# SHARED PLANNING DOCUMENT
## Multi-Agent Development Pipeline Tracker (v2.1 - 6 Phases)

**Current Feature:** `{{FEATURE_KEY}}`
**Feature Name:** `{{FEATURE_NAME}}`
**Last Updated:** `{{DATETIME}}`
**Pipeline Status:** `PHASE 1 - PM INITIATION (IN PROGRESS)`

---

## PIPELINE STATUS TABLE (6 Phases)

| Phase | Status | Owner | Start Date | Finish Date | Primary Artifact | Secondary Artifacts | Notes/Blockers |
|-------|--------|-------|------------|-------------|------------------|-------------------|---------------|
| **1. PM Init** | IN_PROGRESS | `@pm` | {{DATE}} | - | `PROJECT_INITIATION_{{FEATURE_KEY}}.md` | Scope + REQ-xx | |
| **2. BA** | Pending | `@ba` | - | - | `BA_SPEC_{{FEATURE_KEY}}.md` | BR/UC/AC/NFR | |
| **2+. PM Plan** | Pending | `@pm` | - | - | `PRD_{{FEATURE_KEY}}.md` | `BACKLOG_{{FEATURE_KEY}}.md` | |
| **3. ARCH** | Pending | `@arch` | - | - | `ARCH_DESIGN_{{FEATURE_KEY}}.md` | API + API_DETAIL + DB + UI specs | |
| **4. Dev** | Pending | `@dev` | - | - | `FEATURE_IMPL_PLAN_{{FEATURE_KEY}}.md` | `CODE_HANDOFF_{{FEATURE_KEY}}.json` + readiness decision | |
| **5. QA** | Pending | `@qa` | - | - | `QA_RELEASE_REPORT_{{FEATURE_KEY}}.md` | `{{FEATURE_KEY}}_TEST_CASE.md` + Test results | |
| **6. PM Closure** | Pending | `@pm` | - | - | Release decision recorded | Handoff complete | Requires QA + controller decisions and exact git truth before `committed` / `pushed` wording |

---

## VISUAL PIPELINE STATUS
```
[PM Init] IN_PROGRESS --> [BA] PENDING --> [PM Plan] PENDING --> [ARCH] PENDING --> [Dev] PENDING --> [QA] PENDING --> [PM Closure] PENDING
```

---

## ARTIFACTS LOCATION GUIDE

```
PM OUTPUTS:          docs/product/PROJECT_INITIATION_{{FEATURE_KEY}}.md
                     docs/product/PRD_{{FEATURE_KEY}}.md
                     docs/product/BACKLOG_{{FEATURE_KEY}}.md
BA OUTPUTS:          docs/specs/BA_SPEC_{{FEATURE_KEY}}.md
ARCH OUTPUTS:        docs/architecture/ARCH_DESIGN_{{FEATURE_KEY}}.md
                     docs/api/{{FEATURE_PASCAL}}_API.yaml
                     docs/api/{{FEATURE_KEY}}_ENDPOINTS.md
                     docs/api/{{FEATURE_KEY}}_API_DESIGN_DETAIL.md
                     docs/api/{{FEATURE_SNAKE}}_api_flow_list.txt
                     docs/database/DATABASE_SPEC_{{FEATURE_KEY}}.md
                     docs/specs/{{FEATURE_KEY}}_FLOW_ACTION_SPEC.md
                     docs/design/DESIGN_LAYOUT_{{FEATURE_KEY}}.md
DEV OUTPUTS:         docs/dev/FEATURE_IMPL_PLAN_{{FEATURE_KEY}}.md
                     docs/dev/CODE_HANDOFF_{{FEATURE_KEY}}.json
QA OUTPUTS:          docs/qa/{{FEATURE_KEY}}_TEST_CASE.md
                     docs/qa/QA_RELEASE_REPORT_{{FEATURE_KEY}}.md
SHARED STATE:        SHARED_PLANNING.md + QUALITY_CHECKLIST.md
```

---

## CURRENT BLOCKERS / ISSUES
```
NO BLOCKERS
```

---

## OPEN QUESTIONS (Summary)
List any unresolved OQ-xx items here with a pointer to the owning artifact (PM consolidates).

| Q-ID | Summary | Owner | Source Doc | Status |
|------|---------|-------|------------|--------|
| OQ-01 | TBD | PM | docs/specs/BA_SPEC_{{FEATURE_KEY}}.md | OPEN |

---

## RECENT ACTIVITY LOG (Agent Updates)

```
{{DATETIME}} | [SYSTEM] | INIT | Toolkit initialized for {{FEATURE_KEY}} | @pm please create PROJECT_INITIATION
```

**Append updates with format:**
```
YYYY-MM-DD HH:MM | [PM/BA/ARCH/DEV/QA] | [Status] | [Artifact] | @next_agent
```
