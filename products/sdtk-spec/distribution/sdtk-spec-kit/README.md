# sdtk-spec-kit

`sdtk-spec-kit` is the canonical shipped technical interface for `SDTK-SPEC`.

It exposes the `sdtk-spec` CLI as the primary upstream command surface.

Package version in this source snapshot: `0.9.1`
Full usage guide: `products/sdtk-spec/governance/SDTK_SPEC_USAGE_GUIDE.md`

Wraps the `SDTK-SPEC` PowerShell toolkit for portable, reproducible feature documentation scaffolding.

Canonical install/runtime source in the source repo: `governance/ai/cli/SDTK_RUNTIME_AND_FEATURE_STATUS.md`

Generated skills include verification gates and two-stage review hard gates. The current source baseline also ships a canonical skill catalog, handoff templates, public example packs, and a runtime readiness audit. See `products/sdtk-spec/toolkit/SDTK_TOOLKIT.md` for workflow quality contracts.

## Migration From `sdtk-kit` / `sdtk`

If you previously used the older interface, uninstall the deprecated package first, then install the canonical package:

```bash
npm uninstall -g sdtk-kit
npm install -g sdtk-spec-kit
```

After migrating, replace `sdtk ...` commands with `sdtk-spec ...`.

## Install

```bash
npm install -g sdtk-spec-kit
# or link locally for development:
npm link
```

## Update Existing Installation

Use the public `update` command when `sdtk-spec-kit` is already installed and you want the current published package line plus refreshed managed project or runtime files.

```bash
sdtk-spec update --check-only
sdtk-spec update --runtime claude --project-path ./my-project
```

Codex user-scope example:

```bash
sdtk-spec update --runtime codex --scope user --project-path ./my-project
```

Important truth:
- `sdtk-spec update` still uses `npm install -g sdtk-spec-kit@<target>` as the package refresh mechanism
- `update --check-only` is non-destructive and prints the planned commands only
- `--skip-project-files` suppresses `sdtk-spec init --force`
- `--skip-runtime-assets` suppresses runtime refresh
- there is no umbrella suite-wide update command

## Quick Start

### Free Tier

```bash
# 1. Install
npm install -g sdtk-spec-kit

# 2. Initialize workspace with runtime adapter
sdtk-spec init --runtime claude

# 3. Generate feature documentation (17-file scaffold)
sdtk-spec generate --feature-key USER_PROFILE --feature-name "User Profile"

# 4. Optional: build the free local Atlas compatibility graph
sdtk-spec atlas init --project-path .
```

### Pro / Custom Tier

```bash
# 1. Install
npm install -g sdtk-spec-kit

# 2. Activate your license (activation key was sent to your email)

# 3. Initialize workspace with runtime adapter
sdtk-spec init --runtime claude

# 4. Generate feature documentation (17-file scaffold)
sdtk-spec generate --feature-key USER_PROFILE --feature-name "User Profile"

# 5. Use premium features: ingest/audit an existing project

```

The CLI generates the scaffold contract only. Full content enrichment still runs phase-by-phase through PM, BA, ARCH, DEV, and QA using the installed runtime guidance plus the toolkit docs.

## Commands

### `sdtk-spec init`

Initialize `SDTK-SPEC` workspace in the current or specified project directory.

```bash
sdtk-spec init --runtime <codex|claude> [--project-path <path>] [--force] [--runtime-scope <project|user>] [--skip-runtime-assets]

# Deprecated: --skip-skills (use --skip-runtime-assets instead)
```

Creates:
- `AGENTS.md` -- project-level agent guidance
- `governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md` -- compact session bootstrap truth
- `governance/ai/session/SDTK_AGENT_WORKING_RULES.md` -- stable working-style contract
- `sdtk-spec.config.json` -- project configuration
- `sdtk-spec.config.profiles.example.json` -- stack profile examples
- `CODEX.md` or `CLAUDE.md` -- runtime adapter
- for `--runtime claude`, skill files are installed into `.claude/skills/` (project scope, default) or `~/.claude/skills/` (user scope) unless `--skip-runtime-assets` is used
- for `--runtime codex`, skill files install into `$CODEX_HOME/skills/` or `~/.codex/skills/` by default, and into `<project>/.codex/skills/` only when you intentionally launch with the explicit local `CODEX_HOME=<project>/.codex` contract, unless `--skip-runtime-assets` is used
- `--skip-skills` is deprecated; use `--skip-runtime-assets` instead



Manage GitHub authentication and verify entitlement.

```bash
```

#### Entitlement repo override (Advanced)


```bash
# bash / zsh
```

```powershell
# PowerShell
```


Unlock premium features with your activation key.

```bash
```

Your activation key was sent to your email after purchase. This command:
- Exchanges your key for a signed entitlement manifest


Inspect local entitlement state.

```bash
```

Important:
- `entitlement status` is local-only and does not hit the network.

### `sdtk-spec generate`

Generate feature documentation from templates. Produces 17 files matching the `SDTK-SPEC` toolkit contract.

```bash
sdtk-spec generate --feature-key <UPPER_SNAKE_CASE> --feature-name "<text>" [--project-path <path>] [--force] [--validate-only]
```

Output files include: project initiation, BA spec, flow-action spec, PRD, backlog, architecture design, database spec, API specs (OpenAPI + endpoints + design detail + flow list), UI design layout, implementation plan, test cases, and QA release report.

### `sdtk-spec analyze`

Preserve a customer requirement source, bootstrap the standard 17-file scaffold, and create an agent task packet for PM/BA/ARCH/DEV/QA analysis.

```bash
sdtk-spec analyze --source <requirements.md> --feature-key <UPPER_SNAKE_CASE> --feature-name "<text>" [--project-path <path>] [--force] [--json]
```

`analyze` is source intake and workflow bootstrap. It records source hash traceability and likely mojibake/encoding risk, but it does not fully understand arbitrary requirements by itself. PM/BA/ARCH agents complete source-backed analysis inside the generated artifacts.

### `sdtk-spec atlas`

Build and browse a local document graph for your project.

Atlas is a free local compatibility feature in `sdtk-spec-kit`. No
authentication or entitlement is required. `sdtk-wiki` owns the graph builder
and the canonical `.sdtk/wiki` storage; `sdtk-spec atlas` remains the R1
compatibility namespace and forwards every subcommand to it.

#### Subcommands

```bash
sdtk-spec atlas init     # Initialize Atlas config and run first build (opens viewer)
sdtk-spec atlas build    # Rebuild the local document graph from project markdown
sdtk-spec atlas open     # Open the last successful atlas build in a local browser
sdtk-spec atlas watch    # Watch for markdown changes and rebuild automatically
sdtk-spec atlas status   # Show initialization state and last build summary
```

#### First-run flow

```bash
cd <project>
sdtk-spec atlas init
```

This delegates to `sdtk-wiki init`: it creates the graph workspace under `.sdtk/wiki`, scans local markdown, builds the document graph and static viewer, and opens the viewer in your browser by default.

#### Common flows

```bash
# Initialize with a custom project path, skip opening viewer
sdtk-spec atlas init --project-path ./my-project --no-open

# Rebuild after doc changes
sdtk-spec atlas build --project-path ./my-project

# Open the viewer manually
sdtk-spec atlas open --project-path ./my-project

# Watch for changes and rebuild continuously
sdtk-spec atlas watch --project-path ./my-project

# Check Atlas initialization state and last build summary
sdtk-spec atlas status --project-path ./my-project

```

#### Options (init)

```bash
sdtk-spec atlas init [--project-path <path>] [--output-dir <path>] [--scan-root <path>] [--force] [--no-build] [--no-open] [--verbose]
```

#### Key facts

- `sdtk-spec atlas` is the R1 compatibility namespace. Every subcommand delegates to `sdtk-wiki`, which owns the graph builder; flags are forwarded verbatim.
- Requires `sdtk-wiki-kit`, which the SDTK suite installer brings in alongside this package. Without it, `atlas` exits 2 and prints the install steps.
- The builder is pure Node. No interpreter or extra runtime is required.
- Generated artifacts are written to `<project>/.sdtk/wiki/graph/` (project-local, not global). A legacy `<project>/.sdtk/atlas/` from an older release is left alone, never auto-deleted.
- The viewer server binds to `127.0.0.1` by default (loopback only).
- Free Atlas scans local markdown files only and does not upload document content to external services.
- The old SPEC ask command path is not supported. Native Ask is owned by `sdtk-wiki ask` and capability `wiki.ask`.

### `sdtk-spec project`

Run premium project intelligence workflows against an existing consumer repository.

```bash
sdtk-spec project promote  # Publish reviewed staged docs into docs/ for sdtk-wiki (free; dry-run by default)
```

Every verb accepts `--help` for verb-scoped usage, e.g. `sdtk-spec project promote --help`.

Examples:

```bash
# First premium ingest against a consumer repo

# Read-only audit using cached foundation when available

# Incrementally refresh foundation, evidence packs, and staged docs baseline

# Publish the reviewed staged docs baseline into docs/ (dry-run first, then apply)
sdtk-spec project promote --project-path ./my-project
sdtk-spec project promote --project-path ./my-project --apply
```

Key facts:

- All Pro artifacts stay project-local under `<project>/.sdtk/project/`.
- `project promote` is a dry-run by default; it classifies existing live docs as identical (`=`) or differing (`≠`) from staged, skips differing docs unless `--force` is given, and only writes on `--apply`.
- None of the Pro project commands modify live `/docs/`; draft outputs remain under `.sdtk/project/`. `promote` is the one verb that writes into `docs/`, and only with `--apply`.
- Maintainer-root guardrails block using the SDTK maintainer monorepo root as a premium project target.

### `sdtk-spec runtime`

Manage runtime skill assets independently of `sdtk-spec init`.

```bash
sdtk-spec runtime install --runtime <codex|claude> [--scope <project|user>]
sdtk-spec runtime uninstall --runtime <codex|claude> [--scope <project|user>]
sdtk-spec runtime status --runtime <codex|claude>
```

Scope defaults:
- `claude`: `project` (installs to `.claude/skills/`); `user` installs to `~/.claude/skills/`
- `codex`: defaults to `user` scope (installs to `$CODEX_HOME/skills/` or `~/.codex/skills/`) and supports `project` scope only through the explicit local `CODEX_HOME=<project>/.codex` contract

Important uninstall truth:
- `sdtk-spec runtime uninstall` removes only SDTK-SPEC-managed skill folders for the selected runtime and scope
- it does **not** delete parent runtime roots such as `.claude/`, `.claude/skills/`, `$CODEX_HOME/`, or `$CODEX_HOME/skills/`
- `npm uninstall -g sdtk-spec-kit` removes the CLI package only and does not remove runtime assets that were already installed

Examples:

```bash
# Install Claude skills at project scope (default)
sdtk-spec runtime install --runtime claude

# Install Claude skills at user scope
sdtk-spec runtime install --runtime claude --scope user

# Check installed runtime assets
sdtk-spec runtime status --runtime claude

# Remove runtime assets
sdtk-spec runtime uninstall --runtime claude --scope project

# Remove the npm package after runtime cleanup
npm uninstall -g sdtk-spec-kit
```

### `sdtk-spec --help` / `sdtk-spec --version`

```bash
sdtk-spec --help
sdtk-spec --version
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation or user error (bad args, missing auth) |
| 2 | Dependency error (PowerShell not found) |
| 3 | Integrity error (payload hash mismatch) |
| 4 | Unexpected internal error |

## Requirements

- Node.js >= 18.13.0
- PowerShell (Windows PowerShell 5.1+ or PowerShell Core)
- `sdtk-wiki-kit` for the `atlas` commands

## Troubleshooting

**PowerShell not found**
- Ensure `powershell.exe` (Windows) or `pwsh` (macOS/Linux) is in your PATH.

**Activation key not received**
- Check your email (including spam/junk folders) for your activation key from the fulfillment system.
- If the email is missing, contact support with your purchase order details.

**Activation failed**
- Verify your key is in the format `SDTK-XXXX-YYYY`.
- Check your network connection.
- If the issue persists, contact support with the error message.

- Reinstall the package if issues persist: `npm install -g sdtk-spec-kit@latest`.

**Payload hash mismatch**
- The bundled toolkit payload may be corrupted. Reinstall the package.

**Atlas exits 2 with "sdtk-wiki is not installed"**
- `sdtk-spec atlas` delegates to `sdtk-wiki`. Install it with `npm install -g sdtk-wiki-kit`.
- Then rerun `sdtk-spec atlas build`, or call `sdtk-wiki atlas build` directly.

## Development

```bash
# Sync toolkit payload from repo root
npm run build:payload

# Verify payload integrity
npm run verify:payload

# Smoke test npm pack
npm run pack:smoke
```

Run `tests/skill_triggering/` to validate skill routing behavior.
