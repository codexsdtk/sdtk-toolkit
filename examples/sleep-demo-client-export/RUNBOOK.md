# RUNBOOK — Sleep Preview demo recording (BK-255B)

Audience: the recorder filming the LS approval video. This is the exact, repeatable
command sequence. All output below is **real**, captured from `sdtk-code-kit@0.2.1`.

## 0. Prep (off camera)

```
cd examples/sleep-demo-client-export
npm i -g sdtk-code-kit            # 0.2.1+   (verify: sdtk-code --version)
node fixture.js reset            # clean slate
```

Terminal hygiene: clear scrollback; widen the window so the readiness lines don't wrap.

## 1. State A — "Can I sleep?" → **NO** (the trust moment)

Narration: *a solo founder hands off a feature before bed — steps, but no scope, no
tests, no verify evidence.*

```
node fixture.js state-a
sdtk-code sleep plan   --feature-key CLIENT_EXPORT
sdtk-code sleep report --feature-key CLIENT_EXPORT
```

**Highlight on camera:**
- `sleep plan` line `scope:  undeclared` and `steps: 3`.
- `sleep report`:
  - `Sleep Readiness: NOT_READY`
  - `readiness: 30/85 — FAIL`
  - reason: *Scope not declared — the agent could touch any file…*
- Open `docs/trust/SLEEP_REPORT_CLIENT_EXPORT.md`, scroll to **What needs you**:
  - `Ship-readiness FAIL. Failing components: CODE_VERIFY, FILE_SCOPE, OPS.`
  - `No test obligations carried`.

Expected `sleep report` stdout:
```
Sleep Readiness: NOT_READY
  reason:            Scope not declared — the agent could touch any file; `scope_lock` has nothing to enforce.
  readiness:         30/85 — FAIL
  report:            .../docs/trust/SLEEP_REPORT_CLIENT_EXPORT.md
```

Beat: **"SDTK refuses to let you sleep — and tells you exactly what to fix."**

## 2. State B — apply the fixes → **YES**

Narration: *the founder declares scope, carries the tests, and the verify gates pass.*
`node fixture.js state-b` stages the single mutation (scope + test obligations on the
handoff, plus `OPS_HANDOFF_CLIENT_EXPORT.json` and a `CODE_WORKFLOW_CLIENT_EXPORT.md`
with passing verify gates).

```
node fixture.js state-b
sdtk-code sleep plan   --feature-key CLIENT_EXPORT
sdtk-code sleep report --feature-key CLIENT_EXPORT
```

> Re-run **both** commands: the scope verdict is baked into the plan, so `sleep plan`
> must run again for `scope: declared` to take effect.

**Highlight on camera:**
- `sleep plan` line flips to `scope:  declared`.
- `sleep report`:
  - `Sleep Readiness: READY_TO_SLEEP`
  - `readiness: 75/85 — PASS`
- Open the report; the five sections now read green — **What it can touch** lists the
  allowed/blocked scopes, **When it will stop** lists the 8 stop conditions + budgets,
  **What proves it's done** lists the test obligations, **What needs you → Blockers: none**.

Expected `sleep report` stdout:
```
Sleep Readiness: READY_TO_SLEEP
  reason:            The sleep plan is bounded, readiness is PASS, and test obligations are present.
  readiness:         75/85 — PASS
  report:            .../docs/trust/SLEEP_REPORT_CLIENT_EXPORT.md
```

Beat: **"Fix the scope, carry the tests, pass verify — now SDTK clears you to sleep,
and shows exactly what the agent may touch, when it will stop, and what proves it's done."**

## 3. The dry-run guarantee (optional closing beat)

Show that nothing ran — only the plan, report, and trust event were written:

```
find docs .sdtk -type f
```
Expected (plus the staged handoff inputs):
```
.sdtk/trust/events/<date>.jsonl
.sdtk/trust/sleep-plan.json
docs/trust/SLEEP_REPORT_CLIENT_EXPORT.md
```
No `.git`, no `node_modules`, no build artifacts. Every report header says
*"This is a pre-flight projection of the plan — nothing was executed."*

## 4. Reset between takes

```
node fixture.js reset
```
Removes all staged inputs and generated outputs. Re-run from step 1 for a clean take.

## Messaging guardrails (do not violate on camera)

- Call it **"Sleep Readiness Check / Preview"** — never "ships while you sleep."
- The Preview proves readiness; it does **not** run the work.
- Real unattended execution is **future Pro** (BK-252), not available today.
- Free today = Trust Layer + Sleep Preview. No paying-user / purchasable-Pro claims.
