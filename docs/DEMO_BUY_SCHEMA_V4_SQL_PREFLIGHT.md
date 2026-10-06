# Demo Buy schema v4 SQL preflight

Scope: TREE `4.3.1` only — fresh schema-v4 bootstrap, transactional v3→v4 migration, Demo Buy table constraints, and new-day v3/v4 inspection. This preflight is completed before the first execution of the new DDL/migration SQL.

## 1. Purpose and contract

The SQL adds only durable Demo Buy capture/provenance facts. It must preserve all schema-v3 market authority and saved queries, persist no derived horizon outcome, and leave a failed migration semantically usable as v3.

## 2. Schema/data-source validation

The current v3 prerequisite tables are `schema_info`, `sessions`, `universe`, `cycles`, `history`, `latest`, and `scanner_saved_queries`. v4 adds exactly `demo_buy_captures` and `demo_buy_items`. The column names/types are copied from `DATA_CONTRACT.md` / `TECHNICAL_SPEC.md`; `buy_cycle_id` remains a semantic link to `history(cycle_id, security_id)` without a physical FK.

## 3. Cardinality estimate

Migration creates two empty tables and updates exactly one `schema_info` row; it does not scan or copy market rows. Runtime capture cardinality is bounded later by protocol at <=5000 items per capture. New-day reads only saved-query rows from the source DB.

## 4. Access-path inventory

Fresh bootstrap executes one CREATE per table plus one schema-info INSERT. v3 migration performs table inventory/schema-info reads, two CREATE TABLE statements, and one schema-info UPDATE. No joins, correlated subqueries, lateral lookups, or repeated history scans are introduced.

## 5. Predicate/selectivity review

Lifecycle inspection filters only metadata tables and `sessions.status='running'`; no market-data predicate is required because migration never reads market rows. New-day saved-query extraction remains the existing bounded table read.

## 6. Join and row-explosion review

There are no joins in bootstrap/migration/new-day schema inspection. `demo_buy_items` uniqueness is constrained by `(capture_id, security_id)` and `(capture_id, result_rank)` so later capture persistence cannot create duplicate identity/rank pairs inside one capture.

## 7. Sort/group/window review

Migration has no sort/group/window operations. Metadata table-name reads and saved-query ordering are small control-plane operations already present. No DISTINCT/materialization over market history is added.

## 8. Repeated-work elimination

Migration is additive in-place: it does not rebuild/copy `history`, `latest`, universe, sessions, or saved queries. New-day continues to build one fresh DB and seed saved queries once. No second DB authority or shadow migration path is added.

## 9. Boundedness/resource/transaction review

The v3→v4 mutation is one DuckDB transaction: create both Demo Buy tables + update one schema-info row + commit. Any injected failure rolls back. Fresh bootstrap is likewise transactional. No new index, history rewrite, or unbounded temporary result is introduced.

## 10. Architecture/schema/code alternative review

The existing `schema.js` + `database.js` lifecycle seam already owns versioning and migration, and `new-trading-day.mjs` already owns rollover. Reusing those seams is smaller and safer than a migration subsystem, version registry, background updater, or new transport. Context shaping is pure application code; SQL stores its bounded JSON verbatim and does not attempt JSON transformation.

## 11. Constraint review

Use simple CHECK constraints only for direct row invariants: positive capture/rank/cycle IDs, non-negative timestamps/counts, positive interval, allowed selection mode, valid `top_x` presence/range, and automatic-mode restriction. Cross-row/context identity integrity remains service validation as required by the technical contract.

## 12. Failure-state review

A DB marked v3 that already contains either Demo Buy table is rejected before `BEGIN`; it is never normalized with `IF NOT EXISTS`. Fault injection points after each new DDL/update prove rollback. Existing v1/v2 rejection remains unchanged. A valid v4 reopen performs no migration.

## First execution rule

The first execution is the smallest deterministic real-DuckDB schema fixture: fresh v4 bootstrap, then one minimal valid-v3 migration with empty market tables/saved-query fixture. Only after those pass may broader lifecycle/new-day tests execute.
