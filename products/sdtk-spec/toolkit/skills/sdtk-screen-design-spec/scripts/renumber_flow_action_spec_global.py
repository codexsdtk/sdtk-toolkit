from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


TABLE_ROW_RE = re.compile(r"^\|.*\|\s*$")
TABLE_SEP_RE = re.compile(r"^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|\s*$")


def _split_table_row(line: str) -> list[str]:
    return [p.strip() for p in line.strip().strip("|").split("|")]


def _read_text(path: Path) -> tuple[str, str]:
    for enc in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return path.read_text(encoding=enc), enc
        except UnicodeDecodeError:
            continue
    return path.read_text(errors="replace"), "utf-8"


def _make_row(cells: list[str]) -> str:
    return "| " + " | ".join(cells) + " |"


def renumber_action_tables(md_text: str) -> tuple[str, int, int]:
    lines = md_text.splitlines()
    out = lines[:]

    expected_no = 1
    touched = 0
    rows = 0

    i = 0
    while i < len(lines):
        line = lines[i]
        if i + 1 < len(lines) and TABLE_ROW_RE.match(line) and TABLE_ROW_RE.match(lines[i + 1]):
            header = _split_table_row(line)
            if not TABLE_SEP_RE.match(lines[i + 1]):
                i += 1
                continue

            lowered = [h.lower() for h in header]
            if "action" not in lowered or "description" not in lowered:
                i += 1
                continue
            if "no" in lowered:
                no_index = lowered.index("no")
            elif "no." in lowered:
                no_index = lowered.index("no.")
            else:
                i += 1
                continue

            j = i + 2
            while j < len(lines) and TABLE_ROW_RE.match(lines[j]):
                row = _split_table_row(lines[j])
                if len(row) <= no_index:
                    j += 1
                    continue

                try:
                    current_no = int(row[no_index])
                except ValueError:
                    j += 1
                    continue

                rows += 1
                if current_no != expected_no:
                    row[no_index] = str(expected_no)
                    out[j] = _make_row(row)
                    touched += 1
                expected_no += 1
                j += 1

            i = j
            continue

        i += 1

    return "\n".join(out) + "\n", rows, touched


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Renumber action table `No` fields globally in *_FLOW_ACTION_SPEC.md"
    )
    parser.add_argument("--spec", required=True, help="Path to *_FLOW_ACTION_SPEC.md")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write changes to file. Without this flag, runs in dry-run mode.",
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

    text, enc = _read_text(spec_path)
    new_text, rows, touched = renumber_action_tables(text)

    print(f"Checked: {spec_path}")
    print(f"- Numbered action rows: {rows}")
    print(f"- Rows changed: {touched}")
    print(f"- Mode: {'write' if args.write else 'dry-run'}")

    if touched == 0:
        print("[OK] Already globally numbered.")
        return 0

    if not args.write:
        print("[INFO] Re-run with --write to apply changes.")
        return 1

    if enc not in ("utf-8", "utf-8-sig"):
        enc = "utf-8"
    spec_path.write_text(new_text, encoding=enc)
    print("[OK] Updated file with global numbering.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

