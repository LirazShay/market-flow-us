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

## Baseline invariants

1. Original market evidence is immutable and selected by server-owned logical identity, not caller paths.
2. AI-authored SQL executes only after authorized evidence is projected into an isolated server-owned DuckDB sandbox and original sources are detached.
3. General Research SQL is Development-only; Validation and Sealed Holdout use typed server authority.
4. Durable objects are Research-Run scoped and lineage checked; opaque IDs are not authorization.
5. Durable success is published only after correctness-critical result/provenance state is committed.
6. Long work is bounded, cancellable and restart-safe; stale `RUNNING` work cannot become false success.
7. Result handles/pages/cursors are bounded and ownership checked; paging does not rerun arbitrary SQL.
8. MCP is a thin adapter over Research Domain authority and must not widen authority.
9. Diagnostics must remain bounded and public-safe.
10. Source bytes/fingerprints must remain unchanged across hostile sequences.

## Adversarial matrix

| Area | Current adversarial evidence / remaining work | Status |
|---|---|---|
| Source selection / attachment | Real Domain-composed hostile corpus uses server-owned logical sources, read-only opening, detached in-memory projection, implicit local/remote scans, detached-source references and export/maintenance attempts. Exact source bytes/fingerprint remain unchanged. | REVIEWED |
| SQL statement admission | Direct + composed corpus covers multi-statement/non-SELECT, DDL/DML, `ATTACH/DETACH`, `COPY/EXPORT`, config/maintenance, extensions/secrets and quoted/comment-obfuscated forms. `H-11.7-006` closes the discovered relation-form settings gap. | REVIEWED |
| SQL host access | External access/extensions/secrets are disabled; dangerous functions are denied; replacement scans/readers fail closed. `H-11.7-006` blocks `pg_settings` in plain/qualified/quoted forms without blocking inert text or safe schema discovery. | REVIEWED |
| Phase isolation | Development-only SQL, typed Validation/Holdout authority, MCP phase-shape rejection, post-Holdout contamination checks and public-safe error surfaces are green. No material phase/error side-channel bypass was found in the reviewed corpus. | REVIEWED |
| Run/object ownership | Objective/query/evidence/partition/result/finalist/Holdout boundaries are run-scoped. `H-11.7-003` additionally binds Finalist support to the exact current-plan Validation partition. | REVIEWED |
| Result handles / cursors | Run+handle scoping, handle-bound cursors and restart paging are green. `H-11.7-005` removes provisional Results/handles from interrupted Jobs while preserving `SUCCEEDED` authority. | REVIEWED |
| Jobs / idempotency | Durable request fingerprints/idempotency are baseline; `H-11.7-001` closes concurrent Holdout duplication; `H-11.7-005` closes interrupted Result publication; `H-11.7-008` closes unstable durable failure diagnostics. Composed queue-pressure proof shows 32 concurrent exact retries reuse one queued Job and one queue slot. | REVIEWED |
| Cancellation / timeout | Queue/running/compute cancellation is green; `H-11.7-004` closes late cancel once Result publication starts; `H-11.7-005` closes crash/restart after provisional publication. Composed duplicate-pressure proof cancels queued work before start and proves it never executes after capacity is released. | REVIEWED |
| Ledger transactionality | `H-11.7-002` Holdout claim, `H-11.7-003` Finalist current-plan recheck, `H-11.7-004` success-commit boundary and `H-11.7-005` restart reconciliation cover representative composed publication/fault splits. | REVIEWED |
| Validation / Holdout | Concurrent/restart duplicate consumption, superseded-plan Finalist support, post-Holdout contamination and finalization restart/source-drift paths are fail-closed. Public error surfaces are covered by the diagnostics slice. | REVIEWED |
| MCP tool boundary | Real MCP schema rejects malformed/authority-shaping arguments, preserves exact logical IDs for Domain authorization, and applies transport-side SQL/Experiment-reference ceilings via `H-11.7-007`. Arbitrary tool exception text/invalid codes are sanitized. | REVIEWED |
| Local transport / process | Real stdio restart is baseline. TREE 11.7 additionally proves malformed framing does not kill or poison the process, valid requests remain usable, EOF shuts down cleanly, SIGTERM is product-owned, and stdout/stderr do not echo private canaries/paths. | REVIEWED |
| Public-safe diagnostics | Synchronous MCP failures, stdio diagnostics and durable Job failure progress are explicitly bounded. `H-11.7-008` normalizes invalid nested durable failure codes while preserving stable codes. | REVIEWED |
| Source immutability | TREE 11.7 composed SQL-host corpus proves exact before/after source bytes + fingerprint and no export artifact. | REVIEWED |
| Resource bounds | CPU/RAM/temp, hierarchical durable budgets, paging, queue/readers and growth ceilings are green. `H-11.7-009` adds pre-materialization row/byte bounds to Research SQL output; composed duplicate-pressure/cancellation proof closes amplification/responsiveness review. | REVIEWED |

## Composed architecture facts

### SQL/source boundary

```text
verify expected source fingerprint
→ open allowlisted evidence READ_ONLY
→ ATTACH server-resolved path internally
→ project authorized Development rows into :memory:
→ DETACH original evidence
→ verify fingerprint again
→ materialize controlled inputs
→ apply + lock DuckDB hardening
→ build Scanner authority
→ execute AI-authored SQL
```

The TREE 11.7 Domain-composed corpus covers namespaced/quoted/commented reader equivalents, dynamic SQL, pragma/catalog helpers, metadata readers, implicit local/remote replacement scans, detached `evidence.main.history`, settings catalogs and maintenance/export statements. Normal `research_history` remains usable afterward, source bytes/fingerprint remain exact and no export artifact exists.

### Result Handle / cursor ownership

- Result lookup is `(research_run_id, result_handle)` scoped.
- Result creation requires a source Job in the same Run.
- Paging resolves the scoped Result before immutable rows.
- Cursors bind the exact Result Handle and reject cross-handle/out-of-range use.
- Restart paging and cross-run/cross-handle rejection are green.
- `H-11.7-005` treats Results owned by still-`RUNNING` Jobs as provisional during restart.

### MCP / local-process boundary

```text
actual MCP transport JSON schema
→ bounded strict inputs
→ thin registry translation
→ exact caller-supplied logical IDs
→ Research Domain / ledger run + phase authorization
```

`tests/service/research-mcp-adversarial-authority-boundary.test.mjs` proves real MCP rejects missing/extra/wrong-type authority fields before Domain and forwards valid IDs unchanged. `tests/service/research-mcp-transport-hardening.test.mjs` proves transport ceilings reject oversized Research SQL / Query Artifact SQL and over-wide Experiment references before Domain while arbitrary exception message/path/code material does not cross the MCP result boundary. `tests/service/research-mcp-stdio-adversarial.test.mjs` proves malformed framing, EOF and SIGTERM behavior against the real stdio process without private diagnostic leakage.

### Resource/output boundary

```text
DuckDB CPU/RAM/temp-disk ceilings
→ Research-only bounded Scanner streaming
→ hard Result-Ledger row/byte ceilings before full JS materialization
→ managed hierarchical request/job/run/server budget charge
→ durable Result publication
```

Normal Scanner/Backtest execution keeps its existing `runAndReadAll()` behavior because bounded streaming is opt-in. Research SQL alone passes the existing Result Ledger hard caps into Scanner execution. Overflow fails closed with stable `RESEARCH_BUDGET_EXCEEDED`; durable managed budgets and Result Ledger validation remain independent backstops. Research SQL cancellation remains on the existing session `interrupt()` + active-execution drain path.

## Fixed findings

### H-11.7-001 — concurrent Holdout calls could execute sealed authority twice

**Severity:** blocking correctness/methodology defect — fixed.

**Root cause:** durable uniqueness protected publication only after external sealed execution, so concurrent same-Finalist callers could both execute before one publication won.

**Fix / proof:** `cee44fddd3e974a8b901475b00aff7415e29d772` adds exact `(researchRunId, finalistSetId)` process-local single-flight in `openResearchDomain()`. `tests/service/research-holdout-concurrency-hardening.test.mjs` proves only one `executeExperimentBatch` entry while both callers receive the same outcome.

**Green:** Fast `#965`, Planning `#1161`, Workload `#551`.

### H-11.7-002 — crash after sealed Holdout compute could consume the same Finalist again

**Severity:** blocking correctness/methodology defect — fixed.

**Root cause:** one-shot consumption uncertainty was persisted only after sealed compute. Crash before publication left no durable evidence that Holdout may already have been consumed.

**RED:** `21213326a5330d19e8b9f302d728472472ee9777`; Fast `#969` failed only the restart regression.

**Fix:** `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` adds Holdout schema v2 `holdout_execution_claims`, claimed before sealed compute and completed transactionally with the Holdout evaluation. An unfinished claim fails closed. `acd4d8ea8448591b3073be099c9c310c506905ed` proves transactional v1→v2 migration.

**Green:** Fast `#970/#971`, Planning `#1166/#1167`, Workload `#556/#557`.

### H-11.7-003 — Finalist could inherit Validation support from a superseded plan

**Severity:** blocking correctness/methodology defect — fixed.

**Root cause:** Domain prechecked Validation support before the final durable Finalist lock. A newer Evidence Plan could become current between the precheck and ledger publication.

**RED:** `33e8c918ab30a854eea1a9431607355412a3f096`; Fast `#973` failed only the stale-plan regression.

**Fix:** `8f4eab236a244d0aeba66a7ac33491f978156ca4` adds final ledger-local revalidation against the exact current Objective, current-plan Validation partition, Query Artifact ID, SQL hash and Scanner contract version before Finalist publication.

**Green:** Fast `#974`, Planning `#1170`, Workload `#560`.

### H-11.7-004 — late cancellation could split Result and Job terminal truth

**Severity:** blocking correctness/failure-hardening defect — fixed.

**Root cause:** durable Result creation occurred while the managed Job was still cancellable; the non-cancellable success-finalization owner was claimed too late.

**RED:** corrected proof `2dd97516f147a01262967f06b935fd93631fba42`; Fast `#977` failed only the late-cancel regression.

**Fix:** shared serialized `beginSuccessCommit` plus explicit entry immediately before `createResult` in both managed Development Experiment and Research SQL publishers; complete candidate `2e5496c90b05da5e2115fbaa47fddf5057f44e20`.

**Green:** Fast `#979`, Planning `#1175`, Workload `#565`.

### H-11.7-005 — crash after Result commit could leave a FAILED Job with a readable Result

**Severity:** blocking correctness/failure-hardening defect — fixed.

**Root cause:** Result commit and `Job = SUCCEEDED` are separate durable transactions. Startup reconciliation previously failed stale `RUNNING` Jobs without deciding the authority of already-committed Results/handles.

**RED:** `245aa0b8edd05761b52df66d751ff17bed4a06cd`; Fast `#982` failed only the restart Result regression.

**Fix:** `62152ccf835da6b00cc8d1f595527ab889d89e2a` transactionally removes Results owned by still-`RUNNING` Jobs, clears only their result handles, then marks those Jobs interrupted/failed. `9088c6cb92ba99c51c3c1c957b4e64aa62916cb3` expands proof to persisted handles and a `SUCCEEDED` control.

**Green:** Fast `#984`, Planning `#1180`, Workload `#570`.

### H-11.7-006 — `pg_settings` relation exposed sandbox configuration

**Severity:** blocking security/data-boundary defect — fixed.

**Root cause:** Research admission denied configuration functions such as `duckdb_settings()` and `current_setting(...)`, but DuckDB also exposes PostgreSQL-compatible `pg_settings` as a relation. The shared lexer identified function calls, not relation references.

**RED:** `43616e0a3ba677d2b506cab9fbf82e62244b4a91`; Fast `#986` passed unit `301/301`, failed service `307/308`, only the plain/qualified/quoted `pg_settings` forms unexpectedly executed.

**Fix:** `1da53186a84d8675bfd51ef7ba7969c66c6ef10e` exposes normalized lexical identifiers; `ada298fc3318b225d85edb59127a16dd64a1895f` adds one Research-only forbidden identifier, `pg_settings`; `4a8132506900266506bd049bddb467c65720cc7a` adds unit proof.

**Green:** Fast `#989` unit `302/302`, service `308/308`; Planning `#1185`, Workload `#575`, Replay `#137`, Browser `#599`.

### H-11.7-007 — MCP accepted oversized bounded Research inputs before Domain authority

**Severity:** blocking transport/resource-boundary defect — fixed.

**Root cause:** actual MCP registration used strict JSON schemas, but Query Artifact `sqlText`, managed Research SQL `sql`, and `experimentIds` omitted transport ceilings already enforced by Domain/session authority.

**RED:** `d02b5e38766055bf25c31b8042d89957e0c63c38`; Fast `#995` passed unit `302/302`, failed service `309/310` only because oversized Query Artifact SQL reached Domain. Planning `#1191`, Workload `#581`, Replay `#143`, Browser `#605` stayed green.

**Fix:** `059880be0c5e18de31b293cfac679891f46122d2` adds narrow transport registration ceilings: SQL strings cap at 1 MiB characters and managed `experimentIds` caps at 20. Domain remains the exact UTF-8 byte/semantic authority.

**Green:** Fast `#996`, Planning `#1192`, Workload `#582`, Replay `#144`, Browser `#606`; subsequent documentation head Fast `#997`, Planning `#1193`, Workload `#583`, Replay `#145`, Browser `#607` also green.

### H-11.7-008 — durable Job progress could persist an unstable failure code

**Severity:** blocking public-safe diagnostics/contract defect — fixed.

**Root cause:** terminal `research_jobs.error_code` and synchronous MCP/stdio errors already used the stable `[A-Z][A-Z0-9_]{0,127}` contract, but `progress_json` was generic JSON. `managed-domain-core` copied `error.code` into nested `progress.failure.code`, allowing a non-contract diagnostic code to survive persistence and appear through Domain/MCP reads.

**RED:** `d6b51676378c59b0c71df5153563b555a8323df2` adds `tests/service/research-job-diagnostics-hardening.test.mjs`. Fast `#999` passed unit `302/302`, failed service `312/313` only on the new regression. The injected private bearer value had already been redacted, but the durable nested code was still the unstable `Authorization: ***` instead of `RESEARCH_JOB_FAILED`. Planning `#1195`, Workload `#585`, Replay `#147`, Browser `#609` remained green.

**Fix:** `de34b2b6ab934593537a5178e7dce56ec2bdb7c7` hardens the shared Job-ledger wrapper before persistence: nested `progress.failure.code` is preserved only when it matches the existing stable error-code contract; otherwise it becomes `RESEARCH_JOB_FAILED`. No schema change or new diagnostics subsystem was introduced.

**Green:** Fast `#1000` passed unit `302/302`, service `313/313`, the H-008 Domain+MCP regression, the pre-existing `stable work failures are persisted instead of being collapsed to RESEARCH_JOB_FAILED` proof, all stdio/transport hardening tests and order acceptance. Planning `#1196`, Workload `#586`, Replay `#148`, Browser `#610` are green.

**Analogous review:** synchronous MCP failures, stdio diagnostics and top-level Job error codes already share the stable-code policy. H-008 closes the inconsistent nested durable progress surface while the legacy stable-code test proves legitimate codes are still retained.

### H-11.7-009 — Research SQL output budget was enforced after full JS materialization

**Severity:** blocking resource-boundary defect — fixed.

**Root cause:** managed Research SQL executed through the shared Scanner with `prepared.runAndReadAll()` / `getRowsJson()`, then converted/serialized the complete result, and only afterward consumed `resultRows` / `resultBytes` managed budgets. DuckDB CPU/RAM/temp-disk ceilings bounded the engine, and Result Ledger limits prevented oversized publication, but a hostile analytical SELECT could still force an unnecessarily large JS-side materialization before denial.

**RED:** `b81af194b15a1d035bfcb84cb0095828389d1dce` adds `tests/service/research-sql-materialization-hardening.test.mjs`. Fast `#1003` passed unit `302/302`, failed service `313/315` only on the two new row/byte materialization regressions. Both showed `runAndReadAll()` was used and streaming was not. Planning `#1199`, Workload `#589`, Replay `#151` stayed green.

**Fix:** `20585971acecc14ae544c20df3e2600e0f664712` adds an opt-in bounded Scanner execution path using DuckDB streaming and fails closed with stable `RESEARCH_BUDGET_EXCEEDED` before accumulating beyond the configured row/serialized-byte ceiling. `5d27e6c79cf399cea8418e2ba3f1a2591098a240` hardens the regression around that fail-closed contract. `852812f42793a54362b672aa9bbf74b1942b177d` wires Research SQL only to the existing Result Ledger hard limits (`maxResultRows` / `maxResultBytes`). Normal Scanner/Backtest remains on its existing path.

**Green:** candidate `852812f42793a54362b672aa9bbf74b1942b177d` passed Fast `#1007` unit `302/302`, service `315/315`, both H-009 tests and order acceptance; Planning `#1203`, Workload `#593`, Replay `#155`, Browser `#617` are green, including full Chromium + Local Fake acceptance.

**Analogous review:** managed hierarchical budgets and Result Ledger validation remain independent durable/publication backstops; existing SQL timeout, direct DuckDB interrupt and `session.close()` interrupt+drain proofs remain green with streaming enabled. No generic result subsystem was added.

## Composed duplicate / queue-pressure / cancellation proof

`tests/service/research-managed-duplicate-pressure-hardening.test.mjs` saturates one active Job and a queue capacity of exactly one, then races 32 identical `clientRequestId` submissions for the queued request. The proof requires one durable duplicate Job identity, one queued slot, no additional execution, successful queued cancellation, no delayed execution after capacity is released, and exact retry reuse after terminal cancellation.

Initial candidate `770380c6e98ed4c2f88a9691290e8f6e14de6782` / Fast `#1008` exposed a test-fixture race only: the Job legitimately becomes `RUNNING` before the injected execution seam is entered, so the fixture asserted `executionCount` too early. Existing resource/cancellation/idempotency tests stayed green and no product change was made.

Corrected proof `b90aba9e4ad2b8903b9b8a197486182c1b505942` waits for actual execution-seam entry. Fast `#1009` passed unit `302/302`, service `316/316`, the concurrent duplicate-pressure proof and order acceptance; Planning `#1205`, Workload `#595`, Replay `#157`, Browser `#619` are green. No additional product defect was found.

## Real stdio adversarial process proof

`2b701388fc224c027a40327ed6b65c3127bdb72b` adds `tests/service/research-mcp-stdio-adversarial.test.mjs` against the real `research-server/mcp-stdio.js` child process.

The proof covers:

1. malformed JSON-RPC framing carrying a private canary/path does not terminate or poison the process;
2. a subsequent valid initialize + `tools/list` succeeds;
3. EOF closes transport/domain and exits cleanly with code `0`, no signal death;
4. SIGTERM is handled by the product shutdown path and exits cleanly with code `0`, no signal death;
5. stdout/stderr never echo the private payload/path; any stderr diagnostic must be the fixed product prefix plus one stable code.

**Green:** Fast `#998` unit `302/302`, service `312/312`, order acceptance PASS; Planning `#1194`, Workload `#584`, Replay `#146`, Browser `#608`.

No additional production defect was found by the stdio process fuzz.

## Verification ledger

| Candidate | Verification | Result |
|---|---|---|
| `c74dc3e0c751eb112ca0b35cc6bc710ae2fef332` | merged-main Branch-11 gates through `11.6` | GREEN baseline |
| audit branch | Local shell checkout | UNAVAILABLE because this executor shell cannot resolve `github.com`; GitHub CI is executable proof |
| `cee44fddd3e974a8b901475b00aff7415e29d772` | Fast `#965`, Planning `#1161`, Workload `#551` | GREEN — H-001 |
| `21213326a5330d19e8b9f302d728472472ee9777` | Fast `#969` | RED-by-design — H-002 |
| `acd4d8ea8448591b3073be099c9c310c506905ed` | Fast `#971`, Planning `#1167`, Workload `#557` | GREEN — H-002 + migration |
| `33e8c918ab30a854eea1a9431607355412a3f096` | Fast `#973` | RED-by-design — H-003 |
| `8f4eab236a244d0aeba66a7ac33491f978156ca4` | Fast `#974`, Planning `#1170`, Workload `#560` | GREEN — H-003 |
| `2dd97516f147a01262967f06b935fd93631fba42` | Fast `#977` | RED-by-design — H-004 |
| `2e5496c90b05da5e2115fbaa47fddf5057f44e20` | Fast `#979`, Planning `#1175`, Workload `#565` | GREEN — H-004 |
| `245aa0b8edd05761b52df66d751ff17bed4a06cd` | Fast `#982` | RED-by-design — H-005 |
| `9088c6cb92ba99c51c3c1c957b4e64aa62916cb3` | Fast `#984`, Planning `#1180`, Workload `#570` | GREEN — H-005 |
| `43616e0a3ba677d2b506cab9fbf82e62244b4a91` | Fast `#986` | RED-by-design — H-006 |
| `4a8132506900266506bd049bddb467c65720cc7a` | Fast `#989`, Planning `#1185`, Workload `#575`, Replay `#137`, Browser `#599` | GREEN — H-006 |
| `d02b5e38766055bf25c31b8042d89957e0c63c38` | Fast `#995` | RED-by-design — H-007; other gates green |
| `059880be0c5e18de31b293cfac679891f46122d2` | Fast `#996`, Planning `#1192`, Workload `#582`, Replay `#144`, Browser `#606` | GREEN — H-007 |
| `2b701388fc224c027a40327ed6b65c3127bdb72b` | Fast `#998`, Planning `#1194`, Workload `#584`, Replay `#146`, Browser `#608` | GREEN — real stdio malformed/EOF/SIGTERM proof |
| `d6b51676378c59b0c71df5153563b555a8323df2` | Fast `#999` | RED-by-design — unit `302/302`, service `312/313`, only H-008 failed; Planning `#1195`, Workload `#585`, Replay `#147`, Browser `#609` green |
| `de34b2b6ab934593537a5178e7dce56ec2bdb7c7` | Fast `#1000`, Planning `#1196`, Workload `#586`, Replay `#148`, Browser `#610` | GREEN — unit `302/302`, service `313/313`, H-008 + stable-code compatibility + order acceptance PASS |
| `b81af194b15a1d035bfcb84cb0095828389d1dce` | Fast `#1003` | RED-by-design — unit `302/302`, service `313/315`, only H-009 row/byte pre-materialization proofs failed; Planning `#1199`, Workload `#589`, Replay `#151` green |
| `852812f42793a54362b672aa9bbf74b1942b177d` | Fast `#1007`, Planning `#1203`, Workload `#593`, Replay `#155`, Browser `#617` | GREEN — unit `302/302`, service `315/315`, H-009 + existing SQL resource/cancel proofs + order acceptance PASS |
| `770380c6e98ed4c2f88a9691290e8f6e14de6782` | Fast `#1008` | INVALID RED fixture — Job `RUNNING` transition preceded execution-seam entry; no product finding |
| `b90aba9e4ad2b8903b9b8a197486182c1b505942` | Fast `#1009`, Planning `#1205`, Workload `#595`, Replay `#157`, Browser `#619` | GREEN — unit `302/302`, service `316/316`, 32-way duplicate queue-pressure/cancellation proof + order acceptance PASS |
| PR `#108` | integration PR | DRAFT; do not merge while TREE `11.7` remains in progress |

## Current audit result

- Audit status: `IN PROGRESS`.
- `H-11.7-001` through `H-11.7-009`: fixed with deterministic proof and affected green verification.
- Every adversarial matrix area is now `REVIEWED`; no matrix row remains `OPEN`.
- SQL/source/host admission and source immutability are reclosed on composed hostile execution with exact before/after source proof.
- Cross-run/phase/MCP authority, Result Handle/cursor, transactionality, Validation/Holdout and local stdio lifecycle are reclosed with the dedicated TREE 11.7 proofs.
- Public-safe diagnostics are reclosed across MCP, stdio and durable Job progress.
- Resource bounds are `REVIEWED`: pre-materialization Research SQL output is hard-bounded, durable hierarchical budgets/growth limits remain green across restart, queue/readers remain bounded, exact retries are idempotent under 32-way concurrent queue pressure, queued cancellation remains responsive, and streaming preserves interrupt/drain behavior.
- Closure claim: none yet. The next step is the final TREE `11.7` success-evidence / diff reclosure against `.planning/PLAN.md`, including final PR review and required green verification before any `done`/merge transition.
- Next audit slice: none. Next work unit is final TREE `11.7` reclosure; do not advance to Chat 42 / `11.8` until that reclosure is green and merged according to execution truth.
