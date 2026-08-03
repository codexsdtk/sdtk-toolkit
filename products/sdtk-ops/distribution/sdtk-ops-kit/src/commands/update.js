"use strict";

const { executeUpdate } = require("../lib/update");

async function cmdUpdate(args) {
  return executeUpdate(args);
}

module.exports = {
  cmdUpdate,
};
