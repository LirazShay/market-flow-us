# Research 11.3 SQL Preflight — isolated base projection

Status: implementation preflight for Chat 37 / TREE 11.3 first slice

Scope: base Development research projection only (`research_sources`, `research_partition`, `research_cycles`, `research_history`, `research_universe`) plus machine-readable field manifest. Controlled decision/outcome/experiment relations, durable result handles, workload tuning and Validation/Holdout execution remain later work.

## 1. Purpose and authority

The SQL copies only phase-authorized immutable Market Flow US evidence into a server-owned in-memory research sandbox. AI-authored SQL must never execute while an original evidence database is attached. The research projection is exploratory evidence, not Scanner strategy authority.

## 2. Schema and source columns

Source authority is the existing Market Flow US v3/v4 schema already validated by `openBacktestEvidenceSource`.

Projection allowlist:

- `cycles`: `cycle_id`, `universe_revision`, `started_at_ms`, `completed_at_ms`, `committed_at_ms`, `duration_ms`, `requested`, `received`, `unique_count`, `missing`, `duplicates`, `unexpected`.
- `history`: canonical `security_id`, cycle/revision/collection timing, documented display fields, documented typed numeric fields and persisted provider `raw_data`.
- no `sessions` relation and no `session_id`, chunk transport fields, `source_metadata_json`, errors/config/auth/path data.
- `research_universe` is derived only from already-authorized `research_history`, so lifecycle information cannot reach beyond the selected partition window.

## 3. Cardinality

For each authorized source:

- `research_cycles`: at most one row per complete source cycle inside the permitted commit-time range.
- `research_history`: at most one row per `(source_id, cycle_id, security_id)` because source `history` already owns `(cycle_id, security_id)` uniqueness.
- `research_sources`: exactly one summary row per selected source, including zero-cycle sources.
- `research_partition`: exactly one metadata row per selected source.
- `research_universe`: at most one row per `(source_id, security_id)` present in authorized projected history.

No cross-source Cartesian product is required to construct the base projection.

## 4. Access path

Each logical `source_id` is resolved only by the existing product-owned Backtest source catalog. The source is first validated through the proven read-only evidence opener. Projection then attaches that exact server-resolved file internally as `READ_ONLY`, copies the allowlisted subset, and detaches it before the next source and before research SQL execution.

No client path, URI or source alias is accepted.

## 5. Predicates and partition bounds

Only `cycles.status = 'complete'` are research evidence. Optional partition bounds apply to authoritative `cycles.committed_at_ms`:

```text
allowed_from_ms <= committed_at_ms <= allowed_to_ms
```

`research_history` joins only to those selected complete cycles, so failed/uncommitted/out-of-range market rows cannot enter the sandbox. No fixed collector cadence is assumed.

## 6. Joins and explosion risk

Projection uses the source primary-key relationship `history.cycle_id -> cycles.cycle_id` plus the complete/range predicates. This is many history rows to one cycle row and cannot multiply a history row.

`research_universe` is derived from the already-projected bounded history and groups by `(source_id, security_id)`; a single final-observation row is selected with `row_number()` and joined back 1:1 to per-security statistics.

## 7. Sort / group / window cost

Base cycles/history projection requires no global sort. `research_universe` uses one partition-local `row_number()` ordering per security plus grouped min/max statistics. This work is proportional to projected authorized history, not the full multi-day corpus outside the partition.

No permanent index is introduced: the data contract explicitly defers new history indexes until workload evidence proves a need.

## 8. Repeated work

The first implementation deliberately rebuilds the bounded in-memory projection per sandbox. It does not introduce a cache/warehouse. If later workload evidence shows projection dominates cost, TREE 11.4/11.8 may justify a fingerprinted transient cache; until then rebuildability and isolation are preferred.

## 9. Boundedness and resources

Construction is bounded by the Evidence Plan source list and optional partition time range. The first deterministic proof uses two tiny source DBs with one included and one excluded cycle per source.

General long-running/result-size governance belongs to TREE 11.4. This slice is not exposed through the public Research Domain yet, so it cannot create an unbounded client result path before those limits exist.

## 10. Architecture/code alternative

Rejected alternatives for this slice:

- direct AI-owned read-only connection or leaving source DBs attached: violates D-US-049/D-US-051 and source/phase isolation;
- copying rows through JavaScript objects: adds serialization/memory overhead and weakens type fidelity;
- permanent multi-day warehouse/index/cache: duplicates authority before measurement justifies it;
- reusing Scanner relation names `latest/history`: obscures the strategy-vs-research boundary.

Selected smallest architecture:

```text
validate logical source + fingerprint
→ open/validate existing evidence READ_ONLY
→ in-memory sandbox
→ ATTACH allowlisted source READ_ONLY
→ INSERT only complete/range-bounded allowlisted rows
→ DETACH source
→ derive partition-local research_universe
→ apply existing DuckDB hardening
→ allowed_configs = []
→ lock_configuration = true
→ verify no source attachment remains
→ only then permit server-owned research execution
```

## First deterministic execution proof

The focused service test must prove, before broader execution work proceeds:

1. two authorized logical sources project with distinct `source_id` values;
2. out-of-range cycles/history are absent;
3. typed fields and provider `raw_data` survive the projection;
4. operational/session/chunk/source-metadata fields and Scanner `latest/history` relation names are absent;
5. `research_universe` contains only securities observed inside the authorized partition;
6. the schema manifest marks typed/raw/provenance fields, decision-time eligibility and future dependence explicitly;
7. source fingerprints/bytes are unchanged and no evidence source remains attached when research execution begins.
