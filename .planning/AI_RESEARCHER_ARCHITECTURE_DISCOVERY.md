# ‏Autonomous AI Researcher — Architecture Discovery

‏Status: selected architecture direction for discovery; not implementation-authorized

‏Scope: `B-US-008`

‏This document narrows the architecture for the AI-first short-horizon momentum researcher. It does not allocate execution tasks and does not freeze implementation details that still depend on experiment/validation design.

## ‏1. Architecture outcome

‏The target architecture must let desktop ChatGPT act as the autonomous researcher while Market Flow US supplies trustworthy, bounded machine capabilities.

```text
Desktop ChatGPT
→ Market Flow US local plugin / MCP adapter
→ dedicated local Research Server
   ├─ authoritative strategy-execution API
   ├─ bounded read-only research analytics API
   ├─ evidence/schema/profiling API
   ├─ experiment/job API
   ├─ research ledger / resume
   └─ artifact/finalization API
→ proven Backtest truth seams + immutable Market Flow US evidence
```

‏The AI chooses how to investigate. The server owns authority separation, reproducibility, resource governance and durable explicit research state.

## ‏2. Current product facts that materially constrain the choice

‏The existing code already provides two useful and deliberately different data boundaries.

### ‏2.1 Immutable source evidence opener

‏`backtest-lab/evidence-source.js` opens only allowlisted product-owned evidence with DuckDB `access_mode=READ_ONLY`, applies the existing DuckDB hardening, validates Market Flow US schema and refuses a source still owned by a running session.

‏This is a strong reusable primitive for trusted server-owned research reads.

### ‏2.2 Detached historical Scanner sandbox

‏`backtest-lab/historical-scanner.js` resolves the historical baseline, creates an in-memory DuckDB sandbox, copies only `history <= B` plus `latest = B`, detaches the evidence source and only then constructs the existing Scanner authority.

‏This remains the authoritative candidate-strategy execution boundary. General research/debug access must not replace it.

### ‏2.3 Existing Scanner admission

‏`local-service/scanner/scanner.js` already enforces one statement, `SELECT` only, zero parameters, explicit `query/query_table` rejection, side-effecting-function rejection and serialized execution.

‏The AI researcher should reuse this authority for candidate Scanner SQL rather than invent a weaker AI-specific admission path.

### ‏2.4 Existing stack

‏The product is already a Node 24 ESM application using `@duckdb/node-api`. The research capability should reuse this stack unless measured evidence shows a concrete reason not to.

## ‏3. ChatGPT / MCP integration finding

‏OpenAI product documentation checked during this discovery on 2026-10-12 shows two relevant integration families:

- ‏ChatGPT plugins can include local MCP apps that run on the user's computer and can be used from ChatGPT Desktop.
- ‏Remote/custom MCP servers use MCP tools over a registered server connection; OpenAI also documents Secure MCP Tunnel for private/local servers when a hosted ChatGPT surface must reach them.

‏Relevant current references:

- `https://help.openai.com/en/articles/20001256-plugins-in-chatgpt`
- `https://developers.openai.com/plugins/build/plugins`
- `https://developers.openai.com/plugins/build/mcp-server`
- `https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt`

‏These product surfaces are evolving, so the durable architecture must not depend on one undocumented desktop transport detail.

### ‏Selected integration direction

‏Target the **desktop-local plugin/MCP path** for the user's intended operator experience.

‏Keep the core Research Server independent from ChatGPT transport. The MCP layer is a thin adapter over stable local research-domain APIs.

‏At implementation/final-acceptance time, verify the exact ChatGPT Desktop local-plugin/MCP mechanism then supported on the user's plan/client. If direct local MCP hosting is unavailable in that exact client, the same Research Server must remain usable through the supported Streamable HTTP / Secure MCP Tunnel path without redesigning research semantics.

‏Therefore:

```text
Research semantics != MCP transport
```

‏MCP is the AI-facing adapter, not the research engine.

## ‏4. Data-access architecture alternatives

### ‏Option A — typed research tools only

‏Examples: `run_experiment`, `profile_field`, `inspect_security`, `compare_experiments`.

‏Advantages:

- ‏very strong authority and payload control;
- ‏easy stable schemas and errors;
- ‏good reproducibility;
- ‏easy to make safe by default.

‏Material weakness:

‏It constrains the AI to questions we predicted during implementation. Momentum research will likely need unforeseen aggregates, cross-security comparisons, null-pattern analysis, distributions, conditional slices and exploratory calculations.

‏**Decision: reject as the sole research interface.** Typed tools remain necessary but insufficient.

### ‏Option B — direct read-only DuckDB connection exposed to the AI

‏Advantages:

- ‏maximum analytical freedom;
- ‏native DuckDB expressiveness;
- ‏minimal API design upfront.

‏Material weaknesses:

- ‏bypasses server-level payload, timeout, partition, audit and concurrency governance;
- ‏makes source/catalog visibility harder to constrain consistently;
- ‏blurs decision-time strategy authority with post-experiment analysis;
- ‏makes stable tool-level provenance and reproducibility harder;
- ‏encourages coupling the client to filesystem/database details.

‏**Decision: reject as an AI-facing boundary.** The server may internally use DuckDB directly; the model does not receive a raw connection or arbitrary path.

### ‏Option C — separate curated research database/view layer only

‏Advantages:

- ‏clean semantics and security;
- ‏can expose normalized/derived research views;
 ‏- ‏can hide operational tables.

‏Material weakness:

‏A permanently materialized second copy risks becoming another market authority, drifting from source data and adding unnecessary ETL/precompute before evidence justifies it.

‏**Decision: reject as a mandatory copied warehouse.** A transient/server-owned research sandbox/view layer remains useful.

### ‏Option D — hybrid typed authority + bounded general analytical SQL

‏The AI receives:

1. ‏typed tools for actions whose semantics must be exact;
2. ‏a general `research_sql`-style capability for exploratory read-only analysis inside a server-owned sandbox/view layer.

‏The two SQL domains are deliberately distinct:

```text
Candidate Scanner SQL
→ authoritative historical Scanner sandbox
→ latest = B / history <= B
→ exact Backtest outcome evaluation

Research/debug SQL
→ separate read-only research sandbox
→ explicitly allowed evidence partition
→ may inspect post-decision/future evidence when authorized for research
→ never becomes candidate decision-time truth
```

‏**Decision: selected architecture direction.** It provides the strongest AI research freedom while retaining explicit truth boundaries.

## ‏5. Selected process/component boundary

### ‏5.1 Dedicated Research Server

‏Use a dedicated local Node process rather than extending the normal live market-data service into an AI orchestrator.

‏Responsibilities:

- ‏research-run lifecycle;
- ‏source/coverage/schema introspection;
- ‏strategy experiments and batch evaluation;
- ‏research analytics sandbox creation;
- ‏job scheduling/cancellation/resource bounds;
- ‏research ledger;
- ‏result/artifact retrieval;
- ‏public-safe diagnostics.

‏Non-responsibilities:

- ‏no provider acquisition ownership;
- ‏no browser authentication;
- ‏no broker/order authority;
- ‏no live Scanner activation;
- ‏no mutation of evidence DBs;
- ‏no autonomous modification of product code/configuration.

### ‏5.2 Thin MCP adapter

‏The MCP layer translates model tool calls into Research Server operations and returns bounded structured results.

‏It must not duplicate:

- ‏Backtest logic;
- ‏experiment truth;
- ‏ledger semantics;
- ‏validation rules;
- ‏SQL execution engines.

‏This preserves testability and allows the same Research Server to be exercised directly in deterministic tests without ChatGPT.

### ‏5.3 Human Backtest remains independent

‏The existing Backtest UI remains useful for manual reproduction/drill-down but is not in the AI's critical path.

‏The AI may produce references that the human Backtest can reopen/reproduce where practical.

## ‏6. Two-sandbox rule

‏This is the most important architecture rule selected in this segment.

### ‏6.1 Strategy sandbox

‏Purpose: answer only:

> ‏What would this exact Scanner SQL have selected at `T0` using only information legally available then?

‏Properties:

- ‏reuse proven baseline `B` resolution;
- ‏reuse detached `latest=B`, `history<=B` construction;
- ‏reuse Scanner admission;
- ‏no future/source catalog visibility;
- ‏exact ordered result preserved;
- ‏post-decision outcomes evaluated separately.

### ‏6.2 Research analytics sandbox

‏Purpose: let the AI understand the data/results and form better hypotheses.

‏Properties:

- ‏server-owned read-only DuckDB environment;
- ‏source selection only through allowlisted source IDs/partitions;
- ‏no arbitrary filesystem path;
- ‏general analytical `SELECT` capability under dedicated admission/resource limits;
- ‏can expose broader historical and post-decision evidence when the current research phase permits it;
- ‏can expose cross-security/day aggregates and profiling views;
- ‏outputs are bounded/paginated;
- ‏every call records enough provenance to reproduce the result;
- ‏cannot be confused with a Scanner experiment result.

‏A candidate developed using research evidence becomes meaningful only after it is executed again through the strategy sandbox and appropriate validation/holdout protocol.

## ‏7. Research SQL contract direction

‏The general analytical tool should be expressive but not equivalent to an unrestricted shell.

‏Expected rules to refine during implementation planning:

- ‏one read-only analytical statement per call;
- ‏server-selected/constructed relations only;
- ‏no arbitrary `ATTACH`, file readers, extension loading, secrets/config mutation or filesystem functions;
- ‏hard query timeout;
- ‏row/column/serialized-byte bounds;
- ‏pagination or persisted result handle for larger outputs;
- ‏bounded concurrent readers;
- ‏cancellation propagation;
- ‏stable error codes;
- ‏query + partition + source fingerprints recorded in the ledger when material to an experiment.

‏Do not force research SQL through the Scanner identity/result contract when it is merely analytical. Scanner admission and research-SQL admission are separate contracts with different purposes.

## ‏8. Multi-source/day research boundary

‏The current human Backtest primarily executes against one selected day/source at a time. The AI researcher must support multi-day research without building a copied market warehouse by default.

‏Selected direction:

- ‏Research Server owns a source catalog across current/archive day DBs;
- ‏each source remains immutable and independently fingerprinted;
- ‏an Evidence Partition contains explicit source IDs + allowed time ranges/T0 policy;
- ‏batch experiment orchestration iterates/combines those sources under one immutable partition definition;
- ‏research analytics may create temporary union/views across the allowed partition;
- ‏no source rows are copied wholesale into the research ledger.

‏This supports train/validation/holdout and cross-day robustness while preserving source authority.

## ‏9. Job model for long autonomous research

‏Do not require one MCP tool call to remain open for an entire large experiment or research run.

‏Selected direction: persistent server-side jobs.

‏Conceptual contract:

```text
submit bounded job
→ receive jobId
→ server executes independently of one HTTP/MCP response
→ get status/progress
→ fetch bounded summary/result pages
→ drill into exact evidence by stable references
→ cancel when requested/budget exceeded
```

‏A job is not the AI's hidden thought process. It is deterministic server work such as profiling, batch backtest execution, metric aggregation or validation.

‏If MCP Events later prove useful and supported, they may improve notifications; correctness and resume must not depend on event support.

## ‏10. Durable research ledger direction

‏Use a **separate research-owned local DuckDB** (or an equivalently justified local structured store if implementation evidence changes the choice), never the immutable market evidence DB.

‏DuckDB is the current preferred tactic because it is already a product dependency and supports structured experiment/metric queries without adding another database technology.

‏The ledger stores research artifacts, not a copied market warehouse.

‏Minimum durable concepts expected:

- `research_run`;
- objective versions/interpretations;
- immutable candidate-query artifacts + hashes;
- evidence partition definitions + source fingerprints;
- experiments and parent/relationship metadata;
- jobs/status/durations/errors;
- metric sets + denominators/exclusions;
- concise hypotheses/reasons;
- explicit keep/reject/investigate decisions;
- validation/holdout results;
- artifact/reproduction references;
- final recommendation.

‏Do not store private model chain-of-thought.

## ‏11. MCP capability families

‏Exact tool names remain an implementation-level decision, but the API should cover these stable goal families.

### ‏Environment / evidence

- ‏describe research environment/authority rules;
- ‏list evidence sources/partitions;
- ‏inspect actual cadence, gaps and horizon feasibility;
- ‏describe schema/field semantics;
- ‏profile field availability/distributions.

### ‏Authoritative strategy experiments

- ‏validate candidate Scanner SQL;
- ‏submit point/batch/multi-day experiments;
- ‏run defined validation suites;
- ‏retrieve metrics/results/evidence references.

### ‏Open-ended research analytics

- ‏run bounded analytical SQL over the currently authorized research partition;
- ‏retrieve paginated/handle-based results;
- ‏inspect per-security windows and cross-security aggregates.

### ‏Diagnosis

- ‏inspect returned candidate evidence;
- ‏inspect selected future observations/tie-breaks;
- ‏investigate non-return using bounded diagnostic primitives/research SQL;
- ‏retrieve exact raw numeric evidence when needed.

### ‏Research memory

- ‏list/search experiments;
- ‏retrieve candidate ancestry and comparable experiments;
- ‏record concise hypothesis/decision/rationale;
- ‏resume current research run.

### ‏Operations / finalization

- ‏job status/cancel;
- ‏budget/usage status;
- ‏build final recommendation/reproduction artifact.

## ‏12. Resource-governance boundary

‏Autonomous access is intentionally powerful, so every expensive capability is bounded.

‏The contract must eventually define measured values for:

- ‏max concurrent analytical queries/jobs;
- ‏per-query timeout;
- ‏per-job wall time;
- ‏result row/byte/page limits;
- ‏batch T0/source bounds;
- ‏experiment/run budgets;
- ‏cancellation latency;
- ‏temporary DuckDB memory/disk bounds where needed;
- ‏duplicate-work detection/reuse;
- ‏server restart recovery.

‏Initial bounds should be conservative and configurable; tune them from target-machine workload evidence rather than guessing giant limits.

## ‏13. Holdout/partition enforcement implication

‏The hybrid architecture must make overfitting controls technically enforceable, not merely prompt instructions.

‏Therefore every material experiment/analytics call must execute against an explicit Evidence Partition or Research Phase authority.

‏The later methodology segment must decide exactly how development, validation and sealed/final holdout behave. The architecture must support hiding outcome detail from the AI when a partition is intentionally sealed while still allowing the server to compute permitted final validation metrics.

## ‏14. Capability-evolution seam

‏The Research Server must expose enough profiling/diagnostics to detect when the existing product evidence is the limitation.

‏Examples:

- ‏cadence too sparse for a requested horizon;
- ‏important provider field systematically missing;
 ‏- ‏history query cost dominates autonomous research;
- ‏a useful derived feature is repeatedly recomputed at unacceptable cost.

‏Such evidence may create a normal future Market Flow US product change: denser collection, additive metadata, justified derived feature/index/cache or another capability.

‏The AI Research Run reports the need; it does not self-modify production.

## ‏15. Rejected architectural shortcuts

‏Do not implement the project as any of the following:

```text
AI clicks/scrapes human Backtest UI
MCP wraps only /api/point/run and /api/sweep/run
one unrestricted run_sql against source DuckDB
AI receives arbitrary database/file path
research SQL and Scanner SQL share one authority surface
future evidence is simply exposed to every query
copied cross-day market warehouse is introduced before measurement
research ledger stores whole source databases
one giant synchronous MCP call performs the entire research run
server hard-codes the AI's hypothesis/search algorithm
```

## ‏16. Architecture success evidence for the later plan

‏The eventual implementation plan must be able to prove at least:

1. ‏Desktop ChatGPT can invoke the local research capability through the then-supported MCP/plugin path on the target machine.
2. ‏A fresh AI conversation can reconstruct environment + durable run state from MCP/ledger without prior chat history.
3. ‏Candidate Scanner SQL cannot see future evidence even though the same Research Run can separately analyze future outcomes.
4. ‏The AI can ask an unforeseen analytical question through bounded read-only research SQL without a new API implementation.
5. ‏Research SQL cannot obtain arbitrary filesystem/write/broker/provider authority.
6. ‏Multi-day Evidence Partitions execute reproducibly without mutating/copying source authority into a second market warehouse.
7. ‏Long jobs can be cancelled/resumed/inspected without tying correctness to one chat/tool-call lifetime.
8. ‏The final recommended SQL is reproducible through the authoritative strategy sandbox and independent Backtest evidence.
9. ‏Existing Market Flow US behavior and required verification remain green.

## ‏17. Decision checkpoint reached

‏This discovery segment selects the following architecture direction:

```text
Desktop-local ChatGPT plugin/MCP adapter
→ dedicated Research Server
→ hybrid API:
   typed authoritative tools
   + bounded general read-only research SQL
→ strict two-sandbox separation:
   strategy sandbox
   research analytics sandbox
→ immutable multi-day Evidence Partitions
→ persistent bounded jobs
→ separate research-owned DuckDB ledger
→ proven Backtest semantics reused, human Backtest UX not reused as API design
```

‏This is sufficiently specific to move the next discovery segment to the **experiment/evidence model and anti-overfitting methodology**. It is not yet sufficient to allocate implementation, because partition semantics, experiment identity/results, objective interpretation and holdout behavior still require deep design.