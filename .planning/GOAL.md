# Market Flow US Goal

## Desired outcome

Market Flow US is a locally runnable U.S.-market analysis product that preserves the proven MarketScope operating model, uses the U.S. Bank Leumi market source, and lets the user validate and improve Scanner strategies before any real order-execution work.

Target product:

```text
authenticated U.S. provider page
→ ScreenerHulPaging3 full response
→ exact validation
→ loopback WebSocket
→ localhost Node.js
→ native DuckDB
→ Current
→ Security Detail / History
→ Dynamic SQL Scanner
→ Demo Buy strategy validation
→ AI Investigation evidence pack for query improvement
```

Demo Buy answers two connected Phase-1 questions:

1. When a Scanner query selected a security and a virtual buy was accepted, what did persisted source `Price` do afterward over the short horizons the strategy intends to predict?
2. Given the exact query, original ranking context, pre-buy evidence and later outcome, what evidence-backed SQL improvements are worth testing next without leaking hindsight into the proposed rule?

This is analytical validation only. It does not place, simulate or manage a real broker order and does not call an AI provider automatically.

## Stable product direction

- Preserve the existing architecture rather than rewrite it.
- Preserve every successful snapshot in active-day history.
- Preserve Current/Detail/History/Scanner/saved-query/diagnostics workflows.
- Use `String(PaperId)` as canonical identity after fail-closed source-type validation.
- Use source-shaped U.S. fields and preserve raw rows.
- Keep strategy logic in editable Scanner SQL.
- Ship staged candidate ranking as a built-in example query.
- Add Demo Buy as the smallest validation layer on top of Scanner/history; do not create a Strategy Engine or trading subsystem.
- A Demo Buy links to the exact authoritative `history` row used as its baseline through `(buy_cycle_id, security_id)` rather than copying or accepting a user-entered price.
- `buy_cycle_id` is also the authority watermark for the captured item: prediction-time history may use only `cycle_id <= buy_cycle_id`; post-capture/future evidence requires `cycle_id > buy_cycle_id`.
- Wall-clock values (`startedAtMs`, `completedAtMs`, `collectedAtMs`, `capturedAtMs`) remain useful diagnostics but never override writer/cycle ordering when clocks disagree.
- Phase 1 evaluates `Price` after 10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m and 10m using the first qualifying post-watermark history observation at/after each target time.
- Manual capture and automatic capture from ordered Scanner results are supported; automatic capture may use all results or the first X results in exact Scanner result order.
- Bounded immutable Scanner comparison context is retained at capture time so later investigation never reconstructs the original result by re-running SQL against newer state.
- The AI Investigation Pack is a deterministic local export: exact SQL + bounded original Scanner context + prediction-time history + exact baseline + later outcome history + trusted Demo Buy outcomes + a disciplined anti-hindsight prompt.
- The product never sends the pack automatically, stores an AI API key, applies AI-proposed SQL automatically or claims that one observation proves a better rule.
- Phase 1 does not attempt to prove fillability, sale liquidity, traded quantity at a higher price, fees, spread, portfolio P/L or actual order execution.
- The requested volume/liquidity/fillability analysis is explicitly deferred until Phase 1 is completely implemented and verified.
- Do not add temporal precompute/background jobs, a second transport, another database, a cross-day strategy warehouse or speculative history indexes before measured evidence requires them.
- Keep the product local and public-safe.

## Canonical contract precedence for the current replan

Until the comprehensive replan is frozen, Demo Buy/AI details are governed in this order:

```text
.planning/GOAL.md
→ docs/DEMO_BUY_PROTOCOL_LIMITS.md   authority/bounds/failure/lifecycle
→ docs/DEMO_BUY_UX.md                browser/operability behavior
→ docs/AI_INVESTIGATION_PACK.md      forensic export/prompt behavior
→ docs/DEMO_BUY_VALIDATION.md        end-to-end feature synthesis
→ generic PRODUCT/DATA/TECHNICAL/TEST documents
→ TREE success_evidence / EXECUTOR_HANDOFF for execution routing
```

Review 5 must align every lower layer to the owners above before freeze. A known conflict is a planning defect, not an executor choice.

## Planning boundary

The original U.S. migration implementation through TREE `7.3` is complete and remains valid evidence for what it proved.

Final target-machine acceptance `7.4` was not executed. The user added Demo Buy and AI Investigation before that final acceptance, so the smallest affected planning area is reopened:

```text
preserve completed migration leaves/evidence
→ finish comprehensive Demo Buy + AI planning review
→ freeze revised plan
→ pass required Planning CI and merge planning truth
→ implement/verify Demo Buy + AI Investigation
→ produce a new final candidate SHA
→ run final target-machine/authenticated acceptance on that candidate
```

Production implementation of the new feature remains forbidden while:

```text
plan_state = active
or
implementation_authorized = false
or
root phase = planning
```

## Completion

Market Flow US is complete only when:

- U.S. provider path is authoritative;
- Israel-only runtime assumptions are removed/superseded;
- the current Market Flow US schema and U.S. typed projections are proven;
- Current/Detail/History/Scanner operate on U.S. data;
- staged candidate SQL executes correctly;
- Demo Buy can capture Scanner-selected securities against exact authoritative baseline rows and display short-horizon future prices, percentage change, outcome and unavailable reason;
- capture selection/rank/provenance, automatic backpressure, lost-ACK recovery and active-day lifecycle are proven;
- the Demo Buy Viewer remains usable under continuing Auto capture and supports targeted refresh of one observation;
- AI Investigation can generate, copy and regenerate a bounded deterministic local evidence pack whose prediction-time evidence is protected by the capture authority watermark;
- generated AI prompts enforce anti-hindsight reasoning, minimal SQL hypotheses and validation across many observations;
- no real order execution or Phase-2 liquidity/fillability claim is introduced;
- Fast, Browser, Planning and required bounded Workload gates are green on the post-feature candidate;
- final target-machine/local Fake/authenticated gates pass where required;
- final docs/launchers/branding match the implemented product;
- main is green with no blocking defect or unexpected open PR.
