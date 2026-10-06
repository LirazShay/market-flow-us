# Market Flow US — IBKR Order Service Local Security Contract

## Purpose

This document is a normative security supplement to `docs/IBKR_ORDER_SERVICE.md`.

Loopback binding is necessary but **not sufficient** for an order-capable local HTTP service. A web page can attempt requests to localhost, so the order service must authenticate its local caller and reject browser-origin traffic by default before any provider-side action occurs.

## 1. Network boundary

The service binds only to:

```text
127.0.0.1:8770
```

It must not bind `0.0.0.0`, a LAN address or a public interface.

`GET /health` may be unauthenticated only if its response is strictly non-sensitive and contains no provider/account/order/session facts.

Every other endpoint requires local caller authorization before request parsing can reach order/session/provider logic.

## 2. Local caller credential

Use a high-entropy per-run local execution token.

Requirements:

- generated cryptographically at service startup unless an equivalent explicitly supplied ephemeral value is used by an approved launcher/integration;
- no hard-coded/default token;
- never committed to the repository;
- never persisted in DuckDB or another file;
- never included in diagnostics, reports, support snapshots or error messages;
- never transmitted to IBKR;
- invalidated when the order-service process exits.

Authorized API requests carry the token in an explicit header such as:

```text
Authorization: Bearer <ephemeral-local-token>
```

Do not use cookies for local API authorization.

The implementation may choose an equivalent header name, but the observable security property must remain the same.

## 3. Browser-origin rejection

Default policy:

```text
no browser Origin is trusted
no wildcard CORS
no credentialed cross-origin CORS
```

Requests containing an `Origin` header are rejected unless a later explicit integration contract names an exact trusted origin and passes security review.

The standalone mini-project does not add such a browser origin.

Preflight/`OPTIONS` requests must not grant a permissive CORS policy.

## 4. Authorization order

For every protected endpoint:

```text
network accept
→ local caller authorization
→ request-size/content-type validation
→ route/body validation
→ idempotency/risk/live gates
→ provider interaction
```

An unauthorized request must cause **zero** CPGW/IBKR calls and zero execution-state mutation.

## 5. State-changing requests

These endpoints are always protected and must never support unauthenticated browser-style form submission:

```text
POST /session/init
POST /instruments/resolve
POST /orders/preview
POST /orders
POST /orders/{localOrderId}/confirm
POST /orders/{localOrderId}/cancel
```

Use JSON-only request bodies with bounded body size. Reject unsupported content types.

`POST /orders` still requires all independent live gates from `IBKR_ORDER_SERVICE.md`; possession of the local caller token alone never enables live trading.

## 6. Read endpoints

Order/trade/session reads can reveal private brokerage state, so they are protected too:

```text
GET /session
GET /orders
GET /orders/{localOrderId}
GET /trades
```

Responses remain sanitized and must not expose the real provider account identifier or authentication/session material.

## 7. Concurrency and duplicate protection

Local caller authorization does not replace idempotency.

Order mutation must still obey:

- mandatory `requestId` for create;
- same-key/same-intent reuse;
- same-key/different-intent rejection;
- no blind replay after `ACKNOWLEDGEMENT_UNKNOWN`;
- bounded serialized/controlled mutation so accidental concurrent requests cannot produce unreviewed duplicate provider submissions.

## 8. Failure semantics

Stable local-security failures include:

```text
LOCAL_CALLER_UNAUTHORIZED
BROWSER_ORIGIN_REJECTED
UNSUPPORTED_CONTENT_TYPE
REQUEST_TOO_LARGE
```

Security failures are sanitized. They never echo supplied tokens or provider/private state.

## 9. Deterministic proof

Synthetic/unit/service acceptance must prove at least:

1. protected endpoint without token is rejected before adapter/provider call;
2. wrong token is rejected before adapter/provider call;
3. valid token permits normal dry-run path;
4. `Origin: https://attacker.example` is rejected even with an otherwise well-formed request;
5. wildcard CORS is absent;
6. `GET /health` contains no sensitive brokerage facts;
7. protected read endpoints require authorization;
8. state-changing form/text content types are rejected;
9. token value never appears in diagnostics/report output;
10. restart invalidates the prior generated token;
11. authorization cannot bypass `DRY_RUN`/`LIVE`, provider permission, what-if, SELL guard, reply-confirmation or idempotency gates.

## 10. Integration rule

A future Market Flow US → order-service integration must consume this authenticated local API. It must not weaken the caller-authentication or origin boundary merely because both components run on the same machine.
