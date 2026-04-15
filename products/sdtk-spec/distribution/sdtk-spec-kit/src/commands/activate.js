"use strict";

const { activateWithLicense } = require("../lib/license-activation");
const { ValidationError, CliError } = require("../lib/errors");

/**
 * Parse activate command arguments.
 *
 * @param {string[]} args - Command arguments (e.g., ["--license", "SDTK-XXXX-YYYY"])
 * @returns {{ licenseKey: string, json: boolean, activationUrl?: string }}
 */
function parseActivateArgs(args) {
  let licenseKey = null;
  let json = false;
  let activationUrl = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--license") {
      if (i + 1 >= args.length) {
        throw new ValidationError("--license requires a value");
      }
      licenseKey = args[++i];
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--activation-url") {
      if (i + 1 >= args.length) {
        throw new ValidationError("--activation-url requires a value");
      }
      activationUrl = args[++i];
    } else {
      throw new ValidationError(`Unknown option: ${arg}`);
    }
  }

  return { licenseKey, json, activationUrl };
}

/**
 * Execute the activate command.
 *
 * @param {string[]} args - Command arguments
 * @returns {Promise<number>} - Exit code
 */
async function cmdActivate(args) {
  let options;
  try {
    options = parseActivateArgs(args);
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(`Error: ${err.message}`);
      console.error("Usage: sdtk-spec activate --license <KEY> [--json]");
      return 1;
    }
    throw err;
  }

  if (!options.licenseKey) {
    console.error("Error: --license is required");
    console.error("Usage: sdtk-spec activate --license <KEY> [--json]");
    return 1;
  }

  // Execute activation
  const result = await activateWithLicense({
    licenseKey: options.licenseKey,
    activationUrl: options.activationUrl,
  });

  if (options.json) {
    console.log(JSON.stringify({
      success: result.success,
      decision: result.decision,
      message: result.message,
    }, null, 2));
  } else {
    if (result.success) {
      console.log(result.message);
    } else {
      console.error(result.message);
    }
  }

  return result.exitCode;
}

module.exports = {
  cmdActivate,
};
