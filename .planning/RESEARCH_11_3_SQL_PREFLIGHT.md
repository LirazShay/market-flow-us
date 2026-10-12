# Research 11.3 SQL Preflight — isolated research projection

Status: implementation preflight and final alignment record for Chat 37 / TREE 11.3

Scope: Development research projection (`research_sources`, `research_partition`, `research_cycles`, `research_history`, `research_universe`), controlled decision/outcome/experiment relations, bounded raw-field discovery, Research-specific SQL admission and machine-readable field manifest. Durable result handles/resource governance remain TREE 11.4; Validation/Holdout exposure/final authority remain TREE 11.5.

## 1. Purpose and authority

The SQL copies only phase-authorized immutable Market Flow US evidence into a server-owned in-memory research sandbox. AI-authored SQL must never execute while an original evidence database is attached. The research projection is exploratory evidence, not Scanner strategy authority.

## 2. Schema and source columns

Source authority is the existing Market Flow US v3/v4 schema already validated by `openBacktestEvidenceSource`.

Projection allowlist:

- `cycles`: `cycle_id`, `universe_revision`, `started_at_ms`, `completed_at_ms`, `committed_at_ms`, `duration_ms`, `requested`, `received`, `unique_count`, `missing`, `duplicates`, `unexpected`.
- `history`: canonical `security_id`, cycle/revision/collection timing, documented display fields, documented typed numeric fields and persisted provider `raw_data`.
- no `sessions` relation and no `session_id`, chunk transport fields, `source_metadata_json`, errors/config/auth/path data.
- `research_universe`: source-persisted lifecycle/display fields copied only for securities that occur in the already-authorized `research_history` projection. `raw_source` is excluded. These lifecycle/display values may reflect source state beyond a historical T0 or partition time bound, so the manifest marks them future-dependent and not decision-time eligible; exact historical membership comes from authoritative baseline/history evidence.

## 3. Cardinality

For each authorized source:

- `research_cycles`: at most one row per complete source cycle inside the permitted commit-time range.
- `research_history`: at most one row per `(source_id, cycle_id, security_id)` because source `history` already owns `(cycle_id, security_id)` uniqueness.
- `research_sources`: exactly one summary row per selected source, including zero-cycle sources.
- `research_partition`: exactly one metadata row per selected source.
- `research_universe`: at most one row per `(source_id, security_id)` and only when that security is present in authorized projected history.

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

`research_universe` intentionally preserves the source DB's persisted lifecycle values rather than inventing partition-local lifecycle semantics. It is identity-bounded by an `EXISTS` semi-join against authorized `research_history`; therefore source-universe rows for securities absent from the authorized partition are not projected.

## 6. Joins and explosion risk

Projection uses the source primary-key relationship `history.cycle_id -> cycles.cycle_id` plus the complete/range predicates. This is many history rows to one cycle row and cannot multiply a history row.

`research_universe` uses one source row per `security_id` and an `EXISTS` semi-join to authorized history, so it cannot multiply universe rows. Cross-source identity remains explicit through `source_id`.

Controlled decision/outcome/experiment rows are materialized only from server-owned 11.2 authority and are cross-reference validated before one transaction creates their relations.

## 7. Sort / group / window cost

Base cycles/history/universe projection requires no global sort or window. Source summaries aggregate only the already-projected bounded cycles. General research windows/joins/aggregates/correlations execute only after source detachment inside the isolated sandbox.

No permanent index is introduced: the data contract explicitly defers new history indexes until workload evidence proves a need.

## 8. Repeated work

The implementation deliberately rebuilds the bounded in-memory projection per sandbox. It does not introduce a cache/warehouse. If later workload evidence shows projection dominates cost, TREE 11.4/11.8 may justify a fingerprinted transient cache; until then rebuildability and isolation are preferred.

## 9. Boundedness and resources

Construction is bounded by the Evidence Plan source list and optional partition time range. Raw-data discovery has explicit key/sample/key-length/value-length bounds, and explicit Experiment inputs are bounded.

The Research Domain now exposes the Development SQL session seam so TREE 11.3 can prove composition and ownership. Durable result handles, paging, query/result budgets, cancellation and broader resource governance are intentionally TREE 11.4 responsibilities and must be in place before the later autonomous Plugin/MCP path is complete.

## 10. Architecture/code alternative

Rejected alternatives:

- direct AI-owned read-only connection or leaving source DBs attached: violates D-US-049/D-US-051 and source/phase isolation;
- copying rows through JavaScript objects: adds serialization/memory overhead and weakens type fidelity;
- permanent multi-day warehouse/index/cache: duplicates authority before measurement justifies it;
- reusing Scanner relation names `latest/history`: obscures the strategy-vs-research boundary;
- reconstructing source-universe lifecycle from partition-local history: changes persisted source semantics and was rejected during final 11.3 reclosure.

Selected smallest architecture:

```text
validate logical source + fingerprint
→ open/validate existing evidence READ_ONLY
→ in-memory sandbox
→ ATTACH allowlisted source READ_ONLY
→ INSERT only complete/range-bounded allowlisted cycles/history
→ INSERT source-persisted universe rows only for authorized-history identities
→ DETACH source
→ materialize explicitly authorized 11.2 controlled inputs
→ apply existing DuckDB hardening
→ allowed_configs = []
→ lock_configuration = true
→ verify effective hardening and no source reachability
→ apply Research-specific SELECT/function admission
→ only then permit server-owned research execution
```

## Deterministic execution proof

Focused service/unit proof verifies:

1. two authorized logical sources project with distinct `source_id` values;
2. out-of-range cycles/history and source-universe-only identities are absent;
3. typed fields and provider `raw_data` survive the projection;
4. operational/session/chunk/source-metadata fields and Scanner `latest/history` relation names are absent;
5. `research_universe` preserves exact source lifecycle/display values only for securities observed inside the authorized partition, while the manifest marks that context future-dependent/not decision-time authority;
6. the schema manifest marks typed/raw/provenance/authority fields, null/missing caveats, decision-time eligibility and future dependence explicitly;
7. bounded raw-field key/type/coverage discovery distinguishes missing from JSON null and supports typed comparison/provenance samples;
8. controlled decision/outcome/Experiment relations preserve shared 11.2/Backtest authority and reject mismatched references/semantics;
9. legitimate Development SQL proves joins, windows, aggregates, correlations, cross-security analysis, JSON analytics and safe catalog inspection;
10. external/file/network/catalog/config/extension/secret/dynamic-query/side-effect escape attempts fail closed while original source fingerprints/bytes remain unchanged;
11. Validation/Holdout general SQL stays closed and explicit Experiment references are run/partition bound;
12. the Research Domain client surface cannot supply source paths or fabricated controlled rows, and Domain close closes active SQL sessions.