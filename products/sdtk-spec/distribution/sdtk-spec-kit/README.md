# sdtk-spec-kit

`sdtk-spec-kit` is the canonical shipped technical interface for `SDTK-SPEC`.

It exposes the `sdtk-spec` CLI as the primary upstream command surface.

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

# 4. Optional: build the free local Atlas graph
sdtk-spec atlas init --project-path .
```

### Pro / Custom Tier

```bash
# 1. Install
npm install -g sdtk-spec-kit

# 2. Activate your license (activation key was sent to your email)
sdtk-spec activate --license SDTK-XXXX-YYYY

# 3. Initialize workspace with runtime adapter
sdtk-spec init --runtime claude

# 4. Generate feature documentation (17-file scaffold)
sdtk-spec generate --feature-key USER_PROFILE --feature-name "User Profile"

# 5. Use premium features: ingest/audit an existing project
sdtk-spec project ingest --project-path .
sdtk-spec project audit --project-path . --json

# 6. Ask grounded questions over project documentation
sdtk-spec atlas ask --project-path . --question "What is the deployment strategy?"
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
- `sdtk-spec.config.json` -- project configuration
- `sdtk-spec.config.profiles.example.json` -- stack profile examples
- `CODEX.md` or `CLAUDE.md` -- runtime adapter
- for `--runtime claude`, skill files are installed into `.claude/skills/` (project scope, default) or `~/.claude/skills/` (user scope) unless `--skip-runtime-assets` is used
- for `--runtime codex`, skill files install into `$CODEX_HOME/skills/` or `~/.codex/skills/` by default, and into `<project>/.codex/skills/` only when you intentionally launch with the explicit local `CODEX_HOME=<project>/.codex` contract, unless `--skip-runtime-assets` is used
- `--skip-skills` is deprecated; use `--skip-runtime-assets` instead

### `sdtk-spec auth` (Advanced / Internal)

**Note:** For public Pro/Custom users, use `sdtk-spec activate --license` instead. This command is for advanced or internal organization setups.

Manage GitHub authentication and verify entitlement.

```bash
sdtk-spec auth --token <value>   # store PAT (advanced)
sdtk-spec auth --verify          # check repo access (advanced)
sdtk-spec auth --status          # show auth state
sdtk-spec auth --logout          # clear credentials
```

#### Entitlement repo override (Advanced)

By default, `sdtk-spec auth --verify` checks access against the built-in private repo. You can override this with the `SDTK_ENTITLEMENT_REPO` environment variable:

```bash
# bash / zsh
export SDTK_ENTITLEMENT_REPO=owner/repo
sdtk-spec auth --verify
```

```powershell
# PowerShell
$env:SDTK_ENTITLEMENT_REPO="owner/repo"
sdtk-spec auth --verify
```

### `sdtk-spec activate` (Pro / Custom)

Unlock premium features with your activation key.

```bash
sdtk-spec activate --license SDTK-XXXX-YYYY
sdtk-spec entitlement status
```

Your activation key was sent to your email after purchase. This command:
- Exchanges your key for a signed entitlement manifest
- Installs required premium packs locally
- Unlocks all premium commands immediately

### `sdtk-spec entitlement`

Inspect local entitlement state.

```bash
sdtk-spec entitlement status
sdtk-spec entitlement sync  # advanced / internal only
```

Important:
- `entitlement status` is local-only and does not hit the network.
- `entitlement sync` is an advanced command for organization-based setups or troubleshooting.
- For public Pro/Custom users, use `sdtk-spec activate --license` instead.
- Premium commands such as `atlas ask`, `project ingest`, `project audit`, and `project refresh` fail closed when entitlement or pack integrity is missing.

### `sdtk-spec generate`

Generate feature documentation from templates. Produces 17 files matching the `SDTK-SPEC` toolkit contract.

```bash
sdtk-spec generate --feature-key <UPPER_SNAKE_CASE> --feature-name "<text>" [--project-path <path>] [--force] [--validate-only]
```

Output files include: project initiation, BA spec, flow-action spec, PRD, backlog, architecture design, database spec, API specs (OpenAPI + endpoints + design detail + flow list), UI design layout, implementation plan, test cases, and QA release report.

### `sdtk-spec atlas`

Build and browse a local document graph for your project.

Atlas is a free local feature. No authentication or entitlement is required.

#### Subcommands

```bash
sdtk-spec atlas init     # Initialize Atlas config and run first build (opens viewer)
sdtk-spec atlas build    # Rebuild the local document graph from project markdown
sdtk-spec atlas open     # Open the last successful atlas build in a local browser
sdtk-spec atlas watch    # Watch for markdown changes and rebuild automatically
sdtk-spec atlas status   # Show initialization state and last build summary
sdtk-spec atlas ask      # Ask grounded questions over local Atlas docs (Pro)
```

#### First-run flow

```bash
cd <project>
sdtk-spec atlas init
```

This creates `.sdtk/atlas/config.json`, scans local markdown, builds the document graph and static viewer, and opens the viewer in your browser by default.

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

# Ask grounded questions over the local Atlas graph (Pro)
sdtk-spec atlas ask --project-path ./my-project --question "How do I install this toolkit?"
```

#### Options (init)

```bash
sdtk-spec atlas init [--project-path <path>] [--output-dir <path>] [--scan-root <path>] [--force] [--no-build] [--no-open] [--verbose]
```

#### Options (ask)

```bash
sdtk-spec atlas ask --question "<text>" [--project-path <path>] [--output-dir <path>] [--source <path-or-id>] [--max-docs <n>] [--json] [--verbose]
```

#### Key facts

- Generated artifacts are written to `<project>/.sdtk/atlas/` (project-local, not global).
- The viewer server binds to `127.0.0.1` by default (loopback only).
- Python 3.8+ must be available in `PATH` for `atlas init`, `build`, and `watch`.
- Free Atlas scans local markdown files only and does not upload document content to external services.
- `atlas ask` is a Pro capability and requires valid entitlement (unlock with `sdtk-spec activate --license`) plus a cached premium pack.
- `sdtk-spec auth` and `sdtk-spec entitlement` are separate capability-management surfaces; they are not required for free Atlas commands.

### `sdtk-spec project`

Run premium project intelligence workflows against an existing consumer repository.

```bash
sdtk-spec project ingest   # Build deterministic project foundation + staged docs baseline (Pro)
sdtk-spec project audit    # Read-only readiness / risk / gap audit (Pro)
sdtk-spec project refresh  # Incrementally refresh managed .sdtk/project/ artifacts (Pro)
```

Examples:

```bash
# First premium ingest against a consumer repo
sdtk-spec project ingest --project-path ./my-project

# Read-only audit using cached foundation when available
sdtk-spec project audit --project-path ./my-project --json

# Incrementally refresh foundation, evidence packs, and staged docs baseline
sdtk-spec project refresh --project-path ./my-project
```

Key facts:

- `project ingest`, `project audit`, and `project refresh` are Pro features.
- All three commands require a valid Pro entitlement (unlock with `sdtk-spec activate --license`) and a cached premium pack.
- All artifacts stay project-local under `<project>/.sdtk/project/`.
- `project ingest` writes reusable foundation artifacts such as census, source inventory, profile, module graph, runtime markers, evidence packs, and a staged docs baseline.
- `project audit` is read-only. It does not mutate live `/docs/`, write new staged docs, or refresh ingest artifacts in place.
- `project refresh` is incremental and requires an existing managed ingest baseline.
- None of the project commands modify live `/docs/`; draft outputs remain under `.sdtk/project/`.
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
- Python 3.8+ in `PATH` (required for `sdtk-spec atlas init`, `build`, and `watch`)

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

**Premium commands still locked after activation**
- Run `sdtk-spec entitlement status` to verify activation succeeded.
- If status shows no entitlement, try running `sdtk-spec activate --license <KEY>` again.
- Reinstall the package if issues persist: `npm install -g sdtk-spec-kit@latest`.

**Payload hash mismatch**
- The bundled toolkit payload may be corrupted. Reinstall the package.

**Atlas build fails or Python not found**
- Install Python 3.8+ from python.org and ensure `python --version` works from the same shell.
- Confirm Python is available in `PATH`, then rerun `sdtk-spec atlas build` or `sdtk-spec atlas init`.

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
