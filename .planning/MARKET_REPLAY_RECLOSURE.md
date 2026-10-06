# Market Flow US — TREE 9.5 Replay Deterministic Reclosure

## Purpose

This is the durable audit/evidence record for TREE `9.5`.

The reclosure verifies that completed Replay nodes `9.1` through `9.4`, the normal Market Flow US surfaces, normative contracts and final-acceptance truth form one coherent post-branch-9 candidate before later execution continues. It does not create another Replay subsystem and must not add Replay semantics to the normal service/shared producer protocol.

## Entry truth

Chat 24 started from fresh `main`:

```text
14a2c25631438f5db43756e4969498b449791c13
```

At entry:

- root `STATUS.yaml` selected Chat 24 / TREE `9.5`;
- `.planning/STATUS.yaml` was frozen and implementation-authorized;
- TREE dependencies `9.4` and `8.4` were done;
- Chat 23 / TREE `9.4` was merged;
- all required entry-main checks were green;
- open-PR audit was clean.

The focused branch is `chat24-replay-reclosure`, PR #53.

## Contract audit

Audited together:

```text
docs/MARKET_REPLAY.md
docs/PRODUCT_REQUIREMENTS.md
docs/PRODUCT_SPEC.md
docs/DATA_CONTRACT.md
docs/TECHNICAL_SPEC.md
docs/TEST_STRATEGY.md
.planning/FIRST_RUN_ACCEPTANCE_PLAN.md
docs/FIRST_RUN_ACCEPTANCE.md
```

The implemented architecture is reclosed as:

```text
validated recording source
→ IndexedDB or validated portable file
→ Market Player
→ unchanged ProducerBridge/protocol
→ Replay Host-owned unchanged Market Flow service
→ replay-only schema-v4 DuckDB
→ unchanged Viewer / Current / History / Scanner / Demo Buy / AI surfaces
```

No Replay-specific shared protocol/server mode is required or allowed.

## Reclosure gaps discovered and repaired

### 1. Missing integrated mid-start/next-day proof — repaired

Existing proof was strong per component but did not connect one deterministic scenario through the real ProducerBridge/service authority into Current, History, staged Scanner and Demo Buy while simultaneously proving:

- start from a middle recording frame;
- zero preroll;
- no earlier History rows;
- missing staged anchors at first emitted frame;
- natural anchor progression after later emitted frames;
- day-A provider/source facts retained;
- day-B local collection/cycle timing;
- Demo Buy future evidence only from later replay cycles.

`tests/service/replay-reclosure.test.mjs` supplies that integrated proof through the real service/DuckDB path.

### 2. Missing focused Replay acceptance command — repaired

`package.json` now exposes:

```text
npm run test:acceptance:replay
```

It aggregates focused Replay unit/service/browser proof without changing ordinary `RUN_TESTS.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `START_DEMO.cmd` or `START_MARKET_FLOW_US.cmd` semantics.

### 3. Release-truth drift after branch 9 — repaired

First-run/final-acceptance truth now requires:

```text
TREE 9.5 closed
→ exact post-branch-9 candidate from EXECUTOR_HANDOFF
→ target-machine final acceptance only on that exact candidate
```

The historical branch-8 candidate is explicitly ineligible for final post-Replay acceptance. Replay deterministic acceptance/build and replay-owned DB isolation are explicit first-run requirements.

### 4. Technical-spec opening drift — repaired

`docs/TECHNICAL_SPEC.md` now includes the isolated Replay lane in the top-level architecture and explicitly preserves:

- unchanged Market Flow US service as the only replay-run market DB writer;
- replay-unaware shared producer protocol/service;
- Replay Host ownership limited to its service child and replay-owned DB;
- no normal-live DB ownership/reset/delete by Replay;
- unchanged ordinary runtime/acceptance commands;
- post-branch-9 final-candidate acceptance.

### 5. Release drift guard pinned old truth — repaired

Fast CI exposed that `tests/unit/release-runtime-audit.test.mjs` still asserted Chat 21 and the historical branch-8 candidate. The guard now protects the post-branch-9 handoff model, dedicated Replay acceptance/build and Replay-owned DB isolation. A follow-up wording mismatch (`Replay-owned DBs` versus canonical `Replay-owned DuckDBs`) was also corrected without runtime behavior change.

### 6. Backlog sequencing drift during closure — repaired

While recording the newly requested Replay hardening and BUY mini-projects, final diff review found that the existing B-US-001..004 sequencing note had been replaced rather than preserved. The old query-development sequencing note and the new B-US-005/B-US-006 sequencing are now both retained explicitly.

## Green branch evidence

The final substantive/reclosure branch head before this evidence-only update is:

```text
4892e3235b6dd6790625db7ecf247e55a26ed567
```

That exact head passed all required broad gates:

```text
Fast CI       #468  PASS
Browser CI    #426  PASS
Planning Docs #600  PASS
Workload      #254  PASS
```

Browser CI includes the full Chromium E2E lane and bounded Local Fake acceptance. Fast includes the Replay reclosure service proof and release-drift guards. The service lane remained green; Chat 24 failures were deterministic stale/drift assertions and were root-caused/fixed at the contract guard rather than waived.

This evidence-only commit must itself pass the repository-required PR checks before merge. No product/runtime behavior is changed by this final evidence update.

## Additional future work recorded without changing current allocation

`.planning/BACKLOG.md` records:

```text
B-US-005 Replay pre-user-run hardening audit
B-US-006 Basic in-product BUY via existing order API
```

`B-US-005` is intended immediately after TREE `9.5` and requires a second full static + unit + service + browser/composition + broad-gate audit of Replay before relying on the user's target-machine run.

`B-US-006` is intentionally an MVP: one explicit user BUY action through the existing authenticated `ibkr-order-service`, driven by simple configuration; deeper order/API behavior remains for later planning.

## Current closure state

TREE `9.5` remains `in_progress` until PR #53 is merged, main CI is green and the exact squash-merged post-branch-9 candidate can be pinned in durable handoff/status truth.

Remaining closure:

```text
final evidence-only CI green
→ final PR diff/status review
→ mark PR #53 ready
→ squash-merge
→ verify main Fast/Browser/Planning/Workload green
→ verify open-PR state
→ pin exact accepted post-branch-9 product SHA in STATUS / EXECUTION / EXECUTOR_HANDOFF
→ advance to the next authorized truth
```

No final accepted product candidate is pinned before merge; branch/intermediate SHAs are evidence only.
