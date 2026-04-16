"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { parseFlags, validateChoice } = require("./args");
const { CliError, DependencyError, ValidationError } = require("./errors");
const { VALID_SCOPES, defaultScope, isProjectScopeSupported } = require("./scope");
const { assertProjectRefreshTargetAllowed } = require("./project-target-guard");

const PACKAGE_NAME = "sdtk-code-kit";
const CLI_NAME = "sdtk-code";
const CLI_BIN = path.resolve(__dirname, "..", "..", "bin", "sdtk-code.js");
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";
const NPM_DISPLAY = "npm";
const NPM_VIEW_ARGS = ["view", PACKAGE_NAME, "version"];
const VALID_RUNTIMES = ["codex", "claude"];
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const FLAG_DEFS = {
  version: { type: "string" },
  runtime: { type: "string" },
  scope: { type: "string" },
  "project-path": { type: "string" },
  "check-only": { type: "boolean" },
  "skip-project-files": { type: "boolean" },
  "skip-runtime-assets": { type: "boolean" },
  verbose: { type: "boolean" },
};
const pkg = require("../../package.json");

let commandExecutor = defaultCommandExecutor;

function defaultCommandExecutor(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      shell: options.shell || false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.verbose) {
        process.stdout.write(text);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.verbose) {
        process.stderr.write(text);
      }
    });
    child.on("error", (error) => {
      if (error && error.code === "ENOENT") {
        reject(new DependencyError(`Required command not found in PATH: ${command}`));
        return;
      }
      reject(error);
    });
    child.on("close", (exitCode) => {
      resolve({
        exitCode: typeof exitCode === "number" ? exitCode : 1,
        stdout,
        stderr,
      });
    });
  });
}

function setCommandExecutorForTests(executor) {
  commandExecutor = executor || defaultCommandExecutor;
}

function resetCommandExecutorForTests() {
  commandExecutor = defaultCommandExecutor;
}

function quote(value) {
  const text = String(value);
  return /[\s"]/u.test(text) ? JSON.stringify(text) : text;
}

function formatCommand(command, args) {
  return [command, ...args].map((value) => quote(value)).join(" ");
}

function validateVersion(targetVersion) {
  if (targetVersion !== "latest" && !VERSION_PATTERN.test(targetVersion)) {
    throw new ValidationError(
      `Invalid value for --version: "${targetVersion}". Must be "latest" or x.y.z.`
    );
  }
}

function extractResolvedVersion(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidate = (lines[lines.length - 1] || "").replace(/^['"]|['"]$/gu, "");
  if (!VERSION_PATTERN.test(candidate)) {
    throw new CliError(
      `npm registry lookup returned an invalid version for ${PACKAGE_NAME}: "${candidate || "<empty>"}"`
    );
  }
  return candidate;
}

async function resolveTargetVersion(options) {
  if (options.requestedVersion !== "latest") {
    return options.requestedVersion;
  }

  let result;
  try {
    result = await commandExecutor(NPM_BIN, NPM_VIEW_ARGS, {
      verbose: options.verbose,
      shell: process.platform === "win32",
    });
  } catch (error) {
    throw new CliError(
      `npm registry lookup failed for ${PACKAGE_NAME} while resolving --version latest.\n${error.message}`,
      error.exitCode || 4
    );
  }

  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new CliError(
      `npm registry lookup failed for ${PACKAGE_NAME} while resolving --version latest (exit code ${result.exitCode}).${detail ? `\n${detail}` : ""}`
    );
  }

  try {
    return extractResolvedVersion(result.stdout);
  } catch (error) {
    throw new CliError(
      `npm registry lookup failed for ${PACKAGE_NAME} while resolving --version latest.\n${error.message}`,
      error.exitCode || 4
    );
  }
}

function buildPlan(options) {
  const npmArgs = ["install", "-g", `${PACKAGE_NAME}@${options.targetVersion}`];
  const plan = {
    installedVersion: pkg.version,
    requestedVersion: options.requestedVersion,
    targetVersion: options.targetVersion,
    updateNeeded: pkg.version !== options.targetVersion,
    npmArgs,
    npmCommand: formatCommand(NPM_DISPLAY, npmArgs),
    runtime: options.runtime,
    scope: options.scope,
    projectPath: options.projectPath,
    checkOnly: options.checkOnly,
    projectRefreshArgs: null,
    runtimeRefreshArgs: null,
    projectRefreshCommand: "skipped (no --runtime provided)",
    runtimeRefreshCommand: "skipped (no --runtime provided)",
  };

  if (!options.runtime) {
    return plan;
  }

  if (options.skipProjectFiles) {
    plan.projectRefreshCommand = "skipped (--skip-project-files)";
  } else {
    const initArgs = [
      "init",
      "--runtime",
      options.runtime,
      "--runtime-scope",
      options.scope,
      "--project-path",
      options.projectPath,
      "--force",
      "--skip-runtime-assets",
    ];
    if (options.verbose) {
      initArgs.push("--verbose");
    }
    plan.projectRefreshArgs = initArgs;
    plan.projectRefreshCommand = formatCommand(CLI_NAME, initArgs);
  }

  if (options.skipRuntimeAssets) {
    plan.runtimeRefreshCommand = "skipped (--skip-runtime-assets)";
  } else {
    const runtimeArgs = ["runtime", "install", "--runtime", options.runtime, "--scope", options.scope, "--force"];
    if (options.scope === "project") {
      runtimeArgs.push("--project-path", options.projectPath);
    }
    if (options.verbose) {
      runtimeArgs.push("--verbose");
    }
    plan.runtimeRefreshArgs = runtimeArgs;
    plan.runtimeRefreshCommand = formatCommand(CLI_NAME, runtimeArgs);
  }

  return plan;
}

function parseUpdateOptions(args) {
  const { flags, positional } = parseFlags(args, FLAG_DEFS);

  if (positional.length > 0) {
    throw new ValidationError(`Unexpected arguments: ${positional.join(" ")}`);
  }

  const requestedVersion = flags.version || "latest";
  validateVersion(requestedVersion);

  const runtime = flags.runtime;
  if (runtime) {
    validateChoice(runtime, VALID_RUNTIMES, "runtime");
  }
  if (flags.scope && !runtime) {
    throw new ValidationError("--scope requires --runtime.");
  }

  const scope = runtime ? (flags.scope || defaultScope(runtime)) : undefined;
  if (scope) {
    validateChoice(scope, VALID_SCOPES, "scope");
    if (scope === "project" && !isProjectScopeSupported(runtime)) {
      throw new ValidationError(
        `${runtime} does not support project-local runtime assets. Use --scope user instead.`
      );
    }
  }

  const projectPath = path.resolve(flags["project-path"] || process.cwd());

  if (runtime && !flags["skip-project-files"]) {
    assertProjectRefreshTargetAllowed("sdtk-code", "update", projectPath);
  }

  return {
    requestedVersion,
    runtime,
    scope,
    projectPath,
    checkOnly: flags["check-only"],
    skipProjectFiles: flags["skip-project-files"],
    skipRuntimeAssets: flags["skip-runtime-assets"],
    verbose: flags.verbose,
  };
}

function printPlan(plan) {
  console.log("SDTK-CODE update plan");
  console.log(`  Installed package version: ${plan.installedVersion}`);
  console.log(`  Requested package version: ${plan.requestedVersion}`);
  console.log(`  Target package version:    ${plan.targetVersion}`);
  console.log(
    `  Package update needed:     ${plan.updateNeeded ? "yes" : `no (already installed: ${plan.installedVersion})`}`
  );
  console.log(`  Package refresh command:   ${plan.npmCommand}`);
  if (plan.runtime) {
    console.log(`  Runtime:                   ${plan.runtime}`);
    console.log(`  Scope:                     ${plan.scope}`);
    console.log(`  Project path:              ${plan.projectPath}`);
  }
  console.log(`  Project file refresh:      ${plan.projectRefreshCommand}`);
  console.log(`  Runtime asset refresh:     ${plan.runtimeRefreshCommand}`);
  console.log(
    `  Mode:                      ${plan.checkOnly ? "check-only (no changes applied)" : "apply"}`
  );
}

async function runCommand(label, command, args, options) {
  const result = await commandExecutor(command, args, options);
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new CliError(
      `${label} failed (exit code ${result.exitCode}).${detail ? `\n${detail}` : ""}`
    );
  }
  return result;
}

async function applyPlan(plan, options) {
  console.log("");
  console.log("Applying SDTK-CODE update...");
  if (plan.updateNeeded) {
    console.log(`  npm refresh: ${plan.npmCommand}`);
    await runCommand("npm package refresh", NPM_BIN, plan.npmArgs, {
      verbose: options.verbose,
      shell: process.platform === "win32",
    });
  } else {
    console.log(`  npm refresh: skipped (installed package already matches ${plan.targetVersion})`);
  }

  if (plan.projectRefreshArgs) {
    console.log(`  project refresh: ${plan.projectRefreshCommand}`);
    await runCommand("project file refresh", process.execPath, [CLI_BIN, ...plan.projectRefreshArgs], {
      verbose: options.verbose,
    });
  } else {
    console.log(`  project refresh: ${plan.projectRefreshCommand}`);
  }

  if (plan.runtimeRefreshArgs) {
    console.log(`  runtime refresh: ${plan.runtimeRefreshCommand}`);
    await runCommand("runtime asset refresh", process.execPath, [CLI_BIN, ...plan.runtimeRefreshArgs], {
      verbose: options.verbose,
    });
  } else {
    console.log(`  runtime refresh: ${plan.runtimeRefreshCommand}`);
  }

  console.log("");
  console.log("SDTK-CODE update completed successfully.");
}

async function executeUpdate(args) {
  const options = parseUpdateOptions(args);
  const targetVersion = await resolveTargetVersion(options);
  const plan = buildPlan({ ...options, targetVersion });
  printPlan(plan);

  if (options.checkOnly) {
    return 0;
  }

  await applyPlan(plan, options);
  return 0;
}

module.exports = {
  buildPlan,
  executeUpdate,
  formatCommand,
  parseUpdateOptions,
  resetCommandExecutorForTests,
  resolveTargetVersion,
  setCommandExecutorForTests,
};
