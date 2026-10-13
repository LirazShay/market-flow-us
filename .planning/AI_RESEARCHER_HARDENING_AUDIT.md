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

| Area | Required hostile question | Current evidence / remaining work | Status |
|---|---|---|---|
| Source selection / attachment | Can caller-controlled IDs, paths, aliases, attachment syntax or projection failure reach/mutate original evidence? | Server-owned logical `sourceId`, read-only opening, fingerprint verification and detached in-memory projection are baseline. TREE 11.7 now runs a real Domain-composed hostile corpus containing implicit local/remote scans, detached `evidence.main.history`, export/maintenance statements and equivalent reader/catalog forms; original source bytes and fingerprint remain exact. No source escape or mutation survived. | REVIEWED |
| SQL statement admission | Can multi-statement, DDL/DML, `ATTACH`, `COPY`, config, extension or secret operations pass as analytical SQL? | Direct adversarial admission plus composed Domain corpus cover multi-statement/non-SELECT, DDL/DML, `ATTACH/DETACH`, `COPY/EXPORT`, config/maintenance, extension/secret and quoted/comment-obfuscated helper forms. `H-11.7-006` closes the discovered relation-form settings-catalog gap. | REVIEWED |
| SQL host access | Can file/network readers, dynamic SQL, environment/config/secret/catalog helpers or side-effecting functions access the host? | External access/extensions/secrets are disabled; dangerous functions are denied; composed local/remote replacement scans and reader aliases fail closed. `H-11.7-006` additionally blocks PostgreSQL-compatible `pg_settings` relation access in plain, qualified and quoted forms while preserving inert strings/comments and safe schema discovery. | REVIEWED |
| Phase isolation | Can Development SQL or lower-phase APIs expose Validation/Holdout rows, outcomes, metadata or lineage? | Development-only SQL, typed Validation/Holdout authority, MCP phase-shape rejection and cross-phase diagnostics are green. Remaining side-channel/fault cases belong to later diagnostics/transport review. | REVIEWED |
| Run/object ownership | Can IDs from another Research Run or Evidence Plan be replayed against reads/mutations? | Objective/query/evidence/partition/result/finalist/Holdout boundaries are run-scoped. No cross-run escape found. `H-11.7-003` additionally binds Finalist support to the exact current Evidence Plan Validation partition. | REVIEWED |
| Result handles / cursors | Can a handle/cursor be used cross-run, cross-result or after incompatible restart/phase state? | Result metadata is run+handle scoped; source Job must be same-run; cursor is handle-bound; restart paging is green. `H-11.7-005` purges provisional Results owned by interrupted `RUNNING` Jobs and clears their published progress handles while preserving `SUCCEEDED` Result authority. | REVIEWED |
| Jobs / idempotency | Can duplicate/conflicting requests create duplicate work or inconsistent durable authority? | Durable jobs, request fingerprints, `clientRequestId`, queue/readers are baseline. Holdout concurrent duplicate execution is closed by `H-11.7-001`; interrupted Job restart reconciliation owns provisional Result cleanup via `H-11.7-005`. | REVIEWED |
| Cancellation / timeout | Can cancelled/timed-out work later publish success/results or keep consuming authority/resources? | Queue/running/compute cancellation and interrupt tests are green. `H-11.7-004` closes the same-process late-cancel race once durable Result publication begins; `H-11.7-005` closes the crash/restart split after provisional Result publication. Remaining responsiveness/resource attacks belong to the resource matrix. | REVIEWED |
| Ledger transactionality | Can crash/fault injection create half-created authoritative artifacts, exposures, finalists or recommendations? | Holdout pre-execution claim closes restart uncertainty (`H-11.7-002`); Finalist lock revalidates current-plan Validation support (`H-11.7-003`); late cancellation cannot split Result/Job truth (`H-11.7-004`); restart transactionally removes provisional Results/handles before failing interrupted Jobs (`H-11.7-005`). | REVIEWED |
| Validation / Holdout | Can Holdout be evaluated twice, exposed early, reused after contamination or leaked through public views/errors? | Same-process duplicate consumption is closed by `H-11.7-001`; restart duplicate consumption by `H-11.7-002`; superseded-plan Validation support by `H-11.7-003`. Contamination/error-side-channel cases remain part of diagnostics review. | REVIEWED |
| MCP tool boundary | Can tool name/schema/arguments bypass Domain validation or expose non-public internals? | Real MCP schema rejects missing/extra/wrong-type authority fields and preserves valid IDs exactly for Domain authorization. Oversized/error-mapping/lifecycle fuzz remains. | REVIEWED |
| Local transport / process | Can transport accept unapproved network/origin/body/path exposure or leak lifecycle state? | Pinned MCP v2 stdio lifecycle is baseline. Actual stdio/process and absence/strictness of unintended local HTTP/browser research surfaces still require closure. | OPEN |
| Public-safe diagnostics | Can SQL, provider values, paths, secrets/config, stack traces or unbounded rows leak via errors/logs/artifacts? | Stable bounded public errors are baseline. Representative invalid/security/internal failure surfaces still require inspection. | OPEN |
| Source immutability | Can any hostile sequence mutate, repair, migrate or replace evidence? | Existing source-byte/fingerprint proofs are joined by a real Domain-composed TREE 11.7 hostile SQL corpus. Exact source bytes and source fingerprint are unchanged after all accepted/rejected attacks, and no attempted export artifact is created. | REVIEWED |
| Resource bounds | Can expensive SQL/results/concurrency escape configured CPU/RAM/temp/result/run budgets? | DuckDB limits, hierarchical budgets, result paging and bounded queue/readers are baseline. Adversarial growth/duplicate/cancellation responsiveness still required. | OPEN |

## Static/composed findings that remain valid

### SQL/source boundary

The Development SQL construction remains:

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

The baseline adversarial proof exercises broad analytical SELECTs plus direct file/network readers, `query/query_table`, environment/settings/catalog helpers, multi-statement input, DDL/DML, `ATTACH/DETACH`, `COPY`, `PRAGMA/SET/RESET`, extension and secret attempts, side-effecting functions and hidden source/Holdout relation names. TREE 11.7 adds the real `openResearchDomain()` composition, namespaced/quoted/commented equivalents, implicit local/remote replacement scans, reader aliases, detached-source references, PostgreSQL-compatible settings relations and maintenance/export statements. The composed proof verifies exact source bytes and fingerprint after the hostile sequence.

### Result Handle / cursor ownership

The composed ownership pass found no cross-run Result Handle escape:

- Result lookup requires both `research_run_id` and `result_handle`.
- Result creation requires the source Job under the same Research Run.
- Paging resolves the scoped Result Handle before immutable rows.
- Cursor payloads bind to the exact Result Handle and reject cross-handle/out-of-range use.
- Existing proof resumes a cursor after reopening and rejects cross-run/cross-handle substitution.
- Restart reconciliation treats Results owned by still-`RUNNING` Jobs as provisional: `H-11.7-005` removes those rows and their progress handles before terminalizing the interrupted Job as `FAILED`, while a `SUCCEEDED` control Result remains unchanged.

### Cross-run / phase / MCP authority parity

The production boundary remains:

```text
actual MCP transport JSON schema
→ thin MCP registry translation
→ exact caller-supplied logical IDs
→ Research Domain / ledger run + phase authorization
```

`tests/service/research-mcp-adversarial-authority-boundary.test.mjs` proves through a real `McpServer` transport that extra path/phase/partition authority, missing IDs and wrong nested types are rejected before Domain; attacker canaries are not reflected; valid IDs are forwarded unchanged. Domain/ledger evidence supplies authorization. No material MCP/Domain authority bypass was found.

## Fixed finding H-11.7-001 — concurrent Holdout calls could execute sealed authority twice

**Severity:** blocking correctness/methodology defect — fixed.

**Root cause:** durable uniqueness protected Holdout publication only after external authoritative execution. Two concurrent same-Finalist calls could both execute sealed evidence before one durable row won the race.

**Fix:** commit `cee44fddd3e974a8b901475b00aff7415e29d772` adds exact `(researchRunId, finalistSetId)` process-local single-flight in `openResearchDomain()`. Concurrent duplicates join the same Promise; cleanup is identity-safe in `finally`; durable uniqueness remains the publication/restart backstop.

**Regression:** `tests/service/research-holdout-concurrency-hardening.test.mjs` holds the first authoritative execution boundary, submits the duplicate concurrently and proves `executeExperimentBatch` is entered once while both callers receive the same result.

**Green evidence:** Fast `#965` / `38342962058`, Planning `#1161`, Workload `#551`.

**Analogous review:** MCP and managed-domain Holdout routes delegate to the same Domain boundary. Development/Validation experiments are intentionally repeatable, while managed Development jobs already have durable idempotency authority.

**Status:** FIXED / regression GREEN.

## Fixed finding H-11.7-002 — crash after sealed Holdout compute could consume the same Finalist again after restart

**Severity:** blocking correctness/methodology defect — fixed.

**Vulnerable sequence:** sealed Holdout compute could finish, then a crash/fault could happen before `recordCompletedHoldoutEvaluation`. After restart there was no durable fact saying one-shot evidence might already have been consumed, so retry could execute it again.

**Root cause:** one-shot consumption/uncertainty was persisted too late. Durable idempotency protected completed publication identity, not pre-publication external evidence consumption.

**RED proof:** commit `21213326a5330d19e8b9f302d728472472ee9777` added `tests/service/research-holdout-restart-hardening.test.mjs`. Fast `#969` / `38343971596` failed exactly the new regression; Planning `#1165` and Workload `#555` remained green.

**Fix:** commit `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` advances Holdout schema to v2 and adds `holdout_execution_claims`, keyed by exact `(research_run_id, finalist_set_id)`. The ledger transactionally records the claim before sealed compute, then transactionally inserts the completed evaluation and marks the exact claim completed. An unfinished claim is irreversible uncertainty and fails closed with `RESEARCH_INTEGRITY_ERROR` instead of consuming sealed evidence again.

**Migration proof:** commit `acd4d8ea8448591b3073be099c9c310c506905ed` proves transactional v1→v2 migration preserves existing Research authority and installs the execution-claim table.

**Green evidence:** Fast `#970` / `38344334999`, Planning `#1166`, Workload `#556`; then Fast `#971` / `38344586428` with unit `301/301`, service `304/304`, migration + Holdout regressions PASS, Planning `#1167`, Workload `#557`.

**Analogous review:** managed Jobs already persist lifecycle before/through execution and fail stale `RUNNING` work closed. Final Recommendation is derived from durable evidence and publishes terminal artifact/state transactionally. The unique missing one-shot external-consumption pattern was Holdout, so no generic claim subsystem was added.

**Status:** FIXED / RED→GREEN / migration GREEN.

## Fixed finding H-11.7-003 — Finalist lock could inherit Validation support from a superseded Evidence Plan

**Severity:** blocking correctness/methodology defect — fixed.

**Vulnerable sequence:**

```text
Domain createFinalistSet
→ resolve current Evidence Plan A
→ prove Query Artifact has Validation exposure on Plan A
→ another operation commits newer Evidence Plan B
→ Validation ledger resolves latest Plan B
→ durable Finalist is frozen under Plan B
→ no ledger-level recheck that the Query was validated on Plan B
```

The Domain queue serializes each component call, not the entire outer `createFinalistSet` sequence. Therefore the Domain precheck could become stale before the final Validation-ledger lock. The ledger itself selected the newest plan but previously accepted any run-scoped Validation exposure count without proving exact support under that selected plan.

**Root cause:** a correctness-critical authority check lived only in a caller-layer precheck separated from durable Finalist publication by independently serialized operations. The final persistence authority trusted a potentially stale precondition.

**Deterministic RED proof:** commit `33e8c918ab30a854eea1a9431607355412a3f096` adds `tests/service/research-finalist-plan-race-hardening.test.mjs`. It creates Plan A, records an exact Validation exposure for Plan A, commits Plan B with different Validation/Holdout partitions, then asks the Validation ledger to create a Finalist. Fast `#973` / `38345191465` failed only this new test with `Missing expected rejection`: unit `301/301`, service `304/305`. Planning `#1169` and Workload `#559` were green.

**Smallest sufficient fix:** commit `8f4eab236a244d0aeba66a7ac33491f978156ca4` adds one ledger-local guard in `research-server/validation-ledger.js`. After resolving the latest Evidence Plan and candidate Query Artifacts, `createFinalistSet` now requires, for each candidate Query, a durable Validation exposure with the exact current Objective Version, current plan Validation partition, `queryArtifactId`, `sqlHash` and `scannerContractVersion`. If exact support is absent it fails before freezing/inserting the Finalist. The existing Domain precheck remains defense-in-depth. No schema, public API or new subsystem was introduced.

**Why the fix closes the race:** the final Validation-ledger authority now derives the latest plan and proves support against that exact plan inside the same serialized ledger call that performs Finalist publication. A plan change can no longer occur between the correctness check and the durable lock through normal Domain composition.

**GREEN proof:** Fast `#974` / `38345355839` passed unit `301/301`, service `305/305`, the new regression, all prior hardening regressions and order acceptance. Planning `#1170` / `38345355825` and Workload `#560` / `38345355802` are green.

**Analogous-area review:** a completed Validation Experiment is not Finalist support until a durable Validation exposure exists. Final Recommendation writes its terminal recommendation artifact and Run terminal transition transactionally. Post-Holdout contamination is recomputed from immutable Query lineage and the durable Holdout baseline.

**Status:** FIXED / RED→GREEN regression.

## Fixed finding H-11.7-004 — late cancellation could split durable Result and Job terminal truth

**Severity:** blocking correctness/failure-hardening defect — fixed.

**Vulnerable sequence:** a managed Development Experiment or Research SQL Job could finish compute, begin/complete `research_results` publication while the durable Job still remained `RUNNING`, and then accept `cancelJob`. Cancellation could win after a durable Result already existed and leave `Job = CANCELLED` with a readable Result.

**Root cause:** the non-cancellable terminal boundary started too late. Durable Result creation occurred inside managed `work`, while the Job controller did not claim success-finalization until near `markJobSucceeded`.

**Test-proof correction:** commit `34266ce85ade5308b7450f89e5f3e33ce29007a2` first added the regression, but Fast `#976` rejected an invalid fixture before exercising the race. Commit `2dd97516f147a01262967f06b935fd93631fba42` corrected the fixture.

**Deterministic RED proof:** `tests/service/research-job-result-finalization-race-hardening.test.mjs` triggers `cancelJob` from `resultHandleFactory`, exactly after Result publication enters its durable transaction. Fast `#977` / `38346210985` passed unit `301/301` and failed service `305/306` only on this regression. Planning `#1173` and Workload `#563` were green.

**Smallest sufficient fix:** commit `45152a2da9841c14bec601bd19062a5134705d4e` adds a serialized `beginSuccessCommit` transition to the shared Job controller. Commit `2e5496c90b05da5e2115fbaa47fddf5057f44e20` makes both managed Result publishers — Development Experiment and Research SQL — enter this boundary immediately before `createResult`. No schema or new subsystem was added.

**Intermediate proof:** Fast `#978` on the controller-only commit still failed only H-004, proving the generic seam alone was insufficient while concrete managed publishers still emitted Results inside ordinary cancellable `work`.

**GREEN proof:** Fast `#979` / `38346497780` passed unit `301/301`, service `306/306`, H-004, legacy cancellation proofs and order acceptance. Planning `#1175` / `38346497878` and Workload `#565` / `38346497862` are green.

**Analogous-area review:** generic `commitSuccess`, managed Experiment Result publication and managed Research SQL Result publication now share the protected terminal boundary. Legitimate queued/running/pre-publication cancellation remains green. Final Recommendation is outside this managed Result path and already publishes terminal artifact + Run state transactionally.

**Status:** FIXED / deterministic RED→GREEN regression.

## Fixed finding H-11.7-005 — crash after Result commit could leave a FAILED Job with a readable Result

**Severity:** blocking correctness/failure-hardening defect — fixed.

**Vulnerable sequence:**

```text
managed Job is RUNNING
→ success-commit boundary is claimed in memory
→ durable Result is committed
→ optional Job progress publishes that Result handle
→ process crashes before durable markJobSucceeded
→ restart reconciliation marks RUNNING Job FAILED / RESEARCH_JOB_INTERRUPTED
→ previously committed Result remains readable
```

The H-004 success-commit owner is intentionally process-local, so it cannot repair this crash boundary by itself.

**Root cause:** Result publication and `Job = SUCCEEDED` are separate durable transactions, while startup reconciliation previously updated only stale `RUNNING` Job rows. The Result ledger correctly committed its own metadata/rows atomically, but there was no restart authority deciding whether a Result whose source Job never reached terminal success was provisional or authoritative. A crash could therefore create contradictory durable truth: `Job = FAILED` plus a readable Result, and if progress had already been persisted, a failed Job could also retain a stale published `resultHandle`.

**Deterministic RED proof:** commit `245aa0b8edd05761b52df66d751ff17bed4a06cd` adds `tests/service/research-job-result-restart-hardening.test.mjs`. It creates an interrupted `RUNNING` Job and a `SUCCEEDED` negative-control Job, publishes one Result for each, restarts the Job ledger and requires the interrupted Result to disappear while the succeeded Result remains. Fast `#982` / `38347232239` passed unit `301/301`, failed service `306/307`, and the sole failure was the new H-005 assertion because the interrupted Result remained readable. Planning `#1178` and Workload `#568` were green.

**Smallest sufficient fix:** commit `62152ccf835da6b00cc8d1f595527ab889d89e2a` moves default startup reconciliation into the composed Job-ledger wrapper where both Job and optional Result tables can be reconciled in one DuckDB transaction. For Jobs still `RUNNING`, restart reconciliation finds and deletes their provisional Result rows/metadata, clears only `progress.resultHandles`, marks the same Jobs `FAILED / RESEARCH_JOB_INTERRUPTED`, and commits the whole reconciliation atomically. `reconcileInterrupted:false` remains the transient internal path during active managed work. No schema or public API was added.

**Expanded regression:** commit `9088c6cb92ba99c51c3c1c957b4e64aa62916cb3` strengthens the same test by persisting `progress.resultHandles` for both Jobs before the simulated crash. After restart it proves the interrupted Job is `FAILED` with an empty handle list and no readable Result, while the `SUCCEEDED` Job retains both its handle and Result.

**Why fail-closed cleanup is correct:** Result existence alone cannot prove every correctness-critical terminal step completed, so restart must not promote an interrupted Job to `SUCCEEDED`. Conversely, deleting only Results owned by Jobs still `RUNNING` prevents provisional artifacts from becoming authority while preserving already-terminal successful Results. Durable resource/budget consumption is intentionally not refunded because the work was actually consumed.

**GREEN proof:** Fast `#984` / `38347610524` passed unit `301/301`, service `307/307`, H-005, H-004, all legacy Job cancellation/restart/idempotency proofs and order acceptance. Planning `#1180` / `38347610422` and Workload `#570` / `38347610525` are green.

**Analogous-area review:** managed Development Experiment and managed Research SQL share this Job/Result lifecycle and are both covered. H-004 owns same-process cancel-vs-publication; H-005 owns crash/restart after provisional publication. Holdout uses its separate durable pre-execution claim/completion protocol (`H-11.7-002`), and Final Recommendation already publishes artifact + terminal Run state transactionally.

**Status:** FIXED / deterministic RED→GREEN restart regression.

## Fixed finding H-11.7-006 — PostgreSQL-compatible `pg_settings` relation exposed sandbox configuration

**Severity:** blocking security/data-boundary defect — fixed.

**Vulnerable sequence:** Research SQL correctly denied `duckdb_settings()` and `current_setting(...)`, but the same configuration family was also available through DuckDB's PostgreSQL-compatible `pg_settings` relation. Queries such as `SELECT name, setting FROM pg_settings`, `pg_catalog.pg_settings`, and the fully quoted equivalent were valid analytical `SELECT`s and did not invoke a function, so the function-call admission lexer never saw them.

**Why this is material:** the Research security contract permits only safe system/schema introspection needed for authoring. Secret/config/file-reader/path-bearing metadata outside curated Research relations must remain inaccessible. A settings relation is configuration authority/metadata, not ordinary analytical evidence, even when external access itself is disabled.

**Deterministic RED proof:** commit `43616e0a3ba677d2b506cab9fbf82e62244b4a91` adds `tests/service/research-sql-host-source-hardening.test.mjs` through the real `openResearchDomain()` composition. Fast `#986` / `38348341605` passed unit `301/301`, failed service `307/308`, and the only new failure reported exactly three unexpected successes: PostgreSQL-compatible settings catalog, unqualified settings catalog, and quoted settings catalog. Planning `#1182` and Workload `#572` were green. Every other hostile form in that corpus was rejected and the source bytes/fingerprint remained unchanged.

**Root cause:** Research SQL admission was intentionally layered over the shared Scanner function lexer. That lexer identifies invoked functions while ignoring comments and strings, but relation/view references are outside its contract. The security policy blocked the function representations of settings but omitted the equivalent relation representation.

**Smallest sufficient fix:** commit `1da53186a84d8675bfd51ef7ba7969c66c6ef10e` factors the existing Scanner lexical walk so it can expose normalized identifiers while preserving the exact function-call behavior. Commit `ada298fc3318b225d85edb59127a16dd64a1895f` adds one Research-only forbidden identifier, `pg_settings`, to `research-server/research-sql-admission.js`. It reuses the existing stable `SCANNER_FORBIDDEN_FUNCTION` rejection contract rather than adding a new public error or SQL parser. Commit `4a8132506900266506bd049bddb467c65720cc7a` adds unit proof for plain, qualified, quoted and comment-separated relation forms while proving string/comment occurrences remain inert.

**Composed hostile corpus / immutability proof:** the TREE 11.7 service regression also attempts namespaced/quoted/comment-separated file readers, dynamic SQL, pragma/catalog helpers, metadata readers, implicit local and remote replacement scans, JSON reader aliases, detached `evidence.main.history`, `EXPORT DATABASE`, `CHECKPOINT`, and `VACUUM`. After all hostile queries, a normal `research_history` query still succeeds; exact source bytes and source fingerprint equal the pre-attack values; and no export artifact exists.

**GREEN proof:** Fast `#989` / `38348633907` passed unit `302/302`, service `308/308`, the new `pg_settings` unit proof, the composed TREE 11.7 host/source regression, prior Research SQL admission/escape proofs and order acceptance. Because the shared Scanner lexer changed, affected verification also includes Planning `#1185`, Workload `#575`, Replay `#137`, and Browser `#599`; all are green.

**Analogous-area review:** `information_schema` and safe schema introspection remain available; the fix does not blacklist system catalogs wholesale. Existing dangerous DuckDB catalog/config functions remain explicitly denied. Implicit local/remote replacement scans and `read_json_objects`/`read_ndjson_objects` fail closed under the locked `enable_external_access=false` sandbox even though they are not separately added to the admission blacklist, so no redundant policy subsystem was introduced. Source mutation was not observed anywhere in the composed corpus.

**Status:** FIXED / deterministic RED→GREEN / Browser+Replay affected verification GREEN.

## Verification ledger

| Candidate | Verification | Result |
|---|---|---|
| `c74dc3e0c751eb112ca0b35cc6bc710ae2fef332` | Prior merged-main Branch-11 gates through `11.6` | GREEN baseline from authoritative execution record |
| audit branch | Local shell checkout | UNAVAILABLE in this executor environment because the temporary shell cannot resolve `github.com`; executable proof is taken from GitHub CI, not fabricated locally |
| `fdd8226fdcae4432270107be3278469300824733` | Holdout concurrency regression before fix | RED-by-design candidate |
| `cee44fddd3e974a8b901475b00aff7415e29d772` | Fast `#965`, Planning `#1161`, Workload `#551` | GREEN — H-001 regression PASS |
| `bbed659218c4b485c6c2d2918e77ea1789f494fc` | Fast `#967`, Planning `#1163`, Workload `#553` | GREEN — real MCP authority-boundary regression PASS |
| `21213326a5330d19e8b9f302d728472472ee9777` | Fast `#969` / `38343971596` | RED-by-design — only new crash/restart Holdout regression failed; Planning `#1165` + Workload `#555` green |
| `d5df2bc1e8d20c948848d6d6e186ba638a8d840` | Fast `#970`, Planning `#1166`, Workload `#556` | GREEN — H-002 crash/restart regression PASS |
| `acd4d8ea8448591b3073be099c9c310c506905ed` | Fast `#971`, Planning `#1167`, Workload `#557` | GREEN — unit `301/301`, service `304/304`, Holdout v1→v2 migration PASS |
| `33e8c918ab30a854eea1a9431607355412a3f096` | Fast `#973` / `38345191465` | RED-by-design — unit `301/301`; service `304/305`; only H-003 Finalist-plan regression failed |
| `8f4eab236a244d0aeba66a7ac33491f978156ca4` | Fast `#974`, Planning `#1170`, Workload `#560` | GREEN — H-003 regression and affected gates PASS |
| `34266ce85ade5308b7450f89e5f3e33ce29007a2` | Fast `#976` | INVALID RED attempt — fixture failed before intended race; not product-defect evidence |
| `2dd97516f147a01262967f06b935fd93631fba42` | Fast `#977` / `38346210985` | RED-by-design — unit `301/301`, service `305/306`; only H-004 failed; Planning `#1173` + Workload `#563` green |
| `45152a2da9841c14bec601bd19062a5134705d4e` | Fast `#978` | RED intermediate — generic controller boundary alone did not cover managed publishers |
| `2e5496c90b05da5e2115fbaa47fddf5057f44e20` | Fast `#979`, Planning `#1175`, Workload `#565` | GREEN — unit `301/301`, service `306/306`, H-004 + legacy cancellation PASS, order acceptance PASS |
| `245aa0b8edd05761b52df66d751ff17bed4a06cd` | Fast `#982` / `38347232239` | RED-by-design — unit `301/301`, service `306/307`; only H-005 restart Result regression failed; Planning `#1178` + Workload `#568` green |
| `9088c6cb92ba99c51c3c1c957b4e64aa62916cb3` | Fast `#984`, Planning `#1180`, Workload `#570` | GREEN — unit `301/301`, service `307/307`, H-005 + H-004 + legacy cancellation/restart/idempotency PASS, order acceptance PASS |
| `43616e0a3ba677d2b506cab9fbf82e62244b4a91` | Fast `#986` / `38348341605` | RED-by-design — unit `301/301`, service `307/308`; only H-006 composed host/source regression failed and identified the three `pg_settings` relation forms; Planning `#1182` + Workload `#572` green |
| `4a8132506900266506bd049bddb467c65720cc7a` | Fast `#989` / `38348633907` | GREEN — unit `302/302`, service `308/308`, H-006 unit + composed host/source/immutability proofs PASS, order acceptance PASS |
| `4a8132506900266506bd049bddb467c65720cc7a` | Planning `#1185`, Workload `#575`, Replay `#137`, Browser `#599` | GREEN — shared Scanner lexer affected verification PASS |
| PR `#108` | Audit integration PR | DRAFT; executable CI vehicle while TREE `11.7` remains in progress; do not merge yet |

## Current audit result

- Audit status: `IN PROGRESS`.
- `H-11.7-001`: fixed — concurrent same-authority Holdout execution is single-flight.
- `H-11.7-002`: fixed — crash/restart Holdout uncertainty is durably claimed and fails closed; migration proof is green.
- `H-11.7-003`: fixed — Finalist lock cannot inherit Validation support from a superseded Evidence Plan.
- `H-11.7-004`: fixed — once managed durable Result publication begins, late cancellation cannot leave a readable Result under a `CANCELLED` Job.
- `H-11.7-005`: fixed — restart cannot leave provisional Results/handles from an interrupted `RUNNING` Job authoritative; a `SUCCEEDED` control retains its Result authority.
- `H-11.7-006`: fixed — PostgreSQL-compatible `pg_settings` relation access cannot bypass the Research configuration boundary; plain/qualified/quoted forms are denied without breaking inert text or safe schema introspection.
- SQL statement admission, SQL host access, source selection/attachment and source immutability are now `REVIEWED` on a real Domain-composed hostile corpus with exact before/after source bytes/fingerprint proof.
- Cross-run / phase / MCP parity: no material bypass found in reviewed slices.
- Result Handle/cursor ownership remains `REVIEWED`: cross-run/cross-handle/restart ownership is green, including interrupted-Result cleanup.
- Cancellation/timeout remains `REVIEWED`: queued/running/compute/late-publication and crash-after-publication splits are green; remaining responsiveness/resource attacks belong to the resource matrix.
- Ledger transactionality is `REVIEWED`: representative Holdout, Finalist, late-cancel and managed Result crash/restart publication splits have deterministic proofs and fail-closed fixes.
- MCP boundary remains `REVIEWED`, not closed: oversized/error-mapping/lifecycle fuzz remains and is grouped with the remaining transport/diagnostic slice.
- Validation/Holdout remains `REVIEWED`, not closed: duplicate consumption and stale-plan Finalist support are fail-closed; contamination/error-side-channel cases remain for diagnostics review.
- Closure claim: none. Local transport/process, public-safe diagnostics and resource-bound attacks remain before TREE `11.7` can be marked done.
- Next audit slice: composed diagnostics + local transport/process adversarial review, including MCP oversized/error/lifecycle behavior and public-safe failure surfaces; after that, resource-bound/growth/cancellation responsiveness attacks. Any material finding remains with Chat 41 through RCA, fix, regression and green verification.
