# Market Flow US — IBKR Order Service Operator & Integration Guide

This guide is the concrete TREE `8.3` operator/integration seam for the standalone order-execution sidecar. The normative product/security contracts remain `IBKR_ORDER_SERVICE.md` and `IBKR_ORDER_SERVICE_SECURITY.md`.

## 1. Process boundary

The order service is independent from the Market Flow US market-analysis runtime.

```text
Market Flow US analysis runtime
  ws://127.0.0.1:8765

IBKR order service
  http://127.0.0.1:8770
  -> HTTPS loopback CPGW
```

Starting or stopping one process does not start or stop the other.

## 2. Windows startup

Default safe startup:

```text
START_IBKR_ORDER_SERVICE.cmd
```

This starts the process in `DRY_RUN` mode. `DRY_RUN` can perform validation/provider preflight/what-if work, but the service cannot call the provider submit endpoint.

Deliberate process-level LIVE arm:

```text
START_IBKR_ORDER_SERVICE.cmd LIVE
```

`LIVE` only arms one independent local gate. A request must still specify `executionMode=LIVE`, and session/account/permission/instrument/snapshot/what-if/local-risk/SELL-position gates must all pass. Missing gates fail closed.

There is no committed account/authentication config file. Provider authentication remains manual in Client Portal Gateway.

The plain Windows launcher is an operator process launcher; it intentionally does **not** print the caller token. A trusted programmatic caller that needs protected API access uses the in-memory IPC/in-process seam described below rather than scraping console output or reading a token file.

## 3. Advanced CLI options

Equivalent direct command:

```text
npm run order-service
```

Supported options after `--`:

```text
--live
--allow-insecure-loopback-tls
--cpgw-url=https://localhost:5000/v1/api
--db=data/ibkr-order-service.duckdb
--help
```

The default CPGW URL is `https://localhost:5000/v1/api`.

`--cpgw-url` is restricted to HTTPS loopback and may not contain credentials, query data or a fragment. `--allow-insecure-loopback-tls` affects only the dedicated loopback CPGW client; it does not set `NODE_TLS_REJECT_UNAUTHORIZED` or weaken process-global TLS.

## 4. Caller token handling

Every protected endpoint requires the high-entropy per-run caller token.

The token is intentionally:

- generated for the service run;
- never printed to stdout/stderr;
- never persisted in DuckDB/files;
- never included in diagnostics/acceptance reports;
- invalidated when the process exits.

A future trusted local integration should launch `ibkr-order-service/index.js` as a Node child process with an IPC channel. When the child is ready it sends one in-memory IPC message:

```text
{
  type: "ibkr-order-service.ready",
  baseUrl: "http://127.0.0.1:8770",
  mode: "DRY_RUN" | "LIVE",
  callerToken: "<ephemeral in-memory value>"
}
```

The parent keeps the token in memory and sends it only as:

```text
Authorization: Bearer <ephemeral-token>
```

Do not write the token to a file, config, console, report, browser storage or database.

An in-process trusted launcher may alternatively call `startOrderService()` and use the returned `callerToken` directly in memory.

## 5. Stable local API

`GET /health` is the only unauthenticated endpoint and returns no brokerage state.

All other endpoints require local caller authorization before route/body/provider processing:

```text
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

Mutation bodies are bounded JSON. Browser `Origin` requests are rejected by default. No wildcard/credentialed CORS exists.

## 6. Future integration rule

A later Scanner/strategy integration must consume this authenticated localhost API using the normalized order contract.

It must **not**:

```text
call CPGW/IBKR directly from Scanner
call CPGW/IBKR directly from Demo Buy
call CPGW/IBKR directly from AI Investigation
copy provider credentials/account IDs into Market Flow US state
weaken caller authorization because both processes are local
```

The analytical runtime remains strategy/evidence authority; the sidecar remains execution authority.

## 7. Safe real CPGW compatibility check

With Client Portal Gateway already running/authenticated by the user:

```text
CHECK_IBKR_SESSION.cmd
```

If the local gateway certificate is not trusted by Windows/Node, the explicitly scoped fallback is:

```text
CHECK_IBKR_SESSION.cmd INSECURE_LOCALHOST_TLS
```

This command starts the sidecar in non-LIVE mode, calls only the protected session status path using the token in memory, prints a sanitized session compatibility result and stops the service. It does not require order permission and cannot enable provider submit.

## 8. Deterministic standalone acceptance

Run:

```text
RUN_IBKR_ORDER_ACCEPTANCE.cmd
```

or:

```text
npm run test:acceptance:order
```

The acceptance uses synthetic provider/account data only and proves:

```text
health + missing/wrong auth + browser-origin rejection
BUY/SELL preview with zero submit
DRY_RUN requestId replay
restart token rotation + persisted idempotency
explicit fake-LIVE reply confirmation
partial fill + cancellation preserving filled quantity
full fill
ACKNOWLEDGEMENT_UNKNOWN reconciliation with no blind resubmit
SELL no-short-opening guard
sanitized synthetic-only report
clean stop
```

A passing synthetic report states `providerEvidence=SYNTHETIC_ONLY` and `realOrderSubmitted=false`. It is never evidence of a real IBKR order.

## 9. External permission

Real CPGW session compatibility can be checked before trading permission exists.

Actual real-order submission remains permission-gated. If account permission is unavailable, the final real-order evidence state is:

```text
PENDING_EXTERNAL_PERMISSION
```

Do not replace that state with synthetic success.
