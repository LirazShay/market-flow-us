# Market Flow US — ChatGPT Research Plugin

Status: TREE `11.6` implementation in progress pending PR completion/merge reclosure.

## Current OpenAI compatibility decision

Reverified against current official OpenAI Plugin, Skill, MCP and ChatGPT documentation on 2026-10-13.

Selected packaging:

- portable Agent Plugins package at `plugins/market-flow-us-researcher/`;
- root `plugin.json` using the Agent Plugins `1.0.0` schema;
- compact workflow guidance under `skills/research/SKILL.md`;
- root `mcp.json` declaring the project Research MCP server;
- MCP remains a thin adapter over the stable Research Domain/API and existing Research SQL manifest rather than a second research implementation.

The portable package shape is intentionally preferred over making the legacy `.codex-plugin/plugin.json` compatibility format authoritative. A compatibility overlay may be added later only if an actual target-client acceptance path needs it.

The selected local MCP runtime is pinned to `@modelcontextprotocol/server@2.3.1`. TREE `11.6` keeps the model-facing registry independent of the SDK/transport package so future protocol/library upgrades cannot move Research authority out of the Domain.

## Transport decision

Research Domain semantics remain transport-neutral.

The shipped local transport is `stdio`:

```text
Agent Plugin mcp.json
→ market-flow-us-research-mcp executable
→ @modelcontextprotocol/server stdio transport
→ 46-tool thin registry
→ managed Research Domain / existing Research SQL manifest
```

`package.json` exposes the same launcher as both:

```text
market-flow-us-research-mcp
npm run research-mcp
```

The Plugin manifest deliberately invokes the installed executable rather than escaping the plugin package with `../..` paths. This preserves portable Plugin packaging rules and keeps repository/data path resolution owned by the executable rather than the ChatGPT prompt or MCP client.

`research-server/mcp-stdio.js` resolves default runtime storage relative to the installed Market Flow US package, not the caller's current working directory. Optional overrides are accepted only as absolute paths:

```text
MARKET_FLOW_US_RESEARCH_LEDGER_PATH
MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR
```

The local launcher does not open a network listener. Current ChatGPT MCP connectivity requires a reachable HTTPS endpoint or the approved Secure MCP Tunnel path for private/local MCP servers. That target-client bridge is an acceptance-layer concern for TREE `11.8`; it must not widen the Research Server to `0.0.0.0`, move durable authority into a tunnel, or change run/evidence/experiment/Validation/Holdout semantics. TREE `11.6` ships and verifies the portable local MCP server boundary.

## Runtime resource policy

`research-server/runtime-policy.js` promotes the exact bounded managed-resource policy already exercised by the TREE `11.4` Research workload probe into the shipped MCP runtime.

The MCP launcher passes that policy to `openManagedResearchDomain`; it does not invent transport-specific budgets. Existing DuckDB hardening/time-limit environment controls remain owned by the Research execution layers.

## Bootstrap contract

`research-server/ai-adapter.js` supplies the compact AI-facing bootstrap boundary.

It exposes two semantic operations:

- `describeResearchEnvironment()` — compact machine-readable product, schema-version, authority, bootstrap and security metadata;
- `bootstrapResearch(...)` — deterministic fresh-chat resume selection.

Resume behavior is fixed:

| Input/state | Result |
|---|---|
| explicit `researchRunId` exists | resume that exact run without discovery |
| explicit `researchRunId` missing | return `RUN_NOT_FOUND`; never substitute another run |
| no ID + zero `ACTIVE`/`PAUSED` runs | `NEW_OBJECTIVE_REQUIRED`; never create implicitly |
| no ID + one resumable run + explicit continue intent | resume the sole run |
| no ID + one resumable run without continue intent | return the candidate without silently resuming |
| no ID + multiple resumable runs | `DISAMBIGUATION_REQUIRED`; never guess |

The adapter delegates run truth and resume-capsule construction directly to the Research Domain. It does not duplicate ledger or experiment logic.

## MCP tool registry

`research-server/mcp-tool-registry.js` is the transport-neutral model-facing tool catalog. It exposes 46 thin operations covering:

- environment/bootstrap and durable Research Run lifecycle;
- on-demand machine-readable Research SQL relation/field semantics through the existing TREE `11.3` `describeResearchSqlSchema()` manifest;
- Objective Versions, Query Artifacts, Evidence Inventories/Plans/Partitions;
- managed Development experiments, jobs, cancellation and Result Handle paging;
- Development Research SQL and durable Analysis retrieval;
- experiment summaries/points/candidates and returned/non-return diagnosis;
- Validation exposure, Finalist Sets and server-owned Validation execution;
- Sealed Holdout evaluation and result retrieval;
- selected-query or insufficient-evidence final recommendation artifacts;
- concise durable research notes and bounded prior-work retrieval.

Every tool publishes a closed top-level JSON Schema with `additionalProperties: false`, explicit model-owned field names and required fields. Nested semantic payloads such as Objectives, Evidence Inventories, evaluation profiles and committed server proposals remain validated by their existing Domain authorities instead of duplicating business validation in the MCP adapter.

The registry owns only model-facing names, descriptions, transport-shaped argument extraction, progressive-disclosure grouping and the data envelope. All semantic validation, authorization, idempotency, budgets, experiment execution, partition rules, Validation/Holdout enforcement, persistence and recommendation truth remain in the managed Research Domain. Schema introspection reuses the existing TREE `11.3` manifest rather than creating an MCP-owned field model.

The registry intentionally does **not** expose lower-level shortcuts that would bypass managed/server-owned paths:

```text
createEvidencePlan
executeDevelopmentExperiment
openDevelopmentResearchSql
```

Development experiments therefore enter through `submitDevelopmentExperiment`, Development SQL through `submitDevelopmentResearchSql`, and Holdout/partition creation only through their existing authority operations.

Unknown tools fail closed with `RESEARCH_MCP_TOOL_NOT_FOUND`; a mapped tool whose server capability is absent fails with `RESEARCH_MCP_CAPABILITY_UNAVAILABLE` rather than inventing a fallback.

## MCP v2 server binding

`research-server/mcp-server.js` converts each registry JSON Schema through the SDK's `fromJsonSchema` helper and registers the same 46 operations on `McpServer`.

Each successful tool call returns both:

- MCP text content containing the JSON result for broad client compatibility;
- `structuredContent` containing the same bounded machine value.

The binding does not create new domain operations, state, IDs, phase rules or persistence.

Tool failures are intentionally sanitized. The MCP response exposes a bounded stable error code and the data-boundary metadata, but not arbitrary exception messages, filesystem paths or stack traces.

`research-server/mcp-stdio.js` is lifecycle/transport composition only. It opens one managed Research Domain, lets SDK-created MCP server instances share that durable authority for the stdio connection, and closes transport/domain on explicit shutdown or stdio EOF. Runtime close is idempotent across repeated/concurrent shutdown paths. Transport/startup/shutdown diagnostics pass only bounded uppercase stable error codes to stderr; unsafe error strings fall back to fixed MCP codes, and shutdown rejection is handled rather than becoming an unhandled rejection.

## Data/instruction boundary

Every AI-adapter and MCP-tool response carries:

```text
DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS
```

Dynamic domain strings stay nested as returned data. The Skill separately instructs the model that market values, source strings, notes, SQL result text and other retrieved strings do not become instructions because of their contents.

This boundary is defense-in-depth. Research Domain public-safe persistence, SQL admission, source authority and Holdout/Validation enforcement remain the actual server controls.

## Progressive disclosure

Fresh-chat startup should load only:

1. environment metadata;
2. deterministic run selection;
3. the bounded resume capsule for the selected run.

Schema details, evidence coverage, experiment diagnostics, result pages, exact query artifacts and older ledger history are fetched on demand. The Skill intentionally contains no fixed hypothesis sequence, formula, threshold schedule, score, or optimizer recipe.

## Verification contract

Focused TREE `11.6` coverage proves:

- bootstrap/resume behavior and the data/instruction boundary;
- strict tool schemas and absence of unmanaged shortcuts;
- reuse of the existing TREE `11.3` machine-readable relation/field manifest rather than an MCP-owned schema;
- MCP SDK `initialize` → `tools/list` registration shape for all 46 tools;
- MCP `tools/call` structured output and sanitized stable-code errors;
- project-owned runtime path resolution and rejection of relative path overrides;
- idempotent stdio launcher lifecycle ownership, including failed-close cleanup;
- a real first `stdio` MCP process creating durable Research state, server-proposed evidence partitions, a managed Development Research SQL job and a durable Result Handle;
- clean process shutdown followed by a second fresh MCP process over the same ledger/data;
- exact `researchRunId` resume from the durable Resume Capsule with no hidden chat/process state;
- on-demand field-level schema semantics, fingerprinted Evidence Inventory, durable Analysis and paged Result Handle retrieval after restart.

Earlier executable review found and repaired two blocking TREE `11.6` defects instead of deferring them:

1. repeated runtime close could close the transport twice; RCA moved the complete transport+Domain shutdown behind one memoized close promise;
2. stdio transport/startup/shutdown diagnostics had a weaker error projection than MCP tool failures; RCA unified them behind a bounded stable-code sanitizer and handled shutdown rejection explicitly.

The final contract review also found that generic `{ type: "object" }` request schemas did not satisfy the API contract's strict-schema requirement. The registry now exposes closed top-level request contracts and a separate on-demand `describe_research_schema` tool backed by the already-authoritative TREE `11.3` manifest.

The MCP v2 dependency graph is pinned in `package-lock.json` (`@modelcontextprotocol/server@2.3.1`, matching `@modelcontextprotocol/core@2.3.1`, plus its pinned resolved `zod` dependency).

Final current-head Fast/Planning/Workload/Replay/Browser CI must be green before PR #106 may leave draft state or merge. Exact final run IDs belong in `.planning/EXECUTION.md` when this review head is proven.

## Current checkpoint

Implemented through final composed code/security review:

- portable plugin identity and compact Research Skill;
- machine-readable environment bootstrap;
- deterministic zero/one/multiple resume behavior;
- explicit data-vs-instruction response boundary;
- transport-neutral 46-tool MCP registry;
- strict top-level tool contracts;
- on-demand reuse of the existing Research SQL field manifest;
- fail-closed absence of unmanaged Development/evidence-plan shortcuts;
- pinned MCP v2 server dependency and reproducible lock entries;
- MCP v2 `McpServer` binding over the same registry;
- local `stdio` launcher with project-owned runtime paths, managed resource policy and sanitized lifecycle diagnostics;
- portable Plugin `mcp.json` using the installed `market-flow-us-research-mcp` executable;
- real-process durable resume and progressive on-demand schema/evidence/result proof;
- lifecycle/error-projection RCA/fix/regression coverage.

Still pending in TREE `11.6`:

- final current-head CI reclosure after the review fixes;
- record final evidence in `.planning/EXECUTION.md` / `STATUS.yaml`;
- mark PR #106 ready, squash-merge it, verify merged-main CI and open-PR state, then advance only to TREE `11.7`.

Actual Desktop ChatGPT + approved HTTPS/Secure MCP Tunnel end-to-end acceptance remains TREE `11.8`, after the adversarial TREE `11.7` audit, as defined by the Branch-11 execution plan.
