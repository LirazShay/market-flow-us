# Market Flow US Executor Handoff

This is the compact GitHub-only bootstrap for numbered implementation chats.

`.planning/TREE.yaml` owns Strategy, Tactic, dependencies and success evidence.
`.planning/EXECUTION.yaml` owns chat allocation/state only.

## Authorization gate

Production implementation is allowed only when all are true:

```text
.planning/STATUS.yaml -> plan_state: frozen
.planning/STATUS.yaml -> implementation_authorized: true
STATUS.yaml -> phase: implementation
.planning/EXECUTION.yaml -> allocated (not chats: {})
```

Otherwise do not code.

A frozen plan may intentionally remain in root `phase: planning` while a required planning/CI/merge gate is unavailable. That state is reviewed/prepared planning, not implementation authorization.

## Fresh executor read order

For `אני צאט N תתחיל`:

1. fetch current `main`;
2. read `AGENTS.md`;
3. read root `STATUS.yaml`;
4. read `.planning/STATUS.yaml`;
5. read this file;
6. read `.planning/EXECUTION.yaml` and locate Chat N;
7. read only Chat N's assigned TREE leaf nodes and their direct dependencies;
8. verify dependency states in EXECUTION;
9. load only routed durable contracts/tests/code;
10. if Chat N is not the current available chat, report the blocker and do not code;
11. otherwise use one focused feature branch for the chat work unit and execute its nodes in listed order.

Do not ask the user to restate the plan.

## Context routing

| Node family | Primary durable contracts/evidence |
|---|---|
| `1.*` U.S. acquisition | DATA_CONTRACT, PRODUCT_SPEC flows 2–5, TECHNICAL_SPEC provider/Recorder, TEST_STRATEGY unit/provider sections |
| `2.*` schema/authority | DATA_CONTRACT, TECHNICAL_SPEC schema/persistence/protocol, TEST_STRATEGY service/schema sections |
| `3.*` trusted reads/Viewer | PRODUCT_REQUIREMENTS Current/History, PRODUCT_SPEC Current/Detail, TECHNICAL_SPEC trusted reads, TEST_STRATEGY Viewer/E2E |
| `4.1`–`4.2` Scanner | PRODUCT_REQUIREMENTS Scanner, PRODUCT_SPEC Scanner, TECHNICAL_SPEC Scanner, SCANNER_SQL_GUIDE, TEST_STRATEGY Scanner |
| `4.3.1` Demo Buy schema/persistence | DEMO_BUY_VALIDATION, AI_INVESTIGATION_PACK bounded context, DATA_CONTRACT schema-v4 facts, TECHNICAL_SPEC schema version + Demo Buy tables, TEST_STRATEGY schema-v4 lifecycle |
| `4.3.2` Demo Buy capture authority | DEMO_BUY_VALIDATION capture/provenance/concurrency, AI_INVESTIGATION_PACK capture-context provenance, TECHNICAL_SPEC protocol + capture authority, TEST_STRATEGY Demo Buy capture integration |
| `4.3.3` Demo Buy evaluation/read model | DEMO_BUY_VALIDATION horizons/read model, DATA_CONTRACT derived facts, TECHNICAL_SPEC evaluation/read model, TEST_STRATEGY trusted-read/evaluation + AGENTS SQL static preflight |
| `4.4.1` Scanner Demo Buy UX | DEMO_BUY_VALIDATION Scanner capture controls/auto backpressure, PRODUCT_SPEC Demo Buy capture, TECHNICAL_SPEC browser workflow, TEST_STRATEGY Scanner selection model |
| `4.4.2` Demo Buy outcome screen | DEMO_BUY_VALIDATION Viewer UX, PRODUCT_REQUIREMENTS Demo Buy validation, PRODUCT_SPEC Demo Buy Viewer, TECHNICAL_SPEC Demo Buy surface, TEST_STRATEGY Browser E2E |
| `4.5.1` AI Investigation exporter | AI_INVESTIGATION_PACK full contract, DATA_CONTRACT bounded context/history facts, TECHNICAL_SPEC `demo.buy.ai-pack.create`, TEST_STRATEGY AI pack unit/service proof |
| `4.5.2` AI Investigation UI | AI_INVESTIGATION_PACK UI workflow, PRODUCT_REQUIREMENTS AI investigation outcome, PRODUCT_SPEC Demo Buy investigation flow, TEST_STRATEGY Chromium AI pack E2E |
| `5.*` Fake Market/E2E | TEST_STRATEGY Fake Market/Browser E2E + configurable synthetic generator, DATA_CONTRACT, relevant PRODUCT_SPEC runtime flows |
| `6.1` packaging/branding | TECHNICAL_SPEC artifact/file naming, PRODUCT_SPEC branding, package/build/launcher/docs tests |
| `6.2` diagnostics/live harness | AGENTS diagnosability, PRODUCT_REQUIREMENTS diagnostics, TECHNICAL_SPEC diagnostics/live boundary, TEST_STRATEGY authenticated gates |
| `6.3` workload/tooling | TEST_STRATEGY workload correctness/performance-smoke + isolated probes, TECHNICAL_SPEC workload/generator/daily DB sections, Scanner staged-query contract, AGENTS SQL static preflight |
| `7.1` final offline candidate | TEST_STRATEGY Fast/Browser/bounded-workload correctness/sanity gates + all affected leaf evidence |
| `7.2` local acceptance kit | TEST_STRATEGY Local Fake Leumi acceptance kit, configurable generator, Fake Market/runtime/service/workload reuse, target-machine launcher/report contract |
| `7.3` release closure | GOAL, root STATUS, AGENTS, README/user docs, TECHNICAL_SPEC daily DB lifecycle, US_MIGRATION_FILE_MAP and TREE success evidence |
| `7.5` post-feature re-closure | all Demo Buy + AI Investigation canonical contracts + USER_GUIDE/SCANNER_SQL_GUIDE, full Fast/Browser/Planning/Workload gates, local Fake Leumi Demo Buy/AI proof, PR/main/open-PR truth |
| `7.4` final target-machine acceptance | TEST_STRATEGY final target-machine bundle: local Fake Leumi + Demo Buy + AI Investigation user journey + isolated day-bounded probes + 4096x180 end-to-end performance + new-day reset/archive + authenticated static-market smoke + authenticated market-open gate |

For every node, TREE `success_evidence` is the definition of done.

## Post-replan execution sequence

The serial allocation is intentionally:

```text
Chat 10: 4.3.1 → 4.3.2
Chat 11: 4.3.3
Chat 12: 4.4.1
Chat 13: 4.4.2
Chat 14: 4.5.1
Chat 15: 4.5.2
Chat 16: 7.5
Chat 17: 7.4
```

Do not jump directly to release re-closure or final target-machine acceptance. `7.5` requires the complete AI Investigation UI leaf, and `7.4` is last and depends on the exact post-feature release candidate produced by `7.5`.

## Automation-performance responsibility

Every executor owns the speed of the automated paths it touches or discovers to be materially slow.

If a focused or full verification path is unexpectedly slow:

```text
localize the dominant recurring cost
→ refactor/remove duplicate work
→ preserve the same proof
→ remeasure wall-clock end-to-end
→ only then continue
```

Do not normalize avoidable slowness with larger timeouts/retries. Hosted CI is correctness-first; heavy `4096 × 180` and realistic one-day performance PASS/FAIL remain target-machine evidence.

## Daily DB lifecycle invariant

The active production market-data DB represents one trading day.

Demo Buy observations and their bounded Scanner-context provenance are active-day evidence linked to active-day history. They persist across service restart but do not migrate into a fresh next-day DB. New-day rotation accepts a valid v3 or v4 source, preserves saved queries, optionally archives the source unchanged, and creates a fresh schema-v4 active DB with empty Demo Buy state. Unresolved future horizons never bridge into the new DB.

## Demo Buy / AI Investigation KISS invariants

Do not introduce a Strategy Engine, order/fill simulator, portfolio model, background horizon worker, materialized horizon-result columns, second database/transport, cross-day strategy warehouse or auto-capture replay queue.

Persist capture facts plus the bounded original Scanner comparison context only. Calculate outcomes in the trusted Node read model.

AI Investigation is also local and bounded:

```text
Demo Buy observation
→ deterministic local evidence pack
→ user copies/uploads it to an AI of choice
```

Do not add AI credentials, automatic cloud calls, web enrichment, autonomous Scanner SQL edits/activation, causal claims from one observation, or a second horizon algorithm. `OUTCOME.json` must reuse the trusted Demo Buy evaluator.

## Acknowledgement uncertainty invariant

A Demo Buy capture request can commit before the WebSocket ACK reaches the Viewer. Therefore transport loss after request submission is not proof of rollback.

The UI/service contract distinguishes:

```text
confirmed committed
confirmed rejected/rolled back
ACKNOWLEDGEMENT_UNKNOWN
```

There is no blind automatic retry for an unknown capture result. Recovery is explicit through refresh/relaunch/inspection so duplicate observations are not created accidentally.

## Diagnosability rule

Whenever an assigned node changes an operational boundary/failure path, preserve/add the smallest stable checkpoint/error/support evidence required by AGENTS. Do not add a parallel logging framework.

AI Investigation diagnostics may report pack/capture IDs, status and file counts, but must not dump full SQL/history payloads or private provider/session material.

## Donor repository rule

Do not preload donor repos. Normal execution uses Market Flow US durable truth.

Consult `market-scope`, `trading-us` or `market-flow` only when the assigned node explicitly cites unresolved provenance or a concrete contradiction is discovered. Write any materially resolved fact back into Market Flow US durable docs before continuing.

## Availability

A leaf is available only when every TREE `depends_on` leaf is `done` in EXECUTION.

Within one chat:
- execute assigned nodes in listed order;
- same-chat dependencies unlock as earlier nodes become done;
- do not skip a blocked earlier assigned node.

Across chats, root STATUS points to the current numbered chat once implementation is authorized.

## Work-unit lifecycle

For each assigned leaf:

```text
set in_progress on working branch
→ implement smallest sufficient contract
→ focused proof
→ required broader verification
→ satisfy TREE success_evidence
→ set done + concise result
→ advance STATUS/EXECUTION on same branch
```

Then:

```text
PR
→ required CI green
→ review diff
→ squash merge
→ verify main CI
→ audit open PRs
```

Do not open a second evidence-only closure PR.

If required GitHub Actions/CI is unavailable, do not substitute an unverified merge or start the next implementation unit. Keep the work blocked until the required gate can run and pass.

## Planning defect discovered during execution

Follow `FRAMEWORK.md` execution-reopen rules:

- stop the affected leaf;
- mark it blocked with factual reason;
- root phase -> planning;
- plan_state -> active;
- no node remains in_progress;
- reopen only the smallest affected planning area;
- preserve valid done work;
- re-freeze and repair allocation before resuming.

## Final user-dependent acceptance rule

All checks that require the user's authenticated browser, target Windows machine, heavy target-machine performance or active market are allocated only to TREE `7.4` / Chat 17.

Earlier chats build and automatically prove acceptance tooling with bounded deterministic fixtures. `7.4` additionally proves that the user can generate/copy/regenerate an AI Investigation Pack from a real local Demo Buy observation on the exact accepted SHA; this remains a local export and does not require sending it to any external AI as an acceptance prerequisite.

## Completion discipline

A chat/node result is not product completion.

Overall product completion additionally requires `4.3.*`, `4.4.*`, `4.5.*`, `7.5`, final `7.4`, and the normal PR/merge/main-green closure in AGENTS.
