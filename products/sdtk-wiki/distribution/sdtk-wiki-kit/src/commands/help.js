"use strict";

function cmdHelp() {
  console.log(`SDTK-WIKI

Usage:
  sdtk-wiki --help
  sdtk-wiki --version
  sdtk-wiki init --help
  sdtk-wiki query --help
  sdtk-wiki maintain --help
  sdtk-wiki atlas build --help
  sdtk-wiki atlas open --help
  sdtk-wiki atlas watch --help
  sdtk-wiki atlas status --help
  sdtk-wiki search --help
  sdtk-wiki lint --help
  sdtk-wiki update --check-only
  sdtk-wiki memory --help

Simple local wiki workflow:
  sdtk-wiki init --no-open
  sdtk-wiki search "<query>"
  sdtk-wiki query "<query>"
  sdtk-wiki lint
  sdtk-wiki maintain --mode safe
  sdtk-wiki update --check-only

Command model:
  init                 Initialize the SDTK-WIKI workspace.
  query                Search generated local wiki pages without premium Ask.
  maintain             Run the safe lint-only wiki health pass.
  atlas build          Build graph/viewer plus local wiki pages/provenance (native Node — no Python required).
  atlas open           Open or serve the local graph viewer.
  atlas watch          Watch markdown sources and rebuild the graph.
  atlas status         Report graph workspace status.
  kanban                Open the Agent Kanban board (Dashboard panel) for the current project.
  search               Search generated local wiki pages without premium Ask.
  lint                 Write a report-first, non-destructive wiki lint report.
  update               Package-only updater; no wiki/.sdtk/wiki/.sdtk/atlas files are mutated in R1.
  memory               Wiki-memory onboarding surface: install a PreCompact capture hook, then a new session reads one file / runs "memory brief" to get up to speed.

Update workflow:
  sdtk-wiki update --check-only
  npm install -g sdtk-wiki-kit@<version>

Moved to the standalone sdtk-brain kit (npm i -g sdtk-brain-kit):
  ingest / compile / discover / enrich and the wiki-namespace pipeline —
  removed in 0.10.0 after one deprecated minor; these names now print a
  pointer and exit 2.

Workspace paths:
  wiki/                Canonical human-facing local wiki output target.
  .sdtk/wiki           Internal SDTK-WIKI state target.
  .sdtk/wiki/graph     New SDTK-WIKI graph output target.
  .sdtk/wiki/pages     Internal graph/wiki compatibility page target.
  .sdtk/wiki/raw       Metadata-only local source registry target.
  .sdtk/wiki/provenance Generated source provenance target.
  .sdtk/atlas          Legacy Atlas workspace, readable for compatibility.
  Human-facing generated wiki paths must stay under project-local wiki/.

Compatibility:
  Existing sdtk-spec atlas commands remain the R1 compatibility path.
  sdtk-spec atlas keeps compatibility output under .sdtk/atlas.
  SDTK-WIKI reads legacy .sdtk/atlas output for compatibility and never auto-deletes it.

Local Search:
  sdtk-wiki query      Beginner-friendly local deterministic search over wiki/, with legacy .sdtk/wiki/personal-brain fallback.
  sdtk-wiki search     Deterministic, read-only local search over wiki/, with legacy .sdtk/wiki/personal-brain fallback.

Maintenance:
  sdtk-wiki discover --plan is a top-level alias for local-only discovery planning.
  sdtk-wiki maintain --mode safe runs report-first lint/discover/compile-preview checks without apply.
  sdtk-wiki enrich --source github --mode review writes a local-only enrichment review report.
  sdtk-wiki wiki prune --dry-run is report-only and writes under .sdtk/wiki/reports.
  It never deletes, archives, applies, or mutates .sdtk/atlas.`);
  console.log(`
  sdtk-wiki wiki discover --plan is plan-only and writes under .sdtk/wiki/reports.
  It never fetches web sources, ingests sources, compiles pages, applies edits, prunes, or mutates .sdtk/atlas.`);
  console.log(`
  sdtk-wiki wiki compile --dry-run writes a markdown preview plus JSON sidecar under .sdtk/wiki/reports.
  sdtk-wiki wiki compile --apply --yes consumes only the JSON sidecar and writes create-only local wiki pages under wiki/.
  It never rewrites pages, mutates raw/provenance files, or mutates .sdtk/atlas.`);
  return 0;
}

module.exports = {
  cmdHelp,
};
