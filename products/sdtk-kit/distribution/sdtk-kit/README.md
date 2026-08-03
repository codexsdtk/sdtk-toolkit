# sdtk-kit

> Install all six SDTK toolkits in one command.

```bash
npm install -g sdtk-kit
```

After install, all six SDTK CLI tools — plus the unified `sdtk` orchestrator — are available globally:

| CLI           | Toolkit        | Purpose                                          |
|---------------|----------------|--------------------------------------------------|
| `sdtk`        | (all six)      | One-command setup: `sdtk init --runtime <r>`     |
| `sdtk-spec`   | SDTK-SPEC      | Spec-first SDLC: PM → BA → ARCH → DEV → QA     |
| `sdtk-design` | SDTK-DESIGN    | MVP design: idea → prototype → handoff           |
| `sdtk-code`   | SDTK-CODE      | Governed coding: handoff → PR with review gates  |
| `sdtk-ops`    | SDTK-OPS       | Operations: deploy → smoke → sign-off            |
| `sdtk-wiki`   | SDTK-WIKI      | Local second brain: your project memory          |
| `sdtk-agent`  | SDTK-AGENT     | Orchestration: durable multi-step agent workflows |

## Quick start

```bash
# Set up the chosen runtime for the whole suite in one command
sdtk init --runtime claude   # or --runtime codex

# Generate the 17-file SDLC scaffold for your product/MVP (or a single feature)
# (both --key and --name are required; --feature-key/--feature-name still work)
sdtk-spec generate --key SHOPEASE --name "ShopEase MVP"
```

## Unified init: `sdtk init`

`sdtk init --runtime <claude|codex>` initialises **all six toolkits** in one step
— mirroring how `npm install -g sdtk-kit` installs every toolkit at once. It runs
each toolkit's own, already-shipped `init` in order:

```
sdtk-spec → sdtk-ops → sdtk-code → sdtk-design   (with --runtime <r>)
sdtk-wiki → sdtk-agent                            (their own non-runtime init)
```

```bash
sdtk init --runtime claude
sdtk init --runtime codex --project-path ./my-app
sdtk init --runtime claude --global        # install skills to the user/global home
sdtk init --runtime claude --keep-going    # continue past a failing toolkit
```

Options: `--runtime <claude|codex>` (required), `--runtime-scope <project|user>`,
`--global` (shorthand for `--runtime-scope user`), `--project-path <path>`,
`--force`, `--skip-runtime-assets`, `--keep-going` (default is fail-fast — stop
at the first failing toolkit), `--verbose`.

`--runtime`, `--runtime-scope`, and `--global` apply to the runtime-aware
toolkits (spec/ops/code **and** sdtk-design), so each places its skills under the
matching runtime home: `.claude/skills` for claude, `.codex/skills` for codex
(and `~/.claude/skills` / `~/.codex/skills` for `--global`). `--skip-runtime-assets`
applies only to spec/ops/code (which own the PowerShell runtime-asset payload).
`sdtk-wiki` and `sdtk-agent` install no skills and receive only `--project-path`,
`--force`, and `--verbose`.

> Note: claude defaults to **project** scope (`.claude/skills`); codex defaults
> to **user/global** scope (`~/.codex/skills`), since Codex discovers skills via
> `CODEX_HOME`. Pass `--runtime-scope project` with codex to get a project-local
> `.codex/skills` (then launch Codex with `CODEX_HOME=<project>/.codex`).

`sdtk init` is a thin orchestrator: it re-implements no init logic, writes no files
itself, and runs no PowerShell of its own — every side effect happens inside the
delegated per-toolkit init. The per-toolkit CLIs remain fully available standalone.

## Unified vs standalone install

You have two install options:

**Option 1 — Install everything at once (recommended for new projects)**

```bash
npm install -g sdtk-kit
```

npm installs all six sub-toolkits as dependencies. All CLI binaries land on PATH in one step.

**Option 2 — Install individual toolkits**

```bash
npm install -g sdtk-spec-kit    # spec / planning
npm install -g sdtk-design-kit  # design
npm install -g sdtk-code-kit    # coding
npm install -g sdtk-ops-kit     # operations
npm install -g sdtk-wiki-kit    # local second brain
npm install -g sdtk-agent-kit   # orchestration (advanced)
```

Use Option 2 if you only need one or two toolkits, or if you want granular version control per toolkit.

Both options are permanently supported. `sdtk-kit` does not replace the standalone packages.

## How the unified CLI works (maintainer note)

`sdtk-kit` declares the six sub-toolkits as dependencies AND ships thin bin
shims (`bin/sdtk-*.js`) that re-export each sub-package's CLI. This is required
because `npm install -g <pkg>` only links the bin entries of the top-level
package, never of its dependencies. A pure deps-only meta-package would install
the sub-toolkits but leave zero CLIs on PATH.

The umbrella also ships its own `sdtk` orchestrator bin (`bin/sdtk.js` + `src/`),
which delegates `sdtk init` to each sub-toolkit's published bin via subprocess
(`require.resolve` of the kit's `package.json` `bin` map, spawned with the current
Node). It adds no new dependency and re-implements no init logic.

Do not remove the `bin` field, the `bin/` shims, or `bin/sdtk.js` + `src/` — they
are the mechanism that puts `sdtk`, `sdtk-spec`, `sdtk-code`, `sdtk-ops`,
`sdtk-design`, `sdtk-wiki`, and `sdtk-agent` on PATH after a global install.

## Version pinning model

`sdtk-kit` uses caret-range dependencies (`^X.Y.Z`) on each sub-toolkit. This means:

- **Patch and minor updates** of sub-toolkits are picked up automatically when you run `npm update -g sdtk-kit`.
- **Major version bumps** in any sub-toolkit require a coordinated `sdtk-kit` major-bump and re-publish.
- If you need exact version control per toolkit, use standalone packages instead.

Current dependency ranges (as of sdtk-kit v1.51.0):

| Package          | Version |
|------------------|---------|
| sdtk-spec-kit    | ^0.9.0  |
| sdtk-code-kit    | ^0.4.0  |
| sdtk-ops-kit     | ^0.2.4  |
| sdtk-design-kit  | ^0.13.0  |
| sdtk-wiki-kit    | ^0.17.0 |
| sdtk-agent-kit   | ^0.5.0  |

## Updating

```bash
npm update -g sdtk-kit          # or: npm install -g sdtk-kit@latest
sdtk --version                  # confirm sdtk-kit + per-kit versions
```

This updates all sub-toolkits within their caret ranges. Two things to remember:

- **npm only updates the CLI code.** To refresh the skills already installed in a
  project, re-run `init` with `--force` there: `sdtk init --runtime <r> --force`
  (without `--force`, existing skill files are kept). `--force` re-copies
  toolkit-managed files but never your own files — back up a customized
  `*.config.json` first.
- **`init` never deletes.** When a release stops writing a directory an older
  version created, remove the leftover yourself after inspecting it
  (e.g. `Remove-Item -Recurse -Force .\.agents`), then re-run `sdtk init --force`.

If `npm install` fails right after a publish with `ETARGET No matching version
found`, your local metadata cache is stale — run `npm cache verify` then
`npm install -g sdtk-kit@latest --prefer-online`.

### Maintainers: publish order

When releasing, **publish the sub-kits before the umbrella**, and verify each is
live before publishing `sdtk-kit`. The umbrella pins its sub-kits with caret
ranges, so if `sdtk-kit` is published before a sub-kit it requires, anyone
installing in that window hits `ETARGET`.

```bash
# in the sub-kit (e.g. sdtk-design-kit)
npm publish
npm view sdtk-design-kit@<version> version   # confirm it is live
# then in sdtk-kit
npm publish
npm view sdtk-kit@<version> version
```

## Uninstalling

To remove sdtk-kit and its sub-toolkits:

```bash
npm uninstall -g sdtk-kit
```

Note: `npm uninstall` removes the package and its transitive dependencies. If you had any sub-toolkits installed standalone _before_ installing sdtk-kit, npm may or may not remove them depending on your npm version. Run `npm uninstall -g sdtk-spec-kit sdtk-code-kit sdtk-ops-kit sdtk-design-kit sdtk-wiki-kit sdtk-agent-kit` to be sure.

## Troubleshooting

**First step: `sdtk doctor`**

```bash
sdtk doctor
```

Reports which package each suite CLI on `PATH` actually executes and warns when a newer installed copy is shadowed (e.g. the umbrella's bundled kit hiding a newer standalone install, or the reverse). Exits 0 when healthy, 1 with actionable warnings. If a CLI seems to ignore an update you just installed, run this before anything else.

**Command not found after install**

Re-open your terminal. npm global installs require a new shell session on some systems.

Check your global prefix:

```bash
npm config get prefix
```

Ensure `<prefix>/bin` is in `PATH`.

**Only three CLIs are visible after installing sdtk-kit**

If `sdtk-spec`, `sdtk-code`, and `sdtk-ops` are visible but `sdtk-design` or `sdtk-wiki` are missing, the usual cause is a stale global install, an old npm prefix on `PATH`, or a shell command cache rather than the current `sdtk-kit` package.

Reset and verify from a fresh shell:

```bash
npm uninstall -g sdtk-kit sdtk-spec-kit sdtk-code-kit sdtk-ops-kit sdtk-design-kit sdtk-wiki-kit sdtk-agent-kit
npm cache verify
npm install -g sdtk-kit@latest
hash -r
command -v sdtk-spec sdtk-code sdtk-ops sdtk-design sdtk-wiki sdtk-agent
sdtk-spec --version
sdtk-code --version
sdtk-ops --version
sdtk-design --version
sdtk-wiki --version
sdtk-agent --version
```

On Windows PowerShell, close and reopen the terminal after reinstalling, then use `where.exe sdtk-spec`, `where.exe sdtk-design`, and the same `--version` commands.

**Windows PATH issues**

On Windows, npm global binaries land in `%APPDATA%\npm`. Make sure this is in your `PATH`. Run `npm config get prefix` to confirm the location.

**Binary collision**

If you have standalone sub-toolkits installed at different versions than what `sdtk-kit` pins, `npm install -g sdtk-kit` will upgrade them to the pinned versions. To keep a standalone version pinned, install it standalone after sdtk-kit:

```bash
npm install -g sdtk-kit
npm install -g sdtk-spec-kit@0.4.6  # pin to an older version
```

## Links

- Docs: [https://sdtk.dev](https://sdtk.dev)
- Source: [https://github.com/codexsdtk/sdtk-toolkit](https://github.com/codexsdtk/sdtk-toolkit)
- Issues: [https://github.com/codexsdtk/sdtk-toolkit/issues](https://github.com/codexsdtk/sdtk-toolkit/issues)
- License: MIT
