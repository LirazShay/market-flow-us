# B-US-006 — Basic in-product BUY via existing order API

## Backlog metadata

- Status: `Needs fresh-main review`
- Priority: `Unprioritized`
- Blocking: `No`

> This item is preserved from the previous backlog. Later execution on `main` appears to have completed Basic Detail BUY under task `8.5`; `B-US-007` must reconcile this item against fresh `main` before any new implementation is authorized.

## Goal

Implement the smallest useful BUY integration from Market Flow US into the already-built local `ibkr-order-service` API.

Initial scope is deliberately basic. More advanced order behavior belongs in separate future planning.

## Initial MVP intent

Provide one explicit user-initiated `BUY` action from the product that:

```text
selected market item
→ build bounded BUY request from simple local configuration
→ call authenticated localhost ibkr-order-service
→ reuse existing preview / validation / LIVE gates
→ show deterministic success / rejection / unknown result
```

## Required boundaries

- Reuse the existing order-service API; do not call IBKR directly from Viewer/Scanner code.
- Preserve caller authentication, DRY_RUN default, explicit LIVE enablement, request idempotency, provider preflight/what-if/reply handling and `ACKNOWLEDGEMENT_UNKNOWN` behavior.
- BUY must be an explicit user action; no automatic Scanner→order loop unless a later plan explicitly authorizes it.
- No credential, session, account identifier or caller token may enter repository/config persisted in unsafe form or diagnostics.
- No SELL automation, portfolio engine, position sizing system, risk engine or sophisticated execution strategy is required in this basic scope.
- Configuration errors, unavailable price/instrument data, unavailable order service, failed preview, permission/session failure and uncertain acknowledgement must fail visibly and safely.

## S&T requirement

Before any implementation, re-evaluate from fresh `main` whether the capability is already satisfied. If work remains, justify the surface, minimal quantity/amount configuration, identity mapping, preview/confirmation UX, DRY_RUN→LIVE transition, requestId ownership, error/recovery behavior and smallest proof required.

## Acceptance evidence

- A deterministic synthetic journey selects an item and reaches the real local order-service API with the expected normalized BUY intent.
- Configured amount/quantity behavior is deterministic and boundary-tested.
- DRY_RUN proves zero provider submit; LIVE remains impossible unless every independent gate is satisfied.
- Double-click/retry/reconnect cannot create an uncontrolled duplicate BUY.
- Service unavailable, validation/preview/provider rejection and acknowledgement-unknown are distinct and recoverable in the UI.
- Existing Scanner/Demo Buy/Replay behavior remains green and does not automatically gain order authority.
- Required unit/service/browser/composition/order integration proof is green before merge.
