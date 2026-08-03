"use strict";

const { CliError } = require("../lib/errors");

function cmdDeferredAsk() {
  throw new CliError(
    "This deferred Ask helper is not part of the active sdtk-wiki command path.",
    1
  );
}

module.exports = {
  cmdDeferredAsk,
};
