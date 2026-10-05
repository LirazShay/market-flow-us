# Market Flow US Test Strategy

## 1. Core principles

Verification protects observable contracts, not implementation trivia.

The product follows:

```text
reuse proven tests where behavior is unchanged
→ add focused proof for new Demo Buy responsibilities
→ keep Fast feedback fast
→ use real DuckDB/service for authority semantics
→ use Chromium for browser composition
→ use bounded workload smoke in CI
→ use configurable synthetic generators for isolated probes
→ use deterministic local Fake Leumi acceptance before external checks
→ defer heavy target-machine/authenticated authority to the final acceptance leaf
```

No credentialed provider access belongs in CI.

GitHub-hosted CI is correctness-first. Timing is diagnostic; heavy performance PASS/FAIL belongs to the intended target machine.

### Automation-performance invariant

Verification speed is part of the contract. Measure complete wall-clock cost including setup/build/browser/DB/cleanup.

Optimization order:

```text
remove duplication
→ share safe setup
→ reduce oversized fixtures
→ replace sleeps/polling with deterministic synchronization
→ improve query/test architecture
→ remeasure end to end
```

Do not increase timeouts or weaken coverage to normalize avoidable slowness.

A broad recurring suite may be accepted around 10–30 seconds only after dominant costs are reviewed and no meaningful improvement remains without weakening proof or adding disproportionate complexity. Normal Fast/Browser jobs retain a 3-minute hard ceiling.

## 2. Layer 1 — Unit tests

### Provider adapter

Prove:

- exact ScreenerHulPaging3 URL/query construction;
- response extraction;
- non-2xx/malformed rejection;
- positive safe `recordCount`;
- `records.length === recordCount`;
- missing/empty/invalid `PaperId` rejection;
- duplicate canonical `PaperId` rejection;
- row reordering does not alter membership;
- `Symbol` absence does not become identity;
- null/zero/missing market fields remain distinct;
- source metadata/raw row preservation.

### Cycle shaping / Recorder

Prove:

- one full response -> one segment with `chunkIndex=0`;
- exact counters/timing/membership;
- 3000 ms default remains timing config only;
- no overlapping cycles;
- stop prevents new cycles;
- membership change routes through universe replace before same-response commit;
- same membership reuses accepted revision;
- failures are fail-closed.

### Existing Viewer models

Prove:

- Current U.S. columns and `DailyVolume DESC` default;
- null/zero/missing formatting;
- Detail summary/history columns;
- sort/state preservation.

### Scanner

Prove:

- built-ins parse/execute against current schema;
- staged SQL exposes `securityId`;
- contiguous staged ranking and missing-history stop;
- deterministic tie-break order;
- Draft/Persisted/Active isolation remains unchanged.

### Demo Buy Scanner selection model

Prove independently of the network/DB:

- capture controls are enabled only with exactly one recognized `securityId`/`security_id` column;
- `Symbol` is never accepted as identity;
- rows whose recognized identity cell is null/non-string/blank are not manually selectable;
- `All`, `Top X` and auto selections refuse a chosen source range containing an invalid identity rather than silently skipping it;
- manual checked selection preserves original 1-based source-row `resultRank`, including gaps;
- `All` chooses all source rows before dedupe;
- `Top X` chooses exactly the first X source rows before dedupe;
- duplicates inside a chosen source range reduce to first chosen occurrence without pulling a later row from outside the range;
- browser-submitted capture items are unique by both `securityId` and `resultRank`;
- `Top X` accepts only 1..5000 source rows;
- `All`/auto-All with more than 5000 unique IDs after first-occurrence dedupe is visibly refused rather than truncated;
- empty manual selection cannot submit;
- auto zero-result generation is a no-op;
- selection state does not leak to a later result generation;
- active-generation provenance freezes query ID/name/exact SQL, active interval, Scanner `startedAtMs`/`completedAtMs` and source row count while another draft/query is edited;
- Scanner completion time remains distinct from later Demo Buy capture time;
- one Viewer-level capture slot covers both manual and automatic capture;
- manual double-click/second capture cannot submit while the slot is busy;
- automatic Off/All/Top-X attempts at most one capture per successful result generation;
- a generation arriving while the shared capture slot is busy is visibly skipped and not queued;
- one capture failure releases the slot and does not poison later manual/automatic captures;
- Scanner scheduling continues through capture failure/backpressure.

### Demo Buy evaluation model

Prove pure/model behavior:

- fixed horizons are exactly 10s/20s/30s/45s/60s/90s/120s/3m/5m/10m;
- target clock is `capturedAtMs + horizonMs`;
- Scanner completion time is not used as the horizon anchor;
- percentage formula is exact;
- first qualifying future row remains authoritative even when its Price is NULL;
- no future row -> `UNAVAILABLE / NO_FUTURE_OBSERVATION`;
- baseline NULL -> `UNAVAILABLE / BASELINE_PRICE_UNAVAILABLE`;
- baseline zero -> `UNAVAILABLE / BASELINE_PRICE_ZERO`;
- matched future Price NULL -> `UNAVAILABLE / FUTURE_PRICE_UNAVAILABLE`;
- missing immutable baseline row -> integrity error, not unavailable;
- `>0 => UP`, `<0 => DOWN`, `=0 => FLAT`;
- capture latency and baseline age calculations are non-negative only when source timestamps support them;
- UI formatting never confuses numeric zero with missing;
- direction remains understandable without color.

### Branding/build

- Market Flow US generated filenames/global keys;
- Windows launchers remain thin wrappers.

Any new/materially changed SQL must pass the AGENTS 10+ stage static SQL preflight before first execution.

## 3. Layer 2 — Real DuckDB/service integration

Use real temporary DuckDB + real `ws`.

Preserve existing proof families:

- DB bootstrap/close/restart;
- unsupported schema rejection;
- producer/session ownership;
- heartbeat/stale recovery;
- universe replacement;
- complete cycle commit;
- failed cycle persistence;
- fault-injected rollback;
- Current/status/Security/history trusted reads;
- Scanner admission/execution;
- saved-query CRUD;
- Support Snapshot.

Add Demo Buy-specific service proof described below.

## 4. Schema-v4 lifecycle tests

Required:

### Fresh v4

- fresh empty DB bootstraps as v4;
- all U.S. market tables/columns remain unchanged from the proven v3 market contract;
- `demo_buy_captures` and `demo_buy_items` exist with exact required types/keys/constraints;
- capture schema contains immutable query/interval/result timing provenance;
- item schema stores original `result_rank` rather than a dense selection rank;
- `scanner_saved_queries` remains available;
- hardened connection behavior remains unchanged;
- no new `history` index is required merely for v4 bootstrap.

### v3 → v4 additive migration

Seed a valid v3 database containing:

```text
session/universe/cycles/history/latest
saved Scanner queries
```

Then prove:

- open/migration succeeds transactionally;
- all pre-existing market rows/counts remain byte/semantic-equivalent at the public projection level;
- saved-query rows remain intact;
- schema version becomes 4 only after both complete Demo Buy tables/constraints exist;
- restart reopens as v4 without re-running destructive work.

### Migration failure / partial-state rejection

Inject failure during migration and prove:

- no partial Demo Buy table/version state is accepted;
- original v3 authority remains recoverable/usable as v3;
- no market or saved-query rows are lost.

Also create inconsistent databases marked v3 but containing only one Demo Buy table or otherwise partial v4 structure and prove open fails closed instead of silently treating the state as a resumable migration.

### Legacy rejection

Old MarketScope v1/v2 DBs remain rejected without mutation. No Israel→U.S. semantic conversion is introduced.

## 5. Demo Buy capture authority integration

Using real DuckDB and the real service/protocol, prove:

1. valid capture returns `captureId`, `capturedAtMs`, item count;
2. browser cannot provide a baseline price in the contract;
3. capture request contains ordered `{securityId,resultRank}` items plus immutable query/interval/result timing provenance;
4. Node rejects duplicate `securityId`, duplicate `resultRank`, out-of-range rank or inconsistent Top-X rank instead of silently deduping/repairing protocol input;
5. capture links each item to the exact `latest.cycle_id` visible at its serialized writer-order point;
6. a market cycle queued before capture may become the baseline;
7. a market cycle queued after capture cannot retroactively change the baseline;
8. one unresolved selected security rolls back the complete capture;
9. raw request/item count >5000 is rejected safely;
10. malformed/blank/non-string identity input is rejected;
11. invalid mode/topX/automatic combinations are rejected;
12. stored `result_rank` exactly preserves source positions, including non-contiguous manual ranks;
13. capture IDs are monotonic under serialized execution;
14. the same security may be captured again in a later capture;
15. stored query SQL/name/ID/interval/result timestamps/row count remain unchanged after saved query edits;
16. `captured_at_ms` is generated inside the serialized capture operation and remains distinct from Scanner completion time;
17. persistence fault rolls back capture + items together;
18. capture failure does not block a later valid capture;
19. market `history`/`latest` are unchanged by Demo Buy writes.

## 6. Demo Buy trusted-read/evaluation integration

Seed exact history timelines and prove the Node read model, not browser arithmetic:

- exact baseline join by `(buy_cycle_id, security_id)`;
- deliberately broken/missing baseline link returns stable Demo Buy integrity error;
- target = `captured_at_ms + horizon`;
- first row `>= target` wins;
- deterministic tie-break is `collected_at_ms ASC, cycle_id ASC`;
- a row before the target is never used as the future horizon;
- a qualifying row with Price NULL is not skipped in favor of a later priced row;
- explicit unavailable reason precedence is correct;
- delayed row returns its real `observedAtMs` and `actualElapsedMs`;
- positive/negative/zero prices produce `UP`/`DOWN`/`FLAT` when percentage is valid;
- capture latency/baseline age are shaped correctly from persisted provenance and baseline timestamps;
- page ordering is `capture_id DESC, result_rank ASC`;
- page size is exactly 50 items in Phase 1;
- every page is evaluated from one transactionally consistent read snapshot while market writes continue;
- keyset continuation anchored to `(capture_id,result_rank)` has no gaps/duplicates;
- inserting newer automatic captures between continuation requests does not disturb the existing continuation walk; refresh from the first page exposes them;
- item pages do not repeat full source SQL;
- `demo.buy.capture.get` returns immutable capture-level SQL/provenance once and validates capture identity/not-found behavior;
- source label and baseline display fields are read correctly;
- restart preserves active-day observations;
- new-day reset clears Demo Buy tables while preserving saved queries;
- future evaluation never reaches into the next active-day DB after rollover.

The evaluation SQL must receive static preflight before first execution and then run on a tiny deterministic fixture before larger workload measurement.

## 7. Layer 3 — Canonical Fake Market

Fake Market is a real loopback HTTP server used by the normal browser runtime.

It serves:

```text
/lti/lti-app/api/Market/ScreenerHulPaging3
```

Required deterministic scenarios retain:

1. complete moving response;
2. repeated identical complete response;
3. same membership/different order;
4. add security;
5. remove security;
6. duplicate PaperId;
7. missing PaperId;
8. recordCount mismatch;
9. null/zero/missing fields;
10. malformed response;
11. HTTP error;
12. delayed response;
13. advancing values;
14. provider recovery;
15. service restart.

For Demo Buy the synthetic generator must also support deterministic future trajectories that yield:

```text
UP
DOWN
FLAT
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

and at least one delayed collection gap so actual elapsed time differs materially from the nominal horizon.

Normal scenarios should not depend on Playwright interception.

## 8. Layer 4 — Browser E2E

Chromium runs against Fake Market + real local service + normal built runtime.

Preserve current behavior:

- runtime composition;
- Current boot/empty/main/error;
- Current columns/sort;
- diagnostics;
- Detail open/back/history paging;
- refresh state preservation;
- Scanner execute/stop/repeat;
- saved-query library;
- Scanner-to-Detail navigation;
- producer survives Viewer close;
- explicit recovery after service interruption.

### Required Demo Buy browser journey

At least one composed scenario proves:

1. activate a Scanner query returning ordered canonical IDs;
2. select non-contiguous rows and create a manual capture;
3. open Demo Buy and see exact identities plus original Scanner result ranks and baseline values;
4. create `Top X` where a duplicate exists inside the first X and prove no row after X is pulled in;
5. prove invalid recognized-ID rows cannot be silently captured;
6. prove oversized All/auto-All is refused without truncation;
7. prove manual double-submit is impossible while the shared capture slot is busy;
8. enable automatic Top-X and prove later successful Scanner generations create independent captures when the capture slot is free;
9. hold one capture in flight, prove an intervening auto generation is visibly skipped rather than queued, then prove a later generation captures after the slot releases;
10. advance Fake Market time/history and prove horizon cells transition from unavailable to evaluated;
11. prove `UP`, `DOWN`, `FLAT` and each unavailable reason presentation needed by the UX contract;
12. prove displayed percentage comes from the Node read model and matches deterministic history;
13. prove Scanner result-completed time, capture time, baseline age and delayed actual observation time are distinguishable;
14. edit/select another query and prove old capture provenance is unchanged;
15. expand capture details and prove exact old SQL/interval/timing provenance is loaded on demand without being duplicated in each row;
16. prove Scanner without exactly one canonical ID column disables Demo Buy capture;
17. inject capture failure, show it visibly, and prove Scanner scheduling plus later capture still work;
18. insert newer auto captures while loading continuation pages and prove no duplicate/gap in the existing 50-item walk; Refresh exposes the newer rows;
19. navigate Current ↔ Scanner ↔ Demo Buy ↔ Detail while Scanner remains mounted/scheduled and without breaking existing lifecycle behavior;
20. direction is not conveyed by color alone.

## 9. Fast CI contract

`npm run test:fast` remains:

```text
unit
+
real service integration
```

Demo Buy unit/schema/service tests join this suite without creating a separate runner.

Targets remain guidance, not permission to weaken proof:

```text
focused checks: as fast as practical
broad full Fast/service verification: <= 30s acceptable steady-state ceiling after optimization review
full Playwright execution: <= 12s target where practical
ordinary workflow hard ceiling: 3 minutes
```

For every meaningful test/CI change, compare wall-clock cost with the prior shape. Investigate any newly dominant schema migration, seed, evaluation SQL, browser wait or cleanup path.

## 10. Browser CI contract

For product-code changes:

```text
npm ci
→ exact Chromium setup/cache
→ npm run build:browser
→ npm run test:e2e
```

Failure evidence remains sanitized.

## 11. Layer 5 — Workload correctness and performance-smoke tooling

### A. Hosted-CI correctness/performance sanity

GitHub CI runs small deterministic profiles only.

Required coverage includes:

- generated U.S. row/schema correctness;
- exact completed/failed/latest/history counts;
- schema-v4 Demo Buy table/count/constraint integrity;
- restart preservation;
- Current/History reads;
- general Scanner SQL;
- staged Scanner SQL;
- bounded 50-item Demo Buy evaluation/read;
- Scanner + Demo Buy refresh coexistence on the existing Viewer transport;
- sanitized report structure;
- at least one approximately-4096-security width sanity cycle/few cycles;
- small multi-cycle history sufficient for staged and short Demo Buy horizon semantics.

Do not run full `4096 × 180` repeatedly in hosted CI.

### B. Isolated performance probes

Use the narrowest layer:

```text
persistence probe
→ generated validated cycles
→ writer/DuckDB

read/Scanner/Demo-Buy probe
→ seed deterministic day-bounded history + bounded captures efficiently
→ trusted reads/Scanner/Demo Buy evaluator

end-to-end probe
→ Fake Market HTTP
→ browser/Recorder
→ WebSocket/service
→ DuckDB
```

Do not replay thousands of full browser commits just to measure a Demo Buy read.

Do not add a new `history` index unless the representative direct-read probe demonstrates a material bottleneck and the focused change measurably improves it without harming write behavior.

### C. Heavy target-machine profile

Expose:

```text
4096 securities
180 end-to-end cycles
737280 history rows
```

Required integrity remains:

- 180 completed cycles;
- zero failed cycles;
- latest count 4096;
- history count 737280;
- last completed cycle 180;
- restart preserves counts.

Measure:

- cycle commit latency distribution;
- Current read;
- History page;
- Scanner JOIN/GROUP/window/time;
- staged candidate query;
- bounded Demo Buy capture/50-item read evaluation;
- Scanner + Demo Buy read coexistence;
- restart-to-ready;
- DB file size.

The 5-minute end-to-end ceiling remains target-machine acceptance only.

### D. One-trading-day horizon

Active DB performance is modeled for one trading day. Prior data may be archived; saved queries survive new-day operation; Demo Buy state and incomplete horizons do not cross into the fresh active DB.

## 12. Layer 6 — Local Fake Leumi acceptance kit

The kit reuses normal boundaries:

```text
Fake Leumi / ScreenerHulPaging3 HTTP
→ normal browser runtime / Recorder
→ loopback WebSocket
→ local service
→ real DuckDB
→ Current / Detail-History / Scanner / Demo Buy
```

It must cover:

### Static-market mode

- repeated complete identical responses;
- every response commits;
- history grows;
- latest values remain identical;
- revision remains stable;
- Current/Security/History/ownership/clean stop remain correct.

### Moving-market mode

- synthetic values change;
- Current advances;
- History preserves prior rows;
- Scanner observes movement;
- add/remove membership remains correct.

### Demo Buy mode

- run a known Scanner query;
- capture at least one result without manual price input;
- preserve original result rank and signal/capture timing provenance;
- initially show unavailable future horizons with correct reason;
- advance deterministic history;
- refresh Demo Buy;
- prove at least one horizon becomes an exact price/%/outcome derived from persisted history;
- load full capture SQL provenance on demand.

### Failure/recovery mode

- provider failure is fail-closed;
- recovery commits normally;
- restart preserves committed market authority and active-day Demo Buy observations.

### Local scale/performance modes

- isolated persistence;
- isolated day-bounded read/Scanner/Demo Buy;
- representative `4096 × 180` end-to-end.

Each emits a sanitized machine-readable report.

## 13. Layer 7 — Final target-machine acceptance bundle

All user-machine/authenticated checks remain last.

### A. User-run local Fake Leumi acceptance

Required:

- static PASS;
- moving PASS;
- Demo Buy journey PASS;
- failure/recovery PASS;
- restart PASS;
- isolated persistence PASS;
- isolated one-day read/Scanner/Demo Buy PASS;
- `4096 × 180` end-to-end PASS within the target-machine ceiling;
- new-day archive/reset PASS with fresh market/Demo Buy tables and saved queries preserved.

### B. Authenticated closed/static-market smoke

Required:

```text
producer hello/session
→ at least 5 consecutive complete ScreenerHulPaging3 responses
→ exact validation
→ stable membership revision
→ COMMIT ACK every cycle
→ Current
→ History
→ Security
→ bounded Scanner
→ ownership/status
→ clean stop
```

Repeated equal provider values are valid. No real movement is required.

### C. Authenticated market-open acceptance

On the same final SHA:

```text
producer hello/session
→ at least 20 consecutive complete responses spanning at least 60 seconds
→ exact validation
→ universe ACK/revision handling
→ COMMIT ACK every cycle
→ at least one provider market/freshness field changes
→ Current/History reflect that change
→ Security
→ bounded Scanner
→ ownership/status
→ clean stop
```

Only this gate may declare moving real-provider evidence PASS. No observed change means movement remains pending/inconclusive.

Demo Buy outcomes do not substitute for provider movement evidence.

## 14. Live-only facts

Authenticated checks record rather than assume:

- actual returned `recordCount`;
- actual Origin;
- current response shape;
- CSP/LNA loopback compatibility;
- freshness indicators;
- repeated completeness;
- static versus moving values;
- encountered auth/session failure shape.

## 15. Security verification

Tests/fixtures/reports must not contain:

- credentials;
- cookies;
- bearer/auth headers;
- account IDs;
- raw authenticated response dumps;
- private browser state.

Synthetic provider fixtures only.

Support/acceptance reports must not dump full Demo Buy source SQL by default; operational identifiers/counts are sufficient.

## 16. Completion evidence

A leaf closes only when its routed `success_evidence` is green.

Final product completion requires:

```text
schema-v4 migration/capture/evaluation proof green
Fast green
Browser green
bounded CI workload green
local Fake Leumi target-machine acceptance including Demo Buy PASS
isolated one-day persistence/read/Scanner/Demo Buy performance PASS
4096 × 180 target-machine end-to-end PASS
new-day archive/reset PASS
closed/static authenticated smoke PASS
market-open authenticated acceptance PASS
main CI green
no blocking defect
```
