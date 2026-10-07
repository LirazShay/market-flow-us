# Market Flow US Executor Routing

This is the target-owned context-routing contract for numbered S&T executor chats.

It was moved out of the framework-managed `.planning/EXECUTOR_HANDOFF.md` during the S&T Planner 1.1.1 upgrade so framework updates can safely replace framework-owned files without deleting Market Flow US behavior.

Use this document only to decide which durable project contracts/code/tests to load for an assigned node. `TREE.yaml` remains authoritative for Strategy/Tactic/dependencies/success evidence, and `.planning/EXECUTION.yaml` remains authoritative for allocation/execution state.

Load only the row(s) relevant to the explicitly assigned node(s); do not preload the whole repository.

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
| `7.4` final acceptance | TEST_STRATEGY target-machine/local Fake Leumi/Demo Buy/AI/order-sidecar/Replay/heavy workload/authenticated gates; exact audited/reclosed final candidate |
| `7.5` historical post-Demo-Buy reclosure | Demo Buy/AI contracts + USER_GUIDE/SCANNER_SQL_GUIDE + historical deterministic gates |
| `7.6.*` pre-acceptance extension audit | PRE_ACCEPTANCE_CODE_AUDIT; BASIC_BUY_INTEGRATION; IBKR_ORDER_SERVICE + SECURITY; MARKET_REPLAY + REPLAY_HARDENING; changed production/tests/launchers/shared seams |
| `8.1` local order authority | IBKR_ORDER_SERVICE §§1,3,5–8,10,14,17–18; IBKR_ORDER_SERVICE_SECURITY; PRODUCT_REQUIREMENTS §15; TECHNICAL_SPEC §§33–35,37,40–41; TEST_STRATEGY §§24–25,28 |
| `8.2` real CPGW lifecycle | IBKR_ORDER_SERVICE §§2,4,5,9,11–16; DECISIONS D-US-035/037/038; TECHNICAL_SPEC §§35–39; TEST_STRATEGY §§26–30 |
| `8.3` packaging/integration seam | IBKR_ORDER_SERVICE §§19–21; IBKR_ORDER_SERVICE_SECURITY §10; PRODUCT_SPEC/TECHNICAL_SPEC packaging; TEST_STRATEGY §§31–32 |
| `8.4` branch-8 reclosure | all IBKR order contracts + affected generic contracts + full required deterministic gates + PR/main/open-PR truth |
| `8.5` basic in-product BUY | BASIC_BUY_INTEGRATION; IBKR_ORDER_SERVICE; IBKR_ORDER_SERVICE_SECURITY; current Detail/service/launcher/order-sidecar tests/code; extension review |
| `9.1` Replay recorder/storage | MARKET_REPLAY recording/library sections; DATA_CONTRACT Replay recording projection; PRODUCT_REQUIREMENTS/PRODUCT_SPEC Replay; TEST_STRATEGY recorder/storage proof; existing ScreenerHulPaging3 validation seam |
| `9.2` portable recording format | MARKET_REPLAY portable/large-recording sections; DATA_CONTRACT portable format; TEST_STRATEGY file/export/source proof |
| `9.3` Player/time projection | MARKET_REPLAY playback/time/Pause/Resume sections; DATA_CONTRACT Replay time projection; D-US-042; TEST_STRATEGY player timing; existing ProducerBridge/shared protocol |
| `9.4` Replay Host/isolation | MARKET_REPLAY Stop/Seek/Host/Viewer sections; D-US-043/044; TEST_STRATEGY Stop/Seek/isolation/bootstrap; existing service `--db`/`--port`/`--allowed-origin` seams |
| `9.5` branch-9 reclosure | MARKET_REPLAY + affected generic PRODUCT/DATA/TECHNICAL/TEST contracts + focused Replay acceptance + materially affected broad gates + PR/main/open-PR truth |
| `9.6` Replay hardening | REPLAY_HARDENING; MARKET_REPLAY; extension review; existing Replay tests/code only as routed by the hardening contract |

TREE `success_evidence` remains the definition of done; this file is context routing only and must not duplicate allocation or execution state.
