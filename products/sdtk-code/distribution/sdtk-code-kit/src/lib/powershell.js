"use strict";

const { execFile } = require("child_process");
const { DependencyError } = require("./errors");

function findPowerShell() {
  if (process.platform === "win32") {
    return "powershell.exe";
  }
  return "pwsh";
}

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

    for (const [key, value] of Object.entries(params)) {
      if (value === true) {
        args.push(`-${key}`);
      } else if (value === false || value === undefined || value === null) {
        continue;
      } else {
        args.push(`-${key}`);
        args.push(String(value));
      }
    }

    execFile(psExe, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && error.code === "ENOENT") {
        reject(
          new DependencyError(
            `PowerShell not found. Ensure PowerShell is installed and available in PATH.\nTried: ${psExe}`
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
  findPowerShell,
  runScript,
};
