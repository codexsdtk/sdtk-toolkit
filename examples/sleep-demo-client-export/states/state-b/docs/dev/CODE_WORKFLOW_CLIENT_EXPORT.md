# CODE Workflow — CLIENT_EXPORT

Downstream SDTK-CODE workflow record for the Client Data Export feature.
This artifact carries the verify-gate evidence the Sleep Readiness check reads
for the CODE_VERIFY component (spec + quality + evidence, 10 pts each).

<!-- SDTK-CODE:VERIFY:START -->
## Verify gates
- Spec/compliance gate: `pass`
- Quality gate: `pass`
- Evidence gate: `pass`
<!-- SDTK-CODE:VERIFY:END -->

## Evidence
- Unit: CSV serializer tests pass (header row + escaping).
- Integration: `GET /export` returns 200 with a CSV attachment.
- Quality: lint + typecheck clean on the export slice.
