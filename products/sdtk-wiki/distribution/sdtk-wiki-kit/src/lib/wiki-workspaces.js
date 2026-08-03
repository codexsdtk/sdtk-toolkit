"use strict";

// BK-319 (L-6/OQ-BR-4): multi-workspace viewer support for the project wiki.
// `workspaces: [{name, path}]` lives in .sdtk/wiki/graph/config.json; the
// switcher nav is spliced into the built viewer.html post-build (the shared
// atlas builder stays untouched — byte-identity with sdtk-brain is guarded).

const fs = require("fs");
const path = require("path");
const { ValidationError } = require("./errors");

const NAV_MARKER = "sdtk-workspaces-nav";

function configPathFor(outputDir) {
  return path.join(outputDir, "config.json");
}

function readWorkspaces(outputDir) {
  try {
    const config = JSON.parse(fs.readFileSync(configPathFor(outputDir), "utf-8"));
    return Array.isArray(config.workspaces) ? config.workspaces : [];
  } catch {
    return [];
  }
}

function addWorkspace(outputDir, spec) {
  const eq = String(spec || "").indexOf("=");
  if (eq <= 0) {
    throw new ValidationError('--workspace requires "<name>=<path>", e.g. --workspace brain=~/my-vault');
  }
  const name = spec.slice(0, eq).trim();
  const target = path.resolve(spec.slice(eq + 1).trim());
  if (!name || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new ValidationError(`--workspace path is not a directory: ${target}`);
  }
  const file = configPathFor(outputDir);
  const config = JSON.parse(fs.readFileSync(file, "utf-8"));
  const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];
  const next = workspaces.filter((w) => w.name !== name);
  next.push({ name, path: target });
  config.workspaces = next;
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return next;
}

// Splice (or refresh) the switcher nav into a built viewer.html. Idempotent:
// an existing nav block is replaced, never duplicated.
function injectWorkspacesNav(outputDir, workspaces) {
  const viewerPath = path.join(outputDir, "viewer.html");
  if (!fs.existsSync(viewerPath) || !Array.isArray(workspaces) || workspaces.length === 0) {
    return false;
  }
  let html = fs.readFileSync(viewerPath, "utf-8");
  const links = workspaces.map((w) => {
    const viewer = path.join(w.path, ".brain", "graph", "viewer.html");
    const href = fs.existsSync(viewer) ? viewer : w.path;
    return `<a href="file://${href}" style="margin-right:10px">${w.name}</a>`;
  }).join("");
  const nav = `<div id="${NAV_MARKER}" style="position:fixed;bottom:8px;right:8px;z-index:9999;background:#1e293bcc;color:#e2e8f0;padding:6px 10px;border-radius:8px;font:12px sans-serif">workspaces: <a href="#" style="margin-right:10px">project</a>${links}</div>`;
  const existing = new RegExp(`<div id="${NAV_MARKER}"[\\s\\S]*?</div>`);
  if (existing.test(html)) {
    html = html.replace(existing, nav);
  } else {
    html = html.replace("</body>", `${nav}\n</body>`);
  }
  fs.writeFileSync(viewerPath, html);
  return true;
}

module.exports = { readWorkspaces, addWorkspace, injectWorkspacesNav, NAV_MARKER };
