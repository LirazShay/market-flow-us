# Market Flow US Goal

## Desired outcome

Market Flow US is a locally runnable U.S.-market analysis product that preserves the proven MarketScope operating model, uses the U.S. Bank Leumi market source, and lets the user validate Scanner strategies before any real order-execution work.

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
```

The Demo Buy feature answers one intentionally narrow question:

> When a Scanner query selected a security and we pretend we bought it at that moment, did its observed `Price` subsequently rise over the short horizons the strategy is intended to predict?

It is analytical paper validation only. It does not place, simulate or manage a real broker order.

## Stable product direction

- Preserve the existing architecture rather than rewrite it.
- Preserve every successful snapshot in history.
- Preserve Current/Detail/History/Scanner/saved-query/diagnostics workflows.
- Use `String(PaperId)` as canonical identity.
- Use source-shaped U.S. fields and preserve raw rows.
- Keep strategy logic in editable Scanner SQL.
- Ship staged candidate ranking as a built-in example query.
- Add Demo Buy as the smallest validation layer on top of Scanner/history; do not create a Strategy Engine or trading subsystem.
- A Demo Buy links to the exact authoritative `history` row used as its buy baseline through `(buy_cycle_id, security_id)` rather than copying a user-entered price.
- Phase 1 evaluates `Price` after 10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m and 10m; a horizon with no qualifying future observation yet is `NULL`.
- Manual capture and automatic capture from ordered Scanner results are supported; automatic capture may use all results or the first X results in Scanner result order.
- Phase 1 does not attempt to prove fillability, sale liquidity, traded quantity at a higher price, fees, spread, portfolio P/L or actual order execution.
- The requested volume/liquidity/fillability analysis is explicitly deferred until Phase 1 is completely implemented and verified.
- Do not add temporal precompute/background jobs for Demo Buy before measured evidence requires them; derive future observations from existing `history`.
- Keep the product local and public-safe.

## Planning boundary

The original U.S. migration implementation through TREE `7.3` is complete and remains valid.

Final target-machine acceptance `7.4` was not yet executed. The user added Demo Buy validation before that final acceptance, so the smallest affected planning area is reopened:

```text
preserve completed migration leaves/evidence
→ plan/freeze Demo Buy
→ implement and verify Demo Buy
→ produce a new final candidate SHA
→ run final target-machine/authenticated acceptance on that candidate
```

Production implementation of the new feature remains forbidden while:

```text
.plan_state = active
root phase = planning
```

## Completion

Market Flow US is complete only when:

- U.S. provider path is authoritative;
- Israel-only runtime assumptions are removed/superseded;
- the current Market Flow US schema and U.S. typed projections are proven;
- Current/Detail/History/Scanner operate on U.S. data;
- staged candidate SQL executes correctly;
- Demo Buy can capture Scanner-selected securities against exact authoritative buy-history rows and display short-horizon future prices plus percentage change;
- manual, all-results, Top-X and automatic capture behavior is proven without real order execution;
- not-yet-observable horizons remain `NULL` rather than fabricated;
- Fast and Browser CI are green;
- representative U.S. workload is green;
- local real-provider/final target-machine gates pass on the post-Demo-Buy candidate;
- final docs/launchers/branding match the product;
- main is green with no blocking defect.
