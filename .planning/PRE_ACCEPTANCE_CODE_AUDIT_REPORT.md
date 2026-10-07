# Market Flow US — Pre-Acceptance Extension Code Audit Report

## Audit identity

Status: `IN_PROGRESS`

Exact review range entering the audit:

```text
base: e0af9d105004f175a44ec33fa481fba0631773bf
head: 93a48c8b0a36433e58f09f6a607ec7cd366c9aea
commits: 35
```

The base is the completed post-Demo-Buy/AI deterministic reclosure (`7.5`). The head is the combined runtime candidate entering this audit after standalone IBKR/order, Recording/Replay/hardening and Basic BUY. Planning/evidence-only commits do not replace the runtime candidate. Runtime fixes discovered by this audit will produce a successor candidate only after they merge.

## Stage matrix

| TREE node | Stage | State | Evidence / findings |
|---|---|---|---|
| `7.6.1` | Exact delta inventory + contract/proof map | PASS | Exact 35-commit delta inventoried; every material production/runtime/packaging file routed to governing contract, risk, deterministic proof and deep-review owner |
| `7.6.2` | IBKR order service + Basic BUY deep audit | PASS | Complete static review of order/BUY production seams found two material lifecycle defects; both root-caused/fixed with focused regressions; Fast including order acceptance, Browser, Replay, Planning and Workload CI are green on Stage-2 head `efd9ee6fac0c83ff75e3d36d6ad789e8e781e762` |
| `7.6.3` | Recording/Replay/Host deep audit | PENDING | Routed from Stage 1; starts after Stage-2 merge/main-green closure |
| `7.6.4` | Shared integration/regression audit | PENDING | Routed from Stage 1 |
| `7.6.5` | Adversarial verification + deterministic reclosure | PENDING | Runs only after all deep-review stages are PASS |

## Stage 1 — exact delta inventory

`git compare` over the exact base/head showed 35 commits. Pure planning/docs files are governing authority inputs rather than production runtime inventory. Tests are proof routes. Workflow/build/launcher/acceptance files are included because they can change what product is built, started or verified.

### Standalone IBKR order service → `7.6.2`

Governing contracts: `docs/IBKR_ORDER_SERVICE.md`, `docs/IBKR_ORDER_SERVICE_SECURITY.md` plus relevant technical/test contracts.

Reviewed/routed files:

```text
ibkr-order-service/intent.js
ibkr-order-service/security.js
ibkr-order-service/operator-config.js
ibkr-order-service/operator.js
ibkr-order-service/index.js
ibkr-order-service/fake-adapter.js
ibkr-order-service/fake-live-adapter.js
ibkr-order-service/order-authority.js
ibkr-order-service/live-gates.js
ibkr-order-service/store.js
ibkr-order-service/cpgw-adapter.js
ibkr-order-service/live-order-authority.js
ibkr-order-service/service.js
```

Primary proof: order intent/operator unit tests; bind/security/idempotency/live-gate/live-store/live-authority/live-HTTP/CPGW service tests; `RUN_IBKR_ORDER_ACCEPTANCE.cmd`; `npm run test:acceptance:order`.

### Basic in-product BUY → `7.6.2` + shared recheck in `7.6.4`

Governing contract: `docs/BASIC_BUY_INTEGRATION.md` consuming the standalone order/security contracts.

Reviewed/routed files:

```text
local-service/orders/basic-buy-tickets.js
local-service/orders/basic-buy-sidecar.js
local-service/orders/basic-buy-confirmation.js
browser/viewer/client.js
browser/viewer/detail-surface.js
START_MARKET_FLOW_US_WITH_BUY.cmd
```

Primary proof: `tests/unit/basic-buy-*.test.mjs`, `tests/service/basic-buy-*.test.mjs`, `tests/e2e/basic-buy-detail-surface.spec.mjs`, launcher/config/runtime tests.

### Recording + Replay browser runtime → `7.6.3`

Governing contracts: `docs/MARKET_REPLAY.md`, `docs/REPLAY_HARDENING.md`.

```text
browser/replay/index.js
browser/replay/market-recorder.js
browser/replay/recording-model.js
browser/replay/recording-store.js
browser/replay/recording-surface.js
browser/replay/portable-recording.js
browser/replay/recording-source.js
browser/replay/market-player.js
browser/replay/player-controller.js
browser/replay/player-surface.js
browser/replay/replay-host-client.js
browser/replay/replay-run-coordinator.js
```

Primary proof: Replay unit/service/Chromium suites, `npm run test:acceptance:replay`, `npm run build:replay`.

### Replay Host → `7.6.3`

```text
replay-host/config.js
replay-host/security.js
replay-host/host.js
replay-host/index.js
```

Primary proof: Replay Host service/race tests, run-coordinator proof and focused Replay acceptance.

### Shared runtime seams → `7.6.4`

```text
local-service/server/config.js
local-service/server/index.js
local-service/server/service.js
shared/protocol/index.js
shared/diagnostics/index.js
browser/viewer/client.js
browser/viewer/detail-surface.js
```

Primary proof: config/protocol/diagnostics/release-runtime unit tests, service suite, Chromium, bounded Local Fake, focused order/Replay acceptance.

### Operator/build/acceptance wiring → feature stages + `7.6.5`

```text
CHECK_IBKR_SESSION.cmd
START_IBKR_ORDER_SERVICE.cmd
RUN_IBKR_ORDER_ACCEPTANCE.cmd
START_MARKET_FLOW_US_WITH_BUY.cmd
START_MARKET_REPLAY.cmd
NEW_TRADING_DAY.cmd
scripts/check-ibkr-cpgw-session.mjs
scripts/run-order-service-acceptance.mjs
scripts/build-replay-browser.mjs
package.json
.github/workflows/fast-ci.yml
.github/workflows/replay-ci.yml
```

No material production/runtime file in the exact extension window remains unmapped.

## Stage 2 — IBKR order service + Basic BUY deep audit

### Static review coverage

The implementation and tests were reviewed together across:

- exact intent normalization/fingerprinting and supported order domain;
- high-entropy per-run caller token, constant-time equality and browser-Origin rejection;
- DRY_RUN default, explicit LIVE opt-in and loopback-only CPGW configuration;
- requestId same-intent idempotency/different-intent rejection;
- DuckDB execution/provider-state persistence and restart semantics;
- all independent LIVE gates including SELL long-position coverage;
- CPGW session/accounts/instrument/snapshot/what-if/submit/reply/orders/trades/cancel/keepalive boundaries;
- provider response sanitization and scoped loopback TLS exception;
- state-changing HTTP auth/origin/content-type/body-size checks before provider/state mutation;
- submit/reply/reconciliation/cancel/fill/partial-fill/acknowledgement-unknown lifecycle;
- ticket immutability/expiry/one-time consumption and stable server-owned requestId;
- Basic BUY sidecar child/token ownership and zero browser exposure;
- trusted confirmation Origin/CSRF/custom-header requirements;
- Detail current-security-only eligibility and prepare-only Viewer protocol;
- BUY-enabled launcher DRY_RUN default / explicit LIVE / positive quantity / exact provider Origin;
- ordinary runtime, Scanner, Demo Buy, AI Investigation and Replay remaining outside automatic execution authority.

No new/materially changed SQL was introduced by the Stage-2 fixes, so the SQL static gate was not reopened.

### Defect 1 — pending cancellation misclassified as terminal

**Finding:** `ibkr-order-service/live-order-authority.js` treated any provider status containing `cancel` as terminal `CANCELLED`.

**Root cause:** cancellation-state recognition used an over-broad substring match instead of the provider's terminal `Cancelled` status. States such as `PendingCancel` / `PreCancelled` mean cancellation is not yet confirmed and execution can still progress.

**Risk:** the product could report an order as cancelled before cancellation was actually confirmed, masking later fill/partial-fill state.

**Fix:** terminal cancellation now requires exact normalized `Cancelled`; fill authority still wins, partial fill remains `PARTIALLY_FILLED`, and non-terminal cancellation statuses remain active/submitted.

**Regression:** `tests/service/ibkr-order-service-cancel-status.test.mjs` proves:

```text
PendingCancel + 0 fill -> SUBMITTED
PreCancelled + partial fill -> PARTIALLY_FILLED
Cancelled + partial fill -> CANCELLED with filled quantity preserved
```

### Defect 2 — Basic BUY acknowledgement-unknown had no safe in-product recovery

**Finding:** the trusted confirmation path consumed the one-time ticket and deleted its page session when the sidecar/order result became `ACKNOWLEDGEMENT_UNKNOWN` or a reply transport outcome became unknown.

**Root cause:** confirmation state machine treated every execution exception as terminal page-session failure even though the sidecar/order authority deliberately preserves the same immutable requestId for reconciliation.

**Risk:** the user received an unknown-outcome error but had no same-order recovery handle, creating pressure to prepare a new BUY even though the original order might already have reached the provider.

**Fix:** the trusted loopback confirmation state machine now:

- consumes the original ticket once, then retains the immutable ticket only in Node memory while outcome is uncertain;
- keeps browser exposure limited to the opaque ticket id / trusted page session; requestId and sidecar token remain Node-only;
- switches the existing action to `Check status` instead of enabling a new submit;
- reuses the exact immutable intent/requestId so the order authority reconciles the existing logical order rather than blindly submitting another one;
- preserves the `ack_unknown` recovery session after a transient reconciliation failure so status can be checked again;
- maps provider-reply local transport loss (`BASIC_BUY_ORDER_SERVICE_RESPONSE_UNKNOWN`) to the same fail-closed `ACKNOWLEDGEMENT_UNKNOWN` recovery path instead of blindly repeating reply confirmation;
- deletes the page session after a conclusive terminal/non-uncertain outcome.

**Regression:** `tests/service/basic-buy-ack-reconciliation.test.mjs` proves:

1. thrown `ACKNOWLEDGEMENT_UNKNOWN` preserves same-request reconciliation after ticket consumption;
2. HTTP-success result with lifecycle `ACKNOWLEDGEMENT_UNKNOWN` remains reconcilable with the same requestId;
3. transient sidecar-unavailable during `Check status` keeps the recovery session alive for a later successful check;
4. provider-reply local transport uncertainty is normalized to `ACKNOWLEDGEMENT_UNKNOWN` and later reconciled through the original immutable request without repeating provider reply confirmation.

### Stage-2 verification

Stage-2 head:

```text
efd9ee6fac0c83ff75e3d36d6ad789e8e781e762
```

GitHub Actions on that exact head:

```text
Fast CI #528        PASS
  - npm run test:unit
  - npm run test:service
  - npm run test:acceptance:order
Browser CI #486     PASS
Replay CI #57       PASS
Planning Docs #685  PASS
Workload #314       PASS
```

Final Stage-2 diff review found no requestId/token exposure, no browser-visible sidecar credential, no generic Viewer order endpoint, and no expansion of execution authority beyond the existing trusted current-Detail BUY composition.

**Stage-2 disposition:** `PASS`. No known material order/Basic-BUY defect or material unproved Stage-2 risk remains after these fixes and verification.

## Remaining high-risk deep-review queue

Stage 2 is removed from the queue. Remaining mandatory deep-review hotspots:

1. `browser/replay/portable-recording.js`
2. `browser/replay/recording-store.js`
3. `browser/replay/market-player.js`
4. `browser/replay/player-controller.js`
5. `replay-host/host.js` + `browser/replay/replay-run-coordinator.js`
6. shared `local-service/server/{config,index,service}.js`
7. Viewer `client.js` / `detail-surface.js` cross-feature boundary
8. protocol/diagnostics/launcher/build/New Trading Day/CI routing.

## Review-family state

| Area | State | Notes |
|---|---|---|
| Standalone IBKR intent/security/store/service | PASS | Stage 2 static review + focused/broad verification |
| CPGW adapter + LIVE authority/reconciliation | PASS | Stage 2; cancellation bug fixed/regression-proven |
| Basic BUY tickets/sidecar/confirmation | PASS | Stage 2; uncertainty recovery bug fixed/regression-proven |
| Detail BUY UI/client path | PASS_STAGE2 | Execution boundary reviewed; ordinary/shared regression rechecked again in `7.6.4` |
| Replay recorder + IndexedDB storage | ROUTED | `7.6.3` |
| Portable recording + file source/index | ROUTED | `7.6.3` |
| Player/controller/scheduling/time projection | ROUTED | `7.6.3` |
| Replay Host/security/run coordinator | ROUTED | `7.6.3` |
| Shared market-service config/index/service | ROUTED | `7.6.4` |
| Shared Viewer/protocol/diagnostics seams | ROUTED | `7.6.4` |
| Launchers/build/package/acceptance scripts | ROUTED | Feature/shared review; final executable reclosure in `7.6.5` |
| Cross-feature isolation + ordinary runtime regression | ROUTED | `7.6.4` |
| Full deterministic reclosure gates | PENDING | `7.6.5` |

## Audit defects so far

1. **Planning validator stale after replan** — old 52-node/39-leaf/Chat27=`7.4` assumptions; fixed in PR #64 and post-merge Planning CI green.
2. **IBKR pending cancellation reported terminal** — fixed and regression-proven in Stage 2.
3. **Basic BUY unknown acknowledgement lost same-order recovery handle** — fixed and regression-proven in Stage 2, including reply transport uncertainty and transient reconciliation failure.

## Completion condition

This report becomes overall `PASS` only when Stages `7.6.3`–`7.6.5` are also PASS, every material production/runtime area has an explicit reviewed disposition, no known material defect or material unproved review risk remains, required deterministic gates are green, audit PR/main closure is clean, and one exact audited runtime candidate is pinned for TREE `7.4`.
