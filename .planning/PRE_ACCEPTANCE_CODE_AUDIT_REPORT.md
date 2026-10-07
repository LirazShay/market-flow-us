# Market Flow US — Pre-Acceptance Extension Code Audit Report

## Audit identity

Status: `IN_PROGRESS`

Exact review range entering the audit:

```text
base: e0af9d105004f175a44ec33fa481fba0631773bf
head: 93a48c8b0a36433e58f09f6a607ec7cd366c9aea
commits: 35
```

The base is the completed post-Demo-Buy/AI deterministic reclosure (`7.5`). The head is the combined runtime candidate after standalone IBKR/order, Recording/Replay/hardening and Basic BUY. Planning/evidence-only commits made by this audit do not replace the runtime candidate. If `7.6` fixes runtime code, the final audited candidate recorded here will change accordingly.

## Stage matrix

| TREE node | Stage | State | Evidence / findings |
|---|---|---|---|
| `7.6.1` | Exact delta inventory + contract/proof map | PASS | Exact 35-commit delta inventoried; every material production/runtime/packaging file routed below to governing contract, risk, deterministic proof and deep-review owner |
| `7.6.2` | IBKR order service + Basic BUY deep audit | PENDING | Routed from Stage 1; no deep-review disposition claimed yet |
| `7.6.3` | Recording/Replay/Host deep audit | PENDING | Routed from Stage 1; no deep-review disposition claimed yet |
| `7.6.4` | Shared integration/regression audit | PENDING | Routed from Stage 1; no deep-review disposition claimed yet |
| `7.6.5` | Adversarial verification + deterministic reclosure | PENDING | Runs only after all deep-review stages are PASS |

## Stage 1 scope method

`git compare` over the exact base/head showed 35 commits. Pure planning/docs files were read as governing authority inputs but are not counted as production runtime code. Tests are evidence routes, not production inventory. Workflow/build/launcher/acceptance files are included because they can change what product is built, started or verified.

Historical green CI is retained as evidence but is not treated as proof-by-assertion: Stages 2–4 must inspect implementation and tests together, including success, failure, cleanup, restart, duplicate/retry and security paths.

## Production/runtime inventory and routing

### A. Standalone IBKR order service — Stage `7.6.2`

Governing contracts: `docs/IBKR_ORDER_SERVICE.md`, `docs/IBKR_ORDER_SERVICE_SECURITY.md`, relevant `docs/TECHNICAL_SPEC.md` and `docs/TEST_STRATEGY.md` sections.

Primary existing proof route: `tests/unit/ibkr-order-intent.test.mjs`, `tests/unit/ibkr-order-operator.test.mjs`; `tests/service/ibkr-order-service-*.test.mjs`; `RUN_IBKR_ORDER_ACCEPTANCE.cmd` / `scripts/run-order-service-acceptance.mjs`; `npm run test:acceptance:order`.

| Files | Risk focus | Initial disposition |
|---|---|---|
| `ibkr-order-service/intent.js` | normalization, supported BUY/SELL/LMT/MKT/DAY/GTC domain, finite quantity/price, fingerprint stability | ROUTED → `7.6.2` |
| `ibkr-order-service/security.js` | loopback caller authentication, browser-origin rejection, token comparison/handling | ROUTED → `7.6.2` |
| `ibkr-order-service/operator-config.js` | DRY_RUN default, explicit LIVE opt-in, CPGW URL/TLS/config validation | ROUTED → `7.6.2` |
| `ibkr-order-service/operator.js`; `ibkr-order-service/index.js` | startup/shutdown, token ownership, error/exit semantics | ROUTED → `7.6.2` |
| `ibkr-order-service/fake-adapter.js`; `ibkr-order-service/fake-live-adapter.js` | deterministic proof fidelity, no accidental real submit, lifecycle simulation completeness | ROUTED → `7.6.2` |
| `ibkr-order-service/order-authority.js` | requestId idempotency, same/different-intent behavior, preview/DRY_RUN authority | ROUTED → `7.6.2` |
| `ibkr-order-service/live-gates.js` | complete fail-closed gate conjunction, SELL long-position guard | ROUTED → `7.6.2` |
| `ibkr-order-service/store.js` | durable idempotency/provider-state persistence, restart semantics, transaction/SQL correctness, privacy | HIGH-RISK ROUTED → `7.6.2` |
| `ibkr-order-service/cpgw-adapter.js` | authenticated provider lifecycle, scoped localhost TLS, parsing/redaction, error/reply/cancel/reconcile paths | HIGH-RISK ROUTED → `7.6.2` |
| `ibkr-order-service/live-order-authority.js` | submit boundary, REPLY_REQUIRED, ACKNOWLEDGEMENT_UNKNOWN, reconciliation, fill/cancel semantics | HIGH-RISK ROUTED → `7.6.2` |
| `ibkr-order-service/service.js` | HTTP routing/security/body bounds/auth-before-mutation, zero provider calls on rejection, shutdown | HIGH-RISK ROUTED → `7.6.2` |

Any new/materially changed SQL discovered during Stage 2 remains subject to the `AGENTS.md` 10+ stage static SQL gate before execution.

### B. Basic in-product BUY — Stage `7.6.2`

Governing contract: `docs/BASIC_BUY_INTEGRATION.md`, consuming the completed standalone order-service/security contracts.

Primary proof route: `tests/unit/basic-buy-*.test.mjs`; `tests/service/basic-buy-*.test.mjs`; `tests/e2e/basic-buy-detail-surface.spec.mjs`; affected `detail-surface`, `viewer-client`, service-config and launcher tests.

| Files | Risk focus | Initial disposition |
|---|---|---|
| `local-service/orders/basic-buy-tickets.js` | immutable intent, expiry/reuse/consume state, requestId stability | HIGH-RISK ROUTED → `7.6.2` |
| `local-service/orders/basic-buy-sidecar.js` | child/token ownership, startup/readiness/failure/restart cleanup, token never crossing browser boundary | HIGH-RISK ROUTED → `7.6.2` |
| `local-service/orders/basic-buy-confirmation.js` | trusted Origin, CSRF/custom-header/ticket checks, double-click/retry, explicit confirm, error/reply/unknown handling | HIGH-RISK ROUTED → `7.6.2` |
| `browser/viewer/client.js` | BUY prepare protocol exposure only, no generic execution mutation surface | ROUTED → `7.6.2` + shared recheck `7.6.4` |
| `browser/viewer/detail-surface.js` | current-Detail-only eligibility, stale/security identity, UI double action and ordinary Detail regression | ROUTED → `7.6.2` + shared recheck `7.6.4` |

### C. Recording + Replay browser runtime — Stage `7.6.3`

Governing contracts: `docs/MARKET_REPLAY.md`, `docs/REPLAY_HARDENING.md`, plus affected data/test contracts.

Primary proof route: Replay unit suite, `tests/service/replay-*.test.mjs`, Replay Chromium specs, `npm run test:acceptance:replay`, `npm run build:replay`.

| Files | Risk focus | Initial disposition |
|---|---|---|
| `browser/replay/index.js` | composition/bootstrap isolation, no live-path contamination | ROUTED → `7.6.3` |
| `browser/replay/market-recorder.js` | Start/Stop ownership, in-flight write ordering, provider/storage failure | HIGH-RISK ROUTED → `7.6.3` |
| `browser/replay/recording-model.js` | metadata/frame invariants, bounded public-safe projection | ROUTED → `7.6.3` |
| `browser/replay/recording-store.js` | IndexedDB transactions, quota/write failure, reopen/delete/rename, prior-commit preservation | HIGH-RISK ROUTED → `7.6.3` |
| `browser/replay/recording-surface.js` | stale UI state, destructive action confirmation/state consistency | ROUTED → `7.6.3` |
| `browser/replay/portable-recording.js` | strict manifest/frame/footer parser, truncation/malformed/version/count/order handling, streaming export | HIGH-RISK ROUTED → `7.6.3` |
| `browser/replay/recording-source.js` | File/IndexedDB source equivalence, byte-offset index, seek/frame-boundary correctness | HIGH-RISK ROUTED → `7.6.3` |
| `browser/replay/market-player.js` | irregular scheduler, timestamp rebasing, Pause/Resume/Stop/Seek generation cancellation, stale callbacks | HIGH-RISK ROUTED → `7.6.3` |
| `browser/replay/player-controller.js` | concurrent source/load/play lifecycle, stale async completion, error recovery | HIGH-RISK ROUTED → `7.6.3` |
| `browser/replay/player-surface.js` | controls/readiness/stale button state, seek semantics | ROUTED → `7.6.3` |
| `browser/replay/replay-host-client.js` | Host credential/origin lifecycle, stale/unauthorized control handling | HIGH-RISK ROUTED → `7.6.3` |
| `browser/replay/replay-run-coordinator.js` | fresh-run vs same-run authority, teardown/start races, late session cleanup | HIGH-RISK ROUTED → `7.6.3` |

### D. Replay Host — Stage `7.6.3`

Governing contracts: `docs/MARKET_REPLAY.md`, `docs/REPLAY_HARDENING.md`.

Primary proof route: `tests/service/replay-host.test.mjs`, `tests/service/replay-host-race.test.mjs`, player-host lifecycle unit proof and focused Replay acceptance.

| Files | Risk focus | Initial disposition |
|---|---|---|
| `replay-host/config.js` | loopback ports/paths/origin validation, no live-DB ambiguity | ROUTED → `7.6.3` |
| `replay-host/security.js` | ephemeral credential, exact Origin, stale/unauthorized rejection | ROUTED → `7.6.3` |
| `replay-host/host.js` | foreign-port refusal, owned-child-only stop, replay DB ownership/reset, spawn/teardown races | HIGH-RISK ROUTED → `7.6.3` |
| `replay-host/index.js` | startup/exit/cleanup behavior and no credential logging | ROUTED → `7.6.3` |

### E. Shared runtime seams — Stage `7.6.4`

Governing authority: generic product/data/technical/test contracts plus Basic BUY/Replay isolation invariants.

Primary proof route: existing config/protocol/diagnostics/release-runtime unit tests, service suite, full Chromium, bounded Local Fake, focused order/replay acceptance.

| Files | Risk focus | Initial disposition |
|---|---|---|
| `local-service/server/config.js` | opt-in BUY config, default ordinary-runtime behavior, port/db/origin validation | HIGH-RISK ROUTED → `7.6.4` |
| `local-service/server/index.js` | composition/startup/shutdown, sidecar ownership, ordinary runtime execution-disabled | HIGH-RISK ROUTED → `7.6.4` |
| `local-service/server/service.js` | protocol handlers, prepare-only BUY seam, no generic browser execution proxy, ordinary service regression | HIGH-RISK ROUTED → `7.6.4` |
| `shared/protocol/index.js` | additive protocol surface, Replay-unaware server contract, message validation drift | ROUTED → `7.6.4` |
| `shared/diagnostics/index.js` | bounded sanitized order/replay component naming, no token/ticket/session leakage | ROUTED → `7.6.4` |
| `browser/viewer/client.js`; `browser/viewer/detail-surface.js` | cross-feature ordinary Viewer/Detail regression and execution isolation | ROUTED → `7.6.4` after Stage 2 feature audit |

### F. Operator/launcher/build/acceptance wiring — Stages `7.6.2`, `7.6.3`, `7.6.4`, final `7.6.5`

Primary proof route: `tests/unit/windows-launchers.test.mjs`, `tests/unit/ibkr-order-operator.test.mjs`, `tests/unit/replay-build.test.mjs`, release-runtime/config tests, focused acceptance commands and CI jobs.

| Files | Owner / risk focus | Initial disposition |
|---|---|---|
| `CHECK_IBKR_SESSION.cmd`; `START_IBKR_ORDER_SERVICE.cmd`; `RUN_IBKR_ORDER_ACCEPTANCE.cmd`; `scripts/check-ibkr-cpgw-session.mjs`; `scripts/run-order-service-acceptance.mjs` | `7.6.2`: safe operator defaults, no secret output, correct sidecar/session boundary | ROUTED |
| `START_MARKET_FLOW_US_WITH_BUY.cmd` | `7.6.2` + `7.6.4`: DRY_RUN default, explicit LIVE, quantity/origin validation, no token exposure | HIGH-RISK ROUTED |
| `START_MARKET_REPLAY.cmd`; `scripts/build-replay-browser.mjs` | `7.6.3` + `7.6.4`: opt-in Replay, isolated build/Host lifecycle | ROUTED |
| `NEW_TRADING_DAY.cmd` | `7.6.4`: must not own replay/order DBs | ROUTED |
| `package.json` | `7.6.4`: command routing/defaults and no accidental ordinary-suite Replay cost | ROUTED |
| `.github/workflows/fast-ci.yml`; `.github/workflows/replay-ci.yml` | `7.6.4`/`7.6.5`: correct proof routing, no hidden skips/redundant excessive cost | ROUTED |

`START_HERE.md` and the extension contracts/docs are operator/contract documentation, not executable production code; they remain drift inputs for Stages 4–5 rather than production runtime inventory.

## Existing deterministic proof families discovered

Stage 1 confirms meaningful direct proof exists for all major feature families; the presence of these tests does not yet imply deep-audit PASS.

- **Order core:** intent/operator unit proof plus bind/security/idempotency/live-gate/live-store/live-authority/live-HTTP/CPGW service tests and focused order acceptance.
- **Basic BUY:** protocol/ticket/sidecar/client unit proof; prepare/confirmation/security/execution/unknown-restart service proof; Detail Chromium proof.
- **Replay:** recorder/storage/portable/source/player/controller/host hardening unit/service tests, Replay Chromium specs and focused Replay acceptance.
- **Shared seams:** `service-config`, `protocol`, `diagnostics`, `release-runtime-audit`, `viewer-client`, `detail-surface`, launcher tests, full service/Chromium and bounded Local Fake.
- **Packaging:** launcher/build/operator tests plus dedicated acceptance scripts and CI workflow routing.

## High-risk deep-review queue

The inventory identifies the following as mandatory line-by-line/branch-path deep-review hotspots rather than presumed PASS:

1. `ibkr-order-service/store.js`
2. `ibkr-order-service/cpgw-adapter.js`
3. `ibkr-order-service/live-order-authority.js`
4. `ibkr-order-service/service.js`
5. `local-service/orders/basic-buy-{tickets,sidecar,confirmation}.js`
6. `browser/replay/portable-recording.js`
7. `browser/replay/recording-store.js`
8. `browser/replay/market-player.js`
9. `browser/replay/player-controller.js`
10. `replay-host/host.js` + `browser/replay/replay-run-coordinator.js`
11. shared `local-service/server/{config,index,service}.js`
12. Viewer `client.js` / `detail-surface.js` interaction boundary.

These are review priorities, not defects.

## Required review families

| Area | State | Notes |
|---|---|---|
| Standalone IBKR intent/security/store/service | ROUTED | Deep review in `7.6.2` |
| CPGW adapter + LIVE authority/reconciliation | ROUTED | Deep review in `7.6.2` |
| Basic BUY tickets/sidecar/confirmation | ROUTED | Deep review in `7.6.2` |
| Detail BUY UI/client path | ROUTED | Feature review `7.6.2`, shared regression review `7.6.4` |
| Replay recorder + IndexedDB storage | ROUTED | Deep review in `7.6.3` |
| Portable recording + file source/index | ROUTED | Deep review in `7.6.3` |
| Player/controller/scheduling/time projection | ROUTED | Deep review in `7.6.3` |
| Replay Host/security/run coordinator | ROUTED | Deep review in `7.6.3` |
| Shared market-service config/index/service | ROUTED | Deep review in `7.6.4` |
| Shared Viewer/protocol/diagnostics seams | ROUTED | Deep review in `7.6.4` |
| Launchers/build/package/acceptance scripts | ROUTED | Feature review + shared review; executable reclosure in `7.6.5` |
| Cross-feature isolation + ordinary runtime regression | ROUTED | `7.6.4` |
| Full deterministic reclosure gates | PENDING | `7.6.5` |

## Defects

No runtime defect was classified in Stage 1 because this stage is inventory/routing, not a substitute for code review. One planning-infrastructure defect was already found during the replan: Planning Docs CI encoded the old 52-node/39-leaf/Chat-27=`7.4` truth. Root cause was hard-coded frozen-plan assertions; the validator was updated to preserve historical review assertions while validating the new 58-node/44-leaf allocation, and PR #64 plus post-merge main Planning CI were green.

## Completion condition

This report may become overall `PASS` only when every material production/runtime area above has an explicit deep-reviewed disposition, no known material defect or material unproved review risk remains, required deterministic gates are green, and one exact audited runtime candidate is pinned for TREE `7.4`.
