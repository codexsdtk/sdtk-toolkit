# SDTKOPS Parity Matrix

## Runtime Parity

| Feature | Claude | Codex | Notes |
|---------|:---:|:---:|-------|
| `init` shared-file copy | Yes | Yes | copies `AGENTS.md`, `sdtk-spec.config.json`, `sdtk-spec.config.profiles.example.json` |
| Runtime install (project) | Yes | No | Gate C0 blocks Codex project scope |
| Runtime install (user) | Yes | Yes | Codex installs under managed `sdtk-ops-*` directory names |
| Runtime status | Yes | Yes | reports `installed`, `partial`, or `not installed` |
| Runtime uninstall | Yes | Yes | idempotent managed-asset removal |
| Skill catalog payload | Yes | Yes | packaged from canonical `products/sdtk-ops/toolkit/skills/**` source |

## CLI Command Parity

| Command | Status | Notes |
|---------|--------|-------|
| `help` | Implemented | truthful public CLI baseline |
| `init` | Implemented | standalone project bootstrap flow |
| `runtime` | Implemented | supports `install`, `status`, and `uninstall` |
| `generate` | Deferred | compatibility-only on disk, not part of supported baseline |

## Package And Release Parity

| Area | Status | Notes |
|------|--------|-------|
| Package payload | Implemented | payload + manifest verification included in package |
| Tarball smoke | Implemented | real pack/install/run verification exists with gate-by-gate installed-binary output |
| Public release runbook | Implemented | `SDTKOPS_NPM_AUTH_AND_PUBLISH_RUNBOOK.md` defines auth, publish, registry verification, and isolated install checks |
| Public release report structure | Implemented | release reports and evidence bundles exist for the blocked `0.2.0` publish and the corrective `0.2.1` patch release |
| Public npm publish | Implemented | `sdtk-ops-kit` is live on npm; use `npm view sdtk-ops-kit version` to inspect the latest published version |
| Release automation parity | Deferred | deferred beyond the first internal release wave |
