---
name: sdtk-dev-backend
description: Generate/modify Python Django REST Framework backend code following the toolkit conventions (models/views/services/serializers/validation/urls/enums). Use when implementing backend features in that project style.
---

# SDTK-SPEC Backend (Toolkit conventions)

## Critical Constraints
- I am a bounded DEV specialist aid inside `SDTK-SPEC`, not a separate suite-owner identity.
- I do not generate backend code without approved API and data-contract sources.
- I do not ignore established repository patterns when adding backend modules.
- I do not replace the default `sdtk-dev -> CODE_HANDOFF -> SDTK-CODE` path unless the user explicitly asks for a bounded specialist intervention inside current DEV scope.
- I do not invent models, fields, or business rules that are not present in the approved upstream artifacts.

## Outputs
- Backend module files under `src/backend/<module>/`:
  - `models.py`, `views.py` or `viewsets.py`, `services.py`, `serializers.py`, `validation.py`, `enums.py`, `urls.py`
- Unit/integration test files for critical business rules and state transitions

## Required Inputs
- Approved `docs/api/[FeaturePascal]_API.yaml` (endpoint contracts)
- Approved `docs/api/[FEATURE_KEY]_ENDPOINTS.md` (detail + schema)
- `docs/specs/BA_SPEC_[FEATURE_KEY].md` or `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md` (business rules, data model)
- Confirmation that this slice is within approved DEV scope

## When To Stop Or Escalate
- Stop if approved API YAML or ENDPOINTS.md does not exist for the current slice; do not generate code against unreviewed contracts.
- Stop if the data model in BA/ARCH contradicts the YAML schema; surface the discrepancy as a blocker before writing any model.
- Escalate to `sdtk-dev` if the implementation slice scope is unclear or if new design decisions are required.
- Escalate to `@arch` if an existing repository pattern cannot satisfy the new module requirements without architectural change.
- Stop if a business rule requires a state transition or permission model not defined in the upstream sources; record as OQ-xx.

## Core Process
1. Confirm this backend slice is a bounded specialist intervention under current DEV scope, not a replacement for `sdtk-dev` ownership or the default downstream `SDTK-CODE` path.
2. Read approved API YAML and ENDPOINTS.md for the current slice.
3. Read BA_SPEC or ARCH_DESIGN for business rules, data model, and permission model.
4. Check whether this repository already has a backend reference module and follow its patterns exactly.
5. Follow module structure: `src/backend/<module>/{models,view,service,serializers,validation,enum,urls.py}`.
6. Apply conventions:
   - Soft delete via `del_flg`
   - Audit fields (creator/updater/del timestamps)
   - Permission checks before operations
   - `transaction.atomic()` for writes
   - Logging decorator on public endpoints
7. Add tests for critical business rules and state transitions.
8. Verify the generated code satisfies the endpoint contracts defined in YAML before declaring the slice done.

## Validation / Quality Gates
- Every new endpoint has a matching serializer, view/viewset, and URL route.
- Permission checks are present for every write operation.
- `transaction.atomic()` wraps every multi-step write.
- Soft delete fields (`del_flg`) are consistent with existing model conventions.
- Tests cover critical business rules and state transitions for the current slice.
- No model field or business rule has been invented without a corresponding source in BA/ARCH or API YAML.

## Order-Critical Hard Gate
Do not write model definitions before reading the approved data model from BA_SPEC or ARCH_DESIGN. Models authored from memory or inferred from vague requirements produce contract drift that is expensive to fix downstream.

Do not declare a slice done without verifying the generated endpoints satisfy the contracts in the approved YAML.

## Common Mistakes

| Mistake | Why it is wrong | Do instead |
|---|---|---|
| Generate code without reading approved YAML | Produces endpoints that contradict the approved contract | Always read YAML and ENDPOINTS.md first |
| Invent model fields not in BA/ARCH | Creates undocumented contract drift | Only implement fields explicitly defined in the upstream sources |
| Skip permission checks on write endpoints | Security gap that will fail review | Always add permission guard before business logic |
| Omit `transaction.atomic()` on multi-step writes | Risk of partial writes and data corruption | Wrap every write sequence in an atomic block |
| Use a different module pattern than the existing repo reference | Inconsistency that maintainers must correct | Read the reference module and match its structure exactly |
| Treat this skill as a replacement for `sdtk-dev` | Collapses bounded specialist scope into general DEV ownership | Keep scope explicitly bounded to the current slice |

## Reference Loading Guidance
Read at slice start:
- `docs/api/[FeaturePascal]_API.yaml` (required)
- `docs/api/[FEATURE_KEY]_ENDPOINTS.md` (required)
- `docs/specs/BA_SPEC_[FEATURE_KEY].md` or `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md` (required)

Read on demand:
- Existing backend reference module in `src/backend/` (match its patterns)
- `sdtk-spec.config.json` for stack-specific test/lint commands
