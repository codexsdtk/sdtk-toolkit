# Coding Conventions (Sanitized Reference)

This document captures implementation conventions for SDTK-oriented projects. It is the source of truth for backend/frontend behavior expected by toolkit skills.

## Scope
- Backend: Python + Django REST Framework style services.
- Frontend: React + service layer + query hooks.
- API docs and tests: must stay aligned with BA/ARCH artifacts.

## Global Rules
- Keep API contract as the primary source of truth.
- Keep request and response shapes stable; do not introduce silent contract drift.
- Keep naming and folder conventions consistent across feature modules.
- Enforce traceability from REQ/UC/AC to implementation and tests.
- Never hardcode credentials or secrets.

## Backend Conventions

### Layering
- View/controller layer: parse request, validate, call service, return standardized response.
- Validation layer: input constraints and business pre-checks.
- Service layer: business logic and transaction boundaries.
- Serializer layer: response shaping.
- URL mapping: explicit action routing and consistent endpoint naming.

### Data and Transactions
- Use explicit transaction boundaries for write operations.
- Keep soft-delete strategy consistent where required by project policy.
- Keep update field whitelists explicit for partial updates.
- Keep multi-tenant context propagation deterministic if tenant-aware routing is used.

### Error Handling
- Normalize error payload format across endpoints.
- Separate HTTP status from domain/internal status when project policy requires both.
- Use custom exceptions for domain-specific failures.
- Do not leak stack traces or sensitive internals in production responses.

### Logging and Security
- Log operation metadata and correlation IDs.
- Avoid logging sensitive request/response content.
- Use environment variables or secret managers for all credentials.
- Add permission checks before state-changing operations.

## Frontend Conventions

### Structure
- Feature-oriented folder structure for screens/components/hooks/services.
- Dedicated service modules for API calls.
- Dedicated query/mutation hooks for data access and cache control.

### API Client
- Centralize HTTP client and interceptors.
- Keep token refresh logic centralized and deterministic.
- Handle API domain status codes consistently in one place.

### UX and State
- Keep loading/error/empty states explicit.
- Preserve role/permission checks in UI actions.
- Keep labels, naming, and navigation patterns consistent.

## API Contract Rules
- Keep endpoint naming coherent across list/create/edit/delete/search patterns.
- Keep request payload shape documented and testable.
- Keep response wrappers and status fields aligned with frontend assumptions.
- Update API docs whenever implementation changes.

## Quality Gates
- Minimum checks before merge:
  - lint passes
  - tests pass
  - docs updated for contract/process changes
  - traceability references updated (REQ/UC/AC)
- QA phase starts only after downstream implementation evidence is available for the approved feature scope.

## Change Management
- If a convention changes, update:
  - this file
  - related toolkit skills
  - affected templates under `toolkit/templates/**`
- Keep updates small, explicit, and backward compatible when possible.
