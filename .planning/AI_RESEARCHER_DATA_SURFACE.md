# ‏Autonomous AI Researcher — Research Data Surface / SQL Sandbox

‏Status: selected data-surface direction for discovery; not implementation-authorized

‏Scope: `B-US-008`

‏This document defines the machine-oriented data surface available to autonomous research SQL. It refines the selected hybrid architecture without changing the existing authoritative Scanner/Backtest semantics.

---

## ‏1. Outcome

‏The AI researcher needs enough direct numeric evidence to discover short-horizon momentum signals we did not predict during implementation, while the product still preserves a hard distinction between:

```text
research/debug analytics
!= authoritative candidate Scanner execution
```

‏The selected direction is a **server-owned, phase-aware research projection** over allowlisted immutable Market Flow US evidence.

‏The AI receives expressive SQL over curated research relations, not a raw DuckDB connection, arbitrary source path or complete operational schema.

‏The data surface must support:

- ‏single-day and multi-day analysis;
- ‏all documented typed market fields;
- ‏canonical identity and exact local timing facts;
- ‏bounded access to preserved provider `raw_data`;
- ‏cadence/gap/coverage analysis;
- ‏cross-security ranking/distributions/correlations;
- ‏per-security time-window analysis;
- ‏authoritative experiment/outcome joins;
- ‏null/missing/raw-field investigation;
- ‏Development debugging and failure analysis;
- ‏future denser-cadence evidence without redesign;
- ‏eventual measured optimization through transient caches when necessary.

‏It must not expose unrelated operational state or create a second market authority.

---

## ‏2. Core rule: research projection, not source catalog

‏General AI SQL never executes directly against the original evidence catalog.

‏For each authorized analysis/job, the Research Server constructs or reuses an isolated research sandbox containing only the relations permitted by:

- `researchRunId`;
- `evidencePlanId`;
- `partitionId`;
- ‏research phase/access state;
- ‏explicit experiment/result references supplied as analysis inputs;
- ‏server version / data-surface version.

‏The original source DBs remain immutable and are opened only through the proven server-owned read-only evidence path.

‏Source databases may be attached/read internally while the server builds an isolated projection, but must not remain reachable from AI-authored SQL.

‏Before AI SQL executes, the sandbox must have no attached arbitrary source catalog and no path-bearing object the SQL can use to reopen source files.

---

## ‏3. Isolation strategy

### ‏3.1 Small/bounded analyses

‏Preferred implementation direction:

```text
open allowlisted evidence source READ_ONLY
→ copy/project only authorized rows/columns into isolated DuckDB sandbox
→ detach/close source
→ apply/lock hardening
→ execute AI-authored SELECT only against research relations
```

‏This mirrors the strongest security property already proven by the historical Scanner sandbox: absence of the source catalog during user-authored SQL execution.

### ‏3.2 Large multi-day partitions

‏Copying an entire large partition into RAM for every analysis may become needlessly expensive.

‏If measurement shows that direct projection creation dominates research cost, the server may maintain a **transient partition-scoped research cache** under a server-owned research directory.

‏Such a cache must be:

- ‏derived only from allowlisted immutable source fingerprints;
- ‏scoped by data-surface version + partition fingerprint;
- ‏read-only while AI SQL executes;
- ‏disposable/rebuildable;
- ‏never market authority;
- ‏never accepted as proof if source fingerprints no longer match;
- ‏excluded from normal market-data lifecycle;
- ‏safe to delete without losing research truth because source evidence + ledger reproduce it.

‏This is not a permanent cross-day market warehouse and is not preapproved until workload evidence demonstrates the need.

---

## ‏4. Deliberately different relation names

‏Research SQL does not expose its broad evidence through relations named `latest` / `history`.

‏Those names belong to Scanner strategy semantics.

‏The research surface uses explicit names such as:

```text
research_sources
research_partition
research_cycles
research_history
research_universe
research_decision_points          optional materialized input
research_authoritative_outcomes   optional materialized input
experiment_points                 optional experiment input
experiment_candidates             optional experiment input
experiment_outcomes               optional experiment input
experiment_metrics                optional experiment input
```

‏This naming difference is intentional safety and semantics documentation.

‏A Query that is intended to become a live Scanner candidate is stored as a separate immutable `queryArtifact` and must use the real Scanner contract (`latest` / `history`) when executed by the Strategy Sandbox.

---

## ‏5. Base relation: `research_sources`

‏Purpose: machine-readable identity/provenance for evidence included in the current sandbox.

‏Expected columns:

```text
source_id                 VARCHAR
source_fingerprint        VARCHAR
schema_version            INTEGER
source_class              VARCHAR   -- active/archive classification
first_complete_at_ms      BIGINT
last_complete_at_ms       BIGINT
complete_cycle_count      BIGINT
min_universe_size         BIGINT NULL
max_universe_size         BIGINT NULL
```

‏Optional additive coverage statistics may be exposed when already computed by the source inventory.

‏Never expose:

- ‏filesystem path;
- ‏browser/provider authentication state;
- ‏account identifiers;
- ‏cookies/tokens;
- ‏raw runtime configuration.

‏`source_id` is the stable logical identity used by research SQL. It is not an operating-system path.

---

## ‏6. Base relation: `research_partition`

‏Purpose: make the current analysis authority visible from inside the SQL sandbox.

‏Expected shape is one/few rows describing the partition and permitted source/time ranges:

```text
partition_id
partition_role              -- DEVELOPMENT / VALIDATION_EXPOSED / POST_FINAL_AUDIT etc.
evidence_plan_id
source_id
allowed_from_ms NULL
allowed_to_ms NULL
max_authorized_horizon_ms NULL
```

‏This relation is metadata only. It never grants access beyond what was already materialized into the sandbox.

---

## ‏7. Base relation: `research_cycles`

‏Purpose: expose cycle/timing/coverage facts useful for cadence, gaps and exact baseline reasoning without exposing operational/session internals.

‏Expected columns:

```text
source_id
cycle_id
universe_revision
started_at_ms
completed_at_ms
committed_at_ms
duration_ms
requested
received
unique_count
missing
duplicates
unexpected
```

‏Rules:

- ‏only complete authoritative cycles are included by default;
- ‏failed/uncommitted cycles are not mixed with market evidence;
- ‏if failure diagnostics are ever needed for acquisition-quality research, expose them through a separate typed operational diagnostic capability, not the default research signal table;
- ‏`session_id`, `chunks_json`, `failure_phase`, `error_json` are excluded from the normal AI research surface.

‏`committed_at_ms` is important because Backtest baseline authority resolves from successful commit time.

---

## ‏8. Base relation: `research_history`

‏This is the primary open-ended market research surface.

‏Rows are successful committed market observations across one or more authorized source/day DBs.

### ‏8.1 Provenance / identity columns

```text
source_id
cycle_id
universe_revision
security_id
collected_at_ms
cycle_committed_at_ms
```

‏`source_id` is mandatory because `cycle_id` may repeat across independent day DBs.

‏The canonical cross-source row identity is therefore conceptually:

```text
(source_id, cycle_id, security_id)
```

### ‏8.2 Provider/display columns

```text
Symbol
PaperNameEng
PaperNameHeb
ExchangeName
TradeDateTime
CountryName
CountryNameEng
```

### ‏8.3 Typed numeric market columns

```text
Price
ChangePercent
DailyHigh
DailyLow
YearHigh
YearLow
DailyVolume
BeginYearChangePercent
Month12ChangePercent
Month36ChangePercent
AskRate
BidRate
YesterdayRate
PaperMarketCap
PaperIdYatab
CountryId
PaperType
ESGRatingId
ESGScope
```

‏These preserve the existing source-shaped semantics and nullability. Research documentation must not strengthen undocumented meanings/units.

### ‏8.4 Preserved raw provider row

```text
raw_data JSON
```

‏`raw_data` remains available in Development research because it preserves source properties/values not represented by typed projection and allows the AI to discover whether a useful provider field exists before the product adds a new typed column.

‏This is important for AI-first research: hiding all unknown raw fields would force the model to search only signals engineers predicted in advance.

‏Boundaries:

- ‏only the already-persisted per-market-row provider `raw_data` is eligible;
- ‏do not expose `source_metadata_json` through this relation;
- ‏do not expose browser request/headers/auth/session material;
- ‏large raw JSON output remains subject to result-byte/page limits;
- ‏raw provider fields retain unknown semantics until verified;
- ‏final recommendation artifacts do not dump arbitrary raw JSON by default;
- ‏if a final candidate depends on a raw field, the artifact must identify the exact JSON path/key and caveat its semantics.

### ‏8.5 Explicitly excluded operational columns

‏The normal projection omits:

```text
session_id
chunk_index
cycle_started_at_ms
chunk_received_at_ms
source_metadata_json
```

‏unless a future evidence-backed research requirement proves one of these is genuinely necessary. These are runtime/transport provenance, not current momentum-market signal authority.

---

## ‏9. Base relation: `research_universe`

‏Purpose: bounded identity/display/lifecycle context.

‏Expected columns:

```text
source_id
security_id
is_current
universe_revision
first_seen_at_ms
last_seen_at_ms
Symbol
PaperNameEng
PaperNameHeb
ExchangeName
```

‏Important semantic warning:

‏The persisted `universe` row represents the source DB's universe lifecycle state; it is **not** an exact historical membership table for arbitrary T0.

‏For exact historical membership at a baseline, use the rows present in the authoritative baseline cycle/history evidence, not `research_universe.is_current`.

‏`raw_source` is excluded initially because the richer per-observation `raw_data` already supports field discovery and the universe raw record adds little momentum value relative to payload/surface risk.

---

## ‏10. Mechanical timing semantics

‏The data surface must make these distinctions explicit:

```text
cycle_committed_at_ms  = successful local cycle commit authority time
collected_at_ms        = local market-row collection time
TradeDateTime          = provider string with intentionally unstrengthened semantics
```

‏Do not normalize `TradeDateTime` into an exchange timestamp unless separately proven.

‏Do not assume a fixed 10s/5s/3s interval.

‏AI SQL may compute actual deltas from observed timestamps, and typed coverage tools should expose cadence quantiles/gaps.

---

## ‏11. Decision-point relation

‏For many analyses the AI needs a deterministic sample of simulated decision times without rebuilding Backtest baseline resolution itself.

‏The server may materialize `research_decision_points` for an explicit schedule/reference.

‏Expected columns:

```text
point_id
source_id
requested_t0_ms
baseline_cycle_id NULL
baseline_committed_at_ms NULL
baseline_available BOOLEAN
partition_role
```

‏The baseline mapping is produced by the proven Backtest baseline resolver, not by AI SQL.

‏This relation gives the AI stable anchors for feature/label analysis while preserving one baseline definition across all candidates.

---

## ‏12. Authoritative outcome relation

‏The AI should not be forced to reimplement horizon tie-break/outcome semantics in ad-hoc SQL every time it wants labels.

‏For an explicit bounded decision-point/security/horizon input, the server may materialize:

```text
research_authoritative_outcomes
```

‏Expected columns:

```text
point_id
source_id
requested_t0_ms
baseline_cycle_id
security_id
horizon_ms
baseline_price
baseline_collected_at_ms
future_cycle_id NULL
future_collected_at_ms NULL
future_price NULL
change_percent NULL
outcome
unavailable_reason NULL
```

‏These values come from the same authoritative evaluator used by Backtest/Demo-Buy-compatible outcome semantics.

‏This relation is a **label/evidence relation**, not decision-time strategy input.

‏Its field manifest marks future-derived fields as:

```text
decision_time_eligible = false
future_dependent = true
research_only = true
```

‏The AI may correlate these labels with pre-decision evidence in Development, but a candidate Scanner SQL must later express its predictors using only legal decision-time `latest/history` data and pass Strategy Sandbox execution.

---

## ‏13. Experiment-derived relations

‏A `research_sql` analysis may explicitly reference one or more existing experiment/result objects as inputs.

‏When requested and phase-authorized, the server may populate relations such as:

### `experiment_points`

```text
experiment_id
query_artifact_id
point_ref
source_id
requested_t0_ms
baseline_cycle_id
returned_row_count
evaluated_unique_count
availability
```

### `experiment_candidates`

```text
experiment_id
point_ref
security_id
returned_position
baseline_price
baseline_collected_at_ms
```

### `experiment_outcomes`

```text
experiment_id
point_ref
security_id
returned_position
horizon_ms
future_cycle_id
future_collected_at_ms
future_price
change_percent
outcome
unavailable_reason
```

### `experiment_metrics`

‏Normalized metric rows with explicit numerator/denominator/exclusion/provenance metadata rather than opaque prose.

‏These relations let the AI perform arbitrary breakdowns on authoritative experiment truth without recalculating core outcome semantics.

---

## ‏14. No hidden future columns in the base market relation

‏Do not add convenience columns such as:

```text
future_price_30s
future_change_60s
will_go_up
best_future_move
```

‏to `research_history`.

‏Future-dependent facts belong in explicit label/outcome relations whose names and field metadata make hindsight obvious.

‏This reduces accidental leakage when the AI later translates a research idea into Scanner SQL.

---

## ‏15. Field manifest / machine-readable semantics

‏`describe_schema` must expose more than SQL types.

‏Every AI-visible field should have metadata like:

```text
relation
column
type
nullable
origin                 -- source_typed / source_raw / authority_derived / research_derived / provenance
meaning
known_unit NULL
identity_role NULL
scanner_equivalent NULL
decision_time_eligible BOOLEAN
future_dependent BOOLEAN
research_only BOOLEAN
phase_availability
caveats[]
```

‏Examples:

### `research_history.Price`

```text
origin = source_typed
scanner_equivalent = history.Price / latest.Price
decision_time_eligible = true
future_dependent = false
```

### `research_history.raw_data`

```text
origin = source_raw
scanner_equivalent = history.raw_data / latest.raw_data
decision_time_eligible = true
future_dependent = false
caveat = provider-shaped JSON; key meanings may be unverified
```

### `research_authoritative_outcomes.change_percent`

```text
origin = authority_derived
scanner_equivalent = null
decision_time_eligible = false
future_dependent = true
research_only = true
```

‏This manifest is central to helping the AI distinguish a useful correlation from a legal predictive input.

---

## ‏16. Derived feature policy

‏Do **not** predesign a large permanent feature store for the AI.

‏The general SQL surface already supports:

- ‏window functions;
- `LAG`/`LEAD` where phase-authorized;
- ‏self joins;
- `ASOF JOIN` if supported in the selected sandbox contract;
- ‏grouped distributions;
- ‏cross-security rank/percentiles;
- ‏conditional aggregates;
- ‏time-delta calculations;
- ‏JSON extraction from `raw_data`.

‏The initial research surface should therefore expose raw + typed evidence and only a few semantics-preserving authority helpers.

‏Do not initially add permanent fields such as:

```text
momentum_30s
momentum_score
acceleration_score
trade_activity_score
volatility_score
```

‏because those encode research opinions and risk narrowing the AI to our hypotheses.

### ‏16.1 When a derived helper becomes justified

‏A derived/precomputed feature/view/cache may be added later when evidence shows one of:

- ‏the same mechanical calculation is repeatedly recomputed and dominates workload;
- ‏the calculation has one exact semantics required across experiments;
- ‏raw expression is error-prone enough to threaten reproducibility;
- ‏a new Collector-side fact cannot be reconstructed accurately after collection.

‏Any such feature must be versioned/documented, independently testable, and marked in the field manifest.

---

## ‏17. Research-SQL phase policy

‏General SQL power changes by evidence role.

### ‏17.1 Development

‏Full authorized research surface is available:

- `research_history`;
- ‏coverage/cycle/universe relations;
- ‏Development decision points/outcomes;
- ‏Development experiment inputs;
- ‏raw_data;
- ‏future/post-decision evidence within Development.

‏This is the AI's main exploratory laboratory.

### ‏17.2 Validation — default closed analytical surface

‏Validation is intended to measure generalization, not immediately become another development set.

‏By default:

- ‏authoritative validation experiments may run;
- ‏aggregate/bounded metric APIs may expose contracted validation results;
- ‏general `research_sql` over Validation market/outcome rows is **not** opened automatically.

### ‏17.3 Validation explicit exposure

‏If deeper debugging on Validation is strategically useful, the run may explicitly expose Validation for research analytics.

‏That action must:

- ‏be durable and irreversible for evidence-accounting purposes;
- ‏record a validation exposure in the ledger;
- ‏state which partition/data classes became visible;
- ‏make clear that the exposed Validation evidence is tuning evidence, not untouched proof.

‏After exposure, `research_sql` may use the authorized Validation research projection under the normal bounds.

### ‏17.4 Sealed Holdout

‏Before finalist lock + authorized holdout evaluation:

```text
no research_sql sandbox containing Holdout market/outcome evidence
```

‏This includes seemingly harmless profiling whose result could reveal target-specific structure when the protocol defines it as sealed.

‏After the Research Run's recommendation is frozen/closed, a `POST_FINAL_AUDIT` research surface may expose detailed Holdout evidence for audit/reproduction without retroactively making it optimization evidence.

---

## ‏18. Cross-day/multi-source semantics

‏The sandbox may combine multiple day DBs, but must never silently pretend their local identifiers are globally unique.

‏Rules:

- ‏always carry `source_id` with `cycle_id`;
- ‏always carry `source_id` when joining source-local security observation/provenance facts;
- ‏`security_id` is canonical provider identity and may legitimately repeat across days;
- ‏cross-day chronological calculations use actual allowed timestamps plus source identity, never cycle ID alone;
- ‏do not assume archives are gapless consecutive trading days;
- ‏do not infer one continuous producer session across sources.

‏A query that intentionally studies persistence of the same `security_id` across days may do so, but it must treat each source/day as independent evidence authority.

---

## ‏19. Raw JSON discovery path

‏The AI must be able to discover candidate raw fields without dumping millions of JSON objects.

‏The API should support typed helpers in addition to direct bounded JSON SQL, for example:

- ‏list observed top-level `raw_data` keys with counts/types;
- ‏profile one raw JSON path/key across an authorized partition;
- ‏compare typed projection vs raw presence/null/type;
- ‏sample bounded values with source/security/time provenance.

‏These helpers are not strategy features. They are schema-discovery tools.

‏If a raw field becomes materially useful:

1. ‏the AI can test it mechanically through JSON extraction in Development;
2. ‏candidate Scanner SQL may use the same legal `raw_data` extraction if admission supports it;
3. ‏if repeated use/performance/semantics justify it, product planning may promote the field to a typed collected projection through the normal schema/change process.

---

## ‏20. Research SQL admission

‏`research_sql` is intentionally more expressive than Scanner result semantics but remains a bounded read-only analytical surface.

### ‏20.1 Statement rule

‏Initial selected direction:

```text
exactly one SELECT statement
```

‏No mutation/DDL/transaction/config statements.

### ‏20.2 Forbidden capabilities

‏AI-authored SQL may not:

- `ATTACH` / `DETACH`;
- ‏open arbitrary database files;
- ‏read/write CSV/Parquet/JSON/filesystem paths;
- ‏load/install extensions;
- ‏create/use secrets;
- ‏change DuckDB configuration;
- ‏invoke shell/network/external-access functions;
- ‏use `query(...)` / `query_table(...)` dynamic-SQL escape hatches;
- ‏write/copy/export data;
- ‏create persistent objects.

‏Statement admission plus runtime hardening must both enforce these rules. Do not rely on SQL text regex alone.

### ‏20.3 Function hardening

‏Reuse the existing Scanner practice of rejecting DuckDB functions reported as side-effecting, but Research SQL requires additional explicit protection against read-side external/file/network table functions even when DuckDB does not classify them as side-effecting.

‏Implementation planning must build an executable deny/allow proof against the exact DuckDB version used by the product.

### ‏20.4 Parameters

‏Do not require parameter support initially. One self-contained SELECT keeps hashing/reproduction straightforward.

‏Typed APIs should be used for operations where user-controlled values would otherwise require large fragile literal construction.

‏Parameter support may be added later only with an explicit normalized query+bindings fingerprint contract.

---

## ‏21. Resource bounds inside the sandbox

‏Every `research_sql` execution is bounded independently of SQL validity.

‏Contract-level controls include:

- ‏query-text byte limit;
- ‏wall-clock timeout;
- ‏cancellation;
- ‏max concurrent research queries;
- ‏DuckDB memory limit;
- ‏bounded temp-disk directory/usage where spill is allowed;
- ‏result row limit;
- ‏result column limit;
- ‏serialized-result byte limit;
- ‏page size limit;
- ‏max input experiment/result references;
- ‏max source/time partition scope per ad-hoc request when needed.

‏Exact numeric defaults are implementation/workload decisions and must be measured on the target machine.

‏Exceeding a resource bound fails with a stable public-safe error; it does not silently return a truncated result as if complete.

‏Explicit sampling/limit queries may of course intentionally return a subset when the SQL/request says so.

---

## ‏22. Result semantics

‏The default result response is compact:

```text
analysisId
jobId/status
query fingerprint
partition fingerprint
input references
column schema
row count when known
resultHandle
warnings
```

‏Rows are retrieved through bounded pages.

‏Ordering is exactly the SQL result order. If deterministic order matters, the AI must request it with explicit `ORDER BY`.

‏The server must not silently reorder analytical results for presentation.

---

## ‏23. Provenance and reproduction

‏Every material research analysis records enough to rerun:

- ‏exact SQL text/hash;
- ‏research data-surface version;
- ‏partition ID/fingerprint;
- ‏source IDs/fingerprints;
- ‏phase/access state;
- ‏input experiment/result IDs/fingerprints;
- ‏server/DuckDB version;
- ‏resource-policy version;
- ‏job/result status;
- ‏result schema/handle/hash where practical.

‏The ledger does not need to store the entire market dataset or every giant analytical result forever.

‏If a result is ephemeral, provenance must still be sufficient to recompute it while source fingerprints remain available.

---

## ‏24. Strategy translation rule

‏A research finding is never deployable merely because its SQL looks good in `research_sql`.

‏The path is:

```text
research finding
→ identify only decision-time-eligible predictors
→ author exact Scanner SQL using Scanner relations/semantics
→ create immutable queryArtifact
→ validate Scanner admission
→ run Strategy Sandbox experiments
→ compare/validate/holdout under the Evidence Plan
→ recommendation only from authoritative experiment truth
```

‏The server should help by reporting the `scanner_equivalent` mapping for research fields where one exists.

‏If a useful research field has no legal Scanner equivalent, it is an **AI capability gap / product-change candidate**, not a reason to leak that field into Scanner execution.

---

## ‏25. Data leakage canaries

‏Implementation verification must contain planted facts proving the separation.

‏At minimum:

- ‏a future-only value absent from all decision-time rows;
- ‏a source-operational secret-like synthetic field absent from research projection;
 ‏- ‏a sealed-Holdout marker visible only after post-final audit authorization;
- ‏a second source catalog/object that must remain unreachable;
- ‏an arbitrary local file path that `research_sql` must not read;
- ‏a side-effect/external function attempt;
- ‏an oversized/timeout query;
- ‏cross-day duplicate `cycle_id` values proving `source_id` scoping is required.

‏Tests must show AI SQL cannot access the forbidden canaries while legitimate Development analysis remains expressive.

---

## ‏26. Null / missing / zero semantics

‏Preserve existing Market Flow US distinctions.

‏Typed columns may map invalid/missing source values to SQL NULL; `raw_data` preserves source presence/value differences.

‏The AI must be told:

```text
0 != NULL != empty string != missing raw property
```

‏Research helpers for raw JSON coverage should explicitly distinguish missing key from present-null when DuckDB JSON semantics permit exact determination.

---

## ‏27. Schema v3/v4 compatibility

‏The historical market projection is materially compatible across Market Flow US v3/v4 for the current typed `history` fields.

‏The Research Server should normalize supported source versions into one versioned AI research projection rather than make the AI branch its SQL unnecessarily by source schema version.

‏Source-specific capabilities that do differ remain visible through schema/source metadata.

‏Do not synthesize Demo Buy structures into v3 sources merely for uniformity; experiment outcome authority comes from the shared historical evaluator, not persisted Demo Buy tables.

---

## ‏28. No Demo Buy / saved-query operational tables in the default research surface

‏The autonomous researcher primarily needs market evidence and its own experiment ledger.

‏Do not expose these source DB tables by default through general research SQL:

```text
scanner_saved_queries
demo_buy_captures
demo_buy_items
schema_info
sessions
```

‏Reasons:

- ‏saved queries are configuration/user artifacts, not independent market evidence;
- ‏Demo Buy captures reflect historical human/product investigation and may bias autonomous research;
- ‏research experiments have their own stronger provenance model;
- ‏schema/environment metadata is already available through typed APIs;
- ‏session/config/error state is operational.

‏If later research needs to compare against a known saved/built-in query, import/copy its exact SQL as a `queryArtifact` through a typed capability rather than exposing the whole configuration table.

---

## ‏29. Materialized experiment/result inputs are opt-in

‏A sandbox should not automatically load every experiment ever run.

‏Each `submit_research_sql` request declares bounded `inputRefs`, for example:

```text
partitionId
evidenceRole/access mode
experimentIds[]
metricSetIds[]
decisionPointSetId NULL
outcomeDatasetId NULL
```

‏The server builds only the relevant experiment-derived relations.

‏This keeps relation cardinality understandable, payload/workload bounded and provenance exact.

---

## ‏30. Convenience views: semantics-preserving only

‏Initial built-in views should be minimal and mechanical.

‏Reasonable examples if implementation proves useful:

- ‏cycle cadence/coverage summary derived from `research_cycles`;
- ‏security observation-count/time-range summary;
- ‏field coverage/null summary exposed preferably through typed profiling APIs;
- ‏exact decision-point/baseline mapping;
- ‏authoritative outcome labels for explicit point/security/horizon sets.

‏Avoid convenience views that bake in a momentum theory or scoring method.

---

## ‏31. Research-cache invalidation

‏Any transient projected/cache DB is keyed by at least:

```text
data_surface_version
partition_fingerprint
source_fingerprints
projection definition version
```

‏If any source fingerprint differs from the ledger/inventory expectation:

- ‏do not reuse the cache;
- ‏fail the affected reproducibility claim with `RESEARCH_SOURCE_CHANGED` where appropriate;
- ‏rebuild only under an explicitly refreshed evidence inventory/plan.

‏A cache hit is an optimization only. It never weakens source validation.

---

## ‏32. Performance philosophy

‏Do not prematurely add a permanent feature warehouse/index family.

‏Performance escalation order:

```text
measure representative AI research workload
→ remove repeated sandbox/projection construction
→ reuse safe partition projection/cache
→ improve bounded query batching
→ add narrow index/materialization only for measured bottleneck
→ only then consider broader derived/precompute infrastructure
```

‏Any performance optimization must reproduce the same logical research rows/results as the unoptimized projection.

---

## ‏33. Capability-gap detection

‏The data surface should make it possible to distinguish:

```text
bad hypothesis
```

‏from:

```text
insufficient evidence/cadence/field availability
```

‏Examples the AI should be able to establish:

- ‏requested 3-second momentum cannot be resolved from current observation gaps;
- ‏a promising raw provider key exists but is missing in most rows;
‏- ‏a useful signal depends on a fact not currently collected;
- ‏a repeated computation is too expensive without additive product support.

‏These become documented product-evolution findings. They do not authorize the Research Run to mutate production automatically.

---

## ‏34. Required implementation proof derived from this design

‏When planning becomes implementation-authorized, success evidence must cover at least:

### Correctness

- ‏all intended typed market fields project exactly;
- ‏raw JSON preserves provider values/presence within the chosen projection;
- ‏cross-source identity carries `source_id` and handles duplicate cycle IDs;
- ‏cycle commit times join correctly;
- ‏null/zero/missing semantics remain exact;
- ‏decision-point mappings match Backtest baseline resolver;
- ‏authoritative outcome relations match shared evaluator exactly.

### Isolation/security

- ‏source file bytes unchanged before/after analyses;
- ‏no source path visible to SQL/client;
- ‏no operational/config/session/error/source-metadata objects visible;
- ‏no attached source catalog reachable during AI SQL execution;
- ‏external file/network/extension/secret/config escape attempts fail;
- ‏only one read-only SELECT accepted;
- ‏sealed Holdout cannot be surfaced by alternate relation/function/catalog path.

### Phase enforcement

- ‏Development full access works;
- ‏Validation general SQL is closed by default;
- ‏explicit Validation exposure is durably recorded;
- ‏Holdout research SQL is impossible before finalization;
- ‏post-final audit can expose only the explicitly authorized final evidence.

### Resource behavior

- ‏timeout/cancellation stop expensive work;
- ‏row/byte/page limits are enforced;
- ‏large outputs use stable result handles;
- ‏cache/reuse, if implemented, is fingerprint-safe;
- ‏representative 4k-universe/multi-day research workload is measured on target hardware.

### Research usefulness

- ‏AI can compute arbitrary legal window/cross-security/profile queries over Development;
- ‏AI can inspect raw-field keys/coverage;
- ‏AI can join experiment outcomes to market evidence;
- ‏AI can derive a new legal Scanner hypothesis without any dedicated hard-coded feature endpoint;
- ‏the resulting Scanner query reproduces through Strategy Sandbox rather than relying on research-only columns.

---

## ‏35. Selected decisions from this segment

1. ‏General research uses a curated isolated projection, never the raw source catalog.
2. ‏Research relation names are deliberately different from Scanner `latest/history`.
3. ‏`research_history` exposes all documented typed market fields plus bounded `raw_data`, while excluding operational/session/source-metadata fields.
4. ‏Cross-day rows always carry `source_id`; `cycle_id` is source-local.
5. ‏Exact baseline mappings and outcome labels are supplied by authoritative server helpers rather than reimplemented ad hoc.
6. ‏Future-dependent labels live in explicit outcome relations, never hidden in base market rows.
7. ‏The machine-readable field manifest identifies decision-time eligibility, future dependence and Scanner equivalents.
8. ‏No permanent momentum/feature store is introduced initially.
9. ‏General research SQL is fully available on Development, closed on Validation by default, and forbidden on sealed Holdout until post-final audit.
10. ‏Validation can be explicitly exposed, but that exposure is durable tuning history.
11. ‏Research SQL is one bounded read-only SELECT with additional external-read hardening beyond Scanner's side-effect checks.
12. ‏Transient partition caches are allowed only as measured, fingerprinted, disposable optimizations.
13. ‏Saved-query/Demo-Buy/session/config tables are not part of the default research SQL surface.
14. ‏Raw-field discovery is a first-class capability so the AI is not limited to engineer-predicted typed features.
15. ‏Every deployable idea must be translated back into legal Scanner SQL and proven through Strategy Sandbox experiments.

---

## ‏36. Remaining discovery questions after this segment

‏This data-surface design is sufficiently specific for later contracts, but implementation must still decide measured details such as:

- ‏exact sandbox materialization strategy for representative multi-day volumes;
- ‏whether the first implementation needs any disk-backed transient research cache at all;
- ‏exact DuckDB external-read/function hardening list for the pinned DuckDB version;
- ‏exact query/memory/temp/result/concurrency limits;
- ‏the smallest typed raw-JSON profiling helpers;
- ‏whether outcome datasets need their own durable IDs or can initially be result handles/jobs;
- ‏exact post-final audit exposure mechanics.

‏These are implementation-design decisions unless measurement invalidates the selected architecture.
