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

`tests/service/replay-reclosure.test.mjs` supplies that integrated proof. The proof passes through the real service/DuckDB path.

### 2. Missing focused Replay acceptance command — repaired

`docs/TEST_STRATEGY.md` requires dedicated/minimal Replay acceptance without changing ordinary `RUN_TESTS.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `START_DEMO.cmd` or `START_MARKET_FLOW_US.cmd` semantics.

`package.json` now exposes:

```text
npm run test:acceptance:replay
```

It aggregates existing Replay unit/service/browser proof plus the integrated reclosure proof without adding long Replay waits to ordinary acceptance.

### 3. Release-truth drift after branch 9 — repaired

The first-run/final-acceptance documents carried branch-8-era truth including Chat 21 ownership and the old post-branch-8 candidate.

They now require:

```text
TREE 9.5 closed
→ exact post-branch-9 candidate from EXECUTOR_HANDOFF
→ target-machine final acceptance only on that exact candidate
```

The historical branch-8 candidate is explicitly ineligible for final post-Replay acceptance. Replay deterministic acceptance/build and replay-owned DB isolation are explicit first-run requirements.

### 4. Technical-spec opening drift — repaired

`docs/TECHNICAL_SPEC.md` now includes the isolated Replay lane in the top-level architecture and explicitly preserves these boundaries:

- unchanged Market Flow US service is the only replay-run market DB writer;
- shared producer protocol remains replay-unaware;
- Replay Host orchestrates only its own service child and replay-owned DB;
- normal live DB is never owned/reset/deleted by Replay;
- ordinary runtime/acceptance commands retain normal semantics;
- final candidate is post-branch-9 and must include dedicated Replay proof.

### 5. Release drift guard still pinned Branch-8 truth — repaired

Fast CI exposed that `tests/unit/release-runtime-audit.test.mjs` still asserted Chat 21 and the old hard-coded branch-8 candidate. That guard was corrected to protect the new truth instead:

- Chat 25 / post-branch-9 handoff model;
- no hard-coded historical branch-8 candidate in the runbook;
- dedicated Replay acceptance/build;
- Replay-owned DB isolation.

A follow-up assertion wording mismatch (`Replay-owned DBs` versus canonical `Replay-owned DuckDBs`) was also corrected without changing product behavior.

## CI evidence so far

On branch head `77e1327ad34e8c9150bcfb0555ccd7c076e77a6d`, after the release-guard root-cause repairs:

```text
Fast CI       #465  PASS
Browser CI    #423  PASS
Planning Docs #597  PASS
Workload      #251  PASS
```

The following documentation-only Technical Spec reclosure commit is:

```text
e5792f86d330533506739967fcf3ea371b8909e7
```

Planning Docs #598 and Workload #252 are green on that head; Fast/Browser are rerunning before closure.

The service lane has repeatedly remained green, including the new integrated Replay reclosure test. The failures encountered during Chat 24 were deterministic release-drift assertions, not Replay runtime/service defects, and were fixed at their root source.

## Additional future work recorded without changing current allocation

Per user direction, `.planning/BACKLOG.md` now records two future mini-projects that do **not** authorize work inside TREE `9.5`:

```text
B-US-005 Replay pre-user-run hardening audit
B-US-006 Basic in-product BUY via existing order API
```

`B-US-005` is intended immediately after Replay reclosure and requires a second static + unit + service + browser/composition + broad-gate audit of the complete Replay feature before relying on the user's own run.

`B-US-006` is intentionally a small MVP: one explicit user BUY action through the existing authenticated `ibkr-order-service`, driven by simple configuration, with deeper order-product behavior deferred for later planning.

## Execution state

During Chat 24 start-up, root `STATUS.yaml`, `.planning/STATUS.yaml` and `.planning/EXECUTION.yaml` were aligned to `9.5 = in_progress`.

## Remaining TREE 9.5 work

```text
wait for Fast/Browser on current head to be green
review complete PR diff for unintended drift
update this evidence record with final head/gates
mark 9.5 done only with success_evidence satisfied
make PR #53 ready and squash-merge
require main CI green + clean open-PR audit
pin exact accepted post-branch-9 product candidate in STATUS / EXECUTION / handoff truth
advance to the next authorized truth without skipping the separate Replay hardening backlog requirement
```

No final accepted product candidate is pinned yet. Entry/intermediate PR SHAs are evidence only until the reclosure is merged and the required post-merge truth is green.
