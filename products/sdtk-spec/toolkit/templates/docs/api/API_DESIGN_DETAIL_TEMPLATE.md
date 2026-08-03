# {{FEATURE_KEY}} API DESIGN DETAIL

## 0. Abbreviations

| No | Term | Meaning |
| ---: | --- | --- |
| 1 | API | Application Programming Interface |
| 2 | UUID | Universally Unique Identifier |
| 3 | FE | Frontend |
| 4 | BE | Backend |
| 5 | DT | Datetime |

## 1. Document Scope

| No | Method | Endpoint | Reference Template |
| ---: | --- | --- | --- |
| 1 | TBD | TBD | `API_design.xlsx` |

## Assumptions

| # | Assumption | Verified | Risk if wrong |
| ---: | --- | --- | --- |
| 1 | TBD | No | TBD |

## 2. API Detail 1 - TBD

**Endpoint:** `TBD`

### 2.1 Process Flow

Source of truth: `docs/api/{{FEATURE_SNAKE}}_api_flow_list.txt`

```text
@startuml
partition "TBD" {
start
:TBD;
stop
}
@enduml
```

![Flowchart - API 1](./images/{{FEATURE_SNAKE}}__api_1.svg)

### 2.2 Parameters

`None`

### 2.3 Request Parameters (JSON format)

`None`

### 2.4 Success Response (JSON format)

`None`

### 2.5 Error Response (JSON format)

`None`

## 3. Generation Notes

- This file should be generated/updated by skill `sdtk-api-design-spec`.
- Rules source: `templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md`.
- Contract source:
  - `docs/api/{{FEATURE_PASCAL}}_API.yaml`
  - `docs/api/{{FEATURE_SNAKE}}_api_flow_list.txt`
