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
| Phase isolation | Development-only SQL, typed Validation/Holdout authority, MCP phase-shape rejection and cross-phase diagnostics are green. Error/side-channel cases remain with diagnostics review. | REVIEWED |
| Run/object ownership | Objective/query/evidence/partition/result/finalist/Holdout boundaries are run-scoped. `H-11.7-003` additionally binds Finalist support to the exact current plan Validation partition. | REVIEWED |
| Result handles / cursors | Run+handle scoping, handle-bound cursors and restart paging are green. `H-11.7-005` removes provisional Results/handles from interrupted Jobs while preserving `SUCCEEDED` authority. | REVIEWED |
| Jobs / idempotency | Durable request fingerprints/idempotency are baseline; `H-11.7-001` closes concurrent Holdout duplication; `H-11.7-005` closes interrupted Result publication. | REVIEWED |
| Cancellation / timeout | Queue/running/compute cancellation is green; `H-11.7-004` closes late cancel once Result publication starts; `H-11.7-005` closes crash/restart after provisional publication. Remaining responsiveness belongs to resource review. | REVIEWED |
| Ledger transactionality | `H-11.7-002` Holdout claim, `H-11.7-003` Finalist current-plan recheck, `H-11.7-004` success-commit boundary and `H-11.7-005` restart reconciliation cover representative composed publication/fault splits. | REVIEWED |
| Validation / Holdout | Concurrent/restart duplicate consumption and superseded-plan Finalist support are fail-closed. Contamination/error-side-channel cases remain with diagnostics review. | REVIEWED |
| MCP tool boundary | Real MCP schema rejects malformed/authority-shaping arguments and preserves exact logical IDs for Domain authorization. Oversized/error/lifecycle fuzz remains with transport review. | REVIEWED |
| Local transport / process | Pinned MCP v2 stdio lifecycle is baseline; actual process/transport adversarial closure remains. | OPEN |
| Public-safe diagnostics | Stable bounded public errors are baseline; representative invalid/security/internal failure surfaces remain. | OPEN |
| Source immutability | TREE 11.7 composed SQL-host corpus proves exact before/after source bytes + fingerprint and no export artifact. | REVIEWED |
| Resource bounds | CPU/RAM/temp/result/run budgets, paging and bounded queue/readers are baseline; adversarial growth/duplicate/cancellation responsiveness remains. | OPEN |

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

### MCP authority parity

```text
actual MCP transport JSON schema
→ thin registry translation
→ exact caller-supplied logical IDs
→ Research Domain / ledger run + phase authorization
```

`tests/service/research-mcp-adversarial-authority-boundary.test.mjs` proves real MCP rejects missing/extra/wrong-type authority fields before Domain and forwards valid IDs unchanged. No MCP/Domain authority bypass was found in that slice.

## Fixed finding H-11.7-001 — concurrent Holdout calls could execute sealed authority twice

**Severity:** blocking correctness/methodology defect — fixed.

**Root cause:** durable uniqueness protected publication only after external sealed execution, so concurrent same-Finalist callers could both execute before one publication won.

**Fix / proof:** `cee44fddd3e974a8b901475b00aff7415e29d772` adds exact `(researchRunId, finalistSetId)` process-local single-flight in `openResearchDomain()`. `tests/service/research-holdout-concurrency-hardening.test.mjs` proves only one `executeExperimentBatch` entry while both callers receive the same outcome.

**Green:** Fast `#965` / `38342962058`, Planning `#1161`, Workload `#551`.

**Analogous review:** MCP/managed Holdout routes share this Domain boundary; Development/Validation experiments are intentionally repeatable.

**Status:** FIXED / regression GREEN.

## Fixed finding H-11.7-002 — crash after sealed Holdout compute could consume the same Finalist again

**Severity:** blocking correctness/methodology defect — fixed.

**Root cause:** one-shot consumption uncertainty was persisted only after sealed compute. Crash before publication left no durable evidence that Holdout may already have been consumed.

**RED:** `21213326a5330d19e8b9f302d728472472ee9777`; Fast `#969` / `38343971596` failed only the restart regression; Planning `#1165` + Workload `#555` green.

**Fix:** `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` adds Holdout schema v2 `holdout_execution_claims`, claimed before sealed compute and completed transactionally with the Holdout evaluation. An unfinished claim fails closed with `RESEARCH_INTEGRITY_ERROR`. `acd4d8ea8448591b3073be099c9c310c506905ed` proves transactional v1→v2 migration.

**Green:** Fast `#970`, Planning `#1166`, Workload `#556`; migration candidate Fast `#971` unit `301/301`, service `304/304`, Planning `#1167`, Workload `#557`.

**Analogous review:** managed Jobs already persist execution lifecycle; Final Recommendation publishes terminal artifact/state transactionally. No generic claim subsystem was added.

**Status:** FIXED / RED→GREEN / migration GREEN.

## Fixed finding H-11.7-003 — Finalist could inherit Validation support from a superseded plan

**Severity:** blocking correctness/methodology defect — fixed.

**Root cause:** Domain prechecked Validation support before the final durable Finalist lock. A newer Evidence Plan could become current between the precheck and ledger publication.

**RED:** `33e8c918ab30a854eea1a9431607355412a3f096`; Fast `#973` / `38345191465`: unit `301/301`, service `304/305`, only the new stale-plan regression failed; Planning `#1169` + Workload `#559` green.

**Fix:** `8f4eab236a244d0aeba66a7ac33491f978156ca4` adds final ledger-local revalidation against the exact current Objective, current-plan Validation partition, Query Artifact ID, SQL hash and Scanner contract version before Finalist publication.

**Green:** Fast `#974` / `38345355839` unit `301/301`, service `305/305`, order acceptance PASS; Planning `#1170`, Workload `#560`.

**Analogous review:** Validation experiment completion is not Finalist support until durable Validation exposure exists; terminal recommendation publication is transactional.

**Status:** FIXED / RED→GREEN regression.

## Fixed finding H-11.7-004 — late cancellation could split Result and Job terminal truth

**Severity:** blocking correctness/failure-hardening defect — fixed.

**Root cause:** durable Result creation occurred while the managed Job was still cancellable; the non-cancellable success-finalization owner was claimed too late.

**Proof history:** `34266ce85ade5308b7450f89e5f3e33ce29007a2` was an invalid RED fixture. Corrected `2dd97516f147a01262967f06b935fd93631fba42` / Fast `#977` passed unit `301/301`, failed service `305/306` only because late cancellation still won. `45152a2da9841c14bec601bd19062a5134705d4e` was a useful RED intermediate proving the controller seam alone did not cover concrete publishers.

**Fix:** shared serialized `beginSuccessCommit` plus explicit entry immediately before `createResult` in both managed Development Experiment and Research SQL publishers; complete candidate `2e5496c90b05da5e2115fbaa47fddf5057f44e20`.

**Green:** Fast `#979` unit `301/301`, service `306/306`, legacy cancellation + order acceptance PASS; Planning `#1175`, Workload `#565`.

**Status:** FIXED / deterministic RED→GREEN regression.

## Fixed finding H-11.7-005 — crash after Result commit could leave a FAILED Job with a readable Result

**Severity:** blocking correctness/failure-hardening defect — fixed.

**Root cause:** Result commit and `Job = SUCCEEDED` are separate durable transactions. Startup reconciliation previously failed stale `RUNNING` Jobs without deciding the authority of already-committed Results/handles.

**RED:** `245aa0b8edd05761b52df66d751ff17bed4a06cd`; Fast `#982` unit `301/301`, service `306/307`, only the restart Result regression failed; Planning `#1178`, Workload `#568` green.

**Fix:** `62152ccf835da6b00cc8d1f595527ab889d89e2a` moves default startup reconciliation into the composed Job-ledger wrapper and transactionally deletes Results owned by still-`RUNNING` Jobs, clears only their `progress.resultHandles`, then marks those Jobs `FAILED / RESEARCH_JOB_INTERRUPTED`. `reconcileInterrupted:false` remains the active-work transient path. `9088c6cb92ba99c51c3c1c957b4e64aa62916cb3` expands proof to persisted handles and a `SUCCEEDED` control.

**Green:** Fast `#984` unit `301/301`, service `307/307`, prior cancellation/restart/idempotency + order acceptance PASS; Planning `#1180`, Workload `#570`.

**Analogous review:** managed Experiment and Research SQL share this Job/Result lifecycle; Holdout uses its separate durable execution claim; Final Recommendation already publishes terminal artifact + Run state transactionally.

**Status:** FIXED / deterministic RED→GREEN restart regression.

## Fixed finding H-11.7-006 — `pg_settings` relation exposed sandbox configuration

**Severity:** blocking security/data-boundary defect — fixed.

**Root cause:** Research admission denied configuration functions such as `duckdb_settings()` and `current_setting(...)`, but DuckDB also exposes PostgreSQL-compatible `pg_settings` as a relation. The shared lexer deliberately identified invoked functions, not relation references, so plain, qualified and quoted `pg_settings` remained valid `SELECT`s.

**RED:** `43616e0a3ba677d2b506cab9fbf82e62244b4a91` adds `tests/service/research-sql-host-source-hardening.test.mjs` through real `openResearchDomain()`. Fast `#986` / `38348341605` passed unit `301/301`, failed service `307/308`, with only three unexpected successes: `pg_settings`, `pg_catalog.pg_settings`, and the quoted equivalent. Planning `#1182`, Workload `#572` green. All other hostile forms rejected and exact source bytes/fingerprint stayed unchanged.

**Fix:** `1da53186a84d8675bfd51ef7ba7969c66c6ef10e` factors the existing Scanner lexical walk to expose normalized identifiers while preserving function-call behavior. `ada298fc3318b225d85edb59127a16dd64a1895f` adds one Research-only forbidden identifier: `pg_settings`. Existing stable `SCANNER_FORBIDDEN_FUNCTION` remains the public rejection contract; no SQL parser or broad catalog blacklist was added. `4a8132506900266506bd049bddb467c65720cc7a` adds unit proof for plain/qualified/quoted/comment-separated forms and inert strings/comments.

**Composed proof:** hostile queries also cover namespaced/quoted/comment-separated file readers, dynamic SQL, pragma/catalog helpers, metadata readers, implicit local/remote replacement scans, JSON reader aliases, detached `evidence.main.history`, `EXPORT DATABASE`, `CHECKPOINT` and `VACUUM`. Afterward a normal Research query still works, exact source bytes/fingerprint are unchanged and no export artifact exists.

**Green:** Fast `#989` / `38348633907` unit `302/302`, service `308/308`, H-006 unit + composed host/source proof + prior Research SQL proofs + order acceptance PASS. Shared-lexer affected verification: Planning `#1185`, Workload `#575`, Replay `#137`, Browser `#599` — all green.

**Analogous review:** safe `information_schema` introspection remains available. Existing dangerous catalog/config functions remain denied. Implicit scans and `read_json_objects` / `read_ndjson_objects` are additionally contained by locked `enable_external_access=false`, so no redundant policy layer was added.

**Status:** FIXED / deterministic RED→GREEN / Browser+Replay affected verification GREEN.

## Verification ledger

| Candidate | Verification | Result |
|---|---|---|
| `c74dc3e0c751eb112ca0b35cc6bc710ae2fef332` | merged-main Branch-11 gates through `11.6` | GREEN baseline |
| audit branch | Local shell checkout | UNAVAILABLE because this executor shell cannot resolve `github.com`; GitHub CI is executable proof |
| `cee44fddd3e974a8b901475b00aff7415e29d772` | Fast `#965`, Planning `#1161`, Workload `#551` | GREEN — H-001 |
| `bbed659218c4b485c6c2d2918e77ea1789f494fc` | Fast `#967`, Planning `#1163`, Workload `#553` | GREEN — real MCP authority proof |
| `21213326a5330d19e8b9f302d728472472ee9777` | Fast `#969` | RED-by-design H-002; Planning `#1165`, Workload `#555` green |
| `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` | Fast `#970`, Planning `#1166`, Workload `#556` | GREEN — H-002 |
| `acd4d8ea8448591b3073be099c9c310c506905ed` | Fast `#971`, Planning `#1167`, Workload `#557` | GREEN — Holdout migration |
| `33e8c918ab30a854eea1a9431607355412a3f096` | Fast `#973` | RED-by-design H-003; Planning `#1169`, Workload `#559` green |
| `8f4eab236a244d0aeba66a7ac33491f978156ca4` | Fast `#974`, Planning `#1170`, Workload `#560` | GREEN — H-003 |
| `2dd97516f147a01262967f06b935fd93631fba42` | Fast `#977` | RED-by-design H-004; Planning `#1173`, Workload `#563` green |
| `2e5496c90b05da5e2115fbaa47fddf5057f44e20` | Fast `#979`, Planning `#1175`, Workload `#565` | GREEN — H-004 |
| `245aa0b8edd05761b52df66d751ff17bed4a06cd` | Fast `#982` | RED-by-design H-005; Planning `#1178`, Workload `#568` green |
| `9088c6cb92ba99c51c3c1c957b4e64aa62916cb3` | Fast `#984`, Planning `#1180`, Workload `#570` | GREEN — H-005 |
| `43616e0a3ba677d2b506cab9fbf82e62244b4a91` | Fast `#986` / `38348341605` | RED-by-design — unit `301/301`, service `307/308`, only H-006 failed; Planning `#1182`, Workload `#572` green |
| `4a8132506900266506bd049bddb467c65720cc7a` | Fast `#989` / `38348633907` | GREEN — unit `302/302`, service `308/308`, H-006 + source immutability + order acceptance PASS |
| `4a8132506900266506bd049bddb467c65720cc7a` | Planning `#1185`, Workload `#575`, Replay `#137`, Browser `#599` | GREEN — affected shared-lexer verification |
| PR `#108` | integration PR | DRAFT; do not merge while TREE `11.7` remains in progress |

## Current audit result

- Audit status: `IN PROGRESS`.
- `H-11.7-001` through `H-11.7-006`: fixed with deterministic proof and affected green verification.
- SQL statement admission, SQL host access, source selection/attachment and source immutability are `REVIEWED` on a real Domain-composed hostile corpus with exact before/after source proof.
- Cross-run / phase / MCP parity: no material bypass found in reviewed slices.
- Result Handle/cursor, cancellation/timeout and ledger transactionality are `REVIEWED` with the H-004/H-005 restart/publication proofs green.
- MCP boundary remains `REVIEWED`, not closed: oversized/error/lifecycle fuzz is grouped with the remaining transport/diagnostic slice.
- Validation/Holdout remains `REVIEWED`, not closed: duplicate consumption and stale-plan Finalist support are fail-closed; contamination/error-side-channel cases remain for diagnostics review.
- Closure claim: none. Local transport/process, public-safe diagnostics and resource-bound attacks remain before TREE `11.7` can be marked done.
- Next audit slice: composed diagnostics + local transport/process adversarial review, including MCP oversized/error/lifecycle behavior and public-safe failure surfaces; after that, resource-bound/growth/cancellation responsiveness attacks. Any material finding remains with Chat 41 through RCA, fix, regression and green verification.
