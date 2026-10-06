# IBKR Order Lifecycle Store — TREE 8.2 SQL Static Preflight

Scope: TREE `8.2` provider lifecycle persistence needed for restart-safe LIVE idempotency, reply handling, acknowledgement-unknown reconciliation, cancellation and fill observation.

This document is completed before the new SQL is executed. It extends the already-proven TREE `8.1` store without changing the existing `execution_orders` schema or coupling the order service to the market-analysis database.

## 1. Smallest sufficient schema extension

Keep `execution_orders` unchanged as the request/local-order identity and lifecycle authority. Add one narrow provider-state table keyed by the product-owned `local_order_id`:

```sql
CREATE TABLE IF NOT EXISTS execution_provider_state (
  local_order_id VARCHAR PRIMARY KEY,
  provider_conid BIGINT NOT NULL,
  requested_quantity DOUBLE NOT NULL,
  provider_order_id VARCHAR,
  reply_id VARCHAR,
  reply_message_ids_json VARCHAR,
  filled_quantity DOUBLE NOT NULL,
  updated_at_ms BIGINT NOT NULL
)
```

The table deliberately contains no provider account identifier, credential, cookie, provider session token, caller token, raw provider response, warning text or authenticated dump.

`provider_conid`, provider order/reply references and bounded reply-category IDs are reconciliation facts, not authentication/account identity.

## 2. Required SQL surface

Create one LIVE identity/provider-state pair atomically:

```sql
BEGIN TRANSACTION;

INSERT INTO execution_orders (
  request_id,
  intent_fingerprint,
  local_order_id,
  lifecycle_state,
  created_at_ms,
  updated_at_ms
)
VALUES (
  $requestId,
  $intentFingerprint,
  $localOrderId,
  $lifecycleState,
  $createdAtMs,
  $updatedAtMs
);

INSERT INTO execution_provider_state (
  local_order_id,
  provider_conid,
  requested_quantity,
  provider_order_id,
  reply_id,
  reply_message_ids_json,
  filled_quantity,
  updated_at_ms
)
VALUES (
  $localOrderId,
  $providerConid,
  $requestedQuantity,
  NULL,
  NULL,
  NULL,
  0,
  $updatedAtMs
);

COMMIT;
```

Lookup by local order identity:

```sql
SELECT request_id,
       intent_fingerprint,
       local_order_id,
       lifecycle_state,
       created_at_ms,
       updated_at_ms
FROM execution_orders
WHERE local_order_id = $localOrderId
LIMIT 1
```

Provider-state lookup:

```sql
SELECT local_order_id,
       provider_conid,
       requested_quantity,
       provider_order_id,
       reply_id,
       reply_message_ids_json,
       filled_quantity,
       updated_at_ms
FROM execution_provider_state
WHERE local_order_id = $localOrderId
LIMIT 1
```

Lifecycle/provider-state mutation is serialized by the existing single-process order authority and performed in one DuckDB transaction when both tables must change:

```sql
BEGIN TRANSACTION;

UPDATE execution_orders
SET lifecycle_state = $lifecycleState,
    updated_at_ms = $updatedAtMs
WHERE local_order_id = $localOrderId;

UPDATE execution_provider_state
SET provider_order_id = $providerOrderId,
    reply_id = $replyId,
    reply_message_ids_json = $replyMessageIdsJson,
    filled_quantity = $filledQuantity,
    updated_at_ms = $updatedAtMs
WHERE local_order_id = $localOrderId;

COMMIT;
```

The implementation may use narrower state-specific `UPDATE` statements instead of rewriting unchanged provider columns, but it must preserve the same bounded access path and atomic lifecycle/provider-state result.

## 3. Purpose / authority

TREE `8.2` needs durable facts that TREE `8.1` intentionally did not need:

- provider contract identity (`conid`) for reconciliation;
- requested quantity to distinguish partial/full fill safely;
- provider order reference when acknowledged;
- provider reply reference plus bounded reply-category IDs while explicit confirmation is pending;
- observed filled quantity;
- current local lifecycle state.

The selected runtime account remains process-memory-only and is rediscovered from CPGW when provider access is needed after restart.

## 4. Cardinality and access paths

There is at most one `execution_provider_state` row per LIVE local order.

Expected access is bounded:

- zero/one primary-key lookup by `local_order_id`;
- zero/one unique lookup in `execution_orders` by `request_id` or `local_order_id`;
- zero joins on the hot create/reconcile path unless a list/read model explicitly combines the two narrow tables;
- one row inserted per new LIVE request;
- one row updated per lifecycle transition.

No history/event stream is introduced. Provider open-order/trade observation remains provider authority and only the latest bounded reconciliation facts are persisted locally.

## 5. Predicate / sort / explosion review

All point reads use primary/unique equality predicates and return at most one row. No correlated subqueries, lateral joins, grouping, `DISTINCT`, window functions or unbounded sorts are required.

A future local `GET /orders` list may read the narrow execution rows at the tiny order-service scale, but TREE `8.2` does not add a speculative index absent workload evidence.

## 6. Transaction / crash semantics

The LIVE identity row and provider-state row are inserted in one transaction, preventing an accepted LIVE local identity without its reconciliation facts.

Before the first real submit attempt, the local row exists. The authority must never infer that a retry is safe merely because no final provider order ID is stored.

If a submit response is lost after dispatch, lifecycle remains/changes to `ACKNOWLEDGEMENT_UNKNOWN`; same-request replay does not resubmit. Provider open-order/trade reconciliation is required first.

Lifecycle/provider-state updates that must agree are committed in one transaction. Failure rolls back the pair rather than exposing mixed local truth.

## 7. Validation and boundedness

Application validation must enforce before SQL:

```text
local_order_id: product-owned ord_ UUID format
provider_conid: positive safe integer
requested_quantity: positive finite number
provider_order_id: nullable bounded non-empty string
reply_id: nullable bounded non-empty string
reply_message_ids_json: nullable canonical JSON array of bounded IDs only
filled_quantity: finite number in [0, requested_quantity]
lifecycle_state: application-owned allowlist
updated_at_ms: non-negative safe integer
```

No provider warning/message text is persisted.

## 8. Privacy / public-safe review

Forbidden values remain absent from both tables:

```text
real provider account identifier
username/password
cookie/session token
caller token
browser state
raw authenticated provider body
raw provider warning text
```

Tests use synthetic provider references only and inspect persistence for account/session/token canaries.

## 9. Architecture alternative review

Adding nullable provider columns directly to `execution_orders` would require an additive schema migration of the already-proven TREE `8.1` table. A separate one-to-one provider-state table preserves the existing schema/DRY_RUN proof while adding only the facts LIVE reconciliation requires.

An event-sourcing subsystem is unnecessary. Memory-only state is insufficient because reply/uncertain acknowledgement and provider order identity must survive restart.

The two-table design is therefore the smallest sufficient TREE `8.2` extension.

## 10. First execution proof

Before broader service integration, use a temporary DuckDB and synthetic values to prove:

1. existing TREE `8.1` database opens unchanged and gains only the provider-state table;
2. DRY_RUN rows keep their exact existing observable shape;
3. LIVE identity + provider state commit together;
4. duplicate `requestId`/`localOrderId` fails without a partial provider row;
5. lifecycle + provider-state transition commits together;
6. close/reopen preserves LIVE reconciliation facts;
7. account/token/session/warning-text canaries are absent from the database bytes.

Only after this proof is green should the service-level submit/reply/cancel/reconciliation path execute the new SQL in wider tests.
