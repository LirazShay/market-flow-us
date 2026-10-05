# Market Flow US Planning Reviews

This file records the current review truth. Older implementation evidence remains valid where preserved by STATUS/EXECUTION, but any earlier planning review that conflicts with a later entry is superseded by the later entry.

## Historical U.S. planning / execution reviews

The original U.S. migration planning and execution reviews established and preserved the completed implementation through TREE `7.3`, including provider acquisition, schema-v3 authority, trusted reads, Scanner, Fake Market/runtime, diagnostics, workload tooling, deterministic local acceptance and release cleanup.

Those completed leaves remain historical green evidence and are not reopened by the Demo Buy replan.

The prior review **R-US-EXEC-REOPEN-005 — Demo Buy strategy-validation final review** originally froze a smaller Demo Buy plan with:

```text
36 TREE nodes
26 implementation leaves
no AI Investigation branch
older context bounds
no authority-watermark cycle constraint
no targeted observation refresh
```

That PASS is **superseded** by the comprehensive re-audit below and must not be used as current planning authority.

## R-US-EXEC-REOPEN-006 — Comprehensive Demo Buy + AI Investigation re-audit opened

**Result:** REOPENED; IMPLEMENTATION UNAUTHORIZED

The user requested a repeated full review of the feature planning, including the entire S&T tree and all reasoning layers, before local testing/implementation continued.

The plan was reopened under the FRAMEWORK execution-reopen contract:

```text
plan_state: active
replan_mode: execution_reopen
root phase: planning
no execution node in_progress
current Demo Buy implementation leaf blocked
completed historical leaves preserved
```

The re-audit discovered that the previous PASS was not sufficient. Material defects included duplicate-ID ownership ambiguity, missing signal-vs-capture provenance, missing Scanner interval/generation context, page/provenance transport ambiguity, unjustified heavy page sizing, capture lost-ACK ambiguity, wall-clock/authority confusion, overly large persisted Scanner context, missing long-running-Auto targeted refresh, missing global Auto operability, stale Scanner Stop UX, and Planning-CI/TREE parser drift.

## Review 1/5 — Product / user semantics

**Result:** PASS AFTER CORRECTIONS

Corrections:

- Top X is defined over source rows before dedupe; duplicates never backfill from later rows.
- Manual selection preserves original Scanner order rather than checkbox click order.
- Every retained item keeps original 1-based `resultRank`, including gaps.
- Signal/result-ready time is distinct from virtual-buy acceptance time.
- Active-generation provenance is immutable even when query draft/library state later changes.
- AI Investigation was added to the current pre-local-acceptance scope as a local forensic evidence workflow rather than an AI trading agent.

User journey after correction:

```text
Scanner generation
→ explicit/Auto virtual-buy observation
→ progressive trusted outcome inspection
→ optional forensic evidence pack
→ external AI proposes testable SQL hypotheses
→ human decides what to test
```

No real execution/fill/portfolio/liquidity scope was introduced.

## Review 2/5 — Data / schema / persistence

**Result:** PASS AFTER CORRECTIONS

Corrections:

- Schema v4 remains additive and stores only Demo Buy facts/provenance, not derived future outcomes.
- `result_rank` is original Scanner rank, not a dense selection rank.
- Capture stores immutable query ID/name/SQL, interval, result start/completion/count and bounded original Scanner context.
- Valid v3→v4 migration is transactional; suspicious partial-v3 Demo structures fail closed; migration failure leaves v3 usable.
- New Trading Day accepts valid v3 or v4, preserves saved queries only and always installs fresh v4.
- No new `history` index is added without measured evidence.
- Demo Buy page size is fixed at 50 items, not inherited 500-row History sizing.
- Full SQL/provenance is read on demand rather than repeated across item rows.

## Review 3/5 — Protocol / concurrency / failure / lifecycle

**Result:** PASS AFTER CORRECTIONS

Corrections:

### Capture acknowledgement

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

A capture that may have committed before transport loss is never called failed and is never blindly replayed.

### Writer/cycle authority watermark

`buy_cycle_id` is both exact baseline cycle and the capture-time market-authority watermark:

```text
prediction-time authority: cycle_id <= buy_cycle_id
post-capture authority:    cycle_id > buy_cycle_id
```

Every Demo Buy future-horizon read requires `cycle_id > buy_cycle_id` in addition to the target timestamp. AI Investigation uses the same partition, preventing later-committed evidence from leaking backward under misleading wall-clock timestamps.

### Wall-clock anomalies

Scanner/collection/capture wall-clock times are diagnostics only. Raw timestamps remain unchanged; negative derived duration/latency/age becomes null + bounded timing anomaly and never changes authority ordering.

### Capture/context bounds

Current authoritative bounds:

```text
unique items <= 5000
SQL <= 1 MiB UTF-8
context source rows <= 50
retained context columns <= 64 total
canonical identity column always retained
textual/serialized cell <= 128 UTF-8 bytes after deterministic clipping
serialized context <= 256 KiB UTF-8
```

The lower context bound is deliberate daily-storage protection for repeated Auto capture, not merely transport protection.

Node cross-checks selected item rank/identity against retained Top-50 context before commit.

### Export

AI pack uses one bounded export slot, product-owned temp-dir→atomic-rename publication, relative product path, no DB mutation and safe regeneration after lost export ACK.

## Review 4/5 — UX / operability

**Result:** PASS AFTER CORRECTIONS

Corrections:

- Auto mode has a persistent cross-surface indicator + direct Off action.
- Enabling/changing Auto affects only future successful Scanner generations; no retroactive capture.
- Turning Auto Off does not pretend to cancel an already-dispatched capture.
- Scanner gains a resumable `Stop recurring scan` action distinct from terminal Viewer destruction.
- Capture freezes the exact rendered Scanner generation before async submission.
- Selection controls never trigger row-to-Detail navigation accidentally.
- Auto status is bounded rather than an unbounded event log.
- Demo Buy is capture-grouped; capture-level provenance is not repeated per item.
- Ten horizons use one compact cell each with sticky identity/baseline columns.
- `NO_FUTURE_OBSERVATION` displays as Pending; non-temporal unavailable states remain warnings.
- `Refresh latest` resets first page; `Load more` continues the keyset walk.
- `demo.buy.observation.get(captureId, securityId)` + `Refresh observation` keep an older target inspectable while Auto adds newer captures.
- AI panel owns Generate/Regenerate, Partial/Complete/context coverage, relative path, Copy Prompt/Path and clipboard fallback.

## Review 5/5 — S&T / contracts / tests / CI / handoff

**Result:** PASS AFTER CORRECTIONS

Mechanical alignment was performed across:

```text
.planning/GOAL.md
.planning/DECISIONS.md
.planning/TREE.yaml
.planning/EXECUTION.yaml
.planning/EXECUTOR_HANDOFF.md
STATUS.yaml
.planning/STATUS.yaml
docs/PRODUCT_REQUIREMENTS.md
docs/PRODUCT_SPEC.md
docs/DATA_CONTRACT.md
docs/TECHNICAL_SPEC.md
docs/TEST_STRATEGY.md
docs/DEMO_BUY_VALIDATION.md
docs/DEMO_BUY_PROTOCOL_LIMITS.md
docs/DEMO_BUY_UX.md
docs/AI_INVESTIGATION_PACK.md
.github/workflows/planning-docs-ci.yml
```

Material corrections:

- TREE format was repaired to the double-quoted/inline-list form actually parsed by Planning CI and `verify-handoff.mjs`.
- Planning CI now requires all Demo Buy/AI contract files and checks schema v4, the five Demo Buy operations, watermark semantics, current protocol bounds, targeted refresh/Auto UX, 39-node/28-leaf structure and the current final-review marker.
- TEST_STRATEGY now owns explicit proof for every current bound, watermark/timing edge, lost ACK, Auto/Stop behavior, targeted observation refresh, AI export atomicity/path/clipboard behavior and v3/v4 new-day lifecycle.
- Durable decisions were consolidated through D-US-031 so no older contradictory numeric/authority wording remains current.
- Handoff routes each new leaf to the exact current contracts and forbids implementation before freeze/authorization.

### Structural S&T result

Current TREE:

```text
root capability branches: 7
TREE nodes:              39
implementation leaves:   28
one-child decompositions: 0
missing child refs:        0
leaf dependency cycles:    0
non-leaf dependencies:     0
```

New/current implementation leaves:

```text
4.3.1 schema v4 / persistence
4.3.2 capture authority / protocol
4.3.3 evaluation + page/provenance/targeted reads
4.4.1 Scanner capture/Auto/resumable Stop UX
4.4.2 Demo Buy progressive outcome UX
4.5.1 deterministic AI Investigation exporter
4.5.2 AI Investigation Viewer workflow
7.5   post-feature deterministic reclosure
7.4   final target-machine/authenticated acceptance
```

### Necessity challenge

PASS.

Removing any leaf loses a distinct necessary responsibility:

- schema lifecycle;
- writer-ordered capture authority;
- one trusted evaluation/read model;
- usable/controllable Scanner capture;
- inspectable progressive outcomes;
- reproducible forensic export;
- usable export interaction;
- post-feature release reclosure;
- external target-machine/provider acceptance.

No new leaf can be removed without leaving an explicit requirement unowned.

### Sufficiency / outside-in walkthrough

PASS.

Fresh-user path is completely owned:

```text
run/activate Scanner
→ receive exact generation
→ manually capture or arm future-generation Auto
→ capture exact writer-ordered baseline
→ inspect progressive outcomes
→ keep one observation refreshed while Auto continues
→ open provenance/SQL
→ generate partial/complete forensic pack
→ copy prompt/path with fallback
→ regenerate after later evidence
→ validate SQL hypotheses across observations
→ deterministic reclosure
→ final target-machine/provider acceptance
```

Failures/edges are explicitly owned: invalid identities, duplicate rows, context truncation/oversize, stale timing, clock regression, market-write races, unresolved baseline candidate, DB rollback, capture lost ACK, read failure, continuation failure, export write/rename failure, export lost ACK, restart and new-day rollover.

### KISS challenge

PASS.

The plan intentionally reuses the existing writer, Viewer WebSocket, DuckDB, Scanner scheduler/query library, trusted read connection, Fake Market/generator and diagnostics. It does **not** introduce:

```text
Strategy Engine
order/fill/portfolio subsystem
background horizon worker
materialized horizon columns
second DB or transport
cross-day strategy warehouse
capture replay/idempotency subsystem
AI provider/API-key integration
automatic AI SQL mutation
OS file-manager integration
```

### Allocation review

PASS.

Every one of the 28 leaves is allocated exactly once and dependency order is valid:

```text
Chat 10: 4.3.1 → 4.3.2
Chat 11: 4.3.3
Chat 12: 4.4.1
Chat 13: 4.4.2
Chat 14: 4.5.1
Chat 15: 4.5.2
Chat 16: 7.5
Chat 17: 7.4
```

Completed historical nodes remain a contiguous done prefix. During planning reopen `4.3.1` is blocked and later new leaves are pending; no node is in progress.

## R-US-DEMO-BUY-FINAL — Final Demo Buy + AI Investigation Planning Review

**Result:** PASS — PLAN READY TO FREEZE; IMPLEMENTATION AUTHORIZATION STILL REQUIRES PLANNING CI/MERGE GATE

A final fresh pass was performed over product intent, data/schema, protocol/concurrency/failure semantics, UX/operability, S&T necessity/sufficiency/KISS, tests, allocation, handoff and Planning CI.

No remaining material planning ambiguity was found after the corrections above.

Current durable invariants are mutually consistent:

```text
identity                  = validated securityId / security_id
virtual-buy authority     = serialized capture + buy_cycle_id watermark
horizon anchor            = captured_at_ms + H
post-capture row          = cycle_id > buy_cycle_id AND collected_at_ms >= target
capture dedupe            = browser first occurrence; Node requires unique payload
capture context           = first 50 rows / <=64 retained cols / identity mandatory / <=256 KiB
page size                 = 50 items
progressive single refresh= demo.buy.observation.get
capture lost ACK          = ACKNOWLEDGEMENT_UNKNOWN, never blind replay
AI evidence pre/post      = same buy_cycle_id authority watermark
AI export                 = local/atomic/relative-path/non-mutating
new day                   = valid v3/v4 source → fresh v4, saved queries only
```

### Freeze decision

PASS.

The plan may be frozen now. However, production implementation remains unauthorized until the planning branch/PR passes required Planning Docs CI and repository merge workflow and root STATUS is deliberately advanced to `phase: implementation` with `implementation_authorized: true`.

If CI is still unavailable, safe repository truth is:

```text
plan_state: frozen
phase: planning
implementation_authorized: false
current implementation leaf remains blocked
```

This is a completed plan waiting on the required verification/merge gate, not permission to code.
