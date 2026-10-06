# Market Flow US — TREE 9.5 Replay Deterministic Reclosure

## Purpose

This is the durable audit/evidence record for TREE `9.5`.

The reclosure verifies that completed Replay nodes `9.1` through `9.4`, the normal Market Flow US surfaces, normative contracts and final-acceptance truth form one coherent post-branch-9 candidate before TREE `7.4` resumes. It does not create another Replay subsystem and must not add Replay semantics to the normal service/shared producer protocol.

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

## Contract audit so far

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

The Replay data/product contracts are largely coherent with the implemented branch-9 architecture:

```text
validated recording source
→ IndexedDB or validated portable file
→ Market Player
→ unchanged ProducerBridge/protocol
→ Replay Host-owned unchanged Market Flow service
→ replay-only schema-v4 DuckDB
→ unchanged Viewer / Current / History / Scanner / Demo Buy / AI surfaces
```

No Replay-specific shared protocol/server mode is required.

## Reclosure gaps discovered

### 1. Missing integrated mid-start/next-day proof

Existing proof was strong per component but did not connect one deterministic scenario through the real ProducerBridge/service authority into Current, History, staged Scanner and Demo Buy while simultaneously proving:

- start from a middle recording frame;
- zero preroll;
- no earlier History rows;
- missing staged anchors at first emitted frame;
- natural anchor progression after later emitted frames;
- day-A provider/source facts retained;
- day-B local collection/cycle timing;
- Demo Buy future evidence only from later replay cycles.

`tests/service/replay-reclosure.test.mjs` now supplies that integrated proof. Initial Fast CI on commit `3b9e231ee3b3faa857b3405959ef94d93b08fa88` passed.

### 2. Missing focused Replay acceptance command

`docs/TEST_STRATEGY.md` requires a dedicated/minimal Replay acceptance set without changing ordinary `RUN_TESTS.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `START_DEMO.cmd` or `START_MARKET_FLOW_US.cmd` semantics.

`package.json` now exposes:

```text
npm run test:acceptance:replay
```

It aggregates existing Replay unit/service/browser proof plus the new reclosure integration proof. It does not add long Replay waits to ordinary acceptance.

### 3. Release-truth drift after branch 9

The first-run/final-acceptance documents still carry branch-8-era truth, including Chat 21 ownership and the old post-branch-8 candidate. Final acceptance must instead be owned by Chat 25 / TREE `7.4` and must consume the exact post-branch-9 candidate pinned only after TREE `9.5` merges and main is green.

This drift is a TREE `9.5` release-truth repair and remains pending in the next reclosure segment; it must be fixed before `9.5` can be marked done.

### 4. Technical-spec opening drift

Later `TECHNICAL_SPEC` Replay sections are coherent, but its opening architecture wording still describes only the branch-8 execution extension. The smallest contract repair is to make the top-level architecture acknowledge the already-approved isolated Replay lane without changing the later mechanics.

This repair remains pending in the next reclosure segment.

## Execution state

During Chat 24 start-up, root `STATUS.yaml`, `.planning/STATUS.yaml` and `.planning/EXECUTION.yaml` were aligned to `9.5 = in_progress`.

## Remaining TREE 9.5 work

```text
repair first-run/final-acceptance ownership + candidate truth
repair TECHNICAL_SPEC top-level architecture drift
run npm run test:acceptance:replay
run materially affected Browser / Planning / bounded Workload / ordinary Local Fake gates
review PR diff
mark 9.5 done only with success_evidence satisfied
squash-merge PR #53
require main green + clean open-PR audit
pin exact post-branch-9 candidate in STATUS / EXECUTION / handoff / first-run truth
hand off Chat 25 / TREE 7.4
```

No final candidate is pinned yet. The entry SHA and intermediate PR SHAs are evidence only until all closure gates pass.
