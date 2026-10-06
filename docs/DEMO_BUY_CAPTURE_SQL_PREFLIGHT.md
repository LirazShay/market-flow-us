# Demo Buy capture authority SQL preflight

Scope: TREE `4.3.2` only — serialized Demo Buy capture resolution/allocation/persistence. This review is completed before the first execution of the new capture SQL.

## 1. Purpose and contract

The capture transaction must persist one immutable `demo_buy_captures` row and `1..5000` ordered `demo_buy_items`, linking every item to the exact `latest.cycle_id` visible at its serialized writer point. It must not mutate `history`, `latest`, universe, cycles, sessions or saved queries. Any unresolved security or write failure rolls back the complete capture.

## 2. Schema/data-source validation

Inputs are schema-v4 `latest(security_id, cycle_id, collected_at_ms, ...)`, `demo_buy_captures` and `demo_buy_items`. `security_id` is canonical VARCHAR identity, `cycle_id`/capture/rank/timestamps are BIGINT-compatible safe integers, and the persisted context is already bounded JSON. The semantic baseline link is `(buy_cycle_id, security_id) -> history(cycle_id, security_id)`; no physical FK is required by the frozen contract.

## 3. Cardinality estimate

One capture contains `1..5000` unique items. `latest` contains one row per current security and is bounded by the active universe (approximately 4096 in the heavy target profile). The capture produces exactly one capture row and exactly one item row per requested unique item. No market-history rows are copied.

## 4. Access-path inventory

Inside the existing serialized writer transaction:

1. one bounded `latest` projection scan reads only `security_id`, `cycle_id`, `collected_at_ms`;
2. one aggregate reads `MAX(capture_id)` from `demo_buy_captures`;
3. one parameterized insert writes the capture header;
4. bounded parameterized item inserts write at most 5000 rows, using the existing writer's appender batching seam rather than repeated history scans;
5. transaction commit/rollback closes the unit.

There are no joins, correlated subqueries, lateral lookups or per-item reads from `history`.

## 5. Predicate/selectivity review

A dynamic `IN (...)` predicate would require generated SQL or a temporary parameter table solely to reduce an already small active-universe scan. Repeated `WHERE security_id = ?` lookups would perform up to 5000 separate database operations. Reading the three-column `latest` projection once and matching requested IDs in JavaScript is deterministic, bounded and simpler at the intended scale.

## 6. Join and row-explosion review

No SQL join is needed. JavaScript maps the one-row-per-security `latest` result by canonical identity and rejects duplicate/corrupt persisted identity defensively. The output item count must equal the validated request item count exactly; there is no many-to-many expansion path.

## 7. Sort/group/window review

No sort, window or DISTINCT is introduced. `MAX(capture_id)` is one scalar aggregate over the capture table and is safe under the single serialized writer. Item order is supplied by the already-validated strictly increasing `resultRank`; persistence does not sort or repair it.

## 8. Repeated-work elimination

Baseline authority is resolved once from `latest`, not re-read separately for each item and not reconstructed from `history`. Capture ID allocation occurs once. Item persistence reuses the existing serialized-writer bulk appender mechanism by extending its table/parameter metadata narrowly to `demo_buy_items`; no second writer, queue or persistence subsystem is added.

## 9. Boundedness/resource/transaction review

The input is bounded before writer enqueue: <=5000 items, <=1 MiB SQL, <=256 KiB context and <=128-code-unit identities. The `latest` projection is active-universe-sized. The transaction contains one small header plus <=5000 item rows and no market-data copy/index build. Any validation/lookup/write/fault after `BEGIN` executes rollback; allocation is not externally visible until commit.

## 10. Architecture/schema/code alternative review

The existing per-connection FIFO plus shared serialized writer already supplies the required authority ordering. A new idempotency store, queue, transport, temporary-table protocol, FK subsystem or materialized baseline copy would add complexity without improving the Phase-1 contract. Application validation owns cross-field/context semantics; SQL stores only the already-approved facts.

## 11. Capture-ID allocation review

`SELECT COALESCE(MAX(capture_id), 0)` followed by `+1` is executed inside the one global serialized writer transaction. No second process/writer can allocate concurrently through the supported product architecture. The resulting ID is checked as a positive safe integer before insert. This preserves simple monotonic active-day IDs without a sequence subsystem.

## 12. Authority/wall-clock review

`captured_at_ms = now()` is assigned only after the work reaches the serialized writer, not at browser click/dispatch time. The exact `latest.cycle_id` read in that same writer operation becomes `buy_cycle_id`; writer/cycle ordering, not timestamp comparison, defines authority. Negative scanner-duration/capture-latency/baseline-age relationships are diagnostic anomalies only and do not alter SQL selection or reject an otherwise valid capture.

## 13. Failure/rollback review

Failure points are proven after header insert and during item persistence. Unresolved requested identity fails before persistent mutation or rolls back the transaction. A persistence fault after the header or first item rolls back both tables together. `history`/`latest` counts/content are compared before/after capture to prove market authority is unchanged.

## First execution rule

The first execution is a one-security real-DuckDB/service fixture with one existing `latest/history` row and one bounded context row. It must prove one committed capture and exact `buy_cycle_id` linkage before multi-item, ordering, fault, writer-race and boundary fixtures execute.
