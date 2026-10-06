# Demo Buy Outcome Screen SQL Preflight Addendum

Scope: TREE `4.4.2` only.

This addendum extends `DEMO_BUY_EVALUATION_SQL_PREFLIGHT.md` before the first execution of the materially changed Demo Buy page/targeted-observation SQL in Chat 13.

## Change under review

The outcome screen contract requires each capture-group header to show the total number of items captured. The existing `demo.buy.page` / `demo.buy.observation.get` read model did not expose that immutable capture-level count.

Loading `demo.buy.capture.get` automatically for every rendered group would create browser/service N+1 work and would also pull potentially large exact SQL without an explicit provenance request.

The smallest sufficient change is therefore to project one additional immutable field from existing active-day authority:

```text
capturedItemCount = COUNT(demo_buy_items WHERE capture_id = current capture_id)
```

The existing `demo.buy.capture.get` already derives the same semantic count. No persisted schema, market authority, horizon rule, cursor rule or outcome arithmetic changes.

## Cardinality / boundedness

`demo.buy.page` still bounds candidate items before horizon expansion to at most `PAGE_SIZE + 1 = 51` rows while determining `hasMore`, and returns at most 50 browser observations.

For each selected row the scalar count is restricted by one immutable `capture_id`. Even without optimizer decorrelation, logical work is bounded by at most 51 selected rows and the active-day `demo_buy_items` relation. This replaces an otherwise unbounded number of browser round trips per visible page with one set-wise read.

`demo.buy.observation.get` remains one exact persisted item plus one capture-scoped count.

## Access / join review

The new count predicate is:

```sql
WHERE capture_items.capture_id = c.capture_id
```

`demo_buy_items` already has `(capture_id, security_id)` primary-key ordering and unique `(capture_id, result_rank)` authority. The count introduces no join multiplicity into the horizon evaluator because it is materialized as one scalar capture-level value before horizon expansion.

The page selection remains:

```text
capture_id DESC, result_rank ASC
LIMIT 51 internally / 50 returned
```

The future-history evaluator remains unchanged:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
```

## Repeated-work review

Rejected alternative:

```text
browser renders page
→ one demo.buy.capture.get per capture group
```

That would duplicate transport/service work and load exact SQL solely to obtain a count. The page read already owns compact capture metadata, so adding one compact immutable scalar there is the KISS option.

## Transaction / consistency review

The count is computed inside the same single DuckDB statement as the page/observation read. It therefore belongs to the same statement snapshot as the capture metadata and selected items.

No write transaction is opened; no authority is mutated.

## Failure semantics

A missing or non-integer count indicates inconsistent persisted Demo Buy authority and is treated as a read failure through the existing `shapeCapture()` validation. The browser retains previously trustworthy rendered data according to the `4.4.2` smallest-surface error contract.

## Verification order

Before closure:

```text
static SQL preflight (this document)
→ focused real-DuckDB/service Demo Buy reads
→ focused unit/browser model proof
→ composed Chromium Demo Buy outcome proof
→ required Fast / Browser / Planning / bounded Workload CI
```
