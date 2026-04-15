# {{FEATURE_KEY}} API ENDPOINTS

**Document ID:** {{FEATURE_KEY}}_ENDPOINTS
**Version:** 1.0.0
**Date:** {{DATE}}
**Author:** ARCH Agent
**Status:** DRAFT
**Related Specs:** `docs/specs/BA_SPEC_{{FEATURE_KEY}}.md`, `docs/specs/{{FEATURE_KEY}}_FLOW_ACTION_SPEC.md`, `docs/database/DATABASE_SPEC_{{FEATURE_KEY}}.md`, `docs/api/{{FEATURE_KEY}}_API_DESIGN_DETAIL.md`

---

## Abbreviations

| No | Abbreviation | Meaning |
| ---: | --- | --- |
| 1 | API | Application Programming Interface |
| 2 | DB | Database |
| 3 | UI | User Interface |
| 4 | BR | Business Rule |
| 5 | UC | Use Case |
| 6 | OQ | Open Question |

---

## Domain Keywords

| No | Keyword | Source Term | Meaning Used In This API Spec |
| ---: | --- | --- | --- |
| 1 | `resource_a` | TBD | TBD |
| 2 | `resource_b` | TBD | TBD |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Common Response Formats](#3-common-response-formats)
4. [Core APIs](#4-core-apis)
5. [Master/Reuse APIs](#5-masterreuse-apis)
6. [Error Codes Reference](#6-error-codes-reference)
7. [Appendices](#appendix-a-data-model-reference)
8. [Document History](#document-history)

---

## 1. Overview

### 1.1 Base URL
```
{BASE_URL}/api
```

### 1.2 API Versioning
Current version: `v1` (confirm final path policy in BA/ARCH decisions).

### 1.3 Content Type
- Request: `application/json`
- Response: `application/json`

### 1.4 Date/Time Format
- Date: `YYYY-MM-DD`
- DateTime: `YYYY-MM-DDTHH:mm:ss` (or timezone-aware per project decision)

### 1.5 Endpoint Naming Convention
- Apply `YAML_CREATION_RULES.md` for API contract rules and `API_DESIGN_FLOWCHART_CREATION_RULES.md` for flow/depth alignment.
- Keep resource naming and method policy consistent across all sections.

---

## 2. Authentication & Authorization

### 2.1 Authentication
All endpoints require Bearer token authentication unless explicitly documented.

### 2.2 Permission Model

| No | Permission | Description | Allowed Operations |
| ---: | --- | --- | --- |
| 1 | `feature:view` | Read permission | Read/search endpoints |
| 2 | `feature:edit` | Write permission | Create/edit/delete endpoints |

---

## 3. Common Response Formats

### 3.1 Success Response
```json
{
  "status": 0,
  "msg": "success",
  "data": {},
  "errors": []
}
```

### 3.2 Error Response
```json
{
  "status": 100,
  "msg": "validation error",
  "data": {},
  "errors": [
    {
      "field": "field_name",
      "code": "INVALID",
      "detail": "TBD"
    }
  ]
}
```

### 3.3 Pagination Parameters

| No | Parameter | Type | Default | Description |
| ---: | --- | --- | --- | --- |
| 1 | `page` | integer | 1 | Page number |
| 2 | `page_size` | integer | 20 | Items per page |

---

## 4. Core APIs

### 4.1 METHOD /api/... (TBD)

**Description:** TBD  
**Related Use Cases:** UC-xx  
**Authentication:** Required (`feature:view` or `feature:edit`)

**Request Schema:**

| No | Field | Type | Required | Description |
| ---: | --- | --- | --- | --- |
| 1 | `field_1` | string | Yes | TBD |

**Request Example:**
```http
METHOD /api/...
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "field_1": "value"
}
```

**Response Schema (key fields):**
```json
{
  "status": 0,
  "msg": "success",
  "data": {
    "items": []
  },
  "errors": []
}
```

**Possible Error Codes:**

| No | Code | Description |
| ---: | --- | --- |
| 1 | `ERR-xxx` | TBD |

---

## 5. Master/Reuse APIs

| No | Method | Endpoint | API Type | Description |
| ---: | --- | --- | --- | --- |
| 1 | GET | /api/... | Existing (reuse) | TBD |

---

## 6. Error Codes Reference

### 6.1 Standard HTTP Status Codes

| No | Code | Description |
| ---: | --- | --- |
| 1 | 200 | Success |
| 2 | 400 | Bad Request |
| 3 | 401 | Unauthorized |
| 4 | 403 | Forbidden |
| 5 | 404 | Not Found |
| 6 | 409 | Conflict |
| 7 | 500 | Internal Server Error |

### 6.2 Application Error Codes

| No | Code | HTTP Status | Description |
| ---: | --- | --- | --- |
| 1 | `ERR-VALIDATION` | 400 | Request validation failed |
| 2 | `ERR-AUTH` | 401/403 | Auth/permission failure |
| 3 | `ERR-CONFLICT` | 409 | Business conflict |

---

## Appendix A: Data Model Reference

| No | Entity | Key Fields | Notes |
| ---: | --- | --- | --- |
| 1 | TBD | TBD | TBD |

---

## Appendix B: API Endpoint Summary

| No | Method | Endpoint | API Type | Description |
| ---: | --- | --- | --- | --- |
| 1 | METHOD | /api/... | New | TBD |

---

## Appendix C: API Required For Screen Logic

| No | Method | Endpoint | API Type | Description (screen logic) | Spec can confirm (Q&A) |
| ---: | --- | --- | --- | --- | --- |
| 1 | METHOD | /api/... | New | TBD | TBD |

---

## Document History

| No | Version | Date | Author | Changes |
| ---: | --- | --- | --- | --- |
| 1 | 1.0.0 | {{DATE}} | ARCH Agent | Initial template-based version |
