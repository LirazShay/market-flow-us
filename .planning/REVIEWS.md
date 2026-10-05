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
- `result_rank` stores original Scanner returned position, not a dense selection position; later external review further clarified that returned position is not semantic rank by itself.
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

Node cross-checks selected item returned-position/identity against retained Top-50 context before commit.

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
- Planning CI requires all Demo Buy/AI contract files and checks schema v4, the five Demo Buy operations, watermark semantics, current protocol bounds, targeted refresh/Auto UX, 39-node/28-leaf structure and current review markers.
- TEST_STRATEGY owns explicit proof for every current bound, watermark/timing edge, lost ACK, Auto/Stop behavior, targeted observation refresh, AI export atomicity/path/clipboard behavior and v3/v4 new-day lifecycle.
- Durable decisions were consolidated so no older contradictory numeric/authority wording remains current.
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

PASS after the later external-user corrections recorded below.

Fresh-user path is owned:

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

## R-US-DEMO-BUY-FINAL — Five-pass Demo Buy + AI Investigation Planning Review

**Result:** PASS AFTER CORRECTIONS; SUBSEQUENT EXTERNAL REVIEW REQUIRED AND RECORDED BELOW

The five formal passes closed product intent, data/schema, protocol/concurrency/failure semantics, UX/operability, S&T necessity/sufficiency/KISS, tests, allocation, handoff and Planning CI. They established the 39-node / 28-leaf plan and the core Demo Buy + AI Investigation architecture.

The user then explicitly required a separate outside user-from-zero review. That review found two additional material interpretation/sharing defects, so this five-pass PASS is not the final authority by itself.

## R-US-DEMO-BUY-EXTERNAL — Final external-user-from-zero adversarial review

**Result:** PASS AFTER TWO MATERIAL CORRECTIONS — READY TO RE-FREEZE; IMPLEMENTATION STILL REQUIRES PR/MAIN GATES

The complete feature was walked again as if by an external user with no reliance on the earlier review conclusions:

```text
Scanner query/result
→ Selected / All / Top X / Auto capture
→ virtual-buy authority
→ progressive outcomes
→ old-observation targeted refresh
→ provenance inspection
→ AI Investigation generation/share workflow
→ failures/recovery
→ new-day lifecycle
→ implementation allocation
→ deterministic reclosure
→ final target-machine/provider acceptance
```

### External defect 1 — returned position was being over-interpreted as semantic rank

A Scanner row at `resultRank=1` is not necessarily “the best candidate”. Without deterministic SQL ordering, it is only the first returned row.

Correction:

- `resultRank` / `result_rank` is now explicitly defined as original 1-based **returned position**;
- Viewer uses neutral Position/Scanner position wording;
- AI prompt must inspect exact SQL before using ranking language;
- unordered/ambiguous SQL must state that position does not prove strategy preference;
- ordered-vs-unordered regression fixtures protect this distinction;
- durable decision `D-US-032` owns the rule.

No SQL parser or new subsystem was added.

### External defect 2 — shareable AI pack could have leaked local operational/session fields

The prior wording promised no session data but also described history/context evidence too much like raw local rows. `history` includes `session_id`, and arbitrary Scanner SQL can return operational/string fields. A raw export would therefore violate the sharing promise even though the DB itself was correct.

Correction:

- persisted DB/context remains full local provenance;
- AI export now derives a separate deterministic **sharing-safe projection** before file creation;
- target-history/baseline files allowlist authority keys + documented provider market fields + provider `raw_data` and exclude session/producer/config/error/request/source_metadata/path fields;
- Scanner context preserves structural metadata, identity, numeric/null/boolean and documented market-text values; arbitrary other string/array/object contents are exported only as redaction metadata with `redactedForSharing=true`;
- redacted contents may not enter files, prompt, README, manifest, response metadata or diagnostics;
- exact user-authored SQL remains verbatim, with an explicit pre-share warning to review it and never put secrets in Scanner SQL;
- canary tests require operational/session/arbitrary-string byte sequences to be absent from every shareable artifact/surface;
- durable decision `D-US-033` owns the boundary.

This is an export projection, not a second DB/sanitization subsystem.

### Re-run necessity / sufficiency / KISS

**PASS.**

The two corrections fit existing leaves `4.4.2`, `4.5.1`, `4.5.2`, `7.5` and `7.4`; no new capability leaf is independently necessary. The existing 39-node / 28-leaf decomposition remains valid, dependencies remain unchanged, and the corrections strengthen existing success evidence rather than creating a new subsystem.

### Final negative-space challenge

No remaining material gap was found in:

```text
identity
selection/dedupe
returned-position semantics
capture ordering/baseline
wall-clock anomalies
horizon calculation
paging/targeted refresh
Auto visibility/backpressure/Stop
lost capture ACK
migration/new-day
AI anti-hindsight
AI sharing safety
export atomicity/lost ACK
privacy/diagnostics
verification/allocation/release sequence
```

### Final planning truth

```text
root capability branches: 7
TREE nodes:              39
implementation leaves:   28
new implementation allocation: Chats 10–17
implementation_authorized: false until planning PR merge + main Planning CI/open-PR verification
```

The plan may be re-frozen once the updated Planning Docs CI is green. Production code remains unauthorized until PR #17 is reviewed/squash-merged, main Planning Docs CI is green and open-PR state is clean; only then may repository truth deliberately advance to `phase: implementation`, Chat 10 / TREE `4.3.1`.
