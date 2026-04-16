# YAML CREATION RULES FINAL

This file is the canonical rule set for designing and maintaining feature-level OpenAPI YAML.

Use this file for:
- OpenAPI YAML contract design
- endpoint path/method decisions
- request/response schema design
- endpoint summary and contract consistency checks

Do not use this file as the primary rule source for:
- flowchart writing details
- API design detail markdown layout

Use `toolkit/templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md` for those.

## 1. Rule Precedence
- Priority 1: follow the existing system's real route, method, payload, and response conventions.
- Priority 2: match the current source code and runtime behavior.
- Priority 3: apply the reusable standards in this document.
- If a reusable rule conflicts with the target system, keep the system rule and document the exception explicitly.

## 2. API Scope Classification
- Every endpoint must be classified as one of:
  - `New`
  - `Deferred`
  - `Existing (reuse)`
- Do not silently create a new feature-local API if an existing system API already provides the same behavior with a compatible contract.
- If the existing API is close in purpose but payload or response is incompatible with the feature need, create a bounded new API.

## 3. Endpoint Path Design
- Use singular resource names in endpoint paths.
- Use explicit action segments only when needed by system convention:
  - `list`
  - `search`
  - `edit`
  - `delete`
  - `multi-create`
- Prefer stable system-style patterns such as:
  - list: `GET /{resource}/list/{organization_uuid}/{parent_uuid}`
  - search: `POST /{resource}/search/{organization_uuid}`
  - view-specific search: `POST /{resource}/resource-view/search/{organization_uuid}`
  - create: `POST /{resource}/{organization_uuid}`
  - detail: `GET /{resource}/{organization_uuid}/{resource_uuid}`
  - edit: `POST /{resource}/edit/{organization_uuid}/{resource_uuid}`
  - delete: `POST /{resource}/delete/{organization_uuid}/{resource_uuid}`
- Separate namespaces by bounded context.
- Do not repeat namespace meaning in child path segments.

## 4. Request Contract Rules
- For feature-owned POST search and write APIs, prefer a stable wrapper:
  - `data: { ... }`
- For complex filters, place fields under:
  - `data.info`
- If reusing an existing system API, keep the owning module's contract shape exactly as-is.
- Do not force reused APIs into the feature wrapper pattern.
- If a payload field changes behavior, the field must be explicit in the schema and must not remain only in examples.

## 5. Response Contract Rules
- Success responses must include `status` at minimum.
- Create APIs should return the minimum new identifier required by the caller.
  - Example: `status + task_assignment_uuid`
- Edit and delete APIs should return status-only unless the target system has a stronger standard.
- Pre-check or validation helper APIs should return only the minimum boolean or status needed by the UI.
  - Do not return detail payloads the UI does not consume.
- Do not add FE-only visual helper payloads when the client can derive them safely.
  - Example: remove `timeline_backgrounds` if the frontend renders timeline lines from existing data.

## 6. Naming and Field Mapping Rules
- Use canonical business-domain terminology from the system glossary and database.
- Prefer actual system terms such as:
  - `resource`
  - `task`
  - `assignee`
  - `certification`
- Avoid legacy aliases when an official term already exists.
- Field names should align with database semantics when they represent the same concept.
- If the DB uses a string state code, the API field must not be modeled as an integer.
- If a field is date-only (`format: date`), include the display format in the description.
  - Example: `Start date (YYYYMMDD)`

## 7. Search and List API Rules
- One search API may serve multiple UI actions when the logic is the same:
  - initial load
  - search button
  - refresh after mode/date change
- If one endpoint serves multiple UI actions, document that explicitly in YAML description and endpoint docs.
- Search APIs must define filter combination semantics clearly:
  - AND across different fields
  - OR within each `*_uuids` array
- If UI rendering depends on stable order, the YAML description must state the confirmed ORDER BY logic.

## 8. Split vs Reuse Rules
- Split read/search endpoints when the FE needs materially different grouped or view-shaped datasets.
- Merge or remove helper payloads when they add maintenance cost without business value.
- Reuse existing platform APIs when behavior already exists and only a feature-level mapping layer is needed.
  - Example: reuse shared environment setting APIs instead of creating feature-local setting APIs.

## 9. Sample Data Rules
- For fields declared as `format: uuid`, use canonical UUID samples.
  - Example: `123e4567-e89b-12d3-a456-426614174000`
- Do not use placeholder UUID-like labels such as:
  - `customer-uuid-001`
  - `assign-uuid-001`
- Keep sample data deterministic and internally consistent across request and response examples.

## 10. Cross-Artifact Consistency Rules
- The YAML contract is the source of truth for:
  - endpoint path
  - method
  - request wrapper
  - response shape
- After any YAML contract change, sync these artifacts:
  - endpoint markdown
  - flow list
  - PlantUML flow assets
  - API design detail markdown
- If any artifact cannot yet be synced, note the mismatch explicitly rather than leaving stale content.

## 11. Minimum YAML Quality Gate
- Path/method follow the target system convention.
- API type is classified (`New`, `Deferred`, `Existing (reuse)`).
- Request/response wrappers are stable and explicit.
- FE-only helper payloads are removed.
- Field names and types match DB semantics.
- UUID examples are valid UUIDs.
- Date descriptions include display format where needed.
- Search/list APIs document filter semantics and ordering when relevant.
