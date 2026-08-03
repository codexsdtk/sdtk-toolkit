"use strict";

const { runRequirementAnalyze } = require("../lib/requirement-analysis");

async function cmdAnalyze(args) {
  return runRequirementAnalyze(args);
}

module.exports = {
  cmdAnalyze,
};
