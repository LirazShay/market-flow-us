# Market Flow US Executor Handoff

This is the compact GitHub-only bootstrap for numbered implementation chats.

`.planning/TREE.yaml` owns Strategy/Tactic/dependencies/success evidence. `.planning/EXECUTION.yaml` owns chat allocation/state.

## Authorization gate

Production implementation is allowed only when all are true:

```text
.planning/STATUS.yaml -> plan_state: frozen
.planning/STATUS.yaml -> implementation_authorized: true
STATUS.yaml -> phase: implementation
.planning/EXECUTION.yaml -> allocated
```

Otherwise do not code.

## Fresh executor read order

For `אני צאט N תתחיל`:

1. fetch fresh `main`;
2. read `AGENTS.md`;
3. read `STATUS.yaml`;
4. read `.planning/STATUS.yaml`;
5. read this file;
6. read `.planning/EXECUTION.yaml` and locate Chat N;
7. read only assigned TREE leaves + direct dependencies;
8. verify every dependency is `done` in EXECUTION;
9. load only the contracts/tests/code routed below;
10. if Chat N/current node/dependencies do not authorize work, report blocker and do not code;
11. otherwise create one focused feature branch and execute assigned leaves in order.

Do not ask the user to restate the plan.

## Contract routing

| Node | Primary durable truth |
|---|---|
| `1.*` acquisition | DATA_CONTRACT, PRODUCT_SPEC, TECHNICAL_SPEC provider/Recorder, TEST_STRATEGY |
| `2.*` market schema/authority | DATA_CONTRACT, TECHNICAL_SPEC schema/persistence, TEST_STRATEGY |
| `3.*` reads/Viewer | PRODUCT_REQUIREMENTS, PRODUCT_SPEC, TECHNICAL_SPEC reads, TEST_STRATEGY |
| `4.1`–`4.2` Scanner | PRODUCT_REQUIREMENTS Scanner, PRODUCT_SPEC Scanner, TECHNICAL_SPEC Scanner, SCANNER_SQL_GUIDE, TEST_STRATEGY |
| `4.3.1` Demo Buy schema | DEMO_BUY_VALIDATION §§5,10,16; DEMO_BUY_PROTOCOL_LIMITS; DATA_CONTRACT v4; TECHNICAL_SPEC schema; TEST_STRATEGY migration/context |
| `4.3.2` capture authority | DEMO_BUY_VALIDATION §§3–9; DEMO_BUY_PROTOCOL_LIMITS; DECISIONS D-US-026/027/031; TECHNICAL_SPEC protocol/capture; TEST_STRATEGY capture/lost-ACK |
| `4.3.3` evaluation/read model | DEMO_BUY_VALIDATION §§7,11–13; DEMO_BUY_PROTOCOL_LIMITS watermark; TECHNICAL_SPEC Demo Buy reads; TEST_STRATEGY read/evaluation; AGENTS SQL preflight |
| `4.4.1` Scanner Demo Buy UX | DEMO_BUY_UX Scanner/Auto/Stop; PRODUCT_REQUIREMENTS; PRODUCT_SPEC; TEST_STRATEGY browser model |
| `4.4.2` Demo Buy surface | DEMO_BUY_UX outcome/refresh/errors; PRODUCT_REQUIREMENTS; PRODUCT_SPEC; TEST_STRATEGY Browser E2E |
| `4.5.1` AI exporter | AI_INVESTIGATION_PACK; DEMO_BUY_PROTOCOL_LIMITS; DATA_CONTRACT; TECHNICAL_SPEC exporter; TEST_STRATEGY AI unit/service |
| `4.5.2` AI UX | DEMO_BUY_UX investigation/export/clipboard; AI_INVESTIGATION_PACK; PRODUCT_SPEC; TEST_STRATEGY Chromium |
| `5.*` Fake Market/E2E | TEST_STRATEGY Fake Market/Browser, DATA_CONTRACT, PRODUCT_SPEC runtime |
| `6.1` packaging | TECHNICAL_SPEC files/artifacts, build/launcher/docs tests |
| `6.2` diagnostics/live | AGENTS diagnosability, TECHNICAL_SPEC diagnostics/live, TEST_STRATEGY authenticated gates |
| `6.3` workload | TEST_STRATEGY workload, TECHNICAL_SPEC performance, shared generator, AGENTS SQL preflight |
| `7.1`–`7.3` historical closure | TREE evidence + existing release/local acceptance contracts |
| `7.5` historical post-Demo-Buy reclosure | Demo Buy/AI contracts + USER_GUIDE/SCANNER_SQL_GUIDE + historical deterministic gates |
| `8.1` local order authority | IBKR_ORDER_SERVICE §§1,3,5–8,10,14,17–18; IBKR_ORDER_SERVICE_SECURITY; PRODUCT_REQUIREMENTS §15; TECHNICAL_SPEC §§33–35,37,40–41; TEST_STRATEGY §§24–25,28 |
| `8.2` real CPGW lifecycle | IBKR_ORDER_SERVICE §§2,4,5,9,11–16; DECISIONS D-US-035/037/038; TECHNICAL_SPEC §§35–39; TEST_STRATEGY §§26–30 |
| `8.3` packaging/integration seam | IBKR_ORDER_SERVICE §§19–21; IBKR_ORDER_SERVICE_SECURITY §10; PRODUCT_SPEC/TECHNICAL_SPEC packaging; TEST_STRATEGY §§31–32 |
| `8.4` branch-8 reclosure | all IBKR order contracts + affected generic contracts + full required deterministic gates + PR/main/open-PR truth |
| `9.1` Replay recorder/storage | MARKET_REPLAY recording/library sections; DATA_CONTRACT Replay recording projection; PRODUCT_REQUIREMENTS/PRODUCT_SPEC Replay; TEST_STRATEGY recorder/storage proof; existing ScreenerHulPaging3 validation seam |
| `9.2` portable recording format | MARKET_REPLAY portable/large-recording sections; DATA_CONTRACT portable format; TEST_STRATEGY file/export/source proof |
| `9.3` Player/time projection | MARKET_REPLAY playback/time/Pause/Resume sections; DATA_CONTRACT Replay time projection; D-US-042; TEST_STRATEGY player timing; existing ProducerBridge/shared protocol |
| `9.4` Replay Host/isolation | MARKET_REPLAY Stop/Seek/Host/Viewer sections; D-US-043/044; TEST_STRATEGY Stop/Seek/isolation/bootstrap; existing service `--db`/`--port`/`--allowed-origin` seams |
| `9.5` branch-9 reclosure | MARKET_REPLAY + affected generic PRODUCT/DATA/TECHNICAL/TEST contracts + focused Replay acceptance + materially affected broad gates + PR/main/open-PR truth |
| `7.4` final acceptance | TEST_STRATEGY target-machine/local Fake Leumi/Demo Buy/AI/order-sidecar/Replay/heavy workload/authenticated gates; exact candidate pinned by completed `9.5` |

TREE `success_evidence` is always definition-of-done.

## Current serial allocation

```text
Chats 1–16: historical completed implementation through 7.5
Chat 17: 8.1 done
Chat 18: 8.2 done
Chat 19: 8.3 done
Chat 20: 8.4 done
Chat 21: 9.1 → 9.2 done
Chat 22: 9.3 done
Chat 23: 9.4 done
Chat 24: 9.5 done
Chat 25: 7.4
```

Do not skip forward. Current dependency order is:

```text
9.1 → 9.2 → 9.3 → 9.4 → 9.5 → 7.4
```

The earlier Chat-21 allocation of `7.4` was deliberately repaired during Replay planning because `7.4` now depends on `9.5`.

TREE `9.5` completed and pinned this exact post-branch-9 product candidate:

```text
243f4f2e78e434378ff2202ba95af7b8626a0369
```

PR #53 was squash-merged; Fast, Browser including bounded Local Fake, Planning Docs and bounded Workload were green on that main candidate and the open-PR audit was clean. Later planning-only metadata commits do not replace this product candidate.

## Branch-9 architectural boundary

Replay is external to the normal market authority:

```text
recording source (IndexedDB or validated portable file)
→ Market Player
→ existing ProducerBridge / protocol
→ unchanged Market Flow US service
→ replay-only DuckDB
→ existing Viewer / Scanner / Demo Buy / AI surfaces
```

The existing service/shared protocol must not gain `replayMode`, virtual clock, seek/reset/load-recording messages or hidden fast-forward behavior.

### Recording authority

Only complete validated ScreenerHulPaging3 snapshots become recording frames. Recording contains provider market facts + bounded reconstruction/timing metadata, never auth/session/account/private-page material or DuckDB authority state.

### Portable recordings

Versioned line-oriented manifest/frame/footer validation fails closed on malformed/truncated/count/order/version mismatch. Large export/file playback must not require whole-recording memory or mandatory re-import into IndexedDB.

### Time projection

Playback is `1x` only in initial scope and preserves observed irregular frame gaps. Provider/source facts remain unchanged. Local collection/cycle/chunk/security/universe timestamps are rebased coherently to contemporary wall time before normal producer emission.

Pause/Resume continues one replay run/DB. Pause emits no frames and Resume preserves the remaining schedule while starting a contemporary timing segment.

### Stop / Play / Seek

Stop closes the current replay run; the closed DB may remain readable for inspection. A later Play starts a fresh replay-owned service/DB before any selected frame is emitted again. Seek likewise starts a fresh replay DB at a real recorded frame boundary with zero preroll/fast-forward.

Missing earlier history is ordinary startup state. If a normal query/surface breaks solely because earlier history is absent, fix it as a generic live-start defect, never with replay-specific server behavior.

### Replay Host

Replay Host is lifecycle orchestration only:

```text
loopback control
exact allowed Origin
per-run ephemeral credential
one-run bootstrap/pairing to the dedicated Replay UI
spawn unchanged Market Flow service child
pass existing --db / --port / --allowed-origin
own/reset only replay DB artifacts
stop only its own child
```

It never persists market frames, writes market DuckDB tables, translates producer messages, executes Scanner SQL, attaches to/kills unrelated processes or opens/resets/deletes the normal live DB.

If port/path ownership is ambiguous or occupied by a foreign process, fail closed. Credential values are never committed, persisted or logged; unauthorized/stale control must reject.

### Normal verification isolation

Replay remains opt-in with its own browser artifact/operator path/focused tests. Existing ordinary launchers and local acceptance keep their semantics. Timing correctness is deterministic/fake-clock first with only a short real-wall-clock smoke; no multi-hour replay wait becomes an ordinary suite prerequisite.

## Branch-8 architectural boundary

The market-analysis lane remains independently runnable:

```text
browser producer/Viewer
→ ws://127.0.0.1:8765
→ Market Flow US service
→ market-flow-us DuckDB schema v4
```

The execution lane is a separate process:

```text
authorized local caller
→ http://127.0.0.1:8770
→ ibkr-order-service
→ HTTPS localhost Client Portal Gateway
→ Interactive Brokers
```

Branch `8` does **not** wire Scanner, Demo Buy, AI Investigation or Current to automatic order submission. Future integration must consume the sidecar API rather than bypassing it.

## IBKR order invariants

### Initial scope

```text
U.S. STK / USD / SMART
BUY | SELL
LMT | MKT
DAY | GTC
positive finite quantity
no short opening
```

`LMT` requires positive finite `limitPrice`; `MKT` forbids it.

### DRY_RUN default / LIVE fail-closed

`DRY_RUN` must never call the provider submit endpoint.

Actual submit requires every independent gate:

```text
valid local caller authorization
process explicitly LIVE-enabled
request explicitly executionMode=LIVE
valid brokerage session
tradable runtime account
provider permission
unambiguous instrument
snapshot preflight
successful what-if
local validation
SELL long-position coverage when SELL
```

No missing gate may be bypassed or treated as a warning.

### Localhost security

Loopback binding is not authorization.

```text
bind exactly 127.0.0.1:8770
GET /health unauthenticated only when strictly non-sensitive
all other endpoints require high-entropy per-run caller token
browser Origin rejected by default
no wildcard/credentialed CORS
bounded JSON-only state-changing requests
unauthorized request -> zero provider calls + zero state mutation
```

Caller token is never hard-coded, persisted, logged, reported or sent to IBKR and is invalidated by process exit.

### Provider authentication / privacy

Manual Client Portal Gateway authentication is user-owned. Never automate credential login or store credentials, cookies/session tokens, real account identifiers, private browser state or raw authenticated provider dumps.

A provider account ID may exist only in process memory for required provider calls and must be redacted from diagnostics.

If CPGW localhost TLS verification must be relaxed, scope the exception to that loopback client only. Never use process-global TLS disable.

### Idempotency / unknown acknowledgement

`requestId` is mandatory.

```text
same requestId + same normalized intent
→ return/reconcile existing local result

same requestId + different normalized intent
→ reject
```

After possible provider submit, transport loss is `ACKNOWLEDGEMENT_UNKNOWN` unless the remote outcome is conclusively known. Never blind-resubmit. Reconcile provider open-order/trade state first.

### Reply / cancel / fills

Provider `REPLY_REQUIRED` is surfaced explicitly. Unknown/unmodeled reply questions fail closed. No global warning suppression.

Cancellation reconciles provider state and never claims already-filled quantity was cancelled. Partial fill and fill remain distinct lifecycle states.

### SELL guard

Before LIVE SELL, prove requested quantity is covered by known long position. Insufficient, unavailable or ambiguous position authority fails closed. This is not a portfolio/risk engine.

## Demo Buy invariants preserved

### Selection/provenance

```text
choose source rows
→ validate every identity
→ browser dedupe by first chosen occurrence
→ preserve original resultRank
```

Exact bounds live in `DEMO_BUY_PROTOCOL_LIMITS.md`: 5000 items, 1 MiB SQL, first 50 context rows, <=64 retained columns with canonical identity mandatory, 128-byte clipped textual/serialized cells, <=256 KiB context.

Node rejects malformed duplicates/order/context and cross-checks every selected returned position <=50 against retained context identity.

### Authority

No browser-supplied price.

```text
baseline = history(buy_cycle_id, security_id)
prediction-time authority: cycle_id <= buy_cycle_id
post-capture authority:    cycle_id > buy_cycle_id
```

Horizon match must also satisfy `cycle_id > buy_cycle_id` and `collected_at_ms >= captured_at_ms + H`.

Wall-clock timestamps are diagnostics only. Preserve raw values; negative derived durations/latencies/ages become null + timing anomaly, never authority reordering.

### Capture acknowledgement

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

Never blindly replay acknowledgement-unknown capture.

### Backpressure

One Viewer-wide capture slot. Busy Auto generations are visibly skipped, not queued. One Viewer-wide AI-export slot; extra Generate/Regenerate actions do not queue.

## Scanner/Viewer UX invariants preserved

- Scanner result capture always refers to the exact rendered active generation, not edited draft text.
- Capture freezes generation + row selection synchronously before async submit.
- Checkbox/control interaction must not trigger row-to-Detail navigation.
- Auto is Viewer-session state, visible across surfaces and directly switchable Off.
- Auto changes apply only to future generations; Off does not cancel an already in-flight capture.
- Scanner has a **resumable** Stop recurring scan distinct from terminal Viewer destroy; later Activate works.
- Demo Buy page uses capture groups, sticky identity/baseline columns and one compact cell per horizon.
- `NO_FUTURE_OBSERVATION` is shown as Pending; other unavailable reasons remain warnings.
- `Refresh latest` resets page one; `Load more` continues keyset walk; `Refresh observation` uses `demo.buy.observation.get` and does not reset pagination.

## AI Investigation invariants preserved

AI Investigation is local evidence packaging only:

```text
Demo Buy observation
→ deterministic local pack
→ user copies/uploads to AI of choice
```

No AI credential/cloud call/web enrichment/automatic Scanner mutation and no broker-order authority.

Prediction-time and outcome evidence obey the same `buy_cycle_id` watermark. `OUTCOME.json` reuses the trusted Demo Buy evaluator.

Exporter accepts no browser path, publishes temp-dir→atomic-rename under `exports/ai-investigations/`, returns a product-relative path, never overwrites a successful pack and mutates no DB.

A lost export ACK may be regenerated after reconnect because export is non-mutating/collision-safe. Clipboard operations require manual-copy fallback.

## Schema/new-day invariants preserved

Valid v3 migrates transactionally to market schema v4; suspicious partial-v3 Demo structures fail closed. Fresh market DB boots v4. No speculative history index is added without evidence.

New Trading Day accepts valid v3 or v4 source, rejects v1/v2/corrupt/running states, preserves saved queries only, optionally archives source unchanged and installs fresh v4 with empty Demo Buy state. It does not own the separate IBKR execution store.

## Performance / KISS

Do not add Strategy Engine, automatic Scanner-to-order subsystem, portfolio engine, background horizon updater, materialized horizon columns, another market-data authority/transport, cross-day strategy warehouse, capture replay/idempotency subsystem, AI-agent subsystem or cloud order service.

The separate order-service HTTP API/minimal execution DuckDB and branch-9 Replay Host/replay-only DB are explicitly approved narrow boundaries. Replay Host must not become a second market persistence implementation; the existing Market Flow service remains the only market DB writer.

If recurring verification is materially slow:

```text
localize dominant cost
→ remove duplication/waste
→ preserve proof
→ remeasure
```

Hosted CI is correctness-first; heavy 4096×180/day-bounded performance remains target-machine evidence.

## Diagnostics/security

Preserve the existing checkpoint/support architecture; do not add parallel logging.

Order diagnostics may use an `ibkr_order.*` component namespace; Replay may use bounded recorder/player/host component names. Both expose only stable checkpoint/code, product-owned local IDs where needed, bounded lifecycle state and sanitized cause.

Support evidence may contain bounded status/counters/IDs but never credentials, cookies, provider/local auth tokens, account identifiers, private browser data, raw authenticated dumps, stored SQL, Scanner/history evidence, AI prompt contents or Replay Host control credentials.

## Work-unit lifecycle

For each leaf:

```text
set in_progress
→ proof/test first when practical
→ smallest sufficient implementation
→ focused verification
→ required broader gates
→ satisfy success_evidence
→ set done/result
→ update STATUS/EXECUTION
→ PR
→ CI green
→ diff review
→ squash merge
→ main CI green
→ open-PR audit
```

A blocking defect stays with the discovering chat: root cause → fix → regression/proof → affected verification → green.

If frozen planning is proven wrong, stop coding, block affected execution, reopen the smallest planning area per FRAMEWORK, repair/review/freeze, then continue.

If required GitHub Actions/CI is unavailable, do not merge unverified work or start the next implementation unit.

## Final acceptance

The earlier product candidates remain historical evidence only after later branches extend product scope.

Branch `8.4` completed against the post-order-service baseline:

```text
28e950afc1c4bfe4322d0593f483d05d92553e2d
```

That SHA remains branch-8 evidence only.

TREE `9.5` completed deterministic Replay reclosure and pinned the exact post-branch-9 product candidate:

```text
243f4f2e78e434378ff2202ba95af7b8626a0369
```

That candidate passed focused Replay proof plus the materially affected Fast, Browser/Local Fake, Planning and bounded Workload gates on main; PR #53 was squash-merged and the open-PR audit was clean.

Under the currently frozen plan, Chat 25 / TREE `7.4` is the next leaf and must perform final user-dependent target-machine heavy performance, Replay usability/isolation, authenticated market-data browser/static/movement checks and real CPGW target-machine compatibility against that exact candidate.

If the user requests additional capability/hardening before `7.4`, reopen planning explicitly under FRAMEWORK `execution_reopen`; do not silently execute new work under `7.4` or rewrite the pinned candidate.

Real order submission is performed only if external IBKR trading permission exists and the user explicitly initiates the bounded verification; otherwise its exact status remains `PENDING_EXTERNAL_PERMISSION`.

Overall completion requires every assigned leaf done, branch-9 deterministic reclosure, final acceptance, PR/merge/main-green closure and no blocking defect.
