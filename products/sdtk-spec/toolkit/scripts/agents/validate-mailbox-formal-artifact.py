from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PHASE_RULES = {
    'controller-dev-review': {
        'filename': re.compile(r'^SDTK_BK\d{3}_CONTROLLER_DEV_REVIEW_R\d+_\d{8}\.md$'),
        'verdicts': {
            'APPROVED FOR QA HANDOFF',
            'CHANGES REQUIRED BEFORE QA',
        },
    },
    'qa-review': {
        'filename': re.compile(r'^SDTK_BK\d{3}_QA_CHECKPOINT_REPORT_R\d+_\d{8}\.md$'),
        'verdicts': {
            'APPROVED FOR CONTROLLER ACCEPTANCE',
            'CHANGES REQUIRED BEFORE CONTROLLER ACCEPTANCE',
        },
    },
    'controller-acceptance': {
        'filename': re.compile(r'^SDTK_BK\d{3}_CONTROLLER_ACCEPTANCE_R\d+_\d{8}\.md$'),
        'verdicts': {
            'APPROVED FOR COMMIT-READY STATE',
            'NOT APPROVED FOR COMMIT-READY STATE',
        },
    },
}

FORBIDDEN_TOKENS = (
    'QA_REVIEW',
    'APPROVED FOR CLOSE',
)
PHASE_RE = re.compile(r'(?mi)^(?:\*\*Phase:\*\*|Phase:)\s*`?([a-z\-]+)`?\s*$')


def main() -> int:
    parser = argparse.ArgumentParser(description='Validate canonical mailbox review artifact naming and verdict vocabulary.')
    parser.add_argument('--phase', required=True, choices=sorted(PHASE_RULES.keys()))
    parser.add_argument('--artifact', required=True, type=Path)
    args = parser.parse_args()

    artifact = args.artifact.resolve()
    if not artifact.exists():
        print(f'[FAIL] mailbox-artifact-check missing artifact: {artifact}')
        return 1

    rule = PHASE_RULES[args.phase]
    failures: list[str] = []
    if not rule['filename'].match(artifact.name):
        failures.append(
            f'Artifact name {artifact.name} does not match canonical filename family for phase {args.phase}.'
        )

    text = artifact.read_text(encoding='utf-8', errors='replace')

    phase_match = PHASE_RE.search(text)
    if not phase_match:
        failures.append('Artifact does not declare a Phase line.')
    elif phase_match.group(1).strip() != args.phase:
        failures.append(
            f'Artifact phase {phase_match.group(1).strip()} does not match expected phase {args.phase}.'
        )

    if not any(verdict in text for verdict in rule['verdicts']):
        failures.append(
            'Artifact does not contain a canonical verdict phrase for the selected phase.'
        )

    forbidden_hits = [token for token in FORBIDDEN_TOKENS if token in text or token in artifact.name]
    if forbidden_hits:
        failures.append('Artifact contains forbidden legacy tokens: ' + ', '.join(forbidden_hits))

    if failures:
        print('[FAIL] mailbox-artifact-check failed:')
        for failure in failures:
            print(f'- {failure}')
        return 1

    print(f'[OK] mailbox-artifact-check passed for {artifact.name} ({args.phase})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
