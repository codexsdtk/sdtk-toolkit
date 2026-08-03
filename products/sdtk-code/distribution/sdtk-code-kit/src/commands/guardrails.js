"use strict";

const fs = require("fs");
const path = require("path");
const { parseFlags, requireFlag } = require("../lib/args");
const { ValidationError } = require("../lib/errors");
const { DEFAULT_POLICY, loadPolicy, classifyCommand, policyFile } = require("../lib/trust-policy");
const { appendEvent } = require("../lib/trust-events");
const { loadScopes, getChangedFiles, checkFiles } = require("../lib/trust-file-scope");
const { writeTraceReport } = require("../lib/trust-trace");

const CHECK_FLAG_DEFS = {
  command: { type: "string" },
  "project-path": { type: "string" },
  "action-count": { type: "string" },
};

const INIT_FLAG_DEFS = {
  "project-path": { type: "string" },
  force: { type: "boolean" },
};

const SCOPE_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
  base: { type: "string" },
  changed: { type: "string", multiple: true },
};

const TRACE_FLAG_DEFS = {
  "feature-key": { type: "string" },
  "project-path": { type: "string" },
};

// allow/ask are advisory observations (info); deny is recorded as blocked.
function statusForVerdict(verdict) {
  return verdict === "deny" ? "blocked" : "info";
}

function resolveProjectPath(flags) {
  return flags["project-path"] ? path.resolve(flags["project-path"]) : process.cwd();
}

function parseActionCount(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(
      `Invalid value for --action-count: "${raw}". Must be a non-negative integer.`
    );
  }
  return value;
}

function runCheck(args) {
  const { flags, positional } = parseFlags(args, CHECK_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments for "guardrails check".');
  }

  const command = requireFlag(flags, "command", "command");
  const projectPath = resolveProjectPath(flags);
  const actionCount = parseActionCount(flags["action-count"]);

  const policy = loadPolicy(projectPath);
  const result = classifyCommand(policy, command, { actionCount });

  // Record a redacted trust event (BK-239 buildEvent redacts the command).
  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "guardrail_check",
    command,
    status: statusForVerdict(result.verdict),
  });

  console.log("SDTK-CODE guardrails check");
  console.log(`  Verdict:     ${result.verdict}`);
  console.log(`  Reason:      ${result.reason}`);
  console.log(
    `  Matched:     ${result.matchedRule ? `${result.matchedRule.bucket}:${result.matchedRule.pattern}` : "none"}`
  );
  // Advisory classifier: deny is reported in stdout, not enforced via exit code.
  return 0;
}

function runInit(args) {
  const { flags, positional } = parseFlags(args, INIT_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments for "guardrails init".');
  }

  const projectPath = resolveProjectPath(flags);
  const target = policyFile(projectPath);

  if (fs.existsSync(target) && !flags.force) {
    throw new ValidationError(
      [
        `Refusing to overwrite existing trust policy: ${target}`,
        "Re-run with --force to replace it with the default policy pack.",
      ].join("\n")
    );
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(DEFAULT_POLICY, null, 2)}\n`, "utf8");

  console.log("SDTK-CODE guardrails init");
  console.log(`  Policy:      ${target}`);
  console.log(`  Rules:       deny=${DEFAULT_POLICY.deny.length}, ask=${DEFAULT_POLICY.ask.length}, allow=${DEFAULT_POLICY.allow.length}`);
  return 0;
}

// file-scope verdict -> trust event status. fail is a blocking observation.
function statusForScope(verdict) {
  return verdict === "fail" ? "blocked" : "info";
}

function runScope(args) {
  const { flags, positional } = parseFlags(args, SCOPE_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments for "guardrails scope".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);
  const scopes = loadScopes(projectPath, featureKey);

  // Explicit --changed entries take precedence; otherwise diff against base via git.
  let changed = Array.isArray(flags.changed) ? flags.changed.filter(Boolean) : [];
  if (changed.length === 0) {
    try {
      changed = getChangedFiles(projectPath, flags.base || "HEAD");
    } catch (error) {
      throw new ValidationError(
        `Could not determine changed files (git): ${error.message}. ` +
        "Run inside a git repo, or pass --changed <file> entries explicitly."
      );
    }
  }

  const result = checkFiles(scopes, changed);

  appendEvent(projectPath, {
    toolkit: "sdtk-code",
    event_type: "file_scope_check",
    phase: "verify",
    status: statusForScope(result.verdict),
    files: result.outOfScope.concat(result.blockedHits),
  });

  console.log("SDTK-CODE guardrails scope");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Scope source: ${scopes.source}${scopes.declared ? "" : " (no scope declared)"}`);
  console.log(`  Verdict:     ${result.verdict}`);
  console.log(`  In scope:    ${result.inScope.length}`);
  if (result.outOfScope.length > 0) {
    console.log(`  Out of scope: ${result.outOfScope.join(", ")}`);
  }
  if (result.blockedHits.length > 0) {
    console.log(`  Blocked:     ${result.blockedHits.join(", ")}`);
  }
  // Advisory gate: verdict is reported in stdout, not enforced via exit code.
  return 0;
}

function runTrace(args) {
  const { flags, positional } = parseFlags(args, TRACE_FLAG_DEFS);
  if (positional.length > 0) {
    throw new ValidationError('Unexpected positional arguments for "guardrails trace".');
  }

  const featureKey = requireFlag(flags, "feature-key", "feature-key");
  const projectPath = resolveProjectPath(flags);
  const result = writeTraceReport(projectPath, featureKey);
  const totals = result.trace.totals;

  console.log("SDTK-CODE guardrails trace");
  console.log(`  Feature key: ${featureKey}`);
  console.log(`  Report:      ${result.path}`);
  console.log(`  Events:      ${totals.events}`);
  console.log(`  Failures:    ${totals.failures}`);
  console.log(`  Blocked:     ${totals.blocked}`);
  console.log(`  Decision gates: ${totals.decisionGates}`);
  return 0;
}

function cmdGuardrails(args) {
  const list = Array.isArray(args) ? args : [];
  const subcommand = list[0];
  if (!subcommand || subcommand.startsWith("-")) {
    throw new ValidationError('Missing guardrails subcommand. Use one of: check, init, scope, trace.');
  }

  const rest = list.slice(1);
  switch (subcommand) {
    case "check":
      return runCheck(rest);
    case "init":
      return runInit(rest);
    case "scope":
      return runScope(rest);
    case "trace":
      return runTrace(rest);
    default:
      throw new ValidationError(
        `Unknown guardrails subcommand: "${subcommand}". Use one of: check, init, scope, trace.`
      );
  }
}

module.exports = {
  cmdGuardrails,
};
