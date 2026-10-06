# Market Flow US Goal

## Desired outcome

Market Flow US is a locally runnable U.S.-market product with two deliberately separated capabilities:

1. the proven local market-analysis path that collects U.S. provider snapshots, persists authoritative history, runs Scanner SQL, validates candidates with Demo Buy and exports AI Investigation evidence;
2. a standalone local Interactive Brokers order-service sidecar that can prepare, preview and eventually submit explicit BUY/SELL orders through the first-party IBKR Client Portal Web API when the user's account has the required permission.

The order-service is intentionally isolated in the current mini-project. Scanner, Demo Buy, AI Investigation and Current do **not** automatically place orders. A later integration project may consume the order-service's stable local API.

Target product shape after branch `8`:

```text
authenticated U.S. market provider page
→ ScreenerHulPaging3 full response
→ exact validation
→ loopback WebSocket
→ localhost Market Flow US Node.js service
→ native DuckDB
→ Current / Security Detail-History / Dynamic SQL Scanner
→ Demo Buy strategy validation
→ AI Investigation evidence pack

separate local execution sidecar
→ 127.0.0.1 IBKR order-service (Node.js 24)
→ authenticated local caller boundary
→ HTTPS localhost Client Portal Gateway
→ Interactive Brokers
```

## Analytical-validation lane

Demo Buy remains analytical evidence only. It does not become a broker order, fill, position or portfolio model merely because the repository now gains a separate execution sidecar.

Demo Buy continues to answer:

1. When a Scanner query selected a security and a virtual buy was accepted, what did persisted source `Price` do afterward over the short horizons the strategy intends to predict?
2. Given the exact query, original returned-position context, pre-buy evidence and later outcome, what evidence-backed SQL improvements are worth testing next without leaking hindsight into the proposed rule?

AI Investigation remains a local evidence export. It does not call an AI provider automatically and it cannot place an order.

## Execution lane

Branch `8` adds one isolated execution boundary owned by `docs/IBKR_ORDER_SERVICE.md` plus its mandatory localhost-security supplement `docs/IBKR_ORDER_SERVICE_SECURITY.md`.

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

Loopback binding alone is not treated as authorization. Every protected local endpoint requires an ephemeral per-run caller credential, and browser-origin requests are rejected by default before provider logic.

The initial execution scope is deliberately narrow:

```text
U.S. STK
BUY / SELL
LMT / MKT
DAY / GTC
no short opening
```

A live SELL must fail closed when the service cannot establish that the requested quantity is covered by the known long position.

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
- The AI Investigation Pack remains deterministic local evidence: exact SQL + bounded original Scanner context + prediction-time history + baseline + later outcome history + trusted Demo Buy outcomes + anti-hindsight prompt.
- The product never sends the AI pack automatically, stores an AI API key or applies AI-proposed SQL automatically.
- The IBKR order-service is a separate local process and stable API. Future Scanner/order integration must consume this boundary instead of bypassing it to call IBKR directly.
- Local order-service authorization is independent from provider authentication: loopback caller auth, live process/request gating and IBKR session/permission checks must all pass independently.
- Live submission is fail-closed and impossible unless both the service and individual request explicitly opt into live execution and the provider session/account/permission/preview checks succeed.
- Provider confirmation questions are surfaced explicitly; unknown questions are not auto-accepted.
- A lost submit acknowledgement is unknown, not rejection, and must reconcile before any possible new submit.
- Do not add temporal precompute/background jobs, another market-data transport, another market-data database, a cross-day strategy warehouse or speculative history indexes before measured evidence requires them.
- Keep all product and execution diagnostics public-safe.

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

Older generic statements that the repository contains no real-order capability are historical constraints for branches `1`–`7`; they do not override the branch-8 order contracts. Scanner/Demo Buy/AI themselves still have no direct real-order authority in this mini-project.

## Planning boundary

Completed implementation through `7.5` remains historical green evidence for what it proved. Final target-machine acceptance `7.4` had begun but was not completed.

The user then requested the standalone IBKR BUY/SELL mini-project before completing final acceptance, so execution was reopened at the smallest new scope:

```text
preserve all completed implementation/evidence
→ pause 7.4 without marking it done
→ define/freeze branch 8 contracts + S&T plan
→ implement 8.1 standalone service/dry-run authority
→ implement 8.2 IBKR adapter/live-capable lifecycle
→ implement 8.3 packaging/integration-ready boundary
→ implement 8.4 deterministic reclosure
→ produce the new exact candidate truth
→ resume 7.4 final target-machine/provider acceptance on current repository truth
```

Actual live-order proof may remain `PENDING_EXTERNAL_PERMISSION` if IBKR has not yet granted the user's trading permission. Permission-independent software proof must never be replaced with fabricated live evidence.

Production implementation of branch `8` is forbidden while:

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
- Israel-only runtime assumptions are removed/superseded;
- Current/Detail/History/Scanner operate on the U.S. market authority;
- staged candidate SQL executes correctly;
- Demo Buy capture/evaluation/provenance/Auto/targeted-refresh behavior is proven;
- AI Investigation generates sharing-safe deterministic anti-hindsight evidence packs;
- the standalone IBKR order-service is code-complete with strict BUY/SELL validation, authenticated localhost caller protection, dry-run/what-if preview, fail-closed live gating, explicit provider-reply handling, restart-safe idempotency, acknowledgement-unknown reconciliation, cancellation/trade observation, SELL short-opening protection and public-safe diagnostics;
- Scanner/Demo Buy/AI remain disconnected from automatic live submission until a later explicit integration project;
- actual live IBKR execution is either proven when permission exists or recorded exactly as `PENDING_EXTERNAL_PERMISSION` without fabricated evidence;
- required Fast, Browser, Planning, service and bounded acceptance gates are green on the post-order-service candidate;
- final target-machine/local Fake/authenticated market-data gates pass where required;
- final docs/launchers/branding match the implemented product;
- `main` is green with no blocking defect or unexpected open PR.
