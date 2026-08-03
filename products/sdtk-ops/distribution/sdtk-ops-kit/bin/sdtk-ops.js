#!/usr/bin/env node

"use strict";

const { run } = require("../src/index");

run(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
  })
  .catch((error) => {
    console.error(`sdtk-ops: ${error.message}`);
    process.exitCode = typeof error.exitCode === "number" ? error.exitCode : 4;
  });
