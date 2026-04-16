# API DESIGN + FLOWCHART CREATION RULES FINAL

This file is the canonical rule set for:
- API flow source (`*_api_flow_list.txt`)
- PlantUML API flowcharts
- API design detail markdown (`*_API_DESIGN_DETAIL.md`)

Use `toolkit/templates/docs/api/YAML_CREATION_RULES.md` as the source of truth for endpoint contract design.

The rules below include the 2026-03-03 flow-style refinements extracted from the Whiteboard API flowchart review.

## 1. Final Review Result

After the final pass on `docs/api/work_planning_board_api_flow_list.txt`, there are no remaining critical style mismatches that should block reuse of the current flowchart-writing rules.

Current state:
- All API blocks use visible API header lines.
- Search-like APIs use query-builder style.
- CRUD/detail APIs no longer overuse search-style `fullQuery` construction.
- Batch create uses batch-create style instead of search-style query-builder.
- `api_design_detail.md` has been regenerated and is aligned with the current flow source.

Accepted low-priority exceptions:
- `POST /file-manager/env/{organization_uuid}` uses pseudo `UPSERT` wording. This is acceptable because it is a shared upsert-style API, not a search API.
- `GET /api/work-assignment/{organization_uuid}/{task_assignment_uuid}` still uses a fixed `query = ...` + `LEFT JOIN ...` style. This is intentional and acceptable for a fixed-detail API.

## 2. Source of Extracted Rules

These rules were extracted by comparing:
- `docs/api/work_planning_board_api_flow_list.txt`
- `docs/api/api_design_detail.md`
- `Example/Docs/API/resource-api-flowchart-list.txt`

Primary sample references:
- `POST /resource/{organization_uuid}` style
- `POST /resource/edit/{organization_uuid}/{resource_uuid}` style
- `POST /resource/delete-parmanent/{organization_uuid}/{resource_uuid}` style
- `GET /resource/info/{organization_uuid}/{resource_uuid}` style
- search API query-builder style shown in the Resource sample helper flow

## 2.1 API Design Detail Markdown Requirements

Generated `*_API_DESIGN_DETAIL.md` files must keep this minimum structure:
- `## 0. Abbreviations`
- `## 1. Document Scope`
- `## Assumptions`
- per-endpoint `## <n>. API Detail ...` sections
- `## 3. Generation Notes` or the current equivalent final notes section

`## Assumptions` must use this table shape:

```text
| # | Assumption | Verified | Risk if wrong |
```

If an assumption is not verified yet, keep it explicit and treat it as a downstream review risk instead of silently collapsing it into a fact.

## 3. Core Flowchart Writing Rules

### Rule A. Add a visible API header for every block

Every API block must start with a visible API header line, for example:

```text
API: <METHOD> <PATH>  <Short Title>
```

Project-specific variants such as `笆API:` are acceptable only when encoding is stable.

Reason:
- Matches the sample style.
- Makes raw flow-list files scannable before rendering.
- Reduces ambiguity when one file contains many APIs.

### Rule B. Use one `@startuml` block per API when generator mapping depends on block count

If the markdown/API-design generator maps flow blocks to API endpoints by block count/order:
- keep exactly one main `@startuml ... @enduml` block per API
- do not split helper flows into extra standalone blocks unless the generator is updated accordingly

Reason:
- Avoids breaking flow-to-endpoint mapping in generated `*_API_DESIGN_DETAIL.md`.

### Rule C. Flow style must match API type

Do not use one style for every API.
Choose the flow style based on the API purpose:

1. Search/List/Lookup APIs
- Use query-builder style.

2. Create APIs
- Use CRUD create style.

3. Edit APIs
- Use CRUD update style.

4. Delete APIs
- Use CRUD delete style.

5. Detail APIs
- Use fixed-record read style.

6. Batch create APIs
- Use batch-create style with loop.

Reason:
- This is the main difference between the sample Resource flowchart style and the over-generalized Whiteboard draft.

## 4. Search / List API Rules

Applies to:
- assignment search APIs
- reserve member/external-member search APIs
- duplicate-check / lookup APIs that are effectively query-based
- shared env lookup APIs when they dynamically build lookup conditions

### Rule D. Search APIs should use query-builder style

Preferred structure:

```text
:Create search query and condition statement from request.data.info;
:query = "SELECT ... FROM ...";
:query += " LEFT JOIN ...";
:condition = "WHERE ...";
...
:order_by = "ORDER BY ...";
:Compose full query:\nfullQuery = query + " " + condition;
:Add order_by into fullQuery;
:Execute fullQuery and get data;
:Close DB connection;
:Create api response;
```

### Rule E. Use uppercase table/column names inside pseudo-SQL

Inside SQL-like action text:
- use uppercase table names
- use uppercase column names where practical

Good:
- `APP_DATA_RESOURCE_INFO`
- `APP_DATA_RESOURCE_TASK_ASSIGNMENT_INFO`

Avoid:
- lowercase-only SQL object names in pseudo-SQL lines

Reason:
- Matches the sample style and improves visual separation between logic text and table identifiers.

### Rule E-1. Do not use fake helper-function wording unless a helper flow is defined

Do not write:
- `Call search_logic_function(parameters)`
- `Execute search_logic_function(parameters)`

unless the flow source also contains a real helper sub-flow block that defines that function logic.

If the helper is not actually defined in the same source:
- write the processing step directly inline

Good:
- `Create search query and condition statement from request.data.info;`
- `Create duplicate check query and condition statement from request.data.info;`

Reason:
- Avoids implying a reusable sub-flow that does not exist.
- Keeps the flow self-contained and accurate.

### Rule F. Dynamic array filters should use object-based wording

For array filters, use the sample-like loop style:

```text
if (data.info.team_uuids not null && data.info.team_uuids not empty) then (yes)
  :condition += " AND ( 1 != 1 ";
  repeat
    :Get teamObject from data.info.team_uuids;
    :condition += " OR E.TEAM_UUID = <teamObject.uuid>";
  repeat while (more value data?) is (yes)
  ->no;
  :condition += " )";
else (no)
endif
```

Do not use overly simplified wording like:
- `Add team filter`

Reason:
- The sample explicitly shows how OR-group conditions are built.

### Rule G. Search APIs should not describe response shaping internals

Avoid lines such as:
- `Compute duplicate_assign ...`
- `Group data into ...`
- `Return data.xxx[]`
- `Aggregate created_count ...` (for non-batch search flows)

Instead end the flow at:
- query completed
- DB connection closed
- API response created

Reason:
- The response structure is already defined in YAML.
- Flowchart should focus on processing logic, not renderer-side or response-object assembly internals.

### Rule H. Explicit `ORDER BY` is required when output order matters

If the endpoint contract depends on a specific order:
- define `order_by = "ORDER BY ..."`
- then add it into `fullQuery`

Do not leave ordering implicit.

## 5. Create API Rules

Applies to:
- single create APIs

### Rule I. Create APIs should use `Insert into ... with parameter value`

Preferred style:

```text
:Insert into APP_DATA_XXX with parameter value
field_a = param.data.info.field_a
field_b = param.data.info.field_b
create_dt = now;
:GET inserted_xxx_uuid = XXX_UUID value when Insert into APP_DATA_XXX;
:Close DB connection;
:Create api response;
```

### Rule J. Do not over-describe query-builder logic inside create flows

Avoid using:
- `query = "SELECT 1 ..."`
- `condition = ...`
- `Compose full query ...`

inside normal create flows.

If duplicate/business validation is needed:
- describe it as a business step only

Example:
- `Check overlap conflicts with current parameter value;`

Reason:
- This matches the sample create style and keeps flow readable.

## 6. Edit API Rules

Applies to:
- update APIs

### Rule K. Edit APIs should follow `Select existing -> Update with parameter value`

Preferred structure:

```text
:Get target_uuid from endpoint;
:Select from APP_DATA_XXX with target_uuid and del_flg = 0;
if (record exists) then (yes)
else (no)
  :Return error status = 140 ...;
  stop
endif
:Check business rule if needed;
:Update APP_DATA_XXX with parameter value
field_a = param.data.info.field_a
field_b = param.data.info.field_b
update_dt = now
where target_uuid = target_uuid;
:Close DB connection;
:Create api response;
```

### Rule L. Keep business checks short inside edit flows

If edit has duplicate overlap or other business validation:
- keep it as one business step
- do not expand it into a full search-style query-builder

Good:
- `Check overlap conflicts excluding current xxx_uuid;`

Avoid:
- full `query/condition/fullQuery` sequence inside edit flow

## 7. Delete API Rules

Applies to:
- logical delete
- physical delete

### Rule M. Delete APIs should follow `Select existing -> Delete/Update -> Close -> Response`

Preferred structure:

```text
:Get target_uuid from endpoint;
:Select from APP_DATA_XXX with target_uuid and del_flg = 0;
if (record exists) then (yes)
else (no)
  :Return error status = 140 ...;
  stop
endif
:Update APP_DATA_XXX with parameter value
del_flg = 1,
update_dt = now
where target_uuid = target_uuid;
:Close DB connection;
:Create api response;
```

If the API is truly permanent delete:
- use `Delete ... with key is ...`

Rule:
- style may mirror permanent-delete sample
- but business semantics must still match the actual API contract

## 8. Detail API Rules

Applies to:
- read-one / detail APIs

### Rule N. Detail APIs may use a fixed query, but not search-style dynamic query-builder

Allowed:

```text
:Get target_uuid from endpoint;
:query = "SELECT ... FROM APP_DATA_XXX WHERE TARGET_UUID = target_uuid";
:query += " LEFT JOIN ...";
:Execute query and get data;
if (record exists) then (yes)
...
:Close DB connection;
:Create api response;
```

Avoid:
- `condition = ...`
- `Compose full query ...`
- dynamic filter loops

Reason:
- Detail APIs are fixed-record lookups, not flexible searches.

## 9. Batch Create API Rules

Applies to:
- APIs that create multiple records in one request

### Rule O. Batch create APIs should use create-style logic with a loop

Preferred structure:

```text
:Create target date list ...;
...
repeat
  :Build per-item datetime/value;
  :Check business conflict with current target date parameter value;
  if (duplicate and skip = false) then (yes)
    :Append skipped result ...;
  else (no)
    :Insert into APP_DATA_XXX with parameter value
    ...
    :GET inserted_xxx_uuid = XXX_UUID value when Insert into APP_DATA_XXX;
    :Append created result ...;
  endif
repeat while (has next target item?) is (yes)
:Build batch result list and summary counts;
:Close DB connection;
:Create api response;
```

### Rule P. Do not use search-style query-builder in batch-create loops

Avoid inside the loop:
- `query = "SELECT 1 ..."`
- `condition = ...`
- `Compose full query ...`

Even when duplicate validation exists, batch create should still read like a create flow with looped business validation.

## 10. Shared System API Rules

Applies to:
- APIs reused from another module but documented in feature flowchart

### Rule Q. Shared lookup APIs may still use query-builder style if they behave like lookup/search

Example:
- environment lookup APIs that build conditions from request array items

Allowed:
- `query = ...`
- `condition = ...`
- `Compose full query ...`

### Rule R. Shared upsert APIs should use action-oriented wording, not search wording

Example:

```text
:Create Environment Manager upsert statement from request.data;
:query = "UPSERT APP_DATA_ENV_INFO";
:Resolve target row by ...;
:Set VALUE / NUMVALUE ...;
:Execute upsert statement;
:Close DB connection;
:Create api response;
```

Reason:
- Keeps style aligned with operation type.

## 11. Error / Connection / Ending Rules

### Rule S. Keep auth and validation at the top

Use the common pattern:
- authentication
- permission
- validation
- business processing
- DB close
- response

### Rule T. `Close DB connection;` should be near the end of the main flow

Preferred:
- after DB processing finishes
- before `Create api response;`

Avoid:
- excessive `Close DB connection;` inside every inner loop branch unless the logic truly requires separate connections

### Rule U. End with `Create api response;`

Use a simple terminal response action.

Do not over-specify:
- HTTP 200
- response JSON object construction
- field-by-field response shaping

unless there is a concrete reason the sample style requires it.

## 12. Non-Flow Logic That Should Stay Out of the Flowchart

Do not put these into the flow unless they are the core processing logic:
- FE-only rendering logic
- detailed response nesting assembly
- UI display-specific transformations already described by YAML schema

Reason:
- Flowchart should describe processing logic.
- YAML and endpoint docs already define the response contract.

