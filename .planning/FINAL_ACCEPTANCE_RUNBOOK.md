# Market Flow US — Deferred Final Acceptance Runbook

This document preserves the target-machine/provider acceptance procedure for backlog item `B-US-000`.

It is **not an active execution boundary**. Target-machine/provider acceptance was removed from `.planning/EXECUTION.md` and moved to `backlog/B-US-000-final-target-machine-provider-acceptance.md` so it cannot block unrelated development.

## Authority

- GitHub `main` is repository truth.
- `backlog/B-US-000-final-target-machine-provider-acceptance.md` owns the current non-blocking backlog intent and candidate-selection policy.
- `.planning/PLAN.md` preserves the detailed historical planning/success-evidence rationale for the former `7.4` scope.
- `.planning/EXECUTION.md` owns active execution; this acceptance work is not active unless it is explicitly re-planned and allocated there.
- `.planning/FINAL_ACCEPTANCE_EXECUTION.md` preserves acceptance checkpoint/evidence history.
- `docs/FIRST_RUN_ACCEPTANCE.md` is the maintained detailed FR-0..FR-14 procedure.
- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` is historical planning/provenance evidence only.

## Candidate policy — latest intended runtime, selected when activated

Do **not** permanently pin acceptance to a stale SHA while product/runtime development continues.

When `B-US-000` is explicitly activated in the future:

1. fetch fresh `main`;
2. review merged product/runtime changes since the last acceptance evidence;
3. select the **latest intended runtime candidate** containing the development meant to be accepted;
4. record that exact SHA in the acceptance ledger for that run;
5. invalidate/rerun candidate-bound evidence affected by newer runtime changes;
6. reuse old evidence only where the maintained contract proves the later changes cannot invalidate it.

A newer docs/metadata-only commit need not replace the selected runtime candidate merely because its SHA is newer. Conversely, a newer merged product/runtime change must not be ignored in favor of an older runtime candidate.

Historical candidate retained only as provenance:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

That SHA is **not** a future mandatory FR-2 target after newer product/runtime development.

## Non-blocking rule

Acceptance may be run whenever it is explicitly planned/allocated, but while it remains in `backlog/`:

- it creates no dependency edge for other work;
- it does not own the repository current pointer;
- it does not prevent feature/fix/planning PRs;
- a missing target-machine checkpoint is not a development blocker;
- new development may continue and will simply require candidate selection/reconciliation when acceptance is later resumed.

If acceptance itself discovers a deterministic defect, that executing work unit owns the defect through RCA, fix, regression and affected verification. This does not make the dormant backlog item a global blocker for unrelated development.

## Execution order when re-activated

Use the detailed procedures and PASS semantics in `docs/FIRST_RUN_ACCEPTANCE.md` in this order:

```text
FR-0 select exact candidate for this acceptance run from fresh main
→ FR-1 host prerequisite preflight
→ FR-2 exact selected-SHA checkout
→ FR-3 dependency install
→ FR-4 deterministic unit/service/Replay/order acceptance
→ FR-5 browser + Replay build/E2E
→ FR-6 local UI smoke
→ FR-7 Local Fake static
→ FR-8A..H dynamic/recovery/Demo Buy/AI
→ FR-9 isolated + 4096x180 target workload
→ FR-10 daily DB lifecycle
→ FR-11A real market-data deployment smoke
→ FR-11B standalone order service + real CPGW session compatibility
→ FR-11C integrated Detail BUY DRY_RUN
→ FR-12 authenticated static/pre-market
→ FR-13 authenticated market-open movement
→ FR-14 final evidence/handoff
```

FR-2 must validate the SHA selected by FR-0 **for that run**, not the historical SHA above.

Real IBKR LIVE submission is PASS only if real external trading permission exists and the user explicitly initiates it. Otherwise record exactly `PENDING_EXTERNAL_PERMISSION`; deterministic/synthetic proof must never be relabeled as live success.

## Execution discipline when activated

- One user-dependent checkpoint at a time.
- Stop on first FAIL within the acceptance run.
- Root-cause a deterministic defect before retry; keep it with the executing work unit through regression proof and affected verification.
- Resume from the earliest checkpoint invalidated by a fix; do not rerun unrelated green checkpoints.
- Do not advance machine/provider checkpoints from assumptions. Machine-specific evidence must be observed.
- Preserve sanitized evidence only: no credentials, cookies, tokens, auth/session data, account identifiers, raw authenticated dumps or private browser state.
- Replay must leave the normal live DB untouched.
- BUY browser surfaces must never expose the order-service caller token or create a generic execution proxy.
