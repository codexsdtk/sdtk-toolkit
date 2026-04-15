# SDTK-CODE Release Packaging

Version: 0.2
Last Updated: 2026-03-23
Owner: SDTK Core Team

## 1. Current Conclusion
`SDTK-CODE` now has a real public npm package line:
- package: `sdtk-code-kit`
- command: `sdtk-code`
- latest version lookup: `npm view sdtk-code-kit version`

The first public release model is:
- maintainer-driven local publish
- real package metadata and public docs truth
- installed-package smoke before publish

CI/tag-publish parity is follow-up hardening, not a blocker for the first public release.

## 2. Packaging Goal
Match the practical first-public quality already proven by the upstream toolkit family in these areas:
- public npm metadata
- working command surface
- runtime-aware install flow for Claude and Codex
- bundled payload verification
- prepublish tarball smoke
- post-publish registry and install verification
- user-facing docs that describe real package behavior only

## 3. Public Package Truth
The package must stay honest about two things at the same time:

1. `sdtk-code-kit` is publicly installable from npm, and the latest published version should be checked via `npm view sdtk-code-kit version`.
2. Real workflow execution still expects upstream `SDTK-SPEC` artifacts to already exist:
   - preferred: `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
   - compatibility fallback: `FEATURE_IMPL_PLAN` plus required slice references when the formal handoff file is missing
   - `sdtk-spec.config.json`

`SDTK-CODE` is installable on its own, but it is not a standalone replacement for upstream `SDTK-SPEC`.

## 4. Packaging Gate
For a public release or patch release, all of the following must hold:
- `package.json` contains:
  - `repository`
  - `homepage`
  - `bugs`
  - `publishConfig.access: public`
- package README, installation runbook, usage guide, and parity docs reflect first-public truth
- payload verification passes:
  - `npm run verify:payload`
- pack smoke passes:
  - `npm run pack:smoke`
- local tarball install succeeds
- installed-package smoke succeeds for:
  - `sdtk-code --version`
  - `sdtk-code --help`
  - `sdtk-code init --runtime claude`
  - `sdtk-code init --runtime codex`
  - `sdtk-code runtime install|status|uninstall`
  - bounded workflow smoke with upstream-like inputs present

## 5. Maintainer Publish Model
The current public release model is not CI/tag-publish parity.

The release is performed by a maintainer from the package root after:
- docs truth is committed
- installed-package smoke is green
- the engineering worktree is clean

Expected publish shape:
1. preflight:
   - `npm ping`
   - `npm whoami`
   - `npm view sdtk-code-kit version`
2. package gate:
   - `npm run verify:payload`
   - `npm run pack:smoke`
   - `npm pack`
3. publish:
   - `npm publish`
4. post-publish verification:
   - `npm view sdtk-code-kit name version dist-tags.latest`
   - isolated install from the registry
   - bounded package smoke from the installed package

## 6. What Stays Deferred
The following are not blockers for the current public package line:
- CI/tag-publish parity
- GitHub Actions publish automation
- umbrella package work
- repo cutover work
- SDTK-SPEC release work

## 7. Public Install Summary
Canonical install command:

```powershell
npm install -g sdtk-code-kit
```

Latest published version lookup:

```powershell
npm view sdtk-code-kit version
```

Canonical first smoke:

```powershell
sdtk-code --help
sdtk-code init --runtime codex --project-path ./my-project
```

Workflow truth:
- feature lane: `start -> plan -> build -> verify -> ship`
- bugfix lane: `start -> build -> verify -> ship`
- run this only after upstream `SDTK-SPEC` artifacts exist
