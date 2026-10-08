# Market Flow US — Deferred Final Acceptance Evidence Ledger

This file preserves checkpoint/evidence history for backlog item `B-US-000`.

## Current state

- Active execution status: **not allocated**
- Backlog item: `backlog/B-US-000-final-target-machine-provider-acceptance.md`
- Blocking development: **No**
- Candidate policy: choose the latest intended runtime candidate from fresh `main` when the backlog item is explicitly activated.
- Detailed procedure: `docs/FIRST_RUN_ACCEPTANCE.md`
- Run wrapper: `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`

The former Chat 28 / task `7.4` allocation has been removed from `.planning/EXECUTION.md`. No checkpoint below is a current development gate while this work remains in backlog.

## Historical candidate/evidence

The last runtime candidate selected before deferral was:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

Historical evidence recorded on that path:

- FR-0 candidate selection — PASS for that historical acceptance attempt.
- FR-1 host prerequisite preflight — PASS at that time.
- FR-2 onward — not completed before deferral.

This history must not be interpreted as pinning a future run to the historical SHA or proving that host state remains unchanged indefinitely.

## Deferred checkpoint ledger

| Checkpoint | State | Evidence / future rule |
|---|---|---|
| FR-0 select exact candidate | DEFERRED | On activation, fetch fresh `main` and select the latest intended runtime candidate for that run. Historical candidate: `682f8c8b01e9f68c7f8e159de8b0f233221f1878`. |
| FR-1 host prerequisite preflight | DEFERRED | Historical PASS exists, but revalidate machine prerequisites when the backlog task is activated if freshness matters. |
| FR-2 exact selected-SHA checkout | DEFERRED | Target machine must be clean and pinned to the SHA selected by the new FR-0 run, not automatically to the historical candidate. |
| FR-3 deterministic dependency install | DEFERRED | user target machine |
| FR-4 unit/service/Replay/order deterministic acceptance | DEFERRED | user target machine |
| FR-5 normal + Replay build / Chromium E2E | DEFERRED | user target machine |
| FR-6 local UI smoke | DEFERRED | user target machine |
| FR-7 Local Fake static | DEFERRED | user target machine |
| FR-8A..H Local Fake / Demo Buy / AI closure | DEFERRED | user target machine |
| FR-9 isolated + 4096x180 target workload | DEFERRED | user target machine |
| FR-10 daily DB lifecycle | DEFERRED | user target machine |
| FR-11A authenticated market-data deployment smoke | DEFERRED | user target machine/provider |
| FR-11B standalone order service + real CPGW session compatibility | DEFERRED | user target machine/IBKR CPGW |
| FR-11C integrated Detail BUY DRY_RUN | DEFERRED | current Detail → immutable ticket → trusted confirmation → order-service DRY_RUN |
| Real IBKR LIVE order | PENDING_EXTERNAL_PERMISSION | PASS only if actually permissioned and explicitly user-initiated |
| FR-12 authenticated static/pre-market | DEFERRED | user target machine/provider |
| FR-13 authenticated market-open movement | DEFERRED | real market movement required |
| FR-14 final evidence / handoff | DEFERRED | only after the re-activated run completes its required evidence |

## Non-blocking rule

A `DEFERRED` checkpoint here does not block unrelated development. This ledger becomes active evidence only after `B-US-000` is re-planned and explicitly allocated in `.planning/EXECUTION.md`.

If the later acceptance run discovers a deterministic defect, the executing work unit owns it through root cause, fix, regression proof and affected verification.

Reports/evidence must remain sanitized: no credentials, cookies, tokens, account identifiers, authenticated raw dumps or private browser state.
