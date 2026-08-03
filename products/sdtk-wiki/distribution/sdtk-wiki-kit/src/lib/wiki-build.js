"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  OfficeIngestError,
  extractOfficeMarkdown,
  isLegacyOfficeFile,
  isOfficeFile,
} = require("./office-ingest");
const { INDEXABLE_EXTENSIONS, isIndexableSource } = require("./wiki-sources");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ATLAS_STATE_VERSION = 7;
const WIKI_PAGE_SCHEMA_VERSION = 1;
const WIKI_PROVENANCE_SCHEMA_VERSION = 1;

const _ASSETS_DIR = path.join(__dirname, "..", "..", "assets", "atlas");
const MERMAID_VENDOR_PATH = path.join(_ASSETS_DIR, "vendor", "mermaid.min.js");
const MERMAID_ASSET_NAME = "mermaid.min.js";
const _VIEWER_TEMPLATE_PATH = path.join(_ASSETS_DIR, "doc_atlas_viewer_template.html");

// ---------------------------------------------------------------------------
// _json_for_inline_script — parity with Python: compact, ensure_ascii, safe HTML
// ---------------------------------------------------------------------------
function _escapeNonAscii(str) {
  return str.replace(/[^\x00-\x7F]/g, (c) => {
    const code = c.codePointAt(0);
    if (code <= 0xFFFF) {
      return "\\u" + code.toString(16).padStart(4, "0");
    }
    // surrogate pair for > U+FFFF
    const hi = Math.floor((code - 0x10000) / 0x400) + 0xD800;
    const lo = ((code - 0x10000) % 0x400) + 0xDC00;
    return "\\u" + hi.toString(16).padStart(4, "0") + "\\u" + lo.toString(16).padStart(4, "0");
  });
}

function _json_for_inline_script(value) {
  const compact = JSON.stringify(value);
  return _escapeNonAscii(compact)
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\!--");
}

// ---------------------------------------------------------------------------
// Default exclude fragments
// ---------------------------------------------------------------------------
const DEFAULT_EXCLUDE_FRAGS = [
  ".git",
  ".sdtk/wiki",
  ".sdtk/atlas",
  "node_modules",
  ".venv",
  "venv",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
];

// ---------------------------------------------------------------------------
// Reference patterns — ported from Python re to JS RegExp
// ---------------------------------------------------------------------------
const RE_BK = /\bBK-(\d{3,})\b/g;
const RE_KNOWLEDGE_ID = /\b(KD|KT|KP|KA|KR|KRB|KF)-(\d{4})\b/g;
const RE_REPO_PATH = /(?:^|[\s`(\[])([a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-. ]+)+\.(?:md|py|ps1|json|yaml|yml|html|txt))/gm;
const RE_WIKI_LINK = /\[\[([^\]]+)\]\]/g;
const RE_MARKDOWN_LINK = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
const RE_SKILL_REF = /\b(sdtk-[a-z0-9][a-z0-9-]*)\b/g;
const RE_RELEASE_REF = /\b(?:sdtk-spec-kit@)?(0\.\d+\.\d+)\b/g;

// ---------------------------------------------------------------------------
// Family / role classifiers — verbatim from build_atlas.py
// ---------------------------------------------------------------------------
function classify_family(rel) {
  const p = rel.replace(/\\/g, "/").toLowerCase();
  const name = path.basename(rel).toLowerCase();
  const is_guide_path = p.startsWith("guides/") || p.includes("/guides/");
  if (p === "readme.md") return "root-readme";
  if (name.includes("backlog")) return "backlog";
  if (p.includes("skills")) return "skill";
  if (p.includes("templates")) return "template";
  if (p.includes("docs/database") || p.includes("database/")) return "database";
  if (p.includes("docs/specs") || p.includes("specs/")) return "spec";
  if (p.includes("docs/architecture") || p.includes("architecture/")) return "architecture";
  if (p.includes("docs/api") || p.includes("api/")) return "api";
  if (p.includes("docs/qa") || p.includes("qa/")) return "qa";
  if (p.includes("docs/design") || p.includes("design/")) return "design";
  if (p.includes("docs/dev") || p.includes("dev/")) return "dev";
  if (p.includes("docs/product") || p.includes("product/")) return "product";
  if (is_guide_path) return "guide";
  if (p.includes("governance")) return "governance";
  return "other-markdown";
}

function classify_role(rel) {
  const p = rel.replace(/\\/g, "/").toLowerCase();
  if (p.includes("governance")) return "governance";
  if (p.includes("spec") || p.includes("architecture")) return "spec-artifact";
  if (p.includes("skill")) return "skill";
  return "other";
}

// ---------------------------------------------------------------------------
// Family colors map — verbatim from build_atlas.py
// ---------------------------------------------------------------------------
const _FAMILY_COLORS = {
  "governance": "#58a6ff",
  "guide": "#14b8a6",
  "backlog": "#d2a8ff",
  "spec": "#f0883e",
  "architecture": "#3fb950",
  "database": "#a371f7",
  "api": "#f778ba",
  "qa": "#79c0ff",
  "design": "#ffa657",
  "dev": "#56d364",
  "product": "#e3b341",
  "skill": "#58a6ff",
  "template": "#f0883e",
  "root-readme": "#e3b341",
  "other-markdown": "#8b949e",
};

// ---------------------------------------------------------------------------
// Scanner helpers
// ---------------------------------------------------------------------------
function _now_utc() {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

function _write_text_lf(filePath, content) {
  const normalised = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  fs.writeFileSync(filePath, normalised, { encoding: "utf8" });
}

function _assert_inside(base, target) {
  const resolvedBase = fs.realpathSync(base);
  let resolvedTarget;
  try {
    resolvedTarget = fs.realpathSync(target);
  } catch (_) {
    // target might not exist yet; resolve via path.resolve
    resolvedTarget = path.resolve(target);
  }
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Refusing to write outside SDTK-WIKI workspace: ${resolvedTarget}`);
  }
}

function _normalise_exclude_fragment(frag) {
  const norm = frag.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  return norm.split("/").filter((p) => p && p !== ".");
}

function _display_scan_path(filePath, root) {
  const rel = path.relative(root, filePath);
  return rel.split(path.sep).join("/");
}

function _match_exclude(filePath, root, exclude_frags) {
  const rel = _display_scan_path(filePath, root).toLowerCase();
  const rel_parts = rel.split("/").filter((p) => p && p !== ".");

  for (const frag of exclude_frags) {
    const frag_parts = _normalise_exclude_fragment(frag);
    if (!frag_parts.length) continue;
    if (frag_parts.length === 1) {
      if (rel_parts.includes(frag_parts[0])) return frag;
      continue;
    }
    for (let idx = 0; idx <= rel_parts.length - frag_parts.length; idx++) {
      const slice = rel_parts.slice(idx, idx + frag_parts.length);
      if (slice.join("/") === frag_parts.join("/")) return frag;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// File scanner
// ---------------------------------------------------------------------------
// BK-395/BK-396: the canonical source list lives in wiki-sources.js so the
// builder and the staleness check cannot disagree about what a source is.
// Legacy .doc/.xls/.ppt stay out on purpose — a different binary format, and
// they are reported as skipped rather than parsed into garbage.
const _INDEXABLE_EXTENSIONS = INDEXABLE_EXTENSIONS;
const _is_indexable_source = isIndexableSource;

function _rglob_md(dir, legacy_hits) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  // Sort to match Python's sorted() on posix path
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(..._rglob_md(full, legacy_hits));
    } else if (entry.isFile() && _is_indexable_source(entry.name)) {
      results.push(full);
    } else if (entry.isFile() && legacy_hits && isLegacyOfficeFile(entry.name)) {
      // Collected only to be REPORTED. A user with a folder of .doc files
      // otherwise sees nothing happen and gets no reason why.
      legacy_hits.push(full);
    }
  }
  return results;
}

function collect_indexable_markdown_files(root, scan_roots, exclude_frags) {
  const files = [];
  const seen_paths = new Set();
  const skipped_files = [];
  const legacy_hits = [];
  let scanned_count = 0;

  for (const scan_root of scan_roots) {
    if (!fs.existsSync(scan_root)) {
      process.stderr.write(`[atlas] Warning: scan root does not exist, skipping: ${scan_root}\n`);
      continue;
    }

    let candidates;
    const stat = fs.statSync(scan_root);
    if (stat.isFile() && _is_indexable_source(scan_root)) {
      candidates = [scan_root];
    } else if (stat.isDirectory()) {
      candidates = _rglob_md(scan_root, legacy_hits);
    } else {
      candidates = [];
    }

    for (const md_file of candidates) {
      scanned_count++;
      const matched_exclude = _match_exclude(md_file, root, exclude_frags);
      const display_path = _display_scan_path(md_file, root);
      if (matched_exclude !== null) {
        skipped_files.push({ path: display_path, reason: `exclude:${matched_exclude}` });
        continue;
      }
      const rel = path.relative(root, md_file).split(path.sep).join("/");
      if (seen_paths.has(rel)) {
        skipped_files.push({ path: display_path, reason: "duplicate_scan_root" });
        continue;
      }
      seen_paths.add(rel);
      files.push(md_file);
    }
  }

  files.sort((a, b) => a.split(path.sep).join("/") < b.split(path.sep).join("/") ? -1 : 1);

  // BK-395: pre-2007 binary Office files are not readable here. Report them
  // once, with the fix, rather than leaving the user to wonder.
  for (const legacy_file of legacy_hits) {
    if (_match_exclude(legacy_file, root, exclude_frags) !== null) continue;
    skipped_files.push({
      path: _display_scan_path(legacy_file, root),
      reason: "legacy_office_format: re-save as .docx/.xlsx/.pptx to index it",
    });
  }

  return {
    files,
    scanned_count,
    indexed_count: files.length,
    skipped_count: skipped_files.length,
    skipped_files,
  };
}

function list_indexable_markdown_files(root, scan_roots, exclude_frags) {
  return collect_indexable_markdown_files(root, scan_roots, exclude_frags).files;
}

// ---------------------------------------------------------------------------
// Document record parsers
// ---------------------------------------------------------------------------
function _extract_title(text) {
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("# ")) {
      return stripped.slice(2).trim();
    }
  }
  return "";
}

function _extract_headings(text) {
  const headings = [];
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (!stripped.startsWith("#")) continue;
    let level = 0;
    while (level < stripped.length && stripped[level] === "#") level++;
    if (level >= 1 && level <= 6 && stripped.length > level && stripped[level] === " ") {
      headings.push(stripped.slice(level + 1).trim());
    }
  }
  return headings;
}

function _parse_frontmatter(text) {
  const lines = text.split("\n");
  if (!lines.length || lines[0].trim() !== "---") return [{}, text];

  const fields = {};
  let current_list_key = null;

  for (let idx = 1; idx < lines.length; idx++) {
    const raw = lines[idx];
    const stripped = raw.trim();

    if (stripped === "---" || stripped === "...") {
      // split("\n") produces trailing "" for a file ending with "\n",
      // so join("\n") already yields the correct trailing newline — no extra append needed.
      const body = lines.slice(idx + 1).join("\n");
      return [fields, body];
    }

    if (!stripped) { current_list_key = null; continue; }

    if (stripped.startsWith("- ") && current_list_key && Array.isArray(fields[current_list_key])) {
      fields[current_list_key].push(stripped.slice(2).trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    if (!raw.includes(":")) { current_list_key = null; continue; }

    const colon = raw.indexOf(":");
    const key = raw.slice(0, colon).trim();
    const value = raw.slice(colon + 1).trim();

    if (!key) { current_list_key = null; continue; }

    if (!value) {
      fields[key] = [];
      current_list_key = key;
      continue;
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      if (inner) {
        fields[key] = inner.split(",").map((p) => p.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      } else {
        fields[key] = [];
      }
      current_list_key = null;
      continue;
    }

    fields[key] = value.replace(/^["']|["']$/g, "");
    current_list_key = null;
  }

  return [{}, text];
}

function _normalize_internal_ref(raw) {
  let value = raw.trim();
  if (!value) return "";
  value = value.split("|")[0].trim();
  value = value.split("#")[0].trim();
  value = value.replace(/\\/g, "/");
  while (value.startsWith("./")) value = value.slice(2);
  if (value.startsWith("/")) value = value.slice(1);
  return value.trim();
}

function _findAll(re, text) {
  const results = [];
  let m;
  const pattern = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text)) !== null) {
    results.push(m);
  }
  return results;
}

function _extract_references(text) {
  const issues_set = new Set();
  for (const m of _findAll(RE_BK, text)) issues_set.add(`BK-${m[1]}`);
  const issues = [...issues_set].sort();

  const knowledge_set = new Set();
  for (const m of _findAll(RE_KNOWLEDGE_ID, text)) knowledge_set.add(`${m[1]}-${m[2]}`);
  const knowledge_ids = [...knowledge_set].sort();

  const raw_paths = _findAll(RE_REPO_PATH, text).map((m) => m[1]);
  const paths = [];
  const seen = new Set();
  for (const rp of raw_paths) {
    const normalised = _normalize_internal_ref(rp);
    if (normalised && !seen.has(normalised)) {
      seen.add(normalised);
      paths.push(normalised);
    }
  }

  return [issues, knowledge_ids, paths];
}

function _extract_wiki_links(text) {
  const links = [];
  const seen = new Set();
  for (const m of _findAll(RE_WIKI_LINK, text)) {
    const normalised = _normalize_internal_ref(m[1]);
    if (normalised && !seen.has(normalised)) {
      seen.add(normalised);
      links.push(normalised);
    }
  }
  return links;
}

function _extract_markdown_links(text) {
  const links = [];
  const seen = new Set();
  for (const m of _findAll(RE_MARKDOWN_LINK, text)) {
    let target = m[1].trim().replace(/^<|>$/g, "");
    const lower = target.toLowerCase();
    if (!target || lower.startsWith("http://") || lower.startsWith("https://") ||
        lower.startsWith("mailto:") || lower.startsWith("#") || target.includes("://")) {
      continue;
    }
    if (target.includes(' "')) target = target.split(' "')[0];
    if (target.includes(" '")) target = target.split(" '")[0];
    const normalised = _normalize_internal_ref(target);
    if (normalised && !seen.has(normalised)) {
      seen.add(normalised);
      links.push(normalised);
    }
  }
  return links;
}

function _extract_skill_refs(text, path_refs, wiki_links) {
  const refs = new Set();
  for (const m of _findAll(RE_SKILL_REF, text)) refs.add(m[1].toLowerCase());
  for (const ref of [...path_refs, ...wiki_links]) {
    const parts = ref.split("/").filter(Boolean);
    for (const marker of ["skills", "skills-claude"]) {
      if (parts.includes(marker)) {
        const idx = parts.indexOf(marker);
        if (idx + 1 < parts.length) refs.add(parts[idx + 1].toLowerCase());
      }
    }
  }
  return [...refs].sort();
}

function _extract_template_refs(path_refs, wiki_links) {
  const refs = new Set();
  for (const ref of [...path_refs, ...wiki_links]) {
    const norm = _normalize_internal_ref(ref);
    if (("/" + norm).includes("/templates/")) refs.add(norm);
  }
  return [...refs].sort();
}

function _extract_release_refs(text) {
  const refs = new Set();
  for (const m of _findAll(RE_RELEASE_REF, text)) refs.add(m[1]);
  return [...refs].sort();
}

function _compute_file_hash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// BK-395 — one place that turns a source file into markdown, whatever it is.
// Markdown is read as-is; an Office document is extracted to markdown first.
// Everything after this point is format-blind.
function _read_source_markdown(source_file) {
  if (!isOfficeFile(source_file)) {
    return { text: fs.readFileSync(source_file, { encoding: "utf8" }), source_format: "markdown" };
  }
  const extracted = extractOfficeMarkdown(source_file);
  return {
    text: extracted.markdown,
    source_format: extracted.format,
    source_truncated: extracted.truncated,
  };
}

function _parse_doc_record(md_file, root) {
  const rel = _display_scan_path(md_file, root);
  const source = _read_source_markdown(md_file);
  const text = source.text;
  const [frontmatter_fields, body_text] = _parse_frontmatter(text);
  const title = String(
    frontmatter_fields["title"] || _extract_title(body_text) ||
    path.basename(md_file, path.extname(md_file)).replace(/_/g, " ").replace(/-/g, " ")
  );
  const headings = _extract_headings(body_text);
  const [issues, knowledge_ids, path_refs_raw] = _extract_references(text);
  const wiki_links = _extract_wiki_links(text);
  const markdown_links = _extract_markdown_links(text);
  const path_refs = [...new Set([...path_refs_raw, ...markdown_links])].sort();
  const family = classify_family(rel);
  const role = classify_role(rel);
  const skill_refs = _extract_skill_refs(text, path_refs, wiki_links);
  const template_refs = _extract_template_refs(path_refs, wiki_links);
  const release_refs = _extract_release_refs(text);
  return {
    id: rel,
    path: rel,
    title,
    family,
    role,
    trust_zone: "medium",
    // Only what cannot be re-derived. The source FORMAT is already in `path`
    // (a .pptx is a deck), so recording it again would add ~47KB to this repo's
    // index for nothing. Whether the cap cut the document is NOT derivable, so
    // that is recorded — and only when it actually happened.
    ...(source.source_truncated ? { source_truncated: true } : {}),
    body_markdown: body_text,
    issues,
    knowledge_ids,
    headings,
    frontmatter_fields,
    skill_refs,
    template_refs,
    release_refs,
    lane_refs: [],
    wiki_links,
    path_refs,
    outgoing_paths: path_refs,
  };
}

// ---------------------------------------------------------------------------
// Incremental build state
// ---------------------------------------------------------------------------
function _empty_atlas_state() {
  return { version: ATLAS_STATE_VERSION, documents: {} };
}

function _atlas_state_path(atlas_dir) {
  return path.join(atlas_dir, "ATLAS_STATE.json");
}

function load_atlas_state(atlas_dir) {
  const state_path = _atlas_state_path(atlas_dir);
  if (!fs.existsSync(state_path)) return _empty_atlas_state();
  try {
    const data = JSON.parse(fs.readFileSync(state_path, "utf8"));
    if (typeof data !== "object" || data === null) return _empty_atlas_state();
    if (data.version !== ATLAS_STATE_VERSION) return _empty_atlas_state();
    if (typeof data.documents !== "object" || data.documents === null) return _empty_atlas_state();
    return { version: ATLAS_STATE_VERSION, generated: data.generated, documents: data.documents };
  } catch (_) {
    return _empty_atlas_state();
  }
}

// BK-324: the cache exists to skip re-PARSING (reference extraction etc.),
// not to duplicate content — doc bodies are dropped at save time and
// rehydrated from the source file on reuse (safe: mtime/hash verified the
// file is unchanged). Cut the state file ~80% on real corpora.
function _slim_state_for_save(state) {
  const documents = {};
  for (const [rel, record] of Object.entries(state.documents || {})) {
    if (record && typeof record === "object" && record.doc && typeof record.doc === "object") {
      const doc = { ...record.doc };
      delete doc.body_markdown;
      documents[rel] = { ...record, doc };
    } else {
      documents[rel] = record;
    }
  }
  return { ...state, documents };
}

function save_atlas_state(state, atlas_dir) {
  fs.mkdirSync(atlas_dir, { recursive: true });
  const state_path = _atlas_state_path(atlas_dir);
  _write_text_lf(state_path, _escapeNonAscii(JSON.stringify(_slim_state_for_save(state), null, 2)));
  return state_path;
}

function _rehydrate_doc_body(doc, md_file) {
  if (doc.body_markdown != null) return doc;
  // Same reader as the first pass, so a reused Office document rehydrates to
  // byte-identical markdown (the hash that authorised the reuse was over the
  // binary, so the extraction is deterministic by construction).
  doc.body_markdown = _parse_frontmatter(_read_source_markdown(md_file).text)[1];
  return doc;
}

function build_docs_incremental(root, atlas_dir, generated, scan_roots, exclude_frags) {
  const prior_state = load_atlas_state(atlas_dir);
  const prior_documents = prior_state.documents || {};
  const scan_result = collect_indexable_markdown_files(root, scan_roots, exclude_frags);
  const current_files = scan_result.files;

  const current_rel_paths = {};
  for (const md_file of current_files) {
    const rel = path.relative(root, md_file).split(path.sep).join("/");
    current_rel_paths[rel] = md_file;
  }

  const next_documents = {};
  const failed_sources = [];
  let reused_count = 0;
  let reparsed_count = 0;

  for (const [rel, md_file] of Object.entries(current_rel_paths)) {
    const stats = fs.statSync(md_file);
    const current_mtime = stats.mtimeMs * 1000000; // ns equivalent
    const prior_record = prior_documents[rel];
    const prior_doc = (prior_record && typeof prior_record === "object") ? prior_record.doc : null;

    if (prior_record && typeof prior_record === "object" && prior_doc &&
        prior_record.mtime === current_mtime) {
      _rehydrate_doc_body(prior_doc, md_file);
      next_documents[rel] = prior_record;
      reused_count++;
      continue;
    }

    const current_hash = _compute_file_hash(md_file);
    if (prior_record && typeof prior_record === "object" && prior_doc &&
        prior_record.hash === current_hash) {
      _rehydrate_doc_body(prior_doc, md_file);
      next_documents[rel] = {
        mtime: current_mtime,
        hash: current_hash,
        last_indexed: prior_record.last_indexed || generated,
        doc: prior_doc,
      };
      reused_count++;
      continue;
    }

    // BK-395: one unreadable source must not fail the build. A corrupt or
    // password-protected Office file is skipped with its reason recorded, the
    // same way an excluded path is — the other 1,700 documents still index.
    let parsed;
    try {
      parsed = _parse_doc_record(md_file, root);
    } catch (err) {
      if (err instanceof OfficeIngestError) {
        failed_sources.push({ path: rel, reason: `${err.code}: ${err.message}` });
        process.stderr.write(`[atlas] Skipped ${rel}: ${err.message}\n`);
        continue;
      }
      throw err;
    }

    next_documents[rel] = {
      mtime: current_mtime,
      hash: current_hash,
      last_indexed: generated,
      doc: parsed,
    };
    reparsed_count++;
  }

  const removed_count = Object.keys(prior_documents).filter((k) => !(k in current_rel_paths)).length;
  const docs = Object.values(next_documents)
    .map((r) => r.doc)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const next_state = {
    version: ATLAS_STATE_VERSION,
    generated,
    documents: next_documents,
  };
  // Sources that failed to parse are skipped, not indexed — so they count
  // against indexed_count and are reported alongside excluded paths.
  const all_skipped = scan_result.skipped_files.concat(failed_sources);
  const build_stats = {
    discovered_count: Object.keys(current_rel_paths).length,
    scanned_count: scan_result.scanned_count,
    indexed_count: Object.keys(next_documents).length,
    skipped_count: all_skipped.length,
    skipped_files: all_skipped,
    reused_count,
    reparsed_count,
    removed_count,
  };
  return [docs, next_state, build_stats];
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------
function _build_doc_alias_map(docs) {
  const alias_map = {};
  for (const doc of docs) {
    const doc_id = doc.id;
    const path_obj = path.parse(doc_id);
    const aliases = new Set([
      doc_id,
      doc_id.toLowerCase(),
      path_obj.base,
      path_obj.base.toLowerCase(),
      path_obj.name,
      path_obj.name.toLowerCase(),
    ]);
    if (doc_id.toLowerCase().endsWith(".md")) {
      const no_ext = doc_id.slice(0, -3);
      const no_ext_base = path.basename(no_ext);
      aliases.add(no_ext);
      aliases.add(no_ext.toLowerCase());
      aliases.add(no_ext_base);
      aliases.add(no_ext_base.toLowerCase());
    }
    for (const alias of aliases) {
      if (!alias_map[alias]) alias_map[alias] = new Set();
      alias_map[alias].add(doc_id);
    }
  }
  return alias_map;
}

function _resolve_doc_reference(raw, alias_map) {
  const normalised = _normalize_internal_ref(raw);
  if (!normalised) return null;
  const candidates = [normalised, normalised.toLowerCase()];
  if (!normalised.toLowerCase().endsWith(".md")) {
    candidates.push(`${normalised}.md`, `${normalised.toLowerCase()}.md`);
  }
  for (const candidate of candidates) {
    const matches = alias_map[candidate];
    if (matches && matches.size === 1) return [...matches][0];
  }
  return null;
}

function build_graph(docs) {
  const alias_map = _build_doc_alias_map(docs);

  const nodes = docs.map((d) => ({
    id: d.id,
    title: d.title,
    family: d.family,
    role: d.role,
    trust_zone: d.trust_zone || "medium",
  }));

  const edges = [];

  for (const doc of docs) {
    const src = doc.id;

    for (const issue of (doc.issues || [])) {
      edges.push({ source: src, target: issue, type: "references_issue", label: issue });
    }
    for (const kid of (doc.knowledge_ids || [])) {
      edges.push({ source: src, target: kid, type: "references_knowledge_object", label: kid });
    }
    for (const rp of (doc.path_refs || doc.outgoing_paths || [])) {
      const target = _resolve_doc_reference(rp, alias_map);
      if (target) edges.push({ source: src, target, type: "references_path", label: rp });
    }
    for (const wiki_ref of (doc.wiki_links || [])) {
      const target = _resolve_doc_reference(wiki_ref, alias_map);
      if (target) edges.push({ source: src, target, type: "references_wiki_link", label: wiki_ref });
    }
    for (const skill_ref of (doc.skill_refs || [])) {
      edges.push({ source: src, target: `__skill__${skill_ref}`, type: "references_skill", label: skill_ref });
    }
    for (const template_ref of (doc.template_refs || [])) {
      edges.push({ source: src, target: `__template__${template_ref}`, type: "references_template", label: template_ref });
    }
  }

  const family_groups = {};
  for (const doc of docs) {
    if (!family_groups[doc.family]) family_groups[doc.family] = [];
    family_groups[doc.family].push(doc.id);
  }
  for (const [family, members] of Object.entries(family_groups)) {
    if (members.length < 2) continue;
    for (const mid of members) {
      edges.push({ source: mid, target: `__family__${family}`, type: "same_family", label: family });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Summary markdown
// ---------------------------------------------------------------------------
function build_summary(docs, graph, generated, stats, root, scan_roots, exclude_frags) {
  const family_counts = {};
  for (const d of docs) family_counts[d.family] = (family_counts[d.family] || 0) + 1;

  const edge_type_counts = {};
  for (const e of graph.edges) edge_type_counts[e.type] = (edge_type_counts[e.type] || 0) + 1;

  const lines = [
    "# SDTK-WIKI Graph Summary",
    "",
    `Generated: ${generated}`,
    `Project root: ${root}`,
    "",
    "## Document Counts",
    "",
    `Total documents indexed: ${docs.length}`,
    "",
    "| Family | Count |",
    "|--------|-------|",
  ];

  const sorted_families = Object.entries(family_counts).sort((a, b) => b[1] - a[1]);
  for (const [fam, cnt] of sorted_families) lines.push(`| ${fam} | ${cnt} |`);

  if (stats !== null && stats !== undefined) {
    lines.push(
      "", "## Incremental Build", "",
      `Discovered source docs: ${stats.discovered_count}`,
      `Scanned source candidates: ${stats.scanned_count !== undefined ? stats.scanned_count : stats.discovered_count}`,
      `Indexed source docs: ${stats.indexed_count !== undefined ? stats.indexed_count : stats.discovered_count}`,
      `Skipped source docs: ${stats.skipped_count || 0}`,
      `Reused cached docs: ${stats.reused_count}`,
      `Reparsed docs: ${stats.reparsed_count}`,
      `Removed stale docs: ${stats.removed_count}`,
    );
    const skipped_files = stats.skipped_files || [];
    if (skipped_files.length) {
      lines.push("", "## Skipped Source Files", "", "| Path | Reason |", "|------|--------|");
      for (const skipped of skipped_files) lines.push(`| ${skipped.path} | ${skipped.reason} |`);
    }
  }

  lines.push("", "## Graph Summary", "",
    `Total nodes: ${graph.nodes.length}`,
    `Total edges: ${graph.edges.length}`,
    "", "## Scan Roots", "");
  for (const sr of scan_roots) lines.push(`- ${sr}`);
  lines.push("", "## Exclusions Applied", "");
  for (const frag of exclude_frags) lines.push(`- ${frag}`);

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Viewer builder
// ---------------------------------------------------------------------------
// BK-321: the doc index/graph are written to a sibling viewer-data.js instead
// of being inlined into viewer.html (which grew to ~28MB on real corpora).
// The viewer already loads ./mermaid.min.js by relative src, so a sibling
// data script works identically under file:// and the atlas server. Top-level
// const bindings in a classic script are visible to later classic scripts,
// so the template's main script keeps using INDEX/GRAPH/FAMILY_COLORS as-is.
function build_viewer_data(index, graph) {
  // String concatenation, not String.replace: replace's string form treats
  // "$&", "$`", "$'", "$$", "$<n>" in doc content as special patterns and
  // spliced garbage into the script (BK-317). Concatenation has no such
  // semantics, so "$"-bearing content is inherently safe here.
  const index_json = _json_for_inline_script(index);
  const graph_json = _json_for_inline_script(graph);
  const family_colors_json = _json_for_inline_script(_FAMILY_COLORS);
  return [
    "// Generated by the SDTK atlas builder — regenerable via `atlas build`, do not edit.",
    "const INDEX = " + index_json + ";",
    "const GRAPH = " + graph_json + ";",
    "const FAMILY_COLORS = " + family_colors_json + ";",
    "",
  ].join("\n");
}

function build_viewer(generated) {
  if (!fs.existsSync(_VIEWER_TEMPLATE_PATH)) {
    throw new Error(`Viewer template not found: ${_VIEWER_TEMPLATE_PATH}`);
  }
  const template = fs.readFileSync(_VIEWER_TEMPLATE_PATH, "utf8");
  // Replacer function per BK-317 discipline (timestamp is "$"-free today, but
  // the string form's special-pattern hazard is not worth re-litigating).
  return template.replace(/__ATLAS_GENERATED__/g, () => generated);
}

function copy_viewer_assets(atlas_dir) {
  if (!fs.existsSync(MERMAID_VENDOR_PATH)) {
    throw new Error(`Missing Mermaid runtime asset: ${MERMAID_VENDOR_PATH}`);
  }
  fs.mkdirSync(atlas_dir, { recursive: true });
  const destination = path.join(atlas_dir, MERMAID_ASSET_NAME);
  fs.copyFileSync(MERMAID_VENDOR_PATH, destination);
  return [destination];
}

// ---------------------------------------------------------------------------
// Wiki pages + provenance
// ---------------------------------------------------------------------------
// BK-326: the workspace root is overridable so hosts with a different
// machine-state home (sdtk-brain uses `.brain/`) don't get a stray
// `.sdtk/wiki` tree leaked into their vault root. sdtk-wiki's default is
// unchanged.
function _wiki_workspace_root(root, workspace_root) {
  return workspace_root ? path.resolve(workspace_root) : path.join(root, ".sdtk", "wiki");
}

function _stable_page_id(source_path) {
  const norm = source_path.replace(/\\/g, "/");
  const digest = crypto.createHash("sha256").update(norm, "utf8").digest("hex");
  return `wiki:${digest.slice(0, 16)}`;
}

function _safe_slug(value) {
  let slug = String(value).trim().toLowerCase();
  slug = slug.replace(/[^a-z0-9]+/g, "-");
  slug = slug.replace(/^-+|-+$/g, "");
  return slug || "page";
}

function _page_relative_path(doc, pages_prefix) {
  const source_path = String(doc.path).replace(/\\/g, "/");
  const source_digest = crypto.createHash("sha256").update(source_path, "utf8").digest("hex").slice(0, 8);
  const slug = _safe_slug(String(doc.title || path.parse(source_path).name));
  const family = _safe_slug(String(doc.family || "other-markdown"));
  return `${pages_prefix || ".sdtk/wiki/pages"}/${family}/${slug}--${source_digest}.md`;
}

function _yaml_quote(value) {
  const text = String(value);
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function _render_generated_page(doc, page_id, source_hash, generated) {
  const frontmatter = [
    "---",
    `schema_version: ${WIKI_PAGE_SCHEMA_VERSION}`,
    'product: "SDTK-WIKI"',
    'managed_by: "sdtk-wiki"',
    `page_id: ${_yaml_quote(page_id)}`,
    `source_path: ${_yaml_quote(doc.path)}`,
    `source_hash: ${_yaml_quote(source_hash)}`,
    `title: ${_yaml_quote(doc.title || "")}`,
    `family: ${_yaml_quote(doc.family || "")}`,
    `role: ${_yaml_quote(doc.role || "")}`,
    `trust_zone: ${_yaml_quote(doc.trust_zone || "medium")}`,
    `generated_at: ${_yaml_quote(generated)}`,
    "---",
    "",
  ];
  let body = String(doc.body_markdown || "");
  if (body && !body.endsWith("\n")) body += "\n";
  return frontmatter.join("\n") + body;
}

function _prior_source_hashes(sources_path) {
  if (!fs.existsSync(sources_path)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(sources_path, "utf8"));
    const sources = payload.sources;
    if (!Array.isArray(sources)) return {};
    const hashes = {};
    for (const record of sources) {
      if (typeof record !== "object" || record === null) continue;
      if (typeof record.sourcePath === "string" && typeof record.sourceHash === "string") {
        hashes[record.sourcePath] = record.sourceHash;
      }
    }
    return hashes;
  } catch (_) {
    return {};
  }
}

function _build_change_set(prior_hashes, current_hashes) {
  const prior_paths = new Set(Object.keys(prior_hashes));
  const current_paths = new Set(Object.keys(current_hashes));
  const added = [...current_paths].filter((p) => !prior_paths.has(p)).sort();
  const removed = [...prior_paths].filter((p) => !current_paths.has(p)).sort();
  const changed = [...current_paths].filter(
    (p) => prior_paths.has(p) && prior_hashes[p] !== current_hashes[p]
  ).sort();
  const unchanged = [...current_paths].filter(
    (p) => prior_paths.has(p) && prior_hashes[p] === current_hashes[p]
  ).sort();
  return { added, changed, unchanged, removed };
}

function write_wiki_pages_and_provenance(docs, state, root, generated, scan_roots, workspaceRoot) {
  const workspace_root = _wiki_workspace_root(root, workspaceRoot);
  const pages_root = path.join(workspace_root, "pages");
  const provenance_root = path.join(workspace_root, "provenance");
  // Page paths are recorded relative to the project root (posix separators)
  // so provenance and _index.md stay portable.
  const pages_prefix = path
    .relative(root, pages_root)
    .split(path.sep)
    .join("/");
  const sources_path = path.join(provenance_root, "sources.json");
  const changes_path = path.join(provenance_root, "changes.json");

  fs.mkdirSync(pages_root, { recursive: true });
  fs.mkdirSync(provenance_root, { recursive: true });

  const prior_hashes = _prior_source_hashes(sources_path);
  const state_docs = (state && typeof state.documents === "object") ? state.documents : {};
  const provenance_records = [];
  const index_rows = [];
  const current_hashes = {};

  const sorted_docs = [...docs].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  for (const doc of sorted_docs) {
    const source_path = String(doc.path).replace(/\\/g, "/");
    const state_record = (state_docs && typeof state_docs === "object") ? state_docs[source_path] : null;
    let source_hash = (state_record && typeof state_record.hash === "string") ? state_record.hash : null;
    if (!source_hash) {
      source_hash = crypto.createHash("sha256").update(source_path, "utf8").digest("hex");
    }
    const page_id = _stable_page_id(source_path);
    const page_rel = _page_relative_path(doc, pages_prefix);
    const page_path = path.join(root, page_rel);

    _assert_inside(workspace_root, page_path);
    fs.mkdirSync(path.dirname(page_path), { recursive: true });
    _write_text_lf(page_path, _render_generated_page(doc, page_id, source_hash, generated));

    current_hashes[source_path] = source_hash;
    provenance_records.push({
      pageId: page_id,
      sourcePath: source_path,
      sourceHash: source_hash,
      pagePath: page_rel,
      graphNodeId: doc.id,
      title: doc.title || "",
      family: doc.family || "",
      role: doc.role || "",
      frontmatter: doc.frontmatter_fields || {},
      headings: doc.headings || [],
      issues: doc.issues || [],
      knowledgeIds: doc.knowledge_ids || [],
      pathRefs: doc.path_refs || [],
      wikiLinks: doc.wiki_links || [],
    });
    index_rows.push([doc.title || source_path, source_path, page_rel, page_id]);
  }

  const index_lines = [
    "# SDTK-WIKI Page Index",
    "",
    `Generated: ${generated}`,
    "",
    "| Title | Source | Page | Page ID |",
    "|---|---|---|---|",
  ];
  const sorted_rows = [...index_rows].sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  for (const [title, source_path, page_rel, page_id] of sorted_rows) {
    index_lines.push(`| ${title} | \`${source_path}\` | \`${page_rel}\` | \`${page_id}\` |`);
  }
  _write_text_lf(path.join(pages_root, "_index.md"), index_lines.join("\n") + "\n");

  const source_payload = {
    schemaVersion: WIKI_PROVENANCE_SCHEMA_VERSION,
    product: "SDTK-WIKI",
    generatedAt: generated,
    projectRoot: root,
    scanRoots: scan_roots,
    sourceCount: provenance_records.length,
    sources: provenance_records,
  };
  _write_text_lf(sources_path, _escapeNonAscii(JSON.stringify(source_payload, null, 2)) + "\n");

  const change_set = _build_change_set(prior_hashes, current_hashes);
  const change_payload = {
    schemaVersion: WIKI_PROVENANCE_SCHEMA_VERSION,
    product: "SDTK-WIKI",
    generatedAt: generated,
    ...change_set,
  };
  _write_text_lf(changes_path, _escapeNonAscii(JSON.stringify(change_payload, null, 2)) + "\n");

  return {
    page_count: provenance_records.length,
    pages_root: pages_root,
    page_index_path: path.join(pages_root, "_index.md"),
    provenance_path: sources_path,
    changes_path,
    changes: change_set,
  };
}

// ---------------------------------------------------------------------------
// Top-level buildAtlas
// ---------------------------------------------------------------------------
async function buildAtlas({ projectRoot, outputDir, scanRoots, excludes, verbose, workspaceRoot, archiveFrags } = {}) {
  const generated = _now_utc();
  const root = path.resolve(projectRoot);
  const atlas_dir = path.resolve(outputDir);
  const frags = (excludes != null) ? excludes : DEFAULT_EXCLUDE_FRAGS;
  const roots = (scanRoots && scanRoots.length) ? scanRoots.map((r) => path.resolve(r)) : [root];

  process.stdout.write(`[atlas] Project root: ${root}\n`);
  process.stdout.write(`[atlas] Output dir: ${atlas_dir}\n`);
  process.stdout.write(`[atlas] Scan roots: ${JSON.stringify(roots)}\n`);

  fs.mkdirSync(atlas_dir, { recursive: true });

  process.stdout.write("[atlas] Scanning source files (md, txt, docx, xlsx, pptx)...\n");
  const [docs, state, stats] = build_docs_incremental(root, atlas_dir, generated, roots, frags);

  // BK-325: archive tier. Applied to EVERY doc after the incremental pass —
  // cache-reused docs carry the trust_zone of the build that cached them, so
  // re-deriving here keeps tiering correct when the config changes without a
  // reparse. Same path-fragment matching semantics as `excludes`.
  const archive_frags = Array.isArray(archiveFrags) ? archiveFrags.filter(Boolean) : [];
  for (const doc of docs) {
    const abs = path.join(root, doc.path);
    doc.trust_zone = archive_frags.length > 0 && _match_exclude(abs, root, archive_frags)
      ? "archive"
      : "medium";
  }

  process.stdout.write(`[atlas] Indexed ${docs.length} documents.\n`);
  process.stdout.write(
    `[atlas] Scan coverage: scanned ${stats.scanned_count !== undefined ? stats.scanned_count : docs.length}, ` +
    `indexed ${stats.indexed_count !== undefined ? stats.indexed_count : docs.length}, ` +
    `skipped ${stats.skipped_count || 0}.\n`
  );
  if (verbose) {
    process.stdout.write(
      `[atlas] Incremental build: reused ${stats.reused_count} cached, ` +
      `reparsed ${stats.reparsed_count}, removed ${stats.removed_count}.\n`
    );
    for (const skipped of (stats.skipped_files || [])) {
      process.stdout.write(`[atlas] Skipped: ${skipped.path} (${skipped.reason})\n`);
    }
  }

  process.stdout.write("[atlas] Building graph...\n");
  const graph = build_graph(docs);
  process.stdout.write(`[atlas] Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges.\n`);

  process.stdout.write("[atlas] Writing wiki pages and provenance...\n");
  const wiki_result = write_wiki_pages_and_provenance(docs, state, root, generated, roots, workspaceRoot);
  process.stdout.write(`[atlas] Wiki pages: ${wiki_result.page_count}\n`);

  const index_data = {
    generated,
    count: docs.length,
    documents: docs,
  };

  save_atlas_state(state, atlas_dir);

  const index_path = path.join(atlas_dir, "SDTK_DOC_INDEX.json");
  _write_text_lf(index_path, _escapeNonAscii(JSON.stringify(index_data, null, 2)));

  const graph_out = {
    generated,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    nodes: graph.nodes,
    edges: graph.edges,
  };
  const graph_path = path.join(atlas_dir, "SDTK_DOC_GRAPH.json");
  _write_text_lf(graph_path, _escapeNonAscii(JSON.stringify(graph_out, null, 2)));

  const summary_text = build_summary(docs, graph, generated, stats, root, roots, frags);
  const summary_path = path.join(atlas_dir, "SDTK_DOC_ATLAS_SUMMARY.md");
  _write_text_lf(summary_path, summary_text);

  const viewer_data_js = build_viewer_data(index_data, graph_out);
  _write_text_lf(path.join(atlas_dir, "viewer-data.js"), viewer_data_js);
  const viewer_html = build_viewer(generated);
  const viewer_path = path.join(atlas_dir, "viewer.html");
  _write_text_lf(viewer_path, viewer_html);

  const copied_assets = copy_viewer_assets(atlas_dir);
  if (verbose) {
    for (const asset_path of copied_assets) {
      process.stdout.write(`[atlas] Wrote asset: ${path.basename(asset_path)}\n`);
    }
  }

  process.stdout.write(`[atlas] Done. Output: ${atlas_dir}\n`);

  const result = {
    generated,
    doc_count: docs.length,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    stats,
    atlas_dir,
    page_count: wiki_result.page_count,
    pages_root: wiki_result.pages_root,
    page_index_path: wiki_result.page_index_path,
    provenance_path: wiki_result.provenance_path,
    changes_path: wiki_result.changes_path,
    changes: wiki_result.changes,
  };

  process.stdout.write(`[atlas:result] ${JSON.stringify(result)}\n`);
  return result;
}

module.exports = {
  buildAtlas,
  // exported for tests
  collect_indexable_markdown_files,
  list_indexable_markdown_files,
  build_docs_incremental,
  classify_family,
  classify_role,
  _parse_doc_record,
  _extract_title,
  _extract_headings,
  _parse_frontmatter,
  _normalize_internal_ref,
  _extract_references,
  _extract_wiki_links,
  _extract_markdown_links,
  _extract_skill_refs,
  _extract_template_refs,
  _extract_release_refs,
  build_graph,
  build_summary,
  build_viewer,
  build_viewer_data,
  write_wiki_pages_and_provenance,
  load_atlas_state,
  save_atlas_state,
  DEFAULT_EXCLUDE_FRAGS,
  ATLAS_STATE_VERSION,
  _json_for_inline_script,
  _stable_page_id,
  _safe_slug,
  _page_relative_path,
};
