#!/usr/bin/env node
"use strict";

// Skip banner in CI environments and headless installs.
// This avoids noisy output in automated pipelines that install sdtk-kit
// as a transitive dependency.
const isCI =
  process.env.CI === "true" ||
  process.env.NODE_ENV === "test" ||
  process.env.npm_config_loglevel === "silent" ||
  process.env.npm_config_loglevel === "error";

if (isCI) {
  process.exit(0);
}

const lines = [
  "",
  "  ╔══════════════════════════════════════════════════════╗",
  "  ║            SDTK — All Six Toolkits Installed         ║",
  "  ╚══════════════════════════════════════════════════════╝",
  "",
  "  You now have all six SDTK CLI tools available:",
  "",
  "    sdtk-spec    — Spec-first SDLC: PM → BA → ARCH → DEV → QA",
  "    sdtk-design  — MVP design: idea → prototype → handoff",
  "    sdtk-code    — Governed coding: handoff → PR with review gates",
  "    sdtk-ops     — Operations: deploy → smoke → sign-off",
  "    sdtk-wiki    — Local second brain: your project memory",
  "    sdtk-agent   — Orchestration: durable multi-step agent workflows",
  "",
  "  Set up the whole suite in one command:",
  "",
  "    sdtk init --runtime claude   (or --runtime codex)",
  "",
  "  Then generate your first feature spec:",
  "",
  "    sdtk-spec generate --feature-key <YOUR_FEATURE>",
  "",
  "  Docs: https://sdtk.dev",
  "",
];

process.stdout.write(lines.join("\n") + "\n");
