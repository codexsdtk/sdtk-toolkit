"use strict";

const fs = require("fs");
const path = require("path");
const { parseFlags, validatePattern } = require("../lib/args");
const { verify, resolvePayloadFile } = require("../lib/toolkit-payload");
const { runScript } = require("../lib/powershell");
const { ValidationError } = require("../lib/errors");

/**
 * Expected 17 output files from generate.
 * Placeholders: {KEY} = UPPER_SNAKE_CASE, {PASCAL} = PascalCase, {SNAKE} = lower_snake_case
 */
const EXPECTED_OUTPUT_FILES = [
  "SHARED_PLANNING.md",
  "QUALITY_CHECKLIST.md",
  "docs/product/PROJECT_INITIATION_{KEY}.md",
  "docs/specs/BA_SPEC_{KEY}.md",
  "docs/specs/{KEY}_FLOW_ACTION_SPEC.md",
  "docs/product/PRD_{KEY}.md",
  "docs/product/BACKLOG_{KEY}.md",
  "docs/architecture/ARCH_DESIGN_{KEY}.md",
  "docs/database/DATABASE_SPEC_{KEY}.md",
  "docs/api/{PASCAL}_API.yaml",
  "docs/api/{KEY}_ENDPOINTS.md",
  "docs/api/{KEY}_API_DESIGN_DETAIL.md",
  "docs/api/{SNAKE}_api_flow_list.txt",
  "docs/design/DESIGN_LAYOUT_{KEY}.md",
  "docs/dev/FEATURE_IMPL_PLAN_{KEY}.md",
  "docs/qa/{KEY}_TEST_CASE.md",
  "docs/qa/QA_RELEASE_REPORT_{KEY}.md",
];

/**
 * Convert text to PascalCase.
 * Mirrors init-feature.ps1 ConvertTo-PascalCase: split on non-alphanumeric,
 * capitalize first letter of each part, preserve rest of casing per part.
 * e.g. "Order Management" -> "OrderManagement", "USER_PROFILE" -> "UserProfile"
 */
function toPascalCase(text) {
  const parts = text.split(/[^A-Za-z0-9]+/).filter((p) => p.length > 0);
  return parts
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/**
 * Derive PascalCase matching init-feature.ps1 logic:
 * prefer featureName, fallback to featureKey.
 */
function derivePascalCase(featureName, featureKey) {
  const fromName = toPascalCase(featureName);
  return fromName || toPascalCase(featureKey);
}

/**
 * Convert UPPER_SNAKE_CASE to lower_snake_case.
 */
function toSnakeCase(upperSnake) {
  return upperSnake.toLowerCase();
}

/**
 * Expand placeholders and return list of expected file paths relative to project root.
 */
function expandExpectedFiles(featureKey, featureName) {
  const pascal = derivePascalCase(featureName, featureKey);
  const snake = toSnakeCase(featureKey);
  return EXPECTED_OUTPUT_FILES.map((tmpl) =>
    tmpl.replace(/\{KEY\}/g, featureKey).replace(/\{PASCAL\}/g, pascal).replace(/\{SNAKE\}/g, snake)
  );
}

/**
 * Verify all 17 expected output files exist under projectPath.
 * Returns list of missing files (empty if all present).
 */
function verifyOutputContract(projectPath, featureKey, featureName) {
  const expected = expandExpectedFiles(featureKey, featureName);
  const missing = [];
  for (const rel of expected) {
    const full = path.join(projectPath, rel);
    if (!fs.existsSync(full)) {
      missing.push(rel);
    }
  }
  return missing;
}

const FLAG_DEFS = {
  // Primary, scope-neutral flags. The key/name identify the thing you are
  // scaffolding — a whole product/MVP or a single feature.
  key: { type: "string" },
  name: { type: "string" },
  // Backward-compatible aliases (the original flag names).
  "feature-key": { type: "string" },
  "feature-name": { type: "string" },
  "project-path": { type: "string" },
  force: { type: "boolean" },
  "validate-only": { type: "boolean" },
  verbose: { type: "boolean" },
};

const FEATURE_KEY_REGEX = /^[A-Z][A-Z0-9_]*$/;

/**
 * Resolve key/name from either the neutral flags (--key/--name) or the
 * backward-compatible aliases (--feature-key/--feature-name). Empty strings are
 * treated as missing so a fall-through to the alias still works.
 */
function resolveKeyName(flags) {
  const key = flags.key || flags["feature-key"];
  const name = flags.name || flags["feature-name"];
  if (!key) {
    throw new ValidationError("Missing required flag: --key (alias: --feature-key)");
  }
  if (!name) {
    throw new ValidationError("Missing required flag: --name (alias: --feature-name)");
  }
  return { key, name };
}

async function cmdGenerate(args) {
  const { flags } = parseFlags(args, FLAG_DEFS);

  // Validate required flags (accepts --key/--name or --feature-key/--feature-name)
  const { key: featureKey, name: featureName } = resolveKeyName(flags);

  // Validate key format
  validatePattern(
    featureKey,
    FEATURE_KEY_REGEX,
    "key",
    "Must be UPPER_SNAKE_CASE (e.g., SHOPEASE, ORDER_TRACKING)."
  );

  // Resolve project path
  const projectPath = flags["project-path"]
    ? path.resolve(flags["project-path"])
    : process.cwd();

  // Verify payload integrity before proceeding
  verify();

  // Resolve bundled init-feature.ps1
  const generateScript = resolvePayloadFile(
    "toolkit/scripts/init-feature.ps1"
  );

  // Build PowerShell parameters
  const params = {
    FeatureKey: featureKey,
    FeatureName: featureName,
    ProjectPath: projectPath,
  };
  if (flags.force) params.Force = true;
  if (flags["validate-only"]) params.ValidateOnly = true;

  console.log(`Generating SDLC documentation set: ${featureKey}`);
  console.log(`  Name:         ${featureName}`);
  console.log(`  Project path: ${projectPath}`);
  if (flags["validate-only"]) {
    console.log("  Mode: validate-only (no files will be written)");
  }
  console.log("");

  const result = await runScript(generateScript, params, { silent: !flags.verbose });

  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    throw new ValidationError(
      `Generation failed (exit code ${result.exitCode}).`
    );
  }

  // Enforce 17-file output contract (skip for validate-only mode)
  if (!flags["validate-only"]) {
    const missing = verifyOutputContract(projectPath, featureKey, featureName);
    if (missing.length > 0) {
      console.error("\nOutput contract violation -- missing files:");
      for (const f of missing) {
        console.error(`  - ${f}`);
      }
      throw new ValidationError(
        `Expected 17 output files but ${missing.length} missing. See list above.`
      );
    }
    console.log("\nAll 17 expected output files verified.");
  }

  return 0;
}

async function ensureGeneratedScaffold(options) {
  const {
    featureKey,
    featureName,
    projectPath,
    force = false,
    verbose = false,
    verifyPayload = true,
  } = options;

  const missingBefore = verifyOutputContract(projectPath, featureKey, featureName);
  if (missingBefore.length === 0 && !force) {
    return {
      status: "SCAFFOLD_ALREADY_PRESENT",
      expectedFiles: expandExpectedFiles(featureKey, featureName),
      missingBefore,
      missingAfter: [],
    };
  }

  if (verifyPayload) {
    verify();
  }

  const generateScript = resolvePayloadFile(
    "toolkit/scripts/init-feature.ps1"
  );
  const params = {
    FeatureKey: featureKey,
    FeatureName: featureName,
    ProjectPath: projectPath,
  };
  if (force) params.Force = true;

  const result = await runScript(generateScript, params, { silent: !verbose });
  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    throw new ValidationError(
      `Generation failed (exit code ${result.exitCode}).`
    );
  }

  const missingAfter = verifyOutputContract(projectPath, featureKey, featureName);
  if (missingAfter.length > 0) {
    throw new ValidationError(
      `Expected 17 output files but ${missingAfter.length} missing after scaffold bootstrap.`
    );
  }

  return {
    status: missingBefore.length > 0 ? "SCAFFOLD_CREATED" : "SCAFFOLD_ALREADY_PRESENT",
    expectedFiles: expandExpectedFiles(featureKey, featureName),
    missingBefore,
    missingAfter,
  };
}

module.exports = {
  cmdGenerate,
  expandExpectedFiles,
  verifyOutputContract,
  ensureGeneratedScaffold,
};
