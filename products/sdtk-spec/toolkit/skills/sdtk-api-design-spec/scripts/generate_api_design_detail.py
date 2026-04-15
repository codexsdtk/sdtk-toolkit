#!/usr/bin/env python3
"""
Generate [FEATURE_KEY]_API_DESIGN_DETAIL.md from OpenAPI YAML and flow list.

This script follows API_DESIGN_FLOWCHART_CREATION_RULES.md and produces:
- Markdown detail spec
- Per-endpoint .puml files
- Per-endpoint .svg flow images (if PlantUML render is available)
"""

from __future__ import annotations

import argparse
import copy
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import yaml


HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate API design detail markdown from YAML + flow list.")
    parser.add_argument("--feature-key", required=True, help="Feature key, e.g. WORK_PLANNING_BOARD")
    parser.add_argument("--yaml", required=True, help="Path to OpenAPI YAML")
    parser.add_argument("--flow-list", required=True, help="Path to API flow list txt containing PlantUML blocks")
    parser.add_argument("--output", required=True, help="Output markdown path, e.g. docs/api/[FEATURE_KEY]_API_DESIGN_DETAIL.md")
    parser.add_argument("--flows-dir", default="docs/api/flows", help="Directory for generated .puml files")
    parser.add_argument("--images-dir", default="docs/api/images", help="Directory for rendered .svg files")
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        help='Optional filter. Repeatable. Format: "METHOD /path" or "/path"',
    )
    parser.add_argument("--plantuml-jar", default="", help="Optional explicit path to plantuml.jar")
    parser.add_argument("--skip-render", action="store_true", help="Skip SVG rendering step")
    return parser.parse_args()


def load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def normalize_feature_snake(feature_key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", feature_key.lower()).strip("_")


def collect_server_prefixes(spec: dict) -> List[str]:
    prefixes: List[str] = []
    for server in spec.get("servers", []) or []:
        url = str((server or {}).get("url", "")).strip()
        if not url:
            continue
        if "://" in url:
            match = re.match(r"https?://[^/]+(?P<path>/.*)?", url)
            url = match.group("path") if match and match.group("path") else "/"
        if not url.startswith("/"):
            continue
        normalized = re.sub(r"/{2,}", "/", url).rstrip("/")
        if normalized:
            prefixes.append(normalized)
    return sorted(set(prefixes), key=len, reverse=True)


def normalize_match_path(path: str, server_prefixes: List[str]) -> str:
    normalized = path.strip()
    if "://" in normalized:
        match = re.match(r"https?://[^/]+(?P<path>/.*)?", normalized)
        normalized = match.group("path") if match and match.group("path") else "/"
    normalized = normalized.split("?", maxsplit=1)[0].strip()
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    normalized = re.sub(r"/{2,}", "/", normalized)

    for prefix in server_prefixes:
        if normalized == prefix:
            normalized = "/"
            break
        if normalized.startswith(prefix + "/"):
            normalized = normalized[len(prefix) :]
            break

    if not normalized.startswith("/"):
        normalized = "/" + normalized
    if len(normalized) > 1:
        normalized = normalized.rstrip("/")
    normalized = re.sub(r"\{[^/]+\}", "{}", normalized)
    return normalized


def parse_include_filters(raw_filters: List[str]) -> List[Tuple[Optional[str], str]]:
    parsed: List[Tuple[Optional[str], str]] = []
    for raw in raw_filters:
        text = raw.strip()
        if not text:
            continue
        parts = text.split(maxsplit=1)
        if len(parts) == 1:
            if not parts[0].startswith("/"):
                raise ValueError(f"Invalid --include format: {raw}")
            parsed.append((None, parts[0]))
            continue
        method = parts[0].lower().strip()
        path = parts[1].strip()
        if method not in HTTP_METHODS:
            raise ValueError(f"Invalid HTTP method in --include: {raw}")
        if not path.startswith("/"):
            raise ValueError(f"Path must start with '/' in --include: {raw}")
        parsed.append((method, path))
    return parsed


def match_include(method: str, path: str, filters: List[Tuple[Optional[str], str]]) -> bool:
    if not filters:
        return True
    for f_method, f_path in filters:
        if f_path != path:
            continue
        if f_method is None or f_method == method:
            return True
    return False


def collect_operations(spec: dict, include_filters: List[Tuple[Optional[str], str]]) -> List[Tuple[str, str, dict]]:
    operations: List[Tuple[str, str, dict]] = []
    for path, path_item in spec.get("paths", {}).items():
        for method, op in path_item.items():
            m = method.lower()
            if m not in HTTP_METHODS:
                continue
            if not match_include(m, path, include_filters):
                continue
            operations.append((m, path, op))
    return operations


def extract_flow_signature(block: str, server_prefixes: List[str]) -> Tuple[Optional[str], Optional[str]]:
    patterns = [
        r'partition\s+"API:\s*([A-Z]+)\s+(\S+)(?:\s{2,}.*?)?"\s*\{',
        r'partition\s+"([A-Z]+)\s+\*\*(.*?)\*\*',
        r'partition\s+"API:\s*([A-Z]+)\s+\*\*(.*?)\*\*',
    ]
    for pattern in patterns:
        match = re.search(pattern, block)
        if not match:
            continue
        method = match.group(1).lower().strip()
        path = normalize_match_path(match.group(2), server_prefixes)
        return method, path
    return None, None


def collect_flow_blocks(flow_text: str, server_prefixes: List[str]) -> List[Tuple[Optional[str], Optional[str], str]]:
    blocks_with_meta: List[Tuple[Optional[str], Optional[str], str]] = []
    blocks = re.findall(r"@startuml[\s\S]*?@enduml", flow_text)
    for block in blocks:
        sanitized = re.sub(r";<<#[^>]+>>", ";", block.strip())
        method, path = extract_flow_signature(sanitized, server_prefixes)
        blocks_with_meta.append((method, path, sanitized + "\n"))
    return blocks_with_meta


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.lower())
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def resolve_ref(spec: dict, ref: str):
    if not ref.startswith("#/components/"):
        raise ValueError(f"Unsupported ref: {ref}")
    cur = spec
    for p in ref.lstrip("#/").split("/"):
        cur = cur[p]
    return copy.deepcopy(cur)


def deref(spec: dict, obj):
    if isinstance(obj, dict) and "$ref" in obj:
        base = deref(spec, resolve_ref(spec, obj["$ref"]))
        merged = copy.deepcopy(base)
        for k, v in obj.items():
            if k == "$ref":
                continue
            merged[k] = deref(spec, v)
        return merged
    if isinstance(obj, dict):
        return {k: deref(spec, v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [deref(spec, v) for v in obj]
    return obj


def normalize_schema(spec: dict, schema):
    s = deref(spec, schema)
    if not isinstance(s, dict):
        return {}
    if "allOf" in s:
        merged: Dict = {}
        merged_required: List[str] = []
        merged_props: Dict = {}
        for part in s["allOf"]:
            p = normalize_schema(spec, part)
            for k in ("type", "description", "format", "nullable", "default", "enum", "additionalProperties"):
                if k in p and k not in merged:
                    merged[k] = p[k]
            for req in p.get("required", []):
                if req not in merged_required:
                    merged_required.append(req)
            for prop_k, prop_v in p.get("properties", {}).items():
                merged_props[prop_k] = prop_v
            if "items" in p:
                merged["items"] = p["items"]
        if merged_required:
            merged["required"] = merged_required
        if merged_props:
            merged["properties"] = merged_props
        rest = {k: v for k, v in s.items() if k != "allOf"}
        merged.update(rest)
        s = merged
    return s


def schema_type(spec: dict, schema) -> str:
    s = normalize_schema(spec, schema)
    t = s.get("type")
    if not t:
        if "properties" in s:
            t = "object"
        elif "items" in s:
            t = "array"
        elif s.get("additionalProperties"):
            t = "object"
        else:
            t = "object"
    if t == "array":
        items = normalize_schema(spec, s.get("items", {}))
        it = items.get("type", "object")
        return f"array<{it}>"
    return str(t)


def schema_notes(spec: dict, schema) -> str:
    s = normalize_schema(spec, schema)
    notes: List[str] = []
    desc = s.get("description")
    if desc:
        notes.append(str(desc).replace("\n", " ").strip())
    if "enum" in s:
        notes.append("enum(" + ",".join(map(str, s["enum"])) + ")")
    if "default" in s:
        notes.append(f"default={s['default']}")
    if s.get("nullable") is True:
        notes.append("nullable")
    if s.get("additionalProperties") is True:
        notes.append("additionalProperties=true")
    return "; ".join(notes)


def schema_format(spec: dict, schema) -> str:
    s = normalize_schema(spec, schema)
    return str(s.get("format", "")) if s.get("format") is not None else ""


def schema_length(spec: dict, schema) -> str:
    fmt = schema_format(spec, schema)
    if fmt == "uuid":
        return "36"
    return ""


def flatten_schema(spec: dict, schema) -> List[dict]:
    root = normalize_schema(spec, schema)
    rows: List[dict] = []

    def walk(node, prefix: List[str]):
        n = normalize_schema(spec, node)
        props = n.get("properties", {})
        required = set(n.get("required", []))
        for key, value in props.items():
            v = normalize_schema(spec, value)
            levels = prefix + [key]
            rows.append(
                {
                    "levels": levels,
                    "type": schema_type(spec, v),
                    "format": schema_format(spec, v),
                    "length": schema_length(spec, v),
                    "required": "Yes" if key in required else "No",
                    "notes": schema_notes(spec, v),
                }
            )
            t = v.get("type")
            if t == "object" or "properties" in v:
                if v.get("properties"):
                    walk(v, levels)
            elif t == "array":
                items = normalize_schema(spec, v.get("items", {}))
                if items.get("type") == "object" or items.get("properties"):
                    walk(items, levels)

    walk(root, [])
    return rows


def table(headers: List[str], rows: List[str]) -> str:
    line1 = "| " + " | ".join(headers) + " |"
    line2 = "|" + "|".join([" ---: " if i == 0 else " --- " for i, _ in enumerate(headers)]) + "|"
    return "\n".join([line1, line2] + rows)


def request_row(idx: int, row: dict) -> str:
    item_name = row["levels"][-1] if row["levels"] else ""
    levels = row["levels"][:6] + [""] * (6 - len(row["levels"][:6]))
    cols = [
        str(idx),
        item_name,
        levels[0],
        levels[1],
        levels[2],
        levels[3],
        levels[4],
        levels[5],
        row["type"],
        row["format"],
        row["length"],
        row["required"],
        row["notes"],
    ]
    return "| " + " | ".join(cols) + " |"


def response_row(idx: int, row: dict) -> str:
    item_name = row["levels"][-1] if row["levels"] else ""
    levels = row["levels"][:6] + [""] * (6 - len(row["levels"][:6]))
    cols = [
        str(idx),
        item_name,
        levels[0],
        levels[1],
        levels[2],
        levels[3],
        levels[4],
        levels[5],
        row["type"],
        row["notes"],
    ]
    return "| " + " | ".join(cols) + " |"


def get_request_schema(spec: dict, op: dict):
    rb = op.get("requestBody")
    if not rb:
        return None
    rb = deref(spec, rb)
    return (((rb.get("content") or {}).get("application/json") or {}).get("schema"))


def get_response_schema(spec: dict, op: dict, code: str):
    resp = (op.get("responses") or {}).get(code)
    if not resp:
        return None
    resp = deref(spec, resp)
    return (((resp.get("content") or {}).get("application/json") or {}).get("schema"))


def get_parameters(spec: dict, path_item: dict, op: dict) -> List[dict]:
    out: List[dict] = []
    for p in path_item.get("parameters", []):
        out.append(deref(spec, p))
    for p in op.get("parameters", []):
        out.append(deref(spec, p))
    return out


def parse_description_sections(text: str) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {"process_flow": [], "notes": [], "login": []}
    current: Optional[str] = None
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.startswith("## "):
            key = stripped[3:].strip().lower()
            if key == "process flow":
                current = "process_flow"
            elif key == "notes":
                current = "notes"
            elif key == "login":
                current = "login"
            else:
                current = None
            continue
        if current is None:
            continue
        if current == "process_flow" and raw.startswith(" ") and stripped.startswith("- ") and sections[current]:
            continuation = re.sub(r"^-\s*", "", stripped).strip()
            if continuation:
                sections[current][-1] = sections[current][-1] + f" {continuation}"
            continue
        normalized = re.sub(r"^\d+\.\s*", "", stripped)
        normalized = re.sub(r"^-\s*", "", normalized)
        normalized = normalized.strip()
        if normalized:
            sections[current].append(normalized)
    return sections


def collect_error_cases(flow_text: str) -> List[Tuple[int, str]]:
    cases: Dict[int, List[str]] = {}
    for raw in flow_text.splitlines():
        line = raw.strip()
        m = re.search(r"Return error status =\s*(\d+)\s*\((.*?)\)", line)
        if m:
            code = int(m.group(1))
            reason = m.group(2).strip().rstrip(".;")
            cases.setdefault(code, [])
            if reason and reason not in cases[code]:
                cases[code].append(reason)
        if "Return business duplicate status" in line:
            cases.setdefault(100, [])
            reason = "duplicate/business rule rejection"
            if reason not in cases[100]:
                cases[100].append(reason)
    ordered: List[Tuple[int, str]] = []
    for code in sorted(cases.keys()):
        ordered.append((code, "; ".join(cases[code])))
    return ordered


def find_plantuml_jar(explicit: str) -> Optional[Path]:
    if explicit:
        p = Path(explicit).expanduser().resolve()
        return p if p.exists() else None

    user_home = Path.home()
    candidates = sorted((user_home / ".vscode" / "extensions").glob("jebbs.plantuml-*/plantuml.jar"))
    if candidates:
        return candidates[-1]
    return None


def render_svgs(plantuml_jar: Path, puml_files: List[Path], images_dir: Path) -> List[str]:
    errors: List[str] = []
    for puml in puml_files:
        proc = subprocess.run(
            ["java", "-jar", str(plantuml_jar), "-tsvg", str(puml)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
        )
        svg_src = puml.with_suffix(".svg")
        svg_dst = images_dir / svg_src.name
        if not svg_src.exists():
            errors.append(f"Render failed (no svg): {puml}")
            continue
        shutil.copy2(svg_src, svg_dst)
        svg_src.unlink(missing_ok=True)

        svg_text = svg_dst.read_text(encoding="utf-8", errors="ignore")
        if any(x in svg_text for x in ("Cannot find group", "Syntax Error", "Some diagram description contains errors")):
            errors.append(f"Rendered with error content: {svg_dst}")
        if proc.returncode != 0:
            # Keep file if generated, but still report CLI failure.
            errors.append(f"PlantUML exit={proc.returncode} for {puml}")
    return errors


def main() -> int:
    args = parse_args()

    feature_key = args.feature_key.strip()
    if not feature_key:
        raise ValueError("feature-key is empty")
    feature_snake = normalize_feature_snake(feature_key)

    yaml_path = Path(args.yaml)
    flow_path = Path(args.flow_list)
    output_path = Path(args.output)
    flows_dir = Path(args.flows_dir)
    images_dir = Path(args.images_dir)

    spec = load_yaml(yaml_path)
    server_prefixes = collect_server_prefixes(spec)
    include_filters = parse_include_filters(args.include)
    operations = collect_operations(spec, include_filters)
    if not operations:
        raise RuntimeError("No API operations selected from YAML")

    flow_blocks = collect_flow_blocks(flow_path.read_text(encoding="utf-8"), server_prefixes)
    flow_map: Dict[Tuple[str, str], str] = {}
    for block_method, block_path, block_text in flow_blocks:
        if block_method and block_path and (block_method, block_path) not in flow_map:
            flow_map[(block_method, block_path)] = block_text
    missing_flows: List[str] = []
    order_fallbacks: List[str] = []

    flows_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    lines: List[str] = []
    lines.append(f"# {feature_key} API DESIGN DETAIL")
    lines.append("")
    lines.append("## 0. Abbreviations")
    lines.append("")
    lines.append("| No | Term | Meaning |")
    lines.append("| ---: | --- | --- |")
    lines.append("| 1 | API | Application Programming Interface |")
    lines.append("| 2 | UUID | Universally Unique Identifier |")
    lines.append("| 3 | FE | Frontend |")
    lines.append("| 4 | BE | Backend |")
    lines.append("| 5 | DT | Datetime |")
    lines.append("")
    lines.append("## 1. Document Scope")
    lines.append("")
    lines.append("| No | Method | Endpoint | Reference Template |")
    lines.append("| ---: | --- | --- | --- |")
    for i, (method, path, _op) in enumerate(operations, 1):
        lines.append(f"| {i} | {method.upper()} | `{path}` | `API_design.xlsx` style |")
    lines.append("")

    puml_files: List[Path] = []

    for i, (method, path, op) in enumerate(operations, 1):
        section_no = i + 1
        title = str(op.get("summary", f"{method.upper()} {path}")).strip()
        slug = f"{feature_snake}__{method}_{slugify(path)}"
        puml_name = f"{slug}.puml"
        svg_name = f"{slug}.svg"
        puml_path = flows_dir / puml_name
        svg_path = images_dir / svg_name
        svg_rel = Path(os.path.relpath(svg_path, output_path.parent))
        desc_sections = parse_description_sections(str(op.get("description", "")))

        normalized_path = normalize_match_path(path, server_prefixes)
        flow = flow_map.get((method, normalized_path))
        if not flow and len(flow_blocks) == len(operations):
            candidate_method, candidate_path, candidate_flow = flow_blocks[i - 1]
            flow = candidate_flow
            if candidate_method and candidate_path and (candidate_method != method or candidate_path != normalized_path):
                order_fallbacks.append(
                    f"{method.upper()} {path} -> used block {i} by order fallback despite signature mismatch "
                    f"({candidate_method.upper()} {candidate_path})"
                )
            else:
                order_fallbacks.append(f"{method.upper()} {path} -> used block {i} by order fallback")
        if not flow:
            missing_flows.append(f"{method.upper()} {path}")
            flow = (
                "@startuml\n"
                f'partition "{method.upper()}  **{path}**" {{\n'
                "start\n"
                ":TODO add flow;\n"
                "stop\n"
                "}\n"
                "@enduml\n"
            )

        puml_path.write_text(flow, encoding="utf-8")
        puml_files.append(puml_path)

        lines.append(f"## {section_no}. API Detail {i} - {title}")
        lines.append("")
        lines.append(f"**Endpoint:** `{method.upper()} {path}`")
        lines.append("")
        lines.append(f"### {section_no}.1 Process Flow")
        lines.append("")
        if desc_sections["process_flow"]:
            lines.append("**Flow Summary (from YAML description):**")
            lines.append("")
            for idx, item in enumerate(desc_sections["process_flow"], 1):
                lines.append(f"{idx}. {item}")
            lines.append("")
        if desc_sections["notes"]:
            lines.append("**Notes (from YAML description):**")
            lines.append("")
            for item in desc_sections["notes"]:
                lines.append(f"- {item}")
            lines.append("")
        if desc_sections["login"]:
            lines.append("**Login (from YAML description):**")
            lines.append("")
            for item in desc_sections["login"]:
                lines.append(f"- {item}")
            lines.append("")
        lines.append(f"Source of truth: `{flow_path.as_posix()}`")
        lines.append("")
        lines.append("```text")
        lines.extend(flow.rstrip("\n").split("\n"))
        lines.append("```")
        lines.append("")
        lines.append(f"![Flowchart - API {i} {title}]({svg_rel.as_posix()})")
        lines.append("")

        lines.append(f"### {section_no}.2 Parameters")
        lines.append("")
        path_item = spec.get("paths", {}).get(path, {})
        parameters = get_parameters(spec, path_item, op)
        if parameters:
            param_rows = ["| No | Parameter | Type | Required | Description |", "| ---: | --- | --- | --- | --- |"]
            for p_idx, p in enumerate(parameters, 1):
                sch = p.get("schema", {})
                p_type = sch.get("type", "string")
                p_fmt = sch.get("format")
                type_text = f"{p.get('in', 'path')} {p_type}" + (f"({p_fmt})" if p_fmt else "")
                req = "Yes" if p.get("required") else "No"
                desc = str(p.get("description", "")).replace("\n", " ").strip()
                param_rows.append(f"| {p_idx} | `{p.get('name', '')}` | {type_text} | {req} | {desc} |")
            lines.extend(param_rows)
        else:
            lines.append("`None`")
        lines.append("")

        lines.append(f"### {section_no}.3 Request Parameters (JSON format)")
        lines.append("")
        req_schema = get_request_schema(spec, op)
        if req_schema:
            req_rows = flatten_schema(spec, req_schema)
            req_md_rows = [request_row(x, r) for x, r in enumerate(req_rows, 1)]
            headers = [
                "No",
                "Item Name",
                "Level 1",
                "Level 2",
                "Level 3",
                "Level 4",
                "Level 5",
                "Level 6",
                "Type",
                "Format",
                "Length",
                "Required",
                "Notes",
            ]
            lines.append(table(headers, req_md_rows))
        else:
            lines.append("`None`")
        lines.append("")

        lines.append(f"### {section_no}.4 Success Response (JSON format)")
        lines.append("")
        ok_schema = get_response_schema(spec, op, "200")
        if ok_schema:
            ok_rows = flatten_schema(spec, ok_schema)
            ok_md_rows = [response_row(x, r) for x, r in enumerate(ok_rows, 1)]
            headers = ["No", "Item Name", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Type", "Notes"]
            lines.append(table(headers, ok_md_rows))
        else:
            lines.append("`None`")
        lines.append("")

        lines.append(f"### {section_no}.5 Error Response (JSON format)")
        lines.append("")
        err_schema = get_response_schema(spec, op, "400")
        if err_schema:
            err_rows = flatten_schema(spec, err_schema)
            err_md_rows = [response_row(x, r) for x, r in enumerate(err_rows, 1)]
            headers = ["No", "Item Name", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Type", "Notes"]
            lines.append(table(headers, err_md_rows))
        else:
            headers = ["No", "Item Name", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Type", "Notes"]
            shared_rows = [
                "| 1 | status | status |  |  |  |  |  | integer | Shared business error status code in the common response envelope |"
            ]
            lines.append("Shared error envelope applies for non-200 exits.")
            lines.append("")
            lines.append(table(headers, shared_rows))
            inferred = collect_error_cases(flow)
            if inferred:
                lines.append("")
                lines.append("**Applicable Business Statuses:**")
                lines.append("")
                lines.append("| No | Status | Typical Trigger |")
                lines.append("| ---: | --- | --- |")
                for idx, (code, meaning) in enumerate(inferred, 1):
                    lines.append(f"| {idx} | {code} | {meaning} |")
        lines.append("")

    final_section_no = len(operations) + 2
    lines.append(f"## {final_section_no}. Flowchart Image Rendering Recommendation (for Markdown)")
    lines.append("")
    lines.append("1. Keep `.puml` files in `docs/api/flows/` as source of truth.")
    lines.append("2. Render `.svg` files into `docs/api/images/` and embed them in markdown.")
    lines.append("3. Keep process flow code block as `text` to avoid duplicate diagram rendering in markdown preview.")
    lines.append("")

    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    render_errors: List[str] = []
    if not args.skip_render:
        jar = find_plantuml_jar(args.plantuml_jar)
        if jar:
            render_errors = render_svgs(jar, puml_files, images_dir)
        else:
            render_errors.append("PlantUML jar not found. Use --plantuml-jar or install VSCode PlantUML extension.")

    print(f"[OK] Generated markdown: {output_path}")
    print(f"[OK] Generated puml files: {len(puml_files)}")
    if missing_flows:
        print("[WARN] Missing flow blocks:")
        for item in missing_flows:
            print(f"  - {item}")
    if order_fallbacks:
        print("[WARN] Flow block order fallback used:")
        for item in order_fallbacks:
            print(f"  - {item}")
    if render_errors:
        print("[WARN] Render issues:")
        for item in render_errors:
            print(f"  - {item}")
    else:
        if not args.skip_render:
            print("[OK] Rendered SVG flow images successfully")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover
        print(f"[ERROR] {exc}", file=sys.stderr)
        raise
