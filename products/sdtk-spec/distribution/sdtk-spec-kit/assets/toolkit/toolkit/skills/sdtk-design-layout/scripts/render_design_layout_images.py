#!/usr/bin/env python3
"""
Render screen preview SVGs from DESIGN_LAYOUT PlantUML SALT wireframes.

Extracts @startsalt blocks from a DESIGN_LAYOUT_[FEATURE_KEY].md file,
renders each to .svg using a local plantuml.jar, and writes the images
to docs/specs/assets/<feature_snake>/screens/.

Graceful failure: if PlantUML is unavailable or a block fails to render,
the script warns but does not exit with an error code.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple


CIRCLED_ITEM_MARKER_RE = re.compile(r"[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]")
LEGACY_ITEM_MARKER_RE = re.compile(r"\(\d+\)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render screen images from DESIGN_LAYOUT PlantUML SALT blocks."
    )
    parser.add_argument(
        "--design-layout",
        required=True,
        help="Path to DESIGN_LAYOUT_[FEATURE_KEY].md",
    )
    parser.add_argument(
        "--feature-key",
        required=True,
        help="Feature key, e.g. CRM_LITE",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Output directory for SVGs. Default: docs/specs/assets/<feature_snake>/screens/",
    )
    parser.add_argument(
        "--plantuml-jar",
        default="",
        help="Explicit path to plantuml.jar. Auto-detected if omitted.",
    )
    parser.add_argument(
        "--skip-render",
        action="store_true",
        help="Extract .puml files only, skip SVG rendering.",
    )
    return parser.parse_args()


def normalize_feature_snake(feature_key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", feature_key.lower()).strip("_")


def find_plantuml_jar(explicit: str) -> Optional[Path]:
    if explicit:
        p = Path(explicit).expanduser().resolve()
        return p if p.exists() else None
    user_home = Path.home()
    candidates = sorted(
        (user_home / ".vscode" / "extensions").glob("jebbs.plantuml-*/plantuml.jar")
    )
    if candidates:
        return candidates[-1]
    return None


def extract_screens(text: str) -> List[Tuple[str, str]]:
    """Extract (screen_id, plantuml_block) pairs from DESIGN_LAYOUT markdown.

    Looks for heading patterns like '## A-1. Screen Name' or '## SCR-01 Screen Name'
    followed by a fenced plantuml block containing @startsalt.
    """
    screens: List[Tuple[str, str]] = []
    heading_pattern = re.compile(
        r"^##\s+([A-Z]+-?\d+|SCR-?\d+)[.\s]",
        re.MULTILINE,
    )
    salt_pattern = re.compile(
        r"```plantuml\s*\n(@startsalt[\s\S]*?@endsalt)\s*\n```",
        re.MULTILINE,
    )

    headings = list(heading_pattern.finditer(text))
    for i, match in enumerate(headings):
        screen_id = match.group(1).strip().lower().replace("-", "_")
        start = match.start()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        section = text[start:end]

        salt_match = salt_pattern.search(section)
        if salt_match:
            screens.append((screen_id, salt_match.group(1)))

    return screens


def count_visible_item_markers(salt_block: str) -> int:
    return len(CIRCLED_ITEM_MARKER_RE.findall(salt_block))


def count_legacy_item_markers(salt_block: str) -> int:
    return len(LEGACY_ITEM_MARKER_RE.findall(salt_block))


def render_svg(
    plantuml_jar: Path, puml_path: Path, output_dir: Path
) -> Optional[str]:
    """Render a single .puml to .svg. Returns error string or None on success."""
    proc = subprocess.run(
        ["java", "-Dfile.encoding=UTF-8", "-jar", str(plantuml_jar), "-charset", "UTF-8", "-tsvg", str(puml_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    # PlantUML writes .svg next to the .puml file.
    svg_path = puml_path.with_suffix(".svg")
    if not svg_path.exists():
        return f"Render failed (no svg produced): {puml_path.name}"

    # If .puml is already in the output dir, no copy needed.
    # Otherwise move the svg to the output dir.
    svg_dst = output_dir / svg_path.name
    if svg_path.resolve() != svg_dst.resolve():
        shutil.copy2(svg_path, svg_dst)
        svg_path.unlink(missing_ok=True)
        svg_path = svg_dst

    svg_text = svg_path.read_text(encoding="utf-8", errors="ignore")
    if any(
        x in svg_text
        for x in ("Cannot find group", "Syntax Error", "contains errors")
    ):
        return f"Rendered with error content: {svg_path.name}"
    if proc.returncode != 0:
        return f"PlantUML exit={proc.returncode} for {puml_path.name}"
    return None


def main() -> int:
    args = parse_args()

    feature_key = args.feature_key.strip()
    if not feature_key:
        print("[ERROR] --feature-key is empty", file=sys.stderr)
        return 1

    feature_snake = normalize_feature_snake(feature_key)
    layout_path = Path(args.design_layout)
    if not layout_path.exists():
        print(f"[ERROR] Design layout not found: {layout_path}", file=sys.stderr)
        return 1

    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = Path(f"docs/specs/assets/{feature_snake}/screens")

    output_dir.mkdir(parents=True, exist_ok=True)

    text = layout_path.read_text(encoding="utf-8")
    screens = extract_screens(text)

    if not screens:
        print("[WARN] No screen sections with @startsalt blocks found.")
        print("[OK] Nothing to render.")
        return 0

    print(f"[OK] Found {len(screens)} screen(s) with SALT wireframes.")

    numbering_warnings: List[str] = []
    for screen_id, salt_block in screens:
        marker_count = count_visible_item_markers(salt_block)
        legacy_marker_count = count_legacy_item_markers(salt_block)
        if legacy_marker_count > 0:
            numbering_warnings.append(
                f"{screen_id}: legacy `(N)` markers detected; prefer circled-number markers to avoid SALT ambiguity."
            )
        elif marker_count == 0:
            numbering_warnings.append(
                f"{screen_id}: no visible wireframe item markers found."
            )

    # Write .puml files
    puml_files: List[Path] = []
    for screen_id, salt_block in screens:
        puml_name = f"{screen_id}.puml"
        puml_path = output_dir / puml_name
        puml_path.write_text(salt_block + "\n", encoding="utf-8")
        puml_files.append(puml_path)

    if args.skip_render:
        print(f"[OK] Wrote {len(puml_files)} .puml file(s). Render skipped (--skip-render).")
        if numbering_warnings:
            print("[WARN] Wireframe numbering issues:")
            for item in numbering_warnings:
                print(f"  - {item}")
        return 0

    # Find PlantUML
    jar = find_plantuml_jar(args.plantuml_jar)
    if not jar:
        print("[WARN] PlantUML jar not found. SVG rendering skipped.")
        print("       Use --plantuml-jar or install VSCode PlantUML extension.")
        print(f"[OK] Wrote {len(puml_files)} .puml file(s) without SVG rendering.")
        return 0

    # Render SVGs
    errors: List[str] = []
    rendered = 0
    for puml_path in puml_files:
        err = render_svg(jar, puml_path, output_dir)
        if err:
            errors.append(err)
        else:
            rendered += 1

    print(f"[OK] Rendered {rendered}/{len(puml_files)} screen image(s) to: {output_dir}")
    if errors:
        print("[WARN] Render issues:")
        for item in errors:
            print(f"  - {item}")
    if numbering_warnings:
        print("[WARN] Wireframe numbering issues:")
        for item in numbering_warnings:
            print(f"  - {item}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        raise
