# Market Flow US — ChatGPT Research Plugin

Status: TREE `11.6` implementation in progress.

## Current OpenAI compatibility decision

Reverified against current official OpenAI Plugin, Skill, MCP and ChatGPT documentation on 2026-10-13.

Selected packaging:

- portable Agent Plugins package at `plugins/market-flow-us-researcher/`;
- root `plugin.json` using the Agent Plugins `1.0.0` schema;
- compact workflow guidance under `skills/research/SKILL.md`;
- root `mcp.json` declaring the project Research MCP server;
- MCP remains a thin adapter over the stable Research Domain API rather than a second research implementation.

The portable package shape is intentionally preferred over making the legacy `.codex-plugin/plugin.json` compatibility format authoritative. A compatibility overlay may be added later only if an actual target-client acceptance path needs it.

The selected MCP runtime is pinned to `@modelcontextprotocol/server@2.3.1`, the current stable v2 line implementing the MCP `2026-07-28` revision while retaining the SDK's legacy-handshake serving path. TREE `11.6` keeps the model-facing registry independent of the SDK/transport package so future protocol/library upgrades cannot move Research authority out of the Domain.

## Transport decision

Research Domain semantics remain transport-neutral.

The shipped local transport is `stdio`:

```text
Agent Plugin mcp.json
→ market-flow-us-research-mcp executable
→ @modelcontextprotocol/server stdio transport
→ 45-tool thin registry
→ managed Research Domain
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

The local launcher does not open a network listener. If actual ChatGPT acceptance requires public/tunnel reachability, the approved current ChatGPT MCP tunnel/registration mechanism is an acceptance-layer concern. It must not widen the Research Server to `0.0.0.0` or change run/evidence/experiment/Validation/Holdout semantics. Actual ChatGPT/tunnel acceptance belongs to TREE `11.8`; TREE `11.6` ships and verifies the portable local MCP server boundary.

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

`research-server/mcp-tool-registry.js` is the transport-neutral model-facing tool catalog. It currently exposes 45 thin operations covering:

- environment/bootstrap and durable Research Run lifecycle;
- Objective Versions, Query Artifacts, Evidence Inventories/Plans/Partitions;
- managed Development experiments, jobs, cancellation and Result Handle paging;
- Development Research SQL and durable Analysis retrieval;
- experiment summaries/points/candidates and returned/non-return diagnosis;
- Validation exposure, Finalist Sets and server-owned Validation execution;
- Sealed Holdout evaluation and result retrieval;
- selected-query or insufficient-evidence final recommendation artifacts;
- concise durable research notes and bounded prior-work retrieval.

The registry owns only model-facing names, descriptions, transport-shaped argument extraction and the data envelope. All semantic validation, authorization, idempotency, budgets, experiment execution, partition rules, Validation/Holdout enforcement, persistence and recommendation truth remain in the managed Research Domain.

The registry intentionally does **not** expose lower-level shortcuts that would bypass managed/server-owned paths:

```text
createEvidencePlan
executeDevelopmentExperiment
openDevelopmentResearchSql
```

Development experiments therefore enter through `submitDevelopmentExperiment`, Development SQL through `submitDevelopmentResearchSql`, and Holdout/partition creation only through their existing authority operations.

Unknown tools fail closed with `RESEARCH_MCP_TOOL_NOT_FOUND`; a mapped tool whose server capability is absent fails with `RESEARCH_MCP_CAPABILITY_UNAVAILABLE` rather than inventing a fallback.

## MCP v2 server binding

`research-server/mcp-server.js` converts each static registry JSON Schema through the SDK's `fromJsonSchema` helper and registers the same 45 operations on `McpServer`.

Each successful tool call returns both:

- MCP text content containing the JSON result for broad client compatibility;
- `structuredContent` containing the same bounded machine value.

The binding does not create new domain operations, state, IDs, phase rules or persistence.

Tool failures are intentionally sanitized. The MCP response exposes a bounded stable error code and the data-boundary metadata, but not arbitrary exception messages, filesystem paths or stack traces.

`research-server/mcp-stdio.js` is lifecycle/transport composition only. It opens one managed Research Domain, lets SDK-created MCP server instances share that durable authority for the stdio connection, and closes the transport/domain on explicit shutdown or stdio EOF. Runtime close is idempotent across repeated or concurrent shutdown paths so transport/domain ownership is released exactly once.

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

## Verification state

Executable repository proof is green on PR #106 head `ebb89c5818f4ce332ba2036103aa7f0dcc686fb4`:

- Fast CI #951 — green, including the complete unit/service suite and standalone order acceptance;
- Planning/Contract CI #1145 — green;
- Workload CI #537 — green;
- Replay CI #121 — green;
- Browser CI #583 — green.

Focused TREE `11.6` coverage proves:

- bootstrap/resume behavior and the data/instruction boundary;
- thin registry delegation and absence of unmanaged shortcuts;
- MCP SDK `initialize` → `tools/list` registration shape for all 45 tools;
- MCP `tools/call` structured output and sanitized stable-code errors;
- project-owned runtime path resolution and rejection of relative path overrides;
- idempotent stdio launcher lifecycle ownership;
- a real first `stdio` MCP process creating durable Research state, server-proposed evidence partitions, a managed Development Research SQL job and a durable Result Handle;
- clean process shutdown followed by a second fresh MCP process over the same ledger/data;
- exact `researchRunId` resume from the durable Resume Capsule with no hidden chat/process state;
- on-demand environment/schema metadata, fingerprinted Evidence Inventory, durable Analysis and paged Result Handle retrieval after restart.

The first executable Fast run (#950) found one lifecycle regression: repeated `runtime.close()` called `transport.close()` twice even though Domain close was already guarded. RCA identified the transport handle as outside the idempotency boundary. The launcher now memoizes the complete transport+domain close promise; the unchanged lifecycle regression proof and the real two-process restart proof both pass in Fast #951.

The MCP v2 dependency graph is pinned in `package-lock.json` (`@modelcontextprotocol/server@2.3.1`, matching `@modelcontextprotocol/core@2.3.1`, plus its pinned resolved `zod` dependency).

## Current checkpoint

Implemented and executable through this checkpoint:

- portable plugin identity and compact Research Skill;
- machine-readable environment bootstrap;
- deterministic zero/one/multiple resume behavior;
- explicit data-vs-instruction response boundary;
- transport-neutral 45-tool MCP registry over the stable managed Research Domain;
- fail-closed absence of unmanaged Development/evidence-plan shortcuts;
- pinned MCP v2 server dependency and reproducible lock entries;
- MCP v2 `McpServer` binding over the same registry;
- local `stdio` launcher with project-owned runtime paths and managed resource policy;
- portable Plugin `mcp.json` using the installed `market-flow-us-research-mcp` executable;
- real-process durable resume and progressive on-demand schema/evidence/result proof;
- lifecycle RCA/fix/regression reclosure;
- green Fast/Planning/Workload/Replay/Browser CI on the current PR head.

Still pending in TREE `11.6`:

- final success-evidence/diff/security review of the composed Plugin/Skill/MCP change;
- reconcile any smallest defect found by that review;
- update completion truth, mark PR #106 ready, squash-merge it, verify merged-main CI and open-PR state, then advance only to TREE `11.7`.

Actual Desktop ChatGPT + approved tunnel/registration end-to-end acceptance remains TREE `11.8`, after the adversarial TREE `11.7` audit, as defined by the Branch-11 execution plan.
