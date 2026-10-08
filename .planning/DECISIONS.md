# Market Flow US Planning Decisions

This register preserves durable product, architecture, security, verification and operational decisions. Later-numbered decisions supersede conflicting details in earlier ones.

Authority boundaries under ST Planner 2.0:

- `.planning/PLAN.md` is planning / S&T truth.
- `.planning/EXECUTION.md` is task / owner / status / dependency / result truth.
- this file preserves supporting decision rationale and supersession history; it does not own execution state.

`D-US-017` was intentionally retired during the ST Planner 2.0 migration because it described only ST Planner 1.x ceremony (`TREE -> review -> allocation -> freeze/authorization`) and had no independent product, architecture or operational meaning. Decision IDs are not renumbered.

## D-US-001 — Incremental conversion, not rewrite

**Status:** resolved

Preserve proven MarketScope architecture/behavior unless U.S. evidence or an explicit new capability requires change. Prefer boundary replacement plus regression proof over greenfield reconstruction.

## D-US-002 — Initial provider is ScreenerHulPaging3

**Status:** resolved

Use the authenticated browser's U.S. `ScreenerHulPaging3` endpoint with the extracted filters and current `pageCount=5000`. Provider-reported completeness is validated exactly; observed market counts are not product constants.

## D-US-003 — Canonical identity is validated PaperId

**Status:** resolved

After fail-closed source-type validation, `securityId = String(PaperId)`. Never key market-data authority by Symbol, row order, name or PaperIdYatab.

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

Promote documented U.S. source fields and always retain raw data. Do not strengthen empirical meanings such as `Price`, `DailyVolume`, `PaperMarketCap` or `TradeDateTime` without evidence.

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

No live-provider CI. Keep a static/closed-market smoke distinct from a final market-open moving-provider gate. Reports remain sanitized and SHA-bound.

## D-US-018 — Normal-runtime U.S. cutover occurred at 5.2

**Status:** resolved

Pre-cutover seams staged U.S. components without breaking normal Browser CI. `5.2` became the sole normal-runtime activation boundary; `7.3` completed superseded runtime cleanup.

## D-US-019 — Final acceptance is deterministic-local first, target-machine/provider last

**Status:** resolved

Sequence remains deterministic candidate -> reusable local Fake acceptance -> release closure -> final target-machine/authenticated acceptance. Synthetic movement never substitutes for real-provider movement; hosted timing never substitutes for target-machine performance.

## D-US-020 — Recurring automation speed is an engineering requirement

**Status:** resolved

Remove duplicated setup/synchronization waste before accepting slow recurring verification. Do not hide avoidable slowness with larger timeouts/retries or weakened proof.

## D-US-021 — One configurable synthetic generator drives fake/load evidence

**Status:** resolved

Reuse one deterministic configurable U.S. generator at the narrowest useful layer: provider fake, direct persistence, direct read/Scanner seeding and full integration.

## D-US-022 — Active market authority is one trading day

**Status:** resolved

The production active DB is day-bounded. Prior days may archive; new day starts fresh market authority while saved Scanner queries survive. No multi-day analytics warehouse is introduced.

## D-US-023 — Demo Buy is validation evidence, not simulated execution

**Status:** resolved

Phase 1 supports manual Selected/All/Top-X and session-only Auto All/Top-X observations. Demo Buy itself does not add orders, manual buy price, fills, portfolio state, fees/slippage, sell rules, quantity, liquidity proof or aggregate strategy scoring. Repeated later capture of the same security is valid because observations are not positions. The standalone IBKR sidecar and later Detail BUY integration do not change this invariant.

## D-US-024 — Demo Buy uses additive schema v4, exact baseline linkage and direct trusted reads

**Status:** resolved

Schema v4 adds only `demo_buy_captures` and `demo_buy_items` on top of proven v3 market authority. Each item links `(buy_cycle_id, security_id) -> history(cycle_id, security_id)`; no user-supplied buy price or persisted horizon results exist.

`buy_cycle_id` is both the exact baseline cycle and the capture-time authority watermark because market commits and capture share the serialized writer. For horizon H, the future row is the first row for the same security satisfying `cycle_id > buy_cycle_id` and `collected_at_ms >= captured_at_ms + H`, ordered by `collected_at_ms ASC, cycle_id ASC`.

No background horizon updater, materialized result schema, new market DB or new market transport is added before evidence requires it.

## D-US-025 — Demo Buy + AI Investigation precede final target-machine acceptance

**Status:** resolved; sequencing later extended by D-US-039, D-US-040 and D-US-048

Completed migration leaves through `7.3` remain historical evidence. Demo Buy/AI were implemented and reclosed before final target-machine acceptance; later branch 8, branch 9, hardening, Basic BUY and the final pre-acceptance code audit were also inserted before `7.4` without invalidating the completed evidence they did not supersede.

## D-US-026 — Capture preserves original Scanner meaning under bounded provenance

**Status:** resolved

Selection is source-row-first: Selected / All / first X source rows -> validate every chosen identity -> browser dedupe by first chosen canonical ID -> preserve original 1-based `resultRank`. Node requires unique ordered payload and never silently repairs it.

Authoritative bounds remain:

- items <= 5000;
- source SQL <= 1 MiB UTF-8;
- context source rows <= 50;
- retained columns <= 64 total, canonical identity mandatory;
- textual/serialized cell <= 128 UTF-8 bytes after deterministic clipping;
- serialized context JSON <= 256 KiB UTF-8.

Node cross-checks every selected position <=50 against retained context position+identity. Scanner may remain usable when a generation is not Demo-Buy-capturable; capture fails visibly rather than silently changing evidence.

## D-US-027 — Lost capture ACK is unknown, not failure

**Status:** resolved

Capture outcomes are `CONFIRMED_COMMITTED`, `CONFIRMED_REJECTED` or `ACKNOWLEDGEMENT_UNKNOWN`. Unknown acknowledgement is never auto-replayed. Recovery is explicit reconnect/relaunch + Demo Buy refresh before another capture; no durable capture-idempotency subsystem is added solely for this rare local race. Per-connection FIFO/shared writer remain intact and `capturedAtMs` is assigned only inside the serialized capture operation.

## D-US-028 — AI Investigation is local anti-hindsight forensic export

**Status:** resolved

No AI provider/API key/cloud upload/automatic SQL mutation. For one Demo Buy target the pack contains exact query, bounded Scanner context-derived evidence, prediction-time target history, exact baseline, post-capture history, trusted horizon outcomes, field guide and disciplined prompt.

Prediction-time authority requires `cycle_id <= buy_cycle_id`; outcome evidence requires `cycle_id > buy_cycle_id`. Future facts may explain outcome and generate hypotheses but may never be presented as original predictive inputs. Targets outside retained Top-50 remain investigable with `targetInScannerContext=false`. Export is atomic under a controlled ignored local root and never mutates DuckDB.

## D-US-029 — New-day accepts valid v3 or v4 and always installs fresh v4

**Status:** resolved

Inspect source DB without mutation; v1/v2, running producer ownership and suspicious/corrupt states fail closed. Read saved queries -> build temporary fresh schema-v4 DB -> seed saved queries transactionally -> optionally archive/move source as-is -> atomically install fresh v4 active DB. Market/Demo Buy evidence does not copy into the new day.

## D-US-030 — Demo Buy UX is explicit about background work, progressive evidence and bounded interaction

**Status:** resolved

Auto is persistent cross-surface Viewer-session state with direct Off control; changes affect only future Scanner generations and do not pretend to cancel an already-dispatched capture. Scanner has resumable `Stop recurring scan`, distinct from terminal Viewer destruction.

Demo Buy remains capture-grouped with sticky identity/baseline context and compact horizon cells. `NO_FUTURE_OBSERVATION` is Pending; non-temporal unavailable reasons remain explicit warnings. `Refresh latest` resets first page, `Load more` continues the keyset walk, and targeted observation refresh keeps an older item inspectable while Auto adds newer captures. AI Investigation uses one Viewer-wide export slot, relative product paths and clipboard fallback; lost export ACK may be regenerated because export is non-mutating and collision-safe.

## D-US-031 — Wall-clock timestamps are diagnostics; writer/cycle ordering is authority

**Status:** resolved

Scanner start/completion, market collection and capture wall-clock times are forensic diagnostics and may regress under system-clock adjustment. Preserve raw timestamps; derived duration/latency/age is null plus bounded anomaly indication when negative. Market authority at capture is determined by `buy_cycle_id` and serialized writer order.

## D-US-032 — Scanner resultRank is returned position, not semantic rank by itself

**Status:** resolved

`resultRank` / `result_rank` is the original 1-based row position returned by the exact Scanner generation. Viewer and AI Investigation may not infer best/top-ranked/quality/preference from position alone. Ranking language is allowed only when the exact SQL provides deterministic ordering/tie-break semantics; otherwise the value is explicitly a returned position.

## D-US-033 — AI Investigation exports sharing-safe evidence, not raw local rows

**Status:** resolved

Local persistence keeps full correctness provenance, but shareable AI packs derive a separate deterministic sharing-safe projection. History/baseline exports allowlist authority keys + documented provider market fields + provider `raw_data` while excluding system-owned session/producer/config/error/request/source-metadata/path fields.

Scanner context preserves structural metadata, identity, numeric/null/boolean and documented market-text values. Other string/array/object contents become bounded redaction metadata with `redactedForSharing=true`; redacted bytes may not leak through files, prompt, README, manifest, response metadata or diagnostics. Exact Scanner SQL remains verbatim user-authored content and the UI/README warns the user to review it before sharing.

## D-US-034 — IBKR execution is a standalone sidecar, not Scanner execution

**Status:** resolved

Branch 8 uses a separate Node 24 process on `127.0.0.1:8770` using the first-party Interactive Brokers Client Portal Web API through Client Portal Gateway. Scanner, Demo Buy, AI Investigation and Current do not automatically submit orders. The basic Detail BUY integration consumes the sidecar through a trusted Node-owned seam instead of bypassing it. Market-data DuckDB remains authority for market analysis.

## D-US-035 — DRY_RUN is default; LIVE requires independent local and provider gates

**Status:** resolved

`DRY_RUN` must never reach provider submit. Actual submit requires authenticated local caller, process LIVE opt-in, request LIVE opt-in, valid brokerage session, tradable runtime account, provider permission, unambiguous instrument, snapshot preflight, successful what-if and local validation including the no-short-opening SELL guard. Missing any gate is a diagnosable rejection; unknown provider questions fail closed.

## D-US-036 — Loopback is not authorization

**Status:** resolved

Every order-service endpoint except strictly non-sensitive `GET /health` requires a high-entropy per-run local caller credential before provider/order logic. Browser Origin requests are rejected by default; wildcard/credentialed CORS is forbidden. The credential is never hard-coded, committed, persisted, logged, reported or sent to IBKR and dies with the process. This gate is independent from LIVE/provider permission checks.

## D-US-037 — Order creation is restart-safe and acknowledgement-unknown never blind-retries

**Status:** resolved

`requestId` is mandatory. Same requestId + same normalized intent returns/reconciles the existing local result; same requestId + different intent rejects. Transport loss after provider submit becomes `ACKNOWLEDGEMENT_UNKNOWN` unless a conclusive result is known and never authorizes blind resubmit. Provider state is reconciled before any later explicit retry decision.

Use the smallest separate DuckDB store required for execution facts. Provider account identity, credentials, cookies/session tokens, caller token and raw authenticated responses are never persisted.

## D-US-038 — Initial execution scope is narrow U.S.-equity BUY/SELL with no short opening

**Status:** resolved

Initial normalized scope is `STK / USD / SMART`, `BUY | SELL`, `LMT | MKT`, `DAY | GTC`, positive finite quantity. LMT requires positive finite price; MKT forbids price. Before LIVE SELL the service must establish requested quantity does not exceed known long position; unavailable/ambiguous position authority fails closed. Short selling, options/futures/FX, bracket/OCA/algo orders and leverage optimization remain out of scope.

## D-US-039 — Branch 8 reclosure preceded resuming final acceptance

**Status:** resolved; superseded for sequencing by D-US-040 and D-US-048

The standalone IBKR mini-project was requested after `7.5` while `7.4` was unfinished. Branch 8 completed and produced a reclosed candidate. Later branch 9 and subsequent extensions superseded that candidate as final-candidate authority, while branch-8 evidence remains valid for what it proved.

## D-US-040 — Branch 9 Replay reclosure preceded resuming final acceptance

**Status:** resolved; superseded for current sequencing by D-US-048

Completed branch 1–8 evidence was preserved; `7.4` remained unfinished while `9.1–9.5` implemented and reclosed Replay. That post-branch-9 candidate remains historical evidence but was superseded as final-candidate authority by later hardening, Basic BUY and final code-audit work.

## D-US-041 — Replay records validated browser snapshots, not DB state

**Status:** resolved

Recording authority is the already-validated U.S. browser snapshot boundary before Node/DuckDB authority. Only complete validated snapshots become immutable frames. Do not record DuckDB tables/cycle IDs, Viewer/Scanner/Demo Buy state, DOM/auth/session/account material or raw authenticated browser dumps. Portable recordings use a versioned streaming-friendly line-oriented manifest/frame/footer format and malformed/truncated/unsupported files fail closed.

## D-US-042 — Replay is a normal producer with external time rebasing

**Status:** resolved

The normal service/shared producer protocol remain replay-unaware: no replay mode, virtual clock, seek, speed, recording ID or load/reset operation. Initial playback is exactly `1x` using recorded inter-frame gaps. Provider/source fields remain unchanged while locally owned collection/cycle/chunk/security timestamps are coherently rebased to current wall-clock time before normal ProducerBridge emission. Pause emits nothing; Resume starts a contemporary segment while preserving remaining delay.

## D-US-043 — Seek means fresh replay start, never hidden warm-up

**Status:** resolved

Seek resolves to a real recorded frame boundary and starts a fresh replay DB/session at that frame. No earlier frame is fast-forwarded or pre-rolled. Missing prior anchors are valid live-start-like state; crashes caused only by missing prior history are fixed as generic live-start defects, not by replay-specific synthesis.

## D-US-044 — Replay Host owns lifecycle only and fails closed on foreign processes/data

**Status:** resolved

Replay Host may orchestrate the unchanged market-data service for seek/reset but is not a market-data server. It controls only a child it spawned and replay-only DB artifacts it explicitly owns. Occupied/ambiguous port/path fails closed; it never attaches to/stops/kills/opens/resets/deletes unrelated processes or normal live DB data. Control requires exact allowed Origin plus ephemeral per-run credential; Host never persists market frames or executes Scanner SQL.

## D-US-045 — Replay stays opt-in and does not tax ordinary verification

**Status:** resolved

Replay has dedicated entry/artifact/launcher and focused proof. Existing ordinary launch/test commands retain their semantics. Timing proof is deterministic/fake-clock first plus a short real-wall-clock smoke; multi-hour playback is not a normal CI/local prerequisite. Replay-specific waits must not silently inflate recurring verification.

## D-US-046 — Replay hardening is an adversarial re-audit, not a new Replay feature

**Status:** resolved

`9.6` statically and executably audits the completed Replay path across recording, IndexedDB, portable parsing/file source, Player scheduling/rebase/generation cancellation, ProducerBridge ACK flow, Replay Host ownership/security/lifecycle, unchanged service seams, replay DB isolation, product surfaces and operator/diagnostic paths. A pre-existing green suite does not close a newly identified material risk; every blocker stays with the audit through root cause -> fix -> regression proof -> affected verification -> green. Hardening does not add speculative Replay capability.

## D-US-047 — Basic in-product BUY uses immutable preparation plus trusted local confirmation

**Status:** resolved

The first integrated order feature is deliberately narrow: current Detail only, BUY only, run-configured positive quantity, `STK / USD / SMART`, `MKT / DAY`, DRY_RUN by default and LIVE only through explicit operator opt-in.

The authenticated provider page is not an execution trust boundary and never receives the sidecar caller token. Viewer/WebSocket may only prepare an immutable short-lived ticket from `securityId`; Node resolves current `Symbol` and owns quantity/mode/fixed order dimensions with zero provider/order mutation during preparation.

Actual mutation requires the separate product-owned loopback confirmation page with explicit human confirmation, immutable short-lived ticket, anti-CSRF nonce/custom header, same local Origin and bounded JSON-only mutation. A stable server-generated `requestId` is bound to the intent; double-click/retry reuses it and acknowledgement-unknown never creates a new automatic submit. Normal launch, Replay, Scanner, Demo Buy, AI Investigation and Current remain execution-disabled.

## D-US-048 — Extension sequencing is history; dependency truth remains structural

**Status:** resolved; current dependency truth is in `.planning/EXECUTION.md`

The user requested Replay hardening before Basic BUY and both before final target-machine acceptance. That requested implementation sequence completed as:

```text
completed historical leaves through 9.5
-> 9.6 Replay hardening
-> 8.5 basic in-product BUY integration
-> 7.6.1-7.6.5 final staged code audit / deterministic reclosure
-> 7.4 final target-machine/provider acceptance
```

The serial work order never creates false technical dependencies. Current real execution dependencies are owned only by `.planning/EXECUTION.md`; in particular, `8.5` remains technically dependent on `3.3 + 8.4`, while `7.4` depends on the completed release/replay/BUY/audit prerequisites including `7.6.5`.

The historical post-Branch-9 candidate `243f4f2e78e434378ff2202ba95af7b8626a0369` remains provenance only. The current exact final-acceptance runtime candidate is owned by `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` / `.planning/FINAL_ACCEPTANCE_EXECUTION.md` and is not inferred from planning-document commits.

## Decision audit result for ST Planner 2.0 migration

- Durable decisions preserved: `D-US-001`–`D-US-016`, `D-US-018`–`D-US-048`.
- Retired as V1 ceremony-only: `D-US-017`.
- No decision owns task status, owner or dependency truth; `.planning/EXECUTION.md` does.
- No decision owns S&T structure; `.planning/PLAN.md` does.
- Superseded sequencing decisions remain only where they explain still-relevant product/release history.
