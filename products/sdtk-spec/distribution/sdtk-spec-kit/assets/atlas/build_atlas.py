#!/usr/bin/env python3
"""
SDTK-SPEC Atlas Builder -- generic local-project edition.

Scans markdown files under configured scan roots, builds a document index
and graph, and generates a static local viewer.

Usage:
    python build_atlas.py --project-root <path> --output-dir <path>
                          [--scan-root <path> ...] [--exclude <frag> ...]
                          [--verbose]

Outputs (written to <output-dir>/):
    ATLAS_STATE.json           - incremental scan/build state
    SDTK_DOC_INDEX.json        - full document index
    SDTK_DOC_GRAPH.json        - nodes + typed edges
    SDTK_DOC_ATLAS_SUMMARY.md  - human-readable summary
    viewer.html                - static local viewer (data embedded)
    vendor/mermaid.min.js      - vendored viewer asset
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ATLAS_STATE_VERSION = 6
MERMAID_VENDOR_PATH = Path(__file__).parent / "vendor" / "mermaid.min.js"
MERMAID_ASSET_NAME = "mermaid.min.js"
_VIEWER_TEMPLATE_PATH = Path(__file__).parent / "doc_atlas_viewer_template.html"


def _json_for_inline_script(value: Any) -> str:
    return (
        json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        .replace("</", "<\\/")
        .replace("<!--", "<\\!--")
    )

# ---------------------------------------------------------------------------
# Default consumer project exclude fragments
# ---------------------------------------------------------------------------
DEFAULT_EXCLUDE_FRAGS: list[str] = [
    ".git",
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
]

# ---------------------------------------------------------------------------
# Reference patterns
# ---------------------------------------------------------------------------
RE_BK = re.compile(r"\bBK-(\d{3,})\b")
RE_KNOWLEDGE_ID = re.compile(r"\b(KD|KT|KP|KA|KR|KRB|KF)-(\d{4})\b")
RE_REPO_PATH = re.compile(
    r"(?:^|[\s`(\[])([a-zA-Z0-9_\-]+(?:/[a-zA-Z0-9_\-. ]+)+\."
    r"(?:md|py|ps1|json|yaml|yml|html|txt))"
)
RE_WIKI_LINK = re.compile(r"\[\[([^\]]+)\]\]")
RE_MARKDOWN_LINK = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
RE_SKILL_REF = re.compile(r"\b(sdtk-[a-z0-9][a-z0-9-]*)\b")
RE_RELEASE_REF = re.compile(r"\b(?:sdtk-spec-kit@)?(0\.\d+\.\d+)\b")


# ---------------------------------------------------------------------------
# Generic doc-family classifier (project-scope, no maintainer assumptions)
# ---------------------------------------------------------------------------
def classify_family(rel: str) -> str:
    p = rel.replace("\\", "/").lower()
    name = Path(rel).name.lower()
    if p == "readme.md":
        return "root-readme"
    if "backlog" in name:
        return "backlog"
    if "governance" in p:
        return "governance"
    if "docs/specs" in p or "specs/" in p:
        return "spec"
    if "docs/architecture" in p or "architecture/" in p:
        return "architecture"
    if "docs/api" in p or "api/" in p:
        return "api"
    if "docs/qa" in p or "qa/" in p:
        return "qa"
    if "docs/design" in p or "design/" in p:
        return "design"
    if "docs/dev" in p or "dev/" in p:
        return "dev"
    if "docs/product" in p or "product/" in p:
        return "product"
    if "skills" in p:
        return "skill"
    if "templates" in p:
        return "template"
    return "other-markdown"


def classify_role(rel: str) -> str:
    p = rel.replace("\\", "/").lower()
    if "governance" in p:
        return "governance"
    if "spec" in p or "architecture" in p:
        return "spec-artifact"
    if "skill" in p:
        return "skill"
    return "other"


# ---------------------------------------------------------------------------
# Scanner helpers
# ---------------------------------------------------------------------------
def _now_utc() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_text_lf(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")


def _is_excluded(
    path: Path,
    root: Path,
    exclude_frags: list[str],
) -> bool:
    try:
        rel = path.relative_to(root).as_posix().lower()
    except ValueError:
        rel = path.as_posix().lower()
    for frag in exclude_frags:
        norm_frag = frag.replace("\\", "/").lower()
        if norm_frag in rel:
            return True
    return False


def _extract_title(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return ""


def _extract_headings(text: str) -> list[str]:
    headings: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("#"):
            continue
        level = len(stripped) - len(stripped.lstrip("#"))
        if 1 <= level <= 6 and len(stripped) > level and stripped[level] == " ":
            headings.append(stripped[level + 1:].strip())
    return headings


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text

    fields: dict[str, Any] = {}
    current_list_key: str | None = None
    for idx in range(1, len(lines)):
        raw = lines[idx]
        stripped = raw.strip()
        if stripped in {"---", "..."}:
            body = "\n".join(lines[idx + 1:])
            if text.endswith("\n"):
                body += "\n"
            return fields, body
        if not stripped:
            current_list_key = None
            continue
        if stripped.startswith("- ") and current_list_key and isinstance(fields.get(current_list_key), list):
            fields[current_list_key].append(stripped[2:].strip().strip('"\''))
            continue
        if ":" not in raw:
            current_list_key = None
            continue
        key, value = raw.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            current_list_key = None
            continue
        if not value:
            fields[key] = []
            current_list_key = key
            continue
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if inner:
                fields[key] = [part.strip().strip('"\'') for part in inner.split(",") if part.strip()]
            else:
                fields[key] = []
            current_list_key = None
            continue
        fields[key] = value.strip('"\'')
        current_list_key = None

    return {}, text


def _normalize_internal_ref(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""
    value = value.split("|", 1)[0].strip()
    value = value.split("#", 1)[0].strip()
    value = value.replace("\\", "/")
    while value.startswith("./"):
        value = value[2:]
    if value.startswith("/"):
        value = value[1:]
    return value.strip()


def _extract_references(text: str) -> tuple[list[str], list[str], list[str]]:
    issues = sorted(set(f"BK-{m}" for m in RE_BK.findall(text)))
    knowledge_ids = sorted(
        set(f"{m[0]}-{m[1]}" for m in RE_KNOWLEDGE_ID.findall(text))
    )
    raw_paths = RE_REPO_PATH.findall(text)
    paths: list[str] = []
    seen: set[str] = set()
    for rp in raw_paths:
        normalised = _normalize_internal_ref(rp)
        if normalised and normalised not in seen:
            seen.add(normalised)
            paths.append(normalised)
    return issues, knowledge_ids, paths


def _extract_wiki_links(text: str) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    for raw in RE_WIKI_LINK.findall(text):
        normalised = _normalize_internal_ref(raw)
        if normalised and normalised not in seen:
            seen.add(normalised)
            links.append(normalised)
    return links


def _extract_markdown_links(text: str) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    for raw in RE_MARKDOWN_LINK.findall(text):
        target = raw.strip().strip('<>')
        lower = target.lower()
        if not target or lower.startswith(("http://", "https://", "mailto:", "#")) or "://" in target:
            continue
        # Markdown links may include optional titles: [x](path.md "title").
        if ' "' in target:
            target = target.split(' "', 1)[0]
        if " '" in target:
            target = target.split(" '", 1)[0]
        normalised = _normalize_internal_ref(target)
        if normalised and normalised not in seen:
            seen.add(normalised)
            links.append(normalised)
    return links


def _extract_skill_refs(text: str, path_refs: list[str], wiki_links: list[str]) -> list[str]:
    refs = set(match.lower() for match in RE_SKILL_REF.findall(text))
    for ref in path_refs + wiki_links:
        parts = [part for part in ref.split("/") if part]
        for marker in ("skills", "skills-claude"):
            if marker in parts:
                idx = parts.index(marker)
                if idx + 1 < len(parts):
                    refs.add(parts[idx + 1].lower())
    return sorted(refs)


def _extract_template_refs(path_refs: list[str], wiki_links: list[str]) -> list[str]:
    refs: set[str] = set()
    for ref in path_refs + wiki_links:
        norm = _normalize_internal_ref(ref)
        if "/templates/" in f"/{norm}":
            refs.add(norm)
    return sorted(refs)


def _extract_release_refs(text: str) -> list[str]:
    return sorted(set(RE_RELEASE_REF.findall(text)))


def _compute_file_hash(md_file: Path) -> str:
    content = md_file.read_bytes()
    return hashlib.sha256(content).hexdigest()


def _parse_doc_record(md_file: Path, root: Path) -> dict[str, Any]:
    rel = md_file.relative_to(root).as_posix()
    text = md_file.read_text(encoding="utf-8", errors="replace")
    frontmatter_fields, body_text = _parse_frontmatter(text)
    title = str(
        frontmatter_fields.get("title")
        or _extract_title(body_text)
        or md_file.stem.replace("_", " ").replace("-", " ")
    )
    headings = _extract_headings(body_text)
    issues, knowledge_ids, path_refs = _extract_references(text)
    wiki_links = _extract_wiki_links(text)
    markdown_links = _extract_markdown_links(text)
    path_refs = sorted(set(path_refs + markdown_links))
    family = classify_family(rel)
    role = classify_role(rel)
    skill_refs = _extract_skill_refs(text, path_refs, wiki_links)
    template_refs = _extract_template_refs(path_refs, wiki_links)
    release_refs = _extract_release_refs(text)
    return {
        "id": rel,
        "path": rel,
        "title": title,
        "family": family,
        "role": role,
        "trust_zone": "medium",
        "body_markdown": body_text,
        "issues": issues,
        "knowledge_ids": knowledge_ids,
        "headings": headings,
        "frontmatter_fields": frontmatter_fields,
        "skill_refs": skill_refs,
        "template_refs": template_refs,
        "release_refs": release_refs,
        "lane_refs": [],
        "wiki_links": wiki_links,
        "path_refs": path_refs,
        "outgoing_paths": path_refs,
    }


def list_indexable_markdown_files(
    root: Path,
    scan_roots: list[Path],
    exclude_frags: list[str],
) -> list[Path]:
    files: list[Path] = []
    seen_paths: set[str] = set()

    for scan_root in scan_roots:
        if not scan_root.exists():
            print(f"[atlas] Warning: scan root does not exist, skipping: {scan_root}", file=sys.stderr)
            continue
        if scan_root.is_file() and scan_root.suffix.lower() == ".md":
            candidates = [scan_root]
        elif scan_root.is_dir():
            candidates = [p for p in sorted(scan_root.rglob("*.md")) if p.is_file()]
        else:
            candidates = []

        for md_file in candidates:
            if _is_excluded(md_file, root=root, exclude_frags=exclude_frags):
                continue
            try:
                rel = md_file.relative_to(root).as_posix()
            except ValueError:
                rel = md_file.as_posix()
            if rel in seen_paths:
                continue
            seen_paths.add(rel)
            files.append(md_file)

    files.sort(key=lambda p: p.as_posix())
    return files


# ---------------------------------------------------------------------------
# Incremental build
# ---------------------------------------------------------------------------
def _empty_atlas_state() -> dict[str, Any]:
    return {"version": ATLAS_STATE_VERSION, "documents": {}}


def _atlas_state_path(atlas_dir: Path) -> Path:
    return atlas_dir / "ATLAS_STATE.json"


def load_atlas_state(atlas_dir: Path) -> dict[str, Any]:
    state_path = _atlas_state_path(atlas_dir)
    if not state_path.exists():
        return _empty_atlas_state()
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty_atlas_state()
    if not isinstance(data, dict):
        return _empty_atlas_state()
    if data.get("version") != ATLAS_STATE_VERSION:
        return _empty_atlas_state()
    documents = data.get("documents")
    if not isinstance(documents, dict):
        return _empty_atlas_state()
    return {"version": ATLAS_STATE_VERSION, "generated": data.get("generated"), "documents": documents}


def save_atlas_state(state: dict[str, Any], atlas_dir: Path) -> Path:
    atlas_dir.mkdir(parents=True, exist_ok=True)
    state_path = _atlas_state_path(atlas_dir)
    _write_text_lf(state_path, json.dumps(state, ensure_ascii=True, indent=2, sort_keys=False))
    return state_path


def build_docs_incremental(
    root: Path,
    atlas_dir: Path,
    generated: str,
    scan_roots: list[Path],
    exclude_frags: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, int]]:
    prior_state = load_atlas_state(atlas_dir)
    prior_documents = prior_state.get("documents", {})
    current_files = list_indexable_markdown_files(root, scan_roots, exclude_frags)

    current_rel_paths = {}
    for md_file in current_files:
        try:
            rel = md_file.relative_to(root).as_posix()
        except ValueError:
            rel = md_file.as_posix()
        current_rel_paths[rel] = md_file

    next_documents: dict[str, Any] = {}
    reused_count = 0
    reparsed_count = 0

    for rel, md_file in current_rel_paths.items():
        stats = md_file.stat()
        current_mtime = stats.st_mtime_ns
        prior_record = prior_documents.get(rel)
        prior_doc = prior_record.get("doc") if isinstance(prior_record, dict) else None

        if (
            isinstance(prior_record, dict)
            and isinstance(prior_doc, dict)
            and prior_record.get("mtime") == current_mtime
        ):
            next_documents[rel] = prior_record
            reused_count += 1
            continue

        current_hash = _compute_file_hash(md_file)
        if (
            isinstance(prior_record, dict)
            and isinstance(prior_doc, dict)
            and prior_record.get("hash") == current_hash
        ):
            next_documents[rel] = {
                "mtime": current_mtime,
                "hash": current_hash,
                "last_indexed": prior_record.get("last_indexed") or generated,
                "doc": prior_doc,
            }
            reused_count += 1
            continue

        next_documents[rel] = {
            "mtime": current_mtime,
            "hash": current_hash,
            "last_indexed": generated,
            "doc": _parse_doc_record(md_file, root=root),
        }
        reparsed_count += 1

    removed_count = len(set(prior_documents.keys()) - set(current_rel_paths.keys()))
    docs = sorted(
        [record["doc"] for record in next_documents.values()],
        key=lambda d: d["id"],
    )
    next_state = {
        "version": ATLAS_STATE_VERSION,
        "generated": generated,
        "documents": next_documents,
    }
    build_stats = {
        "discovered_count": len(current_rel_paths),
        "reused_count": reused_count,
        "reparsed_count": reparsed_count,
        "removed_count": removed_count,
    }
    return docs, next_state, build_stats


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------
def _build_doc_alias_map(docs: list[dict[str, Any]]) -> dict[str, set[str]]:
    alias_map: dict[str, set[str]] = {}
    for doc in docs:
        doc_id = doc["id"]
        path_obj = Path(doc_id)
        aliases = {
            doc_id,
            doc_id.lower(),
            path_obj.name,
            path_obj.name.lower(),
            path_obj.stem,
            path_obj.stem.lower(),
        }
        if doc_id.lower().endswith(".md"):
            no_ext = doc_id[:-3]
            no_ext_path = Path(no_ext)
            aliases.update({no_ext, no_ext.lower(), no_ext_path.name, no_ext_path.name.lower()})
        for alias in aliases:
            alias_map.setdefault(alias, set()).add(doc_id)
    return alias_map


def _resolve_doc_reference(raw: str, alias_map: dict[str, set[str]]) -> str | None:
    normalised = _normalize_internal_ref(raw)
    if not normalised:
        return None
    candidates = [normalised, normalised.lower()]
    if not normalised.lower().endswith(".md"):
        candidates.extend([f"{normalised}.md", f"{normalised.lower()}.md"])
    for candidate in candidates:
        matches = alias_map.get(candidate)
        if matches and len(matches) == 1:
            return next(iter(matches))
    return None


def build_graph(docs: list[dict[str, Any]]) -> dict[str, Any]:
    alias_map = _build_doc_alias_map(docs)

    nodes = [
        {
            "id": d["id"],
            "title": d["title"],
            "family": d["family"],
            "role": d["role"],
            "trust_zone": d.get("trust_zone", "medium"),
        }
        for d in docs
    ]

    edges: list[dict[str, Any]] = []

    for doc in docs:
        src = doc["id"]

        for issue in doc.get("issues", []):
            edges.append({"source": src, "target": issue, "type": "references_issue", "label": issue})

        for kid in doc.get("knowledge_ids", []):
            edges.append({"source": src, "target": kid, "type": "references_knowledge_object", "label": kid})

        for rp in doc.get("path_refs", doc.get("outgoing_paths", [])):
            target = _resolve_doc_reference(rp, alias_map)
            if target:
                edges.append({"source": src, "target": target, "type": "references_path", "label": rp})

        for wiki_ref in doc.get("wiki_links", []):
            target = _resolve_doc_reference(wiki_ref, alias_map)
            if target:
                edges.append({"source": src, "target": target, "type": "references_wiki_link", "label": wiki_ref})

        for skill_ref in doc.get("skill_refs", []):
            edges.append({"source": src, "target": f"__skill__{skill_ref}", "type": "references_skill", "label": skill_ref})

        for template_ref in doc.get("template_refs", []):
            edges.append({"source": src, "target": f"__template__{template_ref}", "type": "references_template", "label": template_ref})

    family_groups: dict[str, list[str]] = {}
    for doc in docs:
        family_groups.setdefault(doc["family"], []).append(doc["id"])
    for family, members in family_groups.items():
        if len(members) < 2:
            continue
        for mid in members:
            edges.append({"source": mid, "target": f"__family__{family}", "type": "same_family", "label": family})

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Summary markdown
# ---------------------------------------------------------------------------
def build_summary(
    docs: list[dict[str, Any]],
    graph: dict[str, Any],
    generated: str,
    stats: dict[str, int] | None,
    root: Path,
    scan_roots: list[Path],
    exclude_frags: list[str],
) -> str:
    family_counts: dict[str, int] = {}
    for d in docs:
        family_counts[d["family"]] = family_counts.get(d["family"], 0) + 1

    edge_type_counts: dict[str, int] = {}
    for e in graph["edges"]:
        et = e["type"]
        edge_type_counts[et] = edge_type_counts.get(et, 0) + 1

    lines: list[str] = [
        "# Document Atlas Summary",
        "",
        f"Generated: {generated}",
        f"Project root: {root}",
        "",
        "## Document Counts",
        "",
        f"Total documents indexed: {len(docs)}",
        "",
        "| Family | Count |",
        "|--------|-------|",
    ]
    for fam, cnt in sorted(family_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| {fam} | {cnt} |")

    if stats is not None:
        lines += [
            "",
            "## Incremental Build",
            "",
            f"Discovered markdown docs: {stats['discovered_count']}",
            f"Reused cached docs: {stats['reused_count']}",
            f"Reparsed docs: {stats['reparsed_count']}",
            f"Removed stale docs: {stats['removed_count']}",
        ]

    lines += [
        "",
        "## Graph Summary",
        "",
        f"Total nodes: {len(graph['nodes'])}",
        f"Total edges: {len(graph['edges'])}",
        "",
        "## Scan Roots",
        "",
    ]
    for sr in scan_roots:
        lines.append(f"- {sr}")

    lines += [
        "",
        "## Exclusions Applied",
        "",
    ]
    for frag in exclude_frags:
        lines.append(f"- {frag}")

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Static viewer
# ---------------------------------------------------------------------------
_FAMILY_COLORS = {
    "governance": "#58a6ff",
    "backlog": "#d2a8ff",
    "spec": "#f0883e",
    "architecture": "#3fb950",
    "api": "#f778ba",
    "qa": "#79c0ff",
    "design": "#ffa657",
    "dev": "#56d364",
    "product": "#e3b341",
    "skill": "#58a6ff",
    "template": "#f0883e",
    "root-readme": "#e3b341",
    "other-markdown": "#8b949e",
}


def build_viewer(index: dict, graph: dict, generated: str) -> str:
    if not _VIEWER_TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Viewer template not found: {_VIEWER_TEMPLATE_PATH}")
    index_json = _json_for_inline_script(index)
    graph_json = _json_for_inline_script(graph)
    family_colors_json = _json_for_inline_script(_FAMILY_COLORS)
    template = _VIEWER_TEMPLATE_PATH.read_text(encoding="utf-8")
    return (
        template
        .replace("__ATLAS_GENERATED__", generated)
        .replace("__ATLAS_INDEX_JSON__", index_json)
        .replace("__ATLAS_GRAPH_JSON__", graph_json)
        .replace("__ATLAS_FAMILY_COLORS_JSON__", family_colors_json)
    )


def copy_viewer_assets(atlas_dir: Path) -> list[Path]:
    if not MERMAID_VENDOR_PATH.exists():
        raise FileNotFoundError(f"Missing Mermaid runtime asset: {MERMAID_VENDOR_PATH}")
    atlas_dir.mkdir(parents=True, exist_ok=True)
    # Copy mermaid to atlas root (same location the viewer template expects)
    destination = atlas_dir / MERMAID_ASSET_NAME
    shutil.copyfile(MERMAID_VENDOR_PATH, destination)
    return [destination]


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------
def build_atlas(
    root: Path,
    atlas_dir: Path,
    scan_roots: list[Path] | None = None,
    exclude_frags: list[str] | None = None,
    verbose: bool = False,
) -> dict[str, Any]:
    generated = _now_utc()
    frags = exclude_frags if exclude_frags is not None else DEFAULT_EXCLUDE_FRAGS
    roots = scan_roots if scan_roots else [root]

    print(f"[atlas] Project root: {root}")
    print(f"[atlas] Output dir: {atlas_dir}")
    print(f"[atlas] Scan roots: {[str(r) for r in roots]}")

    atlas_dir.mkdir(parents=True, exist_ok=True)

    print("[atlas] Scanning markdown files...")
    docs, state, stats = build_docs_incremental(
        root=root,
        atlas_dir=atlas_dir,
        generated=generated,
        scan_roots=roots,
        exclude_frags=frags,
    )
    print(f"[atlas] Indexed {len(docs)} documents.")
    if verbose:
        print(
            f"[atlas] Incremental build: reused {stats['reused_count']} cached, "
            f"reparsed {stats['reparsed_count']}, removed {stats['removed_count']}."
        )

    print("[atlas] Building graph...")
    graph = build_graph(docs)
    print(f"[atlas] Graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges.")

    index_data = {
        "generated": generated,
        "count": len(docs),
        "documents": docs,
    }

    save_atlas_state(state, atlas_dir=atlas_dir)

    index_path = atlas_dir / "SDTK_DOC_INDEX.json"
    _write_text_lf(index_path, json.dumps(index_data, ensure_ascii=True, indent=2, sort_keys=False))

    graph_out = {
        "generated": generated,
        "node_count": len(graph["nodes"]),
        "edge_count": len(graph["edges"]),
        "nodes": graph["nodes"],
        "edges": graph["edges"],
    }
    graph_path = atlas_dir / "SDTK_DOC_GRAPH.json"
    _write_text_lf(graph_path, json.dumps(graph_out, ensure_ascii=True, indent=2, sort_keys=False))

    summary_text = build_summary(docs, graph, generated, stats=stats, root=root, scan_roots=roots, exclude_frags=frags)
    summary_path = atlas_dir / "SDTK_DOC_ATLAS_SUMMARY.md"
    _write_text_lf(summary_path, summary_text)

    viewer_html = build_viewer(index_data, graph_out, generated)
    viewer_path = atlas_dir / "viewer.html"
    _write_text_lf(viewer_path, viewer_html)

    for asset_path in copy_viewer_assets(atlas_dir=atlas_dir):
        if verbose:
            print(f"[atlas] Wrote asset: {asset_path.name}")

    print(f"[atlas] Done. Output: {atlas_dir}")
    return {
        "generated": generated,
        "doc_count": len(docs),
        "node_count": len(graph["nodes"]),
        "edge_count": len(graph["edges"]),
        "stats": stats,
        "atlas_dir": str(atlas_dir),
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="SDTK-SPEC Atlas Builder -- build a local document graph and viewer.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--project-root",
        required=True,
        help="Absolute path to the project root to scan.",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory to write atlas artifacts into.",
    )
    parser.add_argument(
        "--scan-root",
        dest="scan_roots",
        action="append",
        metavar="PATH",
        default=None,
        help="Explicit scan root (repeatable). Defaults to project root.",
    )
    parser.add_argument(
        "--exclude",
        dest="excludes",
        action="append",
        metavar="FRAG",
        default=None,
        help="Exclusion path fragment (repeatable). Defaults to standard set.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        default=False,
        help="Show incremental build detail.",
    )

    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    if not root.is_dir():
        print(f"[atlas] ERROR: --project-root is not a directory: {root}", file=sys.stderr)
        return 1

    atlas_dir = Path(args.output_dir).resolve()

    scan_roots: list[Path] | None = None
    if args.scan_roots:
        scan_roots = [Path(sr).resolve() for sr in args.scan_roots]

    excludes: list[str] | None = None
    if args.excludes:
        excludes = args.excludes

    try:
        result = build_atlas(
            root=root,
            atlas_dir=atlas_dir,
            scan_roots=scan_roots,
            exclude_frags=excludes,
            verbose=args.verbose,
        )
        # Print JSON summary to stdout for Node CLI to parse
        print(f"[atlas:result] {json.dumps(result)}")
        return 0
    except FileNotFoundError as e:
        print(f"[atlas] ERROR: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"[atlas] ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
