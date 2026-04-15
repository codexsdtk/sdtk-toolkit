# CONDENSED UPSTREAM INPUT: {{FEATURE_KEY}}

**Document ID:** CONDENSED_UPSTREAM_INPUT_{{FEATURE_KEY}}
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** PM Agent (condensation step)
**Status:** REQUIRES_HUMAN_REVIEW

---

> **REQUIRES_HUMAN_REVIEW**
>
> This document is a machine-assisted condensation of a basic product brief.
> All derived content below (actors, entities, screens, flows, rules, and
> acceptance criteria) is DRAFT only. A human PM or maintainer must review
> and confirm this package before the SPEC phase begins. SDTK must not
> auto-advance to PM or BA phases without explicit human confirmation (Gate H2).
>
> If the source brief was outside the agreed bounded domain, stop here and
> surface a boundary flag rather than proceeding (Gate H1).

---

## Input Statement

**Source brief:** Provide a one-line description of what was submitted as input.

**Approximate input length:** State the approximate word count of the source brief.

**Feature key assigned:** {{FEATURE_KEY}} (confirm or replace if the brief did not
include one; do not invent a feature key without human review).

**Condensation notes:** Record any material assumptions made during condensation
that were not explicit in the brief. List them as numbered items.

---

## 1. Actors

> Derived from the brief. Minimum: one requester-type role and one operator-type
> role. Mark additional roles with (implied) if not named explicitly in the brief.

| Role | Responsibility |
|------|----------------|
| Add derived actor rows here | One-line responsibility |

---

## 2. Entities

> Named data entities with key attributes at summary level. No full normalized
> data model required. Minimum: the primary request or work-item entity and its
> actor-linked entities.

| Entity | Key Attributes | Relationships |
|--------|----------------|---------------|
| Add derived entity rows here | Key attributes | Relationship notes |

---

## 3. Screen Candidates

> Candidate screens mapped to at least one actor. This is a candidate list only,
> not a final UI specification. Minimum: list screen, detail screen, creation
> form, and operator work-queue or dashboard.

| Screen | Purpose | Primary Actor |
|--------|---------|---------------|
| Add candidate screen rows here | One-sentence purpose | Actor |

---

## 4. Flows

> Named flows with start actor, trigger, key steps, and expected outcome.
> Minimum required flows: submit request, view requests, assign request,
> update status, close request.

### Flow 1: [Flow Name]

- **Start actor:** Actor name
- **Trigger:** Triggering event
- **Key steps:**
  1. Step one
  2. Step two
- **Expected outcome:** Outcome

> Add additional named flows following the same structure.

---

## 5. Business Rules (DRAFT)

> All rules below are DRAFT and require human review before adoption.
> Rules are derived from the brief or implied by the bounded domain.

| ID | Rule | Source |
|----|------|--------|
| BR-D01 | Add derived rule | Brief / Implied |

---

## 6. Draft Acceptance Criteria (DRAFT)

> All criteria below are DRAFT. They seed the SPEC phase and require human
> review before adoption. Express in Given/When/Then form.

| ID | Given | When | Then | Linked Flow |
|----|-------|------|------|-------------|
| AC-D01 | Precondition | Action | Expected result | Flow name |

---

## Gaps

> List any areas where the brief did not provide enough signal to derive content
> confidently. Each gap must be addressed by the PM or maintainer before the
> SPEC phase can proceed.

| ID | Gap Description | Needed By |
|----|----------------|-----------|
| GAP-01 | Describe what is missing | PM / BA phase |

---

## Approval/Workflow Domain Extension

> **Use this extension only for approval/workflow domain briefs.**
> For service/request tracker and other non-approval/workflow domains, omit
> this section entirely.
>
> When the source brief describes a request-approval pattern (e.g., leave
> approval, purchase approval, access request), the condensed upstream output
> document must use a **flat eight-section structure** rather than the base
> six-section structure above. The output document begins with the same
> REQUIRES_HUMAN_REVIEW header, Input Statement, and Next Step blocks, but
> replaces all numbered sections with the eight sections below, numbered
> consecutively. Do not append these subsections after a completed base
> six-section document; instead, produce the approval/workflow flat structure
> as the single unified output document.
>
> Section mapping from base to approval/workflow flat structure:
> - Section 1 Actors: same content and purpose as base Section 1. No change.
> - Section 2 Role Matrix: new section. Supplements Section 1 Actors with a
>   permission table. Must surface ambiguities rather than silently resolving
>   them.
> - Section 3 Workflow Entities: replaces base Section 2 Entities. Same
>   purpose but must include workflow-state-carrying fields explicitly.
> - Section 4 State Set: new section. Makes the workflow state machine
>   explicit with named states and terminal flags.
> - Section 5 State Transitions: new section. Lists all allowed and blocked
>   transitions with guard conditions and policy constraints.
> - Section 6 Policy And Approval Rules: replaces base Section 5 Business
>   Rules. Same DRAFT-labelled purpose; approval-specific rule set.
> - Section 7 Screens And Interaction Points: replaces base Sections 3 and 4
>   (Screen Candidates and Flows). For approval/workflow domains, named
>   screens and interaction points provide sufficient upstream structure.
> - Section 8 Draft Acceptance Criteria: same as base Section 6 but the last
>   column header is "Linked Transition" (not "Linked Flow") because criteria
>   anchor to state transitions rather than named flows in this domain.
> - Open Questions For Human Review: replaces the base Gaps section. Must
>   surface unresolved policy items explicitly with phase-owner tagging.
>
> Gate H3 (Policy Open Questions Review): all open questions in the Open
> Questions section must be reviewed by the PM or maintainer before the SPEC
> phase proceeds. Each question must be resolved with an explicit decision or
> carried forward as a named OQ-xx item into the BA_SPEC phase. Questions
> must not be silently dropped.
>
> For approval/workflow outputs, replace the generic Next Step instruction
> "Resolve all gaps listed above" with explicit review and resolution of the
> Open Questions For Human Review section under Gate H3.

### 2. Role Matrix

> A table mapping each actor to their permitted actions within the workflow.
> Mark each cell as YES, NO, or POLICY (permission depends on a configurable
> rule not fully specified in the brief). Surface any permission ambiguity;
> do not silently resolve it. At least one POLICY-tagged cell or one open
> question must appear if the brief does not fully specify all permissions.

| Actor | Can Submit | Can Approve | Can Reject | Can Request Revision | Can Resubmit | Can Delegate | Can Admin-Configure |
|-------|-----------|-------------|------------|---------------------|-------------|-------------|---------------------|
| Add actor rows here | YES / NO / POLICY | YES / NO / POLICY | YES / NO / POLICY | YES / NO / POLICY | YES / NO / POLICY | YES / NO / POLICY | YES / NO / POLICY |

### 3. Workflow Entities

> Named data entities with key attributes at summary level. Must include
> workflow-state-carrying fields explicitly. Minimum: Request entity (with
> state attribute), Submitter entity, Approver entity, WorkflowState entity
> or enumeration. No full normalized data model required at this stage.

| Entity | Key Attributes | Relationships |
|--------|----------------|---------------|
| Add entity rows here | Key attributes including state field | Relationship notes |

### 4. State Set

> An explicit named list of all workflow states the Request entity can occupy.
> Each state must have a name, brief description, responsible actor, and a
> terminal flag (YES or NO). Minimum required states: Draft, Submitted, Under
> Review, Approved (terminal: YES), Rejected, Revision Required.

| State | Description | Responsible Actor | Terminal |
|-------|-------------|------------------|----------|
| Add state rows here | One-line description | Actor responsible at this state | YES / NO |

### 5. State Transitions

> An explicit named list of allowed state transitions. Each transition must
> have: from-state, to-state, triggering actor, triggering action, and any
> guard condition or policy constraint. Mark policy-dependent transitions as
> POLICY and flag for human review. Explicitly list blocked transitions with
> the block reason.

| From State | To State | Triggering Actor | Triggering Action | Guard / Constraint |
|-----------|----------|-----------------|------------------|-------------------|
| Add transition rows here | | | | |

### 6. Policy And Approval Rules (DRAFT)

> All rules below are DRAFT and require human review before adoption. These
> rules govern approval logic, delegation, escalation, and boundary conditions.
> Each rule must carry the DRAFT label.

| ID | Rule | DRAFT |
|----|------|-------|
| APR-D01 | Add derived approval policy rule | DRAFT |

### 7. Screens And Interaction Points

> Named candidate screens and interaction points with one-sentence purpose,
> mapped to at least one actor. This replaces the base Screen Candidates and
> Flows sections for approval/workflow domains. Minimum required screens:
> Submit Request Form, Submitter Status View, Approver Work Queue, Request
> Detail with Action Panel, Revision Detail View.

| Screen | Purpose | Primary Actor |
|--------|---------|---------------|
| Add candidate screen rows here | One-sentence purpose | Actor |

### 8. Draft Acceptance Criteria (DRAFT)

> All criteria below are DRAFT and require human review before adoption.
> Express in Given/When/Then form. The last column is "Linked Transition"
> because criteria anchor to state transitions in this domain.

| ID | Given | When | Then | Linked Transition |
|----|-------|------|------|------------------|
| AC-D01 | Precondition | Action | Expected result | Transition name |

### Open Questions For Human Review

> Use this section instead of the standard Gaps section for approval/workflow
> domain condensed packages. Each open question must be numbered, described in
> one sentence, and tagged with the phase that owns resolution (PM or BA). At
> least two unresolved policy questions must appear if the brief does not
> explicitly answer quorum rules and delegation rules.

| ID | Open Question | Phase Owner |
|----|--------------|-------------|
| OQ-01 | Describe an unresolved policy or domain question | PM / BA |

---

## Next Step

After human review of this document:

1. Confirm feature key {{FEATURE_KEY}} is correct.
2. Resolve all gaps listed above.
3. Use this package as structured input to the PM initiation step:
   `@pm please create PROJECT_INITIATION_{{FEATURE_KEY}}.md`

Do not advance to the PM or BA phase until this document has been explicitly
confirmed by the PM or maintainer (Gate H2).
