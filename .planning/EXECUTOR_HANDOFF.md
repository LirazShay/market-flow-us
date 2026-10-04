# Market Flow US Executor Handoff

This is the compact GitHub-only bootstrap for numbered implementation chats.

`.planning/TREE.yaml` owns Strategy, Tactic, dependencies and success evidence.
`.planning/EXECUTION.yaml` owns chat allocation/state only.

## Authorization gate

Production implementation is allowed only when all are true:

```text
.planning/STATUS.yaml -> plan_state: frozen
STATUS.yaml -> phase: implementation
.planning/EXECUTION.yaml -> allocated (not chats: {})
```

Otherwise do not code.

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
| `4.*` Scanner | PRODUCT_REQUIREMENTS Scanner, PRODUCT_SPEC Scanner, TECHNICAL_SPEC Scanner, SCANNER_SQL_GUIDE, TEST_STRATEGY Scanner |
| `5.*` Fake Market/E2E | TEST_STRATEGY Fake Market/Browser E2E, DATA_CONTRACT, relevant PRODUCT_SPEC runtime flows |
| `6.1` packaging/branding | TECHNICAL_SPEC artifact/file naming, PRODUCT_SPEC branding, package/build/launcher/docs tests |
| `6.2` diagnostics/live harness | AGENTS diagnosability, PRODUCT_REQUIREMENTS diagnostics, TECHNICAL_SPEC diagnostics/live boundary, TEST_STRATEGY live gate |
| `6.3` workload | TEST_STRATEGY workload, TECHNICAL_SPEC workload, Scanner staged-query contract |
| `7.1` final offline candidate | TEST_STRATEGY Fast/Browser/workload final gates + all affected leaf evidence |
| `7.2` real provider | DATA_CONTRACT external facts, PRODUCT_SPEC live verification, TEST_STRATEGY real-provider gate |
| `7.3` release closure | GOAL, root STATUS, AGENTS, README/user docs, US_MIGRATION_FILE_MAP and TREE success evidence |

For every node, TREE `success_evidence` is the definition of done.

## Diagnosability rule

Whenever an assigned node changes an operational boundary/failure path, preserve/add the smallest stable checkpoint/error/support evidence required by AGENTS.

Do not add a parallel logging framework.

## Donor repository rule

Do not preload donor repos.

Normal execution uses Market Flow US durable truth.

Consult `market-scope`, `trading-us` or `market-flow` only when:
- the assigned node explicitly cites provenance that is not sufficiently extracted here; or
- a concrete contradiction is discovered.

Any newly resolved donor fact that materially affects implementation must be written back into Market Flow US durable docs before continuing.

## Availability

A leaf is available only when every TREE `depends_on` leaf is `done` in EXECUTION.

Within one chat:
- execute assigned nodes in listed order;
- same-chat dependencies unlock as earlier nodes become done;
- do not skip a blocked earlier assigned node.

Across chats, root STATUS points to the current numbered chat.

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

## Completion discipline

A chat/node result is not product completion.

Overall product completion additionally requires TREE 7.1, 7.2 and 7.3 outcomes plus the normal PR/merge/main-green closure in AGENTS.
