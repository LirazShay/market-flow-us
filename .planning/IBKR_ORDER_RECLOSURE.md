# Market Flow US — TREE 8.4 Branch-8 Deterministic Reclosure

## Purpose

This is the durable audit/evidence record for TREE `8.4`.

The reclosure verifies that the completed branch-8 order-service implementation, its normative contracts, the affected generic product/test contracts and final-acceptance truth are coherent before TREE `7.4` resumes. It does not create another execution subsystem.

## Exact post-order-service product candidate

```text
28e950afc1c4bfe4322d0593f483d05d92553e2d
```

This is `main` immediately after squash-merging PR #40 (`8.3`). It contains the completed `8.1` + `8.2` + `8.3` product implementation. Later TREE `8.4` planning/docs/metadata-only closure commits do not silently replace this product candidate.

The pre-branch-8 candidate `f2789a4ec43e0878688aa9ea29c647e40a1154b6` is historical evidence only and must not be used for final acceptance.

## Precondition audit

At Chat 20 start:

- root `STATUS.yaml` points to Chat 20 / TREE `8.4`;
- `.planning/STATUS.yaml` is frozen and implementation-authorized;
- `.planning/EXECUTION.yaml` records `8.3=done`, `8.4` next, then `7.4`;
- no blocker is recorded;
- no unexpected open PR exists.

Dependency order remains:

```text
8.1 -> 8.2 -> 8.3 -> 8.4 -> 7.4
```

## Candidate CI evidence

All four required repository gates ran on exact candidate `28e950afc1c4bfe4322d0593f483d05d92553e2d` after PR #40 merged and completed successfully:

```text
Market Flow US Browser CI       run 37485480788  success
Market Flow US Fast CI          run 37485481325  success
Market Flow US Planning Docs CI run 37485480804  success
Market Flow US Workload         run 37485480773  success
```

Relevant composition:

- Fast CI runs the complete unit suite, complete service suite and `npm run test:acceptance:order`.
- Browser CI runs full Chromium E2E and `npm run test:acceptance:local`.
- Workload CI runs bounded end-to-end plus isolated persistence/read/Scanner/Demo Buy probes.
- Planning Docs CI protects planning/release truth.

## Normative contract audit

Audited together:

```text
docs/PRODUCT_REQUIREMENTS.md
docs/PRODUCT_SPEC.md
docs/TECHNICAL_SPEC.md
docs/TEST_STRATEGY.md
docs/IBKR_ORDER_SERVICE.md
docs/IBKR_ORDER_SERVICE_SECURITY.md
```

No order-service implementation contradiction was found. The following invariants are mutually consistent and covered by deterministic proof:

- analysis/Demo Buy/AI cannot submit broker orders;
- standalone order service binds to `127.0.0.1:8770`;
- ephemeral caller authorization protects every endpoint except non-sensitive `/health`;
- browser `Origin` requests fail closed and permissive CORS is absent;
- `DRY_RUN` is default and never reaches provider submit;
- LIVE requires independent process + request + session/account/permission/instrument/snapshot/what-if/risk gates;
- BUY/SELL LMT/MKT DAY/GTC normalized scope remains narrow;
- LIVE SELL fails closed unless known long quantity covers the request;
- `requestId` idempotency survives restart;
- reply-required, cancellation, partial/full fills and `ACKNOWLEDGEMENT_UNKNOWN` are explicit;
- unknown provider questions fail closed;
- no provider account/auth/session material or caller token is persisted/reported.

## Deterministic order acceptance audit

`scripts/run-order-service-acceptance.mjs` proves the permission-independent end-to-end standalone journey through the real local HTTP service and execution DuckDB using synthetic provider data:

```text
health
missing/wrong auth
browser-origin rejection
BUY + SELL preview with zero submit
DRY_RUN create/replay
restart caller-token rotation + persisted idempotency
fake-LIVE REPLY_REQUIRED + explicit confirmation
partial fill + cancellation preserving fill
full fill
ACKNOWLEDGEMENT_UNKNOWN reconciliation without blind resubmit
no-short SELL rejection
sanitized SYNTHETIC_ONLY report
clean stop
```

Synthetic success is never represented as real IBKR order evidence.

## Reclosure defect discovered

The order-service implementation and deterministic test matrix were coherent, but release/first-run truth had drifted after branch 8:

1. `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` assigned TREE `7.4` execution to Chat 17 instead of current Chat 21.
2. `docs/FIRST_RUN_ACCEPTANCE.md` pinned historical pre-branch-8 candidate `f2789a4...`.
3. The first-run/final-acceptance sequence lacked the required target-machine IBKR order-service / CPGW gate and exact external-permission outcome.

## Reclosure defect repair

TREE `8.4` repaired the smallest affected release-truth surface without changing runtime code:

- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` now assigns final acceptance to Chat 21 and explicitly routes branch-8 order-service evidence into TREE `7.4`.
- `docs/FIRST_RUN_ACCEPTANCE.md` now pins candidate `28e950afc1c4bfe4322d0593f483d05d92553e2d` instead of the historical pre-branch-8 candidate.
- Existing FR numbering is preserved; `FR-11A` owns market-data provider startup and `FR-11B` owns deterministic order acceptance plus real CPGW session compatibility.
- FR-4 now includes `npm run test:acceptance:order` so permission-independent order proof is explicit on the target candidate.
- FR-8A..FR-8H remain explicit mechanical sub-checkpoints in the user runbook.
- FR-13 preserves explicit `PENDING`, `PASS` and `FAIL` movement evidence states.
- Final evidence records real-order status as `PASS` only when explicitly executed with permission; otherwise exactly `PENDING_EXTERNAL_PERMISSION`.
- New Trading Day remains market-DB-only and does not absorb the separate IBKR execution store.

A branch consistency pass found no remaining `Chat 17` or historical-candidate instruction in the authoritative first-run plan/user runbook.

## Reclosure validation

PR #41 first exposed two documentation-contract regressions instead of hiding them:

1. FR-13 no longer contained the mechanically asserted `movement.status = "FAIL"` form.
2. The updated runbook initially dropped explicit FR-8A..FR-8H labels while preserving their commands.

Both were root-caused to the release-truth rewrite, repaired in the runbook/regression contract, and revalidated. Before status closure, PR #41 passed:

```text
Market Flow US Fast CI          run 37491347255 (#394) success
Market Flow US Planning Docs CI run 37491347258 (#507) success
```

No runtime/order-service code changed in TREE `8.4`.

## Final-acceptance order-service rule

TREE `7.4` must, on the exact accepted candidate, prove on the user's target machine:

```text
standalone order-service startup
local caller protection
DRY_RUN preview
restart/idempotency
real CPGW session compatibility diagnostics
```

Actual real-order placement is required only if external IBKR trading permission exists and the user explicitly initiates the bounded check. Otherwise record exactly:

```text
PENDING_EXTERNAL_PERMISSION
```

No synthetic result substitutes for that external status.

## Closure state

TREE `8.4` is marked `done` in the closure patch and the exact product candidate is pinned in root/planning STATUS, EXECUTION, handoff and first-run acceptance truth.

Chat 20 itself is not complete until the remaining process gates are satisfied:

```text
final PR #41 CI green on the closure patch
→ final diff review
→ squash merge
→ main required CI green
→ open-PR audit clean
→ only then hand off to Chat 21 / TREE 7.4
```
