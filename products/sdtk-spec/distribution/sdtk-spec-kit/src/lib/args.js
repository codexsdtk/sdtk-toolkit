"use strict";

const { ValidationError } = require("./errors");

/**
 * Parse argv into a structured flags object.
 * Supports: --flag value, --flag=value, --bool-flag (no value).
 *
 * @param {string[]} argv - Raw arguments (after command is stripped).
 * @param {Object<string, {type: 'string'|'boolean', required?: boolean, alias?: string}>} defs - Flag definitions.
 * @returns {{ flags: Object, positional: string[] }}
 */
function parseFlags(argv, defs) {
  const flags = {};
  const positional = [];
  const aliasMap = {};

  for (const [name, def] of Object.entries(defs)) {
    if (def.alias) aliasMap[def.alias] = name;
    if (def.type === "boolean") flags[name] = false;
    else flags[name] = undefined;
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (!arg.startsWith("-")) {
      positional.push(arg);
      i++;
      continue;
    }

    let key;
    let inlineValue;

    if (arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      key = arg.slice(0, eqIdx);
      inlineValue = arg.slice(eqIdx + 1);
    } else {
      key = arg;
    }

    // Normalize: strip leading dashes, resolve alias
    const stripped = key.replace(/^-{1,2}/, "");
    const resolved = aliasMap[stripped] || stripped;

    if (!(resolved in defs)) {
      throw new ValidationError(`Unknown flag: ${key}`);
    }

    const def = defs[resolved];

    if (def.type === "boolean") {
      flags[resolved] = true;
      i++;
    } else {
      // string type
      let value = inlineValue;
      if (value === undefined) {
        i++;
        if (i >= argv.length) {
          throw new ValidationError(`Flag ${key} requires a value.`);
        }
        value = argv[i];
      }
      flags[resolved] = value;
      i++;
    }
  }

  return { flags, positional };
}

/**
 * Require a flag to be present (non-undefined, non-empty for strings).
 */
function requireFlag(flags, name, label) {
  const val = flags[name];
  if (val === undefined || val === null || val === "") {
    throw new ValidationError(`Missing required flag: --${label || name}`);
  }
  return val;
}

/**
 * Validate a value is one of the allowed choices.
 */
function validateChoice(value, choices, label) {
  if (!choices.includes(value)) {
    throw new ValidationError(
      `Invalid value for --${label}: "${value}". Must be one of: ${choices.join(", ")}`
    );
  }
  return value;
}

/**
 * Validate a value matches a regex pattern.
 */
function validatePattern(value, regex, label, hint) {
  if (!regex.test(value)) {
    throw new ValidationError(
      `Invalid value for --${label}: "${value}". ${hint || `Must match ${regex}`}`
    );
  }
  return value;
}

module.exports = {
  parseFlags,
  requireFlag,
  validateChoice,
  validatePattern,
};
