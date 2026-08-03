"use strict";

const path = require("path");
const { parseFlags, requireFlag, validatePattern } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { computeReadiness, gatherSignals } = require("../lib/ship-readiness");
const { appendEvent } = require("../lib/trust-events");

const FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
};

const FEATURE_KEY_RE = /^[A-Z0-9_]+$/;

function verdictStatus(verdict) {
  if (verdict === "FAIL") return "blocked";
  if (verdict === "ENV_BLOCKED") return "blocked";
  return "info";
}

function cmdReadiness(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments. Use flags only for "readiness".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  validatePattern(
    featureKey,
    FEATURE_KEY_RE,
    "feature-key",
    "Must use UPPER_SNAKE_CASE, for example ORDER_MGMT."
  );

  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  const signals = gatherSignals(projectPath, featureKey);
  const result = computeReadiness(signals);

  // Record a trust event for observability (command is safe to always record).
  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "readiness_check",
    command: `sdtk-code readiness --feature-key ${featureKey}`,
    status: verdictStatus(result.verdict),
  });

  // Founder-readable one-line summary
  console.log(`Ship Readiness: ${result.score}/${result.max} — ${result.verdict}`);
  console.log("");

  // Component table
  console.log("  Components:");
  for (const comp of result.components) {
    const bar = comp.max > 0 ? `${comp.points}/${comp.max}` : "n/a";
    console.log(`    ${comp.name.padEnd(12)} ${bar.padStart(5)}  ${comp.note}`);
  }

  if (result.blockers.length > 0) {
    console.log("");
    console.log("  Blockers:");
    result.blockers.forEach((b) => console.log(`    [FAIL] ${b}`));
  }

  if (result.warnings.length > 0) {
    console.log("");
    console.log("  Warnings:");
    result.warnings.forEach((w) => console.log(`    [WARN] ${w}`));
  }

  return 0;
}

module.exports = { cmdReadiness };
