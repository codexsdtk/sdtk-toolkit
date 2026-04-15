# OPS_HANDOFF Creation Rules

Version: 0.1
Document Type: Creation Rules

---

## 1. Purpose

These creation rules define how to author an `OPS_HANDOFF` artifact for a bounded
small-app feature. The OPS_HANDOFF document bridges CODE-phase delivery to an
operational readiness review. It is a human-authored, human-reviewed guidance artifact.

The artifact path convention is:

  `docs/dev/OPS_HANDOFF_[FEATURE_KEY].json`

This path is consistent with the broader toolkit artifact layout and must not be
changed without updating all referencing skill guidance, AGENTS.md, and handoff
template references.

---

## 2. Non-Claims

The following limitations apply to every OPS_HANDOFF document regardless of feature.
These must be preserved verbatim in every artifact authored against this schema.

1. "This handoff is not a CI/CD pipeline configuration."
2. "This handoff does not automate deployment."
3. "This handoff does not replace human review before any deployment action."
4. "This handoff does not configure a production monitoring or alerting platform."
5. "This handoff does not provide automated rollback."
6. "This handoff is starter-level guidance for a bounded small-app internal deployment only."

Authors may add feature-specific non_claims entries to the array, but the six entries
above are the minimum required set and must not be removed.

---

## 3. Schema Version

The current schema version is `"0.1"`. Every OPS_HANDOFF artifact must include:

```json
"schema_version": "0.1"
```

Future schema revisions will increment this value. Do not use schema version `"0.1"`
for artifacts that add fields or structures not defined in this document.

---

## 4. Required Fields

The OPS_HANDOFF JSON artifact must contain all of the following top-level fields.
Optional fields are described in Section 10.

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | Must be `"0.1"` for this release. |
| `feature_key` | string | Must match the CODE_HANDOFF feature_key for this feature. |
| `ops_handoff_status` | string | Either `"READY_FOR_OPS_REVIEW"` or `"BLOCKED_FOR_OPS_REVIEW"`. Human sets this after completing the document. |
| `source_handoff_ref` | string | Repo-relative path to the CODE_HANDOFF artifact that feeds this handoff (e.g., `"docs/dev/CODE_HANDOFF_SRT-001.json"`). |
| `non_claims` | array of strings | Minimum six entries as defined in Section 2. |
| `deploy_starter` | object | See Section 5. |
| `env_expectations` | array of objects | See Section 6. |
| `health_check_baseline` | object | See Section 7. |
| `monitoring_baseline` | object | See Section 8. |
| `rollback_starter` | object | See Section 9. |
| `human_gates` | array of objects | See Section 11. Gate H5 is the minimum required entry. |

---

## 5. deploy_starter Object

This object describes the bounded steps a human operator would take to start the
application in an initial deployment environment. It does not automate those steps
and does not claim cloud-platform management or auto-provisioning.

Required sub-fields:

| Sub-field | Type | Guidance |
|---|---|---|
| `runtime` | string | Runtime technology, e.g., `"node"`, `"python"`, `"docker"`. Match the tech stack documented in FEATURE_IMPL_PLAN. |
| `start_command` | string | The exact command a human would run to start the application. Must be a real command, not a placeholder. |
| `recommended_platform` | string | Deployment target appropriate for a bounded starter, e.g., `"local Docker"`, `"VPS"`, `"basic PaaS tier"`. Must not claim cloud-platform management or automatic provisioning. |
| `known_limitations` | array of strings | Explicit list of what this starter guidance does not handle. Include at minimum: load balancing, secrets rotation, auto-scaling, and any feature-specific operational gap. |

Authoring guidance:
- `start_command` must reflect the actual runtime entry point from CODE_HANDOFF.
  Do not copy a placeholder command from a template without verifying the real command.
- `recommended_platform` must not imply that the feature is ready for production traffic.
- `known_limitations` must be non-empty. A starter deployment for a bounded small app
  always has operational gaps relative to a production-grade deployment.

---

## 6. env_expectations Array

Each entry in this array documents one environment variable or configuration value
that the application requires before it can start or function correctly.

Each entry must contain:

| Sub-field | Type | Guidance |
|---|---|---|
| `name` | string | Environment variable name, e.g., `"DATABASE_URL"`. |
| `required` | boolean | `true` if the app cannot start or operate without this value. |
| `description` | string | Human-readable explanation of what this variable controls. |
| `example_value` | string | A safe placeholder, e.g., `"postgres://user:password@localhost:5432/dbname"`. Never include real credentials or real secrets. |
| `resolution_owner` | string | Who must supply the real value before deployment, e.g., `"deployer"`, `"operator"`, `"maintainer"`. |

Authoring guidance:
- Source env_expectations from the CODE_HANDOFF impact_map and ARCH_DESIGN.
- example_value entries must be clearly placeholder values. Do not copy real
  credentials, tokens, or connection strings from any environment.
- If a variable is conditionally required (only in certain deployment modes),
  set `required` to `false` and explain the condition in `description`.
- An empty env_expectations array is not valid for most real applications.
  If no environment variables exist, document why that is true.

---

## 7. health_check_baseline Object

This object defines the minimum health signal that a human operator or monitoring
process can use to verify that the application started successfully.

Required sub-fields:

| Sub-field | Type | Guidance |
|---|---|---|
| `endpoint` | string | HTTP path for the health check, e.g., `"/health"` or `"/api/health"`. Must be a real endpoint implemented by the feature, not a hypothetical path. |
| `method` | string | HTTP method, typically `"GET"`. |
| `expected_status` | integer | Expected HTTP status code when the app is healthy, typically `200`. |
| `check_notes` | string | Human guidance for interpreting the response. Explain what a successful response looks like and what a failure means for this specific feature. |

Authoring guidance:
- Verify that the endpoint documented here is actually implemented in the feature
  CODE_HANDOFF before authoring this section.
- `check_notes` must be specific to the feature, not generic. A reviewer reading
  this field should know whether the app is healthy or not after checking the endpoint.
- If the feature does not expose an HTTP endpoint, adapt this section to the actual
  health signal available (e.g., process liveness, queue depth check) and note the
  deviation from the default HTTP pattern.

---

## 8. monitoring_baseline Object

This object defines the minimum observability posture for a starter deployment.
It does not configure a monitoring platform and does not claim that automated
alerting is available.

Required sub-fields:

| Sub-field | Type | Guidance |
|---|---|---|
| `key_signals` | array of strings | What a human operator should observe without a full monitoring platform. Examples: `"error log patterns"`, `"response time from health endpoint"`, `"queue depth if applicable"`. Must be non-empty. |
| `recommended_tooling` | string | Lightweight tooling appropriate for a starter deployment. Example: `"system logs plus manual health check endpoint polling"`. Must not claim a monitoring platform is configured or available. |
| `non_claim` | string | Explicit statement that this section is not a production monitoring suite. Author this as a complete, human-readable sentence. |

Authoring guidance:
- `key_signals` must be specific to the feature behavior. A reviewer should know
  which signals to watch for this particular app, not generic server health.
- `recommended_tooling` must be achievable without purchasing or deploying a
  monitoring platform. The recommended tooling is bounded to what a small team can
  apply immediately.
- `non_claim` is distinct from the top-level `non_claims` array. This field lives
  inside the monitoring_baseline object and provides a context-specific disclaimer.

---

## 9. rollback_starter Object

This object provides bounded, human-executable recovery steps for reverting to a
prior working state after a failed deployment. It does not implement or trigger
automated rollback.

Required sub-fields:

| Sub-field | Type | Guidance |
|---|---|---|
| `strategy` | string | High-level rollback approach, e.g., `"redeploy the previous image tag or git commit"`. Must be a real strategy available to the deployment target, not a generic description. |
| `manual_steps` | array of strings | Ordered, human-executable recovery steps. Each step must be concrete and specific to the feature deployment. Must not claim automated rollback. |
| `non_claim` | string | Explicit statement that this section does not provide automated rollback. Author as a complete human-readable sentence. |

Authoring guidance:
- `manual_steps` must reflect the actual deployment target documented in
  `deploy_starter.recommended_platform`. Steps for a Docker-based deployment differ
  from steps for a PaaS deployment.
- Every step must be something a human operator can execute without additional
  tooling beyond what is already documented in `deploy_starter`.
- `non_claim` is required. A starter rollback procedure is a recovery guide,
  not a rollback automation contract.

---

## 10. open_questions Array (Optional)

This array captures environment-specific or deployment-specific details that have
not yet been resolved at the time the OPS_HANDOFF is authored. Including this array
is optional, but strongly recommended whenever deployment details are still unknown.

Each entry must contain:

| Sub-field | Type | Guidance |
|---|---|---|
| `id` | string | Short identifier, e.g., `"OQ-01"`. Increment sequentially within the artifact. |
| `question` | string | Specific unresolved detail that must be answered before the deployment can proceed. |
| `resolution_owner` | string | Who must resolve this before Gate H5 can pass, e.g., `"deployer"`, `"operator"`, `"maintainer"`. |

Authoring guidance:
- An unresolved open_question does not by itself block authoring the artifact.
  It does block setting `ops_handoff_status` to `"READY_FOR_OPS_REVIEW"` unless
  the question is informational rather than blocking.
- If all open_questions are blocking, set `ops_handoff_status` to
  `"BLOCKED_FOR_OPS_REVIEW"` and list the blocking questions explicitly.

---

## 11. human_gates Array

This array documents the required human checkpoints that must pass before any
deployment action may proceed. Every OPS_HANDOFF must include at minimum Gate H5.

Each gate entry must contain:

| Sub-field | Type | Guidance |
|---|---|---|
| `gate_id` | string | Identifier consistent with the broader golden path gate numbering. Gate H5 is the minimum required gate for OPS_HANDOFF review. |
| `description` | string | What a human must confirm at this gate. Must be specific to the deployment and feature, not generic. |
| `required_before` | string | What action this gate blocks, e.g., `"any deployment action"`. |

### Gate H5: Minimum Required Entry

Every OPS_HANDOFF artifact must include Gate H5. The minimum required entry is:

```json
{
  "gate_id": "H5",
  "description": "Controller reviews OPS_HANDOFF artifact and confirms all required fields are complete, non_claims are present, open_questions are resolved or explicitly deferred, and the feature is approved for an initial bounded deployment.",
  "required_before": "any deployment action"
}
```

Gate H5 must not be removed, weakened, or restated to imply that automated review
replaces human controller judgment.

Additional gates (e.g., `"H5a"`, `"H6"`) may be added for feature-specific
deployment checkpoints, but Gate H5 is always the minimum anchor.

---

## 12. Full Schema Example

The following is a minimal conforming example for a small app with one required
environment variable. Replace all placeholder values with real, feature-specific
values before submitting for review.

```json
{
  "schema_version": "0.1",
  "feature_key": "FEATURE-001",
  "ops_handoff_status": "BLOCKED_FOR_OPS_REVIEW",
  "source_handoff_ref": "docs/dev/CODE_HANDOFF_FEATURE-001.json",
  "non_claims": [
    "This handoff is not a CI/CD pipeline configuration.",
    "This handoff does not automate deployment.",
    "This handoff does not replace human review before any deployment action.",
    "This handoff does not configure a production monitoring or alerting platform.",
    "This handoff does not provide automated rollback.",
    "This handoff is starter-level guidance for a bounded small-app internal deployment only."
  ],
  "deploy_starter": {
    "runtime": "python",
    "start_command": "gunicorn app:app --bind 0.0.0.0:8000",
    "recommended_platform": "local Docker or basic VPS",
    "known_limitations": [
      "No load balancing is configured.",
      "No secrets rotation is configured.",
      "No auto-scaling is configured.",
      "Not suitable for production traffic without additional review."
    ]
  },
  "env_expectations": [
    {
      "name": "DATABASE_URL",
      "required": true,
      "description": "Connection string for the application database.",
      "example_value": "postgres://user:password@localhost:5432/dbname",
      "resolution_owner": "deployer"
    }
  ],
  "health_check_baseline": {
    "endpoint": "/health",
    "method": "GET",
    "expected_status": 200,
    "check_notes": "A 200 response indicates the app started and reached the database. A 500 or timeout indicates a startup failure; check application logs for the error."
  },
  "monitoring_baseline": {
    "key_signals": [
      "Application error log patterns (look for ERROR or CRITICAL entries).",
      "Response time from the health endpoint (manual polling).",
      "Database connection errors in application logs."
    ],
    "recommended_tooling": "System logs plus manual health check endpoint polling.",
    "non_claim": "This monitoring baseline is not a production monitoring or alerting platform configuration."
  },
  "rollback_starter": {
    "strategy": "Redeploy the previous Docker image tag or the previous git commit.",
    "manual_steps": [
      "Stop the current running container or process.",
      "Pull or build the previous known-good image tag or checkout the previous commit.",
      "Restart using the deploy_starter start_command with the previous build.",
      "Confirm the health endpoint returns 200 before declaring recovery complete."
    ],
    "non_claim": "This rollback procedure is manual. No automated rollback is provided or implied."
  },
  "human_gates": [
    {
      "gate_id": "H5",
      "description": "Controller reviews OPS_HANDOFF artifact and confirms all required fields are complete, non_claims are present, open_questions are resolved or explicitly deferred, and the feature is approved for an initial bounded deployment.",
      "required_before": "any deployment action"
    }
  ],
  "open_questions": [
    {
      "id": "OQ-01",
      "question": "What is the target deployment environment hostname or IP address?",
      "resolution_owner": "deployer"
    }
  ]
}
```

---

## 13. Authoring Checklist

Before setting `ops_handoff_status` to `"READY_FOR_OPS_REVIEW"`, confirm:

- [ ] `schema_version` is `"0.1"`.
- [ ] `feature_key` matches the CODE_HANDOFF feature_key exactly.
- [ ] `source_handoff_ref` points to a real file that exists in the repo.
- [ ] `non_claims` contains all six minimum required entries from Section 2.
- [ ] `deploy_starter.start_command` is a real, verified command (not a placeholder).
- [ ] `deploy_starter.known_limitations` is non-empty.
- [ ] `env_expectations` entries contain safe placeholder `example_value` values only.
  No real secrets, credentials, or connection strings.
- [ ] `health_check_baseline.endpoint` is implemented by the feature.
- [ ] `monitoring_baseline.non_claim` is present and accurate.
- [ ] `rollback_starter.non_claim` is present and accurate.
- [ ] `human_gates` contains Gate H5 with the minimum required wording.
- [ ] All `open_questions` that are blocking have been resolved, or
  `ops_handoff_status` is set to `"BLOCKED_FOR_OPS_REVIEW"` with a clear explanation.
- [ ] No internal tracker IDs or review-only labels appear anywhere in the artifact.
- [ ] A human controller has reviewed and approved the artifact before any deployment
  action proceeds.

---

## 14. Distribution Parity

Packaged distribution parity for this creation rules document is intentionally
deferred from the current batch. This file is a canonical toolkit template only.
Distribution payload sync is a separate controlled step and must not be performed
during the same batch that produces this template.
