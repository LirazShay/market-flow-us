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
| Source selection / attachment | Can caller-controlled IDs, paths, aliases, attachment syntax or projection failure reach/mutate original evidence? | Logical `sourceId`, read-only opener, source fingerprint verification and detached in-memory projection are baseline. Malformed/cross-run lineage, projection-fault and attachment/catalog escape corpus still required. | OPEN |
| SQL statement admission | Can multi-statement, DDL/DML, `ATTACH`, `COPY`, config, extension or secret operations pass as analytical SQL? | Existing adversarial corpus covers direct forms. Obfuscation/equivalent catalog/function cases still required after full runtime composition. | OPEN |
| SQL host access | Can file/network readers, dynamic SQL, environment/config/secret/catalog helpers or side-effecting functions access the host? | External access/extensions/secrets are disabled and dangerous helpers are denied. Qualified/quoted/comment/path-bearing equivalent attacks still required. | OPEN |
| Phase isolation | Can Development SQL or lower-phase APIs expose Validation/Holdout rows, outcomes, metadata or lineage? | Development-only SQL, typed Validation/Holdout authority, MCP phase-shape rejection and cross-phase diagnostics are green. Remaining side-channel/fault cases still required. | REVIEWED |
| Run/object ownership | Can IDs from another Research Run or Evidence Plan be replayed against reads/mutations? | Objective/query/evidence/partition/result/finalist/Holdout boundaries are run-scoped. No cross-run escape found. `H-11.7-003` additionally binds Finalist support to the exact current Evidence Plan Validation partition. | REVIEWED |
| Result handles / cursors | Can a handle/cursor be used cross-run, cross-result or after incompatible restart/phase state? | Result metadata is run+handle scoped; source Job must be same-run; cursor is handle-bound; restart paging is green. Remaining incompatible phase/state cases still required. | REVIEWED |
| Jobs / idempotency | Can duplicate/conflicting requests create duplicate work or inconsistent durable authority? | Durable jobs, request fingerprints, `clientRequestId`, queue/readers are baseline. Holdout concurrent duplicate execution is closed by `H-11.7-001`; further expensive-operation conflict races remain. | REVIEWED |
| Cancellation / timeout | Can cancelled/timed-out work later publish success/results or keep consuming authority/resources? | Existing queue/run/finalize cancellation and interrupt tests are green. More late-callback/finalization composition attacks remain. | OPEN |
| Ledger transactionality | Can crash/fault injection create half-created authoritative artifacts, exposures, finalists or recommendations? | Holdout pre-execution claim closes restart uncertainty (`H-11.7-002`). Finalist lock now revalidates exact current-plan Validation support (`H-11.7-003`). Remaining cancellation/finalize and representative transaction-fault composition still required. | OPEN |
| Validation / Holdout | Can Holdout be evaluated twice, exposed early, reused after contamination or leaked through public views/errors? | Same-process duplicate consumption is closed by `H-11.7-001`; restart duplicate consumption by `H-11.7-002`; superseded-plan Validation support by `H-11.7-003`. Contamination/side-channel/publication-fault attacks remain. | REVIEWED |
| MCP tool boundary | Can tool name/schema/arguments bypass Domain validation or expose non-public internals? | Real MCP schema rejects missing/extra/wrong-type authority fields and preserves valid IDs exactly for Domain authorization. Oversized/error-mapping/lifecycle fuzz remains. | REVIEWED |
| Local transport / process | Can transport accept unapproved network/origin/body/path exposure or leak lifecycle state? | Pinned MCP v2 stdio lifecycle is baseline. Actual stdio/process and absence/strictness of unintended local HTTP/browser research surfaces still require closure. | OPEN |
| Public-safe diagnostics | Can SQL, provider values, paths, secrets/config, stack traces or unbounded rows leak via errors/logs/artifacts? | Stable bounded public errors are baseline. Representative invalid/security/internal failure surfaces still require inspection. | OPEN |
| Source immutability | Can any hostile sequence mutate, repair, migrate or replace evidence? | Existing source-byte/fingerprint proofs are baseline. Full hostile corpus including failure/cancellation/restart still requires before/after proof. | OPEN |
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

The existing adversarial service proof already exercises broad analytical SELECTs plus direct file/network readers, `query/query_table`, environment/settings/catalog helpers, multi-statement input, DDL/DML, `ATTACH/DETACH`, `COPY`, `PRAGMA/SET/RESET`, extension and secret attempts, a discovered side-effecting function, hidden source/holdout relation names, and exact source-byte/fingerprint equality afterward. This remains baseline evidence, not TREE `11.7` closure.

### Result Handle / cursor ownership

The first composed ownership pass found no cross-run Result Handle escape:

- Result lookup requires both `research_run_id` and `result_handle`.
- Result creation requires the source Job under the same Research Run.
- Paging resolves the scoped Result Handle before immutable rows.
- Cursor payloads bind to the exact Result Handle and reject cross-handle/out-of-range use.
- Existing proof resumes a cursor after reopening and rejects cross-run/cross-handle substitution.

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

**Analogous review:** MCP and managed-domain Holdout routes delegate to the same Domain boundary. Development/Validation experiments are intentionally repeatable, while managed Development jobs already have durable idempotency authority. No second exact same-process one-shot sealed-evidence path was found.

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

**Smallest sufficient fix:** commit `8f4eab236a244d0aeba66a7ac33491f978156ca4` adds one ledger-local guard in `research-server/validation-ledger.js`. After resolving the latest Evidence Plan and candidate Query Artifacts, `createFinalistSet` now requires, for each candidate Query, a durable Validation exposure with the exact:

- current Objective Version;
- current plan's Validation partition;
- `queryArtifactId`;
- `sqlHash`;
- `scannerContractVersion`.

If exact support is absent it fails before freezing/inserting the Finalist. The existing Domain precheck remains defense-in-depth. No schema, public API or new subsystem was introduced.

**Why the fix closes the race:** the final Validation-ledger authority now derives the latest plan and proves support against that exact plan inside the same serialized ledger call that performs Finalist publication. A plan change can no longer occur between the correctness check and the durable lock through normal Domain composition.

**GREEN proof:** Fast `#974` / `38345355839` passed unit `301/301`, service `305/305`, the new `TREE 11.7 Finalist Set cannot inherit Validation support from a superseded Evidence Plan` regression, all prior hardening regressions and order acceptance. Planning `#1170` / `38345355825` and Workload `#560` / `38345355802` are green, including the Research cancellation/restart resource probe.

**Analogous-area review:** a completed Validation Experiment is not Finalist support until a durable Validation exposure exists, so a failure between experiment publication and exposure leaves no false support. Regular Final Recommendation writes the terminal recommendation artifact and Run `COMPLETED/FINALIZATION` transition in one transaction. Regular and insufficient-evidence terminal finalization are not legal simultaneously because their required authority states are mutually exclusive. Post-Holdout contamination is recomputed from immutable Query lineage and the durable Holdout baseline rather than relying only on a side-effect marker. No second exact stale-precheck→durable-lock defect was found in this slice.

**Status:** FIXED / RED→GREEN regression.

## Verification ledger

| Candidate | Verification | Result |
|---|---|---|
| `c74dc3e0c751eb112ca0b35cc6bc710ae2fef332` | Prior merged-main Branch-11 gates through `11.6` | GREEN baseline from authoritative execution record |
| audit branch | Local shell checkout | UNAVAILABLE in this executor environment because the temporary shell cannot resolve `github.com`; executable proof is taken from GitHub CI, not fabricated locally |
| `fdd8226fdcae4432270107be3278469300824733` | Holdout concurrency regression before fix | RED-by-design candidate |
| `cee44fddd3e974a8b901475b00aff7415e29d772` | Fast `#965`, Planning `#1161`, Workload `#551` | GREEN — H-001 regression PASS |
| `bbed659218c4b485c6c2d2918e77ea1789f494fc` | Fast `#967`, Planning `#1163`, Workload `#553` | GREEN — real MCP authority-boundary regression PASS |
| `21213326a5330d19e8b9f302d728472472ee9777` | Fast `#969` / `38343971596` | RED-by-design — only new crash/restart Holdout regression failed; Planning `#1165` + Workload `#555` green |
| `d5df2bc1e8d20c948d8bdc6d6e186ba638a8d840` | Fast `#970`, Planning `#1166`, Workload `#556` | GREEN — H-002 crash/restart regression PASS |
| `acd4d8ea8448591b3073be099c9c310c506905ed` | Fast `#971`, Planning `#1167`, Workload `#557` | GREEN — unit `301/301`, service `304/304`, Holdout v1→v2 migration PASS |
| `33e8c918ab30a854eea1a9431607355412a3f096` | Fast `#973` / `38345191465` | RED-by-design — unit `301/301`; service `304/305`; only H-003 Finalist-plan regression failed with missing expected rejection |
| `33e8c918ab30a854eea1a9431607355412a3f096` | Planning `#1169` + Workload `#559` | GREEN — red candidate isolated to the new correctness proof |
| `8f4eab236a244d0aeba66a7ac33491f978156ca4` | Fast `#974` / `38345355839` | GREEN — unit `301/301`, service `305/305`, H-003 regression PASS, prior hardening proofs PASS, order acceptance PASS |
| `8f4eab236a244d0aeba66a7ac33491f978156ca4` | Planning `#1170` + Workload `#560` | GREEN |
| PR `#108` | Audit integration PR | DRAFT; executable CI vehicle while TREE `11.7` remains in progress; do not merge yet |

## Current audit result

- Audit status: `IN PROGRESS`.
- `H-11.7-001`: fixed — concurrent same-authority Holdout execution is single-flight.
- `H-11.7-002`: fixed — crash/restart Holdout uncertainty is durably claimed and fails closed; migration proof is green.
- `H-11.7-003`: fixed — Finalist lock cannot inherit Validation support from a superseded Evidence Plan; exact current-plan support is enforced by the final ledger authority.
- Cross-run / phase / MCP parity: no material bypass found in reviewed slices.
- Result Handle/cursor first-pass ownership: no material cross-run defect found; incompatible restart/phase-state cases remain.
- MCP boundary remains `REVIEWED`, not closed: oversized/error-mapping/lifecycle fuzz remains.
- Ledger transactionality remains `OPEN`: the Holdout and Finalist defects are closed, while remaining cancellation/finalize and representative composed transaction-fault attacks still require closure.
- Validation/Holdout remains `REVIEWED`, not closed: duplicate consumption and stale-plan Finalist support are fail-closed; contamination/side-channel/publication-fault cases remain.
- Closure claim: none. SQL-host/source, remaining fault/cancellation, diagnostics, transport, source-immutability and resource attacks still remain before TREE `11.7` can be marked done.
- Next audit slice: cancellation/finalize late-completion races and remaining composed transaction faults, followed by the still-open SQL-host/source and diagnostic/resource matrix. Any material finding remains with Chat 41 through RCA, fix, regression and green verification.
