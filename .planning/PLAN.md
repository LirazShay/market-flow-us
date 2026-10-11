# Market Flow US — Plan

`.planning/PLAN.md` is the authoritative ST Planner 2.0 planning / S&T document for Market Flow US.

Execution ownership, live status, real execution dependencies and result/evidence truth live only in `.planning/EXECUTION.md`. Root `STATUS.yaml` may project navigation state for compatibility, but it is not an authority. This document intentionally contains no freeze, authorization, allocation, handoff, review-cycle or planner-runtime state.

## Desired outcome

Market Flow US is a locally runnable U.S.-market product with four deliberately separated capability lanes:

1. **Market analysis and strategy validation** — authenticated U.S. provider snapshots → exact validation → normal ProducerBridge → localhost Node.js service → active-day DuckDB → Current / Detail-History / editable Scanner SQL → Demo Buy → deterministic local AI Investigation evidence.
2. **Order execution** — a standalone local Interactive Brokers order-service sidecar with authenticated localhost caller protection, DRY_RUN by default, fail-closed LIVE gates, restart-safe idempotency and explicit BUY/SELL lifecycle; the product has one deliberately narrow current-Detail BUY consumer through a trusted local confirmation boundary.
3. **Market Recording + Replay** — validated browser snapshots → IndexedDB and/or portable recording → 1x Player → unchanged normal ProducerBridge/service path → isolated replay-only DuckDB → the same analytical surfaces.
4. **Historical Backtest Lab** — existing active/archive Market Flow US DuckDB evidence → isolated read-only historical query context → unchanged Scanner SQL → post-decision outcome evaluation → beginner-first Inspect / Compare / Sweep investigation, without requiring a provider page, Collector, Replay, order service or open market.

These lanes remain intentionally separated. Scanner, Demo Buy, AI Investigation and Current never automatically place orders. Replay never turns the normal market service into a replay-aware service. Backtest never becomes a producer, never mutates market authority and never becomes an order/fill/portfolio simulator.

## Current reality and completion boundary

The repository contains completed implementation and deterministic reclosure evidence for the U.S. migration, Demo Buy, AI Investigation, standalone order service, Basic Detail BUY integration, Market Recording + Replay, Replay hardening and the staged pre-acceptance code audit. Final target-machine/provider acceptance remains deferred as non-blocking backlog work. Backtest Lab is the newly planned active feature scope and is not implemented yet.

The exact runtime candidate currently referenced by deferred final acceptance is:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

`FINAL_ACCEPTANCE_RUNBOOK.md` and `FINAL_ACCEPTANCE_EXECUTION.md` own the acceptance procedure/evidence. `.planning/EXECUTION.md` owns live task/owner/status once new Backtest leaves are explicitly allocated. This PLAN does not duplicate that execution state.

## Constraints and non-goals

- Preserve proven mechanisms unless current evidence requires change; prefer boundary adaptation over rewrite.
- Canonical market identity is `String(PaperId)` only after fail-closed source-type validation.
- Preserve raw provider rows and source-shaped U.S. fields; do not invent stronger financial semantics than evidence supports.
- Scanner SQL remains editable strategy authority. No hard-coded Strategy Engine.
- Active market authority is one trading day; saved Scanner queries survive new-day rotation, market/Demo Buy evidence does not.
- Demo Buy is analytical validation evidence, not an order/fill/position/portfolio simulator.
- Demo Buy baseline authority is `(buy_cycle_id, security_id) -> history(cycle_id, security_id)`; `buy_cycle_id` is the capture-time authority watermark.
- Wall-clock timestamps are diagnostics; serialized writer/cycle ordering is authority when clocks disagree.
- No speculative temporal precompute, background horizon jobs, second normal market-data transport/database, cross-day strategy warehouse or history index without measured evidence.
- AI Investigation is deterministic local evidence packaging only: no AI API key, cloud call, automatic upload or automatic SQL mutation.
- Shareable AI evidence is an explicit sharing-safe projection; local DB provenance is not automatically shareable.
- The order service is a separate loopback process. Loopback is not authorization; caller authentication and provider/LIVE gates are independent.
- DRY_RUN can never submit. LIVE submit is fail-closed unless all local, session, account, permission, instrument, snapshot, what-if and risk gates pass.
- Lost provider-submit acknowledgement is unknown, never rejection and never permission for blind resubmit.
- Initial execution scope remains narrow U.S. STK/USD/SMART BUY/SELL, LMT/MKT, DAY/GTC, with no short opening.
- The first in-product BUY is current-Detail only, BUY only, MKT/DAY, run-configured quantity, explicit human confirmation and no browser-visible sidecar credential.
- Replay records the validated browser snapshot boundary, not DB/DOM/auth state.
- Replay uses normal producer messages only. The normal service/shared protocol has no replay mode, virtual clock, seek/reset API or playback-speed protocol.
- Replay `Seek` and Play-after-Stop start a fresh replay-owned service/DB at a real recorded frame with zero hidden preroll/fast-forward.
- Replay Host controls only the service child and replay artifacts it owns; foreign process/path conflicts fail closed.
- Replay-specific real-time waits remain opt-in; ordinary verification must not silently become slow.
- Backtest source DBs are immutable evidence: no bootstrap, migration, stale-session recovery, saved-query writes, Demo Buy writes, market writes, rename/move/delete or repair.
- Backtest historical SQL sees only historical `latest` / `history`; no SQL text rewrite is used to inject time predicates and no underlying future source catalog remains reachable while user SQL executes.
- Backtest is comparison/research tooling, not an optimizer: no automatic winner, strategy Score, parameter search, capital/portfolio model, fee/slippage/fill simulation or cross-day result warehouse in the initial scope.
- All diagnostics, fixtures, recordings, reports and evidence remain public-safe: no credentials, cookies, auth/session data, real account identifiers or raw authenticated dumps.

## Root S&T

### Strategy

Deliver one complete local U.S.-market product that preserves the proven live analysis/validation model, keeps the isolated permission-gated IBKR execution boundary, supports Market Recording + Replay without contaminating live authority, and adds trustworthy offline historical strategy research without requiring live acquisition.

### Tactic

Complete ten necessary capability branches covering acquisition, market authority, trusted reads, Scanner/Demo Buy/AI Investigation, deterministic offline proof, operational tooling, deterministic release/audit/final acceptance, standalone IBKR execution plus the narrow Detail BUY integration, Market Recording + Replay plus adversarial hardening, and an isolated read-only Backtest Lab.

### Parallel assumptions

- Proven mechanisms are reused unless evidence requires change.
- Scanner SQL remains strategy authority; Demo Buy, AI Investigation and Backtest remain evidence/research layers.
- IBKR execution remains a separate local boundary; Basic BUY consumes it through a trusted Node-owned seam.
- Replay remains an external producer/orchestrator over the normal producer/service path.
- Backtest operates directly on product-owned active/archive DuckDB evidence rather than replaying it through the live producer path.

### Necessity

Each branch owns a capability that cannot be removed without losing an explicit product requirement: trustworthy acquisition, durable authority, inspectable reads, strategy learning, deterministic offline proof, operability/performance tooling, release/acceptance closure, safe execution, replayability, or deterministic historical query comparison while the live market/provider path is unavailable.

### Sufficiency

Branches 1–9 preserve the existing completed product capabilities. Branch 10 adds the newly requested historical research outcome through safe evidence access, truthful historical query execution, shared outcome evaluation, Inspect/Compare investigation, Sweep investigation and integrated offline reclosure. No new Strategy Engine, Replay semantics or order coupling is needed.

### Root success evidence

- Every implementation leaf satisfies the success evidence below.
- Current, Detail/History, Scanner, Demo Buy and AI Investigation operate over final schema-v4 market authority.
- Standalone IBKR BUY/SELL lifecycle is deterministically proven with authenticated localhost caller protection, public-safe diagnostics and restart-safe idempotency.
- Basic BUY is Detail-only, explicit, quantity-configured, MKT/DAY and uses a trusted local confirmation boundary without browser-visible sidecar credentials or automatic execution.
- Market Recording + Replay is adversarially hardened with no known material untested Replay risk before final acceptance.
- Backtest Lab can run offline over active/archive evidence, execute unchanged Scanner SQL with anti-lookahead, compare complete per-security outcomes, Sweep by seconds/minutes and drill any point back to exact evidence without mutating the source DB.
- Fast, Browser, affected product-specific and bounded Workload gates stay green without turning Replay/Backtest heavy workloads into ordinary-suite cost.
- Deferred final target-machine/provider acceptance, when explicitly activated later, runs on the latest intended runtime candidate; actual live IBKR submission is either proven when permission exists or recorded exactly as `PENDING_EXTERNAL_PERMISSION`.

---

## Branch 1 — Exact U.S. acquisition

**Strategy:** The browser repeatedly acquires one exact complete U.S. screener snapshot and shapes it into the existing producer-cycle contract.

**Tactic:** Use `ScreenerHulPaging3` with exact response validation and canonical `PaperId` membership while preserving Recorder lifecycle and one-segment cycle semantics.

**Necessity:** No downstream authority can be correct without exact U.S. acquisition.

**Sufficiency:** Provider validation plus Recorder/universe integration covers the acquisition boundary.

**Branch success evidence:** Provider/Recorder proof covers completeness, identity, membership changes, non-overlap and fail-closed behavior.

### 1.1 — Provider acquisition and validation

**Strategy:** Acquire and validate `ScreenerHulPaging3` exactly before authority.

**Tactic:** Use same-origin request/parser/validator preserving raw/source metadata and canonical `String(PaperId)` identity.

**Success evidence:** Unit proof covers complete response, count mismatch, malformed/HTTP failure, missing/duplicate PaperId, reorder and null/zero/missing fields.

### 1.2 — Recorder/universe integration

**Strategy:** Map every validated U.S. response to one coherent cycle with exact universe revisions.

**Tactic:** Preserve lifecycle/scheduling/ACK behavior; replace universe only on canonical membership change and commit the same response under the accepted revision.

**Success evidence:** Tests prove same/add/remove membership, row-order invariance, non-overlap, stop and provider-failure behavior.

---

## Branch 2 — Durable U.S. market authority

**Strategy:** Node/DuckDB stores U.S. market authority atomically under the proven schema, with Demo Buy extending that authority additively rather than rewriting it.

**Tactic:** Use the U.S. projection, exact cycle persistence and real-service producer authority.

**Necessity:** Validated browser data is not product authority until Node persists it atomically.

**Sufficiency:** Schema lifecycle, cycle persistence and producer integration jointly provide durable authority.

**Branch success evidence:** Fresh/reopen/reject and real-DuckDB commit/rollback evidence is green; later schema-v4 extension preserves the proven market mechanics.

### 2.1 — Base U.S. schema lifecycle

**Strategy:** Establish the original U.S. schema lifecycle and reject incompatible MarketScope data.

**Tactic:** Bootstrap documented U.S. tables plus saved queries and fail closed on legacy incompatible schemas. This leaf is historical base evidence; final product schema is v4 through 4.3.1.

**Success evidence:** Lifecycle tests prove base bootstrap/reopen/columns/saved queries/filename and incompatible-schema rejection.

### 2.2 — Transactional cycle persistence

**Strategy:** Persist one complete U.S. cycle as typed projections plus raw rows transactionally.

**Tactic:** Preserve serialized cycle allocation, history append, full latest replacement, session counters and rollback seams.

**Success evidence:** Real-DuckDB tests prove projection fidelity, exact membership, repeated commits and rollback preservation.

### 2.3 — End-to-end producer authority

**Strategy:** Producer ownership, universe revision and cycle ACKs work end-to-end through WebSocket/service/DuckDB.

**Tactic:** Adapt only U.S.-specific producer/config metadata and prove session/universe/commit/failure/restart integration.

**Success evidence:** Real-service tests cover first ACK+commit, revision changes, failure recording, heartbeat and restart.

---

## Branch 3 — Trusted reads and core Viewer surfaces

**Strategy:** Trusted reads and Viewer expose Current and Detail/History using U.S. authority fields.

**Tactic:** Adapt trusted read projections then Viewer surfaces while preserving paging, navigation, null handling and state restoration.

**Necessity:** Persisted U.S. authority must be inspectable through the product.

**Sufficiency:** Trusted reads plus Current and Detail/History cover non-Scanner inspection.

**Branch success evidence:** Service/browser proof covers U.S. shapes, historical-only lookup, paging and state.

### 3.1 — Trusted U.S. reads

**Strategy:** Node exposes canonical U.S. Current/Security/History/status reads.

**Tactic:** Use documented U.S. fields with deterministic identity ordering, historical-only resolution and 500-row keyset history paging.

**Success evidence:** Real-service tests cover empty/current/historical-only, row fields and cursor binding.

### 3.2 — Current

**Strategy:** Current presents the authoritative U.S. universe with required columns and preserved interaction state.

**Tactic:** Adapt Current model/surface to U.S. columns/display fallback while retaining refresh, diagnostics, navigation and sort/scroll restoration.

**Success evidence:** Unit/E2E prove columns, `DailyVolume DESC`, zero/missing formatting and state restoration.

### 3.3 — Detail/History

**Strategy:** Detail/History presents U.S. summary and durable paged history, including historical-only securities.

**Tactic:** Adapt Detail model/surface fields while preserving open/back, retry, paging and loaded-row retention.

**Success evidence:** Unit/E2E prove U.S. fields, continuation/retry, historical-only and return-state behavior.

---

## Branch 4 — Scanner, Demo Buy and AI Investigation

**Strategy:** Scanner remains editable strategy authority; Demo Buy validates short-horizon outcomes; AI Investigation exports bounded anti-hindsight evidence for improving Scanner SQL.

**Tactic:** Preserve Scanner, add explicit Demo Buy backend/UX, then deterministic local AI Investigation export/UX.

**Parallel assumptions:** No Strategy Engine or direct broker execution is introduced here. Demo Buy derives outcomes from existing history; AI Investigation packages evidence rather than becoming authority.

**Necessity:** Candidate selection, outcome validation and disciplined post-outcome investigation are all required by the current strategy-learning loop.

**Sufficiency:** 4.1–4.5 cover that loop without introducing Phase-2 liquidity/fillability or automated trading.

**Branch success evidence:** Existing Scanner stays green; schema v4 preserves minimum Demo Buy facts and bounded Scanner context; Demo Buy exposes trustworthy progressive outcomes; AI packs reproduce exact query provenance plus sharing-safe market/context evidence with anti-hindsight and neutral returned-position semantics.

### 4.1 — U.S. Scanner built-ins/query authoring

**Strategy:** Built-ins/query-authoring describe and execute U.S. schema correctly, including staged candidate ranking.

**Tactic:** Ship U.S. built-ins and align Scanner guide with actual schema.

**Success evidence:** Built-ins execute against real schema; staged fixture proves contiguous stage credit and deterministic tie-breakers.

### 4.2 — Scanner runtime and saved queries

**Strategy:** Scanner execution, scheduling, saved-query CRUD and Detail navigation remain functional after U.S. migration.

**Tactic:** Preserve admission, Draft/Persisted/Active isolation and recurring scheduler behavior.

**Success evidence:** Unit/service/E2E Scanner tests are green and active-generation isolation is preserved.

### Substrategy 4.3 — Demo Buy backend authority

**Strategy:** Schema stores Demo Buy facts/provenance, capture resolves the exact writer-ordered baseline, and trusted reads compute post-watermark outcomes.

**Tactic:** Separate schema/persistence, serialized capture/protocol authority and bounded evaluation/read-model responsibilities.

**Necessity:** Reliable Demo Buy requires durable facts, exact capture semantics and one calculation authority.

**Sufficiency:** 4.3.1–4.3.3 provide all backend facts/calculations required by Demo Buy and AI export.

#### 4.3.1 — Schema v4 / persistence

**Strategy:** Schema v4 durably stores minimum Demo Buy facts plus bounded original Scanner comparison provenance and safely upgrades valid U.S. v3 databases.

**Tactic:** Add `demo_buy_captures` / `demo_buy_items`, bounded `source_result_context_json`, transactional v3→v4 migration/fresh-v4 bootstrap, restart behavior and v3-or-v4 new-day rotation.

**Success evidence:** Fresh DB boots v4 with exact Demo Buy columns/constraints; valid v3→v4 preserves market authority and saved queries; suspicious partial structures fail closed; injected migration failure leaves v3 usable; context keeps first 50 source rows, canonical identity always, at most 64 retained columns, 128-byte textual/serialized-cell bound, deterministic truncation/omission metadata and at most 256 KiB serialized JSON; persisted context remains local forensic provenance, not automatically shareable; restart preserves active-day captures/context; new-day accepts valid v3/v4, optionally archives source unchanged, preserves saved queries and creates fresh v4 with empty Demo Buy tables; no speculative history index is added without workload evidence.

#### 4.3.2 — Capture authority / protocol

**Strategy:** Capture exact selected candidates, immutable Scanner provenance/context and the authoritative baseline visible at the serialized writer point.

**Tactic:** Add `demo.buy.capture` validation/client-service protocol and same-writer all-or-nothing persistence; browser submits ordered deduped `{securityId,resultRank}` plus bounded generation context.

**Success evidence:** Protocol/unit tests reject malformed/duplicate/out-of-range items, invalid bounds/mode, oversized SQL/context and context-position/identity mismatch; real-service tests prove all-or-nothing capture, original returned position, immutable query/timing/context provenance, monotonic capture IDs and exact `buy_cycle_id`; `captured_at_ms` is assigned inside serialized writer work and `buy_cycle_id` is the authority watermark; clock anomalies preserve raw timestamps and yield nullable derived timing + bounded anomaly diagnostics; lost transport acknowledgement is `ACKNOWLEDGEMENT_UNKNOWN` with no blind retry; capture stores no user-supplied/copied buy Price and mutates no market authority.

#### 4.3.3 — Evaluation/read model

**Strategy:** One authoritative Node read model answers what happened after each virtual buy at required horizons and can refresh either a page or one observation.

**Tactic:** Implement `demo.buy.page`, `demo.buy.observation.get` and `demo.buy.capture.get` using the same set-wise evaluator, exact baseline join, post-watermark first-at/after matching and bounded keyset paging.

**Success evidence:** Materially changed evaluation SQL passes static preflight; fixtures require future `cycle_id > buy_cycle_id` plus `collected_at_ms >= target` with deterministic tie-break; null/zero/unavailable-reason, delayed observation and baseline-integrity semantics are proven; page and targeted observation reuse identical evaluator semantics; targeted refresh does not reset pagination; ordering is `capture_id DESC`, `result_rank ASC`, fixed 50-item opaque keyset paging; each page is one transactionally consistent DuckDB read snapshot; no N×10 browser/read loop; capture SQL detail loads on demand; representative timing is measured before any precompute/index/background updater.

### Substrategy 4.4 — Demo Buy user workflow

**Strategy:** The user can create Demo Buys from Scanner and inspect progressive outcomes without hidden background behavior or losing the observation being investigated.

**Tactic:** Separate Scanner capture/Auto controls from a capture-grouped outcome surface with targeted refresh and explicit recovery states.

**Necessity:** Backend authority alone is not a usable strategy-validation product.

**Sufficiency:** Capture UX plus outcome screen cover candidate-to-outcome workflow and long-running Auto use.

#### 4.4.1 — Scanner capture / Auto / resumable Stop

**Strategy:** Convert the exact rendered Scanner generation into bounded manual/automatic captures without changing SQL order/provenance, while recurring scanning stays explicitly controllable.

**Tactic:** Add recognized-ID selection, synchronous generation snapshot, Selected/All/Top-X, Viewer-session Auto Off/All/Top-X, persistent Auto indicator/Turn off, one capture slot and resumable Stop recurring scan.

**Success evidence:** Exactly one recognized identity column is required; invalid rows are never silently included and checkbox interaction never opens Detail; selection occurs source-row-first before dedupe, preserves original returned positions, enforces 5000 unique items and reports source-row vs unique counts; capture freezes the displayed generation before async submission; Auto changes affect future successful generations only; zero-row is no-op; busy generations are skipped visibly rather than queued; persistent cross-surface Auto indicator directly disables future Auto; one capture slot prevents duplicate/unbounded capture and distinguishes committed/rejected/acknowledgement-unknown; Stop recurring scan cancels future scheduling/ignores stale in-flight results and later Activate works normally.

#### 4.4.2 — Progressive Demo Buy outcome UI

**Strategy:** A dedicated Demo Buy screen makes baseline and all requested future outcomes understandable and stable under continuing Auto capture.

**Tactic:** Use page/observation/capture-detail reads with capture grouping, sticky identity columns, compact horizon cells, Refresh latest, Refresh observation and Load more.

**Success evidence:** Unit/browser tests cover loading/empty/populated/first-page/continuation/provenance/targeted-refresh failures while preserving trustworthy prior data where possible; capture grouping preserves query/timing/mode context even across page splits; sticky identity/baseline plus ten compact horizon cells stay usable; `resultRank` is neutral returned Scanner Position unless SQL proves ranking; `NO_FUTURE_OBSERVATION` displays as Pending while non-temporal unavailable reasons remain explicit warnings; Refresh latest resets to first page, Load more appends stable continuation and Refresh observation updates one target in place while newer Auto captures arrive; provenance/SQL loads on demand and timing anomalies remain inspectable; E2E proves manual/Top-X/Auto, progressive completion, provenance immutability, acknowledgement-unknown recovery and lifecycle behavior.

### Substrategy 4.5 — AI Investigation

**Strategy:** Turn a Demo Buy observation into a reproducible local AI Investigation Pack without hindsight leakage, false ranking claims, accidental operational/session disclosure or automatic AI control.

**Tactic:** Build a deterministic Node evidence exporter with explicit sharing-safe projections, then expose generation/copy/regeneration from Demo Buy.

**Necessity:** Outcome inspection alone does not systematically explain why a query returned a candidate or what pre-buy evidence might improve SQL.

**Sufficiency:** Exporter + UI make forensic evidence usable while preserving human control, local privacy and explicit limitations.

#### 4.5.1 — Deterministic sharing-safe exporter

**Strategy:** Node generates a sharing-safe local evidence pack for one captured security.

**Tactic:** `demo.buy.ai-pack.create` validates membership/provenance, reuses the trusted evaluator, derives explicit sharing-safe history/context projections and atomically publishes a controlled export directory.

**Success evidence:** Prediction-time history is limited to `cycle_id <= buy_cycle_id` and 30-minute window; outcome history requires `cycle_id > buy_cycle_id` and ends at capture+10m; COMPLETE_OUTCOME requires committed post-watermark evidence reaching 10m, otherwise PARTIAL_OUTCOME; Scanner context preserves first-50 order/positions and bounded truncation metadata while position>50 remains investigable with `targetInScannerContext=false`; shareable history/baseline allowlist authority keys + documented market fields/raw_data and omit session/producer/config/error/request/source-metadata/path fields; Scanner context preserves structural metadata, identity, numeric/null/boolean and documented market text while arbitrary string/array/object content becomes bounded redaction metadata only; canary sensitive/operational/arbitrary text is absent byte-for-byte from all files/prompt/response/diagnostics; prompt enforces prediction/outcome separation, returned-position discipline, fact/derived/hypothesis labeling, minimal SQL proposals and multi-observation validation; bundle contains README/PROMPT/MANIFEST/QUERY/SCANNER_CONTEXT/TARGET_BEFORE/BASELINE/TARGET_AFTER/OUTCOME/FIELD_GUIDE; exact user SQL remains verbatim with pre-share warning; export path is product-owned and atomic temp→rename, browser supplies no path, successful packs are not overwritten; response is bounded metadata/prompt only; lost export ACK is safely regenerable; generation mutates no DB authority and is measured without a second transport/worker.

#### 4.5.2 — AI Investigation Viewer workflow

**Strategy:** Demo Buy UI lets the user investigate one observation, generate/copy/regenerate a pack and understand evidence/sharing limitations locally.

**Tactic:** Add Investigate-with-AI panel, targeted refresh, one Viewer-wide export slot, partial/complete/context-coverage state, neutral returned-position wording, pre-share warning, relative path and clipboard fallbacks.

**Success evidence:** Panel shows target identity/returned position, horizon progress, context coverage and PARTIAL/COMPLETE state; position 1 is never called best/top-ranked unless exact SQL ordering proves it; UI warns that exact Scanner SQL and market evidence become shareable and no automatic upload occurs; only one export request may be in flight; response shows relative folder + file count; Copy Prompt/Path has selectable fallback; PARTIAL packs can regenerate after later evidence and lost export ACK permits regeneration; Chromium E2E proves ordered/unordered position-1 cases, sharing-safe boundaries, prompt copy, targeted refresh/regeneration and position>50 reduced-context case; no automatic AI call/upload/SQL activation exists.

---

## Branch 5 — Deterministic offline full-product proof

**Strategy:** Exercise the entire U.S. product deterministically offline through normal browser runtime, real service and synthetic provider.

**Tactic:** Use canonical U.S. Fake Market/runtime/E2E rather than test-only product paths.

**Necessity:** Unit/service proof cannot validate full browser composition.

**Sufficiency:** Fake provider + normal runtime + Chromium cover deterministic browser behavior.

### 5.1 — U.S. Fake Market

**Strategy:** Model the U.S. screener deterministically without authentication.

**Tactic:** Serve synthetic `ScreenerHulPaging3` scenarios from the shared generator.

**Success evidence:** Scenarios cover complete/static/reorder/add-remove/invalid/malformed/error/delay/movement and contain no private data.

### 5.2 — Normal runtime composition

**Strategy:** Compose U.S. provider, Recorder, Node authority and Viewer through normal runtime/demo.

**Tactic:** Wire the normal source graph to U.S. components while preserving service recovery and bounded demo reset.

**Success evidence:** Runtime/demo tests prove U.S. collection through real WebSocket/DuckDB and bounded reset/restart.

### 5.3 — Chromium end-to-end proof

**Strategy:** Prove complete U.S. user journey and failure/recovery in Chromium.

**Tactic:** Exercise normal runtime against U.S. Fake Market while preserving established state-machine coverage.

**Success evidence:** Full Browser suite is green for the core U.S. runtime journeys.

---

## Branch 6 — Packaging, diagnostics and scalable verification

**Strategy:** Make Market Flow US packaged, diagnosable and supplied with scalable correctness/performance tooling.

**Tactic:** Complete branding/launchers, diagnostics/live harness and configurable synthetic workload support.

**Necessity:** A working runtime is not release-ready without operability and scalable verification.

**Sufficiency:** Packaging + diagnostics + workload tooling prepare release verification.

### 6.1 — Packaging/branding

**Strategy:** Local setup/build/run artifacts and user docs consistently identify Market Flow US.

**Tactic:** Use canonical package/artifact/DB/global/launcher/docs names while preserving thin wrappers.

**Success evidence:** Build/launcher tests prove canonical names and paths.

### 6.2 — Diagnostics/live verification

**Strategy:** Diagnostics and SHA-bound live verification understand U.S. acquisition without exposing session data.

**Tactic:** Adapt checkpoints/reports/live harness to bounded `ScreenerHulPaging3` verification.

**Success evidence:** Sanitized diagnostics/live artifacts are proven and contain no private auth data.

### 6.3 — Workload tooling

**Strategy:** Scalable U.S. workload tooling proves correctness broadly and exposes target-machine performance profiles.

**Tactic:** Reuse the configurable synthetic generator for bounded CI, isolated probes and 4096×180 target profile.

**Success evidence:** Bounded correctness and isolated/heavy profiles are available with sanitized reports.

---

## Branch 7 — Reclosure, code audit and final acceptance

**Strategy:** Deterministically re-close every requested capability extension, perform one final scoped code-centric audit of the recent extension delta, then accept the exact final target-machine/provider candidate when that deferred backlog work is explicitly activated.

**Tactic:** Preserve completed U.S./Demo Buy/AI/order/Replay evidence, completed Replay hardening + Basic BUY and combined code audit; future final acceptance remains deferred until explicitly activated.

**Parallel assumptions:** Target-machine/authenticated checks remain external/user-dependent and do not block unrelated new development.

**Necessity:** Final acceptance, when activated, must run against the latest intended candidate with all then-current capabilities.

**Sufficiency:** Historical deterministic proof + Replay hardening + Basic BUY + completed pre-acceptance audit preserve the release evidence needed before future final acceptance.

### 7.1 — Deterministic release candidate

**Strategy:** One candidate passes offline correctness and bounded performance sanity.

**Tactic:** Run Fast/Browser/bounded workload and fix deterministic regressions.

**Success evidence:** Fast, Browser and bounded workload are green with no blocking deterministic defect.

### 7.2 — Local Fake acceptance package

**Strategy:** Deterministic local acceptance proves static/moving/failure/restart/load behavior.

**Tactic:** Reuse normal runtime/service/DuckDB and shared generator for one-command local acceptance profiles.

**Success evidence:** Acceptance covers static/moving/membership/failure/restart/probes/heavy-profile preparation without credentials.

### 7.3 — Repository/release coherence

**Strategy:** Repository truth, run instructions and runtime are operationally coherent.

**Tactic:** Complete U.S. migration/branding cleanup, daily lifecycle docs and merge readiness.

**Success evidence:** No authoritative Israel-only runtime path remains; docs/launchers/daily lifecycle/open-PR truth are coherent.

### 7.5 — Demo Buy/AI deterministic reclosure

**Strategy:** One post-Demo-Buy/AI candidate has coherent schema-v4 contracts/docs and passes deterministic repository gates.

**Tactic:** Align canonical/user/Scanner/AI docs, extend bounded workload/local acceptance, run deterministic gates, review/merge and retain the resulting historical candidate evidence.

**Success evidence:** Product/data/technical/test/Demo Buy/AI/User/Scanner docs matched implementation; Fast, Browser, Planning and bounded Workload were green; Local Fake proved progressive/targeted Demo Buy and AI generation/regeneration/sharing safety; reclosure PR/main CI were green. This remains historical evidence and is superseded only as final-candidate authority by later extensions.

### Substrategy 7.6 — Pre-acceptance code audit

**Strategy:** Review and deterministically re-close the complete recent extension delta so future final acceptance is not the first discovery point for material order/BUY/Replay/shared-integration defects.

**Tactic:** Execute five stages: exact delta inventory; order/BUY deep audit; Replay deep audit; shared integration audit; adversarial verification/reclosure, with root-cause fixes for every blocker.

**Necessity:** The user explicitly required serious staged review of all recently added feature code; combining branch 8 and 9 creates cross-feature seams not necessarily covered by feature-local review.

**Sufficiency:** 7.6.1–7.6.5 cover inventory, both major capability families, shared integration and deterministic reclosure without reopening unrelated historical implementation.

#### 7.6.1 — Exact audit inventory

**Strategy:** Begin from a complete exact inventory rather than headline-file sampling.

**Tactic:** Compare the post-Demo-Buy/AI baseline to current candidate, classify every production/runtime change, map each material file to governing contract/proof and identify cross-feature/under-proven seams.

**Success evidence:** Exact base/head and complete production/runtime inventory are recorded; every material file is classified as order, Basic BUY, Replay/Host, shared integration or packaging/verification; every material file has contract/risk/proof routing; initial audit matrix has explicit disposition.

#### 7.6.2 — Order/Basic BUY deep audit

**Strategy:** Review standalone IBKR execution + trusted Basic BUY consumer as one security/idempotency/lifecycle boundary.

**Tactic:** Review intent validation, caller security, LIVE gates, CPGW lifecycle, DuckDB idempotency/provider state, acknowledgement reconciliation, shutdown/restart, confirmation/CSRF, Node-only token ownership and child cleanup; add/fix deterministic regressions for material gaps.

**Success evidence:** Every material order/BUY production file is reviewed; security/LIVE/duplicate-retry/idempotency/reply/cancel/fill/ack-unknown/restart/token/child-ownership paths have deterministic proof; ordinary runtime/Scanner/Demo Buy/AI/Replay cannot execute except the explicit trusted Detail BUY composition; no known material order/BUY defect or unproved material risk remains.

#### 7.6.3 — Replay deep audit

**Strategy:** Re-read recording/Replay/Host as final combined code, including error, cleanup and race paths beyond feature happy paths.

**Tactic:** Review recorder/storage/portable source/Player/ProducerBridge/Host/coordinator/UI/launcher code against Replay contracts/hardening and add/fix deterministic regressions for material gaps.

**Success evidence:** Every material Replay production file is reviewed; malformed/storage/quota, scheduling/generation races, Stop/Play/Seek/Pause, Host credentials/process ownership, fresh-DB/isolation and progressive missing-history paths have proof; shared service/protocol stays replay-unaware and live DB/process authority untouched; no known material Replay defect or unproved material risk remains.

#### 7.6.4 — Shared integration audit

**Strategy:** Review shared code changed by new features for cross-feature regressions.

**Tactic:** Audit service config/index/service, Viewer client/Detail, shared protocol/diagnostics, launchers/build/package/New Trading Day and CI/test routing; prove ordinary runtime, analytical surfaces and ownership remain correct.

**Success evidence:** Normal launcher remains execution-disabled and Replay opt-in/external; BUY exposes no generic Viewer order proxy/browser sidecar credential; Replay/order/new-day DB/process ownership remains disjoint and fail-closed; Detail/History/Current/Scanner/Demo Buy/AI have affected regression proof; diagnostics stay sanitized; no test-only production bypass; no known material shared-integration defect or unproved risk remains.

#### 7.6.5 — Final deterministic reclosure

**Strategy:** Pin one exact candidate after code audit/fixes before target-machine acceptance resumes.

**Tactic:** Run focused regressions plus full unit/service/order/replay acceptance, browser/replay builds, Chromium, materially affected Local Fake/Planning/bounded Workload; inspect recurring cost, final diff, PR/main CI and open-PR state; pin exact audited runtime SHA.

**Success evidence:** Unit, service, Replay acceptance, order acceptance, browser build, replay build and Chromium are green; materially affected Local Fake, planning-doc and Workload sanity are green without redundant long work; audit report records range/defects/RCA/fixes/regressions/stage dispositions/candidate; audit PR/main CI/open-PR state are clean; deferred final acceptance can later select the latest intended runtime candidate.

### 7.4 — Final target-machine/provider acceptance

**Strategy:** Accept the exact final intended candidate on the user's target machine through local day-bounded market proof, Replay usability/isolation, AI Investigation usability, Basic Detail BUY compatibility, standalone IBKR compatibility, authenticated static compatibility and market-open movement.

**Tactic:** When backlog item `B-US-000` is explicitly activated, select the then-current intended candidate, reconcile the runbook, run final target-machine local market/order/replay acceptance first, then authenticated market-data static smoke and market-open SHA-bound gate; real IBKR live-order proof runs only when external permission exists.

**Success evidence:** This work is intentionally deferred to non-blocking backlog and is not represented as current execution until explicitly planned/allocated again.

---

## Branch 8 — Standalone IBKR execution + Basic Detail BUY

**Strategy:** Keep a standalone integration-ready IBKR BUY/SELL order service and add one deliberately narrow user-confirmed in-product BUY consumer without merging execution authority into Scanner or ordinary browser runtime.

**Tactic:** Preserve completed 8.1–8.4 standalone authority/security/provider/reclosure, then add Detail-only BUY preparation + trusted local confirmation consuming the existing sidecar.

**Parallel assumptions:** Existing market-analysis runtime remains independently runnable. Scanner, Demo Buy, AI Investigation, Current and Replay do not automatically submit broker orders.

**Necessity:** The product needs a first usable in-product BUY while preserving the completed sidecar security boundary.

**Sufficiency:** 8.1–8.4 provide execution authority; 8.5 is sufficient for the requested basic integration without a strategy execution engine.

### 8.1 — Local order authority / DRY_RUN core

**Strategy:** Standalone Node 24 order service owns strict normalized intents, authenticated localhost access, deterministic DRY_RUN and restart-safe local idempotency without requiring live trading permission.

**Tactic:** Implement loopback HTTP API, ephemeral caller token/origin/body security, intent validation/fingerprinting, minimal separate DuckDB execution store and deterministic fake adapter.

**Success evidence:** Exact STK/USD/SMART BUY/SELL LMT/MKT DAY/GTC validation and fake payload shaping; loopback-only `127.0.0.1:8770`; protected endpoints require high-entropy per-run caller auth and reject browser Origin/default CORS/unsupported or oversized bodies before adapter calls; DRY_RUN cannot submit; `requestId` same-intent is idempotent, different-intent reuse rejects, restart preserves safe facts and invalidates token; no credentials/cookies/session tokens/account IDs/caller token/raw auth dumps in persistence/diagnostics.

### 8.2 — Real CPGW lifecycle and LIVE gates

**Strategy:** Speak the documented Client Portal Web API lifecycle while remaining fail-closed whenever any local/provider gate is missing.

**Tactic:** Implement session/accounts/instrument/snapshot/what-if/submit/reply/orders/trades/cancel/keepalive, independent LIVE gates, SELL long-position guard and acknowledgement-unknown reconciliation.

**Success evidence:** Adapter proof covers complete lifecycle with sanitized failures; submit is impossible unless caller auth + process LIVE + request LIVE + session + tradable account + permission + exact instrument + snapshot + successful what-if + local guards pass; REPLY_REQUIRED is explicit and unknown questions fail closed; pre-submit failures are conclusive, post-submit transport loss is ACKNOWLEDGEMENT_UNKNOWN and never blind-resubmitted; cancel/partial/full fill remain distinct; LIVE SELL fails closed without sufficient unambiguous long coverage; any localhost TLS exception is scoped only to that client.

### 8.3 — Operator/integration boundary

**Strategy:** Make the standalone service operable on Windows and expose one stable future-integration API without coupling market analysis to live execution.

**Tactic:** Add thin launcher/docs/config, explicit DRY_RUN/LIVE startup, deterministic standalone acceptance and authenticated local API documentation.

**Success evidence:** DRY_RUN default and deliberate LIVE opt-in; committed config contains no provider auth/account material; service starts/stops independently and token is never persisted/logged; deterministic acceptance proves auth failure, BUY/SELL preview, restart idempotency, fake-LIVE submit/reply/ack-unknown/cancel/fills/no-short/sanitized stop; docs forbid direct Scanner/Demo Buy/AI provider calls; real CPGW session compatibility can be checked without order permission.

### 8.4 — Standalone order reclosure

**Strategy:** One exact post-order-service candidate has coherent contracts/docs and passes all permission-independent deterministic gates.

**Tactic:** Align implementation/docs, run focused order proof + affected broad gates/local acceptance, review/merge, require green main and retain exact candidate evidence.

**Success evidence:** Product/technical/test/order/security docs match implementation; focused order tests plus affected Fast/Browser/Planning/bounded Workload are green; market-analysis Local Fake and standalone order acceptance are green with sanitized reports; no blocking defect/unexpected open PR; implementation/reclosure PR/main CI are green; real order proof remains explicitly `PENDING_EXTERNAL_PERMISSION` when unavailable.

### 8.5 — Basic in-product BUY

**Strategy:** Let a user explicitly create one basic BUY from current Detail without exposing sidecar credential to browser code or turning analysis runtime into automatic trading.

**Tactic:** Dedicated BUY-enabled composition with run-owned quantity/mode, Node-owned `order.buy.prepare({securityId})`, immutable short-lived tickets, trusted loopback confirmation and delegation to existing authenticated order service through IPC-provided caller token.

**Success evidence:** Normal launcher starts no order child/exposes no BUY; BUY launcher validates positive quantity, defaults DRY_RUN and requires explicit LIVE opt-in; only current Detail is eligible; Node resolves authoritative Symbol and fixes STK/USD/SMART BUY MKT DAY + quantity/mode; prepare performs no provider/sidecar mutation and returns only ticket/reference + display-safe summary; caller token remains Node-memory-only and provider Origin cannot call sidecar/execute through Viewer WebSocket; confirmation requires same local Origin, immutable ticket, anti-CSRF nonce/custom header and explicit confirmation, rejecting expired/reused/wrong/cross-origin/form attempts before sidecar call; stable server-generated requestId makes double-click/retry one logical order; DRY_RUN proves zero submit and synthetic LIVE proof preserves all independent gates/reply/rejection/ack-unknown semantics; Replay/Scanner/Demo Buy/AI remain execution-disabled and affected deterministic gates stay green.

---

## Branch 9 — Market Recording + Replay + hardening

**Strategy:** Capture validated real-market snapshots into portable recordings and later replay them interactively through the unchanged normal producer/service path so the complete analytical product works when the real market is unavailable, then adversarially harden that path before final acceptance.

**Tactic:** Preserve completed recording/storage/portable/player/Host/reclosure behavior, then execute Replay hardening as static + executable audit with RCA/fix/regression for every material defect.

**Parallel assumptions:** Normal live service/protocol remains replay-unaware; acquisition/ProducerBridge/Viewer/DuckDB/Scanner/Demo Buy authority are reused; Replay tests remain opt-in and do not silently lengthen ordinary verification.

**Necessity:** The user needs likely Replay problems found before relying on first serious target-machine use; lifecycle/error/race paths need explicit hardening beyond feature happy paths.

**Sufficiency:** 9.1–9.5 provide the capability and 9.6 adversarially audits/fixes/recloses that exact capability.

### 9.1 — Validated browser recording / IndexedDB

**Strategy:** Create trustworthy immutable recordings from the exact validated U.S. snapshot boundary even when local Market Flow service is not running.

**Tactic:** Dedicated Replay browser entry/build reuses provider validation, writes only complete validated frames + bounded metadata to IndexedDB and exposes Record/Stop/library/delete/quota state with fail-safe storage behavior.

**Success evidence:** Unit/browser proof records only complete validated snapshots in deterministic order and preserves membership changes + irregular timing; provider/incomplete-frame failure never creates apparently valid frame; IndexedDB stop/reopen/library/delete is deterministic and quota/write failure preserves prior committed frames then stops visibly; UI exposes duration/frame count/approx bytes/storage estimate without treating quota as guarantee; recordings/diagnostics contain no credentials/cookies/auth/session/account IDs/request headers/private DOM/storage/raw authenticated dumps.

### 9.2 — Portable streaming format / file source

**Strategy:** Move recordings safely between IndexedDB and disk and validate/search/replay large portable files without whole-recording memory or browser-storage duplication.

**Tactic:** Versioned line-oriented manifest/frame/footer format, streaming IndexedDB export, fail-closed import/file validation, direct File-backed source with lightweight seek index and one common recording-source abstraction.

**Success evidence:** Format tests prove version/manifest/frame/footer agreement, exact order/timing/provider values and reject truncated/malformed/unsupported/duplicated/out-of-order/count-mismatch files; large export streams rather than building giant JSON; selected portable file can be playable/indexed without full IndexedDB copy; seek index resolves real frame boundaries and IndexedDB/file sources have equivalent semantics; export never auto-deletes browser copy.

### 9.3 — 1x Player through normal ProducerBridge

**Strategy:** Emit any valid recording at 1x through existing ProducerBridge while rebasing locally owned timestamps to contemporary time and preserving source cadence/facts.

**Tactic:** Play/Pause/Stop/progress/seek-position state, deterministic scheduler/generation cancellation, segment-based local-time rebasing and projection into normal producer session/universe/cycle/ACK flow.

**Success evidence:** Fake-clock/unit proof preserves irregular gaps, coherent intra-frame timestamp ordering and exact source values while rebasing local timestamps; Pause emits no frames/freezes position, Resume starts contemporary segment preserving remaining delay; Stop/Seek/Pause generation changes prevent stale emission; producer uses only existing protocol messages/ACK/error semantics and shared server contains no replay concept; UI exposes Play/Pause/Stop, seekable progress, position/duration, frame progress and readiness at exactly 1x.

### 9.4 — Isolated Replay Host / fresh-run lifecycle

**Strategy:** Interactive Seek, Play-after-Stop and full-product Replay operate over isolated fresh replay-owned service/DB without granting reset authority to normal server or risking live process/data.

**Tactic:** Small loopback Host with exact Origin + ephemeral control credential spawns/stops only its own unchanged service child using existing `--db/--port/--allowed-origin`, resets only owned replay DB artifacts, provides bounded one-run bootstrap/pairing and composes the existing Viewer.

**Success evidence:** Host binds loopback, requires exact Origin + ephemeral credential and emits bounded public-safe lifecycle diagnostics; launcher/UI provides usable one-run pairing with no repository/browser/durable-config persistence or secret logging and rejects unauthorized/stale credentials; Host controls only its child and owned replay DB artifacts, failing closed on occupied/ambiguous port/path and never killing/opening/resetting unrelated process/data; Seek stops producer/owned child, installs fresh replay DB/session, snaps to a real frame and emits it first with zero hidden preroll; Stop closes current run and later Play resets fresh DB/session, while Pause/Resume keeps same run; normal live DB and ordinary launchers remain untouched; Current/Detail/History/Scanner/Demo Buy/AI work over replay DB with no `isReplay` server query; mid-recording first frame is legal and missing staged anchors simply remain absent until naturally supplied.

### 9.5 — Replay deterministic reclosure

**Strategy:** One exact post-Replay candidate has coherent contracts/docs and deterministic proof that Replay behaves like live startup where intended without contaminating ordinary verification or final-candidate truth.

**Tactic:** Complete focused recording/file/player/Host/browser acceptance, next-day and arbitrary-start proof, classify/fix generic live-start defects, run only materially affected broad gates, review/merge, require green main and retain exact post-Replay candidate evidence.

**Success evidence:** Focused recording/format/IndexedDB/file-source/Player/Host unit/service/browser proof is green with sanitized synthetic fixtures; Stop→Play fresh-run, one-run credential bootstrap/rejection, Seek reset and Pause/Resume same-run are proven; mid-recording fresh DB proves Current after first commit, History only emitted frames, Scanner missing-history tolerance/progressive anchors and Demo Buy future evidence only later replay cycles; day-A recording on day-B proves contemporary local timing, unchanged provider values, working Scanner time-delta and coherent Demo Buy timing; missing-history crash is fixed only as generic live-start defect; ordinary launch/test semantics remain unchanged and Replay waits stay dedicated; generic product/data/technical/test/Replay docs match implementation; implementation/reclosure PR/main CI/open-PR state are clean and exact candidate is preserved.

### 9.6 — Replay adversarial hardening

**Strategy:** Adversarially audit and repair the completed Replay implementation before user reliance so no known material Replay defect or materially unproved risk remains behind earlier green tests.

**Tactic:** Execute static and executable matrix across recording/IndexedDB/portable source/Player/ProducerBridge/Host/service/surfaces/packaging, root-cause every blocking defect, add the smallest missing regression proof and deterministically re-close one exact candidate.

**Success evidence:** Durable Replay hardening audit records PASS/BLOCKED for every mandatory area with files/risks/proof/fixes; replay build, Replay acceptance, full unit/service and materially affected Browser/Planning/Workload/local gates are green; focused proof covers middle-frame zero-preroll, next-day rebasing, Stop→Play, Seek, Pause/Resume, stale generation/ACK sequencing, malformed/truncated/wrong-version input, quota/storage failure, Host credential/origin/foreign-process refusal, live-DB isolation and progressive missing-history behavior; every blocker receives RCA → fix → regression → affected green verification; no known material untested Replay risk remains; shared server/protocol stays replay-unaware, ordinary launch/test semantics remain intact and PR/main/open-PR state are clean.

---

## Branch 10 — Historical Backtest Lab

**Strategy:** Let the user deterministically test and compare Scanner SQL strategies on historical market evidence, including second-level repeated testing, while preserving exact no-lookahead semantics, complete drillable evidence and a beginner-friendly offline workflow.

**Tactic:** Add one isolated loopback Backtest Lab that opens only product-owned day databases as immutable evidence, resolves each simulated decision time to an authoritative committed cycle, executes unchanged Scanner SQL inside a restricted historical DuckDB sandbox, evaluates post-decision outcomes through shared Demo Buy-compatible semantics, and presents Inspect / Compare / Sweep as views over the same engine.

### Tactic-validity assumptions

- `cycles` records successful complete commits with authoritative `cycle_id` and `committed_at_ms`; the existing writer stores the complete `history` snapshot and replaces `latest` from that same cycle transactionally.
- A historical Query only needs the documented Scanner strategy surface `latest` and `history` in the initial version; queries that intentionally reference other tables can fail explicitly rather than weakening isolation.
- `history(cycle_id=B)` is the exact market snapshot corresponding to baseline cycle `B` because each complete cycle contains the exact validated universe membership.
- The user wants deterministic research/visual comparison, not broker-fill or portfolio P&L simulation.
- Active/archive day files are sufficient source units initially; cross-day aggregation is not required to prove this outcome.

### Material alternatives considered

- **Modify the normal live service** — rejected because its database lifecycle can bootstrap/migrate/recover sessions and its startup path assumes provider/browser concerns that are unnecessary for offline research.
- **Use Replay as the engine** — rejected because Replay validates live runtime behavior over time, while Backtest needs direct random-access historical decisions, fast repeated evaluation and no server virtual clock.
- **Rewrite arbitrary SQL with injected time predicates** — rejected because CTEs/windows/joins/history logic make text rewriting fragile and semantically unsafe.
- **Run user SQL directly against the source DB with temporary views** — rejected because schema/catalog qualification could bypass shadow views and expose future rows.
- **Copy a fresh full bounded database per requested Sweep timestamp** — rejected as needlessly expensive; a sandbox can advance by baseline cycle and identical-baseline Query selections can be reused while each requested time keeps its own outcome `T0`.
- **Aggregate-only Compare/Sweep** — rejected because the user explicitly needs to see every selected security and every post-selection percentage before deciding whether a Query is better.

### Invalidation conditions

Reopen this tactic if executable proof shows that DuckDB cannot provide a safe detached historical sandbox with existing hardening, or if representative second-level Sweep remains impractical after eliminating avoidable repeated work. Do not jump directly to a new index/precompute/warehouse before measurement identifies the actual bottleneck.

### Necessity

Without safe evidence access the Lab can mutate or depend on live runtime. Without historical SQL isolation the result can contain hindsight. Without a shared outcome authority percentages can drift from Demo Buy semantics. Without complete Inspect/Compare evidence the user cannot understand why strategies differ. Without Sweep the user cannot tell whether one-point behavior repeats. Without offline operational/reclosure proof the feature does not meet the closed-market use case.

### Sufficiency

Leaves 10.1–10.6 jointly provide immutable evidence access, exact historical execution, trustworthy outcomes, direct visual comparison, repeated-time investigation and an operable/reclosed product. More elaborate optimizer/persistence/portfolio machinery is not required for the requested outcome.

### Branch success evidence

A fresh local operator can launch Backtest Lab with the market closed and no provider/Collector/Replay/order service, select active/archive evidence, run unchanged Scanner SQL at historical times, compare two Queries (optionally three), inspect every selected security and horizon, Sweep every X seconds/minutes, open any Sweep point into the same detailed evidence, and reproduce the result while source-file hashes/content remain unchanged and future-canary attempts cannot leak through the Query sandbox.

### 10.1 — Safe offline evidence access

**Strategy:** Backtest can discover and read valid historical day evidence independently without mutating or taking ownership of live/Replay/order state.

**Tactic:** Build a dedicated Backtest loopback runtime and source catalog limited to `data/market-flow-us.duckdb` plus `data/archive/market-flow-us-*.duckdb`, with a read-only schema-v3/v4 validation path that performs no bootstrap, migration, stale-session recovery, repair or arbitrary browser-path access.

**Success evidence:** Unit/service proof enumerates only product-owned sources; valid v3/v4 opens read-only; empty/missing/corrupt/incompatible/locked sources fail clearly; source bytes/schema/session/status/saved-query/market/Demo-Buy facts are unchanged before/after runs; no provider, Collector, Replay Host/Player or order service starts; no process is killed to obtain a lock; diagnostics contain only bounded public-safe source IDs/metadata rather than private paths/data dumps.

### 10.2 — Truthful historical Scanner sandbox

**Strategy:** Exact Scanner SQL at requested time `T` can see everything strategy-authoritative up to the last successful committed cycle at-or-before `T`, and nothing later.

**Tactic:** Resolve `B` using `cycles.status='complete' AND committed_at_ms <= T` with deterministic `committed_at_ms DESC, cycle_id DESC` tie-break; prepare a separate hardened in-memory DuckDB sandbox containing only bounded `history <= B` and `latest = history(B)`; when source attachment/copy is used for preparation it is explicitly read-only and detached before user SQL execution; execute the original SQL through existing Scanner admission without predicate rewriting.

**Success evidence:** SQL preflight precedes material historical SQL execution; deterministic fixtures prove exact boundary resolution including ties/no-prior-cycle; representative saved/built-in/editable `latest`/`history` queries execute unchanged with exact row/column order; attempts to reach future history, source catalog, `cycles`, `sessions`, `universe`, saved-query/Demo-Buy tables, qualified source names or external-reading functions cannot expose source/future facts; unsupported table references fail clearly; existing one-SELECT/no-parameters/forbidden-function/hardening rules remain at least as strict as normal Scanner.

### 10.3 — Trustworthy post-decision outcome evidence

**Strategy:** Every selected security has one deterministic baseline and future horizon result whose calculation matches the product's established Demo Buy outcome semantics wherever those semantics are identical.

**Tactic:** Introduce the smallest shared evaluator seam needed to reuse exact baseline-price, first-post-watermark/first-at-or-after matching, percentage/outcome and unavailable-state rules; Backtest supplies `(B, T0=requested time, returned position, securityId)` rather than persisted Demo Buy captures, and outcome SQL reads the immutable source evidence set-wise.

**Success evidence:** Material evaluation SQL passes static preflight; focused equivalence tests prove baseline `history(B,S)`, `cycle_id > B`, `collected_at_ms >= T0+H`, deterministic `collected_at_ms/cycle_id` tie-break, percentage math and existing unavailable reasons; default 10/20/30/45/60/90/120s plus optional 3m/5m/10m are correctly ordered; missing baseline is integrity failure; baseline age/resolved timing is inspectable; Backtest creates no `demo_buy_*` rows and does not fork a second drifting change-percent implementation.

### 10.4 — Complete Inspect and Compare investigation

**Strategy:** A beginner can understand one Query and visually compare strategy Queries at one historical decision point without losing the raw per-security evidence behind aggregate summaries.

**Tactic:** Build one point-result model used by Inspect and Compare; freeze one shared source/B/T0/Top-X/horizon configuration per run, execute Query A/B and optional C independently, preserve source-row returned positions, apply source-row-first Top-X before canonical-security dedupe as in Demo Buy selection semantics, calculate compact aggregates/overlap/position deltas, then render complete per-Query rows in Side-by-Side with differences/common filtering as presentation only.

**Success evidence:** Inspect shows exact SQL/provenance on demand, small summary and every evaluated security/horizon; Compare proves all Queries use identical B/T0/config yet retain independent returned order; duplicate identities do not silently promote lower rows into Top-X and source-row/evaluated-unique counts remain explicit; overlap, only-A/B/C and returned-position changes are exact; Side-by-Side exposes every selected security, baseline price and selected horizon percentage/price/unavailable state; filters never alter the frozen result; no UI wording claims a global winner merely from the aggregates; Chromium covers loading/empty/error/unsupported-query and beginner guidance.

### 10.5 — Scalable Sweep and drill-down

**Strategy:** The user can test one Query or the current Compare set every X seconds/minutes over a historical range, understand the large result and enter any interesting point without losing determinism.

**Tactic:** Generate requested timestamps inclusively and in order; resolve each to `(B,T0)`; process baselines monotonically so the private historical sandbox can advance rather than rebuild from zero where safe; execute a frozen Query once per distinct baseline `B` and reuse that selection for requested points sharing `B`, while evaluating each point with its own `T0`; expose a compact paged/virtualized timeline and `Open` into the exact 10.4 point-result model.

**Success evidence:** Tests prove 1-second and minute cadence, endpoint inclusion, unavailable early points, multiple requested times sharing B but producing different horizon targets/outcomes, stable ordering/paging/filtering and frozen Query/config semantics; Query execution count is bounded by distinct baselines rather than blindly by requested timestamps when baselines repeat; one-Query and A/B(/C) Sweep summaries exactly reconcile to opened point results; no browser-driven `points × queries × securities × horizons` request loop; opening any point reproduces complete Inspect/Compare evidence.

### 10.6 — Beginner offline operation, performance and deterministic reclosure

**Strategy:** Backtest Lab is easy to start/use when the market is closed and the integrated implementation is measured, documented and regression-safe without adding speculative infrastructure.

**Tactic:** Add `START_BACKTEST_LAB.cmd` plus minimal build/package/user guidance, default Compare with two Queries/Top-10/10s–120s and progressive disclosure for Query C/longer horizons/SQL/timing metadata; run focused unit/service/Chromium acceptance plus bounded representative Inspect/Compare/second-level Sweep/Sweep-Compare measurements, remove observed repeated work, update affected durable product/technical/test/user contracts and run materially affected broad CI/reclosure.

**Success evidence:** Fresh Windows path starts only the loopback Lab and opens a usable page without provider login or market hours; inline help explains historical time/resolved cycle/no-lookahead/Top-X/returned position/repeated baseline/Pending-Unavailable/Summary-vs-evidence; bounded measurements are recorded for representative day data and no new index/precompute/background worker/result DB is added absent evidence; focused tests plus Fast/Browser/Planning and materially affected bounded Workload are green; final diff/security/public-safe diagnostics review finds no source mutation/lookahead/execution coupling; PR merges by repository policy, main CI is green and open-PR state is reconciled.

---

## Material planning decisions carried forward

`.planning/DECISIONS.md` remains the durable decision register. The following decision families materially constrain this plan:

- **Architecture/KISS:** D-US-001, 004, 006, 009, 010, 014, 015, 018, 020, 021, 022.
- **Provider/data identity:** D-US-002, 003, 005, 007, 008, 011, 012, 013, 016.
- **Demo Buy/AI authority:** D-US-023, 024, 026–033.
- **IBKR/order authority:** D-US-034–038, 047.
- **Replay authority:** D-US-041–046.
- **Current capability sequencing/history:** D-US-025, 039, 040 and 048 explain why later capabilities were inserted before deferred final acceptance; their process-order details are historical rationale, while real current task dependencies/status live only in `EXECUTION.md`.

D-US-017 described the former V1 planner ceremony. It is not a ST Planner 2.0 planning invariant and is intentionally not reproduced as live PLAN process.

Backtest Lab material choices are expressed directly in Branch 10 plus `docs/BACKTEST_LAB.md`: isolated offline process, read-only source evidence, private detached historical sandbox rather than SQL rewrite/direct-source execution, shared Demo Buy-compatible outcome semantics, Compare-first complete Side-by-Side evidence, and Sweep selection reuse by baseline while preserving per-request `T0`. A separate decision-register entry is unnecessary unless later evidence requires supersession/history beyond those durable sources.

## Material review findings incorporated into current S&T

The review history contains no unresolved current planning blocker. Material findings were corrected and are now expressed directly in the plan/contracts/decisions:

- Top-X/selection is source-row-first before dedupe; original returned position is preserved.
- `resultRank` means returned position, not semantic rank unless the exact SQL ordering proves ranking semantics.
- Demo Buy capture authority is serialized writer/cycle order; lost capture ACK is unknown, not failure.
- Wall-clock regression never overrides cycle/writer authority.
- Long-running Auto needs targeted observation refresh and persistent cross-surface operability.
- AI Investigation exports a separate sharing-safe projection; local operational/session fields and arbitrary text cannot leak into shareable output.
- Replay Stop→Play and Seek require a fresh replay run/DB and zero hidden warm-up.
- Replay Host credential security includes a usable ephemeral one-run bootstrap/pairing path with no durable persistence.
- Missing pre-start Replay history is ordinary startup state; generic crashes are fixed as normal live-start defects, not by adding replay-specific server behavior.
- Replay hardening and the later pre-acceptance code audit require static review plus executable proof; prior green CI is not sufficient evidence for a newly identified material risk.
- Backtest cannot reuse the normal database opener because that opener bootstraps/migrates and recovers stale sessions; immutable evidence needs a dedicated read-only path.
- Backtest baseline authority uses successful persisted cycle commit time, not guessed wall-clock snapshot timestamps; `T0` remains the requested simulated decision time for future horizons.
- Historical SQL isolation is achieved by absence of future/source objects from the user-query sandbox, not by trusting unqualified name resolution or fragile SQL rewriting.
- Sweep may reuse a Query selection across requested times sharing the same baseline cycle because historical strategy-visible state is identical, but it must not dedupe the requested points because their future target times differ.

## Final Planning Review — Branch 10

Outside-in review found the Branch 10 boundary correctly limited to deterministic historical strategy research. The selected tactics preserve existing authority instead of introducing a Strategy Engine or replay-aware server. Each child passes the removal test: removing 10.1 loses immutable offline evidence, 10.2 loses no-lookahead truth, 10.3 loses trustworthy outcomes, 10.4 loses the requested understandable comparison, 10.5 loses repeated-time validation, and 10.6 loses an operable/reclosed product. Together they are sufficient for the requested outcome without an optimizer, persisted experiment warehouse, cross-day feature store or speculative temporal index.

The highest-risk assumption is practical sandbox/Sweep performance. That risk is deliberately tested by 10.2/10.5/10.6 and is not pre-solved with a new subsystem. The leaves are decision-complete at the planning level: implementation may choose local code organization, protocol names and UI component structure, but no executor should need to decide the product semantics, trust boundary, comparison model, Sweep time model or performance escalation policy.

## Alternatives deliberately rejected

The current S&T remains intentionally narrow and does not introduce:

```text
greenfield rewrite
Strategy Engine
hard-coded survivor/ranking service
temporal feature engine / speculative precompute
background Demo Buy horizon worker
persisted horizon result matrix
second normal market-data DB or transport
cross-day strategy warehouse
automatic AI provider integration / automatic SQL mutation
raw-local-row AI export
direct provider-page/browser call to IBKR sidecar
generic Viewer execution proxy
server replay mode / virtual clock / seek/reset API
hidden Replay preroll / fast-forward
Replay Host market persistence
playback-speed subsystem
cloud recording service
recording editor/merger
Backtest SQL timestamp rewriting
Backtest direct user-SQL execution against the source catalog
Backtest result database / experiment warehouse
Backtest optimizer / automatic winner / strategy Score
Backtest fee/slippage/fill/portfolio simulator
more than three simultaneous Backtest comparison Queries
multi-hour real-time CI prerequisite
```

These remain outside scope unless later evidence or explicit product planning justifies them.

## Contract precedence after ST Planner 2.0 migration

For planning/S&T questions, this file is authoritative. Implementation-detail contracts remain authoritative within their owned domain when they do not conflict with the PLAN:

```text
.planning/PLAN.md
→ domain-specific durable contract
→ .planning/DECISIONS.md for supporting rationale / supersession history
→ generic product/data/technical/test contracts
→ implementation/tests
```

Important domain contracts include:

- Demo Buy / AI: `docs/DEMO_BUY_PROTOCOL_LIMITS.md`, `docs/DEMO_BUY_UX.md`, `docs/AI_INVESTIGATION_PACK.md`, `docs/DEMO_BUY_VALIDATION.md`.
- Basic BUY / order service: `docs/BASIC_BUY_INTEGRATION.md`, `docs/IBKR_ORDER_SERVICE.md`, `docs/IBKR_ORDER_SERVICE_SECURITY.md`.
- Replay: `docs/MARKET_REPLAY.md`, `docs/REPLAY_HARDENING.md`.
- Backtest Lab: `docs/BACKTEST_LAB.md`.
- Shared current product truth: `docs/PRODUCT_REQUIREMENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/DATA_CONTRACT.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md`.

Execution truth is deliberately separate:

```text
.planning/EXECUTION.md = task / owner / status / real dependency / result-evidence truth
STATUS.yaml            = non-authoritative projection only
```

## Implementation-leaf coverage

The PLAN now contains the existing 44 historical implementation leaves plus six implementation-ready Backtest leaves:

```text
1.1  1.2
2.1  2.2  2.3
3.1  3.2  3.3
4.1  4.2  4.3.1  4.3.2  4.3.3  4.4.1  4.4.2  4.5.1  4.5.2
5.1  5.2  5.3
6.1  6.2  6.3
7.1  7.2  7.3  7.5  7.6.1  7.6.2  7.6.3  7.6.4  7.6.5  7.4
8.1  8.2  8.3  8.4  8.5
9.1  9.2  9.3  9.4  9.5  9.6
10.1  10.2  10.3  10.4  10.5  10.6
```

The six Branch-10 leaves are planning-complete but must still be explicitly allocated in `.planning/EXECUTION.md` before implementation starts. Dependencies belong only in that execution map.

## Program completion condition

The current product program is complete only when all durable capability evidence above remains valid, Backtest Branch 10 is implemented/reclosed with its root success evidence green, repository/main CI and open-PR state are clean, and no blocking defect remains. Deferred target-machine/provider acceptance remains separate non-blocking backlog work until explicitly activated; when activated it must select the latest intended runtime candidate and reconcile all then-current capabilities rather than relying blindly on the historical candidate.