# Market Flow US Test Strategy

## 1. Principles

Verification protects observable contracts, not implementation trivia.

Use:

```text
fast unit tests
→ real DuckDB/service integration
→ Chromium composition
→ bounded correctness-first workload in hosted CI
→ deterministic local Fake Leumi acceptance
→ final target-machine/authenticated acceptance
```

No credentialed provider access or external AI provider belongs in CI.

Recurring automation speed is an engineering requirement. Remove duplicated work before increasing timeouts. Heavy performance authority belongs to the intended target machine.

Every new/materially changed SQL statement must pass the AGENTS static SQL preflight before first execution, then a tiny deterministic fixture, then representative bounded measurement.

## 2. Preserve existing U.S. proof

Do not weaken already-green proof for ScreenerHulPaging3 acquisition/completeness, canonical PaperId identity, Recorder non-overlap/universe revisions, schema-v3 market authority, cycle rollback, Current/Security/History reads, Scanner security/saved-query CRUD, Current/Detail/Scanner Chromium behavior, diagnostics, shared synthetic generator, local Fake Leumi tooling and packaging/live boundaries.

Demo Buy/schema-v4 tests extend these rather than replacing them.

## 3. Unit — Demo Buy selection/provenance

Prove:

- exactly one `securityId`/`security_id` column is required;
- `Symbol` is never identity;
- invalid identity rows are non-selectable;
- All/Top-X/Auto refuse chosen ranges containing invalid identity instead of silently skipping;
- manual selection preserves original 1-based `resultRank`, including gaps;
- `resultRank` is the original returned row position and is not itself evidence that the SQL semantically ranked that row;
- All selects all source rows before dedupe;
- Top X selects exactly first X source rows before dedupe;
- duplicate IDs reduce to first chosen occurrence and never backfill beyond X;
- submitted IDs/ranks are unique and ranks strictly increasing;
- Top X accepts only `1..5000` source rows;
- All above 5000 unique items is refused, never truncated;
- empty manual selection cannot submit;
- zero-row successful Auto generation is no-op;
- selection resets on new rendered generation;
- capture freezes the exact rendered generation synchronously before async submission;
- later Scanner refresh cannot mutate an in-flight capture snapshot;
- query ID/name/SQL/interval/result timing/rowCount stay bound to the rendered generation despite draft/library edits.

## 4. Unit — Scanner-context shaping

Prove exact limits:

```text
rows <= 50
retained columns <= 64
identity column always retained
textual/serialized cell <= 128 UTF-8 bytes after deterministic clipping
serialized context <= 256 KiB UTF-8
source SQL <= 1 MiB UTF-8 for Demo-Buy-capable generation
selected unique items <= 5000
```

Cover exact-limit and limit+1 cases, including multi-byte UTF-8.

Also prove identity column beyond source column 64 is retained, non-identity columns preserve earliest source order, original source indexes/names are kept, omitted row/column metadata is explicit, arrays preserve order, object keys canonicalize deterministically, clipping is marked, and context failure never changes selection/ranks.

## 5. Unit — Capture controller / Auto UX

Prove one Viewer-wide capture slot covers manual+Auto; double-submit is impossible; busy Auto generations are counted/skipped rather than queued; zero-row Auto is no-op; ordinary rejection releases the slot; `ACKNOWLEDGEMENT_UNKNOWN` locks capture until explicit recovery; there is no blind replay; Auto changes apply only to future successful generations; enabling Auto does not capture the already-rendered result; persistent Auto status follows Off/All/Top-X; Turn off affects future generations only; bounded summary replaces unbounded logs.

## 6. Unit — Resumable Scanner Stop

Prove user-level Stop recurring scan is distinct from terminal destroy:

```text
Stop
→ cancel future timer
→ invalidate generation token
→ ignore stale in-flight result
→ keep Viewer/draft alive
→ later Activate succeeds
```

If Auto remains armed, no capture occurs while scanning is stopped.

## 7. Unit — Demo Buy evaluator

Fixed horizons exactly:

```text
10s,20s,30s,45s,60s,90s,120s,3m,5m,10m
```

Prove target = `capturedAtMs + horizonMs`; future row requires `cycle_id > buy_cycle_id` and `collected_at_ms >= target`; earliest collected time then lowest cycle ID wins; qualifying `Price=NULL` row is not skipped; formula/signs/reason precedence are exact; missing baseline row is integrity error; Scanner completion never anchors horizons; clock anomalies never change authority and produce nullable diagnostic values plus timing-anomaly state.

## 8. Unit — Demo Buy UI model

Prove capture grouping, page-mid-capture header repetition, sticky identity/base context, one compact cell per horizon, Pending presentation for `NO_FUTURE_OBSERVATION`, warning presentation for non-temporal unavailable reasons, color-independent direction, horizon progress, `Refresh latest` reset semantics, `Load more` append semantics, `Refresh observation` in-place replacement, and smallest-surface error preservation.

## 9. Unit — AI Investigation model

Prove prediction/outcome separation; prediction-time history requires `cycle_id <= buy_cycle_id` plus the 30-minute window; outcome history requires `cycle_id > buy_cycle_id` plus capture→10-minute window; no post-watermark row leaks backward even with anomalous timestamps; Top-50/rank>50 context behavior; missing expected Top-50 target is integrity error; `COMPLETE_OUTCOME` depends on committed post-watermark evidence reaching the 10-minute boundary rather than wall clock; prompt requests minimal SQL hypothesis, concrete pre-buy evidence, benefit, false-negative cost, overfitting risk and multi-observation validation; no automatic query activation; pack format/manifest/field-guide output is deterministic.

Also prove ranking-language discipline with at least two fixtures:

1. an unordered/select-only query where `resultRank=1` must be described only as **returned position 1** and the prompt explicitly refuses to call it best/top-ranked;
2. a deterministic query with explicit `ORDER BY`/tie-breaks where the prompt may explain why the target occupied that ordered position using only retained prediction-time evidence.

## 10. Real DuckDB — schema v4

### Fresh v4

Prove exact two Demo Buy tables/columns/constraints plus unchanged U.S. market authority.

### v3 → v4

Seed valid v3 market authority + saved queries and prove transactional additive migration preserves them.

### Partial-state rejection

DB marked v3 with one/both Demo Buy structures fails closed instead of silently resuming unknown migration.

### Migration faults

Inject failures at multiple phases; original v3 remains usable and no accepted partial v4 remains.

### New day

Prove rollover accepts valid v3 or v4, rejects v1/v2/running/partial-corrupt states, preserves saved queries, can archive source unchanged, and installs fresh v4 with empty Demo Buy state.

## 11. Real service — capture authority

Using real `ws` + DuckDB prove:

1. valid response returns capture ID/time/item count;
2. no buy-price input exists;
3. Node rejects duplicate/rank/order/range/mode/topX/bound errors;
4. Node validates context-to-item rank/identity for captured rank <=50;
5. identity-column-beyond-64 context remains valid;
6. oversized SQL/context fails before commit;
7. each item links exact latest cycle at writer point;
8. market write before capture may become baseline;
9. market write after capture cannot retroactively become baseline;
10. unresolved selected security rolls back whole capture;
11. capture IDs are monotonic;
12. same security may be captured again later;
13. query edits never rewrite capture provenance;
14. persistence fault rolls back capture/items/context together;
15. capture never mutates history/latest.

## 12. Lost capture ACK

Deterministically close transport after request dispatch before conclusive response. Prove browser state is `ACKNOWLEDGEMENT_UNKNOWN`, no auto-retry occurs, capture stays blocked until recovery, committed request refreshes to exactly one capture, uncommitted request refreshes to none, and only then may the user explicitly act again.

## 13. Real service — trusted Demo Buy reads

Prove `demo.buy.page`, `demo.buy.observation.get` and `demo.buy.capture.get`:

- exact baseline join and stable baseline-integrity error;
- `cycle_id > buy_cycle_id` post-capture invariant;
- nearest-at/after target selection and tie-break;
- null/zero/unavailable reasons;
- delayed observed/elapsed time;
- ordering `capture_id DESC, result_rank ASC`;
- fixed 50-item page;
- one transactionally consistent snapshot per page;
- stable opaque cursor while new Auto captures arrive;
- first-page refresh exposes new captures;
- page omits repeated full SQL/context;
- capture detail returns immutable SQL/provenance once;
- targeted observation read uses identical evaluator semantics and updates one old target without resetting pagination;
- restart persistence and new-day clearing/no cross-day horizons.

## 14. Real filesystem/service — AI pack

Using a temporary export root prove:

1. target belongs to capture;
2. SQL/context/baseline come from immutable persisted evidence, never re-running Scanner;
3. pre/post history obey watermark + time windows;
4. `OUTCOME.json` reuses trusted evaluator;
5. Top-50/rank>50 behavior is correct;
6. partial→complete regeneration happens only after qualifying committed evidence reaches boundary;
7. immutable SQL/context/baseline remain identical across regeneration;
8. every required file exists with deterministic contract content;
9. browser cannot choose output path;
10. response/manifest path is repository-relative, not absolute machine path;
11. `promptText` <= 256 KiB;
12. write/rename failure never publishes misleading complete output;
13. successful pack is never overwritten;
14. export mutates no DB authority;
15. restart can regenerate semantically equivalent evidence;
16. diagnostics never dump SQL/history/prompt/evidence;
17. `FIELD_GUIDE.md` and `PROMPT.md` define `resultRank` as returned row position and do not infer semantic rank without deterministic SQL ordering.

Lost export ACK may be safely regenerated after reconnect because no DB authority changes; it creates a new collision-safe pack rather than reusing capture lost-ACK rules.

## 15. Chromium — Scanner capture UX

Prove accessible capture controls; checkbox never opens Detail; source-row-first Top-X/rank behavior; actionable invalid/oversized refusal; frozen generation during concurrent refresh; Auto starts with next generation only; persistent Auto indicator across Current/Scanner/Demo Buy and Turn off; busy-skip bounded summary; resumable Stop recurring scan with stale-result suppression; distinct committed/rejected/acknowledgement-unknown UI.

## 16. Chromium — Demo Buy outcome UX

Prove empty guidance, capture-grouped rendering, header continuity across page split, compact ten-horizon cells, sticky identity context, Pending vs warning unavailable presentation, progressive UP/DOWN/FLAT/unavailable transitions, Refresh latest vs Load more, targeted Refresh observation on an item pushed off page one by newer Auto captures, provenance-detail error isolation, and Scanner continued operation while Demo Buy is visible.

## 17. Chromium — AI Investigation UX

Prove a failed returned-position-1 candidate workflow with both an explicitly ordered Scanner query and an unordered query; for the unordered query UI/prompt must not imply “best/top-ranked” merely from position 1. Also prove context coverage and partial/complete state; one export slot; relative folder path/file count; Copy AI Prompt and Copy folder path clipboard fallbacks; targeted observation refresh before generation; partial regeneration; rank>50 reduced-context pack; export error isolation; safe lost-export-ACK guidance; and absence of automatic AI upload/call/SQL activation.

## 18. Fake Market scenarios

Shared generator supports existing U.S. cases plus:

```text
UP
DOWN
FLAT
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
ordered position-1 candidate later declines
unordered result position 1
Top-50 peer differences
rank>50 target
post-capture cycle with anomalously early collected_at_ms
wall-clock regression diagnostics
```

Fixtures are synthetic/sanitized.

## 19. Hosted workload

Hosted CI is correctness-first and bounded. Cover exact counts, restart, Current/History reads, general/staged Scanner, approximately-4k width sanity, 50-item Demo Buy page evaluation, targeted observation read, Scanner+Demo Buy coexistence, one bounded AI export and sanitized reporting.

No hosted timing becomes a product SLO.

## 20. Heavy target-machine workload

Final target-machine profile remains:

```text
4096 synthetic securities
180 end-to-end cycles
737280 history rows
```

Also run isolated one-day persistence/read/Scanner/Demo Buy/AI probes using direct seeding when higher layers are irrelevant to the measured question.

## 21. Local Fake Leumi acceptance

On exact post-feature candidate prove deterministic static/moving/membership/failure/restart behavior, schema-v4 Demo Buy capture/evaluation, progressive + targeted observation refresh, AI pack generation/copy/regeneration, v3/v4→fresh-v4 new-day lifecycle and bounded workload reports through the normal runtime/service/DuckDB.

## 22. Authenticated static smoke

No credentials in repository/CI. Closed/static market may repeat values while still proving provider shape/transport/authority/reads/Scanner/clean stop. It never substitutes for movement proof.

## 23. Authenticated market-open gate

Require **at least 20 consecutive complete ScreenerHulPaging3 responses** spanning at least 60 seconds on the exact candidate SHA, durable ACK/commit for every cycle, observable provider-side market/freshness movement, final Current/Security/History/Scanner/ownership/clean-stop proof and sanitized SHA-bound report.

## 24. Planning / release gates

Before implementation authorization:

```text
plan frozen
TREE structurally valid
28 implementation leaves allocated exactly once
R-US-DEMO-BUY-FINAL recorded
Planning Docs CI green
planning PR reviewed and merged
main Planning CI green
```

Before final `7.4` acceptance:

```text
4.3.* / 4.4.* / 4.5.* done
7.5 deterministic re-closure done
Fast green
Browser green
Planning green
bounded Workload green
local Fake Leumi feature proof green
feature/reclosure PR merged
main green
exact accepted candidate SHA recorded
```

## 25. Completion rule

Unit/service correctness, browser composition, deterministic local target-machine behavior, authenticated provider compatibility and market-open movement are separate evidence families; none substitutes for another.
