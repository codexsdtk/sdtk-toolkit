"use strict";

const { ValidationError } = require("./errors");

function parseFlags(argv, defs) {
  const flags = {};
  const positional = [];
  const aliasMap = {};

  for (const [name, def] of Object.entries(defs)) {
    if (def.alias) aliasMap[def.alias] = name;
    if (def.type === "boolean") flags[name] = false;
    else flags[name] = undefined;
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (!arg.startsWith("-")) {
      positional.push(arg);
      i++;
      continue;
    }

    let key;
    let inlineValue;

    if (arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      key = arg.slice(0, eqIdx);
      inlineValue = arg.slice(eqIdx + 1);
    } else {
      key = arg;
    }

    const stripped = key.replace(/^-{1,2}/, "");
    const resolved = aliasMap[stripped] || stripped;

    if (!(resolved in defs)) {
      throw new ValidationError(`Unknown flag: ${key}`);
    }

    const def = defs[resolved];
    if (def.type === "boolean") {
      flags[resolved] = true;
      i++;
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      i++;
      if (i >= argv.length) {
        throw new ValidationError(`Flag ${key} requires a value.`);
      }
      value = argv[i];
    }
    flags[resolved] = value;
    i++;
  }

  return { flags, positional };
}

module.exports = {
  parseFlags,
};
