
# SLO Templates

## SLI Definition Template

```yaml
service: service-name
owner: owning-team
review_cadence: monthly

slis:
  availability:
    description: "Successful responses to valid requests"
    metric: |
      sum(rate(http_requests_total{service="service-name", status!~"5.."}[5m]))
      /
      sum(rate(http_requests_total{service="service-name"}[5m]))
    good_event: "HTTP status below 500"
    valid_event: "Any user-visible request excluding health checks"

  latency:
    description: "Requests served within the required threshold"
    metric: |
      histogram_quantile(0.99,
        sum(rate(http_request_duration_seconds_bucket{service="service-name"}[5m]))
        by (le)
      )
    threshold: "300ms at p99"

  correctness:
    description: "Requests returning correct business results"
    metric: "business_logic_errors_total / requests_total"
    good_event: "No business logic error"
```

## SLO Definition Template

```yaml
slos:
  - sli: availability
    target: 99.95%
    window: 30d
    error_budget: "21.6 minutes per month"
    burn_rate_alerts:
      - severity: critical
        short_window: 5m
        long_window: 1h
        burn_rate: 14.4x
      - severity: warning
        short_window: 30m
        long_window: 6h
        burn_rate: 6x

  - sli: latency
    target: 99.0%
    window: 30d
    error_budget: "7.2 hours per month"

  - sli: correctness
    target: 99.99%
    window: 30d
```

## Error Budget Policy Template

```yaml
error_budget_policy:
  budget_remaining_above_50pct: "Normal feature development"
  budget_remaining_25_to_50pct: "Reliability review before risky changes"
  budget_remaining_below_25pct: "Prioritize reliability work until budget recovers"
  budget_exhausted: "Freeze all non-critical deploys and require leadership review"
```

## Review Checklist

Before approving an SLO definition, confirm:
- the SLI measures user-visible behavior
- the target matches business criticality
- the window is explicit
- burn-rate alerts exist for fast and slow budget exhaustion
- the team can explain what action follows each budget state
