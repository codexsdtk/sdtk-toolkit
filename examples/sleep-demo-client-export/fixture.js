#!/usr/bin/env node
"use strict";

/**
 * BK-259 Sleep Preview recording fixture driver.
 *
 * Pure file manipulation — it never runs sdtk-code. It stages the CLIENT_EXPORT
 * handoff artifacts so the shipped `sdtk-code sleep plan|report` (0.2.1+) produces:
 *   state-a -> NOT_READY 30/85 FAIL
 *   state-b -> READY_TO_SLEEP 75/85 PASS
 *
 * Usage:
 *   node fixture.js state-a   # stage State A inputs (incomplete handoff)
 *   node fixture.js state-b   # stage State B inputs (scope + tests + ops + verify)
 *   node fixture.js reset     # remove all staged inputs + generated runtime outputs
 *   node fixture.js status    # show which input files are currently staged
 *
 * Canonical inputs live in states/<state>/. Generated runtime outputs
 * (docs/dev copies, docs/trust reports, .sdtk) are gitignored and removed by reset.
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const RUNTIME_DIRS = [path.join(ROOT, "docs"), path.join(ROOT, ".sdtk")];

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyTree(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTree(src, dest);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

function reset() {
  for (const dir of RUNTIME_DIRS) {
    rmrf(dir);
  }
  console.log("reset: removed staged inputs + generated runtime outputs (docs/, .sdtk/).");
}

function applyState(state) {
  const stateDir = path.join(ROOT, "states", state);
  if (!fs.existsSync(stateDir)) {
    console.error(`unknown state "${state}". Expected states/state-a or states/state-b.`);
    process.exit(1);
  }
  // Always start from a clean slate so states are idempotent and deterministic.
  reset();
  copyTree(stateDir, ROOT);
  console.log(`${state}: staged inputs from states/${state}/ into the fixture root.`);
  console.log("Now run:");
  console.log("  sdtk-code sleep plan   --feature-key CLIENT_EXPORT");
  console.log("  sdtk-code sleep report --feature-key CLIENT_EXPORT");
}

function status() {
  const devDir = path.join(ROOT, "docs", "dev");
  console.log("Staged inputs under docs/dev/:");
  if (!fs.existsSync(devDir)) {
    console.log("  (none — run `node fixture.js state-a` or `state-b`)");
    return;
  }
  for (const f of fs.readdirSync(devDir).sort()) {
    console.log(`  ${f}`);
  }
  const reportDir = path.join(ROOT, "docs", "trust");
  if (fs.existsSync(reportDir)) {
    console.log("Generated reports under docs/trust/:");
    for (const f of fs.readdirSync(reportDir).sort()) {
      console.log(`  ${f}`);
    }
  }
}

const cmd = process.argv[2];
switch (cmd) {
  case "state-a":
    applyState("state-a");
    break;
  case "state-b":
    applyState("state-b");
    break;
  case "reset":
    reset();
    break;
  case "status":
    status();
    break;
  default:
    console.error("Usage: node fixture.js <state-a|state-b|reset|status>");
    process.exit(1);
}
