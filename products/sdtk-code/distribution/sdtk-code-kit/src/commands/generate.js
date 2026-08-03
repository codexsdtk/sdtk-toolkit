"use strict";

const { ValidationError } = require("../lib/errors");

function cmdGenerate() {
  throw new ValidationError("generate command is not available in SDTK-CODE.");
}

module.exports = {
  cmdGenerate,
};
