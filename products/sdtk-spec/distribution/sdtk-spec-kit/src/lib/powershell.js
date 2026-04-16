"use strict";

const { execFile } = require("child_process");
const { DependencyError } = require("./errors");

/**
 * Find available PowerShell executable.
 * Prefers pwsh (PowerShell Core) over powershell.exe (Windows PowerShell).
 * @returns {string} PowerShell executable name.
 */
function findPowerShell() {
  // On Windows, powershell.exe is always available
  // pwsh (PowerShell Core) is preferred if available
  if (process.platform === "win32") {
    return "powershell.exe";
  }
  // On non-Windows, pwsh must be installed
  return "pwsh";
}

/**
 * Execute a PowerShell script file with arguments.
 *
 * @param {string} scriptPath - Absolute path to the .ps1 file.
 * @param {Object<string, string|boolean>} params - Parameters to pass.
 *   String values become `-ParamName "value"`, boolean true becomes `-ParamName`.
 * @param {Object} [options] - Optional settings.
 * @param {boolean} [options.silent] - If true, suppress stdout output.
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
function runScript(scriptPath, params = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const psExe = findPowerShell();
    const args = [
      "-ExecutionPolicy",
      "Bypass",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      scriptPath,
    ];

    // Build parameters safely using execFile array args
    for (const [key, value] of Object.entries(params)) {
      if (value === true) {
        args.push(`-${key}`);
      } else if (value === false || value === undefined || value === null) {
        // Skip false/undefined/null switches
      } else {
        args.push(`-${key}`);
        args.push(String(value));
      }
    }

    execFile(psExe, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && error.code === "ENOENT") {
        reject(
          new DependencyError(
            `PowerShell not found. Ensure PowerShell is installed and available in PATH.\n` +
              `Tried: ${psExe}`
          )
        );
        return;
      }

      const exitCode = error ? error.code || 1 : 0;
      const result = {
        exitCode: typeof exitCode === "number" ? exitCode : 1,
        stdout: stdout || "",
        stderr: stderr || "",
      };

      if (!options.silent && result.stdout) {
        process.stdout.write(result.stdout);
      }

      resolve(result);
    });
  });
}

module.exports = {
  runScript,
  findPowerShell,
};
