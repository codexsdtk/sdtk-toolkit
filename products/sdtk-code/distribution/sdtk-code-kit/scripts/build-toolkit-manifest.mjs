// Cross-platform Node port of build-toolkit-manifest.ps1.
// Hashes every file under assets/toolkit and writes the integrity manifest +
// sha256 sidecar. Deterministic (sorted by relative path); LF-normalized assets
// (see /.gitattributes) make the hashes identical on Windows/Linux/macOS.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.dirname(scriptDir);
const assetsRoot = path.join(cliRoot, "assets", "toolkit");
const manifestDir = path.join(cliRoot, "assets", "manifest");

const sourceCommitPaths = [
  "products/sdtk-code/toolkit/install.ps1",
  "products/sdtk-code/toolkit/scripts/install-claude-skills.ps1",
  "products/sdtk-code/toolkit/scripts/install-codex-skills.ps1",
  "products/sdtk-code/toolkit/scripts/uninstall-claude-skills.ps1",
  "products/sdtk-code/toolkit/scripts/uninstall-codex-skills.ps1",
  "products/sdtk-code/toolkit/AGENTS.md",
  "products/sdtk-code/toolkit/templates/CODE_WORKFLOW_TEMPLATE.md",
  "products/sdtk-code/toolkit/sdtk-spec.config.json",
  "products/sdtk-code/toolkit/sdtk-spec.config.profiles.example.json",
  "products/sdtk-code/toolkit/skills",
];

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function resolveSourceCommit() {
  try {
    const repoRoot = execFileSync("git", ["-C", cliRoot, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
    if (!repoRoot) return "unknown";
    const commit = execFileSync(
      "git",
      ["-C", repoRoot, "log", "-1", "--format=%H", "--", ...sourceCommitPaths],
      { encoding: "utf8" }
    ).trim();
    return commit || "unknown";
  } catch {
    return "unknown";
  }
}

const version = JSON.parse(fs.readFileSync(path.join(cliRoot, "package.json"), "utf8")).version;

const files = walk(assetsRoot)
  .map((full) => {
    const relPath = path.relative(assetsRoot, full).split(path.sep).join("/");
    const buf = fs.readFileSync(full);
    return {
      path: relPath,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      size: buf.length,
    };
  })
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const manifest = {
  version,
  sourceCommit: resolveSourceCommit(),
  fileCount: files.length,
  files,
};

fs.mkdirSync(manifestDir, { recursive: true });
fs.writeFileSync(
  path.join(manifestDir, "toolkit-bundle.manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
fs.writeFileSync(
  path.join(manifestDir, "toolkit-bundle.sha256.txt"),
  files.map((f) => `${f.sha256}  ${f.path}`).join("\n") + "\n"
);

console.log(`[OK] manifest v${version} — ${files.length} files, sourceCommit ${manifest.sourceCommit.slice(0, 12)}`);
