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

`research-server/mcp-stdio.js` is lifecycle/transport composition only. It opens one managed Research Domain, lets SDK-created MCP server instances share that durable authority for the stdio connection, and closes the transport/domain on explicit shutdown or stdio EOF.

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

Authored focused proofs now cover:

- bootstrap/resume behavior and the data/instruction boundary;
- thin registry delegation and absence of unmanaged shortcuts;
- MCP SDK `initialize` → `tools/list` registration shape for all 45 tools;
- MCP `tools/call` structured output and sanitized stable-code errors;
- project-owned runtime path resolution and rejection of relative path overrides;
- stdio launcher lifecycle ownership and idempotent close behavior.

The MCP v2 dependency graph is pinned in `package-lock.json` (`@modelcontextprotocol/server@2.3.1`, matching `@modelcontextprotocol/core@2.3.1`, plus its pinned resolved `zod` dependency).

These newly authored transport tests have not yet been executed in the current connector-only implementation environment. Their executable proof must come from the normal repository CI/runtime path before TREE `11.6` can be closed.

## Current checkpoint

Implemented through this checkpoint:

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
- authored focused MCP protocol/binding/lifecycle tests.

Still pending in TREE `11.6`:

- execute the new MCP binding tests through the normal runtime/CI path and repair any discovered defect;
- add and execute a true fresh-process `stdio` proof that creates a durable Research Run, restarts the MCP process and resumes the exact `researchRunId` from the same ledger;
- prove required on-demand evidence/schema/result access through the real transport and close any smallest concrete capability gap revealed by that proof;
- complete final Plugin/MCP success-evidence reclosure and repository workflow for `11.6`.

Actual Desktop ChatGPT + approved tunnel/registration end-to-end acceptance remains TREE `11.8`, after the adversarial TREE `11.7` audit, as defined by the Branch-11 execution plan.
