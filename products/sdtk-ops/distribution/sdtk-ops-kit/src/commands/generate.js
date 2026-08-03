"use strict";

const { ValidationError } = require("../lib/errors");

async function cmdGenerate(args) {
  void args;
  throw new ValidationError(
    'The "generate" command is not part of the supported SDTK-OPS workflow-entry surface. Use "sdtk-ops help" for supported commands and start with the "ops-discover" skill if the correct journey is unclear.'
  );
}

module.exports = { cmdGenerate };
