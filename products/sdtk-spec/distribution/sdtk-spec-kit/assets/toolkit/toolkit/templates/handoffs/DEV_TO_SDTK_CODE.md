# DEV to SDTK-CODE Handoff

## Required Inputs
- `docs/dev/FEATURE_IMPL_PLAN_[FEATURE_KEY].md`
- `docs/dev/CODE_HANDOFF_[FEATURE_KEY].json`
- `sdtk-spec.config.json`
- required upstream refs listed in the handoff artifact

## Required Outputs
Current canonical generator output is schema `0.2`; downstream `SDTK-CODE` still accepts `0.1` handoffs for truthful compatibility.

- explicit readiness decision for SDTK-CODE:
  - `READY_FOR_SDTK_CODE`, or
  - `BLOCKED_FOR_SDTK_CODE`
- recommended lane:
  - `feature`, or
  - `bugfix`
- implementation slices (ordered build sequence)
- impact map derived from the current handoff refs
- test obligations
- optional recovery notes
- blocker list when not ready

## Mandatory Checks
- `FEATURE_IMPL_PLAN` and `CODE_HANDOFF` reference the same feature key.
- `required_refs` always include `ARCH_DESIGN` and `BACKLOG`.
- implementation slices stay in the recommended downstream build order.
- test obligations are implementation-ready acceptance mapping statements, not vague labels.
- suggested next command appears only when the handoff status is `READY_FOR_SDTK_CODE`.

## Workflow-Domain Guidance (Approval/Workflow Features Only)
Use this section only when the current feature includes approval states, state transitions, role-based gates, or policy-sensitive workflow behavior.

- Keep `implementation_slices` in state-machine-first order. The recommended seven-slice pattern is:
  1. workflow state machine and domain invariants
  2. API and transition contracts
  3. RBAC and actor-to-transition permissions
  4. transition guards and policy enforcement
  5. submitter-facing UI
  6. approver-facing UI
  7. downstream integration or notification hooks
- Populate all four `impact_map` keys (`api_refs`, `database_refs`, `ui_refs`, `flow_refs`) with concrete refs when they exist. If `database_refs` is missing for a workflow-domain handoff, carry that gap as an explicit `open_blocker`. For other intentionally absent surfaces, make the gap explicit in planning notes instead of leaving the surface implied.
- Write `test_obligations` that cover all four workflow categories:
  - valid positive transitions
  - blocked or invalid transitions
  - role-permission boundaries
  - policy-sensitive edge cases
- Add `recovery_notes` when the workflow has fragile coupling points, especially state-machine changes or cases where an unresolved OQ can invalidate current transition assumptions mid-implementation.
- Required source inputs for workflow-domain handoff authoring:
  - `docs/product/CONDENSED_UPSTREAM_INPUT_[FEATURE_KEY].md`
  - `docs/architecture/ARCH_DESIGN_[FEATURE_KEY].md`
  - `docs/product/BACKLOG_[FEATURE_KEY].md`
  - `docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md`
  - at least one `docs/database/*` source
- Carry unresolved workflow decisions that still affect implementation truth as `open_blockers`. Do not emit `READY_FOR_SDTK_CODE` if an unresolved `OQ-xx` still changes role permissions, transition legality, or policy outcome semantics.

## Forbidden Shortcuts
- Do not auto-run `sdtk-code` from `/dev`.
- Do not emit `READY_FOR_SDTK_CODE` with hidden blockers.
- Do not treat planning notes as a substitute for the machine-readable `CODE_HANDOFF` artifact.
