# Demo Buy Evaluator Workload Seed SQL Preflight

This preflight covers only the synthetic direct-seeding SQL used by the bounded Demo Buy evaluator workload probe for TREE 4.3.3. It does not change product authority SQL. Product evaluation SQL is reviewed separately in `DEMO_BUY_EVALUATION_SQL_PREFLIGHT.md`.

The first execution of this workload SQL is authorized only after the checks below are complete.

## 1. Purpose and contract

Seed a fresh temporary schema-v4 DuckDB with a deterministic active-day-shaped history and one 50-item Demo Buy capture so the trusted evaluator can be timed without paying browser, WebSocket or full persistence costs.

The seed must not be used as product behavior or release authority. It exists only inside a temporary workload DB.

## 2. Schema/data-source validation

The probe writes only current schema-v4 tables already owned by `local-service/database/schema.js`:

- `sessions`
- `cycles`
- `history`
- `latest`
- `demo_buy_captures`
- `demo_buy_items`

Required non-null history authority columns are supplied explicitly. Nullable U.S. provider columns not needed by Demo Buy remain null except identity/display/Price fields used by the evaluator.

## 3. Cardinality estimate

Bounded hosted profile:

```text
64 securities
240 logical cycles
15,360 history rows
64 latest rows
1 capture
50 capture items
500 evaluator horizon targets per page
```

This is deliberately well below the final target-machine day profile while preserving a complete 10-minute post-capture window.

## 4. Access-path inventory

Seeding uses set-based `range(...)` generation and one cross join for history rows. It does not execute per-row insert loops.

The workload then invokes the production trusted evaluator, whose access path is covered by the primary evaluation SQL preflight.

## 5. Predicate/selectivity review

The fixture writes exactly cycles `1..240` and securities `1..64`. Demo Buy items are exactly the first 50 synthetic identities. No predicate broadens beyond the fixed temporary fixture.

## 6. Join / row-explosion review

The only seed cross join is intentional and bounded:

```text
240 cycles × 64 securities = 15,360 history rows
```

No other seed join is many-to-many. The Demo Buy capture contains 50 unique `(capture_id, security_id)` items with unique result ranks.

## 7. Sort/group/window review

The seeding SQL contains no sort, aggregation, window function or deduplication. Ordering/evaluation work belongs to the already-preflighted production read model.

## 8. Repeated-work elimination

History is generated in one set-based statement. `latest` is copied once from the final seeded cycle. Capture/items are seeded once. No browser/provider/persistence replay is performed because those layers are irrelevant to this read-performance measurement.

## 9. Boundedness and resources

All data lives in a fresh temporary DB removed after the test. Hosted CI uses a fixed small shape and a small fixed number of read samples. No unbounded loop, filesystem export or network call exists.

The probe reports only aggregate shape/timing numbers and never SQL text, paths, raw rows or private data.

## 10. Architecture/schema/code alternative review

Using the existing full Fake Market → producer → writer path would measure unrelated acquisition/persistence costs and duplicate already-green coverage. Direct synthetic seeding is therefore the correct narrow layer for evaluator timing.

No index, precomputation, materialized horizon table or background updater is introduced. Such changes remain forbidden unless this and later target-machine evidence show a real need.

## 11. Determinism / authority review

`buy_cycle_id` is fixed at cycle 20. `captured_at_ms` equals cycle 20's logical collected time. Cycles continue through 240, so all ten fixed horizons through 10 minutes have post-watermark evidence.

Price progresses deterministically by cycle and security, making baseline/future results reproducible.

## 12. Failure / cleanup review

Any seeding or evaluation error fails the workload test. Temporary DB cleanup runs in `finally`. A sanitized JSON report is written with only counts and aggregate timings.

## Decision

**PASS_FOR_BOUNDED_WORKLOAD_EXECUTION** — the synthetic seed is bounded, deterministic, set-wise and isolated, and it measures the trusted evaluator at the narrowest relevant layer without adding product architecture.
