# Autonomous AI Researcher Hardening Audit — TREE 11.7

Status: IN PROGRESS

This record is public-safe. It must not contain credentials, cookies, auth/session data, account identifiers, private browser data, raw authenticated dumps, private model reasoning, or unsanitized target-machine paths.

Baseline entering hardening: `c74dc3e0c751eb112ca0b35cc6bc710ae2fef332`
Execution branch: `chat41-11.7-adversarial-audit`
Authoritative definition of done: `.planning/PLAN.md` leaf `11.7`
Supporting security model: `.planning/AI_RESEARCHER_SECURITY_RESOURCE_MODEL.md`

## Audit ownership

TREE `11.7` is an adversarial security/failure audit over the composed Branch-11 Research system. Existing green tests are inputs, not closure. Any material defect discovered here remains owned by Chat 41 through:

```text
root cause
→ smallest sufficient fix
→ deterministic regression proof
→ analogous-area review
→ affected verification green
```

No blocker is deferred to `11.8` merely because representative/target-machine acceptance is the next task.

## Baseline architecture invariants

The audit starts from these already-selected boundaries and attempts to break them rather than redesign them:

1. Original market evidence is immutable and selected by server-owned logical identity, not caller paths.
2. AI-authored SQL executes only after authorized evidence is projected into an isolated server-owned DuckDB sandbox and original sources are detached.
3. General research SQL is Development-only; Validation and Sealed Holdout use typed server authority rather than ordinary research SQL.
4. Durable objects are scoped by Research Run and lineage; opaque IDs are not authorization.
5. Durable success is published only after correctness-critical result/provenance state is committed.
6. Long work is bounded, cancellable and restart-safe; stale `RUNNING` work cannot become false success.
7. Result handles/pages/cursors are bounded and ownership-checked; paging does not rerun arbitrary SQL.
8. MCP is a thin adapter over Research Domain authority and must not widen transport, phase, data or persistence authority.
9. Diagnostics remain bounded and public-safe.
10. Source fingerprints/bytes must remain unchanged across hostile sequences.

## Adversarial matrix

| Area | Required hostile question | Existing baseline proof to re-use | TREE 11.7 work still required | Status |
|---|---|---|---|---|
| Source selection / attachment | Can caller-controlled IDs, paths, aliases, attachment syntax or projection failure reach/mutate original evidence? | Logical `sourceId`, Backtest read-only opener, source fingerprint verification before/after projection, in-memory sandbox, source detach before AI SQL. | Attack malformed/cross-run source lineage, projection failures, attachment/catalog escapes and verify exact source bytes/fingerprints. | OPEN |
| SQL statement admission | Can multi-statement, DDL/DML, `ATTACH`, `COPY`, config, extension or secret operations pass as analytical SQL? | Shared Scanner authority enforces exactly one prepared `SELECT`; Research admission adds explicit dangerous function deny rules. Existing adversarial service corpus covers direct forms. | Expand obfuscation/equivalent catalog/function cases and prove fail-closed after dependency/runtime composition. | OPEN |
| SQL host access | Can file/network readers, dynamic SQL, environment/config/secret/catalog helpers or side-effecting functions access the host? | External access/extensions/secrets disabled, configuration locked, `query/query_table` denied, side-effecting functions discovered from `duckdb_functions()`. | Attack qualified/quoted/comment/dollar-quoted forms, path-bearing catalog surfaces and equivalent readers/helpers; prove sandbox remains usable afterward. | OPEN |
| Phase isolation | Can Development SQL or lower-phase APIs expose Validation/Holdout rows, outcomes, metadata or lineage? | Development-only SQL session and physically constructed Development projection; typed Validation/Holdout authority. Cross-phase SQL/diagnostic/Holdout capability checks are green, and MCP cannot inject a phase override. | Complete error/provenance/schema/result side-channel and fault/restart attacks across phase transitions. | REVIEWED |
| Run/object ownership | Can IDs from another Research Run or Evidence Plan be replayed against reads/mutations? | Objective/query/evidence/partition/result/finalist/Holdout boundaries are run-scoped and fail closed; MCP preserves supplied IDs rather than rewriting them. | Complete composed job/experiment/recommendation substitution and restart-state attacks; no cross-run escape found in this slice. | REVIEWED |
| Result handles / cursors | Can a handle/cursor be used cross-run, cross-result or after incompatible restart/phase state? | `getResult` scopes by `research_run_id + result_handle`; creation requires the source Job in the same Research Run; cursor encodes and validates its Result Handle; row paging occurs only after the scoped Result Handle is resolved. Existing restart paging test is green baseline. | Complete phase/result substitution and incompatible-state attacks; current static ownership pass found no cross-run Result Handle escape. | REVIEWED |
| Jobs / idempotency | Can duplicate/conflicting requests create duplicate work or inconsistent durable authority? | Durable jobs, normalized request fingerprints, `clientRequestId`, bounded queue/readers. | Continue duplicate/conflict races across expensive SQL/experiment/validation operations and restart boundaries. Holdout duplicate execution finding `H-11.7-001` is fixed and green. | REVIEWED |
| Cancellation / timeout | Can cancelled/timed-out work later publish success/results or keep consuming authority/resources? | Native DuckDB interrupt, idempotent cancellation, finite SQL/queue/experiment ceilings. | Fault/race matrix around queue→run, run→finalize, cancel/timeout→restart and late completion callbacks. | OPEN |
| Ledger transactionality | Can crash/fault injection create half-created authoritative artifacts, exposures, finalists or recommendations? | Transaction-fault coverage, result-before-success ordering, transactional ledgers from `11.1`–`11.5`. Holdout now durably claims one-shot authority before sealed compute and atomically publishes completion with the claim. | Continue composed failure injection across Validation exposure, Finalist/Recommendation publication and cancellation/finalize transitions; `H-11.7-002` closes the Holdout compute→publication restart hole only. | OPEN |
| Validation / Holdout | Can Holdout be evaluated twice, exposed early, reused after contamination or leaked through public views/errors? | Frozen Validation schedule, exposure accounting, immutable Finalist Set, one-shot durable Holdout row, contamination rules, sealed public view. Same-process duplicates are single-flight under `H-11.7-001`; restart uncertainty is fail-closed under durable claim `H-11.7-002`. | Continue contamination and side-channel attacks plus remaining composed publication faults. Cross-run/cross-partition, arbitrary phase override, concurrent duplicate and crash/restart duplicate-consumption attacks are green. | REVIEWED |
| MCP tool boundary | Can tool name/schema/arguments bypass Domain validation or expose non-public internals? | Strict 46-tool registry, real `McpServer` registration through `fromJsonSchema`, and thin mapping to managed Research Domain. | Continue oversized/error-mapping/lifecycle fuzz. Missing/extra/wrong-type authority fields and ID-preservation parity are now green at the actual MCP transport boundary. | REVIEWED |
| Local transport / process | Can transport accept unapproved network/origin/body/path exposure or leak lifecycle state? | Pinned MCP v2 stdio path and sanitized/idempotent lifecycle from `11.6`; no research semantics depend on transport. | Verify actual stdio process boundary plus any local HTTP/browser diagnostics surface is absent or loopback/strict where applicable. | OPEN |
| Public-safe diagnostics | Can SQL, provider values, paths, secrets/config, stack traces or unbounded rows leak via errors/logs/artifacts? | Stable logical IDs, bounded public errors/observability and public-view contracts. | Trigger representative invalid/security/internal failures and inspect every returned/persisted diagnostic surface. | OPEN |
| Source immutability | Can any hostile sequence mutate, repair, migrate or replace evidence? | Existing Research SQL source-byte/fingerprint test and Backtest workload proof style. | Hash before/after the composed hostile corpus, including failures/cancellation/restart. | OPEN |
| Resource bounds | Can expensive SQL/results/concurrency escape configured CPU/RAM/temp/result/run budgets? | Research-only DuckDB limits, hierarchical budgets, result paging, bounded queue/readers. | Adversarial Cartesian/result-growth/duplicate submissions and cancellation responsiveness under bounded CI workload. | OPEN |

## Baseline findings from static re-read

### SQL/source boundary

The current Development SQL construction follows the strongest selected model:

```text
verify expected source fingerprint
→ open allowlisted evidence READ_ONLY
→ ATTACH server-resolved path internally
→ project only authorized Development rows into :memory:
→ DETACH original evidence
→ verify source fingerprint again
→ materialize controlled Development inputs
→ apply/lock DuckDB hardening
→ build Scanner authority
→ execute AI-authored SQL
```

The existing adversarial service proof already exercises broad analytical SELECTs plus direct file/network readers, `query/query_table`, environment/settings/catalog helpers, multi-statement input, DDL/DML, `ATTACH/DETACH`, `COPY`, `PRAGMA/SET/RESET`, extension and secret attempts, a discovered side-effecting function, hidden source/holdout relation names, and exact source-byte/fingerprint equality afterward.

This is baseline evidence only. TREE `11.7` still requires composed fault/restart/transport/resource attacks and analogous-area review before the audit can pass.

### Result Handle / cursor ownership

The first composed ownership pass found no Result Handle cross-run escape in the persistence boundary:

- Result metadata lookup requires both `research_run_id` and `result_handle`.
- Result creation requires `source_job_id` to exist under the same `research_run_id`.
- A page first resolves the Result Handle under the supplied Research Run before reading immutable rows.
- Cursor payloads bind to the exact Result Handle and reject cross-handle substitution and out-of-range offsets.
- Existing proof already resumes a cursor after reopening the ledger and rejects cross-run/cross-handle use.

This row is only `REVIEWED`, not closed, because phase/result substitution and incompatible restart-state attacks remain in later slices.

### Cross-run / phase / MCP authority parity

The composed boundary is intentionally layered rather than duplicated:

```text
actual MCP transport JSON schema
→ thin MCP registry translation
→ exact caller-supplied logical IDs
→ Research Domain / ledger run + phase authorization
```

The registry's direct `callTool()` helper is not itself the transport validator. Production `createResearchMcpServer()` registers every descriptor through `fromJsonSchema(definition.inputSchema)`, so the actual MCP SDK boundary enforces required fields, primitive types, nested shapes and `additionalProperties: false` before the registry callback reaches Domain authority.

`tests/service/research-mcp-adversarial-authority-boundary.test.mjs` makes that composition executable. Through a real `McpServer` transport it proves:

- an extra filesystem/path-like authority field is rejected before any Domain call;
- a missing required logical ID is rejected before Domain;
- caller attempts to add `phase` or a foreign `partitionId` to the Holdout tool are rejected before Domain;
- caller attempts to add a phase override to Validation are rejected before Domain;
- a wrong nested Result page type is rejected before Domain;
- invalid schema responses do not echo the attacker canary value;
- valid cross-run-shaped IDs are forwarded exactly, not rewritten or silently rebound by MCP. Authorization remains the Domain's responsibility.

Direct Domain/ledger evidence then supplies the authorization half of the parity check: Objective Versions, Query Artifacts, evidence inventories/plans/partitions and Result Handles are scoped by Research Run; cross-run parent/evidence/result references fail closed; Result cursors are handle-bound; Development projection and candidate diagnostics fail closed outside Development; Holdout requires the dedicated final capability and exact immutable Finalist Set, with cross-run/cross-partition reuse rejected.

No material MCP/Domain authority-bypass defect was found in this slice. The notable architectural conclusion is that strict MCP schemas are an input-shape boundary, not object authorization: the adapter deliberately preserves IDs exactly and the Research Domain remains the sole run/phase authority.

## Fixed finding H-11.7-001 — concurrent Holdout calls could execute sealed authority twice

**Severity:** blocking correctness/methodology defect — fixed in the current audit branch.

**Observed vulnerable design path:**

```text
executeHoldoutEvaluation
→ get existing durable evaluation
→ prepare frozen Holdout authority
→ execute sealed evidence
→ recordCompletedHoldoutEvaluation
→ transactional re-check / UNIQUE(research_run_id, finalist_set_id)
```

The durable Holdout ledger correctly prevented two rows for the same Research Run + Finalist Set, but that protection occurred **after** external authoritative experiment execution. Two concurrent calls could both observe no existing evaluation and execute the sealed Holdout before one durable result won the recording race.

**Root cause:** idempotency existed at durable publication time but there was no same-authority in-flight ownership boundary around the complete Holdout operation.

**Smallest sufficient fix:** commit `cee44fddd3e974a8b901475b00aff7415e29d772` adds a process-local `holdoutEvaluationsInFlight` single-flight map in `openResearchDomain()`, keyed by the exact `researchRunId + finalistSetId` authority. The validated request is copied into a frozen two-field object before asynchronous work starts. A concurrent duplicate joins the same Promise. The map entry is removed in `finally`, and only if it is still the same Promise, so a failed attempt does not permanently suppress an authorized retry. Durable ledger uniqueness remains the restart/publication backstop; no new persistence subsystem was introduced.

**Deterministic regression:** `tests/service/research-holdout-concurrency-hardening.test.mjs` starts one Holdout execution and holds it at the injected authoritative execution boundary, submits the same Finalist Set concurrently, and proves both callers receive the same result while `executeExperimentBatch` is entered exactly once.

**Green proof:** Fast CI run `#965` / workflow run `38342962058` passed the complete unit + real-service suite. The service output contains `TREE 11.7 concurrent Holdout requests consume sealed authority at most once`, and both service and unit suites report `301` tests / `301` passed / `0` failed. Planning/Contract CI `#1161` / `38342962022` is green. Workload CI `#551` / `38342962074` is green across all four jobs, including the bounded Research jobs cancellation/restart resource probe.

**Analogous-area review:** the MCP `execute_holdout_evaluation` tool is a thin direct delegation to `domain.executeHoldoutEvaluation`, while the managed domain composes/spreads the same base Research Domain, so neither path bypasses the single-flight boundary. Development/Validation experimentation is intentionally repeatable rather than a one-shot sealed-evidence capability; managed Development execution already has durable job/idempotency authority. Diagnostic reconstruction is intentionally recomputation, not one-shot evidence consumption. No second exact “execute at most once for this sealed durable authority” path was found in this slice.

**Status:** FIXED / regression GREEN. This closes `H-11.7-001` only; it does not close TREE `11.7`.

## Fixed finding H-11.7-002 — crash after sealed Holdout compute could consume the same Finalist again after restart

**Severity:** blocking correctness/methodology defect — fixed in the current audit branch.

**Observed vulnerable design path:**

```text
executeHoldoutEvaluation
→ prepare frozen Holdout authority
→ execute sealed evidence
→ verify source fingerprint
→ crash/fault before recordCompletedHoldoutEvaluation
→ restart
→ no durable Holdout row exists
→ retry executes the same sealed Finalist again
```

`H-11.7-001` removed the same-process concurrent race, but its single-flight map is intentionally process-local. Before this fix, the durable database recorded only a completed Holdout evaluation. A crash after sealed compute but before that row committed erased all knowledge that one-shot Holdout authority might already have been consumed.

**Root cause:** the one-shot methodology boundary was persisted too late. Durable idempotency protected publication identity, not pre-execution consumption/uncertainty across process failure.

**Red proof:** commit `21213326a5330d19e8b9f302d728472472ee9777` added `tests/service/research-holdout-restart-hardening.test.mjs` before the runtime fix. The test injects a failure after authoritative Holdout compute but before durable completion, then requires both same-process and post-restart retries to fail closed without a second Holdout execution. Fast CI `#969` / workflow `38343971596` failed exactly this new test: the retry re-entered sealed Holdout instead of returning `RESEARCH_INTEGRITY_ERROR`. Planning/Contract `#1165` and Workload `#555` remained green, isolating the failure to the intended missing restart boundary.

**Smallest sufficient fix:** commit `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` keeps the mechanism inside `research-server/holdout-ledger.js` and advances the Holdout schema to v2. It adds one durable `holdout_execution_claims` table keyed by exact `(research_run_id, finalist_set_id)` with an `authority_hash`, `claimed_at_ms` and nullable `completed_at_ms`.

The corrected sequence is:

```text
resolve canonical Finalist/Holdout authority
→ transactionally insert durable execution claim
→ execute sealed Holdout
→ verify source fingerprint
→ transactionally insert holdout_evaluation + mark exact claim completed
```

An existing incomplete claim with no completed evaluation is treated as irreversible uncertainty: retry fails closed with stable `RESEARCH_INTEGRITY_ERROR` rather than risking a second use of sealed evidence. This deliberately prefers methodology correctness over availability. A completed evaluation remains idempotently readable. The process-local `H-11.7-001` single-flight remains useful for concurrent callers, while the durable claim is the restart boundary.

**Schema/restart compatibility:** v1→v2 migration creates the claim table and advances `research_holdout_info.schema_version` in one transaction. Commit `acd4d8ea8448591b3073be099c9c310c506905ed` adds a dedicated migration regression that constructs an existing Research database in the prior Holdout v1 shape, reopens it through the real Research Domain, proves the Research Run still exists, and proves schema v2 plus `holdout_execution_claims` are installed.

**Green proof:** fix candidate `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` passed Fast CI `#970` / `38344334999` with unit `301/301`, service `303/303` and the crash/restart regression explicitly PASS; Planning/Contract `#1166` and Workload `#556` were green. The migration-proof candidate `acd4d8ea8448591b3073be099c9c310c506905ed` then passed Fast CI `#971` / `38344586428` with unit `301/301`, service `304/304`, both `H-11.7-001` and `H-11.7-002` regressions PASS, the v1→v2 migration regression PASS, and order acceptance PASS. Planning/Contract `#1167` and Workload `#557` are green.

**Analogous-area review:** existing managed Job authority already persists lifecycle before/through execution and its tests prove interrupted `RUNNING` work fails closed, cancellation wins before durable success, and `clientRequestId` retries do not duplicate durable work. Final Recommendation publication is derived from already-durable Holdout/fingerprint truth and existing restart tests prove deterministic replay of the terminal artifact. The unique missing pattern was the sealed one-shot Holdout boundary, where external evidence consumption itself had methodology significance before durable result publication. The fix therefore remains local to Holdout authority rather than introducing a generic execution-claim subsystem.

**Status:** FIXED / RED→GREEN regression / migration GREEN. This closes `H-11.7-002` only; TREE `11.7` remains in progress.

## Verification ledger

| Candidate | Verification | Result |
|---|---|---|
| `c74dc3e0c751eb112ca0b35cc6bc710ae2fef332` | Prior merged-main Branch-11 gates through `11.6` | GREEN baseline from authoritative execution record |
| audit branch | Local shell checkout | UNAVAILABLE in this executor environment because the temporary shell cannot resolve `github.com`; executable proof is therefore taken from GitHub CI, not fabricated locally |
| `fdd8226fdcae4432270107be3278469300824733` | `tests/service/research-holdout-concurrency-hardening.test.mjs` regression committed before runtime fix | RED-by-design proof candidate preceding the fix |
| `cee44fddd3e974a8b901475b00aff7415e29d772` | Fast CI `#965` / `38342962058` | GREEN — unit `301/301`, service `301/301`, Holdout single-flight regression explicitly PASS, order acceptance PASS |
| `cee44fddd3e974a8b901475b00aff7415e29d772` | Planning/Contract CI `#1161` / `38342962022` | GREEN |
| `cee44fddd3e974a8b901475b00aff7415e29d772` | Workload CI `#551` / `38342962074` | GREEN — all four jobs, including Research cancellation/restart resource probe |
| `bbed659218c4b485c6c2d2918e77ea1789f494fc` | Fast CI `#967` / `38343422166` | GREEN — unit `301/301`, service `302/302`, real MCP authority-boundary regression explicitly PASS, Holdout regression still PASS, order acceptance PASS |
| `bbed659218c4b485c6c2d2918e77ea1789f494fc` | Planning/Contract CI `#1163` / `38343422185` | GREEN |
| `bbed659218c4b485c6c2d2918e77ea1789f494fc` | Workload CI `#553` / `38343422234` | GREEN |
| `21213326a5330d19e8b9f302d728472472ee9777` | Fast CI `#969` / `38343971596` | RED-by-design — new crash/restart regression is the only service failure; retry re-entered sealed Holdout after the injected post-compute fault |
| `21213326a5330d19e8b9f302d728472472ee9777` | Planning/Contract `#1165` + Workload `#555` | GREEN — confirms the red candidate was isolated to the new runtime security proof |
| `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` | Fast CI `#970` / `38344334999` | GREEN — unit `301/301`, service `303/303`, Holdout crash/restart regression PASS, prior concurrency regression PASS, order acceptance PASS |
| `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` | Planning/Contract `#1166` + Workload `#556` | GREEN |
| `acd4d8ea8448591b3073be099c9c310c506905ed` | Fast CI `#971` / `38344586428` | GREEN — unit `301/301`, service `304/304`, Holdout crash/restart + v1→v2 migration regressions PASS, prior hardening proofs remain PASS, order acceptance PASS |
| `acd4d8ea8448591b3073be099c9c310c506905ed` | Planning/Contract `#1167` + Workload `#557` | GREEN |
| PR `#108` | Audit integration PR | DRAFT; opened only to obtain executable CI while TREE `11.7` remains in progress; do not merge yet |

## Current audit result

- Audit status: `IN PROGRESS`.
- Blocking defect `H-11.7-001`: fixed with the smallest process-local single-flight boundary and deterministic green regression.
- Blocking defect `H-11.7-002`: fixed with durable pre-execution Holdout claim + atomic completion publication; red proof, restart regression and v1→v2 migration proof are green.
- Cross-run / phase / MCP parity slice: no material bypass found. Real MCP schema enforcement rejects authority-shaping drift before Domain, MCP preserves valid IDs exactly, and existing Domain/ledger proofs fail closed on run/phase misuse.
- Result Handle/cursor first-pass ownership review: no material cross-run defect found; incompatible restart/phase-state attacks remain.
- MCP tool boundary is `REVIEWED`, not closed: oversized/error-mapping/lifecycle fuzz remains.
- Run/object and phase isolation are `REVIEWED`, not closed: composed job/experiment/recommendation substitution, remaining fault/restart and side-channel cases remain.
- Ledger transactionality remains `OPEN`: the Holdout compute→publication restart hole is closed, but remaining Validation exposure/Finalist/Recommendation publication and cancellation/finalize transitions still require composed failure attacks before closure.
- Validation/Holdout remains `REVIEWED`, not closed: concurrent and restart duplicate consumption are now fail-closed, while contamination/side-channel/publication-fault attacks remain.
- Closure claim: none. The remaining SQL-host/source, fault/restart/transactionality, cancellation, diagnostics, transport, source-immutability and resource matrix must still be attacked before TREE `11.7` can be marked done.
- Next audit slice: continue the remaining composed fault/restart/transactionality matrix around Validation exposure, Finalist/Recommendation publication and cancellation/finalize races; any material finding stays with Chat 41 through RCA, fix, regression and green verification.
