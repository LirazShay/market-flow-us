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

Never key authority by Symbol, row order, name or PaperIdYatab.

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

Phase 1 supports manual selected/all/Top-X and session-only Auto All/Top-X observations. It does not add orders, manual buy price, fills, portfolio state, fees/slippage, sell rules, quantity, liquidity proof or aggregate strategy scoring. Repeated later capture of the same security is valid because observations are not positions.

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

No background horizon updater/materialized result schema/new DB/new transport is added before evidence requires it.

## D-US-025 — Demo Buy + AI Investigation precede final target-machine acceptance

**Status:** resolved

Completed migration leaves through `7.3` remain historical evidence. Current sequence is:

```text
implement Demo Buy backend/read authority
→ Scanner/Demo Buy UX
→ AI Investigation exporter/UI
→ post-feature deterministic re-closure 7.5
→ final target-machine/authenticated 7.4
```

Final acceptance must run on the exact post-feature candidate.

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
