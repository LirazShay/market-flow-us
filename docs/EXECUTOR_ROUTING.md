# Market Flow US Executor Routing

This is the target-owned context-routing contract for explicitly numbered executor chats.

It is project-owned and intentionally separate from ST Planner framework material. ST Planner 2.0 is consumed as an external method/reference; this repository does not install or maintain a framework-owned handoff runtime.

Use this document only to decide which durable project contracts/code/tests to load for an explicitly assigned task. Authority is:

```text
.planning/PLAN.md      = planning / S&T / success-evidence truth
.planning/EXECUTION.md = task / owner / status / real dependency / result-evidence truth
STATUS.yaml            = non-authoritative navigation projection only
backlog/README.md      = future non-blocking work only; never execution authority
```

Load only the row(s) relevant to the explicitly assigned task(s); do not preload the whole repository. A numbered executor activates only from an explicit request such as `אני צאט 35 תתחיל`; generic continuation or a projected current pointer never changes chat identity.

Every fresh Branch-11/Branch-12 executor must be able to reconstruct its work entirely from GitHub. Previous-chat memory is optional context only and never authority.

Backlog item `B-US-000` has no executor routing until it is explicitly planned/allocated again. `B-US-008` is historical provenance for completed Branch 11. `B-US-010` is promoted as Branch 12 in `.planning/PLAN.md` and `.planning/EXECUTION.md`. `B-US-009` remains a separate blocked target-machine acceptance row and is not a Branch-12 dependency unless `.planning/EXECUTION.md` explicitly says otherwise.

| Task / PLAN leaf | Primary durable truth |
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
| `7.1`–`7.3` historical closure | PLAN success evidence + existing release/local acceptance contracts |
| `7.5` historical post-Demo-Buy reclosure | Demo Buy/AI contracts + USER_GUIDE/SCANNER_SQL_GUIDE + historical deterministic evidence |
| `7.6.*` pre-acceptance extension audit | PRE_ACCEPTANCE_CODE_AUDIT; PRE_ACCEPTANCE_CODE_AUDIT_REPORT; BASIC_BUY_INTEGRATION; IBKR_ORDER_SERVICE + SECURITY; MARKET_REPLAY + REPLAY_HARDENING; changed production/tests/launchers/shared seams |
| `8.1` local order authority | IBKR_ORDER_SERVICE §§1,3,5–8,10,14,17–18; IBKR_ORDER_SERVICE_SECURITY; PRODUCT_REQUIREMENTS §15; TECHNICAL_SPEC §§33–35,37,40–41; TEST_STRATEGY §§24–25,28 |
| `8.2` real CPGW lifecycle | IBKR_ORDER_SERVICE §§2,4,5,9,11–16; DECISIONS D-US-035/037/038; TECHNICAL_SPEC §§35–39; TEST_STRATEGY §§26–30 |
| `8.3` packaging/integration seam | IBKR_ORDER_SERVICE §§19–21; IBKR_ORDER_SERVICE_SECURITY §10; PRODUCT_SPEC/TECHNICAL_SPEC packaging; TEST_STRATEGY §§31–32 |
| `8.4` branch-8 reclosure | all IBKR order contracts + affected generic contracts + required deterministic evidence + PR/main/open-PR truth |
| `8.5` basic in-product BUY | BASIC_BUY_INTEGRATION; IBKR_ORDER_SERVICE; IBKR_ORDER_SERVICE_SECURITY; current Detail/service/launcher/order-sidecar tests/code; extension review |
| `9.1` Replay recorder/storage | MARKET_REPLAY recording/library sections; DATA_CONTRACT Replay recording projection; PRODUCT_REQUIREMENTS/PRODUCT_SPEC Replay; TEST_STRATEGY recorder/storage proof; existing ScreenerHulPaging3 validation seam |
| `9.2` portable recording format | MARKET_REPLAY portable/large-recording sections; DATA_CONTRACT portable format; TEST_STRATEGY file/export/source proof |
| `9.3` Player/time projection | MARKET_REPLAY playback/time/Pause/Resume sections; DATA_CONTRACT Replay time projection; D-US-042; TEST_STRATEGY player timing; existing ProducerBridge/shared protocol |
| `9.4` Replay Host/isolation | MARKET_REPLAY Stop/Seek/Host/Viewer sections; D-US-043/044; TEST_STRATEGY Stop/Seek/isolation/bootstrap; existing service `--db`/`--port`/`--allowed-origin` seams |
| `9.5` branch-9 reclosure | MARKET_REPLAY + affected generic PRODUCT/DATA/TECHNICAL/TEST contracts + focused Replay acceptance + materially affected broad evidence + PR/main/open-PR truth |
| `9.6` Replay hardening | REPLAY_HARDENING; MARKET_REPLAY; extension review; existing Replay tests/code only as routed by the hardening contract |
| `10.1` Backtest offline evidence access | BACKTEST_LAB source-isolation/read-only sections; PLAN 10.1; current database/schema openers; New Trading Day/archive discovery seams; AGENTS security/diagnostics; focused database/service tests |
| `10.2` historical Scanner sandbox | BACKTEST_LAB historical-time/anti-lookahead/Query-source sections; PLAN 10.2; current Scanner admission; cycle schema/persistence authority; AGENTS SQL preflight; focused Scanner/DuckDB tests |
| `10.3` Backtest outcome evaluator | BACKTEST_LAB baseline/future-outcome sections; PLAN 10.3; existing Demo Buy evaluator/outcome-shaping seams; shared Demo Buy outcome helpers; AGENTS SQL preflight; focused equivalence tests |
| `10.4` Inspect/Compare UX | BACKTEST_LAB Inspect/Compare/beginner-UX sections; PLAN 10.4; current Viewer/Scanner client/runtime/view patterns; 10.2/10.3 APIs; focused unit/Chromium proof |
| `10.5` Sweep engine/reporting | BACKTEST_LAB Sweep semantics/reporting/performance sections; PLAN 10.5; 10.2–10.4 engine/result seams; workload/paging patterns; focused unit/service/Chromium proof |
| `10.6` Backtest operation/reclosure | BACKTEST_LAB offline UX/performance/acceptance; PLAN 10.6; packaging/launcher/user-guide/test-strategy seams; all Branch-10 results; affected Fast/Browser/Planning/Workload and PR/main/open-PR truth |
| `11.1` Research Server + ledger foundation | PLAN 11.1; DECISIONS D-US-049/050; AI_RESEARCHER_API_LEDGER_CONTRACT; AI_RESEARCHER_ARCHITECTURE_DISCOVERY; AI_RESEARCHER_SECURITY_RESOURCE_MODEL; current DuckDB hardening/database patterns; focused ledger/domain tests |
| `11.2` authoritative experiments/diagnostics | PLAN 11.2; DECISIONS D-US-049/051; BACKTEST_LAB; AI_RESEARCHER_EXPERIMENT_MODEL; AI_RESEARCHER_API_LEDGER_CONTRACT; backtest-lab source/baseline/scanner/outcome modules; SCANNER_SQL_GUIDE; AGENTS SQL preflight; focused equivalence/immutability tests |
| `11.3` research SQL data surface | PLAN 11.3; DECISIONS D-US-049/051/052/055; AI_RESEARCHER_DATA_SURFACE; AI_RESEARCHER_SECURITY_RESOURCE_MODEL; DATA_CONTRACT; SCANNER_SQL_GUIDE; current DuckDB hardening/Scanner admission patterns; AGENTS SQL preflight; focused sandbox/adversarial tests |
| `11.4` jobs/results/resources | PLAN 11.4; DECISION D-US-053; AI_RESEARCHER_API_LEDGER_CONTRACT; AI_RESEARCHER_SECURITY_RESOURCE_MODEL; 11.2/11.3 public seams/tests; current workload infrastructure; focused cancel/restart/idempotency/paging tests |
| `11.5` validation/holdout/final recommendation | PLAN 11.5; DECISIONS D-US-050/052/053; AI_RESEARCHER_EXPERIMENT_MODEL; AI_RESEARCHER_API_LEDGER_CONTRACT; AI_RESEARCHER_DATA_SURFACE; 11.2–11.4 seams; focused partition/exposure/finalist/holdout tests |
| `11.6` Plugin/Skill + MCP integration | PLAN 11.6; DECISION D-US-054; AI_RESEARCHER_OPERATING_CONTRACT; AI_RESEARCHER_API_LEDGER_CONTRACT; stable Research Domain API from 11.1–11.5; current official OpenAI Plugin/MCP docs reverified at execution time; focused adapter/bootstrap/resume tests |
| `11.7` adversarial hardening | PLAN 11.7; DECISIONS D-US-049–055; AI_RESEARCHER_SECURITY_RESOURCE_MODEL; all Branch-11 domain contracts; changed production/runtime/tests from 11.1–11.6; hostile SQL/ID/phase/fault/restart matrix; source-fingerprint proof |
| `11.8` workload/desktop acceptance/reclosure | PLAN 11.8; AI_RESEARCHER_SECURITY_RESOURCE_MODEL workload gates; AI_RESEARCHER_OPERATING_CONTRACT final-output/desktop path; all Branch-11 results; workload scripts; target-machine evidence; affected durable PRODUCT/DATA/TECHNICAL/TEST/user docs; Fast/Browser/Planning/Workload/PR/main/open-PR truth |
| `12.1` Trading domain + durable authority | PLAN 12.1; AUTONOMOUS_AI_TRADING domain/ledger sections; IBKR_ORDER_SERVICE authority boundaries; current durable-ledger/ID patterns; focused persistence/restart/immutability tests |
| `12.2` Scanner candidate handoff | PLAN 12.2; AUTONOMOUS_AI_TRADING candidate/provenance sections; SCANNER_SQL_GUIDE; Scanner generation/result provenance code/tests; focused exact-generation/identity tests |
| `12.3` targeted live quote watch | PLAN 12.3; AUTONOMOUS_AI_TRADING quote/staleness sections; IBKR_ORDER_SERVICE market-data/resolve seams; current CPGW adapter; bounded polling/resource tests |
| `12.4` continuous Trading Supervisor | PLAN 12.4; AUTONOMOUS_AI_TRADING supervisor/DecisionProposal/restart sections; stable 12.1–12.3/12.5–12.6 seams; deterministic state-transition/restart/stale-proposal tests |
| `12.5` independent Hard Risk Authority | PLAN 12.5; AUTONOMOUS_AI_TRADING hard-risk section; IBKR_ORDER_SERVICE_SECURITY; order-service LIVE/position guards; focused non-bypass/pause/kill-switch tests |
| `12.6` protected order-service bridge | PLAN 12.6; AUTONOMOUS_AI_TRADING execution bridge; IBKR_ORDER_SERVICE + SECURITY; existing idempotency/reconciliation/SELL guard tests/code; no direct CPGW path |
| `12.7` Trading Skill + Trading MCP | PLAN 12.7; AUTONOMOUS_AI_TRADING MCP boundary; Branch-11 Plugin/MCP packaging patterns only; stable Branch-12 domain APIs; current official OpenAI Plugin/MCP docs reverified at execution time; focused capability/resume/authorization tests |
| `12.8` episode attribution + strategy distillation | PLAN 12.8; AUTONOMOUS_AI_TRADING episode/attribution/distillation sections; TradeEpisode evidence from 12.1–12.7; BACKTEST_LAB/AI Researcher seams only where strategy-level validation is needed; deterministic attribution/policy-candidate tests |
| `12.9` staged acceptance + adversarial reclosure | PLAN 12.9; AUTONOMOUS_AI_TRADING acceptance/security sections; all Branch-12 results; synthetic/shadow/DRY_RUN evidence; order-service security/restart/idempotency adversarial matrix; affected Fast/Browser/Planning/Workload/PR/main/open-PR truth; external LIVE/user acceptance remains explicit rather than fabricated |

The corresponding `.planning/PLAN.md` leaf success evidence is the definition of done for allocated tasks. `.planning/EXECUTION.md` alone owns assignment, execution status, dependencies and result/evidence.

For Branch 11 specifically, detailed `.planning/AI_RESEARCHER_*` files are routed implementation context, not competing planning authorities. For Branch 12, `docs/AUTONOMOUS_AI_TRADING.md` is the durable domain contract; implementation findings that materially contradict PLAN/contracts use the Planning Impact Test and repair only the smallest affected authority before coding forward.