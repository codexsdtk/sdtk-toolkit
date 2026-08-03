# SDTK Toolkit

<p align="center">
  <a href="https://www.npmjs.com/package/sdtk-kit"><img src="https://img.shields.io/npm/v/sdtk-kit?style=for-the-badge&logo=npm&label=sdtk-kit" alt="npm version"></a>
  <a href="https://github.com/codexsdtk/sdtk-toolkit/releases"><img src="https://img.shields.io/github/v/release/codexsdtk/sdtk-toolkit?style=for-the-badge" alt="GitHub release"></a>
  <a href="https://github.com/codexsdtk/sdtk-toolkit/blob/main/LICENSE"><img src="https://img.shields.io/github/license/codexsdtk/sdtk-toolkit?style=for-the-badge" alt="license"></a>
</p>

**SDTK** is a local-first, documentation-first software-delivery toolkit for teams building with AI. It gives you a governed **SPEC → CODE → OPS** workflow, a local knowledge graph and second brain, and a trust layer that scores how ship-ready your work is — all from the command line, all on your own machine.

This repository is the **open-source (MIT) free edition** of the toolkit. It contains the free suite in full; the paid SDTK Pro capabilities are not bundled here. See [sdtk.dev](https://sdtk.dev) for the full product.

## Install

One command installs the whole free suite:

```bash
npm install -g sdtk-kit
```

That gives you the unified `sdtk` entry point plus each toolkit CLI:

```bash
sdtk --version          # unified installer + resolved per-kit versions
sdtk init --runtime claude   # one-command setup for a project
```

Prefer a single toolkit? Each ships as its own package too:

```bash
npm install -g sdtk-spec-kit   # or sdtk-code-kit, sdtk-ops-kit, sdtk-wiki-kit
```

## The free suite

| Toolkit | CLI | What it does |
|---|---|---|
| **SDTK-SPEC** | `sdtk-spec` | Docs-first specification, planning, and handoff — generates a standard artifact set per feature. |
| **SDTK-CODE** | `sdtk-code` | Downstream coding workflow after handoff, plus the trust layer (guardrails, ship-readiness score, trust trace) and Sleep Readiness Preview. |
| **SDTK-OPS** | `sdtk-ops` | Operations / go-live discipline with a truthful CLI baseline and runtime install. |
| **SDTK-WIKI** | `sdtk-wiki` | Local Atlas graph viewer + second brain: build a browsable knowledge graph and docs view over your project, with a context pack for AI sessions. |

## What you get on the free tier

- Public CLI toolkit baseline across SPEC / CODE / OPS / WIKI
- Standard generated artifact set per feature (17 artifacts)
- Free **local Atlas graph viewer** and **SDTK-WIKI second brain**
- **Trust layer**: guardrails check + ship-readiness score + trust trace
- **Sleep Readiness Preview**: sleep plan + sleep report (dry run)
- **SDTK-WIKI context pack** for grounding AI sessions
- Documentation-first onboarding

## Quickstart

```bash
# 1. Install
npm install -g sdtk-kit

# 2. Initialise a project (installs runtime skills for Claude or Codex)
cd my-project
sdtk init --runtime claude

# 3. Build a local knowledge graph and open the viewer
sdtk-wiki atlas build
sdtk-wiki atlas open

# 4. Search your local wiki (deterministic, offline)
sdtk-wiki search "how does billing work"
```

## SDTK-WIKI: local Atlas graph + second brain

`sdtk-wiki` builds a local graph and browsable wiki over your project's markdown and generated docs — no server, no account, no data leaving your machine. `atlas open` serves an interactive graph + docs viewer in your browser. Grounded question answering over the graph is an SDTK Pro capability; the local graph, docs view, and deterministic search are free.

## Docs & links

- Documentation: [docs.sdtk.dev](https://docs.sdtk.dev)
- Product & pricing: [sdtk.dev](https://sdtk.dev)
- Issues: [github.com/codexsdtk/sdtk-toolkit/issues](https://github.com/codexsdtk/sdtk-toolkit/issues)

## SDTK Pro

Some advanced capabilities — grounded Ask over your knowledge graph, and automated documentation generation for existing projects — are part of **SDTK Pro** and are not included in this open-source edition. Learn more at [sdtk.dev](https://sdtk.dev).

## License

[MIT](LICENSE) © SDTK
