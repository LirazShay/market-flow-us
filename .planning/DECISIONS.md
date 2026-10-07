# Market Flow US Planning Decisions

These are the current durable planning decisions. Later-numbered decisions supersede conflicting details in earlier ones.

## D-US-001 — Incremental conversion, not rewrite

**Status:** resolved

Preserve proven MarketScope architecture/behavior unless U.S. evidence or an explicit new capability requires change. Prefer boundary replacement plus regression proof over greenfield reconstruction.

## D-US-002 — Initial provider is ScreenerHulPaging3

**Status:** resolved

Use the authenticated browser's U.S. `ScreenerHulPaging3` endpoint with the extracted filters and current `pageCount=5000`. Provider-reported completeness is validated exactly; observed market counts are not product constants.

## D-US-003 — Canonical identity is validated PaperId

**Status:** resolved

After fail-closed source-type validation:

```text
securityId = String(PaperId)
```

Never key market-data authority by Symbol, row order, name or PaperIdYatab.

## D-US-004 — One U.S. response maps to one complete cycle

**Status:** resolved

Reuse the existing complete-cycle protocol/ACK/transaction path with one segment (`chunkIndex=0`, `chunk_count=1`). Do not redesign cycle authority.

## D-US-005 — Universe comes from every validated full response

**Status:** resolved

Same canonical membership reuses the current revision; changed membership replaces universe before committing that same response. Row reorder alone is not a membership change.

## D-US-006 — U.S. market schema v3 preserved proven history/latest mechanics

**Status:** resolved

Keep append-only active-day history, full latest replacement, serialized writer, complete-cycle transaction and saved-query table. MarketScope v1/v2 are incompatible and are never semantically converted.

## D-US-007 — U.S. projection remains source-shaped

**Status:** resolved

Promote the documented U.S. source fields and always retain raw data. Do not strengthen empirical meanings such as `Price`, `DailyVolume`, `PaperMarketCap` or `TradeDateTime` without evidence.

## D-US-008 — Current/Detail preserve the proven UX model

**Status:** resolved

Use U.S. columns while retaining deterministic sorting, null/zero semantics, Detail/History paging/retry/navigation and display-name fallback.

## D-US-009 — Strategy authority remains editable Scanner SQL

**Status:** resolved

No Strategy Engine or hard-coded survivor/ranking service. Built-ins are ordinary editable SQL, including the staged-candidate example.

## D-US-010 — No temporal precompute by default

**Status:** resolved

Do not add predecessor columns, materialized short-window deltas, dynamic horizon schema or temporal-feature engine before intended-use measurement proves direct history reads materially insufficient.

## D-US-011 — 4096 × 180 is target-machine heavy evidence, not hosted-CI authority

**Status:** resolved

Heavy profile remains 4096 synthetic securities × 180 cycles. Hosted CI is correctness-first with bounded smoke/width checks; target-machine acceptance owns heavy timing PASS/FAIL.

## D-US-012 — 3000 ms is an initial demo cadence only

**Status:** resolved

The offline/demo cadence is configuration, not a provider SLA or proof that sustained live polling is safe.

## D-US-013 — Complete Market Flow US branding

**Status:** resolved

Canonical product/package/artifact identities use `Market Flow US` / `market-flow-us`, including DB/runtime/bookmarklet/launcher names. Donor naming remains historical provenance only.

## D-US-014 — Preserve Scanner security and query-library ownership

**Status:** resolved

Keep SELECT-only prepared admission, zero parameters, side-effect rejection, hardened connection, Node-owned saved-query persistence and browser Draft/Persisted/Active isolation.

## D-US-015 — Fake Market changes provider shape, not test architecture

**Status:** resolved

Use the normal loopback HTTP fake/runtime/service/DuckDB path with deterministic U.S. screener scenarios. Reuse one configurable synthetic generator instead of separate giant fixture families.

## D-US-016 — Authenticated verification is bounded/local

**Status:** resolved

No live bank CI. Keep a static/closed-market smoke distinct from a final market-open moving-provider gate. Reports remain sanitized and SHA-bound.

## D-US-017 — Planning order is contracts → TREE → review → allocation → freeze

**Status:** resolved

Implementation allocation/authorization follows exhaustive audit, coherent durable contracts, S&T decomposition, necessity/sufficiency/KISS/outside-in reviews and final freeze.

## D-US-018 — Normal-runtime U.S. cutover occurred at TREE 5.2

**Status:** resolved

Pre-cutover seams staged U.S. components without breaking normal Browser CI. `5.2` became the sole normal-runtime activation boundary; `7.3` completed superseded runtime cleanup.

## D-US-019 — Final acceptance is deterministic-local first, target-machine/provider last

**Status:** resolved

Sequence:

```text
deterministic candidate
→ reusable local Fake Leumi acceptance
→ release closure
→ final target-machine/authenticated acceptance
```

Synthetic movement never substitutes for real-provider movement; hosted timing never substitutes for target-machine performance.

## D-US-020 — Recurring automation speed is an engineering requirement

**Status:** resolved

Remove duplicated/setup/synchronization waste before accepting slow recurring verification. Do not hide avoidable slowness with larger timeouts/retries or weakened proof.

## D-US-021 — One configurable synthetic generator drives fake/load evidence

**Status:** resolved

Reuse one deterministic configurable U.S. generator at the narrowest useful layer: provider fake, direct persistence, direct read/Scanner seeding and full integration.

## D-US-022 — Active market authority is one trading day

**Status:** resolved

The production active DB is day-bounded. Prior days may archive; new day starts fresh market authority while saved Scanner queries survive. No multi-day analytics warehouse is introduced.

## D-US-023 — Demo Buy is validation evidence, not simulated execution

**Status:** resolved

Phase 1 supports manual selected/all/Top-X and session-only Auto All/Top-X observations. Demo Buy itself does not add orders, manual buy price, fills, portfolio state, fees/slippage, sell rules, quantity, liquidity proof or aggregate strategy scoring. Repeated later capture of the same security is valid because observations are not positions.

The later branch-8 standalone IBKR sidecar does not change this Demo Buy invariant.

## D-US-024 — Demo Buy uses additive schema v4, exact baseline linkage and direct trusted reads

**Status:** resolved

Schema v4 adds only `demo_buy_captures` and `demo_buy_items` on top of proven v3 market authority.

Each item links:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

No user-supplied buy price or persisted horizon results exist.

`buy_cycle_id` is also the capture-time authority watermark because market commits and capture share the serialized writer.

For horizon H, the future row is the first row satisfying:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= captured_at_ms + H
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

No background horizon updater/materialized result schema/new market DB/new market transport is added before evidence requires it.

## D-US-025 — Demo Buy + AI Investigation precede final target-machine acceptance

**Status:** resolved; sequence extended by D-US-039, D-US-040 and D-US-048

Completed migration leaves through `7.3` remain historical evidence. The prior sequence implemented Demo Buy/AI, then `7.5`, then began `7.4`.

Branch `8` was later requested before `7.4` completed, branch `9` Market Recording + Replay was requested before `7.4` resumed, and the later hardening/basic-BUY extension is now owned by D-US-048.

## D-US-026 — Capture preserves original Scanner meaning under bounded provenance

**Status:** resolved

Selection is source-row-first:

```text
Selected / All / first X source rows
→ validate every chosen identity
→ browser dedupe by first chosen canonical ID
→ preserve original 1-based resultRank
```

Node requires unique ordered payload and never silently repairs it.

Authoritative bounds are in `docs/DEMO_BUY_PROTOCOL_LIMITS.md`:

```text
items <= 5000
source SQL <= 1 MiB UTF-8
context source rows <= 50
retained columns <= 64 total, canonical identity mandatory
textual/serialized cell <= 128 UTF-8 bytes after deterministic clipping
serialized context JSON <= 256 KiB UTF-8
```

Node cross-checks every selected position <=50 against the retained context position+identity. Scanner may remain usable when a generation is not Demo-Buy-capturable; capture fails visibly rather than silently changing evidence.

## D-US-027 — Lost capture ACK is unknown, not failure

**Status:** resolved

Capture outcomes are:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

Unknown acknowledgement is never auto-replayed. Recovery is explicit reconnect/relaunch + Demo Buy refresh before another capture. Phase 1 adds no durable capture idempotency subsystem solely for this rare local race.

Per-connection FIFO/shared writer remain intact; `capturedAtMs` is assigned only inside the actual serialized capture operation.

## D-US-028 — AI Investigation is local anti-hindsight forensic export

**Status:** resolved

No AI provider/API key/cloud upload/automatic SQL mutation.

For one Demo Buy target the pack contains exact query, bounded original Scanner context-derived evidence, prediction-time target history, exact baseline, post-capture history, trusted horizon outcomes, field guide and disciplined prompt.

Prediction-time authority requires `cycle_id <= buy_cycle_id`; outcome evidence requires `cycle_id > buy_cycle_id`. Future facts may explain outcome and generate hypotheses but may never be presented as original predictive inputs.

Targets outside retained Top-50 remain investigable with `targetInScannerContext=false` and explicit limits on peer reconstruction.

Exporter writes atomically under a controlled ignored local root and never mutates DuckDB.

## D-US-029 — New-day accepts valid v3 or v4 and always installs fresh v4

**Status:** resolved

Source DB is inspected without mutation. v1/v2, running producer ownership and suspicious/corrupt states fail closed.

Flow:

```text
read saved queries
→ build temporary fresh schema-v4 DB
→ seed saved queries transactionally
→ optionally archive/move source as-is
→ atomically install fresh v4 active DB
```

Market/Demo Buy evidence does not copy into the new day. v4 archives remain self-contained; v3 archives remain valid pre-Demo-Buy history.

## D-US-030 — Demo Buy UX is explicit about background work, progressive evidence and bounded interaction

**Status:** resolved

Auto mode is persistent cross-surface Viewer-session state with direct Off control; enabling/changing Auto affects only future Scanner generations. Turning Off does not cancel an already dispatched capture.

Scanner gains a **resumable** `Stop recurring scan` behavior using the existing scheduler seam; terminal Viewer destruction remains separate. While stopped, no new generations or Auto attempts occur; later Activate works normally.

Demo Buy renders capture groups with sticky identity/baseline context and one compact horizon cell per horizon. `NO_FUTURE_OBSERVATION` is shown as Pending, while baseline/future-price problems are warning-style unavailable states.

`Refresh latest` resets to the first keyset page; `Load more` continues the current walk. `demo.buy.observation.get(captureId, securityId)` refreshes one older observation in place so Auto cannot push the item out of inspectable reach.

AI Investigation uses one Viewer-wide export slot, relative product export paths and clipboard fallback. A lost export ACK may be safely regenerated after reconnect because export is non-mutating and collision-safe.

## D-US-031 — Wall-clock timestamps are diagnostics; writer/cycle ordering is authority

**Status:** resolved

Scanner start/completion, market collection and capture timestamps are useful forensic diagnostics but can regress under system-clock adjustment.

Preserve raw timestamps. Derive duration/latency/age only when non-negative; otherwise return null plus a bounded timing-anomaly indicator. Do not reject a valid capture or reorder authority because of wall-clock anomalies.

Market authority at capture is determined by `buy_cycle_id` and serialized writer order.

## D-US-032 — Scanner resultRank is returned position, not semantic rank by itself

**Status:** resolved

`resultRank` / `result_rank` preserves the original 1-based row position returned by the exact Scanner generation. It remains useful provenance even when the query has no meaningful ranking.

Neither the Viewer nor AI Investigation may infer “best”, “top-ranked”, score quality or strategy preference from that position alone. The AI prompt must inspect the exact SQL first and may use ranking language only when deterministic `ORDER BY`/tie-break logic establishes that interpretation.

For unordered or ambiguously ordered SQL, the pack must explicitly call the value **returned position** and treat peer/ranking conclusions as unproven. This correction requires no SQL parser or new subsystem; it is an interpretation/presentation invariant backed by ordered-vs-unordered regression tests.

## D-US-033 — AI Investigation exports sharing-safe evidence, not raw local rows

**Status:** resolved

Demo Buy persistence keeps the full local provenance needed for correctness, but AI Investigation packs are designed for optional external sharing and therefore must derive a separate deterministic sharing-safe projection before writing files.

History/baseline files include only authority keys plus documented U.S. provider/source market fields and provider `raw_data`; system-owned operational/session fields such as `session_id`, producer/session/config/error/request metadata, `source_metadata_json` and absolute host paths are excluded.

Scanner context keeps structural metadata, canonical identity, numeric/null/boolean values and documented market-text columns. Other string/array/object contents are not exported and are represented only by bounded metadata with `redactedForSharing=true`. Redacted content may not leak through prompt, README, manifest, response metadata or diagnostics.

Exact Scanner SQL remains user-authored content and is exported verbatim; the UI/README must visibly remind the user not to put secrets in SQL and to review generated files before sharing.

This is an export-projection rule, not a second database or sanitization subsystem. Regression tests use canary operational/session/string values and require their byte sequences to be absent from every generated shareable artifact and response surface.

## D-US-034 — IBKR execution is a standalone sidecar, not Scanner execution

**Status:** resolved

Branch `8` introduces one separate Node 24 process on `127.0.0.1:8770` using the first-party Interactive Brokers Client Portal Web API through Client Portal Gateway.

Scanner, Demo Buy, AI Investigation and Current do not automatically submit orders. The later basic Detail BUY integration consumes the sidecar's stable local API through a trusted Node-owned seam instead of bypassing it to call IBKR directly.

The existing market-data database remains authoritative for market analysis.

## D-US-035 — DRY_RUN is default; LIVE requires independent local and provider gates

**Status:** resolved

`DRY_RUN` must never reach the provider submit endpoint.

Actual submit requires all independent gates:

```text
valid authenticated local caller
process explicitly LIVE-enabled
request explicitly executionMode=LIVE
valid brokerage session
tradable runtime account
provider permission
unambiguous instrument
snapshot preflight
successful what-if
local validation / no-short-opening SELL guard
```

Missing any gate is a diagnosable rejection, never a fallback/bypass. Provider reply questions are surfaced explicitly; unknown questions fail closed.

## D-US-036 — Loopback is not authorization

**Status:** resolved

An order-capable localhost HTTP service must defend against hostile browser-origin traffic.

Every endpoint except strictly non-sensitive `GET /health` requires a high-entropy per-run local caller credential before provider/order logic. Browser `Origin` requests are rejected by default; wildcard/credentialed CORS is forbidden.

The token is never hard-coded, committed, persisted, logged, reported or sent to IBKR and is invalidated by process exit.

This local caller gate is independent from LIVE/provider permission checks.

## D-US-037 — Order creation is restart-safe and acknowledgement-unknown never blind-retries

**Status:** resolved

`requestId` is mandatory.

```text
same requestId + same normalized intent
→ return/reconcile existing local result

same requestId + different normalized intent
→ reject
```

Transport loss after provider submit produces `ACKNOWLEDGEMENT_UNKNOWN` unless a conclusive result is known. It is neither rejection nor permission to resubmit. The service reconciles provider open-order/trade state before any later explicit retry decision.

Use the smallest separate DuckDB store required for these facts; provider account identity, credentials, cookies/session tokens, caller token and raw authenticated responses are never persisted.

## D-US-038 — Initial execution scope is narrow U.S.-equity BUY/SELL with no short opening

**Status:** resolved

Initial normalized scope:

```text
STK / USD / SMART
BUY | SELL
LMT | MKT
DAY | GTC
positive finite quantity
```

`LMT` requires positive finite price; `MKT` forbids price.

Before LIVE SELL, the service must establish that requested quantity does not exceed the known long position. Unavailable/ambiguous position authority fails closed. This is a narrow safety guard, not a portfolio/risk engine.

Short selling, options/futures/FX, bracket/OCA/algo orders and leverage optimization remain out of scope.

## D-US-039 — Branch 8 reclosure precedes resuming final 7.4 acceptance

**Status:** resolved; superseded for sequencing by D-US-040 and D-US-048

The user requested the standalone IBKR mini-project after `7.5` was done and while `7.4` final acceptance was still unfinished.

Branch `8` completed and produced a reclosed candidate. Before `7.4` resumed, the user requested branch `9` Market Recording + Replay. The later hardening/basic-BUY extension is now owned by D-US-048; all branch-8 implementation evidence remains valid for what it proved.

## D-US-040 — Branch 9 Replay reclosure precedes resuming final 7.4 acceptance

**Status:** resolved; superseded for current sequencing by D-US-048

The completed sequence was:

```text
preserve completed branch 1–8 implementation/evidence
→ keep 7.4 blocked/not-done
→ implement 9.1–9.4
→ implement 9.5 deterministic Replay reclosure
→ pin exact post-branch-9 product candidate
```

That post-branch-9 candidate remains valid historical evidence, but final `7.4` now waits for the later `9.6` hardening and `8.5` basic BUY extension defined by D-US-048.

## D-US-041 — Replay records validated browser snapshots, not DB state

**Status:** resolved

Recording authority is the already-validated U.S. browser snapshot boundary before Node/DuckDB authority.

Only complete validated snapshots become immutable recording frames. Recordings preserve provider market values and enough membership/timing metadata to reconstruct the normal U.S. collection candidate later.

Do not record DuckDB tables/cycle IDs, Viewer/Scanner/Demo Buy state, DOM/auth/session/account material or raw authenticated browser dumps.

Portable recordings use a versioned streaming-friendly line-oriented format with manifest/frame/footer agreement; malformed, truncated or unsupported files fail closed.

## D-US-042 — Replay is a normal producer with external time rebasing

**Status:** resolved

The existing Market Flow US service and shared producer protocol remain replay-unaware. No replay mode, virtual clock, seek, speed, recording ID or load/reset operation is added to them.

Initial playback is `1x` using the exact observed gaps between validated recorded frames. Provider/source fields stay unchanged. Local collection/cycle/chunk/security timestamps that live acquisition would stamp locally are rebased coherently to current wall-clock time before normal ProducerBridge emission.

Pause emits no frames. Resume establishes a new contemporary timing segment while preserving the remaining inter-frame delay. A real pause may therefore appear as a real gap in replay history; this is preferable to a hidden server clock.

## D-US-043 — Seek means fresh replay start, never hidden warm-up

**Status:** resolved

Seek resolves to a real recorded frame boundary and starts a fresh replay DB/session at that frame. No earlier frame is fast-forwarded or pre-rolled through the server.

Missing prior 10s/20s/2m history after seek is a valid condition equivalent to starting the live application at that market time. If an existing query/surface crashes solely because prior history is absent, fix it as a generic live-start defect rather than adding replay-specific history synthesis.

## D-US-044 — Replay Host owns lifecycle only and fails closed on foreign processes/data

**Status:** resolved

A small loopback Replay Host may orchestrate the unchanged market-data service for seek/reset, but it is not a market-data server.

It may control only a service child it spawned and replay-only DB artifacts it explicitly owns. If the intended port/path is occupied or ambiguous, it fails closed. It never attaches to, stops, kills, opens, resets or deletes an unrelated process or the normal live DB.

The Host uses exact allowed Origin plus an ephemeral per-run control credential and never accepts/persists market frames, writes market DuckDB tables, translates producer messages or executes Scanner SQL.

## D-US-045 — Replay stays opt-in and does not tax ordinary verification

**Status:** resolved

Replay uses a dedicated browser entry/artifact, operator launcher and focused deterministic proof. Existing `RUN_TESTS.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `START_DEMO.cmd` and `START_MARKET_FLOW_US.cmd` keep their current semantics.

Timing is proved primarily with deterministic/fake clocks plus a short real-wall-clock integration smoke. Multi-hour real-time playback is not a CI/local prerequisite. Existing Fast/Browser/Planning/Workload evidence remains required where materially affected, but Replay-specific waiting must not silently inflate ordinary local verification.

## D-US-046 — Replay hardening is an adversarial re-audit, not a new Replay feature

**Status:** resolved

After `9.5` completed, the user requested a pre-user-run audit intended to find likely defects before relying on manual testing. This work belongs to new leaf `9.6` and is governed by `docs/REPLAY_HARDENING.md`.

Hardening must combine static review and executable proof across recording, IndexedDB, portable parsing/file source, Player scheduling/rebase/generation cancellation, ProducerBridge ACK flow, Replay Host ownership/security/lifecycle, unchanged service seams, replay DB isolation, product surfaces and operator/diagnostic paths.

A green pre-existing suite is not enough when static review finds an unproved material risk. Any such risk receives the smallest deterministic proof. Any discovered blocking defect stays in `9.6` through root cause → fix → regression proof → affected verification → green.

The audit does not justify new Replay capability. Shared server/protocol remains replay-unaware and ordinary launch/test semantics stay unchanged.

## D-US-047 — Basic in-product BUY uses immutable preparation plus trusted local confirmation

**Status:** resolved

The first integrated order feature is intentionally narrow and belongs to `8.5` under `docs/BASIC_BUY_INTEGRATION.md`:

```text
current Detail only
BUY only
run-configured positive quantity
STK / USD / SMART
MKT / DAY
DRY_RUN by default; LIVE only by explicit operator opt-in
```

The authenticated provider page is not an execution trust boundary. It never receives the `ibkr-order-service` caller token, cannot call the sidecar through CORS, and cannot submit arbitrary normalized order JSON through a generic Viewer proxy.

Viewer/WebSocket may only prepare an immutable short-lived ticket from `securityId`. Node resolves authoritative current `Symbol`, owns quantity/mode/fixed order dimensions and performs zero sidecar/provider mutation during preparation.

Actual mutation requires a separate product-owned loopback confirmation page with explicit human confirmation, short-lived immutable ticket, anti-CSRF nonce/custom header, same local Origin and bounded JSON-only mutation. The market process may call the existing sidecar only with the caller token it received from the child it actually spawned through the existing IPC ready seam.

One server-generated `requestId` is bound to the prepared immutable intent. Double-click/response retry reuses that exact ID; acknowledgement-unknown never creates a fresh automatic submit. Existing Branch-8 DRY_RUN/LIVE/provider/reply/idempotency/reconciliation authority remains unchanged.

Normal launch, Replay, Scanner, Demo Buy, AI Investigation and Current remain execution-disabled.

## D-US-048 — Current continuation is Replay hardening → basic BUY → final 7.4, with allocation order distinct from dependency truth

**Status:** resolved; superseded for current sequencing by D-US-049

The user explicitly requested Replay hardening before the first basic BUY integration and both before final target-machine acceptance.

The completed extension order was:

```text
completed historical leaves through 9.5
→ 9.6 Replay hardening
→ 8.5 basic in-product BUY integration
→ 7.6 combined pre-acceptance code audit/reclosure
```

This serial order was an execution-allocation decision, not a claim that `8.5` technically required `9.6`. Historical dependency truth remains valid for the completed work. The next current sequencing authority is D-US-049.

## D-US-049 — Test-system hardening is branch-7 release/reclosure work and blocks final 7.4

**Status:** resolved

The focused verification mini-project belongs under branch `7` as `7.7`, not as a new product capability branch. It hardens evidence, determinism, maintainability and recurring feedback for the already-built product before user-dependent acceptance.

Current sequence is:

```text
completed historical implementation/reclosure through 7.6.5 / 8.5 / 9.6
→ 7.7 verification-system hardening and completeness reclosure
→ 7.4 final target-machine/provider acceptance
```

`7.4` therefore depends directly on `7.7.4` in addition to its existing historical dependencies. Target-machine/authenticated/provider truth remains owned by `7.4`; `7.7` must not relabel synthetic or hosted evidence as final provider success.

## D-US-050 — Comprehensive coverage means contract/risk completeness, not arbitrary source-percentage completion

**Status:** resolved

Verification completeness is judged outside-in against durable contracts and material risks. For each applicable capability/boundary, the audit considers normal behavior, boundary/invalid input, failure, restart/recovery/lifecycle, race/concurrency, security/privacy, user-visible semantics and material performance/load behavior.

A material item is complete only when it has an authoritative proof owner, an explicit justified `TARGET_ONLY`/not-applicable disposition, or a routed blocking gap that remains open until closed. The planning coverage ledger is current-cycle closure evidence; `docs/TEST_STRATEGY.md` remains the durable verification-policy authority.

Line/branch/source coverage may be used as secondary gap-finding telemetry when useful and cheap, but no arbitrary percentage—including 100%—becomes release authority or substitutes for contract/risk proof.

## D-US-051 — Each recurring proof has one authoritative execution owner; acceptance may reuse exact fresh evidence

**Status:** resolved

Unit, real-service integration, Chromium composition, specialized Replay/Order/Workload gates and target-machine acceptance have distinct proof responsibilities. A recurring lower-layer proof should have one authoritative execution owner for each relevant source/helper/config change; duplicate execution requires independent evidence value, not a second label.

Named Local Acceptance/FR evidence may be derived from an already-executed authoritative test only when identity, candidate SHA/run, completeness and freshness are fail-closed. Standalone acceptance commands must still execute their scenario when invoked independently. Replay lower-layer deduplication is legal only after Fast reliably owns those unit/service proofs for every relevant change and release/reclosure requires both same-candidate evidence families.

## D-US-052 — Verification optimization is root-cause first; dependency truth is separate from execution order

**Status:** resolved

Recurring-cost optimization order is:

```text
referenced timers / process tails / fixed waits
→ duplicate execution
→ unnecessary setup/bootstrap/fixture work
→ oversized data at the wrong layer
→ topology/cache/setup improvements
→ concurrency only after isolation/repeat/stress evidence
```

Do not increase timeouts/retries/workers first, convert authoritative real integration to mocks merely for speed, or globally share mutable DB/service state without contamination/order-independence proof. The known Replay Host losing-timeout lifecycle defect is owned by `7.7.2.1` through root cause, regression, analogous-area sweep and affected verification.

S&T `depends_on` records genuine engineering prerequisites only. Serial Chat allocation may choose a safer merge/execution order among technically parallel leaves, but must not encode that preference as a false dependency. Any CI warning/error encountered during hardening remains blocking until full RCA, reusable prevention/analogous-area sweep and closing evidence are recorded.