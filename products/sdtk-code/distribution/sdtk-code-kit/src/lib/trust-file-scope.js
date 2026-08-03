"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

function normalizePatterns(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string" && entry.length > 0);
}

function loadScopes(projectPath, featureKey, opts = {}) {
  const optAllowed = normalizePatterns(opts.allowed);
  const optBlocked = normalizePatterns(opts.blocked);
  if (Array.isArray(opts.allowed) || Array.isArray(opts.blocked)) {
    return {
      allowed: optAllowed,
      blocked: optBlocked,
      declared: optAllowed.length > 0 || optBlocked.length > 0,
      source: "opts",
    };
  }

  const handoffPath = path.join(
    path.resolve(projectPath || "."),
    "docs",
    "dev",
    `CODE_HANDOFF_${featureKey}.json`,
  );

  try {
    const payload = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
    const allowed = normalizePatterns(payload.allowed_file_scopes);
    const blocked = normalizePatterns(payload.blocked_file_scopes);
    if (Array.isArray(payload.allowed_file_scopes) || Array.isArray(payload.blocked_file_scopes)) {
      return {
        allowed,
        blocked,
        declared: allowed.length > 0 || blocked.length > 0,
        source: "handoff",
      };
    }
  } catch (_error) {
    // Missing or invalid optional forward-compat handoff fields fall back cleanly.
  }

  return { allowed: [], blocked: [], declared: false, source: "none" };
}

function escapeRegexChar(char) {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}

function globToRegex(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*") {
      if (next === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegexChar(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function normalizePathForMatch(file) {
  return String(file || "").replace(/\\/g, "/");
}

function matchOne(file, pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return false;
  }
  const normalizedFile = normalizePathForMatch(file);
  if (pattern.startsWith("re:")) {
    return new RegExp(`^${pattern.slice(3)}$`).test(normalizedFile);
  }
  return globToRegex(normalizePathForMatch(pattern)).test(normalizedFile);
}

function matchScope(file, patterns) {
  return normalizePatterns(patterns).some((pattern) => matchOne(file, pattern));
}

function checkFiles(scopes, changedFiles) {
  const allowed = normalizePatterns(scopes && scopes.allowed);
  const blocked = normalizePatterns(scopes && scopes.blocked);
  const declared = Boolean(scopes && scopes.declared);
  const files = Array.isArray(changedFiles)
    ? changedFiles.filter((entry) => typeof entry === "string" && entry.length > 0)
    : [];

  if (!declared && allowed.length === 0 && blocked.length === 0) {
    return {
      inScope: [],
      outOfScope: [],
      blockedHits: [],
      verdict: "needs_human",
      declared: false,
    };
  }

  const inScope = [];
  const outOfScope = [];
  const blockedHits = [];
  const hasAllowed = allowed.length > 0;

  for (const file of files) {
    if (matchScope(file, blocked)) {
      blockedHits.push(file);
      continue;
    }
    if (!hasAllowed || matchScope(file, allowed)) {
      inScope.push(file);
    } else {
      outOfScope.push(file);
    }
  }

  const verdict = blockedHits.length > 0 || outOfScope.length > 0 ? "fail" : "pass";
  return { inScope, outOfScope, blockedHits, verdict, declared: true };
}

function getChangedFiles(projectPath, baseRef = "HEAD") {
  const result = childProcess.spawnSync(
    "git",
    ["diff", "--name-only", baseRef],
    {
      cwd: path.resolve(projectPath || "."),
      encoding: "utf8",
      errors: "replace",
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || "git diff --name-only failed").trim());
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

module.exports = { loadScopes, matchScope, checkFiles, getChangedFiles };
