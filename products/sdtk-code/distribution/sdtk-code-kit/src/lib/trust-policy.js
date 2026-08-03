"use strict";

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");

// Default allow/ask/deny pack (BK-240 §5), derived from the reference harness
// settings.json command classes. Patterns starting with "^" are treated as
// anchored regular expressions; all other patterns are case-sensitive
// substring matches against the command string. NO shell execution: this is
// advisory classification only.
const DEFAULT_POLICY = {
  deny: [
    "^rm -rf",
    "^rm -fr",
    "^sudo ",
    "git reset --hard",
    "git push --force",
    "git push -f",
    "mkfs",
    "^dd ",
    ".env",
    ".pem",
    "secrets/",
    "^psql",
    "^mysql",
    "^mongod",
  ],
  ask: [
    "npm install",
    "npm publish",
    "npm exec",
    "npx",
    "git merge",
    "git rebase",
    "git clean -fd",
    "git clean -fx",
    "git clean -fdx",
  ],
  allow: [
    "git status",
    "git diff",
    "git log",
    "git branch",
    "git show",
    "npm test",
    "npm run test",
    "npm run lint",
    "npm run build",
    "pytest",
    "python -m unittest",
    "rg ",
    "ls ",
    "node --check",
  ],
  // limits.max_actions is omitted by default; callers may add it (and supply
  // --action-count) to enable the action-count cap.
  limits: {},
};

function assertPatternArray(value, label) {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      `Invalid trust policy: "${label}" must be an array of string patterns.`
    );
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      throw new ValidationError(
        `Invalid trust policy: "${label}[${index}]" must be a string pattern.`
      );
    }
  });
}

function validatePolicy(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new ValidationError("Invalid trust policy: expected a JSON object.");
  }
  assertPatternArray(obj.deny, "deny");
  assertPatternArray(obj.ask, "ask");
  assertPatternArray(obj.allow, "allow");

  if (obj.limits !== undefined && obj.limits !== null) {
    if (typeof obj.limits !== "object" || Array.isArray(obj.limits)) {
      throw new ValidationError('Invalid trust policy: "limits" must be an object.');
    }
    if (
      obj.limits.max_actions !== undefined &&
      typeof obj.limits.max_actions !== "number"
    ) {
      throw new ValidationError(
        'Invalid trust policy: "limits.max_actions" must be a number.'
      );
    }
  }
  return obj;
}

function policyFile(projectPath) {
  return path.join(path.resolve(projectPath || "."), ".sdtk", "trust", "policy.json");
}

function loadPolicy(projectPath) {
  const file = policyFile(projectPath);
  if (!fs.existsSync(file)) {
    return DEFAULT_POLICY;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new ValidationError(
      `Invalid trust policy: ${file} is not valid JSON (${error.message}).`
    );
  }
  return validatePolicy(parsed);
}

// Match a single pattern against the command string. "^"-prefixed patterns are
// anchored regexes; everything else is a case-sensitive substring match. A
// malformed regex pattern is treated as a non-match so classify never crashes.
function matchesPattern(pattern, command) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return false;
  }
  if (pattern.startsWith("^")) {
    try {
      return new RegExp(pattern).test(command);
    } catch (_error) {
      return false;
    }
  }
  return command.includes(pattern);
}

function firstMatch(patterns, command) {
  if (!Array.isArray(patterns)) {
    return null;
  }
  for (const pattern of patterns) {
    if (matchesPattern(pattern, command)) {
      return pattern;
    }
  }
  return null;
}

// Classify a command as allow/ask/deny against a policy. Most-restrictive-wins,
// deterministic. Stateless: the caller supplies opts.actionCount; trust-policy
// performs no session counting. Never executes the command.
function classifyCommand(policy, command, opts) {
  const cmd = typeof command === "string" ? command : "";
  const options = opts && typeof opts === "object" ? opts : {};
  const limits = policy && policy.limits && typeof policy.limits === "object" ? policy.limits : {};

  // 1. action-count cap.
  if (
    typeof options.actionCount === "number" &&
    typeof limits.max_actions === "number" &&
    options.actionCount >= limits.max_actions
  ) {
    return {
      verdict: "deny",
      reason: `action-count cap reached (${options.actionCount}/${limits.max_actions})`,
      matchedRule: { bucket: "limit", pattern: "limits.max_actions" },
    };
  }

  // 2. deny → 3. ask → 4. allow (first match wins per bucket).
  const denyHit = firstMatch(policy && policy.deny, cmd);
  if (denyHit) {
    return {
      verdict: "deny",
      reason: `denied by policy rule: ${denyHit}`,
      matchedRule: { bucket: "deny", pattern: denyHit },
    };
  }

  const askHit = firstMatch(policy && policy.ask, cmd);
  if (askHit) {
    return {
      verdict: "ask",
      reason: `requires confirmation by policy rule: ${askHit}`,
      matchedRule: { bucket: "ask", pattern: askHit },
    };
  }

  const allowHit = firstMatch(policy && policy.allow, cmd);
  if (allowHit) {
    return {
      verdict: "allow",
      reason: `allowed by policy rule: ${allowHit}`,
      matchedRule: { bucket: "allow", pattern: allowHit },
    };
  }

  // 5. no match → conservative ask.
  return {
    verdict: "ask",
    reason: "no matching allow rule; defaulting to ask (conservative)",
    matchedRule: null,
  };
}

module.exports = {
  DEFAULT_POLICY,
  loadPolicy,
  classifyCommand,
  validatePolicy,
  policyFile,
};
