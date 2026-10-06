# Market Flow US Executor Handoff

This is the compact GitHub-only bootstrap for numbered implementation chats.

`.planning/TREE.yaml` owns Strategy/Tactic/dependencies/success evidence. `.planning/EXECUTION.yaml` owns chat allocation/state.

## Authorization gate

Production implementation is allowed only when all are true:

```text
.planning/STATUS.yaml -> plan_state: frozen
.planning/STATUS.yaml -> implementation_authorized: true
STATUS.yaml -> phase: implementation
.planning/EXECUTION.yaml -> allocated
```

Otherwise do not code.

## Fresh executor read order

For `אני צאט N תתחיל`:

1. fetch fresh `main`;
2. read `AGENTS.md`;
3. read `STATUS.yaml`;
4. read `.planning/STATUS.yaml`;
5. read this file;
6. read `.planning/EXECUTION.yaml` and locate Chat N;
7. read only assigned TREE leaves + direct dependencies;
8. verify every dependency is `done` in EXECUTION;
9. load only the contracts/tests/code routed below;
10. if Chat N/current node/dependencies do not authorize work, report blocker and do not code;
11. otherwise create one focused feature branch and execute assigned leaves in order.

Do not ask the user to restate the plan.

## Contract routing

| Node | Primary durable truth |
|---|---|
| `1.*` acquisition | DATA_CONTRACT, PRODUCT_SPEC, TECHNICAL_SPEC provider/Recorder, TEST_STRATEGY |
| `2.*` market schema/authority | DATA_CONTRACT, TECHNICAL_SPEC schema/persistence, TEST_STRATEGY |
| `3.*` reads/Viewer | PRODUCT_REQUIREMENTS, PRODUCT_SPEC, TECHNICAL_SPEC reads, TEST_STRATEGY |
| `4.1`–`4.2` Scanner | PRODUCT_REQUIREMENTS Scanner, PRODUCT_SPEC Scanner, TECHNICAL_SPEC Scanner, SCANNER_SQL_GUIDE, TEST_STRATEGY |
| `4.3.1` Demo Buy schema | DEMO_BUY_VALIDATION §§5,10,16; DEMO_BUY_PROTOCOL_LIMITS; DATA_CONTRACT v4; TECHNICAL_SPEC schema; TEST_STRATEGY migration/context |
| `4.3.2` capture authority | DEMO_BUY_VALIDATION §§3–9; DEMO_BUY_PROTOCOL_LIMITS; DECISIONS D-US-026/027/031; TECHNICAL_SPEC protocol/capture; TEST_STRATEGY capture/lost-ACK |
| `4.3.3` evaluation/read model | DEMO_BUY_VALIDATION §§7,11–13; DEMO_BUY_PROTOCOL_LIMITS watermark; TECHNICAL_SPEC `demo.buy.page/capture.get/observation.get`; TEST_STRATEGY read/evaluation; AGENTS SQL preflight |
| `4.4.1` Scanner Demo Buy UX | DEMO_BUY_UX Scanner/Auto/Stop sections; PRODUCT_REQUIREMENTS Scanner/Auto; PRODUCT_SPEC Scanner/capture; TEST_STRATEGY browser model |
| `4.4.2` Demo Buy surface | DEMO_BUY_UX capture groups/horizon layout/refresh/errors; PRODUCT_REQUIREMENTS Demo Buy UX; PRODUCT_SPEC Viewer; TEST_STRATEGY Browser E2E |
| `4.5.1` AI exporter | AI_INVESTIGATION_PACK; DEMO_BUY_PROTOCOL_LIMITS export/watermark; DATA_CONTRACT; TECHNICAL_SPEC exporter; TEST_STRATEGY AI unit/service |
| `4.5.2` AI UX | DEMO_BUY_UX investigation/export/clipboard sections; AI_INVESTIGATION_PACK Viewer flow; PRODUCT_SPEC; TEST_STRATEGY Chromium |
| `5.*` Fake Market/E2E | TEST_STRATEGY Fake Market/Browser, DATA_CONTRACT, PRODUCT_SPEC runtime |
| `6.1` packaging | TECHNICAL_SPEC files/artifacts, build/launcher/docs tests |
| `6.2` diagnostics/live | AGENTS diagnosability, TECHNICAL_SPEC diagnostics/live, TEST_STRATEGY authenticated gates |
| `6.3` workload | TEST_STRATEGY workload, TECHNICAL_SPEC performance, shared generator, AGENTS SQL preflight |
| `7.1`–`7.3` historical closure | TREE evidence + existing release/local acceptance contracts |
| `7.5` post-feature reclosure | all Demo Buy/AI contracts + USER_GUIDE/SCANNER_SQL_GUIDE + full deterministic gates + PR/main/open-PR truth |
| `7.4` final acceptance | TEST_STRATEGY target-machine/local Fake Leumi/Demo Buy/AI journey/heavy workload/new-day/authenticated gates |

TREE `success_evidence` is always definition-of-done.

## Post-replan serial allocation

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

Do not skip to reclosure/acceptance. `7.5` requires the complete AI UX path; `7.4` is last.

## Demo Buy invariants

### Selection/provenance

```text
choose source rows
→ validate every identity
→ browser dedupe by first chosen occurrence
→ preserve original resultRank
```

Exact bounds live in `DEMO_BUY_PROTOCOL_LIMITS.md`: 5000 items, 1 MiB SQL, first 50 context rows, <=64 retained columns with canonical identity mandatory, 128-byte clipped textual/serialized cells, <=256 KiB context.

Node rejects malformed duplicates/order/context and cross-checks selected ranks <=50 against context identity.

### Authority

No browser-supplied price.

```text
baseline = history(buy_cycle_id, security_id)
prediction-time authority: cycle_id <= buy_cycle_id
post-capture authority:    cycle_id > buy_cycle_id
```

Horizon match must also satisfy `cycle_id > buy_cycle_id` and `collected_at_ms >= captured_at_ms + H`.

Wall-clock timestamps are diagnostics only. Preserve raw values; negative derived durations/latencies/ages become null + timing anomaly, never authority reordering.

### Capture acknowledgement

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

Never blindly replay acknowledgement-unknown capture.

### Backpressure

One Viewer-wide capture slot. Busy Auto generations are visibly skipped, not queued. One Viewer-wide AI-export slot; extra Generate/Regenerate actions do not queue.

## Scanner/Viewer UX invariants

- Scanner result capture always refers to the exact rendered active generation, not edited draft text.
- Capture freezes generation + row selection synchronously before async submit.
- Checkbox/control interaction must not trigger row-to-Detail navigation.
- Auto is Viewer-session state, visible across surfaces and directly switchable Off.
- Auto changes apply only to future generations; Off does not cancel an already in-flight capture.
- Scanner has a **resumable** Stop recurring scan distinct from terminal Viewer destroy; later Activate works.
- Demo Buy page uses capture groups, sticky identity/baseline columns and one compact cell per horizon.
- `NO_FUTURE_OBSERVATION` is shown as Pending; other unavailable reasons remain warnings.
- `Refresh latest` resets page one; `Load more` continues keyset walk; `Refresh observation` uses `demo.buy.observation.get` and does not reset pagination.

## AI Investigation invariants

AI Investigation is local evidence packaging only:

```text
Demo Buy observation
→ deterministic local pack
→ user copies/uploads to AI of choice
```

No AI credential/cloud call/web enrichment/automatic Scanner mutation.

Prediction-time and outcome evidence obey the same `buy_cycle_id` watermark. `OUTCOME.json` reuses the trusted Demo Buy evaluator.

Exporter accepts no browser path, publishes temp-dir→atomic-rename under `exports/ai-investigations/`, returns a product-relative path, never overwrites a successful pack and mutates no DB.

A lost export ACK may be regenerated after reconnect because export is non-mutating/collision-safe. Clipboard operations require manual-copy fallback.

## Schema/new-day invariants

Valid v3 migrates transactionally to v4; suspicious partial-v3 Demo structures fail closed. Fresh DB boots v4. No speculative history index.

New Trading Day accepts valid v3 or v4 source, rejects v1/v2/corrupt/running states, preserves saved queries only, optionally archives source unchanged and installs fresh v4 with empty Demo Buy state.

## Performance / KISS

Do not add Strategy Engine, order/fill simulator, portfolio model, background horizon updater, materialized horizon columns, second DB/transport, cross-day strategy warehouse, capture replay queue or AI-agent subsystem.

If recurring verification is materially slow:

```text
localize dominant cost
→ remove duplication/waste
→ preserve proof
→ remeasure
```

Hosted CI is correctness-first; heavy 4096×180/day-bounded performance remains target-machine evidence.

## Diagnostics/security

Preserve the existing checkpoint/support architecture; do not add parallel logging.

Support evidence may contain bounded status/counters/IDs but never credentials, cookies, auth/session data, raw authenticated dumps, stored SQL, Scanner/history evidence or AI prompt contents.

## Work-unit lifecycle

For each leaf:

```text
set in_progress
→ proof/test first when practical
→ smallest sufficient implementation
→ focused verification
→ required broader gates
→ satisfy success_evidence
→ set done/result
→ update STATUS/EXECUTION
→ PR
→ CI green
→ diff review
→ squash merge
→ main CI green
→ open-PR audit
```

A blocking defect stays with the discovering chat: root cause → fix → regression/proof → affected verification → green.

If frozen planning is proven wrong, stop coding, block affected execution, reopen the smallest planning area per FRAMEWORK, repair/review/freeze, then continue.

If required GitHub Actions/CI is unavailable, do not merge unverified work or start the next implementation unit.

## Final acceptance

Chat 17 / TREE `7.4` is authorized only after fresh `main` shows `7.5` done and the current pointer at `7.4`.

The exact accepted **product candidate** for final acceptance is:

```text
e0af9d105004f175a44ec33fa481fba0631773bf
```

It is the squash merge of PR #27 and passed Fast, Browser (including bounded Local Fake `all` / FR-7 + FR-8A–H), Planning Docs and bounded Workload on PR and again on `main` before handoff. Handoff-only metadata commits after this SHA do **not** replace the accepted product candidate. Chat 17 should bootstrap authorization from fresh `main`, but the product acceptance evidence must remain pinned to the exact SHA above (checkout/verify that candidate as required by the acceptance tooling rather than silently substituting a later metadata-only SHA).

Only `7.4`/Chat 17 owns user-dependent authenticated browser, target-machine heavy performance and market-open checks. It also proves a complete local Demo Buy + AI Investigation user journey on the exact accepted SHA; sending the generated pack to an external AI is not itself an acceptance prerequisite.

Overall completion requires every assigned leaf done, deterministic reclosure, final acceptance, PR/merge/main-green closure and no blocking defect.
