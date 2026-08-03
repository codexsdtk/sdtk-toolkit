"use strict";

// `sdtk doctor` — version-fragmentation detector (BK-322).
//
// The failure mode this exists for, hit live on 2026-07-10: the PATH binary
// `sdtk-wiki` resolved to the umbrella's bundled sdtk-wiki-kit@0.6.0 while a
// newer standalone sdtk-wiki-kit@0.8.0 sat installed right next to it,
// silently unused. Any user who installs the umbrella and later updates one
// sub-kit standalone (or vice versa) gets this, with no signal.
//
// Pure fs resolution — no network, no npm invocation, no child processes.

const fs = require("fs");
const path = require("path");

const KIT_CLIS = [
  { cli: "sdtk-spec", pkg: "sdtk-spec-kit" },
  { cli: "sdtk-design", pkg: "sdtk-design-kit" },
  { cli: "sdtk-code", pkg: "sdtk-code-kit" },
  { cli: "sdtk-ops", pkg: "sdtk-ops-kit" },
  { cli: "sdtk-wiki", pkg: "sdtk-wiki-kit" },
  { cli: "sdtk-agent", pkg: "sdtk-agent-kit" },
];

const UMBRELLA_PKG = "sdtk-kit";

// Numeric-aware semver compare; tolerates prerelease suffixes by comparing
// the numeric core first (enough for install-hygiene ordering).
function compareVersions(a, b) {
  const pa = String(a).split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function _isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (_) {
    return false;
  }
}

// First match for `name` across PATH directories. On Windows the npm shims
// are `<name>.cmd` / `<name>.ps1`; elsewhere the bare name.
function resolveBinaryOnPath(name, { pathEnv, pathSep } = {}) {
  const dirs = String(pathEnv != null ? pathEnv : process.env.PATH || "")
    .split(pathSep || path.delimiter)
    .filter(Boolean);
  const candidates = process.platform === "win32"
    ? [`${name}.cmd`, `${name}.ps1`, `${name}.exe`, name]
    : [name];
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      if (_isFile(full)) return full;
    }
  }
  return null;
}

// Walk up from a resolved bin file to the package.json that owns it.
function owningPackage(realPath) {
  let dir = path.dirname(realPath);
  const rootStop = path.parse(dir).root;
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (_isFile(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg && pkg.name) return { name: pkg.name, version: pkg.version, dir };
      } catch (_) {
        // unreadable package.json — keep walking
      }
    }
    if (dir === rootStop) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Resolve the bin file a PATH entry actually executes. POSIX npm bins are
// symlinks (realpath lands inside the owning package). Windows .cmd/.ps1
// shims are plain files whose body names the target script — best-effort
// parse for a node_modules-relative path.
function _resolveBinTarget(binPath) {
  try {
    const real = fs.realpathSync(binPath);
    if (real !== binPath || !/\.(cmd|ps1)$/i.test(binPath)) return real;
  } catch (_) {
    return null;
  }
  try {
    const body = fs.readFileSync(binPath, "utf8");
    const m = body.match(/node_modules[\\/][^"'\r\n]+?\.js/);
    if (m) return path.resolve(path.dirname(binPath), m[0]);
  } catch (_) {
    /* fall through */
  }
  return binPath;
}

function _readPkgVersion(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return pkg && pkg.version ? String(pkg.version) : null;
  } catch (_) {
    return null;
  }
}

// Every discoverable install of `pkgName` reachable from the global roots we
// learned about: <root>/<pkgName> (standalone) and the umbrella's bundled
// copy <root>/sdtk-kit/node_modules/<pkgName>.
function _installedCandidates(pkgName, globalRoots) {
  const found = [];
  for (const root of globalRoots) {
    const standalone = path.join(root, pkgName);
    const standaloneVersion = _readPkgVersion(standalone);
    if (standaloneVersion) {
      found.push({ version: standaloneVersion, dir: standalone, via: "standalone" });
    }
    const bundled = path.join(root, UMBRELLA_PKG, "node_modules", pkgName);
    const bundledVersion = _readPkgVersion(bundled);
    if (bundledVersion) {
      const umbrellaVersion = _readPkgVersion(path.join(root, UMBRELLA_PKG));
      found.push({
        version: bundledVersion,
        dir: bundled,
        via: `bundled in ${UMBRELLA_PKG}@${umbrellaVersion || "?"}`,
      });
    }
  }
  // Dedupe by real dir (npm link can alias the same package twice).
  const seen = new Set();
  return found.filter((c) => {
    let key = c.dir;
    try {
      key = fs.realpathSync(c.dir);
    } catch (_) {
      /* keep raw */
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The node_modules directory that directly contains a package dir, if any —
// that is the "global root" fragmentation is measured against.
function _globalRootOf(pkgDir) {
  const parent = path.dirname(pkgDir);
  return path.basename(parent) === "node_modules" ? parent : null;
}

// Full report. `pathEnv`/`pathSep` are injectable for tests.
function buildDoctorReport({ pathEnv, pathSep } = {}) {
  const kits = [];
  const globalRoots = new Set();

  // Pass 1: resolve every CLI to its active package and learn global roots.
  const resolved = KIT_CLIS.map(({ cli, pkg }) => {
    const binPath = resolveBinaryOnPath(cli, { pathEnv, pathSep });
    if (!binPath) return { cli, pkg, binPath: null };
    const target = _resolveBinTarget(binPath);
    const owner = target ? owningPackage(target) : null;
    if (owner) {
      const root = _globalRootOf(owner.dir);
      if (root) globalRoots.add(root);
    }
    return { cli, pkg, binPath, target, owner };
  });

  for (const r of resolved) {
    const row = {
      cli: r.cli,
      pkg: r.pkg,
      binPath: r.binPath,
      activeVersion: null,
      activeSource: null,
      installed: [],
      warnings: [],
    };

    if (!r.binPath || !r.owner) {
      row.warnings.push(`${r.cli}: not found on PATH.`);
      kits.push(row);
      continue;
    }

    if (r.owner.name === UMBRELLA_PKG) {
      // Active version = the sub-kit copy the umbrella shim's require resolves:
      // node's algorithm looks in the umbrella's own node_modules first, then
      // its parent (the shared global root).
      const bundled = path.join(r.owner.dir, "node_modules", r.pkg);
      const sibling = path.join(path.dirname(r.owner.dir), r.pkg);
      const activeDir = _readPkgVersion(bundled) ? bundled : sibling;
      row.activeVersion = _readPkgVersion(activeDir);
      row.activeSource = `via ${UMBRELLA_PKG}@${r.owner.version} shim -> ${activeDir === bundled ? "bundled copy" : "hoisted sibling"}`;
    } else {
      row.activeVersion = r.owner.version;
      row.activeSource = `standalone ${r.owner.name}@${r.owner.version} (${r.owner.dir})`;
    }

    row.installed = _installedCandidates(r.pkg, globalRoots);
    if (row.activeVersion) {
      for (const candidate of row.installed) {
        if (compareVersions(candidate.version, row.activeVersion) > 0) {
          row.warnings.push(
            `${r.cli}: PATH serves ${row.activeVersion} but ${candidate.version} is installed ` +
              `(${candidate.via}, ${candidate.dir}) and is NOT the one that runs. ` +
              `Fix: align versions — either \`npm update -g ${UMBRELLA_PKG}\` or remove the shadowed copy.`
          );
        }
      }
    }
    kits.push(row);
  }

  return {
    kits,
    globalRoots: Array.from(globalRoots),
    hasWarnings: kits.some((k) => k.warnings.length > 0),
  };
}

// BK-344 config health: informational scan of the project's
// sdtk-spec.config.json for never-filled placeholder values. NOTE-level only —
// a fresh init legitimately starts with placeholders, so this must not flip
// the doctor exit code; `sdtk-spec config check` is the strict (exit 1) gate.
const CONFIG_PLACEHOLDER_PATTERNS = [/UPDATE_ME/, /^Set your /];

function _collectConfigPlaceholders(node, trail, findings) {
  if (typeof node === "string") {
    if (CONFIG_PLACEHOLDER_PATTERNS.some((re) => re.test(node))) {
      findings.push({ path: trail.join("."), value: node });
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => _collectConfigPlaceholders(item, trail.concat(String(i)), findings));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      _collectConfigPlaceholders(value, trail.concat(key), findings);
    }
  }
}

function buildConfigHealth(projectPath) {
  const configPath = path.join(projectPath || process.cwd(), "sdtk-spec.config.json");
  if (!_isFile(configPath)) return { present: false, configPath, findings: [], parseError: null };
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    return { present: true, configPath, findings: [], parseError: err.message };
  }
  const findings = [];
  _collectConfigPlaceholders(config, [], findings);
  return { present: true, configPath, findings, parseError: null };
}

module.exports = {
  KIT_CLIS,
  UMBRELLA_PKG,
  compareVersions,
  resolveBinaryOnPath,
  owningPackage,
  buildDoctorReport,
  buildConfigHealth,
};
