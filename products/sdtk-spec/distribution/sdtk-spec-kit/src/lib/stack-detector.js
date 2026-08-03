"use strict";

/**
 * Deterministic, static project stack detection (free; no network, no AI).
 *
 * v1 is Laravel-first: it recognises PHP/Laravel projects with high confidence
 * and makes a best-effort attempt at the JS frontend toolchain and database.
 * Other ecosystems are recognised at lower confidence or left for v2.
 *
 * The result feeds two consumers:
 *   1. sdtk init -> merge into sdtk-spec.config.json (human strings + detection block)
 *   2. sdtk-spec project analysis -> consumes the detected stack
 */

const fs = require("fs");
const path = require("path");

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return null;
  }
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_e) {
    return false;
  }
}

/**
 * Strip composer/npm version range operators to a readable version string.
 * "^11.9" -> "11.9", ">=8.2" -> "8.2", "~5.0" -> "5.0".
 */
function normalizeVersion(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/(\d+(?:\.\d+)*)/);
  return m ? m[1] : null;
}

/**
 * Detect the JS frontend framework from a merged dependency map.
 * Returns { label, evidence[] } or null.
 */
function detectFrontend(deps) {
  if (!deps || typeof deps !== "object") return null;
  const checks = [
    { dep: "next", label: "Next.js" },
    { dep: "nuxt", label: "Nuxt" },
    { dep: "@angular/core", label: "Angular" },
    { dep: "react", label: "React" },
    { dep: "vue", label: "Vue" },
    { dep: "svelte", label: "Svelte" },
    { dep: "alpinejs", label: "Alpine.js" },
  ];
  for (const c of checks) {
    if (deps[c.dep]) {
      const ver = normalizeVersion(deps[c.dep]);
      return {
        label: ver ? `${c.label} ${ver}` : c.label,
        evidence: [`package.json:dependencies.${c.dep}`],
      };
    }
  }
  return null;
}

/**
 * Detect database from Laravel .env (DB_CONNECTION). Best-effort, v1.
 * Returns { label, evidence[] } or null.
 */
function detectDatabase(projectPath) {
  const envPath = path.join(projectPath, ".env");
  let content;
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch (_e) {
    return null;
  }
  const m = content.match(/^\s*DB_CONNECTION\s*=\s*(.+)\s*$/m);
  if (!m) return null;
  const value = m[1].trim().replace(/^["']|["']$/g, "").toLowerCase();
  const map = {
    mysql: "MySQL",
    mariadb: "MariaDB",
    pgsql: "PostgreSQL",
    postgres: "PostgreSQL",
    sqlite: "SQLite",
    sqlsrv: "SQL Server",
  };
  const label = map[value] || value;
  return { label, evidence: [".env:DB_CONNECTION"] };
}

/**
 * Detect the project stack from static signals under projectPath.
 *
 * @param {string} projectPath - absolute path to the project root
 * @returns {{
 *   stack: { backend: string|null, frontend: string|null, database: string|null },
 *   detection: {
 *     language: string|null, framework: string|null, frameworkVersion: string|null,
 *     packageManager: string|null, confidence: "low"|"medium"|"high",
 *     evidence: string[], detectedAt: string, method: "static"
 *   }
 * }}
 */
function detectStack(projectPath) {
  const evidence = [];
  let language = null;
  let framework = null;
  let frameworkVersion = null;
  let packageManager = null;
  let backend = null;
  let frontend = null;
  let database = null;
  let confidence = "low";

  const composer = readJsonSafe(path.join(projectPath, "composer.json"));
  const hasArtisan = fileExists(path.join(projectPath, "artisan"));

  // --- PHP / Laravel (primary v1 target) ---------------------------------
  if (composer) {
    language = "php";
    packageManager = "composer";
    const req = Object.assign({}, composer.require, composer["require-dev"]);
    const laravelVer = req["laravel/framework"];
    const phpVer =
      (composer.require && composer.require.php) ||
      (composer.config &&
        composer.config.platform &&
        composer.config.platform.php);

    if (laravelVer) {
      framework = "laravel";
      frameworkVersion = normalizeVersion(laravelVer);
      confidence = "high";
      evidence.push("composer.json:require.laravel/framework");
      if (hasArtisan) evidence.push("artisan");
    } else {
      confidence = "medium";
      evidence.push("composer.json");
    }

    const phpLabel = phpVer ? `PHP ${normalizeVersion(phpVer)}` : "PHP";
    if (phpVer) evidence.push("composer.json:require.php");
    backend =
      framework === "laravel"
        ? `${phpLabel} + Laravel${frameworkVersion ? " " + frameworkVersion : ""}`
        : `${phpLabel} (composer project)`;
  }

  // --- JS toolchain / frontend ------------------------------------------
  const pkg = readJsonSafe(path.join(projectPath, "package.json"));
  if (pkg) {
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    const fe = detectFrontend(deps);
    if (fe) {
      frontend = fe.label;
      evidence.push(...fe.evidence);
    }
    if (!packageManager) {
      packageManager = fileExists(path.join(projectPath, "package-lock.json"))
        ? "npm"
        : "node";
    }
    if (!language) language = "javascript";
  }

  // Blade fallback when Laravel project has no JS framework
  if (framework === "laravel" && !frontend) {
    if (fileExists(path.join(projectPath, "resources", "views"))) {
      frontend = "Blade (Laravel views)";
      evidence.push("resources/views");
    }
  }

  // --- Database ----------------------------------------------------------
  const db = detectDatabase(projectPath);
  if (db) {
    database = db.label;
    evidence.push(...db.evidence);
  }

  return {
    stack: { backend, frontend, database },
    detection: {
      language,
      framework,
      frameworkVersion,
      packageManager,
      confidence,
      evidence,
      detectedAt: new Date().toISOString(),
      method: "static",
    },
  };
}

// ---------------------------------------------------------------------------
// Config merge
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /^(set your |update_me|n\/a$|tbd$)/i;

/**
 * A stack string field is "replaceable" when empty or still a template
 * placeholder. User-authored values are preserved.
 */
function isPlaceholder(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (t === "") return true;
  return PLACEHOLDER_RE.test(t);
}

/**
 * Merge a detection result into a parsed sdtk-spec.config.json object.
 *
 * - Human-readable stack strings (backend/frontend/database) are filled only
 *   when missing or placeholder (never clobber user edits).
 * - The machine-readable stack.detection block is always (re)written.
 *
 * @returns {{ config: object, summary: { written: string[], preserved: string[], unknown: string[] } }}
 */
function mergeStackIntoConfig(config, detected) {
  const next = config && typeof config === "object" ? config : {};
  if (!next.stack || typeof next.stack !== "object") next.stack = {};

  const summary = { written: [], preserved: [], unknown: [] };
  const fields = ["backend", "frontend", "database"];

  for (const field of fields) {
    const detectedValue = detected.stack[field];
    const currentValue = next.stack[field];
    if (detectedValue) {
      if (isPlaceholder(currentValue)) {
        next.stack[field] = detectedValue;
        summary.written.push(field);
      } else {
        summary.preserved.push(field);
      }
    } else if (isPlaceholder(currentValue)) {
      summary.unknown.push(field);
    } else {
      summary.preserved.push(field);
    }
  }

  next.stack.detection = detected.detection;
  return { config: next, summary };
}

/**
 * Detect the stack and merge into sdtk-spec.config.json on disk.
 * No-op-safe: if the config file is missing it is left untouched and the
 * detection is still returned for callers that want to act on it.
 *
 * @param {string} projectPath
 * @param {{ configPath?: string }} [opts]
 * @returns {{ detected: object, summary: object|null, configPath: string, written: boolean }}
 */
function detectAndMergeConfig(projectPath, opts) {
  const configPath =
    (opts && opts.configPath) ||
    path.join(projectPath, "sdtk-spec.config.json");
  const detected = detectStack(projectPath);

  const config = readJsonSafe(configPath);
  if (config === null) {
    return { detected, summary: null, configPath, written: false };
  }

  const { config: merged, summary } = mergeStackIntoConfig(config, detected);
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return { detected, summary, configPath, written: true };
}

module.exports = {
  detectStack,
  mergeStackIntoConfig,
  detectAndMergeConfig,
  isPlaceholder,
  normalizeVersion,
};
