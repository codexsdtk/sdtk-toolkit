"use strict";

const { execSync } = require("child_process");

const UPDATE_CMD = "npm install -g sdtk-kit@latest";

function cmdUpdate(argv) {
  const checkOnly = argv.includes("--check-only");

  if (checkOnly) {
    console.log("Planned update command:");
    console.log(`  ${UPDATE_CMD}`);
    console.log("\nThis will update all five SDTK toolkit CLIs to the latest published versions.");
    console.log("After updating, run `sdtk init --runtime <runtime> --force` in each project");
    console.log("to refresh managed skills and project files to the new version.");
    return 0;
  }

  console.log(`Running: ${UPDATE_CMD}\n`);
  try {
    execSync(UPDATE_CMD, { stdio: "inherit" });
    console.log("\nUpdate complete.");
    console.log("Run `sdtk --version` to confirm new versions.");
    console.log("Run `sdtk init --runtime <runtime> --force` in each project to refresh managed files.");
    return 0;
  } catch (err) {
    process.stderr.write(`sdtk update failed: ${err.message}\n`);
    return 1;
  }
}

module.exports = { cmdUpdate };
