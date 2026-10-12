# ‏Autonomous AI Researcher — Machine API / Research Ledger Contract

‏Status: selected contract direction for discovery; not implementation-authorized

‏Scope: `B-US-008`

‏This document defines the machine-facing contract required by the selected hybrid AI-research architecture and the durable research state required for autonomous, resumable short-horizon momentum research.

‏It deliberately defines **research-domain semantics before MCP transport details**. The local Research Server owns the contract. MCP is a thin adapter over these semantics.

---

## ‏1. Contract outcome

‏Desktop ChatGPT must be able to:

```text
understand environment
→ create/resume one Research Run
→ inspect evidence/coverage/schema
→ define/record the current objective interpretation
→ create immutable candidate Scanner SQL artifacts
→ run authoritative historical experiments
→ perform broader read-only research analytics
→ inspect exact evidence/debug anomalies
→ compare prior work
→ validate finalists
→ execute sealed holdout correctly
→ produce a reproducible final SQL/report
```

‏without depending on prior chat history, hidden server state, arbitrary filesystem access or the human Backtest UI.

‏The contract must support long autonomous work while preserving:

- ‏source DB immutability;
- ‏strategy/research authority separation;
- ‏server-enforced Development / Validation / Sealed Holdout boundaries;
- ‏exact reproducibility;
- ‏bounded payloads/workload;
- ‏cancellation/restart;
- ‏public-safe durable state.

---

## ‏2. Core API principle: stateless client, durable server truth

‏No correctness-critical research state may exist only inside one ChatGPT conversation or one MCP connection.

‏Every meaningful object receives a stable server-generated ID.

‏Primary identities:

```text
researchRunId
objectiveVersionId
evidenceInventoryId
evidencePlanId
partitionId
queryArtifactId
experimentId
analysisId
jobId
resultHandle
metricSetId
finalistSetId
holdoutEvaluationId
artifactId
```

‏The AI client may cache these values for convenience, but the Research Server + Research Ledger remain authoritative.

‏A fresh client must be able to reconstruct the current state from only:

```text
researchRunId
+ Research Server APIs
```

‏No API response should require replaying private model chain-of-thought.

---

## ‏3. API layering

‏Use three layers.

### ‏3.1 Research Domain API

‏The stable product contract.

‏Responsibilities:

- ‏validation;
- ‏authority enforcement;
- ‏job submission;
- ‏ledger writes;
- ‏result handles/pagination;
- ‏evidence access;
- ‏finalization.

‏This layer is transport-neutral and should be directly testable without MCP.

### ‏3.2 Local transport

‏A minimal local process API used by the MCP adapter and deterministic tests.

‏Exact HTTP/stdin/IPC details are implementation decisions. The semantic request/response contracts below must not depend on them.

### ‏3.3 MCP adapter

‏Maps model-facing tools/resources onto Research Domain API operations.

‏The MCP adapter must not own:

- ‏experiment execution logic;
- ‏SQL admission;
- ‏partition truth;
- ‏holdout sealing;
- ‏ledger truth;
- ‏metric calculation;
- ‏result persistence.

‏This permits MCP transport/client changes without redesigning research behavior.

---

## ‏4. Common request/response envelope

‏Every mutating or expensive operation should support a bounded `clientRequestId` for retry-safe local deduplication.

‏Conceptual request metadata:

```json
{
  "researchRunId": "...",
  "clientRequestId": "..."
}
```

‏The server returns stable authority metadata where relevant:

```json
{
  "requestId": "server-generated",
  "researchRunId": "...",
  "createdAtMs": 0,
  "serverVersion": "..."
}
```

‏Rules:

- ‏same `clientRequestId` + same normalized intent returns/references the same created object/job where practical;
- ‏same `clientRequestId` + different intent rejects;
- ‏read-only retrieval operations need not require `clientRequestId`;
- ‏deduplication is a reliability mechanism, not an excuse to silently merge semantically different experiments.

---

## ‏5. Capability family A — environment/bootstrap

### ‏5.1 `describe_research_environment`

‏Purpose: let a fresh AI session understand what system it is connected to before doing research.

‏Returns at least:

- ‏product/research-server version;
- ‏schema-contract version;
- ‏available capability versions;
- ‏strategy-vs-research authority rules;
- ‏Development/Validation/Holdout semantics;
- ‏hard security boundaries;
- ‏resource-limit summary;
- ‏supported outcome horizons / dynamic-horizon rules;
- ‏supported source/schema versions;
- ‏current MCP/API compatibility version.

‏This is machine-readable authority metadata, not merely README prose.

### ‏5.2 `describe_schema`

‏Returns the AI-visible research/strategy field manifest:

- ‏relation/view;
- ‏column;
- ‏type/nullability;
- ‏meaning;
- ‏unit/scale when known;
- ‏identity role;
- ‏ordering/tie-break role;
- ‏source authority;
- ‏raw/typed/derived classification;
- ‏missing/null/zero caveats;
- ‏decision-time eligibility;
- ‏research-only eligibility;
- ‏schema-version availability.

### ‏5.3 `describe_field`

‏Focused retrieval for one field including caveats/examples/coverage hints.

### ‏5.4 `list_evidence_sources`

‏Returns bounded metadata only, never arbitrary machine paths.

‏Per source:

- `sourceId`;
- ‏active/archive classification;
- ‏schema version;
- ‏source fingerprint;
- ‏first/last complete time;
- ‏cycle count;
- ‏approximate universe range;
- ‏availability/compatibility state.

### ‏5.5 `inspect_evidence_coverage`

‏Typed profiling for one or more allowed sources:

- ‏cadence quantiles/distribution;
- ‏gaps/outages;
- ‏eligible T0 range;
- ‏horizon feasibility;
- ‏field null/missing coverage;
- ‏universe size distribution;
- ‏effective distinct baselines;
- ‏boundary exclusions.

‏This may execute as a job for larger partitions.

---

## ‏6. Capability family B — Research Run lifecycle

### ‏6.1 `create_research_run`

‏Input:

- ‏user's natural-language short-horizon momentum/stock-selection objective;
- ‏optional explicit constraints/budget preferences;
- ‏optional selected source scope, otherwise allow server-assisted evidence planning.

‏Creates:

- `researchRunId`;
- ‏initial immutable user-intent record;
- ‏budget policy snapshot;
- ‏environment/version snapshot.

‏It does **not** automatically invent final objective metrics or begin expensive research.

### ‏6.2 `get_research_run`

‏Returns compact current state:

- ‏user objective;
- ‏current Objective Version;
- ‏Evidence Plan state;
- ‏budget used/remaining;
- ‏experiment/analysis/job counts;
- ‏current best/finalist references if explicitly recorded;
- ‏validation exposure count;
- ‏holdout state (`UNPLANNED | SEALED | EVALUATED | CONTAMINATED` as derived truth, not arbitrary workflow ceremony);
- ‏last durable research decision/next-action note when recorded;
- ‏final artifact if closed.

### ‏6.3 `resume_research_run`

‏Returns a bounded AI-oriented resume package, not all history:

- ‏mission/user intent;
- ‏current objective interpretation;
- ‏evidence plan summary;
- ‏top retained candidates/experiments by explicitly recorded decision;
- ‏important rejected hypotheses/known failures;
- ‏validation status/exposure;
- ‏running/recoverable jobs;
- ‏budget remaining;
- ‏stable references for deeper retrieval.

‏This is the primary fresh-chat recovery operation.

### ‏6.4 `record_research_note`

‏Stores only concise explicit artifacts, such as:

- `hypothesis`;
- `decision` (`KEEP | REJECT | INVESTIGATE | FINALIST`);
- ‏reason/rationale;
- ‏next-action pointer;
- ‏related experiment/query IDs.

‏Never accept/store private chain-of-thought as a required field.

---

## ‏7. Capability family C — objective and evidence planning

### ‏7.1 `create_objective_version`

‏Records the AI's explicit operationalization of the user's current goal.

‏Required/conditional fields:

- ‏plain-language interpretation;
- ‏target direction;
- ‏primary horizon(s);
- ‏selection policy (`TOP_1`, `TOP_N`, `ALL_RETURNED`, etc. where contracted);
- ‏primary metric(s);
- ‏hard constraints;
- ‏secondary/tie-break metrics;
- ‏target threshold if applicable;
- ‏risk/downside constraints where requested/selected;
- ‏minimum evidence expectations;
- ‏intended live scan interval when material;
- ‏search budget overrides within allowed limits.

‏Versions are immutable. A changed interpretation creates a new version.

### ‏7.2 `propose_evidence_plan`

‏Server computes a deterministic candidate split from the current evidence inventory and objective horizon requirements.

‏It may return alternatives when evidence is limited, for example:

```text
A: whole-day Development / Validation / Holdout
B: chronological blocks + horizon-aware purge
C: insufficient independent holdout; reduced-confidence protocol
```

‏The AI may choose among policy-valid alternatives or request a justified replan.

### ‏7.3 `commit_evidence_plan`

‏Creates immutable:

- `evidencePlanId`;
- `DEVELOPMENT` partition;
- `VALIDATION` partition;
- `SEALED_HOLDOUT` partition when feasible;
- ‏deterministic schedules/rules;
- ‏source fingerprints;
- ‏purge/embargo rules;
- ‏partition-generation algorithm/version.

‏Once materially used for tuning, changing the plan creates a new Evidence Plan Version and invalidates independent-validation claims that depended on the old split where appropriate.

### ‏7.4 Partition visibility contract

‏Every data/experiment API must derive access from `partitionId` + current phase authority.

‏The client never sends arbitrary file paths/time ranges to bypass a committed Evidence Plan.

---

## ‏8. Capability family D — immutable candidate Scanner SQL

### ‏8.1 `validate_scanner_sql`

‏Runs existing Scanner admission/static checks without consuming validation/holdout evidence.

‏Returns:

- ‏valid/invalid;
- ‏stable error code;
- ‏bounded remediation hint;
- ‏normalized metadata needed for artifact creation;
- ‏no claim that the strategy is good.

### ‏8.2 `create_query_artifact`

‏Input:

- ‏exact SQL;
- ‏optional human/AI label;
- ‏optional parent query artifact;
- ‏optional concise hypothesis/reason.

‏Creates immutable:

- `queryArtifactId`;
- ‏exact SQL bytes/text;
- ‏cryptographic hash;
- ‏creation metadata;
- ‏parent lineage reference;
- ‏Scanner admission version.

‏Changing one byte creates a new artifact. Do not attempt general semantic SQL equivalence as authority.

### ‏8.3 `get_query_artifact`

‏Returns exact copy/paste SQL + immutable metadata.

### ‏8.4 Query artifact rule

‏Experiments reference `queryArtifactId`; they do not embed mutable SQL copies as authority.

---

## ‏9. Capability family E — authoritative strategy experiments

### ‏9.1 `submit_experiment`

‏Purpose: evaluate one or more immutable candidate Scanner queries through the **strategy sandbox**, never through general research SQL.

‏Input binds:

- `researchRunId`;
- `objectiveVersionId`;
- `partitionId`;
- ‏phase/role (`DEVELOPMENT | VALIDATION | HOLDOUT_FINAL`);
- ‏one or more `queryArtifactId` values;
- ‏frozen T0 schedule definition or server-owned schedule reference;
- ‏selection policy / Top-N;
- ‏horizons;
- ‏metric profile;
- ‏optional comparison group identifier.

‏Server validates that the requested role is legal for the partition.

‏Returns immediately:

```text
experimentId
jobId
```

‏for non-trivial work.

### ‏9.2 Authoritative execution semantics

‏For every T0/query:

```text
resolve B
→ execute immutable Scanner SQL in strategy sandbox
→ preserve exact returned order
→ apply contracted selection semantics
→ evaluate post-decision outcomes separately
→ persist compact experiment truth + references
→ aggregate requested metrics
```

‏No research-SQL result may be substituted for this execution path.

### ‏9.3 Development experiments

‏May return/allow drill-down to detailed selected rows/outcomes.

### ‏9.4 Validation experiments

‏Server enforces committed Validation schedule and records one exposure event.

‏Default response should be compact metrics/breakdowns. Detailed evidence access is policy-controlled because unrestricted validation drilling increases selection pressure.

### ‏9.5 Holdout experiment

‏Cannot be called as an ordinary experiment.

‏Holdout is only reachable through the dedicated finalist/finalization capability below.

---

## ‏10. Capability family F — general research analytics

### ‏10.1 `submit_research_sql`

‏Purpose: give the AI expressive exploratory access without granting source/filesystem authority.

‏Input:

- `researchRunId`;
- ‏authorized `partitionId`;
- ‏one analytical SQL statement;
- ‏declared purpose (`PROFILE | DEBUG | HYPOTHESIS | AGGREGATE | OTHER_BOUNDED`);
- ‏requested output mode (`PREVIEW | PAGED_RESULT | AGGREGATE`);
- ‏optional related experiment/query references.

‏Rules:

- ‏Research Server creates/chooses the sandbox relations;
- ‏one read-only analytical statement;
- ‏no arbitrary `ATTACH`/file readers/extensions/secrets/config mutation;
- ‏no market/source mutation;
- ‏query timeout;
- ‏row/column/byte bounds;
- ‏cancellation;
- ‏partition role enforcement;
- ‏every material analysis gets `analysisId` and provenance.

### ‏10.2 Research SQL visibility

‏Development: broadest allowed read-only evidence.

‏Validation: restricted according to Evidence Plan; unrestricted target/outcome drilling is not automatically allowed.

‏Sealed Holdout: **no general research SQL access before holdout finalization**.

### ‏10.3 `get_analysis`

‏Returns compact query/provenance/status/result handle.

### ‏10.4 Why no unrestricted raw connection

‏The AI gets SQL expressiveness, not connection ownership.

‏This allows arbitrary useful analytics while preserving:

- ‏partition enforcement;
- ‏resource control;
- ‏source allowlisting;
- ‏stable provenance;
- ‏payload bounds;
- ‏separation from Scanner authority.

---

## ‏11. Capability family G — typed evidence / diagnosis

‏General SQL is not always the best interface for deterministic product semantics.

### ‏11.1 `get_experiment_summary`

‏Returns:

- ‏experiment configuration/fingerprints;
- ‏job/result status;
- ‏metric-set references;
- ‏coverage/exclusion counts;
- ‏query references;
- ‏partition role;
- ‏warnings.

### ‏11.2 `get_experiment_points`

‏Paged compact T0 rows:

- ‏requested T0;
- ‏resolved baseline;
- ‏returned/evaluated counts;
- ‏representative objective metrics;
- ‏availability;
- ‏stable point reference.

### ‏11.3 `get_experiment_candidates`

‏Paged candidate evidence for one allowed point/query:

- `securityId`;
- ‏returned position;
- ‏baseline price/time;
- ‏selected future observations;
- ‏horizon outcomes;
- ‏unavailable reason;
- ‏stable evidence references.

‏Phase policy may redact/restrict candidate-level evidence in Validation and forbids it for sealed Holdout before finalization.

### ‏11.4 `inspect_security_window`

‏Typed bounded historical window for one/few securities and an authorized partition/purpose.

### ‏11.5 `inspect_outcome_evidence`

‏Explains the exact future row chosen/rejected for a selected horizon using authoritative tie-break rules.

### ‏11.6 `diagnose_returned_candidate`

‏Returns deterministic evidence references and visible values needed to understand why the candidate was present/ranked where it was, without pretending to semantically parse arbitrary SQL beyond evidence the system can establish.

### ‏11.7 `diagnose_missing_candidate`

‏Use a layered diagnostic contract rather than promise a perfect arbitrary-SQL theorem prover.

‏Supported mechanisms may include:

- ‏baseline membership check;
- ‏field/null/history-anchor inspection;
- ‏candidate comparison to returned boundary;
- ‏AI-driven research SQL/counterfactual analysis;
- ‏optional later predicate instrumentation if implementation proves it safe/useful.

‏Any rewritten/instrumented diagnostic query is explicitly non-authoritative and can never replace the original Scanner result.

---

## ‏12. Capability family H — jobs, progress and cancellation

### ‏12.1 Job state

‏Use a deliberately small durable state set:

```text
QUEUED
RUNNING
SUCCEEDED
FAILED
CANCELLED
```

‏A server restart may additionally derive `INTERRUPTED` internally during recovery, but persisted work should be reconciled into one of the above externally meaningful states or safely resumable/retryable behavior. Do not create a large workflow state machine.

### ‏12.2 `get_job`

‏Returns:

- `jobId`;
- ‏kind;
- ‏state;
- ‏created/started/completed times;
- ‏bounded progress (`completedUnits`, `totalUnits` when knowable);
- ‏budget consumption;
- ‏result references;
- ‏stable error code/message when failed;
- ‏whether cancellation is still possible.

### ‏12.3 `cancel_job`

‏Cancellation is best-effort but must propagate to active DuckDB/read/evaluation work where technically possible and stop future queued units.

‏Cancellation never converts partial output into a successful complete experiment.

### ‏12.4 Restart recovery

‏Jobs are durable enough to distinguish:

- ‏never started;
- ‏completed with durable result;
- ‏interrupted before durable completion.

‏Do not silently mark interrupted expensive work successful.

‏Exact resume-vs-restart behavior may differ by job kind, but must be deterministic and recorded.

---

## ‏13. Result handles and pagination

‏MCP/tool payloads must remain compact.

‏Large outputs are represented by server-owned `resultHandle` objects.

### ‏13.1 Result handle metadata

‏At minimum:

- `resultHandle`;
- ‏result kind/schema version;
- ‏row count when known;
- ‏column metadata;
- ‏serialized byte estimate when practical;
- ‏creation source (`experimentId` / `analysisId` / `jobId`);
- ‏partition/evidence fingerprints;
- ‏expiry/retention policy if ephemeral.

### ‏13.2 `get_result_page`

‏Input:

- `resultHandle`;
- ‏opaque cursor or offset depending on result contract;
- ‏bounded page size.

‏Output:

- ‏rows;
- ‏next cursor;
- ‏count metadata;
- ‏truncation indicator.

### ‏13.3 Paging rules

- ‏page size has server maximum;
- ‏one page has serialized-byte maximum independent of row count;
- ‏ordering is frozen with the result;
- ‏cursor cannot be reused against another result;
- ‏no arbitrary SQL is smuggled into paging calls;
- ‏retrieval does not rerun the experiment unless explicitly documented as recomputation.

---

## ‏14. Capability family I — comparison and research memory

### ‏14.1 `list_experiments`

‏Filterable/paginated by:

- ‏run;
- ‏query artifact;
- ‏objective version;
- ‏partition role;
- ‏status;
- ‏decision tag;
- ‏creation range.

### ‏14.2 `compare_experiments`

‏Compares only experiments whose differences are explicit.

‏Returns:

- ‏configuration differences;
- ‏partition/schedule compatibility;
- ‏metric deltas with denominators;
- ‏candidate overlap where permitted;
- ‏warnings when comparisons are not apples-to-apples.

### ‏14.3 `search_research_notes`

‏Allows the AI to recover prior hypotheses/rejections without loading all history.

### ‏14.4 Duplicate aids

‏Server can identify exact duplicate query artifacts, exact duplicate experiment requests and exact repeated research SQL requests through hashes/fingerprints.

‏Semantic near-duplicate detection may later be added as an advisory optimization; it is not correctness authority.

---

## ‏15. Capability family J — finalist lock and sealed holdout

### ‏15.1 `create_finalist_set`

‏Input:

- ‏small bounded set of exact `queryArtifactId` values;
- `objectiveVersionId`;
- ‏selection policy/horizons/metric profile;
- ‏concise justification referencing prior evidence.

‏Server verifies:

- ‏no holdout has already been used improperly for this lineage;
- ‏queries are immutable/valid;
- ‏Evidence Plan contains a usable sealed holdout;
- ‏set size is within configured bound.

‏Creates immutable `finalistSetId`.

### ‏15.2 `submit_holdout_evaluation`

‏Only operation allowed to consume sealed holdout strategy outcomes.

‏Input:

- `finalistSetId`;
- ‏exact committed holdout schedule from Evidence Plan.

‏Returns `holdoutEvaluationId + jobId`.

‏The AI cannot alter T0s, horizons or Query SQL for this job.

### ‏15.3 Holdout result exposure

‏Initial completion response exposes only the contracted final metrics/breakdowns required for candidate selection and confidence assessment.

‏Once the run's final recommendation is frozen/closed, detailed holdout evidence may become available for audit/reproduction according to the final contract.

### ‏15.4 Contamination rule

‏If any candidate is materially changed because of holdout output:

- ‏new query artifact required;
- ‏old holdout marked contaminated for that new lineage;
- ‏revised candidate cannot claim that holdout as independent confirmation;
- ‏fresh independent evidence is required for a new final holdout claim when available.

---

## ‏16. Capability family K — final recommendation artifact

### ‏16.1 `build_recommendation_artifact`

‏Server-generated deterministic artifact from ledger truth.

‏Input:

- ‏selected final `queryArtifactId` or explicit `NO_RECOMMENDATION`;
- ‏finalist/holdout references;
- ‏optional concise AI-written interpretation/limitations subject to bounded length.

‏Artifact must include:

- ‏exact copy/paste Scanner SQL;
- ‏user objective + final Objective Version;
- ‏evidence inventory/plan identifiers/fingerprints;
- ‏Development/Validation/Holdout roles;
- ‏search breadth: candidate/experiment/analysis/validation exposure counts;
- ‏metrics with denominators/exclusions;
- ‏per-day/time stability where material;
- ‏coverage/cadence limitations;
- ‏comparison against baseline/strong alternatives;
- ‏holdout results when valid;
- ‏parameter/ablation robustness evidence when available;
- ‏known failures/anomalies;
- ‏stopping reason;
- ‏reproduction references;
- ‏explicit limitations/confidence classification.

### ‏16.2 `NO_RECOMMENDATION`

‏Valid terminal result when evidence does not justify a candidate.

‏The artifact still records the strongest observed candidates and why confidence was insufficient.

---

## ‏17. Error contract

‏Every API failure exposes a stable public-safe code, bounded message and optional structured remediation metadata.

‏Minimum families:

```text
RESEARCH_REQUEST_INVALID
RESEARCH_RUN_NOT_FOUND
RESEARCH_OBJECTIVE_INVALID
RESEARCH_EVIDENCE_UNAVAILABLE
RESEARCH_PARTITION_ACCESS_DENIED
RESEARCH_HOLDOUT_SEALED
RESEARCH_HOLDOUT_CONTAMINATED
RESEARCH_QUERY_INVALID
RESEARCH_SQL_FORBIDDEN
RESEARCH_SQL_TIMEOUT
RESEARCH_JOB_NOT_FOUND
RESEARCH_JOB_CANCELLED
RESEARCH_JOB_FAILED
RESEARCH_RESULT_NOT_FOUND
RESEARCH_RESULT_EXPIRED
RESEARCH_BUDGET_EXCEEDED
RESEARCH_SOURCE_CHANGED
RESEARCH_INTEGRITY_ERROR
RESEARCH_INTERNAL_ERROR
```

‏Errors must never leak:

- ‏credentials;
- ‏cookies/session/auth state;
- ‏account identifiers;
- ‏arbitrary filesystem paths;
- ‏raw private browser data;
- ‏unbounded stack traces.

---

## ‏18. Research Ledger — selected storage model

‏Use a separate local research-owned DuckDB.

‏The ledger is not market authority and never becomes a copied historical warehouse.

‏Store:

- ‏research metadata;
- ‏immutable SQL artifacts;
- ‏experiment/job definitions/results summaries;
- ‏metrics;
- ‏provenance/fingerprints;
- ‏explicit research notes/decisions;
- ‏final artifacts/references.

‏Do not store whole source-market tables merely for convenience.

---

## ‏19. Ledger schema — minimum sufficient entities

‏Prefer a small relational core with bounded JSON for versionable details rather than dozens of highly normalized tables.

### ‏19.1 `research_runs`

‏Suggested facts:

```text
research_run_id PK
created_at_ms
updated_at_ms
status                 -- ACTIVE | CLOSED | CANCELLED
user_objective_text
budget_json
server_version
product_version
closed_at_ms NULL
final_artifact_id NULL
```

### ‏19.2 `objective_versions`

```text
objective_version_id PK
research_run_id FK
version_number
created_at_ms
interpretation_text
objective_json
```

‏Immutable rows.

### ‏19.3 `evidence_inventories`

```text
evidence_inventory_id PK
research_run_id FK
created_at_ms
inventory_json
inventory_hash
```

‏Contains source IDs/fingerprints/coverage summaries, not source rows.

### ‏19.4 `evidence_plans`

```text
evidence_plan_id PK
research_run_id FK
objective_version_id FK
inventory_id FK
version_number
created_at_ms
plan_json
plan_hash
```

### ‏19.5 `partitions`

```text
partition_id PK
evidence_plan_id FK
role                    -- DEVELOPMENT | VALIDATION | SEALED_HOLDOUT
partition_json
partition_hash
```

‏Contains exact source/time/schedule/purge rules.

### ‏19.6 `query_artifacts`

```text
query_artifact_id PK
research_run_id FK
parent_query_artifact_id NULL
created_at_ms
sql_text
sql_hash
scanner_contract_version
label NULL
hypothesis_text NULL
```

### ‏19.7 `experiments`

```text
experiment_id PK
research_run_id FK
objective_version_id FK
partition_id FK
role
created_at_ms
request_json
request_hash
state
result_summary_json NULL
metric_set_id NULL
```

‏Query membership may be represented by a small join table when multiple query artifacts share one experiment.

### ‏19.8 `experiment_queries`

```text
experiment_id FK
query_artifact_id FK
query_order
PRIMARY KEY (experiment_id, query_artifact_id)
```

### ‏19.9 `research_analyses`

```text
analysis_id PK
research_run_id FK
partition_id FK
created_at_ms
purpose
sql_text
sql_hash
request_json
state
result_handle NULL
summary_json NULL
```

‏These are explicitly non-authoritative strategy analyses.

### ‏19.10 `jobs`

```text
job_id PK
research_run_id FK
kind
owner_type              -- EXPERIMENT | ANALYSIS | COVERAGE | HOLDOUT | ARTIFACT | ...
owner_id
client_request_id NULL
intent_hash
state
created_at_ms
started_at_ms NULL
completed_at_ms NULL
progress_json NULL
budget_json NULL
error_code NULL
error_message NULL
result_ref_json NULL
```

### ‏19.11 `result_handles`

```text
result_handle PK
research_run_id FK
kind
created_at_ms
owner_type
owner_id
schema_json
row_count NULL
byte_count NULL
storage_ref_json
retention_json
```

‏`storage_ref_json` is internal product-owned location metadata and is never an arbitrary client path.

### ‏19.12 `metric_sets`

```text
metric_set_id PK
research_run_id FK
owner_type
owner_id
created_at_ms
metric_profile_version
summary_json
```

‏Metrics and denominators may initially remain in bounded structured JSON because objectives are intentionally runtime-configurable. Normalize only if real query/reporting needs justify it.

### ‏19.13 `research_notes`

```text
note_id PK
research_run_id FK
created_at_ms
kind                    -- HYPOTHESIS | DECISION | ANOMALY | NEXT_ACTION | LIMITATION
text
related_refs_json
```

‏Bound text length. No chain-of-thought requirement.

### ‏19.14 `validation_exposures`

```text
validation_exposure_id PK
research_run_id FK
experiment_id FK
partition_id FK
created_at_ms
exposure_json
```

‏Records what validation feedback became visible to the AI.

### ‏19.15 `finalist_sets`

```text
finalist_set_id PK
research_run_id FK
objective_version_id FK
evidence_plan_id FK
created_at_ms
finalists_json
finalists_hash
justification_text
```

### ‏19.16 `holdout_evaluations`

```text
holdout_evaluation_id PK
research_run_id FK
finalist_set_id FK
partition_id FK
job_id FK
created_at_ms
state
result_summary_json NULL
exposed_at_ms NULL
contamination_state
```

### ‏19.17 `artifacts`

```text
artifact_id PK
research_run_id FK
kind                    -- FINAL_RECOMMENDATION | REPRODUCTION | EXPORT
created_at_ms
content_hash
relative_product_path
manifest_json
```

‏Only product-owned bounded relative paths; never arbitrary caller paths.

---

## ‏20. Ledger immutability and mutation rules

‏Immutable after creation:

- ‏Objective Version content;
- ‏Evidence Inventory snapshot;
 ‏- ‏Evidence Plan/Partition definition;
- ‏Query Artifact SQL;
- ‏completed Experiment request;
- ‏material Research Analysis SQL/request;
- ‏Finalist Set;
- ‏completed Holdout Evaluation facts;
- ‏final artifact content hash.

‏Mutable operational fields may include:

- ‏job state/progress;
- ‏run `updated_at_ms`;
- ‏run budget counters;
- ‏experiment/job completion state;
- ‏result retention metadata;
- ‏current explicit next-action note.

‏Do not update immutable rows in place to make history look cleaner. Create a new version/artifact and preserve lineage.

---

## ‏21. Source fingerprint / stale evidence rule

‏Every Evidence Inventory/Plan binds immutable source fingerprints.

‏Before an authoritative experiment uses a source, the server verifies that the expected source identity/fingerprint still matches.

‏If evidence changed unexpectedly:

```text
fail closed
→ RESEARCH_SOURCE_CHANGED
→ do not silently continue with mixed evidence
```

‏A deliberate new/updated source set requires a new Evidence Inventory/Plan version or Research Run as methodology requires.

---

## ‏22. Result storage policy

‏Do not put every selected row/horizon cell permanently into normalized ledger tables by default.

‏Selected direction:

- ‏durable experiment definition + aggregate truth in ledger;
- ‏stable result/evidence handles for detailed rows;
- ‏small/important result sets may be stored as bounded structured artifacts;
- ‏larger deterministic details may be recomputable from immutable source + exact request when cheaper/safer;
- ‏final recommendation must retain enough stable references/fingerprints to reproduce the result.

‏Implementation planning must measure recomputation cost before choosing aggressive persistence.

---

## ‏23. Research budgets

‏Research Run budget is server-enforced.

‏Budget dimensions may include:

- ‏max candidate query artifacts;
- ‏max experiments;
‏- ‏max validation exposures;
- ‏max research SQL analyses;
- ‏max concurrent jobs;
- ‏max total expensive job time;
- ‏max requested T0 evaluations;
- ‏max result bytes retained;
- ‏max finalist count;
- ‏one/few holdout evaluations according to policy.

‏Exact defaults are workload/UX decisions for later implementation planning.

‏The AI can inspect remaining budget and choose how to spend it. It cannot bypass the server limits through repeated MCP connections.

---

## ‏24. MCP surface rule

‏Do not mechanically expose every internal REST/domain method as a separate noisy MCP tool if a smaller ergonomic grouping preserves capability.

‏The MCP design should optimize for model usability:

- ‏clear tool names/descriptions;
- ‏strict schemas;
- ‏small results;
- ‏IDs instead of giant embedded objects;
- ‏separate authoritative experiment vs research SQL wording;
- ‏explicit phase/partition semantics;
- ‏easy resume/status retrieval.

‏However, MCP must not hide important research powers merely to minimize tool count.

‏A likely model-facing surface will contain approximately these semantic groups:

```text
environment/schema/evidence
research-run/objective/plan
query artifacts
experiments
research analytics
evidence/debug
jobs/results
research memory
finalists/holdout/final artifact
```

‏Exact tool consolidation is deferred to implementation-ready API design.

---

## ‏25. Security/authority summary

‏The Machine API never grants:

- ‏broker/order capability;
- ‏provider/browser credentials/session data;
- ‏arbitrary filesystem path access;
- ‏market evidence writes;
- ‏normal service DB migration/repair;
- ‏live Scanner activation;
- ‏Collector configuration mutation;
- ‏shell execution;
- ‏extension installation;
- ‏raw unrestricted DuckDB connection.

‏Power comes from rich server-owned research capabilities, not unrelated machine authority.

---

## ‏26. Success evidence for this contract when implemented

‏Implementation planning should ultimately require proof that:

1. ‏A fresh client can create a run, disconnect, reconnect and resume from `researchRunId` only.
2. ‏Environment/schema/evidence introspection is machine-readable and mechanically consistent with actual supported schema/contracts.
3. ‏Candidate SQL is immutable and always evaluated through the authoritative strategy sandbox.
4. ‏General research SQL can answer unanticipated analytical questions while remaining read-only/partition-bounded/resource-bounded.
5. ‏Development detail access is rich enough for autonomous debugging.
6. ‏Validation exposure is counted and restricted according to policy.
7. ‏Sealed Holdout cannot be reached through research SQL, generic result APIs or ordinary experiments before finalization.
8. ‏Finalist locking makes Query/config/evidence immutable before holdout evaluation.
9. ‏Changing a candidate after holdout cannot preserve a false independent-holdout claim.
10. ‏Long jobs survive one tool call, expose progress, cancel safely and recover deterministically after server restart.
11. ‏Large results use bounded pages/handles rather than giant MCP payloads.
12. ‏Exact duplicate retries do not accidentally create duplicate expensive jobs; conflicting reused request IDs fail.
13. ‏Source fingerprint drift fails closed.
14. ‏Research ledger contains no source-market warehouse, credentials/session material or chain-of-thought requirement.
15. ‏Final artifact can reconstruct the exact SQL/objective/evidence/metrics/validation/holdout/search breadth used.
16. ‏Human Backtest can independently reproduce representative authoritative winning experiment points where compatible.

---

## ‏27. Decisions selected by this segment

‏Selected:

```text
Research Server domain API is source of machine semantics
MCP is a thin adapter
stable durable IDs instead of chat-local hidden state
immutable query artifacts
persistent jobs for expensive work
server-owned result handles/pagination
typed authoritative experiments + general bounded research SQL
three-role partition enforcement on every relevant operation
dedicated finalist/holdout API instead of generic holdout queries
separate local DuckDB research ledger
small relational core + bounded JSON for runtime-variable objective/metric details
source fingerprints + fail-closed drift handling
NO_RECOMMENDATION as valid terminal output
```

‏Rejected:

```text
one giant synchronous MCP research call
one unrestricted run_sql tool
MCP-owned experiment state
chat transcript as research memory
mutable SQL attached directly to experiments
holdout as merely a prompt instruction
arbitrary paths in data APIs
permanent copy of all market evidence into research ledger
huge unpaginated model payloads
premature semantic SQL equivalence engine
```

---

## ‏28. Remaining design questions after this segment

‏This contract intentionally leaves the following for later coherent planning segments:

1. ‏exact resource-limit defaults from target-machine workload evidence;
2. ‏exact MCP tool grouping/naming once current Desktop integration is exercised;
3. ‏exact research SQL relation/view catalog and admission implementation;
4. ‏generic returned/non-return diagnostic depth achievable without unsafe SQL rewriting;
5. ‏metric profile/version schema details;
6. ‏result-handle storage/recompute trade-off after workload measurement;
7. ‏exact authentication/ownership mechanism for any local network transport;
8. ‏exact final operator workflow/launcher and ChatGPT setup;
9. ‏promotion of the selected discovery into Branch 11 S&T, durable product/technical/security/test contracts and execution leaves.

‏No implementation task is authorized by this document alone.
