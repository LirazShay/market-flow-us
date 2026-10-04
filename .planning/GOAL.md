# Market Flow US Goal

## Desired outcome

Convert the exact green MarketScope implementation into Market Flow US with the smallest safe set of changes required by the U.S. Bank Leumi market data.

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
```

The final product should feel and operate like the proven Israeli MarketScope product, with U.S. data fields and U.S.-scale verification.

## Stable product direction

- Preserve the existing architecture rather than rewrite it.
- Preserve every successful snapshot in history.
- Preserve Current/Detail/History/Scanner/saved-query/diagnostics workflows.
- Use `String(PaperId)` as canonical identity.
- Use source-shaped U.S. fields and preserve raw rows.
- Keep strategy logic in editable Scanner SQL.
- Ship staged candidate ranking as a built-in example query.
- Do not add a special temporal/horizon mechanism before performance evidence.
- Keep the product local and public-safe.

## Planning boundary

The exhaustive 124-file migration audit is complete.

Durable U.S. contracts and decisions must be coherent before a replacement S&T tree is built.

Production implementation remains forbidden while:

```text
.plan_state = active
root phase = planning
```

## Completion

Market Flow US is complete only when:

- U.S. provider path is authoritative;
- Israel-only runtime assumptions are removed/superseded;
- schema v3 and U.S. typed projections are proven;
- Current/Detail/History/Scanner operate on U.S. data;
- staged candidate SQL executes correctly;
- Fast and Browser CI are green;
- representative U.S. workload is green;
- local real-provider gate is PASS;
- final docs/launchers/branding match the product;
- main is green with no blocking defect.
