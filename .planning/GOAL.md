# Market Flow US Goal

## Desired outcome

Market Flow US is a locally runnable U.S.-market product with three deliberately separated capabilities:

1. the proven local market-analysis path that collects U.S. provider snapshots, persists authoritative history, runs Scanner SQL, validates candidates with Demo Buy and exports AI Investigation evidence;
2. a standalone local Interactive Brokers order-service sidecar that can prepare, preview and eventually submit explicit BUY/SELL orders through the first-party IBKR Client Portal Web API when the user's account has the required permission;
3. an isolated Market Recording + Replay path that can record validated provider snapshots with the local service off, keep/export those recordings, and later play them through the unchanged normal producer/service path against a replay-only DuckDB.

The three capabilities remain intentionally separated. Scanner, Demo Buy, AI Investigation and Current do **not** automatically place orders. Replay does **not** give the market-data service a replay mode, virtual clock, seek API or alternate persistence path.

Target product shape after branch `9`:

```text
authenticated U.S. market provider page
→ ScreenerHulPaging3 full response
→ exact validation
→ normal live ProducerBridge
→ localhost Market Flow US Node.js service
→ native active-day DuckDB
→ Current / Security Detail-History / Dynamic SQL Scanner
→ Demo Buy strategy validation
→ AI Investigation evidence pack

separate local execution sidecar
→ 127.0.0.1 IBKR order-service (Node.js 24)
→ authenticated local caller boundary
→ HTTPS localhost Client Portal Gateway
→ Interactive Brokers

separate recording/replay lane
→ validated provider snapshots
→ IndexedDB recording library and/or portable replay file
→ Market Player Play/Pause/Seek at recorded 1x spacing
→ normal ProducerBridge messages only
→ unchanged Market Flow US service
→ isolated replay-only DuckDB
→ the same Current / Detail-History / Scanner / Demo Buy / AI Investigation surfaces
```

## Analytical-validation lane

Demo Buy remains analytical evidence only. It does not become a broker order, fill, position or portfolio model merely because the repository also contains an execution sidecar or Replay capability.

Demo Buy continues to answer:

1. When a Scanner query selected a security and a virtual buy was accepted, what did persisted source `Price` do afterward over the short horizons the strategy intends to predict?
2. Given the exact query, original returned-position context, pre-buy evidence and later outcome, what evidence-backed SQL improvements are worth testing next without leaking hindsight into the proposed rule?

AI Investigation remains a local evidence export. It does not call an AI provider automatically and it cannot place an order.

## Execution lane

Branch `8` owns the isolated execution boundary defined by `docs/IBKR_ORDER_SERVICE.md` and `docs/IBKR_ORDER_SERVICE_SECURITY.md`.

Core direction:

```text
explicit normalized order intent
→ authenticated local caller
→ DRY_RUN / provider what-if preview
→ fail-closed live gate
→ explicit provider confirmation handling
→ submit only when live is armed and IBKR permits it
→ reconciliation / cancellation / trade observation
```

The service is local, loopback-only and public-safe. It never stores credentials, cookies/session tokens or real provider account identifiers. Manual Client Portal Gateway authentication remains user-owned.

The initial execution scope remains narrow:

```text
U.S. STK
BUY / SELL
LMT / MKT
DAY / GTC
no short opening
```

## Market Recording + Replay lane

Branch `9` owns the Replay boundary defined by `docs/MARKET_REPLAY.md`.

Core direction:

```text
validated browser snapshot
→ recording frame
→ IndexedDB and/or streaming portable file
→ Player chooses a real recorded frame position
→ replay-local timestamps rebased to current wall clock
→ provider market values unchanged
→ normal ProducerBridge ACK path
→ unchanged Market Flow US service
→ replay-only DuckDB
```

Replay is a producer/orchestration capability outside the service. The existing market-data server/shared producer protocol must remain unaware of:

```text
recording files
replayMode
seek
playbackSpeed
virtual clock
fast-forward/preroll
```

`Seek` is intentionally a fresh replay start, not history warm-up. It resets only replay-owned service/DB state and sends the selected frame as the first authoritative market frame. Missing earlier history is the same legal condition as starting the live product in the middle of a trading day.

Replay preserves the original interval between recorded validated snapshots. Initial scope is `1x` only. Provider/source values such as `TradeDateTime`, `Price`, `BidRate`, `AskRate` and raw market rows are not rewritten. Local collection/cycle timestamps are rebased externally so the normal server receives contemporary coherent timing.

`Pause` stops emission without resetting replay history. `Resume` starts a new replay timing segment at the current wall clock, preserving the remaining inter-frame delay. A real pause therefore may appear as a real time gap in history; no server virtual clock is introduced.

A small Replay Host may orchestrate the unchanged service process and replay-only DB for `Seek`. It may start/stop/reset only replay-owned artifacts and must never persist market frames itself, execute Scanner SQL, translate the producer protocol or touch the normal live DB.

## Stable product direction

- Preserve the existing MarketScope-derived architecture rather than rewrite it.
- Preserve every successful market snapshot in active-day history.
- Preserve Current/Detail/History/Scanner/saved-query/diagnostics workflows.
- Use `String(PaperId)` as canonical market-data identity after fail-closed source-type validation.
- Use source-shaped U.S. fields and preserve raw provider rows.
- Keep strategy logic in editable Scanner SQL.
- Ship staged candidate ranking as a built-in example query.
- Keep Demo Buy as the smallest validation layer on top of Scanner/history; do not turn it into an order/fill/portfolio subsystem.
- A Demo Buy links to the exact authoritative `history` row used as its baseline through `(buy_cycle_id, security_id)` rather than copying or accepting a user-entered price.
- `buy_cycle_id` remains the authority watermark for captured market evidence: prediction-time history may use only `cycle_id <= buy_cycle_id`; post-capture evidence requires `cycle_id > buy_cycle_id`.
- Wall-clock values remain diagnostics and never override writer/cycle ordering when clocks disagree.
- Phase-1 Demo Buy evaluates `Price` after 10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m and 10m using the first qualifying post-watermark history observation at/after each target time.
- Manual and automatic Demo Buy capture preserve bounded immutable Scanner comparison provenance.
- The AI Investigation Pack remains deterministic local evidence and never sends data automatically to an AI provider.
- The IBKR order-service remains a separate local process and stable API. Future Scanner/order integration must consume this boundary.
- Live order submission remains fail-closed behind independent local and provider gates.
- Replay recording authority is the validated browser snapshot boundary, not DuckDB output or DOM/session state.
- Replay portable files are versioned, structurally validated and streaming-friendly; large files must not require full-memory or mandatory IndexedDB re-import.
- Replay emits normal producer messages only and remains ACK-ordered.
- Replay `Seek` never fast-forwards/prerolls hidden history.
- Replay DB/process lifecycle is isolated from the normal live DB and normal launchers.
- Ordinary local tests/acceptance must not silently gain long replay waits; replay timing is primarily deterministic/fake-clock proof plus a short integration smoke.
- Do not add temporal precompute/background jobs, another normal market-data transport, another production market-data database, a cross-day strategy warehouse or speculative history indexes before measured evidence requires them.
- Keep all product, execution and replay diagnostics public-safe.

## Canonical contract precedence

For existing Demo Buy / AI Investigation behavior:

```text
.planning/GOAL.md
→ docs/DEMO_BUY_PROTOCOL_LIMITS.md
→ docs/DEMO_BUY_UX.md
→ docs/AI_INVESTIGATION_PACK.md
→ docs/DEMO_BUY_VALIDATION.md
→ generic PRODUCT/DATA/TECHNICAL/TEST documents
→ TREE success_evidence / EXECUTOR_HANDOFF
```

For branch `8` IBKR execution behavior:

```text
.planning/GOAL.md
→ docs/IBKR_ORDER_SERVICE.md
→ docs/IBKR_ORDER_SERVICE_SECURITY.md
→ .planning/IBKR_ORDER_MINI_PROJECT.md   planning/provider rationale
→ generic PRODUCT/TECHNICAL/TEST documents where non-conflicting
→ TREE success_evidence / EXECUTOR_HANDOFF
```

For branch `9` Market Recording + Replay behavior:

```text
.planning/GOAL.md
→ docs/MARKET_REPLAY.md
→ .planning/MARKET_REPLAY_MINI_PROJECT.md   planning rationale
→ generic PRODUCT/DATA/TECHNICAL/TEST documents where non-conflicting
→ TREE success_evidence / EXECUTOR_HANDOFF
```

Older generic statements that the repository has no execution or replay capability are historical constraints for the branches that predate those explicit extensions. They do not override the newer durable branch contracts.

## Planning boundary

Completed implementation through branch `8` remains historical green evidence for what it proved. Final target-machine acceptance `7.4` was still unfinished.

The user requested Market Recording + Replay before completing `7.4`, so planning was reopened at the smallest new scope:

```text
preserve all completed implementation/evidence
→ keep 7.4 blocked/not-done
→ define branch 9 durable Replay contract
→ align generic contracts/decisions and build S&T branch 9
→ review/freeze/allocate branch 9
→ implement Replay leaves
→ deterministic Replay reclosure
→ produce a new exact complete-product candidate
→ resume 7.4 final target-machine/provider acceptance on current repository truth
```

Production implementation of branch `9` is forbidden while:

```text
plan_state = active
or
implementation_authorized = false
or
root phase = planning
```

## Completion

The current overall product program is complete only when:

- U.S. market provider path is authoritative;
- Current/Detail/History/Scanner operate on the U.S. market authority;
- staged candidate SQL executes correctly;
- Demo Buy capture/evaluation/provenance/Auto/targeted-refresh behavior is proven;
- AI Investigation generates sharing-safe deterministic anti-hindsight evidence packs;
- the standalone IBKR order-service is code-complete with its strict validation/security/reconciliation contracts;
- actual live IBKR execution is either proven when permission exists or recorded exactly as `PENDING_EXTERNAL_PERMISSION` without fabricated evidence;
- Market Recording can capture complete validated provider frames with the local service off and preserve them in IndexedDB;
- portable Replay export/file playback is validated and does not require full-memory or mandatory browser-storage duplication;
- Market Player Play/Pause/Seek reproduces recorded `1x` timing while rebasing local collection/cycle timestamps to current replay time and preserving provider data;
- arbitrary mid-recording Replay starts with no preroll work through the unchanged normal service path;
- Current/Detail/History/Scanner/Demo Buy/AI operate normally over an isolated replay DB;
- Replay Host/process reset cannot touch the normal live DB and the server/shared producer protocol remain replay-unaware;
- required Replay-specific and affected Fast/Browser/Planning/Workload gates are green without materially expanding ordinary local verification time;
- branch `9` is deterministically reclosed and the exact complete-product candidate is re-pinned;
- final target-machine/local Fake/authenticated market-data and IBKR compatibility gates pass where required;
- final docs/launchers/branding match the implemented product;
- `main` is green with no blocking defect or unexpected open PR.
