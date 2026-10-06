# AI Investigation Export SQL Preflight

This document records the mandatory static validation/optimization gate for TREE `4.5.1` before any new AI Investigation export SQL is executed.

Scope: `demo.buy.ai-pack.create(captureId, securityId)` only. The trusted Demo Buy evaluator SQL in `local-service/reads/demo-buy-reads.js` is unchanged and is reused through `observationGet`; it is not reimplemented here.

## Planned SQL surfaces

The exporter needs three new read shapes.

### A. Target/provenance/baseline authority

One exact target row is resolved by `capture_id + security_id`, joined to its immutable capture provenance and exact baseline row:

```sql
SELECT
  c.capture_id,
  c.captured_at_ms,
  c.source_query_id,
  c.source_query_name,
  c.source_query_sql,
  c.source_interval_ms,
  c.source_result_started_at_ms,
  c.source_result_completed_at_ms,
  c.source_result_row_count,
  c.source_result_context_json,
  c.selection_mode,
  c.is_automatic,
  c.top_x,
  i.result_rank,
  i.security_id,
  i.buy_cycle_id,
  b.cycle_id,
  b.security_id,
  b.universe_revision,
  b.collected_at_ms,
  -- documented U.S. provider/source projection only
  b.Symbol,
  b.PaperNameEng,
  b.PaperNameHeb,
  b.ExchangeName,
  b.TradeDateTime,
  b.CountryName,
  b.CountryNameEng,
  b.Price,
  b.ChangePercent,
  b.DailyHigh,
  b.DailyLow,
  b.YearHigh,
  b.YearLow,
  b.DailyVolume,
  b.BeginYearChangePercent,
  b.Month12ChangePercent,
  b.Month36ChangePercent,
  b.AskRate,
  b.BidRate,
  b.YesterdayRate,
  b.PaperMarketCap,
  b.PaperIdYatab,
  b.CountryId,
  b.PaperType,
  b.ESGRatingId,
  b.ESGScope,
  b.raw_data
FROM demo_buy_items AS i
JOIN demo_buy_captures AS c
  ON c.capture_id = i.capture_id
LEFT JOIN history AS b
  ON b.cycle_id = i.buy_cycle_id
 AND b.security_id = i.security_id
WHERE i.capture_id = $captureId
  AND i.security_id = $securityId
```

The `LEFT JOIN` is intentional: a missing baseline must be detected and mapped to the existing Demo Buy baseline-integrity failure rather than silently turning the target into not-found.

### B. Combined target before/after market window

One scan obtains only the target-security rows that are contractually eligible for either the prediction-time or fixed ten-minute outcome evidence window:

```sql
SELECT
  cycle_id,
  security_id,
  universe_revision,
  collected_at_ms,
  -- documented U.S. provider/source projection only
  Symbol,
  PaperNameEng,
  PaperNameHeb,
  ExchangeName,
  TradeDateTime,
  CountryName,
  CountryNameEng,
  Price,
  ChangePercent,
  DailyHigh,
  DailyLow,
  YearHigh,
  YearLow,
  DailyVolume,
  BeginYearChangePercent,
  Month12ChangePercent,
  Month36ChangePercent,
  AskRate,
  BidRate,
  YesterdayRate,
  PaperMarketCap,
  PaperIdYatab,
  CountryId,
  PaperType,
  ESGRatingId,
  ESGScope,
  raw_data
FROM history
WHERE security_id = $securityId
  AND (
    (
      cycle_id <= $buyCycleId
      AND collected_at_ms >= $preWindowStartMs
      AND collected_at_ms <= $capturedAtMs
    )
    OR
    (
      cycle_id > $buyCycleId
      AND collected_at_ms >= $capturedAtMs
      AND collected_at_ms <= $postWindowEndMs
    )
  )
ORDER BY collected_at_ms ASC, cycle_id ASC
```

The exporter partitions the already-authority-filtered rows into `TARGET_BEFORE.jsonl` and `TARGET_AFTER.jsonl` by the same `cycle_id <= buy_cycle_id` / `cycle_id > buy_cycle_id` boundary. No timestamp can move a row across the writer/cycle authority watermark.

### C. Outcome evidence completeness watermark

```sql
SELECT MAX(collected_at_ms) AS evidence_watermark_ms
FROM history
WHERE cycle_id > $buyCycleId
```

This is deliberately market-wide, not target-security-specific. It answers whether committed market authority in the opened DB progressed to the ten-minute boundary, exactly as required by the data contract.

`productVersion` is read from the already-authoritative schema lifecycle/configuration seam rather than inferred from evidence rows; no history query is needed for it.

## Static gate

### 1. Purpose and observable contract

The SQL may only read immutable capture/item provenance and committed market history needed to build a local derivative pack. It must not mutate DuckDB, reconstruct Scanner results, invent ranking semantics, persist outcomes, or return operational/session evidence for sharing.

Expected observable result:

- exactly one target membership/provenance row;
- exact linked baseline or stable baseline-integrity failure;
- all and only target rows in the two bounded forensic windows;
- one nullable evidence watermark;
- trusted horizon outcome obtained separately from the existing evaluator.

### 2. Schema/data-source validation

Verified against `local-service/database/schema.js` schema v4:

- `demo_buy_captures.capture_id BIGINT PRIMARY KEY`, immutable SQL/context/timing fields, `source_result_context_json JSON NOT NULL`;
- `demo_buy_items PRIMARY KEY (capture_id, security_id)`, unique `(capture_id, result_rank)`, positive `buy_cycle_id`;
- `history PRIMARY KEY (cycle_id, security_id)`;
- `history.cycle_id BIGINT NOT NULL`, `security_id VARCHAR NOT NULL`, `universe_revision BIGINT NOT NULL`, `collected_at_ms BIGINT NOT NULL`, documented provider fields nullable according to projection, and `raw_data JSON NOT NULL`.

Operational history columns `session_id`, `chunk_index`, `cycle_started_at_ms`, `chunk_received_at_ms`, and `source_metadata_json` are intentionally absent from the export SELECT list.

### 3. Cardinality estimate

- Target/provenance query: exactly `0..1` item row by the Demo Buy primary key; joined capture is exactly one for valid authority; baseline is `0..1` by the history composite primary key.
- Combined target window: at most the number of committed cycles for one security inside a 40-minute union of windows. In the current heavy acceptance shape (`4096 × 180`) this is approximately `<=180` rows for a continuously present target, not `4096 × 180` output rows.
- Watermark query: exactly one aggregate row.
- Export response never returns these history rows through WebSocket; they are written locally.

Worst-case input scan may still inspect the active-day `history` table because no speculative history index exists by contract. That cost must be measured before considering schema change.

### 4. Access-path inventory

Per export, new SQL introduces:

1. one exact Demo Buy membership/capture/baseline lookup;
2. one target-history scan for both before and after windows;
3. one market-wide post-watermark aggregate scan.

The two target windows are intentionally combined to avoid two equivalent full-history scans. The trusted evaluator remains one existing set-wise read; no N×10 query loop is introduced.

No correlated per-row query, lateral lookup, recursive CTE, or repeated Scanner execution is added.

### 5. Predicate/selectivity review

The target-history query applies `security_id`, authority watermark, and time bounds in SQL before rows leave DuckDB. Both branches are fully bounded by fixed contract windows. The watermark aggregate applies `cycle_id > buy_cycle_id` before aggregation.

No predicate is weakened to timestamp-only authority. `>= captured_at_ms` on the post side intentionally admits a later committed row sharing the same millisecond timestamp.

### 6. Join and row-explosion review

The target query joins only keys that are unique by schema:

- item → capture: `capture_id` primary key on capture;
- item → baseline: `(buy_cycle_id, security_id)` to history composite primary key.

Therefore a valid item cannot multiply into multiple capture or baseline rows. More than one target row from query A is treated as integrity failure rather than accepted.

The history-window and watermark queries have no joins.

### 7. Sort/group/window review

- Combined target history has one bounded `ORDER BY collected_at_ms ASC, cycle_id ASC`, required by the evidence contract.
- Watermark has one `MAX(collected_at_ms)` aggregate and no sort.
- Target/provenance/baseline lookup has no sort/group/window.
- No `DISTINCT`, window function, materialization table, or broad grouping is introduced.

The expected sorted output is one security's bounded rows; the sort does not operate on the full market output after filtering.

### 8. Repeated-work elimination

Rejected shapes:

- separate before and after history queries: duplicates the same target-history access;
- N×10 horizon queries: duplicates the trusted evaluator and violates existing architecture;
- re-running Scanner SQL: loses immutable capture provenance and may observe later market state;
- copying full DB rows then redacting in files: risks accidental operational/session disclosure.

Chosen shape explicitly selects only shareable market columns at the SQL boundary and reuses `observationGet` for horizon semantics.

### 9. Boundedness and resource review

- SQL inputs are validated `captureId`, bounded canonical `securityId`, and integers derived from persisted authority.
- Time windows are fixed at 30 minutes before and 10 minutes after capture.
- Context is already persisted under the `<=50` rows / `<=64` columns / `<=256 KiB` contract and is revalidated before projection.
- `promptText` remains capped at 256 KiB UTF-8 outside SQL.
- Export writes to a temporary product-owned directory and publishes via atomic rename; SQL performs no transaction or mutation.
- A failed export therefore needs filesystem cleanup only and cannot require DB rollback.

### 10. Architecture/schema/code alternative review

No new index, materialized outcome table, background updater, second DB, second transport, worker, or strategy subsystem is justified before measurement.

The smallest sufficient design is:

```text
existing schema-v4 facts
→ three bounded read shapes
→ existing trusted evaluator
→ pure sharing-safe projection
→ local temp-directory publication
```

If representative export timing shows the two unavoidable history scans materially dominate feedback, stop before scaling and investigate access-path reuse or a narrowly justified schema/index change under the planning rules. Do not preemptively add an index.

### 11. Privacy/shareability review

Shareable history SQL is an allowlist, not `SELECT *`. System-owned fields are impossible to enter history/baseline files through the SQL projection.

The frozen Scanner context is handled separately by a pure allowlist/redaction projection. Arbitrary redacted values are never interpolated into SQL, prompt, manifest, README, response metadata, or diagnostics.

`QUERY.sql` is the one deliberate verbatim user-authored text export and is accompanied by the required pre-share warning.

### 12. Failure and integrity review

Before filesystem writes:

- no target row → `NOT_FOUND`;
- missing exact baseline → existing `DEMO_BUY_BASELINE_INTEGRITY` failure;
- invalid persisted context → export integrity failure;
- expected retained Top-50 target missing/mismatched → export integrity failure;
- position > 50 → valid `targetInScannerContext=false`;
- prompt over 256 KiB → export failure, no truncation;
- any sharing-safety canary found after serialization → fail before publish.

No SQL result may be used to weaken these failures into partial success.

## First execution discipline

The first execution after this preflight must be the smallest deterministic real-DuckDB fixture that can falsify the design:

1. one capture with one target and exact baseline;
2. one prediction-time row;
3. one misleading timestamp row committed after the buy watermark;
4. one valid post-watermark row;
5. synthetic operational/session/text canaries.

Only after that focused fixture is green may the service test expand to partial/complete regeneration, position > 50, collision/cleanup and representative timing.

Any materially changed SQL must repeat this gate before first execution.
