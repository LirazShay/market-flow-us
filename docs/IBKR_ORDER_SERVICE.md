# Market Flow US — IBKR Order Service Contract

## Ownership

This document is the durable product/technical contract for the standalone Interactive Brokers order-execution mini-project.

For branch `8` it supersedes older generic statements that Market Flow US contains no real-order capability. Those older statements remain historically correct for Scanner, Demo Buy and AI Investigation: **none of those features may place broker orders in this mini-project**.

Planning rationale and provider-research notes live in `.planning/IBKR_ORDER_MINI_PROJECT.md`. Verification belongs in `docs/TEST_STRATEGY.md` after the branch-8 planning freeze.

## 1. Product boundary

Add one isolated local process beside the existing product:

```text
Market Flow US analysis runtime
  ws://127.0.0.1:8765
  -> existing market-data/service/DuckDB path

ibkr-order-service
  http://127.0.0.1:8770
  -> HTTPS localhost Client Portal Gateway
  -> Interactive Brokers
```

The mini-project does **not** wire Scanner, Demo Buy, AI Investigation or Current directly to live orders. A later integration project may consume the stable local order-service API.

The existing market-data service and database remain authoritative for market analysis. The order service has its own narrow execution responsibility and may reuse the repository's existing DuckDB dependency only for local idempotency/reconciliation facts.

## 2. Provider boundary

Use the first-party Interactive Brokers Client Portal Web API through Client Portal Gateway (`CPGW`) for the initial individual-account path.

Expected default provider base URL:

```text
https://localhost:5000/v1/api
```

Provider authentication is user-owned and manual in the browser on the same machine. The service never automates gateway login and never stores IBKR credentials.

The provider adapter must support the documented sequence needed by the order lifecycle, including brokerage-session status/init, account discovery, contract resolution, market-data snapshot prerequisite, what-if preview, order submission, reply/confirmation handling, open-order/trade observation, cancellation and keepalive.

The implementation must not bypass an IBKR permission, session, account or confirmation requirement.

## 3. Security and privacy

The repository remains public-safe.

Never commit, persist in fixtures, log, report or include in support diagnostics:

```text
username/password
cookies/session tokens
real account identifiers
private browser state
raw authenticated IBKR dumps
```

A selected provider account identifier may exist only in process memory for the active provider call. It is not persisted to the local execution database and is redacted from diagnostics.

Synthetic tests use unmistakably fake identifiers.

The service listens on loopback only. No LAN/public listener is part of this mini-project.

## 4. TLS boundary

`CPGW` may present a localhost certificate that is not trusted by the operating-system trust store.

If certificate verification must be relaxed for the gateway connection, the exception must be scoped to the configured loopback CPGW client only.

Forbidden:

```text
process-global TLS verification disable
NODE_TLS_REJECT_UNAUTHORIZED=0
TLS weakening for non-loopback hosts
```

## 5. Runtime modes

The service is fail-closed.

### `DRY_RUN` — default

`DRY_RUN` may:

- validate normalized order intent;
- resolve/simulate the contract through a fake adapter;
- optionally perform safe real gateway session/account/contract/read-only checks;
- build the exact provider order payload;
- perform deterministic synthetic preview;
- perform provider `what-if` preview when the authenticated gateway allows it.

`DRY_RUN` must never call the actual order-submit endpoint.

### `LIVE` — explicit future enablement

Actual submit is allowed only when all are true:

1. the process was explicitly started with live submission enabled;
2. the request explicitly requests `LIVE` execution;
3. CPGW reports a valid brokerage session;
4. account discovery returns a tradable account selected at runtime;
5. provider permission for the requested trade is available;
6. the instrument resolves unambiguously;
7. required market-data snapshot preflight succeeds;
8. provider `what-if` preview succeeds;
9. local validation and risk guards succeed.

Any missing condition is a diagnosable rejection, never a fallback or bypass.

## 6. Initial instrument/order scope

Initial supported security:

```text
U.S. equity
secType = STK
currency = USD
exchange = SMART
```

Initial supported order dimensions:

```text
side:       BUY | SELL
orderType:  LMT | MKT
tif:        DAY | GTC
quantity:   positive finite quantity
```

Rules:

- `LMT` requires a positive finite `limitPrice`;
- `MKT` forbids `limitPrice`;
- unsupported security/order combinations fail closed;
- no short-opening support in this mini-project;
- a live SELL may not intentionally exceed the known long position;
- margin/leverage strategy is outside scope.

## 7. Canonical local order intent

Example normalized intent:

```json
{
  "requestId": "caller-generated-idempotency-key",
  "instrument": {
    "symbol": "AAPL",
    "secType": "STK",
    "currency": "USD",
    "exchange": "SMART"
  },
  "side": "BUY",
  "quantity": 1,
  "orderType": "LMT",
  "limitPrice": 100.0,
  "tif": "DAY",
  "executionMode": "DRY_RUN"
}
```

The browser/consumer never supplies a provider account identifier as durable product state.

The provider adapter resolves the normalized instrument to the provider contract identifier and converts the normalized order intent to documented IBKR order fields.

## 8. Local API

Target loopback JSON API:

```text
GET  /health
GET  /session
POST /session/init
POST /instruments/resolve
POST /orders/preview
POST /orders
POST /orders/{localOrderId}/confirm
POST /orders/{localOrderId}/cancel
GET  /orders
GET  /orders/{localOrderId}
GET  /trades
```

Implementation may make small naming adjustments only if the observable contract remains equally narrow, explicit and integration-ready.

No credential-accepting endpoint is allowed.

## 9. Order lifecycle

Live-capable lifecycle:

```text
validate local intent
-> verify provider/gateway availability
-> verify brokerage session
-> discover/select runtime account
-> resolve symbol -> provider contract
-> market-data snapshot preflight
-> what-if preview
-> validate preview/result
-> submit only if LIVE is explicitly armed
-> immediate provider result OR reply-required state
-> explicit confirmation when required
-> reconcile open-order/trade state
-> cancel when requested
```

Unknown/unmodeled provider confirmation questions fail closed. The first implementation must not globally suppress provider warnings/questions.

## 10. Idempotency

`requestId` is mandatory for order creation.

Rules:

```text
same requestId + same normalized intent
  -> return/reconcile the existing local order result

same requestId + different normalized intent
  -> reject
```

No blind duplicate submission is permitted.

A local `localOrderId` is product-owned and must not reveal a real provider account identifier.

## 11. Submit acknowledgement and reconciliation

Transport loss after a provider submit may leave the remote outcome uncertain.

Local state must distinguish at least:

```text
DRY_RUN_COMPLETE
PREVIEW_REJECTED
READY_TO_SUBMIT
REPLY_REQUIRED
SUBMITTED
PROVIDER_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
CANCELLED
PARTIALLY_FILLED
FILLED
```

Exact internal names may differ, but the semantics must remain explicit.

`ACKNOWLEDGEMENT_UNKNOWN` means:

- do not claim rejection;
- do not blind-retry the provider submit;
- reconcile against provider open-order/trade state first;
- only a later explicit, proven-safe action may issue a new submit.

## 12. Provider reply/confirmation

If IBKR returns a reply/confirmation requirement rather than final submission:

```text
provider reply
-> store only sanitized pending-confirmation facts
-> expose `REPLY_REQUIRED`
-> require explicit caller confirmation
-> submit provider reply confirmation
-> continue reconciliation
```

The service does not automatically answer unknown provider questions.

## 13. Cancellation

Cancellation is explicit and idempotent from the caller perspective.

The service must reconcile the latest known provider state before/after cancellation and report terminal/non-terminal outcomes without inventing success.

Cancellation after a fill cannot be reported as cancelling the already-filled quantity.

## 14. Local persistence

Use the smallest durable local mechanism required for restart-safe idempotency and reconciliation. Reuse the existing DuckDB dependency unless implementation evidence proves it unsuitable.

Persist only execution facts required for:

- caller `requestId` idempotency;
- normalized intent fingerprint;
- product-owned local order ID;
- sanitized provider order/reference identifiers when required for reconciliation;
- last known lifecycle state;
- bounded timestamps/diagnostic state.

Never persist:

```text
real provider account identifier
credentials
cookies/session tokens
raw authenticated provider response
```

## 15. Position guard

The initial live SELL guard prevents intentional short opening.

Before a live SELL, the service must obtain/reconcile enough provider position information to establish that requested sell quantity does not exceed the known long quantity available under the initial contract.

If that cannot be established, the live SELL fails closed.

This is a safety guard, not a portfolio/risk engine.

## 16. Session lifecycle and keepalive

The adapter must expose diagnosable session states and handle provider keepalive using the documented gateway mechanism.

The service must tolerate session expiry by returning a stable unauthenticated/session-required state. It must not silently attempt credential login.

## 17. Diagnostics

Reuse the existing diagnosability model:

```text
component
operation/checkpoint
stable error code
last successful checkpoint
sanitized causal message
```

Expected failure families:

```text
gateway unavailable
not authenticated
brokerage session unavailable
no tradable account
trading permission unavailable
ambiguous/unresolved instrument
invalid order intent
snapshot preflight failure
what-if rejection
provider reply required
provider rejection
submit acknowledgement unknown
reconciliation failure
cancel failure
session timeout
```

Diagnostics never contain credentials, account IDs, raw provider bodies or private browser state.

## 18. Deterministic synthetic provider

Build one deterministic fake IBKR gateway/adapter covering at least:

- disconnected / not-authenticated / authenticated;
- empty / non-empty tradable account discovery;
- exact / missing / ambiguous contract resolution;
- required snapshot preflight;
- what-if success / rejection;
- exact BUY and SELL provider payload translation;
- immediate submit success;
- reply-required then confirm success/rejection;
- provider failure before submit;
- transport loss after submit;
- open-order reconciliation after uncertain acknowledgement;
- cancellation success/failure;
- partial fill / fill observation;
- session timeout / keepalive;
- long-position SELL guard;
- restart-safe `requestId` idempotency.

All fixtures are synthetic/public-safe.

## 19. Packaging

Provide a standalone Windows/operator path for the service. It must make the default `DRY_RUN` mode obvious and require an explicit opt-in to enable live submission.

No committed config file may contain account identity or authentication data.

The existing Market Flow US runtime continues to start independently.

## 20. Integration-ready boundary

Branch `8` ends with a stable local API and does **not** directly connect Scanner/Demo Buy to order submission.

Future integration should consume the same normalized order-service contract rather than bypassing it to call IBKR directly.

This separation lets execution be tested and permission-gated independently from strategy selection.

## 21. Non-goals

Not part of this mini-project:

```text
automatic Scanner -> live trade
Demo Buy -> live trade
AI Investigation -> live trade
short selling
options/futures/FX
bracket/OCA/algo orders
margin/leverage optimization
portfolio strategy/position sizing engine
credential storage
automated CPGW login
permission/authentication bypass
cloud order service
```

## 22. Completion

Software implementation is complete when deterministic proof establishes:

- strict normalized BUY/SELL validation;
- exact provider payload translation;
- dry-run and what-if behavior;
- fail-closed live gate;
- reply-required handling;
- idempotency and acknowledgement-unknown reconciliation;
- cancellation and order/trade observation;
- restart-safe local execution facts;
- position guard for SELL;
- public-safe diagnostics;
- standalone packaging and future integration boundary;
- required unit/service/acceptance CI is green and the implementation is merged to `main`.

If the user's brokerage account still lacks trading permission, actual live-money submission remains:

```text
PENDING_EXTERNAL_PERMISSION
```

That external state must never be replaced with fabricated live evidence and does not by itself prevent declaring the **software** implementation complete once every permission-independent contract is proven.