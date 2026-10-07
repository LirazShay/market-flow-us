# Basic In-Product BUY Integration Contract

## Ownership

This document owns the smallest first in-product BUY integration requested after Replay hardening and before final target-machine acceptance.

It extends the completed Branch-8 standalone order-service contract without replacing it. `docs/IBKR_ORDER_SERVICE.md` and `docs/IBKR_ORDER_SERVICE_SECURITY.md` remain authoritative for provider lifecycle, localhost caller authentication, idempotency, DRY_RUN/LIVE gates, reply handling, acknowledgement-unknown reconciliation and privacy.

This first integration is deliberately narrow. It does not turn Scanner, Demo Buy, Replay or the market-data service into an automatic trading engine.

## 1. Goal

From a normal live Market Flow US Detail screen, the user can explicitly request one BUY for the currently displayed security using a simple per-run quantity configuration while all execution authority remains inside the existing authenticated `ibkr-order-service`.

Target user flow:

```text
normal live Detail
→ explicit BUY action
→ immutable BUY ticket prepared from Node-owned current authority + run configuration
→ trusted local confirmation page
→ explicit human confirmation
→ existing ibkr-order-service API
→ deterministic result / rejection / reply-required / acknowledgement-unknown state
```

The browser never calls IBKR or the order-service directly.

## 2. Initial MVP scope

The first integration supports exactly:

```text
surface:       Detail only
side:          BUY only
quantity:      one positive finite quantity configured for the current product run
security:      current U.S. equity only
secType:       STK
currency:      USD
exchange:      SMART
orderType:     MKT
tif:           DAY
executionMode: run-owned DRY_RUN or LIVE
```

Not in this MVP:

```text
SELL
Scanner-to-order automation
Demo Buy-to-order automation
Replay-to-order execution
Current-row direct order buttons
LMT price entry
per-order quantity editing in the provider page
amount-in-dollars sizing
portfolio/risk engine
bracket/OCA/algo orders
bulk orders
background/automatic execution
```

Those require later explicit planning.

## 3. Detail eligibility and broker instrument projection

The BUY action is available only for a Detail model backed by a current authoritative row.

Node resolves the selected `securityId` against current market authority and constructs the broker instrument itself:

```text
symbol   = authoritative current-row Symbol
secType  = STK
currency = USD
exchange = SMART
```

The browser does not supply broker symbol/secType/currency/exchange in the final order intent.

Historical-only Detail is not order-eligible. Missing/empty/ambiguous `Symbol` fails closed.

`securityId = String(PaperId)` remains market-data identity only; it is never treated as the IBKR contract identifier.

## 4. Per-run configuration

Use one dedicated thin operator path for BUY-enabled Market Flow US. The planned Windows entry is:

```text
START_MARKET_FLOW_US_WITH_BUY.cmd
```

The normal `START_MARKET_FLOW_US.cmd` keeps its existing non-order semantics.

The BUY-enabled launcher:

1. validates Node/setup exactly like the normal launcher;
2. obtains the exact authenticated provider Origin exactly as the normal launcher does;
3. requires one explicit positive finite BUY quantity for the run;
4. starts in `DRY_RUN` unless the operator explicitly invokes the dedicated path with literal `LIVE` intent;
5. starts the market service in BUY-enabled composition;
6. the market service starts its own `ibkr-order-service` child and receives the sidecar caller token through the existing IPC ready seam;
7. if the child does not become ready cleanly, BUY stays unavailable and no foreign process is reused.

Quantity and execution mode live in process memory for the run. They are not editable from the provider page and are not persisted as credentials/private brokerage state.

Changing quantity or DRY_RUN/LIVE mode requires restarting the BUY-enabled composition.

## 5. Why browser-to-sidecar access remains forbidden

The authenticated provider page is not a trusted secret store. Any script running in that page origin may attempt localhost/WebSocket calls or monkey-patch browser APIs.

Therefore this integration must **not**:

```text
expose the ibkr-order-service caller token to browser JavaScript
put that token in the bookmarklet, DOM, localStorage, sessionStorage or URL
allow CORS from the provider Origin to 127.0.0.1:8770
allow the provider page to POST arbitrary normalized order JSON through a generic market-service proxy
trust WebSocket Origin alone as order authorization
```

The Branch-8 browser-origin rejection remains intact.

## 6. Trusted integration seam

The market service may hold the sidecar caller token only in Node process memory because it starts/owns that sidecar child.

The provider-page Viewer gets **no order-service credential**.

The Viewer-facing WebSocket may expose only a narrow preparation operation conceptually equivalent to:

```text
order.buy.prepare({ securityId })
```

Preparation:

- is available only when BUY-enabled composition is healthy;
- resolves `securityId` from current Node authority;
- freezes the exact server-constructed BUY intent using run-owned quantity/mode and fixed MKT/DAY/STK/USD/SMART values;
- allocates a cryptographically random, short-lived one-time ticket plus one stable server-generated order `requestId`;
- performs **zero** order-service/provider calls;
- performs **zero** execution-store mutation;
- returns only a bounded local confirmation URL/ticket reference and display-safe summary.

The provider page cannot submit, confirm, cancel or mutate an order through WebSocket.

## 7. Trusted local confirmation page

Actual order mutation is reachable only through a product-owned local confirmation page served by the BUY-enabled Market Flow US service on its existing loopback HTTP listener.

The page is intentionally a different Origin from the authenticated provider page.

Required response protections include the functional equivalent of:

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
frame-ancestors 'none'
object-src 'none'
base-uri 'none'
form-action 'self'
no permissive CORS
```

The confirmation ticket is transferred in a URL fragment or equivalent mechanism that does not enter normal HTTP referrer/server path logging.

The local page receives a fresh per-page anti-CSRF nonce from the local service. Any state-changing local confirmation endpoint requires all of:

```text
same local Origin
application/json
short-lived immutable BUY ticket
per-page anti-CSRF nonce/custom header
explicit user confirmation
```

Cross-origin browser requests, simple form posts, missing/wrong nonce, expired/reused ticket and unsupported content types fail before any sidecar call.

The confirmation page must not accept browser-supplied replacements for symbol, quantity, side, orderType, tif or executionMode.

## 8. Human confirmation semantics

The local confirmation page displays at minimum:

```text
securityId
paper/display name when available
broker symbol
quantity
BUY
MKT
DAY
DRY_RUN or LIVE
```

For `LIVE`, the page must make LIVE state unmistakable and require an explicit confirmation click after the immutable intent is displayed.

Opening the page is not confirmation. Merely preparing a ticket is not confirmation.

The page may obtain a sanitized preview through the existing order-service preview boundary before enabling final confirmation. A failed preview leaves submission unavailable.

## 9. Order-service call ownership

After explicit trusted-page confirmation, Node constructs the exact normalized Branch-8 intent and calls the existing protected local API using the Node-held sidecar caller token.

Conceptually:

```json
{
  "requestId": "server-generated-stable-idempotency-key",
  "instrument": {
    "symbol": "NODE_RESOLVED_SYMBOL",
    "secType": "STK",
    "currency": "USD",
    "exchange": "SMART"
  },
  "side": "BUY",
  "quantity": "RUN_CONFIGURED_QUANTITY",
  "orderType": "MKT",
  "tif": "DAY",
  "executionMode": "RUN_CONFIGURED_MODE"
}
```

The real request uses the existing order-service schema/types; the example above illustrates ownership, not a new API.

The market service does not duplicate provider validation, contract resolution, what-if, reply handling, LIVE gates, idempotency or reconciliation logic. Those remain inside `ibkr-order-service`.

## 10. Idempotency and duplicate-click safety

The server-generated `requestId` is created when the immutable ticket is prepared and remains bound to that ticket/intent.

Repeated confirmation delivery caused by double-click, local response retry or UI race must reuse the same `requestId` and same normalized intent.

The existing sidecar contract therefore remains authoritative:

```text
same requestId + same normalized intent
→ return/reconcile existing result

same requestId + different normalized intent
→ reject
```

The local integration never creates a fresh `requestId` merely because a response was delayed or lost.

## 11. Result and failure semantics

The confirmation page surfaces existing execution meaning instead of inventing optimistic UI states.

At minimum it distinguishes:

```text
DRY_RUN_COMPLETE
SUBMITTED / accepted provider state
REPLY_REQUIRED
PROVIDER_REJECTED or stable fail-closed rejection
ACKNOWLEDGEMENT_UNKNOWN
```

If the provider requires an explicit supported reply, the trusted local page may expose the existing Branch-8 confirm operation for that same local order. Unknown/unmodeled provider questions still fail closed.

`ACKNOWLEDGEMENT_UNKNOWN` is never shown as rejection and never causes blind resubmit. The page disables creating a second submit from that ticket and offers only existing safe status/reconciliation behavior.

## 12. Process ownership and shutdown

In BUY-enabled composition:

- Market Flow US starts one `ibkr-order-service` child through the existing IPC seam;
- it uses only the caller token received from that owned child;
- it never attaches to/reuses a foreign process merely because port 8770 responds;
- occupied/ambiguous sidecar ownership fails closed;
- normal service shutdown stops only the sidecar child it started;
- child/token state is discarded on shutdown/restart;
- token values never enter logs, support snapshots, diagnostics or browser responses.

Normal non-BUY launch, Replay Host and ordinary test/demo composition do not silently start an order sidecar.

## 13. Replay and synthetic isolation

Replay must not create live-order authority.

The Replay Host starts the normal service without BUY-enabled configuration. Therefore Replay Detail has no executable BUY action even if it reuses the same Detail component.

Fake Market/demo/browser tests may use a deterministic synthetic order adapter/composition only for proof. Synthetic success must never be mislabeled as live IBKR execution.

## 14. Diagnostics and privacy

Diagnostics may report bounded public-safe states such as:

```text
basicBuyEnabled
configuredMode = DRY_RUN | LIVE
sidecarState = starting | ready | unavailable | stopped
pendingTicket = true | false
lastBuyOutcomeClass
```

They must not report:

```text
sidecar caller token
anti-CSRF nonce
confirmation ticket value
provider account identifier
credentials/cookies/session material
raw authenticated provider responses
private browser state
```

Order-service privacy rules remain unchanged.

## 15. Mandatory deterministic proof

TREE `8.5` must prove at minimum:

### Configuration/composition

- normal launcher has no BUY capability/order child;
- BUY launcher requires valid quantity and defaults to DRY_RUN;
- LIVE requires deliberate explicit operator opt-in;
- sidecar child ownership/IPC token acquisition succeeds only for the child actually spawned;
- occupied/foreign sidecar port fails closed and is not reused.

### Detail and intent ownership

- only current Detail is eligible;
- historical-only/missing Symbol rejects;
- authoritative Node `Symbol` is used rather than browser-supplied broker identity;
- browser cannot override quantity/side/MKT/DAY/mode;
- prepare creates no provider call and no execution mutation.

### Browser/local-page security

- caller token is absent from browser runtime, DOM/storage/URLs/responses and diagnostics;
- provider Origin cannot call sidecar due unchanged Branch-8 origin policy;
- provider Origin cannot submit through the market service without the local-page nonce;
- simple form/text submission fails;
- wrong/expired/reused ticket or nonce fails before sidecar call;
- local page cannot be framed and uses no permissive CORS;
- normal Viewer/WebSocket Origin alone is insufficient to execute an order.

### Execution behavior

- synthetic DRY_RUN path performs zero provider submit;
- deterministic synthetic LIVE path proves all existing independent LIVE gates are still required;
- double-click/repeated confirmation produces at most one logical order through stable `requestId` reuse;
- sidecar rejection, provider rejection and unsupported reply are visible and distinct;
- supported `REPLY_REQUIRED` stays explicit;
- post-submit transport loss surfaces `ACKNOWLEDGEMENT_UNKNOWN` and does not blind-resubmit;
- restart invalidates browser/local-page ephemeral ticket/nonce/token state while existing sidecar execution idempotency facts remain safe.

### Regression/isolation

- existing order-service unit/service/acceptance remains green;
- existing market Fast/Browser/Planning materially affected gates remain green;
- Scanner, Demo Buy, AI Investigation and Replay remain disconnected from automatic execution;
- Replay cannot place a live order.

## 16. Completion evidence

TREE `8.5` is done only when:

- the Detail-only BUY integration matches this contract;
- no browser-visible sidecar credential exists;
- no generic browser-to-order proxy is introduced;
- DRY_RUN/LIVE/idempotency/reply/acknowledgement-unknown behavior is delegated to and consistent with the existing sidecar;
- focused synthetic composition/security/browser proof is green;
- materially affected repository gates are green;
- implementation PR is reviewed and squash-merged;
- main CI is green;
- open-PR audit is clean;
- durable status/execution/handoff advance to the next approved node.
