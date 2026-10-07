# Test-System Hardening Pause Checkpoint

Status: PAUSED_BY_USER_FOR_REPLAY_FOCUS

This checkpoint preserves the focused test-system hardening replan so work can resume without relying on chat history.

## Why paused

The user explicitly requested that the broader test-system hardening work pause temporarily and that all immediate engineering attention move to the Market Recording + Replay component. The broader replan remains valid work; it is not abandoned or completed.

## Exact branch state at pause

Planning branch: `plan/test-system-hardening-replan`

Completed in this replan:

- framework freshness verified against installed ST Planner 1.0 source;
- structural map completed;
- deep coherent-slice S&T review completed;
- whole-plan outside-in review completed;
- test-system coverage ledger created;
- corrected `7.7` decomposition created and reviewed;
- `.planning/TREE.yaml` promoted with the reviewed `7.7` subtree;
- `7.4` now depends on `7.7.4` in the planning branch;
- durable decisions `D-US-049` through `D-US-052` recorded.

Known findings already routed by the paused replan:

1. Replay Host child-stop success can leave the losing 5-second timeout referenced after the child exits quickly. This is a production lifecycle defect, not merely test slowness.
2. Browser CI executes some FR-7/FR-8 browser scenarios once in full Chromium and again through Local Acceptance solely for named checkpoint evidence.
3. Replay lower-layer unit/service ownership cannot be deduplicated safely until Fast CI path routing owns all relevant Replay/Host/shared/helper/config changes.
4. Planning Docs currently contains brittle hard-coded historical TREE totals (`58` nodes / `44` leaves); this must be replaced by structural/freeze-baseline validation rather than bumping the constants.
5. Product-wide test hygiene/audit must cover duplicate/stale tests/helpers, unowned skip/todo/only, retry-based flake masking, arbitrary sleeps, weak assertions, over-mocking, cleanup leaks, oversized/non-deterministic fixtures and failure diagnostics.

## Exact unfinished work

The next broader test-system hardening work, when resumed, is:

1. Update `docs/TEST_STRATEGY.md` with durable verification ownership/completeness/determinism/hygiene/performance rules and mark historical branch-specific count sections as historical rather than current release authority.
2. Repair Planning Docs structural validation so it does not depend on hard-coded current node/leaf totals and requires the new review artifacts appropriately.
3. Run final adversarial planning review over TREE + decisions + strategy + validation changes.
4. Freeze the revised plan and run no-drift proof.
5. Repair/extend `.planning/EXECUTION.yaml` allocation with resume semantics; validate serial allocation without rewriting historical done nodes.
6. Run mandatory handoff simulation and only then re-authorize implementation.
7. Implement `7.7.1.1` through `7.7.4` according to the frozen allocation.
8. Resume final target-machine/provider acceptance `7.4` only after `7.7.4` reclosure is merged and main is green.

## Current authority boundary

The broader test-system replan is intentionally **not implementation-authorized** while paused. Do not implement non-Replay `7.7` work from this checkpoint.

Replay-focused work created after this pause should be performed on its own focused branch from fresh `main`, then its merged truth must be reconciled into this replan when broader work resumes. Completed Replay-specific fixes/evidence should be reused rather than repeated mechanically, while the broader ownership/topology audit still must account for them.

## Resume instruction

When the user returns to the broader test-system hardening work:

```text
fetch fresh main
→ inspect this pause checkpoint and the merged Replay-focused changes/evidence
→ rebase/reconcile the paused planning branch or reopen the smallest affected planning area if merged Replay truth invalidates any assumption
→ continue from docs/TEST_STRATEGY + Planning Docs validation
→ final planning review
→ freeze/no-drift
→ allocation/handoff simulation
→ implementation authorization
```

Do not resume directly from chat memory or skip reconciliation with the Replay-focused work completed while this replan was paused.
