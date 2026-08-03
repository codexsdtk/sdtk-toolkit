#!/usr/bin/env python3
"""
Lightweight validator for [FEATURE_KEY]_TEST_CASE.md
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


REQUIRED_HEADINGS = [
    "## Statistic Summary (Excel-aligned)",
    "## Abbreviations",
    "## 1. Scope",
    "## 2. References",
    "## 3. Test Environment and Common Data",
    "## 4. Feature Coverage Matrix",
    "## 5. Screen-based Test Cases (Excel-aligned)",
    "## 6. Open Questions (for final freeze)",
    "## 7. STC/UAT Note",
]


def has_18_columns(header_line: str) -> bool:
    # markdown table columns = number of "|" minus 1 (leading/trailing)
    pipe_count = header_line.count("|")
    return pipe_count - 1 == 18


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate QA test-case markdown format for SDTK-SPEC."
    )
    parser.add_argument(
        "--file",
        required=True,
        help="Path to [FEATURE_KEY]_TEST_CASE.md",
    )
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"[FAIL] file not found: {path}")
        return 1

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    ok = True

    for heading in REQUIRED_HEADINGS:
        if heading not in text:
            print(f"[FAIL] missing heading: {heading}")
            ok = False

    utc_sections = re.findall(r"^#### .*UTC.*$", text, flags=re.MULTILINE)
    itc_sections = re.findall(r"^#### .*ITC.*$", text, flags=re.MULTILINE)
    if not utc_sections:
        print("[FAIL] no UTC subsection found")
        ok = False
    if not itc_sections:
        print("[FAIL] no ITC subsection found")
        ok = False

    # Validate 18-column table headers for UTC/ITC tables
    expected_header = (
        "| No | Test Type | Test Perspective | Test Item | Precondition | Test Steps | "
        "Expected Result | Browser | Test Execution Result | Remarks | Reviewer | "
        "Review Date | OK/NG | Cause | Countermeasure | Owner | Completion Date | Confirmation |"
    )
    if expected_header not in text:
        print("[FAIL] missing canonical 18-column test-case table header")
        ok = False
    else:
        if not has_18_columns(expected_header):
            print("[FAIL] canonical test-case table header column count is not 18")
            ok = False

    placeholders = []
    for i, line in enumerate(lines, start=1):
        if "??" in line or "?????" in line:
            placeholders.append(i)
    if placeholders:
        print(f"[FAIL] unresolved placeholder tokens at lines: {placeholders[:20]}")
        ok = False

    if ok:
        print("[PASS] test-case markdown format validation passed")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
