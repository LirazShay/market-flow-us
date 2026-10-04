# Market Flow US

Market Flow US is the U.S.-market conversion of the proven MarketScope local market-analysis product.

## Intended product flow

```text
authenticated Bank Leumi U.S. market page
→ full U.S. screener snapshot
→ exact snapshot validation
→ loopback WebSocket
→ localhost Node.js service
→ native DuckDB
→ Current
→ Security Detail / History
→ Dynamic SQL Scanner
```

The architecture, operational model, Scanner, saved queries, diagnostics, Fake Market, demo, CI and local-only authority are inherited from the verified MarketScope baseline wherever U.S. data does not require a change.

## Current state

The repository contains an exact green MarketScope implementation baseline and a frozen U.S. conversion plan. Production U.S. conversion is executed serially from `.planning/EXECUTION.yaml`.

Read `STATUS.yaml` for the current chat/node.

Do not treat the imported Israel provider path as the final U.S. product until the corresponding migration nodes are completed.

## Baseline

Imported donor:

```text
LirazShay/market-scope
commit: d8bc770d292d328d7e89febb8ef4f450abe9458e
tree:   c49cc5f691e6d27ad120e0a5395e6b190f1b5952
```

Market Flow US baseline commit:

```text
cf6a21a17288832af3a69703dff39c9f843fe9a5
```

The imported tree matched byte-for-byte and passed Planning, Fast and Browser CI in this repository. See `.planning/BASELINE_PROVENANCE.md`.

## Product decisions

- Keep the MarketScope product style and runtime architecture.
- Replace the Israel-specific provider/data contract with the proven U.S. Leumi screener path.
- Keep append-only history + latest/current behavior; do not invent a new temporal-link mechanism.
- Keep Scanner as the strategy/analysis surface.
- The staged "best candidate" idea is an editable SQL query that computes the highest contiguous stage reached and sorts candidates accordingly.
- Automated order execution/IBKR is outside this migration scope.
- Optimize historical SQL only after the U.S. workload proves a real bottleneck.

## Durable documents

- `docs/US_PRODUCT_DIRECTION.md`
- `docs/US_SOURCE_EVIDENCE.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_CONTRACT.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/SCANNER_SQL_GUIDE.md`
- `docs/TEST_STRATEGY.md`
- `docs/SOURCE_EXTRACTION.md`

## Development workflow

```text
fresh main
→ assigned execution chat
→ focused branch
→ proof + implementation
→ PR
→ CI green
→ squash merge
→ main green
→ advance STATUS
```

GitHub `main` is the source of truth. See `AGENTS.md`.
