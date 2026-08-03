# SDTK-WIKI Kit

`sdtk-wiki-kit` is the standalone SDTK-WIKI Foundation/Beta toolkit package for
project-local wiki, document graph, provenance, lint/gap analysis, local source
intake, grounded Ask, and report-first local wiki maintenance workflows.

Package version in this source snapshot: `0.17.0`
CLI command: `sdtk-wiki`

SDTK-WIKI is the canonical home for new SDTK wiki work. The older
`sdtk-spec atlas` commands remain a compatibility path for free graph/viewer
workflows and keep using `.sdtk/atlas`.

## Install

```powershell
npm install -g sdtk-wiki-kit
sdtk-wiki --help
```

For local validation from this repository:

```powershell
node products/sdtk-wiki/distribution/sdtk-wiki-kit/bin/sdtk-wiki.js --help
```

## Current Runtime Surface

Implemented in the Foundation/Beta package:

| Capability | Command |
|---|---|
| Initialize SDTK-WIKI workspace | `sdtk-wiki init` |
| Build a local wiki without timestamp variables | `sdtk-wiki ingest`, `sdtk-wiki compile --mode safe --apply`, `sdtk-wiki query` |
| Build graph, viewer, generated pages, and provenance | `sdtk-wiki atlas build` |
| Open local viewer | `sdtk-wiki atlas open` |
| Watch markdown sources and rebuild | `sdtk-wiki atlas watch` |
| Show workspace/build status | `sdtk-wiki atlas status` |
| Register one local source in raw/provenance registry | `sdtk-wiki wiki ingest` |
| Run non-destructive wiki lint | `sdtk-wiki lint` |
| Run stale-page prune dry-run report | `sdtk-wiki wiki prune --dry-run` |
| Generate local discovery plan from gap evidence | `sdtk-wiki wiki discover --plan` |
| Generate local discovery plan with beginner facade | `sdtk-wiki discover --plan` |
| Run report-first maintenance cycle | `sdtk-wiki maintain --mode safe` |
| Write opt-in GitHub enrichment review report | `sdtk-wiki enrich --source github --mode review` |
| Generate semantic extraction dry-run report | `sdtk-wiki wiki extract --dry-run` |
| Generate compile dry-run preview and JSON sidecar | `sdtk-wiki wiki compile --dry-run` |
| Apply an approved compile JSON sidecar | `sdtk-wiki wiki compile --apply --yes` |
| Search generated local wiki pages locally | `sdtk-wiki search` |
| Query generated local wiki pages locally | `sdtk-wiki query` |
| Ask grounded questions over built graph | `sdtk-wiki ask` with `wiki.ask` entitlement/runtime preconditions |
| Save one redacted query record after successful Ask | `sdtk-wiki ask --save-query` with `wiki.ask` entitlement/runtime preconditions |

Not implemented in the Foundation/Beta runtime:

- automatic web discovery or web fetch
- automatic source ingest from the web
- destructive prune/delete/archive
- query history list/show/delete commands
- full prompt/full answer query persistence by default
- automatic migration or deletion of `.sdtk/atlas`

## Workspace Contract

| Path | Meaning |
|---|---|
| `wiki` | canonical human-facing local wiki output |
| `.sdtk/wiki` | internal SDTK-WIKI workspace root |
| `.sdtk/wiki/graph` | graph/viewer output |
| `.sdtk/wiki/pages` | generated managed wiki pages |
| `.sdtk/wiki/raw` | metadata-only raw/source registry |
| `.sdtk/wiki/provenance` | source/build/ingest provenance |
| `.sdtk/wiki/reports` | lint, prune, discover, and compile preview reports |
| `.sdtk/wiki/personal-brain` | legacy generated semantic pages, readable as fallback only |
| `.sdtk/wiki/queries` | opt-in redacted Ask query records |
| `.sdtk/atlas` | legacy Atlas compatibility output, readable only |

SDTK-WIKI writes human-facing generated wiki pages under project-local `wiki/`.
Internal state, reports, provenance, raw registry, graph, logs, and legacy
fallback pages stay under project-local `.sdtk/wiki`. It must not auto-delete,
auto-migrate, or rewrite `.sdtk/atlas`.

Existing `sdtk-spec atlas init|build|open|watch|status` commands remain the R1
compatibility path and keep compatibility output under `.sdtk/atlas`.
capability `wiki.ask`.

## First Run

Run from the project root you want to index:

```powershell
sdtk-wiki init --project-path . --no-open
sdtk-wiki atlas status --project-path .
sdtk-wiki atlas build --project-path .
sdtk-wiki lint --project-path .
```

Open the viewer:

```powershell
sdtk-wiki atlas open --project-path .
```

## Simple Local Wiki Flow

Use this when you want the shortest local wiki path and do not need to
inspect timestamped JSON files:

```powershell
sdtk-wiki init --no-open
sdtk-wiki ingest .\source-md
sdtk-wiki compile --mode safe --apply
sdtk-wiki query "multi-agent"
sdtk-wiki lint
sdtk-wiki discover --plan
sdtk-wiki maintain --mode safe
sdtk-wiki enrich --source github --mode review
```

Behavior:

- `ingest` runs local semantic extraction and writes a report.
- `compile --mode safe --apply` creates or refreshes the compile preview/JSON
  sidecar internally, then applies the sidecar contract.
- `query` is deterministic local search over `wiki/`, with legacy
  `.sdtk/wiki/personal-brain` fallback; it
  does not use premium Ask, LLM/RAG, web fetch, or query history.
- `discover` and `maintain` are report-first and do not apply, delete, archive,
  fetch web sources, or mutate `.sdtk/atlas`.
- `enrich` is explicit opt-in review mode. It writes local review evidence and
  does not fetch GitHub or apply changes.

Interactive viewer flow:

```powershell
sdtk-wiki init
```

Bare `sdtk-wiki init` may open/start the viewer and keep the terminal session
active. Use `sdtk-wiki init --no-open` for automation, CI, and local
non-interactive validation.

### Viewer tabs

The local viewer has four tabs in the left rail: **Dashboard** (agent kanban),
**Docs** (search + structured detail), **Graph** (knowledge graph), and
**Design** (design prototype). The Design tab, served by the same local wiki
server, provides the full design loop:

1. **Pick a style** — the **style gallery** shows the category-oriented presets,
   each with swatches and a layout thumbnail.
2. **Generate** — selecting a style reveals a prompt box; "Generate prototype"
   runs `sdtk-design start --idea "…" --style <preset>` in your project (the
   server spawns the `sdtk-design` binary — it does not bundle the design kit),
   streaming the live log, then loads the prototype.
3. **Annotate** — toggle **Annotate**, click elements in a prototype screen,
   add a note per mark, and "Send to agent" writes a hard-scoped
   `docs/design/feedback/DESIGN_FEEDBACK_<timestamp>.md` (schema
   `sdtk.design.feedback.v1`) plus a copy-ready instruction to apply it in your
   agent session. The viewer never edits screen HTML itself.

`sdtk-design` must be on `PATH` (install `sdtk-kit` or `sdtk-design-kit`) for the
Generate step; the gallery and prototype display work without it.

## Command Reference

### Init

```powershell
sdtk-wiki init [--project-path <path>] [--output-dir <path>] [--scan-root <path>] [--force] [--no-build] [--no-open] [--host <host>] [--port <port>] [--verbose]
```

Initializes `.sdtk/wiki`, writes package config, optionally builds the graph,
and optionally opens the viewer.

### Build, Open, Watch, Status

```powershell
sdtk-wiki atlas build [--project-path <path>] [--output-dir <path>] [--scan-root <path>] [--verbose]
sdtk-wiki atlas open [--project-path <path>] [--host <host>] [--port <port>] [--no-open]
sdtk-wiki atlas watch [--project-path <path>] [--scan-root <path>] [--port <port>] [--no-open]
sdtk-wiki atlas status [--project-path <path>]
```

The `atlas` namespace is retained for R1 command continuity while generated
workspace output is SDTK-WIKI-owned under `.sdtk/wiki`.

### Ingest Local Source Metadata

```powershell
sdtk-wiki wiki ingest --project-path <path> --source <path>
```

Registers one local project source in `.sdtk/wiki/raw` and writes ingest
provenance under `.sdtk/wiki/provenance`.

Safety:

- local project files only
- metadata-only registry
- no source payload copy
- no generated page updates
- no graph/viewer rebuild side effects

### Beginner Ingest Operation

```powershell
sdtk-wiki ingest <source-root> [--project-path <path>]
sdtk-wiki ingest --source-root <source-root> [--project-path <path>]
```

Runs semantic extraction over a local Markdown source root plus supported JSON
source records and writes the latest
`semantic-extraction-dry-run-*.json` report under `.sdtk/wiki/reports`.

This is the beginner-friendly facade for `sdtk-wiki wiki extract --dry-run`.
It does not mutate source files, local wiki pages, raw/provenance state,
graph outputs, web sources, Ask state, or `.sdtk/atlas`.

Supported JSON repository records may be an array or an object containing a
`records`, `repos`, `repositories`, `items`, or `data` array. Each record can
include `repo_url`, `owner`, `repo_name`, `message_text_snippet`,
`source_link`, `topics`, and `confidence`. JSON records are local-only evidence:
SDTK-WIKI does not fetch GitHub, Facebook, or web URLs.

### Lint

```powershell
sdtk-wiki lint [--project-path <path>]
```

Runs report-first checks over canonical `.sdtk/wiki` artifacts and writes a
dated markdown report under `.sdtk/wiki/reports`. Lint does not auto-fix,
delete, archive, compile, or persist query history.

### Prune Dry-Run

```powershell
sdtk-wiki wiki prune --dry-run --project-path <path>
```

Writes a stale managed-page review report under `.sdtk/wiki/reports`.
This command is dry-run only. It does not delete, archive, apply, or mutate
`.sdtk/atlas`.

### Discover Plan

```powershell
sdtk-wiki wiki discover --plan --project-path <path>
```

Writes a local-only discovery plan from existing lint/raw/provenance/stale
evidence under `.sdtk/wiki/reports`.

Safety:

- no web fetch
- no source ingest
- no compile/apply
- no prune/delete/archive

Beginner facade:

```powershell
sdtk-wiki discover --plan [--project-path <path>]
```

This uses the same local-only discovery plan behavior and report-first safety
boundary.

### Semantic Extraction Dry-Run

```powershell
sdtk-wiki wiki extract --project-path <path> --source-root <path> --dry-run
```

Reads local Markdown sources and supported JSON repository records and writes a
semantic extraction JSON report under `.sdtk/wiki/reports`. The report can
identify local source records, GitHub tool candidates, concept candidates,
relations, comparisons, syntheses, and source-quality findings.

Safety:

- local source roots only
- no web fetch
- no page generation
- no graph/viewer rebuild side effects
- no raw/provenance mutation
- no `.sdtk/atlas` mutation

### Compile Dry-Run Preview

```powershell
sdtk-wiki wiki compile --plan <path> --project-path <path> --dry-run
```

Reads a local structured markdown plan, JSON operation plan, or
`sdtk_wiki_semantic_extraction` JSON report and writes both:

- `.sdtk/wiki/reports/compile-dry-run-preview-YYYY-MM-DD.md`
- `.sdtk/wiki/reports/compile-apply-plan-YYYY-MM-DD.json`

The markdown report is for human review. The JSON sidecar is the only supported
source of truth for explicit apply.

Supported operation types:

- `append_section`
- `create_page`
- `add_relation`
- `add_source_ref`

Unknown operation types are reported as `unsupported_operation`. Dry-run does
not modify wiki pages, raw sources, provenance, or `.sdtk/atlas`.

### Beginner Compile Operation

```powershell
sdtk-wiki compile --mode safe [--project-path <path>]
sdtk-wiki compile --mode safe --apply [--project-path <path>]
```

The beginner facade hides timestamped JSON paths:

- without `--apply`, it finds the latest semantic extraction report and writes
  the compile preview plus JSON sidecar
- with `--apply`, it finds the latest sidecar or creates one from the latest
  extraction report, then applies through the same sidecar-only contract

`safe` is the only R1 mode. Auto mode, destructive cleanup, web fetch, Ask, raw
mutation, provenance mutation, source mutation, and `.sdtk/atlas` mutation are
not performed.

### Compile Apply

```powershell
sdtk-wiki wiki compile --plan <compile-apply-plan-json> --project-path <path> --apply --yes
```

Applies only a `record_type: "sdtk_wiki_compile_apply_plan"` JSON sidecar
generated by compile dry-run. Markdown plans and raw semantic extraction JSON
are rejected for apply.

Apply behavior:

- requires `--apply --yes`
- writes only under `wiki/` for new canonical output
- legacy `.sdtk/wiki/personal-brain` sidecars remain readable for compatibility
- create-only or same-content no-op
- no overwrite with different content
- no delete, archive, rewrite, or reorder
- no raw/provenance descriptor mutation
- no `.sdtk/atlas` mutation

### Local Search

```powershell
sdtk-wiki search --project-path <path> "<query>"
```

Searches generated local wiki Markdown pages under `wiki/**/*.md`, falling
back to `.sdtk/wiki/personal-brain/**/*.md` for legacy workspaces.

Search is deterministic, read-only, and non-premium. It does not require
`wiki.ask` entitlement, does not call an LLM/RAG runtime, does not write query
history, and does not mutate project files.

Beginner query facade:

```powershell
sdtk-wiki query --project-path <path> "<query>"
```

`query` is the simple local search command. It is not premium Ask and does not
require `wiki.ask`.

### Ask

```powershell
sdtk-wiki ask --question "<text>" [--project-path <path>] [--json] [--source <id-or-path>] [--max-sources <n>] [--save-query]
```

Native `sdtk-wiki ask` is implemented as the canonical Q&A command for
capability `wiki.ask`, but it is not a free local search command. It requires
valid `wiki.ask` entitlement and runtime preconditions.

Preconditions:

- `.sdtk/wiki/graph` must exist
- local `wiki.ask` entitlement must be valid
- local premium/runtime Ask pack must be available

When `--source` is given, Ask grounds on the chosen doc **plus its directly-related
siblings** — other docs that share the same BK issue, knowledge id, skill, or family.
The related docs are bounded (capped) and labelled as related, so a question about
one spec also sees its plan, test cases, and knowledge objects. No-filter (all docs)
grounding is unchanged.

The viewer's **Ask** panel has a scope picker ("Ask within"): All Docs (default), By folder (path-prefix filter with live count list), This doc + related (mapped to `--source` / `current-focus` with hyperedge expansion), and Selected docs (explicit attachment). Each answer shows a collapsible **Sources used (N)** panel with `primary` / `related` labels.

Query history is off by default. `--save-query` writes one redacted JSON record
under `.sdtk/wiki/queries` only after a successful answer.

Saved query records store `question_redacted`, `answer_summary`, source refs,
runtime metadata, and retention policy. They do not store full question or full
answer by default.

## Practical Flows

Build and view a project knowledge graph:

```powershell
sdtk-wiki init --project-path . --no-open
sdtk-wiki atlas build --project-path .
sdtk-wiki atlas open --project-path .
```

Add local source metadata and refresh graph outputs:

```powershell
sdtk-wiki wiki ingest --project-path . --source docs/product/PRD_ORDER_MGMT.md
sdtk-wiki atlas build --project-path .
sdtk-wiki lint --project-path .
```

Run report-first maintenance checks:

```powershell
sdtk-wiki lint --project-path .
sdtk-wiki discover --plan --project-path .
sdtk-wiki maintain --mode safe --project-path .
```

Preview a compile plan without applying it:

```powershell
sdtk-wiki wiki compile --plan <local-plan.md-or-json> --project-path . --dry-run
```

Build a local wiki from local Markdown sources and search it:

```powershell
sdtk-wiki ingest docs
sdtk-wiki compile --mode safe --apply
sdtk-wiki query "multi-agent"
```

Advanced/audit workflow with explicit report files:

```powershell
sdtk-wiki wiki extract --project-path . --source-root docs --dry-run
sdtk-wiki wiki compile --project-path . --plan .sdtk/wiki/reports/semantic-extraction-dry-run-<stamp>.json --dry-run
sdtk-wiki wiki compile --project-path . --plan .sdtk/wiki/reports/compile-apply-plan-<date>.json --apply --yes
sdtk-wiki search --project-path . "multi-agent"
```

Ask and save an opt-in redacted query record:

```powershell
sdtk-wiki atlas build --project-path .
sdtk-wiki ask --project-path . --question "Which docs describe the deployment path?" --save-query
```

This flow requires valid `wiki.ask` entitlement/runtime preconditions. Use
`sdtk-wiki search` for non-premium local validation of generated local wiki
pages.

## Foundation/Beta Boundaries

This release is local-first and report-first. It is a foundation for a
local wiki workflow, not a fully autonomous second brain.

Do not claim the Foundation/Beta runtime includes:

- web fetch/discover
- destructive prune/delete/archive
- query list/show/delete
- default full prompt/full answer query persistence
- premium Ask without valid `wiki.ask` entitlement/runtime preconditions
- `.sdtk/atlas` as canonical storage

See `products/sdtk-wiki/governance/SDTK_WIKI_USAGE_GUIDE.md` for the fuller
current usage guide.
