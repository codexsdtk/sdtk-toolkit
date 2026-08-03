from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


TABLE_ROW_RE = re.compile(r"^\|.*\|\s*$")
TABLE_SEP_RE = re.compile(r"^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|\s*$")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
SCREEN_SECTION_HEADING_RE = re.compile(r"^###\s+(.*\S)\s*$", re.MULTILINE)
VI_DIACRITIC_RE = re.compile(r"[À-ỹ]")
VI_PHRASE_RE = re.compile(
    r"\b("
    r"thuc thi|hien thi|cap nhat|bo sung|can xac nhan|trong anh|"
    r"duoc tra kem|tao lich|theo user|muc global|thay the cho|bao gom"
    r")\b",
    re.IGNORECASE,
)
INLINE_HEADING_RE = re.compile(r".+\s#{2,}\s+\S")
IMAGE_LINK_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
PLANTUML_FENCE_START_RE = re.compile(r"^\s*```plantuml\s*$", re.IGNORECASE)
NEW_STYLE_ACTIVITY_LINE_RE = re.compile(
    r"^\s*(start|stop|partition\s+\"|if\s*\(|fork(?:\s+again)?\b|end\s+fork\b|note\s+(?:right|left|top|bottom)\b|:[^;\n]+;)",
    re.IGNORECASE,
)
LEGACY_ACTIVITY_START_RE = re.compile(r"\(\*\)")
LEGACY_EDGE_LABEL_RE = re.compile(r"-->\s*\[")
MIXED_ACTIVITY_ARROW_RE = re.compile(r":[^;\n]+;\s*-->")


@dataclass(frozen=True)
class Occurrence:
    number: int
    section: str
    line_no: int
    raw_line: str


def _split_table_row(line: str) -> list[str]:
    # Keep it simple: markdown tables in our spec are plain and don't escape pipes.
    parts = [p.strip() for p in line.strip().strip("|").split("|")]
    return parts


def _read_text(path: Path) -> str:
    # Prefer UTF-8; fallback to cp1252-ish if user saved without UTF-8.
    for enc in ("utf-8", "utf-8-sig", "cp1252"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    return path.read_text(errors="replace")


def collect_hygiene_issues(md_text: str, *, en_check: bool) -> dict[str, list[tuple[int, str]]]:
    issues: dict[str, list[tuple[int, str]]] = {
        "encoding": [],
        "vi_diacritic": [],
        "vi_phrase": [],
        "inline_heading": [],
    }
    lines = md_text.splitlines()
    in_code_block = False

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            continue
        if in_code_block:
            continue

        if "�" in line or "ↁE" in line:
            issues["encoding"].append((idx, line))

        # A common corruption symptom: merged headings inside normal text lines.
        if INLINE_HEADING_RE.search(line) and not stripped.startswith("#"):
            issues["inline_heading"].append((idx, line))

        if en_check:
            lowered = stripped.lower()
            if "original text" in lowered:
                continue
            if VI_DIACRITIC_RE.search(line):
                issues["vi_diacritic"].append((idx, line))
            elif VI_PHRASE_RE.search(line):
                issues["vi_phrase"].append((idx, line))

    return issues


def _is_root_relative_docs_href(href: str) -> bool:
    normalized = href.strip().replace("\\", "/").lower()
    if not normalized:
        return False
    if re.match(r"^[a-z][a-z0-9+.-]*://", normalized):
        return False
    if normalized.startswith(("mailto:", "tel:", "data:", "#")):
        return False
    return normalized.startswith(("docs/", "./docs/", "/docs/"))


def collect_screen_image_path_issues(md_text: str) -> list[tuple[int, str]]:
    issues: list[tuple[int, str]] = []
    lines = md_text.splitlines()
    in_code_block = False
    expecting_image_line = False

    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            expecting_image_line = False
            continue
        if in_code_block:
            continue
        if not stripped:
            continue

        if stripped.lower().startswith("screen image:"):
            expecting_image_line = stripped.lower() == "screen image:"
            hrefs = IMAGE_LINK_RE.findall(stripped)
        elif expecting_image_line and stripped.startswith("!["):
            expecting_image_line = False
            hrefs = IMAGE_LINK_RE.findall(stripped)
        else:
            hrefs = []
            if not stripped.startswith("<!--"):
                expecting_image_line = False

        for href in hrefs:
            if _is_root_relative_docs_href(href):
                issues.append((idx, href))

    return issues


def collect_plantuml_activity_syntax_issues(md_text: str) -> list[tuple[int, str]]:
    issues: list[tuple[int, str]] = []
    lines = md_text.splitlines()
    in_plantuml_block = False
    block_start_line = 0
    block_lines: list[str] = []

    def flush_block() -> None:
        nonlocal issues, block_lines, block_start_line
        if not block_lines:
            return
        has_new_style = any(NEW_STYLE_ACTIVITY_LINE_RE.search(line) for line in block_lines)
        if not has_new_style:
            block_lines = []
            block_start_line = 0
            return

        for offset, line in enumerate(block_lines, start=0):
            line_no = block_start_line + offset
            if LEGACY_ACTIVITY_START_RE.search(line):
                issues.append(
                    (line_no, "Legacy activity start marker `(*)` is not allowed in new-style activity diagrams.")
                )
            if MIXED_ACTIVITY_ARROW_RE.search(line):
                issues.append(
                    (line_no, "Do not append legacy `-->` transitions after a new-style `:Activity;` action line.")
                )
            elif LEGACY_EDGE_LABEL_RE.search(line):
                issues.append(
                    (line_no, "Legacy edge labels like `--> [label]` are not allowed in new-style activity diagrams.")
                )

        block_lines = []
        block_start_line = 0

    for idx, line in enumerate(lines, start=1):
        if not in_plantuml_block and PLANTUML_FENCE_START_RE.match(line):
            in_plantuml_block = True
            block_start_line = idx + 1
            block_lines = []
            continue

        if in_plantuml_block and line.strip().startswith("```"):
            flush_block()
            in_plantuml_block = False
            continue

        if in_plantuml_block:
            block_lines.append(line)

    if in_plantuml_block:
        flush_block()

    return issues


def collect_wireframe_mapping_issues(md_text: str) -> list[tuple[int, str]]:
    issues: list[tuple[int, str]] = []
    sections = list(SCREEN_SECTION_HEADING_RE.finditer(md_text))
    for idx, match in enumerate(sections):
        start = match.start()
        end = sections[idx + 1].start() if idx + 1 < len(sections) else len(md_text)
        section_text = md_text[start:end]

        if "Design Source Type: generated-draft" not in section_text:
            continue
        if "> Screen image not rendered in this environment." in section_text:
            continue
        if "Screen image:" not in section_text or "![" not in section_text:
            continue
        if "#### Wireframe Marker Mapping" in section_text:
            continue

        line_no = md_text.count("\n", 0, start) + 1
        section_name = match.group(1).strip()
        issues.append(
            (line_no, f"{section_name}: missing `Wireframe Marker Mapping` table for generated-draft screen.")
        )

    return issues


def parse_action_tables(md_text: str) -> list[Occurrence]:
    occurrences: list[Occurrence] = []
    current_section = ""
    lines = md_text.splitlines()

    i = 0
    while i < len(lines):
        line = lines[i]

        m = HEADING_RE.match(line)
        if m:
            current_section = m.group(2).strip()

        # Detect table header
        if i + 1 < len(lines) and TABLE_ROW_RE.match(line) and TABLE_ROW_RE.match(lines[i + 1]):
            header = _split_table_row(line)
            sep = lines[i + 1]

            if not TABLE_SEP_RE.match(sep):
                i += 1
                continue

            # Only validate action tables: must contain No + Action + Description
            lowered = [h.lower() for h in header]
            if "no" not in lowered and "no." not in lowered:
                i += 1
                continue
            if "action" not in lowered or "description" not in lowered:
                i += 1
                continue

            try:
                no_index = lowered.index("no")
            except ValueError:
                no_index = lowered.index("no.")

            # Consume rows until table ends
            j = i + 2
            while j < len(lines) and TABLE_ROW_RE.match(lines[j]):
                row = _split_table_row(lines[j])
                if len(row) <= no_index:
                    j += 1
                    continue
                raw_no = row[no_index]
                try:
                    number = int(raw_no)
                except ValueError:
                    j += 1
                    continue
                occurrences.append(
                    Occurrence(
                        number=number,
                        section=current_section or "(unknown section)",
                        line_no=j + 1,  # 1-based
                        raw_line=lines[j],
                    )
                )
                j += 1

            i = j
            continue

        i += 1

    return occurrences


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate numbering in flow-action spec tables.")
    parser.add_argument("--spec", required=True, help="Path to *_FLOW_ACTION_SPEC.md")
    parser.add_argument(
        "--en-check",
        action="store_true",
        help="Enable EN artifact hygiene checks (Vietnamese leftovers + encoding corruption).",
    )
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    spec_path = Path(args.spec)
    if not spec_path.exists():
        print(f"[ERROR] Not found: {spec_path}", file=sys.stderr)
        return 2

    text = _read_text(spec_path)
    occ = parse_action_tables(text)

    by_number: dict[int, list[Occurrence]] = {}
    for o in occ:
        by_number.setdefault(o.number, []).append(o)

    duplicates = {n: os for n, os in by_number.items() if len(os) > 1}

    max_seen = -1
    decreases: list[tuple[Occurrence, int]] = []
    for o in occ:
        if o.number < max_seen:
            decreases.append((o, max_seen))
        max_seen = max(max_seen, o.number)

    has_issues = bool(duplicates or decreases)
    hygiene = collect_hygiene_issues(text, en_check=args.en_check)
    image_path_issues = collect_screen_image_path_issues(text)
    plantuml_activity_issues = collect_plantuml_activity_syntax_issues(text)
    wireframe_mapping_issues = collect_wireframe_mapping_issues(text)
    if hygiene["encoding"] or hygiene["inline_heading"]:
        has_issues = True
    if args.en_check and (hygiene["vi_diacritic"] or hygiene["vi_phrase"]):
        has_issues = True
    if image_path_issues:
        has_issues = True
    if plantuml_activity_issues:
        has_issues = True
    if wireframe_mapping_issues:
        has_issues = True

    print(f"Checked: {spec_path}")
    print(f"- Total numbered rows: {len(occ)}")
    print(f"- Unique numbers: {len(by_number)}")
    print(f"- EN hygiene check enabled: {args.en_check}")

    if not occ:
        print("[WARN] No action tables detected (| No | Action | Description | ... |).")

    if duplicates:
        print("\n[FAIL] Duplicate numbers found:")
        for n in sorted(duplicates.keys()):
            print(f"- No {n}:")
            for o in duplicates[n]:
                print(f"  - {o.section} (line {o.line_no})")

    if decreases:
        print("\n[FAIL] Numbering decreases/resets detected (global numbering policy):")
        for o, prev_max in decreases:
            print(f"- No {o.number} after max {prev_max}: {o.section} (line {o.line_no})")

    if hygiene["encoding"]:
        print("\n[FAIL] Encoding/mojibake markers detected:")
        for line_no, line in hygiene["encoding"][:20]:
            print(f"- line {line_no}: {line.strip()}")

    if hygiene["inline_heading"]:
        print("\n[FAIL] Inline/merged heading patterns detected:")
        for line_no, line in hygiene["inline_heading"][:20]:
            print(f"- line {line_no}: {line.strip()}")

    if args.en_check and hygiene["vi_diacritic"]:
        print("\n[FAIL] Vietnamese diacritic text detected in EN artifact:")
        for line_no, line in hygiene["vi_diacritic"][:20]:
            print(f"- line {line_no}: {line.strip()}")

    if args.en_check and hygiene["vi_phrase"]:
        print("\n[FAIL] Vietnamese phrase patterns detected in EN artifact:")
        for line_no, line in hygiene["vi_phrase"][:20]:
            print(f"- line {line_no}: {line.strip()}")

    if image_path_issues:
        print("\n[FAIL] Screen image markdown paths must be file-relative, not docs-root-relative:")
        for line_no, href in image_path_issues[:20]:
            print(f"- line {line_no}: {href}")

    if plantuml_activity_issues:
        print("\n[FAIL] Mixed or legacy PlantUML activity syntax detected in a new-style screen-flow block:")
        for line_no, message in plantuml_activity_issues[:20]:
            print(f"- line {line_no}: {message}")

    if wireframe_mapping_issues:
        print("\n[FAIL] Missing wireframe-marker mapping tables for generated-draft screens:")
        for line_no, message in wireframe_mapping_issues[:20]:
            print(f"- line {line_no}: {message}")

    if not has_issues:
        print("\n[OK] Numbering and text hygiene checks passed.")
        return 0

    print("\nHint: Use global numbering across the full document.")
    print("- Do not repeat No values in any action table.")
    print("- Do not reset numbering per screen/dialog.")
    print("- Use file-relative screen image paths such as assets/<feature>/screens/<screen>.svg.")
    print("- Use new-style PlantUML activity syntax only for screen-flow diagrams.")
    print("- Add a `Wireframe Marker Mapping` table when a generated-draft screen embeds a wireframe image.")
    print("- Keep EN artifacts free of Vietnamese leftovers and encoding corruption.")
    print("- Keep headings/sections on separate lines (avoid merged markdown blocks).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
