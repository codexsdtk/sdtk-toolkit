"use strict";

const path = require("path");
const { parseFlags } = require("./args");
const { resolveAtlasConfig, isAtlasBuilt } = require("./atlas-config");
const { loadPremiumHandler } = require("./premium-loader");

const CAPABILITY = "spec.atlas.ask";

const ASK_FLAG_DEFS = {
  "project-path": { type: "string" },
  "output-dir": { type: "string" },
  "scan-root": { type: "string" },
  question: { type: "string" },
  "max-docs": { type: "string" },
  json: { type: "boolean" },
  verbose: { type: "boolean" },
};

/**
 * Pre-filter repeated --source flags before delegating to parseFlags.
 * parseFlags only captures the last occurrence for string flags.
 *
 * @param {string[]} args
 * @returns {{ sources: string[], filteredArgs: string[] }}
 */
function extractSources(args) {
  const sources = [];
  const filteredArgs = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--source") {
      i++;
      if (i < args.length) {
        sources.push(args[i]);
        i++;
      }
    } else if (arg.startsWith("--source=")) {
      sources.push(arg.slice("--source=".length));
      i++;
    } else {
      filteredArgs.push(arg);
      i++;
    }
  }
  return { sources, filteredArgs };
}

/**
 * Execute the sdtk-spec atlas ask premium command.
 *
 * Flow:
 *   1. Parse and validate --question or positional question.
 *   2. Resolve Atlas config via resolveAtlasConfig.
 *   3. Require built Atlas artifacts via isAtlasBuilt.
 *   4. Load and verify the premium handler via loadPremiumHandler.
 *   5. Build the bounded context object.
 *   6. Execute the premium handler.
 *   7. Format and print the result.
 *
 * @param {string[]} args - Remaining argv after "atlas ask"
 * @returns {Promise<number>} CLI exit code
 */
async function runAtlasAsk(args) {
  const { sources, filteredArgs } = extractSources(args);
  const { flags, positional } = parseFlags(filteredArgs, ASK_FLAG_DEFS);

  // 1. Resolve question from --question flag or positional args
  const questionRaw =
    (flags.question && flags.question.trim()) ||
    (positional.length > 0 ? positional.join(" ").trim() : "");

  if (!questionRaw) {
    console.error("[atlas ask] Error: question is required.");
    console.error(
      "  Use --question <text> or provide the question as positional arguments."
    );
    console.error(
      "  Example: sdtk-spec atlas ask --question \"How do I install this toolkit?\""
    );
    return 1;
  }

  // 2. Resolve Atlas config
  let config;
  try {
    config = resolveAtlasConfig(flags);
  } catch (err) {
    console.error(`[atlas ask] Config error: ${err.message}`);
    return 1;
  }

  // 3. Require built Atlas artifacts (SDTK_DOC_INDEX.json + viewer.html)
  if (!isAtlasBuilt(config.outputDir)) {
    console.error("[atlas ask] Atlas has not been built for this project.");
    console.error(`  Expected artifacts at: ${config.outputDir}`);
    console.error("  Run: sdtk-spec atlas init");
    console.error("  Or:  sdtk-spec atlas build");
    return 1;
  }

  // 4. Load and verify premium handler (entitlement + pack verification)
  const loaderResult = await loadPremiumHandler(CAPABILITY, "atlasAsk");
  if (!loaderResult.ok) {
    console.error(`[atlas ask] ${loaderResult.message}`);
    return loaderResult.exitCode;
  }

  // 5. Build bounded context object
  const maxDocsRaw = flags["max-docs"] ? parseInt(flags["max-docs"], 10) : NaN;
  const maxDocs = !isNaN(maxDocsRaw) ? maxDocsRaw : 12;

  const context = {
    capability: CAPABILITY,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    configPath: config.configPath,
    indexPath: path.join(config.outputDir, "SDTK_DOC_INDEX.json"),
    graphPath: path.join(config.outputDir, "SDTK_DOC_GRAPH.json"),
    question: questionRaw,
    sources,
    maxDocs,
    json: !!flags.json,
    argv: args,
  };

  // 6. Execute premium handler
  let result;
  try {
    result = await loaderResult.handler(context);
  } catch (err) {
    console.error(`[atlas ask] Premium pack handler error: ${err.message}`);
    return 4;
  }

  // 7. Format and print result
  if (typeof result === "string") {
    if (flags.json) {
      console.log(JSON.stringify({ answer: result }));
    } else {
      console.log(result);
    }
    return 0;
  }

  if (result !== null && typeof result === "object") {
    const exitCode = typeof result.exitCode === "number" ? result.exitCode : 0;
    if (flags.json) {
      const output = Object.assign({}, result);
      delete output.exitCode;
      console.log(JSON.stringify(output));
    } else {
      if (typeof result.answer === "string") {
        console.log(result.answer);
      }
      if (Array.isArray(result.citations) && result.citations.length > 0) {
        console.log("\nSources:");
        for (const c of result.citations) {
          console.log(`  - ${c}`);
        }
      }
    }
    return exitCode;
  }

  return 0;
}

module.exports = { runAtlasAsk };
