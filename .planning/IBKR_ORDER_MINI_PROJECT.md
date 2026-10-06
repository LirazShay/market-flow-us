# IBKR Order Service Mini-Project

## Purpose

Build a standalone Node.js buy/sell service beside Market Flow US so order execution can be developed and verified before the user's Interactive Brokers trading permissions are enabled. The service is intentionally not wired into Scanner/Demo Buy/Current yet; a later integration project will consume its stable local contract.

This planning extension supersedes the previous assumption that the repository contains no real-order execution capability, but it does not make live trading a prerequisite for implementation completion. Code must be complete and synthetic/dry-run proof must be green before any live permission exists.

## Provider choice

Use Interactive Brokers Client Portal Web API through Client Portal Gateway (CPGW) for the first-party individual-account path.

Provider facts verified against current IBKR documentation on 2026-10-06:

- CPGW base URL is `https://localhost:5000/v1/api` by default.
- CPGW authentication is performed manually in a browser on the same machine; automated gateway login is not supported.
- `/iserver/auth/status` reports brokerage-session state.
- `/iserver/auth/ssodh/init` initializes/reinitializes a brokerage session; after init, wait before using `/iserver`, then call `/iserver/accounts` and require a non-empty tradable-account list.
- `/iserver/accounts` must be called before modifying/querying orders and provides account capabilities.
- `/iserver/secdef/search` resolves IBKR contract identifiers (`conid`).
- `/iserver/marketdata/snapshot` is required before `/orders/whatif` for a contract.
- `POST /iserver/account/{accountId}/orders/whatif` previews an order without submission.
- `POST /iserver/account/{accountId}/orders` submits an order when the username/session/account has trading permission.
- Order submission can return a reply/confirmation flow rather than immediate submission.
- `/iserver/account/orders` and `/iserver/account/trades` expose open-order/trade state.
- Brokerage sessions time out without activity; `/tickle` is the supported keepalive path.

Do not use an unofficial Node TWS client when the documented HTTP API provides the required individual-account order boundary.

## Security and account privacy

Repository stays public-safe regardless of visibility.

Never commit, fixture, log, report, snapshot, or test with:

- username/password;
- cookies/session tokens;
- account identifiers;
- private browser state;
- raw authenticated IBKR responses that may contain account identity.

The runtime may hold the selected account identifier only in memory as required to call IBKR. Any diagnostic representation must redact it. Synthetic tests use clearly fake non-user identifiers.

The service never automates CPGW browser authentication and never attempts to bypass missing trading permissions.

## Process boundary

Create a separate Node.js process, provisionally named `ibkr-order-service`, using Node 24 and the repository's existing engineering conventions.

Default local listen boundary:

```text
127.0.0.1:8770
```

Provider boundary:

```text
ibkr-order-service
  -> HTTPS localhost Client Portal Gateway
  -> IBKR
```

The existing Market Flow US service on `127.0.0.1:8765` is not modified during this mini-project.

The service may trust only loopback callers in the mini-project. No LAN/public listener.

## TLS rule

CPGW commonly uses an unsigned localhost certificate. If the implementation needs certificate verification disabled, it must be scoped only to the configured loopback CPGW connection. Never set a process-global TLS-disable environment variable and never weaken TLS for non-loopback destinations.

## Runtime modes

The service is fail-closed.

### `dry-run` — default

- accepts and validates order intents;
- resolves/simulates contract/account/session capabilities through a fake adapter or optional read-only real gateway checks;
- builds the exact IBKR order payload;
- can run deterministic local preview simulation;
- never calls the live order-submit endpoint.

### `live` — explicit future enablement

Live submission is possible only when all are true:

1. process starts with an explicit live-enable configuration;
2. CPGW reports an authenticated brokerage session;
3. `/iserver/accounts` returns a tradable account selected at runtime;
4. the account/provider accepts the relevant trading permission;
5. the request explicitly asks for live submission rather than preview/dry-run;
6. provider `whatif` preflight succeeds;
7. all local validation and risk bounds pass.

Missing permission or authentication remains a normal diagnosable rejection. There is no fallback that bypasses IBKR controls.

## Initial order contract

The standalone contract supports long-equity BUY/SELL only for the first mini-project. It does not intentionally open short positions.

Canonical order intent:

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
  "limitPrice": 100.00,
  "tif": "DAY",
  "executionMode": "DRY_RUN"
}
```

Supported initially:

- side: `BUY`, `SELL`;
- security type: U.S. stock (`STK`);
- order type: `LMT`, `MKT`;
- time in force: `DAY`, `GTC`;
- positive finite quantity;
- `limitPrice` required for `LMT`, forbidden for `MKT`;
- default short-opening protection: a live SELL must not exceed the known long position unless a later explicit product decision adds shorting.

The adapter converts the normalized intent to IBKR's documented fields such as `conid`, `side`, `orderType`, `quantity`, `tif`, and `price` when applicable.

## Provider workflow

Normal live-capable workflow:

```text
health/session
-> ensure brokerage session
-> /iserver/accounts
-> resolve symbol -> conid
-> marketdata snapshot preflight
-> whatif preview
-> local validation of preview/result
-> submit only when live explicitly armed
-> handle immediate success OR reply-required state
-> explicit reply confirmation when required
-> observe open order / trade status
-> cancel when requested
```

Do not globally suppress IBKR order questions in the first implementation. A provider reply must be surfaced as an explicit pending-confirmation state so the caller can decide whether to confirm it. Unknown/unmodeled reply messages fail closed.

## Local API target

The implementation should expose a small loopback JSON API:

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

Names may be adjusted during implementation only if the observable contract stays equally small and explicit.

## Idempotency and acknowledgement

A caller-provided `requestId` is mandatory for order creation. Repeating the same `requestId` with the same normalized intent returns the prior local result; reusing it for a different intent is rejected.

Transport loss after an actual submit must never be interpreted as confirmed rejection and must never cause blind automatic resubmission. The service records an acknowledgement-unknown state and reconciles against IBKR order state before any later retry decision.

## Local persistence

Use the smallest durable local mechanism needed for idempotency/reconciliation. Reuse the repository's existing DuckDB dependency unless implementation evidence shows it is unsuitable.

Persist only execution facts needed for safe restart/reconciliation. Do not persist user account identifiers or authentication/session material.

## Diagnostics

Reuse existing diagnosability principles:

```text
component
checkpoint
stable error code
last successful checkpoint
sanitized causal message
```

Expected failure families include:

- gateway unavailable;
- not authenticated;
- brokerage session unavailable;
- no tradable account / permission unavailable;
- ambiguous instrument resolution;
- invalid intent;
- preview rejection;
- provider reply required;
- submit acknowledgement unknown;
- provider rejection;
- cancellation/reconciliation failure.

## Synthetic provider

Build a deterministic fake IBKR gateway for tests. It must cover at least:

- disconnected/not-authenticated/authenticated states;
- empty/non-empty tradable accounts;
- exact/ambiguous symbol resolution;
- snapshot prerequisite;
- what-if success/rejection;
- BUY and SELL payload translation;
- immediate submitted response;
- reply-required then confirmed/rejected response;
- HTTP/provider failure before submit;
- transport loss after submit;
- open-order reconciliation;
- cancel success/failure;
- trade/fill observation;
- session timeout/keepalive behavior.

All fixtures are synthetic and contain no real account data.

## Planned S&T extension

The final TREE extension should add branch `8` with four implementation-ready leaves:

### `8.1` — standalone service + dry-run authority

Node 24 loopback service, strict intent validation, fake adapter, dry-run payload shaping, sanitized diagnostics, local idempotency foundation.

### `8.2` — IBKR Web API adapter + live-capable lifecycle

CPGW session/account/contract/snapshot/what-if/submit/reply/cancel/status/trade adapter, explicit live gate, no permission bypass, acknowledgement-unknown reconciliation.

### `8.3` — operator packaging + integration-ready boundary

Windows launcher/config guidance, deterministic standalone acceptance, stable local JSON API, restart/idempotency proof, and a documented future integration seam. Do not wire Scanner/Demo Buy to real orders in this mini-project.

### `8.4` — mini-project reclosure

Fast/service/standalone acceptance green, public-safe review, docs coherent, PR merged/main green, and code is ready for later credentials/trading permission without requiring a redesign. Live order placement itself may remain `PENDING_EXTERNAL_PERMISSION` until IBKR grants permission.

Execution dependencies should be `8.1 -> 8.2 -> 8.3 -> 8.4`. Existing `7.4` target-machine/provider acceptance remains pending and is paused while this user-requested mini-project is planned/executed; it is not falsely marked done.

## Non-goals

Not part of this mini-project:

- Scanner automatically deciding to trade;
- wiring Demo Buy to real execution;
- portfolio strategy or position sizing logic;
- margin/leverage optimization;
- short-selling support;
- options/futures/FX;
- bracket/OCA/algo orders;
- credential storage;
- automated CPGW login;
- bypassing IBKR trading permissions;
- production claims based on unexecuted live orders.

## Completion definition

The mini-project is code-complete when all four planned leaves are implemented and merged with deterministic proof, including exact request translation, dry-run/what-if paths, live gating, reply handling, cancellation/reconciliation, restart/idempotency, packaging and public-safe diagnostics.

Real-money/live order acceptance is separately recorded as external-permission-dependent. Lack of current trading permission must not force fake evidence and must not block declaring the software implementation complete once all deterministic and permission-independent evidence is green.
