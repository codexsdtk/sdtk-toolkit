# API DESIGN CREATION RULES (Compatibility Note)

This file is kept only for backward compatibility.

Do not use this file as the primary source of truth anymore.
The active rule source for API design detail and API flowchart behavior is now:
- `toolkit/templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md`

Even in compatibility mode, generated API design detail docs must still include:
- a top-level `## Assumptions` section
- this table format: `| # | Assumption | Verified | Risk if wrong |`
- explicit unresolved assumptions when downstream review depends on them

Use the active rule file for:
- API design detail markdown structure
- flowchart integration and synchronization rules
- error section rules
- flow summary / notes / login rules
- assumptions-section requirements

This compatibility note should remain only until all references are migrated.
