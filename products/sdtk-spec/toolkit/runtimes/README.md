# Runtime Adapters

The SDTK-SPEC core lives in `toolkit/` and stays runtime-agnostic.

Runtime adapters are lightweight entry files installed into the target project:
- `codex` -> installs `CODEX.md`
- `claude` -> installs `CLAUDE.md`

Use installer runtime switch:

```powershell
powershell -ExecutionPolicy Bypass -File ".\\toolkit\\install.ps1" -Runtime codex
powershell -ExecutionPolicy Bypass -File ".\\toolkit\\install.ps1" -Runtime claude
```

Notes:
- `codex` runtime can install skills to `$CODEX_HOME/skills`.
- project-local Codex orchestrator support is bounded to explicit `CODEX_HOME=<project>/.codex`; native `.codex/skills` auto-discovery is not claimed.
- disk presence of `.codex/skills/sdtk-orchestrator` does not prove a visible or working direct built-in entrypoint.
- `claude` runtime skips Codex skill installation by design.
- Claude visible-list presence does not prove `/orchestrator`.
- Until runtime-specific direct syntax is validated, the supported controller path remains the repo-local orchestrator contract.
