# U.S. Contract Review

## Result

PASS — durable U.S. contracts are coherent enough to begin replacement S&T TREE design.

This review does not freeze the plan and does not authorize implementation.

## Audit questions resolved

| Audit question | Resolution |
|---|---|
| Exact typed U.S. projection | DATA_CONTRACT + TECHNICAL_SPEC define source-shaped VARCHAR/DOUBLE fields plus raw_data |
| Current/History columns | PRODUCT_REQUIREMENTS + PRODUCT_SPEC define exact initial surfaces |
| Price semantics | keep source name Price; do not claim LAST |
| TradeDateTime semantics | preserve exact source string; collected_at_ms remains local time authority |
| Universe refresh | every validated full response provides membership; replace revision only when canonical membership changes |
| Collection cadence | 3000 ms initial demo/offline default; live-safe cadence remains empirical |
| U.S. workload | 4096 securities × 180 cycles = 737280 history rows |
| Staged ranking | ordinary editable Scanner SQL; 10/20/30/45/60/90/120-second example |
| Schema evolution | fresh incompatible U.S. schema v3; old MarketScope v1/v2 DB rejected without mutation |
| Product/artifact naming | Market Flow US / market-flow-us; new DB/runtime/bookmarklet/launcher names |

## Cross-contract invariants checked

- canonical identity is provider PaperId represented as string securityId;
- provider path is ScreenerHulPaging3;
- observed 4015 count is never a product constant;
- history + latest mechanism is retained;
- one U.S. response is represented through the existing complete-cycle authority with one physical segment;
- no Strategy Engine;
- no dynamic horizon schema;
- no predecessor-ID temporal subsystem;
- Scanner remains the strategy surface;
- staged ranking is measured by workload;
- schema v3 is explicit;
- representative workload is consistently 4096 × 180;
- U.S. source fields Price / DailyVolume / TradeDateTime retain conservative semantics;
- imported Israel typed fields are absent from the new core product/data/technical/test contracts.

## KISS review

The contracts deliberately preserve the following proven implementation mechanisms:

- WebSocket protocol;
- producer/session lifecycle;
- serialized writer;
- transaction/rollback;
- history/latest tables as concepts;
- Viewer read model;
- Scanner admission;
- saved-query library;
- diagnostics;
- Fake Market architecture;
- Fast/Browser/Workload/live verification layering.

The planned replacement is concentrated around provider acquisition, U.S. projections, affected UI columns/fixtures, workload scale and branding.

## Deferred evidence

These are intentionally not blockers to TREE design because the final answer depends on live/provider behavior:

- safe sustained polling cadence;
- rt=true freshness/SLA;
- market-hours and extended-hours behavior;
- Price exact market-data semantics;
- DailyVolume unit;
- PaperMarketCap unit;
- TradeDateTime timezone/session semantics;
- permanent pageCount maximum.

They remain explicit live/evidence gates and must not be silently assumed by implementation.

## Gate

Next stage:

```text
completed file audit
+ coherent durable contracts
+ resolved U.S. decisions
→ construct replacement S&T TREE
```

Do not allocate execution chats until TREE review/freeze passes.
