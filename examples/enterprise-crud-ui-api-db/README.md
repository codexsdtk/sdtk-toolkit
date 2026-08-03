# enterprise-crud-ui-api-db

## Requirement Summary
- Standard business CRUD feature with UI screens, API contract, database persistence, and QA coverage.
- Designed to exercise the full PM -> BA -> ARCH -> DEV -> QA chain.

## Run Order
1. PM initiation
2. BA analysis
3. PM planning
4. ARCH design
5. DEV implementation and two-stage review
6. QA validation and release decision

## Expected Outputs
- full `docs/product`, `docs/specs`, `docs/architecture`, `docs/api`, `docs/database`, `docs/design`, `docs/dev`, and `docs/qa` artifact chain
- `DESIGN_LAYOUT` before `FLOW_ACTION_SPEC`
- API YAML before API design detail

## Mandatory Verification Points
- BA traceability matrix is complete
- flow-action mapping columns are filled from API and DB sources
- DEV Stage 1 and Stage 2 review both PASS before QA handoff

## Common Mistakes
- treating labels from design as canonical API field names
- skipping DB spec because CRUD looks simple
- handing QA a feature with only code-quality review completed
