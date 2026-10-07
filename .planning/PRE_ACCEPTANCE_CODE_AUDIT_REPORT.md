# Market Flow US — Pre-Acceptance Extension Code Audit Report

## Audit identity

Status: `IN_PROGRESS`

Exact extension range entering the audit:

```text
base: e0af9d105004f175a44ec33fa481fba0631773bf
head: 93a48c8b0a36433e58f09f6a607ec7cd366c9aea
commits: 35
```

The base is completed post-Demo-Buy/AI reclosure `7.5`. The head is the combined pre-audit runtime candidate. Runtime fixes discovered by this audit supersede that head only after merge; planning/evidence-only commits do not replace the runtime candidate.

## Stage matrix

| TREE node | Stage | State | Evidence / findings |
|---|---|---|---|
| `7.6.1` | Exact delta inventory + contract/proof map | PASS | All material production/runtime/packaging files in the exact 35-commit delta were mapped to contract, risk, proof and deep-review owner |
| `7.6.2` | IBKR order service + Basic BUY deep audit | PASS | Two material lifecycle defects found/fixed/regression-proven; Fast/Browser/Replay/Planning/Workload green |
| `7.6.3` | Recording/Replay/Host deep audit | PASS | One material cleanup/ownership defect found/fixed/regression-proven; Fast #534, Browser #492, Replay #63, Planning #691 and Workload #320 green on Stage-3 head `a2613f13dd51046fbe4c0427bb318c2e5feb1dc0` |
| `7.6.4` | Shared integration/regression audit | PENDING | Starts after Stage-3 merge/main-green closure |
| `7.6.5` | Adversarial verification + deterministic reclosure | PENDING | Runs after Stage 4 PASS |

## Stage 1 — exact inventory

The reviewed extension window includes:

- standalone IBKR order service and operator/acceptance wiring;
- Basic current-Detail BUY tickets, sidecar, confirmation, Viewer/client and launcher integration;
- Replay recorder, IndexedDB store, portable format/source, Player/controller/surfaces, Replay Host client/coordinator;
- Replay Host config/security/process ownership;
- shared market-service config/index/service, protocol and diagnostics seams;
- affected Windows launchers, build/package scripts and CI routing.

No material production/runtime file in the exact extension window remains unmapped.

## Stage 2 — IBKR order service + Basic BUY

Reviewed implementation and tests together across validation/fingerprinting, caller security, DRY_RUN/LIVE gates, DuckDB idempotency/provider state, CPGW lifecycle, reply/cancel/fill/reconciliation, HTTP auth/origin/body limits, ticket immutability, sidecar child/token ownership, confirmation CSRF/Origin, Detail eligibility, launcher defaults and isolation from Scanner/Demo Buy/AI/Replay.

### Defect 1 — pending cancellation misclassified as terminal

`live-order-authority.js` used a substring match for `cancel`, so `PendingCancel` / `PreCancelled` could become terminal `CANCELLED` too early.

Fix: only exact normalized `Cancelled` is terminal; fill authority still wins and partial fills remain `PARTIALLY_FILLED`.

Regression: `tests/service/ibkr-order-service-cancel-status.test.mjs` proves PendingCancel, PreCancelled and terminal Cancelled separately.

### Defect 2 — Basic BUY unknown acknowledgement lost recovery handle

The trusted confirmation page consumed the one-time ticket and deleted its page session on uncertain outcome, leaving no same-order recovery path.

Fix: while outcome is uncertain, Node retains the immutable consumed ticket only in memory, browser receives no requestId/sidecar token, the action becomes `Check status`, and the same immutable intent/requestId is reused for reconciliation. Provider-reply transport uncertainty is normalized to the same fail-closed state, and transient status-check failure keeps the recovery session alive.

Regression: `tests/service/basic-buy-ack-reconciliation.test.mjs` covers thrown/returned acknowledgement-unknown, transient reconciliation failure and provider-reply transport uncertainty.

Stage-2 verification head `efd9ee6fac0c83ff75e3d36d6ad789e8e781e762`:

```text
Fast #528        PASS (unit + service + order acceptance)
Browser #486     PASS
Replay #57       PASS
Planning #685    PASS
Workload #314    PASS
```

No browser-visible sidecar credential/requestId or generic Viewer execution proxy was introduced.

## Stage 3 — Recording / Replay / Host deep audit

The final combined Replay code was independently re-read against `MARKET_REPLAY` and `REPLAY_HARDENING`; prior `9.6` evidence was reused only where it proved the exact risk.

Reviewed areas:

- Recorder Start/Stop ownership, in-flight write ordering and failure handling;
- IndexedDB transaction/quota/write failure and prior-commit preservation;
- portable manifest/frame/footer validation, malformed/truncated/version/count/order behavior and streaming/file source semantics;
- direct File byte-offset source/index and frame-boundary validation;
- Player irregular scheduling, contemporary rebasing, Pause/Resume, Stop/Seek generation cancellation and authority sequencing;
- controller stale source/load/play behavior;
- Replay Host exact Origin, ephemeral pairing/control credential, foreign-port refusal and owned-child/DB boundaries;
- run coordinator fresh-run/same-run semantics and post-start composition cleanup;
- ordinary live DB/process isolation and replay-unaware shared server/protocol boundary;
- Replay UI/composition and operator path.

### Defect 3 — post-start Replay composition failure leaked Host-owned run

`replay-run-coordinator.js` started a fresh Host run and then composed ProducerBridge/Viewer. If `producerBridgeFactory`, `viewerRuntimeFactory`, `openViewer()` or viewer-open validation threw, cleanup was not guaranteed because only the normal `viewer.opened !== true` branch had explicit stop behavior.

Risk: an owned Replay service child/run could remain alive after startup failure, leaving ambiguous run ownership and an occupied Replay service boundary.

Fix:

- wrap all post-`startRun` composition in one fail-closed cleanup boundary;
- call `hostClient.stopRun("replay-composition-failed")` for every composition failure;
- clear `activeRunId` only after cleanup succeeds;
- if cleanup itself fails, preserve the active run id as ownership truth and surface the cleanup error with the original composition failure as cause rather than falsely reporting no active run.

Regression: `tests/unit/replay-run-coordinator-composition-failure.test.mjs` covers producer factory throw, Viewer runtime factory throw, `openViewer()` throw, Viewer reports not opened, and cleanup-stop failure with ownership preserved.

Stage-3 verification head `a2613f13dd51046fbe4c0427bb318c2e5feb1dc0`:

```text
Fast #534        PASS
Browser #492     PASS
Replay #63       PASS
Planning #691    PASS
Workload #320    PASS
```

No additional material Replay defect or materially unproved Stage-3 risk remained after the independent static pass. Shared server/protocol remains Replay-unaware; live DB/process authority remains isolated.

## Remaining Stage 4 queue

Mandatory shared-integration review:

```text
local-service/server/config.js
local-service/server/index.js
local-service/server/service.js
shared/protocol/index.js
shared/diagnostics/index.js
browser/viewer/client.js
browser/viewer/detail-surface.js
START_MARKET_FLOW_US_WITH_BUY.cmd
START_MARKET_REPLAY.cmd
NEW_TRADING_DAY.cmd
package.json
.github/workflows/fast-ci.yml
.github/workflows/replay-ci.yml
```

Cross-feature invariants still to close:

- ordinary launcher remains execution-disabled;
- Replay remains opt-in/external and shared server/protocol replay-unaware;
- BUY exposes no generic Viewer execution proxy or browser sidecar token;
- live market DB, Replay DB and order DB ownership remain disjoint;
- New Trading Day does not own order/replay DBs;
- Detail/History, Current, Scanner, Demo Buy and AI remain regression-green;
- diagnostics remain sanitized;
- no test-only bypass exists in production composition.

## Audit defects so far

1. Planning validator stale after audit replan — fixed in PR #64.
2. IBKR pending cancellation reported terminal — fixed/regression-proven in Stage 2.
3. Basic BUY unknown acknowledgement lost same-order recovery — fixed/regression-proven in Stage 2.
4. Replay post-start composition failure could leak Host-owned run — fixed/regression-proven in Stage 3, including cleanup-failure ownership truth.

## Completion condition

Overall `PASS` requires Stages `7.6.4` and `7.6.5` PASS, every material scoped area explicitly reviewed, no known material defect or material unproved review risk, required deterministic gates green, audit PR/main/open-PR closure clean, and one exact audited runtime candidate pinned for TREE `7.4`.
