# Sleep Preview Demo Fixture — CLIENT_EXPORT

A self-contained, repeatable fixture for the **Sleep Readiness Check / Preview**
that ships free in `sdtk-code-kit@0.2.1+`. It reproduces the canonical demo arc:

> **SDTK says NO first — with the exact fixes — then YES once they're done.**

| State | Inputs | `sleep report` verdict |
|-------|--------|------------------------|
| **A** | Handoff with steps but **no declared scope, no carried tests, no verify evidence** | `NOT_READY` — **30/85 FAIL** |
| **B** | Scope declared (allowed + blocked), test obligations carried, OPS handoff + passing verify gates | `READY_TO_SLEEP` — **75/85 PASS** |

This mirrors the source walkthrough in
`governance/Features/SDTK_SLEEP_MODE_PREVIEW_DEMO_R1_20260602.md` (§3, §4, §5).

## It's a dry run

Sleep Preview never executes your steps and never mutates your repo. The only
files it writes are the plan, the report, and a trust event:

```
.sdtk/trust/sleep-plan.json
.sdtk/trust/events/<date>.jsonl
docs/trust/SLEEP_REPORT_CLIENT_EXPORT.md
```

Real unattended execution is a planned **future Pro** capability (backlog BK-252);
it is not part of this Preview.

## Layout

```
fixture.js          node driver: state-a | state-b | reset | status (no deps)
states/state-a/     canonical State A inputs (incomplete handoff)
states/state-b/     canonical State B inputs (scope + tests + OPS + verify gates)
RUNBOOK.md          step-by-step recording script (BK-255B)
```

Canonical inputs live in `states/`. The driver copies them into the fixture root
(the project the CLI runs against); generated `docs/` and `.sdtk/` outputs are
gitignored and removed by `node fixture.js reset`.

## Quick start

```
cd examples/sleep-demo-client-export
npm i -g sdtk-code-kit            # 0.2.1+   (or use a locally linked sdtk-code)

node fixture.js state-a
sdtk-code sleep plan   --feature-key CLIENT_EXPORT
sdtk-code sleep report --feature-key CLIENT_EXPORT     # NOT_READY 30/85 FAIL

node fixture.js state-b
sdtk-code sleep plan   --feature-key CLIENT_EXPORT     # scope: declared
sdtk-code sleep report --feature-key CLIENT_EXPORT     # READY_TO_SLEEP 75/85 PASS

node fixture.js reset
```

See `RUNBOOK.md` for the on-camera version with expected output and reset points.
