"use strict";

// `sdtk-spec config` — project configuration helpers (BK-344).
//
// C-1: the profiles example shipped with zero code consumers — users had to
// hand-copy JSON blocks. C-3: UPDATE_ME placeholders had no enforcement, so
// delivery gates could run with literal "UPDATE_ME: ..." as a test command.

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("../lib/errors");

const CONFIG_FILE = "sdtk-spec.config.json";
const PROFILES_FILE = "sdtk-spec.config.profiles.example.json";

// String values that mean "this was never filled in".
const PLACEHOLDER_PATTERNS = [/UPDATE_ME/, /^Set your /];

const HELP = `sdtk-spec config — project configuration helpers

Usage:
  sdtk-spec config apply-profile <name> [--project-path <path>] [--json]
  sdtk-spec config check [--project-path <path>] [--json]

Subcommands:
  apply-profile <name>   Merge a stack profile from ${PROFILES_FILE}
                         into ${CONFIG_FILE}. Overwrites the profile-owned
                         sections (orchestration, stack, commands) while
                         preserving docs, schemaVersion, and stack.detection.
  check                  Scan ${CONFIG_FILE} for unfilled placeholders
                         (UPDATE_ME / "Set your ..."). Exits 1 when any
                         remain — wire it into delivery gates.

Flags:
  --project-path <path>  Project root containing ${CONFIG_FILE} (default: cwd)
  --json                 Machine-readable output
`;

function parseFlags(args) {
  const flags = { projectPath: process.cwd(), json: false, help: false, positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      flags.help = true;
    } else if (a === "--project-path") {
      const value = args[++i];
      if (!value) throw new ValidationError("--project-path requires a value");
      flags.projectPath = path.resolve(value);
    } else if (a === "--json") {
      flags.json = true;
    } else if (a.startsWith("--")) {
      throw new ValidationError(`Unknown flag for "config": ${a}. Run "sdtk-spec config --help".`);
    } else {
      flags.positional.push(a);
    }
  }
  return flags;
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new ValidationError(`${label} not found: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new ValidationError(`${label} is not valid JSON: ${filePath} (${err.message})`);
  }
}

function isPlaceholder(value) {
  return typeof value === "string" && PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

function collectPlaceholders(node, trail, findings) {
  if (typeof node === "string") {
    if (isPlaceholder(node)) findings.push({ path: trail.join("."), value: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectPlaceholders(item, trail.concat(String(i)), findings));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      collectPlaceholders(value, trail.concat(key), findings);
    }
  }
}

function cmdApplyProfile(flags) {
  const name = flags.positional[0];
  if (!name) {
    throw new ValidationError('config apply-profile requires a profile name. Run "sdtk-spec config --help".');
  }
  const configPath = path.join(flags.projectPath, CONFIG_FILE);
  const profilesPath = path.join(flags.projectPath, PROFILES_FILE);
  const config = readJson(configPath, "Project config");
  const profilesDoc = readJson(profilesPath, "Config profiles file");
  const profiles = profilesDoc.profiles || {};
  const available = Object.keys(profiles);
  if (!Object.prototype.hasOwnProperty.call(profiles, name)) {
    throw new ValidationError(
      `Unknown profile "${name}". Available profiles: ${available.join(", ") || "(none)"}`
    );
  }
  const profile = profiles[name];

  // The profile owns orchestration/stack/commands; everything else in the
  // config (docs, schemaVersion, unknown future keys) is preserved.
  // stack.detection is detector-owned state and always survives.
  const detection = config.stack && config.stack.detection ? config.stack.detection : undefined;
  if (profile.orchestration) config.orchestration = { ...config.orchestration, ...profile.orchestration };
  if (profile.stack) config.stack = { ...profile.stack };
  if (detection !== undefined) {
    config.stack = config.stack || {};
    config.stack.detection = detection;
  }
  if (profile.commands) config.commands = { ...profile.commands };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  const findings = [];
  collectPlaceholders(config, [], findings);
  if (flags.json) {
    console.log(JSON.stringify({ ok: true, profile: name, remainingPlaceholders: findings.length }, null, 2));
  } else {
    console.log(`Applied profile "${name}" to ${configPath}`);
    console.log(`  stack.detection: ${detection !== undefined ? "preserved" : "not present"}`);
    console.log(`  remaining placeholders: ${findings.length}`);
    if (findings.length > 0) {
      console.log('  Run "sdtk-spec config check" to list them.');
    }
  }
  return 0;
}

function cmdCheck(flags) {
  const configPath = path.join(flags.projectPath, CONFIG_FILE);
  const config = readJson(configPath, "Project config");
  const findings = [];
  collectPlaceholders(config, [], findings);
  const ok = findings.length === 0;
  if (flags.json) {
    console.log(JSON.stringify({ ok, findings }, null, 2));
  } else if (ok) {
    console.log(`OK — ${CONFIG_FILE} has no unfilled placeholders.`);
  } else {
    console.log(`${findings.length} unfilled placeholder(s) in ${configPath}:`);
    for (const f of findings) {
      console.log(`  - ${f.path}: ${f.value}`);
    }
    console.log('Fill them (or run "sdtk-spec config apply-profile <name>") before running delivery gates.');
  }
  return ok ? 0 : 1;
}

function cmdConfig(args) {
  const flags = parseFlags(args);
  const sub = flags.positional.shift();
  if (flags.help || !sub) {
    console.log(HELP);
    return 0;
  }
  switch (sub) {
    case "apply-profile":
      return cmdApplyProfile(flags);
    case "check":
      return cmdCheck(flags);
    default:
      throw new ValidationError(`Unknown config subcommand: "${sub}". Run "sdtk-spec config --help".`);
  }
}

module.exports = { cmdConfig };
