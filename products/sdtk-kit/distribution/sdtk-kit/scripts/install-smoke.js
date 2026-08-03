#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = path.join(PACKAGE_ROOT, "package.json");
const TOOLKITS = Object.freeze([
  { cli: "sdtk-spec", packageName: "sdtk-spec-kit" },
  { cli: "sdtk-code", packageName: "sdtk-code-kit" },
  { cli: "sdtk-ops", packageName: "sdtk-ops-kit" },
  { cli: "sdtk-design", packageName: "sdtk-design-kit" },
  { cli: "sdtk-wiki", packageName: "sdtk-wiki-kit" },
  { cli: "sdtk-agent", packageName: "sdtk-agent-kit" },
]);

function usage() {
  return [
    "Usage:",
    "  node scripts/install-smoke.js --mode local [--package ./sdtk-kit-1.2.0.tgz] [--keep-prefix]",
    "  node scripts/install-smoke.js --mode published [--package sdtk-kit@latest] [--keep-prefix]",
    "",
    "Modes:",
    "  local      Packs the local sdtk-kit package when --package is omitted, then installs it into a clean prefix.",
    "  published  Installs a published package spec, defaulting to sdtk-kit@latest, into a clean prefix.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { mode: "local", packageSpec: null, keepPrefix: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") {
      args.mode = argv[++i];
    } else if (arg === "--package") {
      args.packageSpec = argv[++i];
    } else if (arg === "--keep-prefix") {
      args.keepPrefix = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (!new Set(["local", "published"]).has(args.mode)) {
    throw new Error(`Invalid --mode: ${args.mode}\n${usage()}`);
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || PACKAGE_ROOT,
    env: options.env || process.env,
    encoding: "utf8",
    shell: options.shell || false,
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(" ")}`,
      `exit=${result.status}`,
      result.stdout ? `stdout:\n${result.stdout}` : "stdout: <empty>",
      result.stderr ? `stderr:\n${result.stderr}` : "stderr: <empty>",
    ].join("\n"));
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assertPackageMetadata(packageJson) {
  const missingBins = [];
  const missingDeps = [];
  for (const toolkit of TOOLKITS) {
    if (!packageJson.bin || packageJson.bin[toolkit.cli] !== `bin/${toolkit.cli}.js`) {
      missingBins.push(toolkit.cli);
    }
    if (!packageJson.dependencies || !packageJson.dependencies[toolkit.packageName]) {
      missingDeps.push(toolkit.packageName);
    }
  }
  if (missingBins.length || missingDeps.length) {
    throw new Error(`sdtk-kit metadata is incomplete: missingBins=${missingBins.join(",") || "none"}; missingDeps=${missingDeps.join(",") || "none"}`);
  }
}

function packLocalPackage() {
  const result = run("npm", ["pack", "--json"], { cwd: PACKAGE_ROOT });
  const entries = JSON.parse(result.stdout);
  if (!Array.isArray(entries) || entries.length !== 1 || !entries[0].filename) {
    throw new Error(`Unexpected npm pack --json output: ${result.stdout}`);
  }
  return path.join(PACKAGE_ROOT, entries[0].filename);
}

function npmBinPath(prefix, cli) {
  const binDir = path.join(prefix, "node_modules", ".bin");
  const candidates = process.platform === "win32"
    ? [path.join(binDir, `${cli}.cmd`), path.join(binDir, `${cli}.ps1`), path.join(binDir, cli)]
    : [path.join(binDir, cli)];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function installedPackageJson(prefix, packageName) {
  const candidates = [
    path.join(prefix, "node_modules", packageName, "package.json"),
    path.join(prefix, "node_modules", "sdtk-kit", "node_modules", packageName, "package.json"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Cannot find installed package.json for ${packageName} under ${prefix}`);
  }
  return readJson(found);
}

function runCliVersion(binPath) {
  return run(binPath, ["--version"], { shell: process.platform === "win32" });
}

function smokeInstall(packageSpec, mode, keepPrefix) {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "sdtk-kit-install-smoke-"));
  let packedTarball = null;
  try {
    const localPackageJson = readJson(PACKAGE_JSON);
    assertPackageMetadata(localPackageJson);

    let installSpec = packageSpec;
    if (mode === "local" && !installSpec) {
      packedTarball = packLocalPackage();
      installSpec = packedTarball;
    }
    if (mode === "published" && !installSpec) {
      installSpec = "sdtk-kit@latest";
    }
    if (!installSpec) {
      throw new Error("No package spec resolved for install smoke.");
    }

    console.log(`[sdtk-kit smoke] mode=${mode}`);
    console.log(`[sdtk-kit smoke] prefix=${prefix}`);
    console.log(`[sdtk-kit smoke] install=${installSpec}`);
    run("npm", ["install", "--prefix", prefix, installSpec]);

    const installedMeta = installedPackageJson(prefix, "sdtk-kit");
    assertPackageMetadata(installedMeta);
    console.log(`[sdtk-kit smoke] installed sdtk-kit ${installedMeta.version}`);

    for (const toolkit of TOOLKITS) {
      const binPath = npmBinPath(prefix, toolkit.cli);
      if (!binPath) {
        throw new Error(`Missing CLI shim for ${toolkit.cli} in ${path.join(prefix, "node_modules", ".bin")}`);
      }
      const expected = installedPackageJson(prefix, toolkit.packageName).version;
      const result = runCliVersion(binPath);
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      if (!output.includes(expected)) {
        throw new Error(`${toolkit.cli} --version did not include installed ${toolkit.packageName} version ${expected}. Output: ${output}`);
      }
      console.log(`[sdtk-kit smoke] ${toolkit.cli} -> ${output}`);
    }

    console.log("[sdtk-kit smoke] PASS all six CLI shims exist and --version checks passed.");
  } finally {
    if (packedTarball && fs.existsSync(packedTarball)) {
      fs.rmSync(packedTarball, { force: true });
    }
    if (keepPrefix) {
      console.log(`[sdtk-kit smoke] kept prefix: ${prefix}`);
    } else {
      fs.rmSync(prefix, { recursive: true, force: true });
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  smokeInstall(args.packageSpec, args.mode, args.keepPrefix);
}

try {
  main();
} catch (error) {
  console.error(`[sdtk-kit smoke] FAIL ${error.message}`);
  process.exit(1);
}
