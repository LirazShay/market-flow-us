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
| Phase isolation | Can Development SQL or lower-phase APIs expose Validation/Holdout rows, outcomes, metadata or lineage? | Development-only SQL session and physically constructed Development projection; typed Validation/Holdout authority. | Cross-phase object substitution, phase-confused requests, error/provenance/schema/result side channels. | OPEN |
| Run/object ownership | Can IDs from another Research Run or Evidence Plan be replayed against reads/mutations? | Branch-11 domain/ledger ownership checks and fail-closed cross-run behavior. | Systematic cross-run matrix for run/objective/query/evidence/experiment/job/result/finalist/holdout/recommendation identities. | OPEN |
| Result handles / cursors | Can a handle/cursor be used cross-run, cross-result or after incompatible restart/phase state? | Stable paged Result Handles and bounded retrieval from `11.4`. | Swap handles/cursors, mutate paging parameters, restart between pages, attempt phase leakage and prove no recomputation/unauthorized rows. | OPEN |
| Jobs / idempotency | Can duplicate/conflicting requests create duplicate work or inconsistent durable authority? | Durable jobs, normalized request fingerprints, `clientRequestId`, bounded queue/readers. | Duplicate/conflict races across expensive SQL/experiment/validation/holdout operations and restart boundaries. | OPEN |
| Cancellation / timeout | Can cancelled/timed-out work later publish success/results or keep consuming authority/resources? | Native DuckDB interrupt, idempotent cancellation, finite SQL/queue/experiment ceilings. | Fault/race matrix around queue→run, run→finalize, cancel/timeout→restart and late completion callbacks. | OPEN |
| Ledger transactionality | Can crash/fault injection create half-created authoritative artifacts, exposures, finalists or recommendations? | Transaction-fault coverage, result-before-success ordering, transactional ledgers from `11.1`–`11.5`. | Inject failures at composed state transitions and verify rollback/reconciliation plus analogous transitions. | OPEN |
| Validation / Holdout | Can Holdout be evaluated twice, exposed early, reused after contamination or leaked through public views/errors? | Frozen Validation schedule, exposure accounting, immutable Finalist Set, one-shot Holdout, contamination rules, sealed public view. | Cross-run/finalist/objective substitution, duplicate/restart/fault cases, result/error/diagnostic side channels. | OPEN |
| MCP tool boundary | Can tool name/schema/arguments bypass Domain validation or expose non-public internals? | Strict 46-tool registry and thin mapping to managed Research Domain from `11.6`. | Fuzz unknown/malformed/oversized arguments, ID substitution, error mapping and authority parity against direct Domain calls. | OPEN |
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

This is baseline evidence only. TREE `11.7` still requires composed cross-run/phase/result/fault/restart/transport attacks and analogous-area review before the audit can pass.

## Verification ledger

| Candidate | Verification | Result |
|---|---|---|
| `c74dc3e0c751eb112ca0b35cc6bc710ae2fef332` | Prior merged-main Branch-11 gates through `11.6` | GREEN baseline from authoritative execution record |
| audit branch | Local shell checkout | UNAVAILABLE in this executor environment because the temporary shell cannot resolve `github.com`; do not substitute this for executable proof |
| audit branch | GitHub CI | PENDING until the first proof/fix candidate is committed/pushed |

## Current audit result

- Audit status: `IN PROGRESS`.
- Blocking defects discovered in this baseline slice: none yet.
- Closure claim: none; existing green tests are not treated as proof that the composed adversarial matrix is complete.
- Next audit slice: logical-ID/phase/Holdout/result-handle authorization and failure/restart composition, with deterministic regressions for every material gap found.
