# Market Flow US Planning Reviews

This file records the current review truth. Older implementation evidence remains valid where preserved by STATUS/EXECUTION. Later review entries supersede conflicting conclusions in earlier planning reviews.

## Historical U.S. planning / execution reviews

The original U.S. migration reviews established the completed implementation through TREE `7.3`: provider acquisition, schema-v3 authority, trusted reads, Scanner, Fake Market/runtime, diagnostics, workload tooling, deterministic local acceptance and release cleanup.

The Demo Buy + AI Investigation replan later extended market schema to v4 and completed implementation through `7.5`.

Those completed leaves remain historical green evidence and are not reopened by branch `8`.

## R-US-EXEC-REOPEN-006 — Comprehensive Demo Buy + AI Investigation re-audit

**Result:** PASS AFTER CORRECTIONS; historically authoritative for branches `1`–`7`.

The re-audit corrected selection/dedupe semantics, writer/cycle authority, bounded Scanner provenance, lost-ACK handling, wall-clock anomalies, targeted refresh, Auto/Stop operability, AI anti-hindsight evidence, sharing-safe export projection, new-day lifecycle, TREE structure/allocation and final release routing.

## R-US-DEMO-BUY-FINAL — Five-pass Demo Buy + AI Investigation Planning Review

**Result:** PASS AFTER CORRECTIONS.

The formal passes closed product semantics, data/schema, protocol/concurrency/failure semantics, UX/operability, S&T necessity/sufficiency/KISS, tests, allocation, handoff and Planning CI for the 39-node / 28-leaf pre-IBKR plan.

## R-US-DEMO-BUY-EXTERNAL — External-user-from-zero Demo Buy/AI review

**Result:** PASS AFTER CORRECTIONS.

The external walkthrough found and corrected two final defects:

1. `resultRank` is returned position, not semantic ranking without deterministic SQL ordering;
2. AI Investigation exports a sharing-safe projection rather than raw local operational/session fields.

Durable decisions `D-US-032` and `D-US-033` own these corrections.

---

# Branch 8 — Standalone IBKR Order Service Replan

## R-US-IBKR-ORDER-OPEN — Replan opened before final 7.4 acceptance

**Result:** REOPENED; IMPLEMENTATION UNAUTHORIZED.

The user requested a standalone Node.js BUY/SELL service for Interactive Brokers while the account does not yet have trading permission. Final target-machine/provider acceptance `7.4` had begun but was not complete.

Correct response:

```text
preserve completed branches 1–7 evidence
→ block/not-done 7.4
→ reopen smallest affected planning area
→ define isolated branch 8
→ re-close deterministically
→ resume 7.4 on the new candidate
```

The old candidate is historical after branch-8 implementation starts and may not silently remain final-candidate authority.

## Review 1 — Product boundary / user intent

**Result:** PASS AFTER ALIGNMENT.

Required user outcome:

```text
build execution capability now
→ run safely without trading permission
→ later enable real permission without rewriting core lifecycle
→ integrate with the central system only in a later explicit project
```

Corrections/decisions:

- branch `8` is a separate local execution sidecar;
- Scanner, Demo Buy, AI Investigation and Current gain no automatic order authority;
- initial scope is deliberately narrow: U.S. `STK`, `USD`, `SMART`, BUY/SELL, LMT/MKT, DAY/GTC;
- no short-opening, options/futures/FX, bracket/OCA/algo, leverage engine or portfolio strategy subsystem;
- actual live submission may remain `PENDING_EXTERNAL_PERMISSION` without blocking permission-independent software completion.

The boundary is owned by `docs/IBKR_ORDER_SERVICE.md` and `D-US-034`, `D-US-038`, `D-US-039`.

## Review 2 — Provider / lifecycle contract

**Result:** PASS AFTER ALIGNMENT.

The initial individual-account path uses the first-party Client Portal Web API through Client Portal Gateway.

Manual browser/gateway authentication remains user-owned. The service never automates credential login or bypasses IBKR permissions/confirmation requirements.

The planned adapter owns:

```text
auth status / session init
→ accounts
→ instrument resolution
→ market-data snapshot prerequisite
→ what-if
→ submit
→ reply-required confirmation
→ open-order/trade reconciliation
→ cancel
→ tickle/keepalive
```

Provider uncertainty is explicit:

- pre-submit failure may be conclusively rejected;
- transport loss after possible submit becomes `ACKNOWLEDGEMENT_UNKNOWN`;
- acknowledgement-unknown never triggers blind resubmit;
- reconciliation precedes any later explicit retry decision;
- unknown provider reply questions fail closed.

## Review 3 — Localhost security / privacy threat model

**Result:** PASS AFTER MATERIAL CORRECTION.

Initial planning treated loopback binding as sufficient isolation. External security review rejected that assumption because browser content can attempt requests to localhost.

Correction:

```text
127.0.0.1:8770 only
+ high-entropy per-run local caller token
+ protected reads and mutations require token
+ browser Origin rejected by default
+ no wildcard/credentialed CORS
+ bounded JSON-only mutations
+ unauthorized request performs zero provider calls/state mutation
```

`GET /health` may be unauthenticated only when strictly non-sensitive.

The caller token is never hard-coded, committed, persisted, logged, reported or sent to IBKR and is invalidated on process exit.

Provider account identity may exist in memory only while required for provider calls; it is never persisted/reported.

Credentials, cookies/session tokens, private browser state and raw authenticated provider dumps remain forbidden from repo/persistence/diagnostics.

Any CPGW localhost TLS exception must be scoped to the CPGW client only; process-global TLS disable is forbidden.

`docs/IBKR_ORDER_SERVICE_SECURITY.md` and `D-US-036` own this correction.

## Review 4 — Local authority / idempotency / failure safety

**Result:** PASS.

`DRY_RUN` is the default and must be structurally incapable of calling provider submit.

LIVE requires independent gates:

```text
local caller authorization
process LIVE-enabled
request LIVE
brokerage session
tradable runtime account
provider permission
unambiguous instrument
snapshot preflight
successful what-if
local validation
SELL position coverage
```

No gate may degrade to a warning/bypass.

`requestId` is mandatory:

```text
same requestId + same normalized intent → reuse/reconcile
same requestId + different normalized intent → reject
```

Use the smallest separate DuckDB store for restart-safe idempotency/reconciliation. Do not add order state to the day-bounded market DB.

Persist only product execution facts; never persist provider account/authentication/caller-token/raw authenticated state.

The no-short-opening SELL guard fails closed when long-position authority is insufficient/unavailable/ambiguous.

## Review 5 — Verification / synthetic provider / no fabricated evidence

**Result:** PASS.

Permission-independent proof is deterministic and public-safe.

One configurable fake IBKR adapter/gateway covers:

```text
disconnected / unauthenticated / authenticated
accounts empty/non-empty
instrument exact/missing/ambiguous
snapshot preflight
what-if success/rejection
BUY/SELL translation
submit success
reply-required confirmation success/rejection
unknown reply fail-closed
provider failure before submit
transport loss after submit
reconciliation
cancel
partial/full fill
session timeout/keepalive
SELL long-position guard
caller auth/origin rejection
restart-safe idempotency
```

All fixtures use synthetic identities.

Deterministic fake-LIVE proof establishes software lifecycle correctness but is never represented as real-money success.

Actual order submission remains an independent external-permission evidence family.

## Review 6 — S&T necessity / sufficiency / KISS

**Result:** PASS.

### Structural result

```text
root capability branches: 8
TREE nodes:              44
implementation leaves:   32
new leaves:              8.1, 8.2, 8.3, 8.4
final leaf after branch 8: 7.4
```

### Necessity

Each new leaf owns a distinct responsibility:

- `8.1` — safe local service, normalized intent, caller security, DRY_RUN, persistence/idempotency;
- `8.2` — real CPGW adapter, LIVE gates, reply/cancel/fills/reconciliation/SELL guard;
- `8.3` — operator packaging, deterministic standalone acceptance and stable future-integration boundary;
- `8.4` — deterministic reclosure and new exact candidate truth.

Merging any pair would make the work unit materially too broad or mix implementation with release closure. Splitting further would create technical-action leaves rather than meaningful capability leaves.

### Sufficiency

Outside-in path is fully owned:

```text
start standalone service safely
→ authenticate local caller
→ validate normalized order intent
→ preview in DRY_RUN
→ persist/replay requestId safely
→ restart safely
→ diagnose CPGW/session/account/instrument/permission
→ what-if
→ explicit LIVE submission only when all gates pass
→ handle provider reply
→ reconcile uncertain acknowledgement
→ cancel / observe partial/full fills
→ reject unsafe SELL
→ operate via Windows launcher
→ consume stable API later from central system
→ deterministic reclosure
→ resume final target-machine acceptance
```

### KISS

The plan reuses:

- Node 24/native ESM;
- existing DuckDB package;
- existing diagnosability pattern;
- existing repo CI/release discipline.

It does not create:

```text
Strategy Engine
automatic Scanner-to-order subsystem
portfolio/risk engine
cloud execution service
credential store
automated gateway login
new database technology
second market-data authority
```

The one new HTTP process/port and separate minimal execution DB are justified boundaries because execution safety/lifecycle must remain independent from the existing Viewer/market-data service.

## Review 7 — Allocation / dependency order / handoff

**Result:** PASS.

Final serial allocation:

```text
Chats 1–16: completed historical prefix through 7.5
Chat 17: 8.1
Chat 18: 8.2
Chat 19: 8.3
Chat 20: 8.4
Chat 21: 7.4
```

Dependencies:

```text
7.5 → 8.1 → 8.2 → 8.3 → 8.4 → 7.4
```

This corrects the temporary planning-reopen state where `7.4` was blocked before branch `8` existed. `7.4` is not done and is now reallocated only after reclosure.

`verify-handoff.mjs` remains sufficient and dynamic; no new allocation framework was introduced.

Planning CI is updated from seven branches / 39 nodes / 28 leaves to eight branches / 44 nodes / 32 leaves and explicitly checks branch-8 contracts/decisions/reviews.

## R-US-IBKR-ORDER-FINAL — Formal final branch-8 planning review

**Result:** PASS AFTER CORRECTIONS; IMPLEMENTATION STILL UNAUTHORIZED UNTIL PLANNING PR/MAIN GATES.

Whole-goal re-read found no unresolved contradiction after alignment of:

```text
.planning/GOAL.md
.planning/DECISIONS.md
.planning/TREE.yaml
.planning/EXECUTION.yaml
.planning/EXECUTOR_HANDOFF.md
.planning/STATUS.yaml
STATUS.yaml
docs/PRODUCT_REQUIREMENTS.md
docs/PRODUCT_SPEC.md
docs/TECHNICAL_SPEC.md
docs/TEST_STRATEGY.md
docs/IBKR_ORDER_SERVICE.md
docs/IBKR_ORDER_SERVICE_SECURITY.md
.github/workflows/planning-docs-ci.yml
```

`DATA_CONTRACT.md` is intentionally unchanged because provider market-data schema/authority is not changed by the isolated order sidecar.

The final plan has explicit owners for product intent, security/privacy, normalized intent, provider lifecycle, idempotency, reply/cancel/fills, uncertain acknowledgement, SELL safety, packaging, deterministic proof, external permission and final candidate reclosure.

## R-US-IBKR-ORDER-EXTERNAL — External-user-from-zero adversarial review

**Result:** PASS — READY TO FREEZE; IMPLEMENTATION STILL REQUIRES PLANNING PR MERGE + MAIN CI/OPEN-PR GATES.

The plan was walked again without relying on earlier review conclusions, from the perspective of a user who currently has an Interactive Israel/IBKR account but no trading permission.

Walkthrough:

```text
fresh checkout
→ start order service with no credentials in repo
→ understand DRY_RUN is default
→ authorize a local non-browser caller
→ create valid/invalid BUY and SELL intents
→ see preview/what-if result without submit
→ replay same request safely
→ restart without duplicate risk
→ authenticate CPGW manually
→ diagnose missing permission cleanly
→ later enable LIVE deliberately when permission exists
→ encounter provider confirmation
→ encounter transport loss after submit
→ reconcile before any possible resubmit
→ cancel/open/partial/fill state
→ reject attempted short opening
→ inspect sanitized diagnostics
→ stop/restart independently of Market Flow US
→ later integrate central system through the same API
```

### External negative-space challenge

No remaining material gap was found in:

```text
local browser-to-localhost threat
caller-token lifecycle
credential/account privacy
DRY_RUN accidental-submit prevention
LIVE double opt-in
provider permission/session/account failures
instrument ambiguity
snapshot/what-if prerequisites
idempotency
post-submit uncertainty
reply-required handling
cancel/fill semantics
SELL position safety
restart behavior
operator packaging
future integration seam
synthetic-vs-real evidence labeling
final candidate sequencing
```

### Final planning truth

```text
root capability branches: 8
TREE nodes:              44
implementation leaves:   32
implementation sequence: 8.1 → 8.2 → 8.3 → 8.4 → 7.4
actual live order proof: permission-dependent only
```

The plan may now be frozen. Production implementation remains unauthorized until the frozen planning PR is reviewed/squash-merged, main Planning Docs CI is green and open-PR state is clean. Only then may repository truth advance deliberately to `phase: implementation`, Chat 17 / TREE `8.1`.
