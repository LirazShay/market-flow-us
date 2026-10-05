# Market Flow US Planning Decisions

These decisions govern the U.S. conversion until explicitly reopened by evidence.

## D-US-001 — Convert MarketScope incrementally; do not rewrite

**Status:** resolved

Market Flow US starts from the exact green MarketScope baseline and preserves proven architecture/behavior wherever the U.S. data contract does not require a change.

Implementation order must favor boundary replacement plus regression proof over greenfield reconstruction.

**Reopen only if:** a proven MarketScope mechanism is incompatible with the U.S. requirement.

## D-US-002 — Bank Leumi ScreenerHulPaging3 is the initial provider source

**Status:** resolved

Use:

```text
/lti/lti-app/api/Market/ScreenerHulPaging3
```

from the authenticated provider browser context with the extracted U.S. screener filters and current `pageCount=5000`.

Do not hard-code the observed `4015` result count.

If the provider returns fewer rows than `recordCount`, fail closed rather than inventing completeness.

**Reopen only if:** current provider evidence shows one-request full retrieval no longer works.

## D-US-003 — Canonical identity remains provider PaperId

**Status:** resolved

```text
securityId = String(PaperId)
```

`Symbol`, row order, names and `PaperIdYatab` are not canonical keys.

This preserves the existing product identity contract and Detail/Scanner navigation.

## D-US-004 — One U.S. response maps to one existing-style complete cycle

**Status:** resolved

Do not redesign the producer protocol/cycle authority.

Represent the one full U.S. response as:

```text
chunkIndex = 0
chunk_count = 1
```

and reuse the existing complete-cycle/ACK/transaction path.

The word `chunk` is retained physically in this migration to minimize risk; the U.S. provider is not claimed to be chunked.

## D-US-005 — Universe membership comes from every validated full response

**Status:** resolved

The response provides both membership and market rows.

Browser compares canonical membership with the accepted universe:

- same membership -> commit under current revision;
- changed membership -> replace universe, receive new revision, then commit that same response.

Row reordering does not create a new universe revision.

## D-US-006 — Keep history/latest mechanism; create incompatible U.S. schema v3

**Status:** resolved

Keep:

- append-only `history`;
- full-row `latest`;
- complete-cycle transaction;
- serialized writer;
- saved-query table.

U.S. market projection becomes schema v3.

Do not semantically convert old MarketScope v1/v2 Israeli DB rows into U.S. rows.

New default DB:

```text
data/market-flow-us.duckdb
```

Opening incompatible v1/v2 through Market Flow US fails without mutating that DB.

D-US-022 defines the daily active-DB lifecycle; this decision does not require multi-day market history to accumulate inside the active file.

## D-US-007 — Typed U.S. projection remains source-shaped

**Status:** resolved

Promote the source fields listed in DATA_CONTRACT, including:

```text
Price
ChangePercent
BidRate
AskRate
DailyVolume
DailyHigh
DailyLow
YearHigh
YearLow
YesterdayRate
PaperMarketCap
TradeDateTime
Symbol
ExchangeName
PaperNameEng
PaperNameHeb
```

plus the other documented percentages/identity metadata.

Always retain `raw_data`.

Do not rename `Price` to LAST or claim units/timezone semantics not yet proven.

## D-US-008 — Current/Detail keep the same UX model with U.S. columns

**Status:** resolved

Current visible fields are the U.S. set documented in PRODUCT_SPEC.

Default sort:

```text
DailyVolume DESC
```

Detail/history keep the existing page/retry/navigation/state contracts with U.S. fields.

Display-name fallback:

```text
first non-empty:
PaperNameEng
→ PaperNameHeb
→ Symbol
→ securityId
```

## D-US-009 — Strategy remains editable Scanner SQL

**Status:** resolved

No Strategy Engine, ranking service or hard-coded survivor pipeline.

Ship an editable built-in staged-candidate query.

Initial example:

```text
10s → 20s → 30s → 45s → 60s → 90s → 120s
predicate: current Price > prior Price
result: highest contiguous stage_reached
sort: stage, ChangePercent, DailyVolume, securityId
```

Changing stages/conditions is a SQL edit, not an application/schema change.

## D-US-010 — No temporal precompute in the initial U.S. conversion

**Status:** resolved

Do not add:

- `prev_*_snapshot_id` columns;
- dynamic horizon schema;
- materialized short-window percentage columns;
- temporal feature engine.

Use direct `history` SQL first.

If measured intended-use evidence proves staged SQL materially impractical, reopen the smallest performance area with measurement.

## D-US-011 — 4096 × 180 remains the heavy end-to-end profile, but not hosted-CI authority

**Status:** resolved

The representative end-to-end target-machine profile remains:

```text
4096 synthetic securities
180 cycles
737280 history rows
```

This preserves approximately-4k breadth without hard-coding the observed provider count and avoids the older 4k × 600 shape.

However, GitHub-hosted CI is not representative release-performance hardware. CI therefore runs smaller deterministic correctness/performance-smoke profiles, including approximately-4k width sanity, while the full `4096 × 180` timing PASS/FAIL belongs to final target-machine acceptance.

The heavy profile includes staged-ranking measurement. The same configurable generator may also build isolated day-bounded persistence/read/Scanner profiles without replaying irrelevant layers.

No hosted-runner latency number is promoted into a product SLO.

## D-US-012 — Keep 3000 ms as initial offline/demo cadence only

**Status:** resolved

The imported 3000 ms snapshot interval remains the initial deterministic demo/workload logical cadence.

It is not a provider SLA or proof that sustained 3-second live polling is safe.

Live behavior remains evidence-driven and configurable.

## D-US-013 — U.S. branding is complete product branding

**Status:** resolved

Target product/package/artifact naming uses `Market Flow US` / `market-flow-us`.

Target key names include:

```text
package: market-flow-us
DB: data/market-flow-us.duckdb
runtime: market-flow-us.runtime.js
bookmarklet: market-flow-us.bookmarklet.txt
Windows launcher: START_MARKET_FLOW_US.cmd
```

Donor MarketScope names may remain only in provenance/history documents.

## D-US-014 — Preserve Scanner security and saved-query ownership

**Status:** resolved

Keep DuckDB parser/type admission, zero parameters, side-effect rejection, hardened connection, Node-owned saved-query table, immutable built-ins and browser Draft/Persisted/Active separation.

Add the staged candidate built-in without changing these mechanisms.

## D-US-015 — Fake Market changes provider shape, not test architecture

**Status:** resolved

Replace MapHeat2/GetSecuritiesData behavior with stateful ScreenerHulPaging3 responses.

Keep the real loopback HTTP fake, normal runtime, deterministic scenarios and one-command demo.

D-US-021 requires Fake Market/load tooling to share one configurable deterministic synthetic generator rather than duplicate large hard-coded fixtures.

## D-US-016 — Authenticated-provider verification remains bounded and local

**Status:** resolved

No GitHub credentials/live bank CI.

The authenticated provider boundary is verified locally in two distinct modes:

1. a lightweight static/closed-market smoke that permits repeated identical market values and proves shape, transport, validation, commit authority, Current/History and clean stop without pretending to prove market movement;
2. a final market-open gate that verifies a bounded sustained run of **at least 20 consecutive complete U.S. cycles spanning at least 60 seconds** at the candidate collection cadence and requires observable provider-side market/freshness change across committed cycles.

The full market-open gate still proves commit, Current, Detail/History, bounded Scanner, ownership and clean stop. It remains the only check that may declare the moving real-market boundary PASS.

D-US-019 defines how these authenticated checks are sequenced with local Fake Leumi and target-machine acceptance.

## D-US-017 — Planning order is audit → contracts → TREE → allocation

**Status:** resolved

Do not allocate implementation chats before:

1. exhaustive file audit;
2. coherent U.S. durable contracts;
3. new S&T tree;
4. necessity/sufficiency/KISS review;
5. Final Planning Review;
6. freeze.

The imported MarketScope execution history is not the U.S. execution plan.

## D-US-018 — U.S. normal-runtime cutover occurs only at TREE 5.2

**Status:** resolved

Execution exposed a staging contradiction: Browser CI is required for product-code changes, but switching an upstream component to the U.S. contract before its downstream U.S. dependencies exist makes the normal composed Browser path structurally fail even when the focused component is correct.

The migration therefore uses the existing construction/dependency/configuration seams as a pre-cutover staging boundary:

- before TREE `5.2`, nodes `1.*` through `4.*` and `5.1` implement and prove U.S. behavior without replacing the normal built browser/runtime/demo/service composition;
- the active proven composition remains Browser-CI green on every pre-cutover work unit;
- no Browser test is skipped or disabled to conceal an incomplete integration;
- no generic feature-flag system, duplicate product architecture or long-lived parallel subsystem is introduced;
- legacy Israel-specific paths are compatibility-only during staging and receive no new product behavior.

TREE `5.2` is the sole normal-runtime U.S. activation boundary. By then Chats 1–4 are already complete and Chat 5 owns `5.1 → 5.2 → 5.3` on one branch, so the U.S. provider, authority, trusted reads/UI, Scanner and Fake Market are available before activation and the Browser suite is migrated/green before merge.

Final removal/audit of superseded authoritative Israel-only runtime paths remains owned by `7.3`.

**Reopen only if:** existing construction seams cannot stage one of the U.S. components without creating materially greater complexity than an earlier integrated cutover.

## D-US-019 — Final acceptance is split into deterministic local proof and deferred target-machine checks

**Status:** resolved

The market may be static while development is being completed, so lack of price movement must not block deterministic product development or create a false failure.

The release path is therefore split deliberately:

```text
automated/offline correctness candidate
→ reusable configurable local Fake Leumi acceptance kit
→ release cleanup/docs
→ final target-machine acceptance bundle
```

The local Fake Leumi acceptance kit must reuse the normal Market Flow US runtime, local service and DuckDB rather than introduce a parallel product path. It must provide deterministic modes for:

- repeated identical complete responses with stable membership;
- moving synthetic values;
- add/remove membership;
- provider failure and recovery;
- restart/persistence;
- isolated persistence/read/Scanner load probes;
- representative `4096 × 180` target-machine end-to-end reporting.

All checks that require the user's authenticated browser or target computer are deferred to the final execution leaf. That final bundle contains exactly three acceptance families:

1. **local Fake Leumi target-machine acceptance** — static/moving/failure/recovery, daily lifecycle and isolated/end-to-end mock load/performance;
2. **authenticated closed/static-market smoke** — repeated equal provider values are valid and must still commit/history correctly; no market movement is required;
3. **authenticated market-open acceptance** — bounded sustained collection with observable real provider market/freshness change and the full SHA-bound authority/read/Scanner/clean-stop proof.

The closed/static-market smoke never substitutes for the market-open gate; synthetic movement never substitutes for real-provider evidence; hosted-CI timing never substitutes for target-machine performance acceptance.

Development and release cleanup do not wait for market movement or the final heavy benchmark once the acceptance tooling itself has deterministic automated proof.

The final target-machine leaf remains pending until the user performs the required checks. Overall product completion is not declared before those required acceptance results are PASS.

D-US-025 extends this sequencing rule for the later Demo Buy feature: all Demo Buy implementation and deterministic re-closure must finish before the final target-machine leaf starts.

## D-US-020 — Recurring automation speed is a first-class engineering requirement

**Status:** resolved

CI, tests and every repeatedly executed automated support path are development infrastructure. Excessive recurring runtime directly reduces iteration quality and therefore must be treated as an engineering defect rather than accepted background cost.

This includes end-to-end wall-clock cost for:

- workflow/job topology;
- checkout/setup/cache/dependency installation;
- builds;
- unit/service/browser tests;
- fixtures and Fake Market/Fake Leumi harnesses;
- temporary service/DuckDB lifecycle;
- cleanup/report generation;
- benchmark/workload preparation and probes.

The optimization priority is:

```text
remove repeated/duplicated work first
→ refactor slow test/fixture/automation code
→ improve synchronization/setup/cache/job topology
→ preserve the same observable proof
→ remeasure end-to-end
```

A green result does not excuse a materially slow recurring path. Executors must investigate slow individual tests and setup stages when they dominate feedback. Increasing timeouts/retries, hiding cost in another job/command, or repeatedly paying duplicated setup is not an acceptable substitute for fixing avoidable slowness.

A broad high-value suite around 10–30 seconds can be accepted after its dominant costs are reviewed and no meaningful improvement remains without weakening proof or adding disproportionate complexity; record that state as **best practical verified state** and stop micro-optimizing it.

Hosted CI should prefer correctness density over benchmark realism. Heavy benchmark work that is machine-dependent belongs in the dedicated target-machine acceptance path rather than being repeated on weaker runners.

Coverage may not be weakened merely for speed. Performance refactoring should remove waste while preserving the same contractual evidence and diagnosability.

## D-US-021 — One configurable synthetic generator drives Fake Market and load probes

**Status:** resolved

Do not maintain separate giant fixture families for Fake Market, persistence benchmarks and Scanner/read benchmarks.

Create one deterministic synthetic U.S. generator/profile boundary that can be configured for at least:

- universe size;
- cycle/history count or logical day shape;
- cadence/timestamps;
- static vs moving values;
- membership changes;
- deterministic failures/recovery;
- reproducible seed.

Reuse it at the narrowest useful layer:

```text
provider/browser behavior → Fake Market HTTP
persistence behavior → validated generated cycles directly
read/Scanner behavior → direct day-bounded DB seeding
full integration → normal Fake Market → browser → service → DuckDB
```

This is test/support refactoring, not a second product implementation.

## D-US-022 — Active market-data authority is one trading day, not multi-year storage

**Status:** resolved

The production active DuckDB is intended to contain the current trading day's market authority, not indefinitely accumulated months/years of intraday history.

Operational model:

```text
one trading day active DB
→ stop producer/service safely
→ optionally archive prior-day DB/data
→ start a clean new-day market-data authority
```

Performance acceptance therefore uses one-day-bounded synthetic history shapes. It must not optimize or reject the design based on artificial multi-month/year active-history growth.

Saved-query state is user configuration rather than disposable daily market data and must remain available across the new-day reset/rotation path.

The release should document and prove the smallest safe new-day lifecycle; it does not need an analytics warehouse or long-term multi-day query subsystem.

## D-US-023 — Demo Buy is strategy-validation evidence, not simulated execution

**Status:** resolved

Phase 1 exists only to answer whether Scanner-selected candidates subsequently move up or down in persisted source `Price` over short horizons.

It therefore supports manual selected rows, all rows, Top X in exact Scanner-result order, and optional automatic All/Top-X capture. It does **not** introduce real orders, manual buy-price entry, fills, portfolio state, fees/slippage, sell rules, trade quantity, liquidity proof or strategy scorecards.

The same security may be captured again in a later Scanner generation because each capture is an independent observation, not an open position.

Phase 2 may later evaluate volume/liquidity/sellability evidence, but that work is not allowed to expand Phase 1.

## D-US-024 — Demo Buy uses additive schema v4, exact history linkage and direct future-history reads

**Status:** resolved

Advance the Market Flow US product schema from v3 to v4 with a transactional additive migration that preserves existing active-day market authority and saved Scanner queries.

Persist only two Demo Buy concepts:

```text
demo_buy_captures   = capture event + immutable Scanner provenance snapshot
demo_buy_items      = selected ordered security IDs + exact buy_cycle_id linkage
```

Each item links the precise baseline row through:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

The capture write uses the existing serialized writer so its ordering relative to market-cycle commits is deterministic. No user-supplied price is accepted.

Future observations are not materialized. For each fixed Phase-1 horizon, read the first same-security `history` row whose `collected_at_ms >= captured_at_ms + horizon`, ordered by `collected_at_ms ASC, cycle_id ASC`. Missing future evidence remains `NULL`; percentage change is computed only from valid non-null prices and a non-zero baseline denominator.

Do not add a background horizon updater, temporal-feature subsystem, second database, second transport or dynamic horizon schema unless measured evidence later proves the direct bounded read model insufficient.

Demo Buy state is active-day analytical state. A new-day reset does not copy Demo Buy rows into the fresh active DB; an optional archived prior-day DB remains self-contained with both the observations and referenced history.

## D-US-025 — Demo Buy development precedes final target-machine acceptance

**Status:** resolved

The user's intended release sequence is now:

```text
preserve completed U.S. migration evidence
→ implement Demo Buy backend/schema/read authority
→ implement Scanner capture + Demo Buy Viewer workflow
→ rerun deterministic release closure on the new candidate
→ only then execute final target-machine/authenticated acceptance
```

The previously unexecuted `7.4` evidence is not discarded; it is deferred because the accepted SHA must include Demo Buy.

Completed nodes `1.1` through `7.3` remain historical valid evidence for the work they proved. A new post-feature release-closure leaf owns all deterministic gates/docs/status/open-PR/main-readiness work that must be refreshed after Demo Buy. `7.4` then depends on that refreshed candidate rather than the older `7.3` SHA.

This is the smallest sequencing change that satisfies the user's preference to finish development before target-machine testing without reopening already-proven migration work.

## D-US-026 — Demo Buy capture preserves original Scanner meaning under explicit protocol bounds

**Status:** resolved

Demo Buy capture semantics are source-row-first:

```text
choose Selected / All / first X source rows
→ validate every chosen identity
→ dedupe canonical security IDs by first chosen occurrence
→ preserve each retained row's original 1-based resultRank
```

Node never silently dedupes or reorders malformed protocol input.

To make capture implementation-ready and safely below the existing 16 MiB local WebSocket ceiling, the concrete limits in `docs/DEMO_BUY_PROTOCOL_LIMITS.md` are authoritative. In particular:

```text
items <= 5000
source SQL <= 1 MiB UTF-8
Scanner context <= first 50 rows
Scanner context <= first 128 columns
one textual/serialized context cell <= 256 UTF-8 bytes after deterministic clipping
serialized context JSON <= 2 MiB UTF-8
```

The frozen context is immutable decision provenance, not a second market authority. It never changes selected item identity/rank and it is never reconstructed later by re-running SQL against newer state.

If exact SQL exceeds its Demo Buy provenance bound or deterministic context shaping cannot satisfy the contract, Scanner may remain usable but that result generation is not Demo-Buy-capturable; failure is visible rather than silently truncating exact SQL or changing capture meaning.

## D-US-027 — A lost Demo Buy capture ACK is unknown, not failure, and is never auto-replayed

**Status:** resolved

The existing Viewer client rejects pending requests when the local WebSocket closes, while the server may already have committed the capture before its response is observed.

Therefore browser capture outcomes are exactly:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

`ACKNOWLEDGEMENT_UNKNOWN` is not a confirmed rollback and must not trigger automatic replay. The Viewer blocks additional capture submission in that instance until explicit reconnect/relaunch, then refreshes Demo Buy before the user decides whether to submit a new observation.

Phase 1 does not add a durable idempotency/replay subsystem solely for this rare local disconnect race. Reopen this decision only if implementation/recovery evidence shows explicit refresh reconciliation is materially inadequate.

The current service's per-connection FIFO and shared serialized writer remain intact. `capturedAtMs` is assigned only inside the actual writer operation, so browser click time and time waiting behind earlier work are not virtual-buy authority.

## D-US-028 — AI Investigation is a local forensic evidence export with mandatory anti-hindsight separation

**Status:** resolved

AI Investigation is part of the current pre-local-acceptance Demo Buy increment.

It does not call an AI provider, store an AI key, autonomously edit SQL or turn Market Flow US into an AI trading agent.

For one captured target it generates a deterministic local evidence pack containing:

```text
exact immutable Scanner SQL
bounded frozen original Scanner comparison context
30-minute pre-buy target history
exact linked baseline
10-minute post-buy target history
trusted Demo Buy horizon outcomes
field-semantics guide
anti-hindsight investigation prompt
```

Prediction-time evidence and outcome evidence are explicitly separated. Proposed Scanner improvements must cite evidence that existed by capture time; future evidence may explain the result and generate hypotheses but may not be leaked backward as though it were predictive input.

The retained Scanner context is intentionally bounded. A target outside the retained first 50 rows remains investigable, but the pack marks `targetInScannerContext=false` and the prompt forbids fabricated peer/rank reconstruction.

The exporter writes only beneath the controlled ignored local export root, accepts no browser-supplied path, uses temporary-directory + atomic-final-rename publication, never mutates DuckDB authority and never overwrites an existing successful pack. Failure leaves no misleading final bundle.

The trusted Demo Buy evaluator is reused for `OUTCOME.json`; a second horizon algorithm is forbidden.

## D-US-029 — New-day rollover accepts valid pre-feature v3 or post-feature v4 and always creates fresh v4

**Status:** resolved

After Demo Buy/schema-v4 ships, the operational new-day command must support an installed user who still has either:

```text
valid Market Flow US schema v3 active DB
valid Market Flow US schema v4 active DB
```

The source DB is inspected without mutation. v1/v2, missing required tables, partial/corrupt v3/v4 state and running producer sessions fail closed.

The rollover then:

```text
read scanner_saved_queries
→ create temporary fresh schema-v4 DB
→ seed saved queries transactionally
→ archive/move the original DB as-is
→ atomically install the fresh v4 DB
```

Only saved Scanner queries cross the new-day boundary. Market authority, Demo Buy captures/items/context and incomplete horizons never copy into the new active DB.

A v4 archive remains self-contained with its referenced history and Demo Buy forensic evidence. A v3 archive remains a valid historical pre-Demo-Buy Market Flow US database.
