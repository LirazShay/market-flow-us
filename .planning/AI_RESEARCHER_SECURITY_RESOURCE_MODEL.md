# ‏Autonomous AI Researcher — Security / Resource / Failure / Workload Model

‏Status: selected security and workload direction for discovery; not implementation-authorized

‏Scope: `B-US-008`

‏This document defines the safety and resource-governance model for the autonomous local AI researcher. It refines the previously selected hybrid Research Server architecture, two-sandbox rule, durable Research Ledger and phase-aware evidence model.

‏The goal is not merely to make unsafe operations unlikely. The goal is to make the most important invariants enforceable by process/data boundaries and then prove them under representative workload and hostile-input tests.

---

## ‏1. Outcome

‏The autonomous researcher may run many AI-authored analytical queries and long batch experiments against valuable historical evidence. Therefore the Research Server must assume that:

```text
AI-authored SQL / tool input
= untrusted local analytical input
```

‏even though the operator is local and trusted.

‏The selected model is defense in depth:

```text
loopback/local process boundary
→ strict machine API schemas
→ source allowlist + source fingerprints
→ phase/evidence authorization
→ isolated server-owned DuckDB sandbox
→ no source attachment while AI SQL executes
→ DuckDB hardening + locked configuration
→ read-only statement/function/catalog admission
→ resource budgets + bounded outputs
→ cancellation + restart-safe jobs
→ durable transactional ledger state
→ workload/security proof
```

‏No single SQL parser rule, prompt instruction or MCP permission is treated as the only security boundary.

---

## ‏2. Assets that require protection

### ‏2.1 Immutable market evidence

‏Original active/archive Market Flow US DuckDB files are authoritative evidence and must never be mutated by AI research.

‏Required property:

```text
AI research may read authorized evidence
but can never write/repair/migrate/replace it
```

### ‏2.2 Sealed evidence

‏Validation and especially Sealed Holdout evidence have methodological confidentiality requirements in addition to ordinary file safety.

‏The AI must not obtain sealed rows/outcomes through:

- ‏general research SQL;
- ‏metadata side channels;
- ‏result handles from another phase;
- ‏cross-run object-ID guessing;
- ‏debug/provenance helpers;
- ‏cache reuse;
- ‏error messages.

### ‏2.3 Research Ledger truth

‏The Research Ledger is not market authority, but it is the durable truth for:

- ‏Research Run state;
- ‏objective versions;
- ‏query artifacts;
- ‏evidence-plan/fingerprint bindings;
- ‏jobs and experiment status;
- ‏validation exposures;
- ‏finalists/holdout state;
- ‏final recommendation artifacts.

‏Partial/corrupt ledger writes must not make unfinished work look successful.

### ‏2.4 Local machine resources

‏The autonomous researcher must not monopolize the target machine through accidental or adversarial:

- ‏unbounded joins/cross products;
- ‏runaway recursion or expression work;
- ‏huge sorts/windows;
- ‏massive materializations;
- ‏unbounded result serialization;
- ‏too many concurrent readers/jobs;
- ‏unbounded temporary disk use;
- ‏rapid duplicate submissions.

### ‏2.5 Public-safe diagnostics

‏Logs/errors/artifacts must not leak:

- ‏filesystem paths beyond intentionally sanitized logical references;
- ‏credentials/tokens/cookies;
- ‏provider/browser session material;
- ‏account identifiers;
- ‏private raw browser dumps;
- ‏unbounded stack traces.

---

## ‏3. Threat model

### ‏3.1 Trusted components

‏The following are product-controlled trusted code after normal review/tests:

- ‏Research Domain API implementation;
- ‏Research Server process;
- ‏source catalog/allowlist resolver;
- ‏proven Backtest authority seams;
- ‏Research Ledger schema/access layer;
- ‏MCP adapter code;
- ‏plugin/Skill package shipped by this project.

### ‏3.2 Inputs treated as untrusted

‏Treat as untrusted/bounded even when originating from desktop ChatGPT:

- ‏SQL text;
- ‏natural-language notes/objectives;
- ‏IDs supplied by the client;
- ‏pagination cursors;
- ‏job submission parameters;
- ‏requested field names;
- ‏requested source/partition references;
- ‏client-generated idempotency IDs.

### ‏3.3 Market/provider strings are data, never instructions

‏Provider values such as names, exchange text, `TradeDateTime`, `raw_data` strings and future unknown raw fields may contain arbitrary text.

‏The AI integration must treat retrieved evidence as **data**, not as instructions capable of overriding the Skill/Research Server contract.

‏Consequences:

- ‏tool descriptions/instructions never come from market data;
- ‏server must not dynamically synthesize MCP tool schemas/descriptions from raw provider strings;
- ‏raw strings are returned as bounded data fields;
- ‏generated recommendation artifacts clearly separate quoted/raw evidence from normative instructions;
- ‏HTML/script execution is never enabled for raw values.

### ‏3.4 Out of threat-model scope

‏The project does not claim to defend against an administrator/root-level attacker that can arbitrarily replace program binaries or database files on disk.

‏It **does** detect unexpected evidence replacement/change through source fingerprints where research validity depends on stable source identity.

---

## ‏4. Network/process exposure

### ‏4.1 Local-only default

‏The Research Server is local-only.

‏Preferred ordering:

1. ‏direct local process/IPC transport when the selected MCP integration supports it cleanly;
2. ‏otherwise a loopback-only HTTP transport;
3. ‏remote/tunnel exposure only when the actual supported ChatGPT client requires it and through the approved MCP mechanism.

‏Research semantics must not depend on which transport is selected.

### ‏4.2 Loopback HTTP requirements

‏If HTTP is used, inherit and strengthen proven Backtest runtime practices:

- ‏bind only loopback (`127.0.0.1` or an explicitly reviewed equivalent);
- ‏strict `Content-Type` for structured requests;
- ‏bounded request bodies;
- ‏exact/strict request schemas;
- ‏no permissive CORS;
- ‏no cross-origin browser API surface by default;
- ‏bounded public-safe errors;
- ‏security headers for any optional browser diagnostics surface;
- ‏no arbitrary static-file serving from disk.

‏The current Backtest runtime already demonstrates loopback binding, bounded request bytes, exact shape validation and bounded public errors; reuse that design style rather than creating a looser AI-specific server.

### ‏4.3 Remote/tunnel mode

‏If final ChatGPT integration requires a tunnel/remote MCP path, that mode receives its own acceptance proof.

‏Do not silently widen the Research Server to `0.0.0.0` as a shortcut.

---

## ‏5. Source evidence boundary

### ‏5.1 Source selection is logical, never path-based

‏Client input contains only logical `sourceId` / partition references selected from the server-owned catalog.

‏No API accepts:

```text
arbitrary filesystem path
file:// URL
DuckDB ATTACH path
external HTTP URL
S3/GCS/Azure URI
extension repository
```

### ‏5.2 Proven read-only opener reuse

‏Reuse the existing Backtest evidence opener properties:

- ‏regular-file check;
- ‏allowlisted path resolution owned by product code;
- ‏DuckDB `READ_ONLY` access;
- ‏schema validation;
- ‏refusal of source still owned by a running collection session;
- ‏DuckDB hardening;
- ‏configuration lock.

### ‏5.3 Fingerprint binding

‏Every Evidence Inventory/Plan binds logical source identity to an immutable source fingerprint.

‏Before material work and before claiming/reusing durable results, the server verifies the expected fingerprint according to the chosen cost-aware policy.

‏If evidence changed unexpectedly:

```text
fail closed
→ RESEARCH_SOURCE_CHANGED
→ invalidate/rebuild transient projection/cache
→ do not silently reuse prior metrics as comparable proof
```

### ‏5.4 Immutability proof

‏Security acceptance must verify original evidence bytes are unchanged by representative Research Server workloads.

‏Reuse the existing Backtest workload proof style:

```text
source SHA-256 before
→ run representative research workload
→ close server
→ source SHA-256 after
→ exact equality required
```

‏Additionally verify no migration/repair/new tables are written to evidence sources.

---

## ‏6. Research sandbox isolation

### ‏6.1 Strong preferred boundary

‏For bounded analyses:

```text
open allowlisted source READ_ONLY
→ project only authorized rows/columns
→ detach/close original source
→ lock sandbox configuration
→ execute AI SQL
```

‏The strongest property is that original source files are **not reachable** when AI-authored SQL executes.

### ‏6.2 Transient cache mode

‏If workload evidence later justifies a partition cache, the AI still never receives its path.

‏Cache rules:

- ‏server-owned directory only;
- ‏keyed by evidence fingerprints + partition + data-surface version;
- ‏read-only during AI SQL execution;
- ‏rebuildable/disposable;
- ‏not market authority;
- ‏not reused across incompatible phase/access policies;
- ‏not allowed to contain sealed holdout data when serving Development/Validation analysis;
- ‏bounded by disk quota/retention policy.

### ‏6.3 Holdout isolation is construction-time, not WHERE-clause trust

‏Sealed Holdout must be absent from the sandbox/catalog used for Development and ordinary Validation.

‏Do **not** implement holdout protection as merely:

```sql
WHERE partition_role <> 'HOLDOUT'
```

‏inside the same reachable database.

‏Unauthorized evidence should not exist in the AI-queryable sandbox at all.

---

## ‏7. DuckDB hardening

‏Reuse the existing hardened configuration baseline:

```text
enable_external_access = false
allow_community_extensions = false
autoinstall_known_extensions = false
autoload_known_extensions = false
allow_persistent_secrets = false
allow_unsigned_extensions = false
allow_unredacted_secrets = false
allowed_configs = []
lock_configuration = true
```

‏Research implementation must verify the effective configuration after sandbox construction before accepting AI SQL.

‏If a future DuckDB upgrade changes relevant defaults/functions, the security regression suite must detect contract drift.

---

## ‏8. Research SQL admission

### ‏8.1 Statement class

‏Default contract:

- ‏exactly one statement;
- ‏statement must be analytical `SELECT` / allowed query statement class;
- ‏no client-controlled prepared parameters unless later explicitly contracted;
- ‏no DDL/DML;
- ‏no transaction statements;
- ‏no configuration statements;
- ‏no `ATTACH`/`DETACH`;
- ‏no `COPY`/export/import;
- ‏no secret/extension management.

### ‏8.2 Function/table-function admission

‏Do not rely solely on statement type.

‏Reject:

- ‏DuckDB functions reported as side-effecting;
- ‏dynamic SQL helpers such as `query` / `query_table`;
- ‏file/network readers and writers;
- ‏extension install/load helpers;
- ‏secret/config mutation helpers;
- ‏functions that can access arbitrary host environment/filesystem/network;
- ‏newly introduced equivalent functions discovered by security regression after dependency upgrades.

### ‏8.3 Positive catalog boundary

‏Even a valid `SELECT` can reference only relations/views physically present in the isolated sandbox.

‏Unknown catalog/schema/table references fail.

‏Do not expose source aliases, filesystem paths or hidden attached databases.

### ‏8.4 Defense-in-depth principle

‏Correctness does not depend on the SQL token scanner perfectly recognizing every future DuckDB feature.

‏Even if admission misses a construct, the sandbox should still have:

- ‏no original source attachment;
- ‏external access disabled;
- ‏extensions disabled;
- ‏locked configuration;
- ‏bounded process resources;
- ‏no sealed evidence present;
- ‏no writable product database attached.

---

## ‏9. SQL security regression corpus

‏Before implementation completion, create a deterministic adversarial corpus covering at least:

- ‏multiple statements;
- ‏DDL/DML;
- ‏`ATTACH` / `DETACH`;
- ‏`COPY` to/from files;
- ‏CSV/JSON/Parquet/file readers;
- ‏HTTP/network access attempts;
- ‏extension install/load/autoload attempts;
- ‏secret creation/read attempts;
- ‏configuration mutation;
- ‏`query` / `query_table` and equivalent dynamic execution;
- ‏side-effecting functions discovered from `duckdb_functions()`;
- ‏path traversal attempts inside strings;
- ‏quoted/comment-obfuscated forbidden calls;
- ‏dollar-quoted strings/comments;
- ‏system/catalog introspection needed for safe SQL vs path-bearing metadata that must remain inaccessible;
- ‏huge-result generation;
- ‏expensive Cartesian joins;
- ‏holdout/object-ID access attempts;
- ‏cross-run result-handle/cursor misuse.

‏Each case must prove either safe rejection or safe bounded execution without external/source/holdout access.

---

## ‏10. API authorization / object ownership

‏Every durable object is scoped to its owning `researchRunId` and, where relevant, Evidence Plan/partition/object lineage.

‏Server verifies ownership on every lookup/use.

‏Do not treat opaque IDs as authorization by obscurity.

‏Examples that must reject:

```text
use resultHandle from another Research Run
use partitionId from another Evidence Plan
page a result with cursor from another handle
attach experiment from another run without explicit supported import/comparison contract
submit holdout with finalistSetId from incompatible objective/evidence plan
```

---

## ‏11. Resource-governance hierarchy

‏Resource control uses nested scopes:

```text
per request
per SQL analysis
per job
per Research Run
server global
```

‏A lower-level operation cannot bypass its parent budget.

### ‏11.1 Resource dimensions

‏Track/bound where technically measurable:

- ‏wall-clock execution time;
- ‏queued wall time separately from execution time;
- ‏concurrent active jobs;
- ‏concurrent DuckDB analytical connections;
- ‏number of T0 evaluations;
- ‏number of candidate queries per batch;
- ‏result rows;
- ‏serialized result bytes;
- ‏temporary/cache disk bytes;
- ‏ledger/result-retention bytes;
- ‏DuckDB memory/temp use where supported and reliable;
- ‏total run experiment/analysis count;
- ‏duplicate expensive submissions.

### ‏11.2 Do not guess production limits during discovery

‏This discovery document deliberately does **not** freeze arbitrary large numeric limits.

‏Implementation planning must define conservative initial configurable limits, then target-machine workload evidence validates/tunes them.

‏The contract requirement is:

```text
bounded + observable + cancellable + configurable
```

‏not a guessed number presented as scientific truth.

### ‏11.3 Budget exhaustion

‏When a run/job budget is exhausted:

- ‏stop scheduling new expensive units;
- ‏cancel/finish current unit according to the contracted safety policy;
- ‏persist completed valid results;
- ‏never mark missing units as evaluated;
- ‏return `RESEARCH_BUDGET_EXCEEDED` with consumed/remaining dimensions;
- ‏allow the AI to finalize the best evidence found so far or request an explicit new budget policy.

---

## ‏12. Concurrency model

### ‏12.1 KISS default

‏Start from deliberately conservative concurrency rather than maximizing throughput.

‏The Research Server should have:

- ‏a small bounded heavy-job queue;
- ‏bounded active analytical readers;
- ‏serialized/transaction-safe Research Ledger mutations;
- ‏fairness so one huge batch cannot permanently starve interactive inspection/cancellation/status calls.

### ‏12.2 No correctness dependence on concurrency

‏Experiment/result semantics must be identical whether tasks execute serially or concurrently.

‏IDs, ordering and metrics must be deterministic from explicit inputs/evidence, not race timing.

### ‏12.3 Increase only from evidence

‏Raise parallelism only when target-machine workload shows material benefit without unacceptable memory, disk, responsiveness or DuckDB contention.

---

## ‏13. Result/payload governance

### ‏13.1 Never serialize unbounded query output into MCP response

‏Every direct response has:

- ‏row-count limit;
- ‏serialized-byte limit;
- ‏column/shape sanity limit;
- ‏bounded text/JSON cell handling where needed.

‏Large results become persisted/managed `resultHandle`s.

### ‏13.2 Stable paging

‏Paging occurs over a frozen result snapshot/ordered result handle.

‏A page request cannot cause the expensive analysis to rerun or accept new SQL.

### ‏13.3 Raw JSON

‏`raw_data` access remains available for discovery but is bounded.

‏Prefer typed helpers for:

- ‏raw-key inventory;
- ‏coverage counts;
- ‏type distributions;
- ‏small representative samples.

‏Do not encourage dumping all raw JSON across millions of rows into model context.

---

## ‏14. Job lifecycle and transactional completion

‏External job states remain deliberately small:

```text
QUEUED
RUNNING
SUCCEEDED
FAILED
CANCELLED
```

### ‏14.1 Success commit rule

‏A job becomes `SUCCEEDED` only after all correctness-critical result/metric/provenance artifacts are durably committed.

‏Preferred pattern:

```text
compute into temporary/incomplete result state
→ validate completeness/integrity
→ commit durable result + metric refs + job success atomically/transactionally where practical
```

‏Never persist `SUCCEEDED` first and write the result afterward.

### ‏14.2 Failure

‏A failed unit may keep diagnostic/public-safe metadata and already completed independent child results where the contract says they remain valid, but the parent batch is not represented as fully successful.

### ‏14.3 Cancellation

‏Cancellation is idempotent.

‏After cancellation request:

- ‏stop scheduling future units immediately;
- ‏propagate interruption to active DuckDB/query work where supported;
- ‏discard/mark incomplete partial result appropriately;
- ‏persist final `CANCELLED` state;
- ‏never convert partial work into complete metrics.

---

## ‏15. Cancellation acceptance

‏Implementation must prove cancellation for at least:

- ‏long general `research_sql`;
- ‏multi-point/multi-query experiment batch;
- ‏coverage/profile job;
- ‏holdout job before completion where cancellation is contractually allowed;
- ‏queued-not-started job.

‏Measure:

- ‏request-to-stop latency;
- ‏whether CPU/database work actually ceased;
- ‏state after restart;
- ‏temporary file/cache cleanup;
- ‏absence of false `SUCCEEDED` state.

‏Exact acceptance threshold is selected from implementation/target-machine evidence rather than guessed here, but must be finite and documented.

---

## ‏16. Crash/restart recovery

### ‏16.1 Startup reconciliation

‏On server startup, inspect durable jobs/results and reconcile any work left `RUNNING` by process termination.

‏A stale `RUNNING` row can never be assumed successful.

‏It becomes an interrupted/recovery case and is deterministically:

- ‏marked failed/interrupted and retryable; or
- ‏resumed only if that job kind has an explicit proven checkpoint/resume contract.

### ‏16.2 KISS restart policy

‏Do not build universal fine-grained checkpointing for every SQL query.

‏Default:

```text
atomic durable completed units survive
in-flight unit is retried/restarted
```

‏Add finer resume only where workload evidence shows a large, repeatable cost worth the complexity.

### ‏16.3 Ledger integrity after crash

‏Crash-injection tests must prove:

- ‏no half-created authoritative query artifact;
- ‏no successful job without result;
- ‏no holdout exposure recorded incompletely;
- ‏idempotent retry via `clientRequestId`;
- ‏completed immutable experiment artifacts remain readable;
- ‏source evidence remains untouched.

---

## ‏17. Research Ledger safety

### ‏17.1 Separate writable database

‏Only the research-owned ledger/cache area is writable by Research Server research persistence.

‏Original evidence DBs are never opened through writable/migration code paths.

### ‏17.2 Transactional invariants

‏Use transactions for multi-row state changes whose partial application would alter research meaning, including:

- ‏creating a Research Run + initial intent/version snapshot;
- ‏creating immutable query artifact/hash metadata;
 ‏- ‏finalizing experiment metrics/results;
- ‏recording Validation exposure;
- ‏creating Finalist Set;
- ‏recording Holdout evaluation/exposure;
- ‏freezing final recommendation/artifact.

### ‏17.3 No private reasoning

‏Ledger stores explicit hypotheses/decisions, not model chain-of-thought.

---

## ‏18. Idempotency / duplicate-work control

‏Expensive creation/submission operations accept bounded `clientRequestId`.

‏Rules:

- ‏same ID + same normalized request → same durable object/job reference;
- ‏same ID + different normalized request → reject conflict;
- ‏server stores enough request fingerprint to prove the match;
- ‏idempotency retention is bounded/documented;
- ‏exact duplicate query/experiment hashes may be surfaced as reuse opportunities without silently merging semantically different work.

‏This prevents model/network retries from multiplying expensive jobs.

---

## ‏19. Failure taxonomy

‏Failures should distinguish at least:

### ‏19.1 Caller/input

```text
RESEARCH_REQUEST_INVALID
RESEARCH_QUERY_INVALID
RESEARCH_SQL_FORBIDDEN
RESEARCH_PARTITION_ACCESS_DENIED
RESEARCH_HOLDOUT_SEALED
```

### ‏19.2 Resource/control

```text
RESEARCH_SQL_TIMEOUT
RESEARCH_BUDGET_EXCEEDED
RESEARCH_JOB_CANCELLED
RESEARCH_RESULT_EXPIRED
```

### ‏19.3 Evidence/integrity

```text
RESEARCH_EVIDENCE_UNAVAILABLE
RESEARCH_SOURCE_CHANGED
RESEARCH_INTEGRITY_ERROR
RESEARCH_HOLDOUT_CONTAMINATED
```

### ‏19.4 Internal/transient

```text
RESEARCH_JOB_FAILED
RESEARCH_INTERNAL_ERROR
```

‏Retryability must be explicit where useful; the AI should not blindly retry deterministic invalid SQL/security failures.

---

## ‏20. Public-safe logging/diagnostics

‏Log by stable logical IDs:

```text
researchRunId
jobId
experimentId
analysisId
sourceId
partitionId
queryArtifact hash/id
error code
bounded timing/resource metrics
```

‏Avoid logging:

- ‏full arbitrary SQL by default when a hash/reference suffices for operational logs;
- ‏raw provider JSON payloads;
 ‏- ‏filesystem paths;
- ‏tokens/secrets/session data;
- ‏unbounded result rows.

‏The Research Ledger may intentionally retain exact candidate/research SQL because it is required research evidence; operational logs need not duplicate it.

---

## ‏21. Workload evidence philosophy

‏Do not optimize from intuition.

‏The repo already has a useful workload framework with `ci`, `target-e2e`, `target-day` and `custom` profiles plus a Backtest probe that measures representative 4,096-security workloads and verifies source SHA-256 immutability.

‏The AI Researcher should extend this existing workload framework rather than introduce an unrelated benchmark harness.

‏New workload evidence is required because autonomous research differs materially from human Inspect/Sweep:

- ‏multi-day partitions;
- ‏general analytical SQL;
- ‏many immutable candidate artifacts/experiments;
- ‏ledger writes;
- ‏large result handles/paging;
- ‏cancellation/restart;
- ‏raw-field profiling;
- ‏sealed partition policy.

---

## ‏22. Required workload scenarios

### ‏22.1 Bootstrap / inventory

‏Measure:

- ‏Research Server startup;
- ‏ledger open/migration/bootstrap;
- ‏`describe_research_environment`;
- ‏source catalog/inventory construction;
- ‏resume capsule for a non-trivial run.

### ‏22.2 Single-day research sandbox

‏Representative full-universe source:

- ‏sandbox/projection build time;
- ‏cold vs reused projection if caching exists;
 ‏- ‏memory/temp-disk footprint;
- ‏simple aggregate;
- ‏window/ranking query;
- ‏per-security historical-window query;
- ‏raw-field coverage query;
- ‏bounded result materialization/page retrieval.

### ‏22.3 Multi-day Development partition

‏Use several immutable day sources and measure:

- ‏partition construction;
- ‏cross-day union/projection cost;
- ‏cross-security aggregate/window SQL;
- ‏per-day breakdown;
- ‏result-handle creation;
- ‏source fingerprint verification overhead.

### ‏22.4 Authoritative batch experiments

‏Measure realistic combinations of:

```text
multiple query artifacts
× many deterministic T0 points
× one/multiple days
× Top-N candidates
× configured horizon set
```

‏Record:

- ‏total wall time;
- ‏distinct baseline reuse;
- ‏query execution count;
- ‏outcome evaluation count;
- ‏ledger/result bytes;
- ‏peak observed memory/temp use where measurable;
- ‏cancellation responsiveness.

### ‏22.5 Validation / Holdout

‏Prove:

- ‏same frozen schedule across finalists;
- ‏sealed holdout not queryable before authorized final evaluation;
- ‏holdout job creates only permitted initial metrics;
- ‏post-final audit access follows contract;
- ‏unauthorized research SQL receives no side-channel detail.

### ‏22.6 Result paging

‏Create a result larger than one MCP page and verify:

- ‏bounded first response;
- ‏stable order;
- ‏all rows recoverable through pages;
- ‏byte/page limits;
- ‏cursor isolation;
- ‏no recomputation on paging.

### ‏22.7 Cancellation

‏Use intentionally expensive but safe synthetic queries/jobs and measure stop behavior.

### ‏22.8 Restart/crash

‏Terminate Research Server during:

- ‏queued job;
- ‏active analysis;
 ‏- ‏batch experiment after some durable units;
- ‏result finalization boundary;
- ‏validation exposure recording.

‏Restart and prove deterministic recovery.

### ‏22.9 Concurrency/fairness

‏Run a bounded heavy job while issuing:

- ‏status calls;
- ‏cancel call;
 ‏- ‏small schema/environment reads;
- ‏another bounded analysis.

‏Interactive control calls must remain usable.

### ‏22.10 Source immutability

‏Hash original source DBs before/after all representative workload classes and require equality.

### ‏22.11 Adversarial SQL/security

‏Run the SQL security corpus under the same real sandbox implementation and prove no external/source/holdout access.

---

## ‏23. Synthetic vs target-machine evidence

### ‏23.1 CI synthetic profile

‏Keep a reduced deterministic dataset for fast CI regression.

‏CI validates correctness/security shape, not final target-machine throughput.

### ‏23.2 Target synthetic profile

‏Reuse the existing representative universe scale (`4096` securities) and extend duration/day count as needed to represent AI research shapes without committing private real market data.

### ‏23.3 Target-machine real-evidence acceptance

‏Before final closure, run sanctioned workload/acceptance against the user's actual local evidence catalog without committing raw DBs or private/auth data.

‏Report only public-safe aggregates/timings/fingerprints where appropriate.

‏Real-evidence acceptance must confirm the chosen limits are practical for the actual day count/cadence/DB sizes available on the target machine.

---

## ‏24. Performance acceptance philosophy

‏Do not define success as “fastest possible”.

‏Success is:

```text
bounded autonomous research
+ responsive cancellation/status
+ no source mutation
+ no sealed-evidence leak
+ repeatable results
+ practical completion on target machine
```

‏The implementation plan must convert measured baseline results into explicit acceptance thresholds for the final version.

‏Any threshold chosen must include rationale tied to:

- ‏expected Research Run usage;
- ‏target hardware;
 ‏- ‏source size/cadence;
- ‏operator tolerance for autonomous background computation;
- ‏memory/disk safety margin.

---

## ‏25. Cache/index/precompute decision gate

‏Do not add new indexes, copied warehouse tables, feature stores or caches merely because autonomous research sounds heavy.

‏Required decision flow:

```text
implement simplest correct projection/execution
→ run representative workload
→ identify dominant bottleneck
→ prove bottleneck materially blocks useful autonomous research
→ choose smallest targeted optimization
→ add correctness/security regression
→ rerun affected workload
```

‏Examples of later justified optimizations may include:

- ‏partition projection cache;
- ‏result/metric reuse;
- ‏specific research-only index;
- ‏precomputed cadence/coverage summary;
- ‏deduplicated baseline execution;
- ‏bounded derived feature cache.

‏None is preapproved by this document.

---

## ‏26. Capability-gap evidence

‏Performance/security constraints may reveal a product limitation rather than a Research Server bug.

‏Examples:

- ‏10-second evidence too sparse for a requested 3-second objective;
- ‏raw-field discovery shows a useful field is inconsistent/missing;
- ‏cross-day analysis repeatedly requires a safe derived structure;
- ‏target machine cannot support current batch shape within reasonable bounds.

‏The AI/run may record a capability-gap finding, but resolving it follows normal Market Flow US planning/change/test/verification governance.

---

## ‏27. Security/resource implementation gates

‏Implementation is not complete until there is evidence for all of the following.

### ‏Gate S1 — source safety

- ‏read-only open path reused/proven;
- ‏source allowlist/path isolation;
 ‏- ‏before/after source hash equality;
- ‏no migration/repair/write path reachable.

### ‏Gate S2 — sandbox escape resistance

- ‏external access/extensions/secrets/config locked;
- ‏source detached/unreachable;
- ‏forbidden SQL corpus green;
- ‏no arbitrary file/network access;
- ‏only permitted research relations visible.

### ‏Gate S3 — phase isolation

- ‏Development cannot access Validation/Holdout beyond policy;
- ‏Validation exposure is explicit/ledgered;
- ‏Sealed Holdout cannot be queried through SQL/debug/results/cache;
- ‏post-final audit transition proven.

### ‏Gate S4 — bounded resources

- ‏request/query/job/run/global bounds exist;
- ‏result byte/row paging limits proven;
 ‏- ‏heavy jobs cannot make cancellation/status unusable;
- ‏disk/temp/cache cleanup bounded.

### ‏Gate S5 — cancellation/restart integrity

- ‏active and queued cancellation proven;
- ‏crash recovery proven;
- ‏no false success/partial metric corruption;
- ‏idempotent retry proven.

### ‏Gate S6 — public-safe observability

- ‏stable error codes;
- ‏bounded messages;
- ‏no paths/auth/private dumps;
- ‏sufficient resource/provenance diagnostics to RCA failures.

### ‏Gate W1 — CI workload

- ‏deterministic reduced research workload green.

### ‏Gate W2 — representative target workload

- ‏4096-security synthetic profiles green with recorded public-safe metrics.

### ‏Gate W3 — target-machine real evidence

- ‏actual local evidence workload completes within selected accepted bounds;
- ‏resource behavior/cancellation practical;
- ‏source remains immutable.

### ‏Gate W4 — end-to-end MCP acceptance

- ‏Desktop ChatGPT/plugin/MCP → Research Server → representative research job/result/resume/cancel/final artifact works under the same resource/security policy.

---

## ‏28. Blocking-defect rule

‏Any security/workload failure discovered during implementation remains blocking for the node/chat that discovers it.

‏Required flow:

```text
symptom
→ root cause
→ determine why current contract/test failed to prevent it
→ fix root cause
→ add regression
→ search analogous surfaces
→ rerun affected security/workload gates
→ only then continue
```

‏Do not locally loosen a limit or skip a failing adversarial/workload case merely to make CI green.

---

## ‏29. Explicitly rejected shortcuts

‏Do not implement security/resource governance as:

```text
"it is localhost, therefore input is trusted"
"DuckDB is read-only, therefore every SELECT is safe"
keyword blacklist as the only SQL defense
holdout hidden only by prompt instructions
holdout present in same SQL sandbox with a WHERE filter
arbitrary source paths accepted from MCP
unbounded run_sql response returned directly to ChatGPT
one global timeout with no job/run budget model
unbounded parallel DuckDB readers for speed
mark RUNNING jobs successful after restart
persist partial batch metrics as complete
add caches/indexes before measuring a bottleneck
bind server to 0.0.0.0 to make MCP easier
log raw credentials/browser/provider session data
```

---

## ‏30. Discovery decision summary

‏The selected direction is:

```text
local/loopback Research Server
+ strict typed API boundary
+ logical source IDs only
+ proven READ_ONLY evidence opener
+ isolated detached research sandbox
+ hardened locked DuckDB
+ SELECT/function/catalog admission
+ physically absent sealed evidence
+ nested configurable resource budgets
+ persistent cancellable jobs
+ transactional durable completion
+ restart reconciliation
+ bounded result handles/pagination
+ source hash/fingerprint proofs
+ adversarial SQL regression corpus
+ extension of existing workload framework
+ CI synthetic + 4096-security target + real target-machine acceptance
```

‏This keeps autonomous research powerful while ensuring AI freedom cannot silently become filesystem/database authority or unbounded machine workload.

---

## ‏31. What remains after this segment

‏The major discovery areas now have selected directions for:

- ‏product/domain outcome;
- ‏architecture and MCP/Research Server split;
- ‏experiment/validation/holdout methodology;
- ‏machine API + Research Ledger;
- ‏research data surface;
- ‏AI operating/bootstrap contract;
- ‏security/resource/failure/workload governance.

‏Before implementation allocation, the next qualitatively different planning work should consolidate these discovery decisions into the authoritative S&T / contract / execution structure, identify any unresolved decision gaps, and define implementation nodes with success evidence.
