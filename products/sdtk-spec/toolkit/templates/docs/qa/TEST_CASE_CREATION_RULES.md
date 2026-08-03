# TEST CASE CREATION RULES
## Canonical rules for `[FEATURE_KEY]_TEST_CASE.md`

**Version:** 1.0.0  
**Last Updated:** 2026-02-25

---

## 1. Purpose
- Standardize creation of feature test-case documents in markdown.
- Mirror Excel-style worksheet layout while keeping output reviewable in `.md`.
- Keep QA artifacts reusable across projects, domains, and screen sets.

---

## 2. Output Contract
- Primary output file:
  - `docs/qa/[FEATURE_KEY]_TEST_CASE.md`
- Optional language/project variant:
  - `docs/en/qa/[FEATURE_KEY]_TEST_CASE.md` (only when the project explicitly uses `docs/en/**`).

---

## 3. Required Section Order
1. Document metadata (`Document ID`, `Version`, `Date`, `Author`, `Status`)
2. `Statistic Summary (Excel-aligned)`
3. `Abbreviations`
4. `1. Scope`
5. `2. References`
6. `3. Test Environment and Common Data`
7. `4. Feature Coverage Matrix`
8. `5. Screen-based Test Cases (Excel-aligned)`
9. `6. Open Questions (for final freeze)`
10. `7. STC/UAT Note`

Do not reorder these sections unless the user requests a different contract.

---

## 4. Statistic Summary Rules
- Place summary near the top of the file (before detailed UTC/ITC tables).
- Keep columns aligned with Excel `Statistic` logic:
  - `Num of Case`
  - `OK`
  - `NG`
  - `Not tested yet`
  - `Done (%)`
  - `Updated Date`
- Compute:
  - `Not tested yet = Num of Case - (OK + NG)`
  - `Done (%) = (OK + NG) / Num of Case`
- Include subtotal rows at minimum:
  - `Unit Test Total`
  - `Integration Test Total`
  - `Grand Total`

---

## 5. Screen-Based Worksheet Mapping
- Use `screen-first` layout to mirror Excel tabs:
  - Each functional screen has a section (for example `SCH01`, `SCH02`, ...).
  - Each screen section can have 2 sub-sections:
    - `UTC` worksheet (name pattern: `[SCREEN_KEY]_UTC`)
    - `ITC` worksheet (name pattern: `[SCREEN_KEY]_ITC`)
- Add one mapping table in section 5 that lists:
  - `Screen`
  - `Suggested Worksheet Pair`
  - `UTC Cases`
  - `ITC Cases`
  - `Notes`

---

## 6. Test Case Table Schema (Mandatory)
- Use one unified 18-column schema for both UTC and ITC tables:
  - `No`
  - `Test Type`
  - `Test Perspective`
  - `Test Item`
  - `Precondition`
  - `Test Steps`
  - `Expected Result`
  - `Browser`
  - `Test Execution Result`
  - `Remarks`
  - `Reviewer`
  - `Review Date`
  - `OK/NG`
  - `Cause`
  - `Countermeasure`
  - `Owner`
  - `Completion Date`
  - `Confirmation`

---

## 7. Numbering and ID Policy
- Keep a stable `No` for each test case row.
- Do not renumber existing case IDs only for visual regrouping.
- In screen-split sections, case IDs may be non-contiguous; this is allowed.
- Summary/helper tables must keep contiguous `No` (`1,2,3,...`).

---

## 8. Open Questions (OQ) Policy
- If expected behavior is unclear, create `OQ-xx` entries in section 6.
- Do not assume behavior for:
  - permission matrix
  - conflict dialog/action semantics
  - API contract ambiguities
  - release-scope boundary
- When resolved, keep question row and set status/remarks to resolved.

---

## 9. Language and Encoding
- Default artifact language: English.
- Keep original JP/VI labels when required by business/UI traceability (for example button labels).
- File encoding must be UTF-8.
- Avoid mojibake and placeholder tokens (`??`, `?????`) in final output.

---

## 10. Final Validation Checklist
- Required sections exist and are in correct order.
- Statistic totals equal sum of UTC/ITC rows.
- Screen mapping table case counts match actual UTC/ITC table counts.
- Scope explicitly states in-scope and out-of-scope boundaries.
- Open questions are explicitly tracked with owner and impact.
