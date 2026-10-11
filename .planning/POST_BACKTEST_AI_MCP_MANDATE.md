# Post-Backtest Autonomous AI Researcher / Local MCP — Deferred Planning Mandate

Status: `DEFERRED_UNTIL_BACKTEST_COMPLETE`

This document records a user-requested **follow-on project** that starts only after the current Historical Backtest Lab project is fully complete. It is intentionally not an executable node in the current Branch 10 plan and does not change Chat 31 / task 10.3 ownership or dependencies.

## 0. Activation gate

Do **not** begin detailed implementation or implementation-authorized planning for this project until all of Branch 10 is complete, including:

- `10.1` through `10.6` done;
- required focused / Fast / Browser / Planning / Workload verification green;
- Backtest Lab PRs merged;
- `main` green;
- open-PR state clean;
- current Backtest contracts and user-facing manual workflow reclosed.

When that gate is satisfied, start a fresh ST Planner planning cycle specifically for this project. The future planner must then produce/freeze a full S&T tree, contracts, security model, success evidence, execution allocation and reclosure plan before implementation.

The follow-on project must be treated as a **new machine-first capability**, not as unfinished Backtest UI work.

---

# 1. Desired outcome

Build a complete **local autonomous AI strategy researcher** for Market Flow US.

The user should be able to connect ChatGPT (or another approved MCP-capable AI client) to a local Market Flow US research server, give it the research objective, and allow it to autonomously:

1. understand the exact data/schema/semantics available;
2. understand the current Scanner SQL contract and historical Backtest rules;
3. inspect evidence coverage before making claims;
4. form explicit research hypotheses;
5. create or modify candidate Scanner SQL queries;
6. validate each query safely;
7. execute historical experiments across controlled times/days;
8. inspect exact returned candidates and outcomes;
9. debug surprising returns and non-returns;
10. compare candidates and previous experiments;
11. learn from failed experiments rather than repeating them blindly;
12. guard against hindsight and overfitting;
13. explore additional hypotheses/parameters/features autonomously;
14. stop according to explicit bounded criteria;
15. return the **best evidence-backed Scanner SQL found under the defined objective and evidence set**;
16. provide a reproducible evidence package explaining why that query is preferred.

The AI should be able to perform the research loop without the user manually driving Inspect / Compare / Sweep between iterations.

The final system must not claim a universally "perfect" query. "Best" must always be tied to:

- the explicit objective;
- the available historical evidence;
- the validation protocol;
- the search budget;
- the tested hypothesis/query space;
- known limitations and unavailable evidence.

---

# 2. Critical design principle: AI-first, not UI automation

The existing Backtest Lab is designed first for a human investigator. This follow-on project must **rethink the workflow for an autonomous AI agent**.

Do not implement this as:

```text
AI -> click human UI buttons -> scrape screen -> guess next click
```

Instead design a machine-oriented path:

```text
ChatGPT / AI client
        ↓
local MCP contract
        ↓
local AI research server / orchestration boundary
        ↓
proven Backtest engine + controlled evidence reads
        ↓
structured experiment / provenance / debug results
        ↓
AI hypothesis -> next experiment
```

Human Inspect / Compare / Sweep may remain useful for manual verification and drill-down, but the AI should not need to simulate the human UI when direct trusted machine contracts are safer and clearer.

Reuse proven Backtest authority and outcome semantics wherever possible. Do not duplicate anti-lookahead, baseline resolution, Scanner admission or outcome calculation in an "AI version".

---

# 3. Full end-to-end scope that the later planning cycle must cover

The future ST Planner cycle must plan the **entire usable system**, including at least:

## 3.1 Local AI research server

A dedicated local process or clearly isolated composition that owns AI-research orchestration responsibilities.

Planning must decide and justify:

- process boundary;
- startup/shutdown ownership;
- port/transport ownership if network transport is used;
- crash/restart behavior;
- concurrency model;
- cancellation;
- experiment lifecycle;
- safe persistence location for research artifacts;
- separation from normal market service / Replay / order service;
- public-safe diagnostics;
- version compatibility with the Backtest engine.

The local AI research server must not become a second market authority or mutate source market evidence.

## 3.2 MCP server / MCP interface

Provide the AI client with a small, typed, purpose-built MCP tool surface.

The MCP layer must expose enough capability for genuine autonomous research, not merely a thin wrapper around one `run_sql` function.

The later design must decide the exact MCP transport supported by the intended ChatGPT client at implementation time and verify it against current OpenAI product documentation before freezing the integration contract.

## 3.3 Controlled DuckDB / Backtest access

The AI must have autonomous access to all evidence it legitimately needs, but **through trusted Backtest/research APIs**, not through unrestricted filesystem/database mutation.

The server must expose controlled read-only capabilities over product-owned active/archive DuckDB evidence while preserving:

- source-file allowlisting/catalog authority;
- `READ_ONLY` opening;
- schema-v3/v4 compatibility where contracted;
- no arbitrary path input;
- no migrations/repair/stale-session mutation;
- no writes to market authority;
- no access to browser/provider authentication state;
- no order-service authority;
- anti-lookahead semantics.

The AI should not need direct filesystem knowledge or raw DuckDB credentials to be autonomous.

## 3.4 Experiment engine

The system needs a first-class experiment abstraction, not just disconnected SQL calls.

An experiment should bind at minimum:

- experiment ID;
- parent/ancestor experiment IDs;
- query SQL;
- query fingerprint/hash;
- hypothesis / reason for the experiment;
- evidence source/day set;
- T0 schedule / Sweep definition;
- exact Backtest engine/product version;
- objective definition/version;
- parameter values;
- execution state;
- result metrics;
- returned-candidate evidence references;
- error/failure information;
- validation partition identity;
- keep/reject/investigate decision;
- concise rationale;
- timestamps/durations needed for operation/debugging.

## 3.5 Autonomous search controller

The project must include the mechanism that lets the AI keep working until a stopping criterion is reached.

This may live partly in ChatGPT's agent behavior and partly in server-side experiment primitives, but the split must be explicitly designed.

The design must ensure the AI can:

- inspect prior experiments;
- propose the next hypothesis;
- avoid exact/semantic duplicate experiments where practical;
- run the next candidate;
- inspect failures;
- alter approach;
- compare improvements;
- branch research directions;
- revisit promising candidates;
- run validation/holdout checks;
- decide when evidence is insufficient;
- finish with the best verified candidate found.

## 3.6 Durable research ledger

Store research state outside immutable market-source DuckDB files.

The ledger must be local, restart-safe, public-safe and reproducible.

Do not persist model chain-of-thought. Persist only explicit research artifacts such as hypotheses, concise rationales, experiment decisions, metrics, references and final conclusions.

## 3.7 Final recommendation artifact

Produce a final machine- and human-readable report containing the recommended SQL and its evidence, not merely a chat sentence.

---

# 4. Mandatory AI environment-introspection contract

The AI must never be expected to infer the product schema or data semantics from table names alone.

The MCP server must provide authoritative machine-readable introspection.

## 4.1 Schema manifest

The AI must be able to retrieve, for every Backtest-visible relation and field:

- table/view/relation name;
- column name;
- physical/logical type;
- nullable status;
- identity role;
- ordering/tie-break role where relevant;
- plain-language meaning;
- source authority;
- units;
- valid/missing/null/zero semantics;
- whether the field is raw provider evidence, product authority, derived evidence or diagnostic metadata;
- whether it is suitable for filtering, ranking, aggregation, display only, or carries known caveats;
- examples of representative values where safe/useful;
- schema version availability.

This manifest must be generated from or mechanically checked against actual schema/contracts so documentation drift cannot silently mislead the AI.

## 4.2 Field semantics and caveats

The AI must know where Market Flow US intentionally preserves source-shaped values without asserting stronger financial semantics.

For each material field, expose enough semantic information to prevent mistakes such as:

- confusing percent with fraction;
- assuming a null is zero;
- treating a display field as authority;
- assuming provider naming means a stronger financial concept than documented;
- assuming a field exists in all schema versions;
- ranking on a field whose availability is sparse without noticing it.

## 4.3 Evidence coverage / data profiling

Before research, the AI must be able to inspect the usable evidence universe.

Provide machine-readable coverage such as:

- available day/source IDs;
- schema version;
- first/last complete committed time;
- cycle count;
- approximate/actual cadence statistics;
- universe size range;
- securities/rows available;
- field null/missing coverage where useful;
- gaps/outages;
- evidence horizon coverage near end-of-day;
- whether a requested T0/horizon set is feasible;
- archive/active distinction.

The AI must not optimize against times that cannot produce valid outcome evidence without being told that limitation.

---

# 5. Mandatory temporal / anti-lookahead knowledge contract

The AI must receive exact structured rules for historical authority.

At minimum it must know:

- `T0` = simulated decision/request time;
- baseline `B` = last complete committed cycle at/before `T0`, with the exact tie-break contract;
- Scanner SQL sees only detached `latest = B` and `history <= B`;
- failed/uncommitted cycles do not become baseline authority;
- future source catalog is not reachable from Scanner SQL;
- outcomes are evaluated separately after the decision;
- outcome evidence requires same security, `cycle_id > B`, and `collected_at_ms >= T0 + horizon`;
- earliest qualifying timestamp wins, then lowest cycle ID;
- first qualifying null price is not skipped;
- wall-clock regressions are diagnostics and do not override writer/cycle authority;
- unavailable reason precedence;
- baseline integrity failures are not ordinary unavailable outcomes.

These rules should be available as structured metadata/tool output, not only prose in a README.

---

# 6. SQL authoring/validation contract for AI

The AI must understand exactly what Scanner SQL may do.

Provide:

- allowed statement class;
- existing Scanner SQL admission policy;
- allowed/forbidden functions;
- parameter rules;
- accessible relations;
- identity-column requirements;
- output ordering semantics;
- mapping from query order to `returnedPosition`;
- max query size and any execution/resource bounds;
- built-in strategy queries and why they exist;
- examples of valid query patterns;
- stable validation/error codes;
- remediation hints for invalid queries.

Reuse the proven Scanner admission policy rather than creating a weaker AI-specific SQL gate.

Do not give the AI an unrestricted DuckDB shell as a shortcut.

---

# 7. Mandatory result contract

Every experiment response must be explicit enough that the AI can reason numerically without guessing.

At minimum return/reference:

- experiment ID;
- source/day IDs;
- exact T0 set or Sweep schedule;
- resolved baseline IDs/times;
- exact SQL or immutable retrievable query identity;
- returned row count at each point;
- ordered candidates;
- `securityId`;
- `returnedPosition`;
- baseline price/time and relevant display identity;
- selected horizon targets;
- selected future observation IDs/timestamps;
- future prices;
- `changePercent`;
- `UP` / `DOWN` / `FLAT` / `UNAVAILABLE`;
- unavailable reason;
- timing anomalies;
- metrics and exact denominators;
- exclusions;
- overlap/exclusive/position changes for comparisons;
- warnings for sparse/degenerate evidence.

No metric should be exposed without enough metadata to know what it counted, excluded and normalized by.

The AI should be able to request compact summaries for iteration and exact drill-down only when needed, avoiding massive payloads by default.

---

# 8. "Why did this row return?" explainability/debug contract

For any returned candidate, the AI must be able to drill down deterministically.

It should be able to ask:

- what exact baseline row was visible at T0;
- what relevant field values were visible;
- what history rows/anchors contributed to the query calculation;
- how the query ranked/ordered the candidate;
- why the candidate received this returned position;
- what later observation was selected for each horizon;
- why that observation won the outcome tie-break;
- which nearby observations were rejected and for what deterministic reason;
- whether a null/missing value affected the outcome;
- what raw/source-compatible evidence supports the interpretation.

The future planner must choose a bounded mechanism, for example deterministic evidence references plus specialized provenance/debug queries.

Do not solve explainability by exposing unrestricted arbitrary filesystem/database access.

---

# 9. "Why did this security NOT return?" debugging contract

This is mandatory for autonomous improvement.

The AI must have a bounded way to investigate a security that it expected to see but did not.

The system should support diagnosis such as:

- not present in the baseline universe;
- baseline row exists but one or more fields are null/missing;
- a WHERE predicate failed;
- a historical anchor required by the SQL did not exist;
- a staged condition failed;
- rank/order placed the security below a limit/boundary;
- a tie-break changed ordering;
- query returned zero rows legitimately;
- SQL execution/admission failed;
- requested evidence point was unavailable.

The future planner must decide how to instrument/query this without requiring a general SQL debugger for every possible query shape. Candidate techniques to evaluate include query decomposition, controlled diagnostic rewrites in a separate non-authority explanation engine, predicate instrumentation, provenance references or AI-driven bounded counterfactual queries.

Any diagnostic rewriting must be explicitly separated from the authoritative Scanner execution result so it cannot silently change research truth.

---

# 10. Raw numbers / records / evidence inspection

The AI must be able to inspect the actual numbers behind summaries.

Provide bounded tools to retrieve:

- exact returned rows for a specific experiment/T0;
- relevant baseline history rows;
- bounded historical windows for one/few securities;
- selected outcome observations;
- neighboring rows around a tie-break;
- exact aggregate components;
- comparison membership sets;
- field coverage/null patterns;
- experiment metrics broken down by day/time/horizon.

Responses should preserve precise numeric values and stable identity fields.

Avoid lossy prose-only summaries for machine reasoning.

---

# 11. Objective definition: what does "best query" mean?

Before autonomous optimization is allowed, the future project must define the user's goal operationally.

The AI must not silently invent a scalar score merely because optimization is easier with one number.

The planning cycle must explicitly consider dimensions including:

- frequency of positive moves;
- magnitude of positive moves;
- speed to positive move;
- consistency across 10s/20s/30s/45s/60s/90s/120s and optional longer horizons;
- avoidance of negative outcomes;
- result selectivity / number of candidates;
- returned-position quality;
- consistency across decision times;
- consistency across days;
- unavailable/missing evidence rate;
- robustness to nearby parameter changes;
- sensitivity to one or two outlier securities;
- sample size;
- optional future liquidity/fillability dimensions only if separately contracted and evidenced.

If objectives conflict, the system should preserve multi-metric/Pareto evidence unless the user explicitly approves a weighted objective.

The final recommendation must state the exact objective used.

---

# 12. Autonomous research/search methodology

The project must give the AI a disciplined way to discover improvements rather than random SQL mutation.

The future planning phase must evaluate and justify a combination of methods such as:

- hypothesis-driven edits;
- one-variable-at-a-time changes when diagnosing causality;
- structured parameter sweeps;
- feature/condition ablation;
- staged query construction;
- beam-style retention of several promising candidates;
- exploitation vs exploration balance;
- mutation templates for thresholds/windows/orderings;
- semantic deduplication of equivalent SQL/experiments;
- AI-proposed novel conditions using known schema fields;
- controlled combinations of independently useful conditions;
- regression checks when a new query improves one metric but harms another.

Every generated candidate should carry an explicit short hypothesis, e.g.:

```text
"Require higher recent trade activity because false positives in experiments 41-46 were concentrated in sparse observations."
```

Store the hypothesis, not hidden model chain-of-thought.

---

# 13. Anti-overfitting / scientific validation

This is a hard requirement.

The AI must not repeatedly tune against one dataset and then call the resulting query proven.

The future planner must design a validation protocol appropriate to the amount of historical evidence available. Candidate mechanisms to evaluate include:

- development vs holdout days;
- development vs holdout time windows;
- walk-forward validation;
- rolling folds;
- repeated representative T0 samples;
- minimum sample sizes;
- minimum survivor counts;
- stability across days;
- stability across market regimes observable in available evidence;
- parameter sensitivity tests;
- ablation of individual conditions;
- final untouched confirmation evidence where practical;
- explicit warnings when evidence is too small for a strong conclusion.

The experiment ledger must identify which evidence belonged to exploration and which remained validation/holdout.

The AI must not see holdout outcome detail during optimization if the selected validation design requires it to remain untouched.

---

# 14. Autonomous stopping criteria

The research loop must be bounded.

The later planner must define configurable stopping rules such as:

- max experiment count;
- max wall-clock duration;
- max expensive sweep count;
- no material improvement for N valid experiments;
- convergence of top candidate set;
- objective threshold reached;
- insufficient independent evidence;
- repeated degenerate/invalid candidates;
- validation degradation;
- user-specified constraints.

When the budget ends, the AI returns the best verified candidate found so far and clearly states that the search was bounded rather than exhaustive.

---

# 15. Candidate MCP tool families

Exact names/contracts are deferred to the future planning cycle, but the MCP API should be deliberately decomposed into typed capabilities rather than a single unrestricted tool.

Candidate families to evaluate:

## Environment / schema

- `describe_research_environment`
- `describe_schema`
- `describe_field`
- `get_backtest_contract`
- `list_evidence_sources`
- `inspect_source_coverage`
- `profile_field_coverage`

## SQL

- `validate_scanner_sql`
- `get_scanner_examples`
- `get_scanner_builtins`

## Experiments

- `create_experiment`
- `run_inspect`
- `run_compare`
- `run_sweep`
- `cancel_experiment`
- `get_experiment_status`

## Evidence / debug

- `get_experiment_results`
- `get_returned_rows`
- `inspect_security_history`
- `inspect_outcome_evidence`
- `explain_returned_candidate`
- `explain_missing_candidate`
- `get_metric_breakdown`

## Research memory

- `list_experiments`
- `search_experiments`
- `get_experiment`
- `compare_experiments`
- `record_hypothesis`
- `record_experiment_decision`

## Finalization

- `run_validation_suite`
- `build_recommendation_artifact`

These names are illustrative only.

Every tool must have:

- strict JSON schema;
- stable versioned contract;
- bounded inputs;
- bounded/paginated outputs;
- deterministic IDs/references;
- stable public-safe error codes;
- cancellation/timeout behavior where needed;
- no arbitrary filesystem path;
- no market DB mutation;
- no provider/browser auth authority;
- no broker/order capability.

---

# 16. ChatGPT / AI-client operating contract

The future project must define **what ChatGPT is told and how it is expected to operate**, not merely expose tools and hope the model discovers the workflow.

The ST Planner cycle must design a reusable bootstrap instruction/prompt package for the AI client.

It should include at minimum:

## Mission

```text
Find the strongest evidence-backed Scanner SQL for the user's declared objective using only the provided local research tools and evidence.
```

## Required behavior

The AI should be instructed to:

1. inspect environment/schema/contracts first;
2. inspect evidence coverage before proposing experiments;
3. establish or confirm the objective and constraints;
4. create an explicit baseline experiment;
5. formulate a short testable hypothesis before each meaningful mutation;
6. validate SQL before expensive execution;
7. use cheap/focused experiments before wide sweeps when appropriate;
8. use experiment history to avoid pointless repetition;
9. debug anomalies instead of discarding unexplained results;
10. separate exploration evidence from validation evidence;
11. run required robustness/holdout checks before declaring a winner;
12. respect experiment/time budgets;
13. never weaken anti-lookahead or source immutability;
14. never use broker/provider/browser credentials or attempt order execution;
15. return the best verified candidate with limitations when stopping.

## Autonomy rule

The intended mode is autonomous research. The AI should not ask the user to choose every threshold or next experiment when the objective/contracts allow a reasonable decision.

It should ask only when:

- the research objective itself is materially ambiguous;
- a user preference is required to resolve a genuine multi-objective tradeoff;
- explicit authorization is required;
- available evidence is insufficient and there is no principled default.

## Evidence discipline

The AI should distinguish:

- observed fact;
- derived metric;
- experiment result;
- hypothesis;
- interpretation;
- final recommendation.

It should never present its own interpretation as raw market evidence.

## No hidden-reasoning dependency

The workflow must not require storing or replaying private chain-of-thought.

Persist only concise explicit artifacts such as:

- hypothesis;
- experiment reason;
- keep/reject decision;
- observed metric changes;
- concise rationale;
- next-action pointer.

## Resume behavior

The prompt/tool design must allow a new ChatGPT conversation or restarted AI client to reconstruct the research state from the local experiment ledger and continue without prior chat history.

That means GitHub/product contracts + MCP environment + local experiment ledger must be sufficient external truth.

---

# 17. Research state machine

The future planner should evaluate a clear autonomous state machine, for example:

```text
BOOTSTRAP
  -> UNDERSTAND_SCHEMA
  -> INSPECT_EVIDENCE
  -> DEFINE_OBJECTIVE
  -> BASELINE
  -> EXPLORE
      -> HYPOTHESIS
      -> VALIDATE_SQL
      -> RUN_FOCUSED
      -> INSPECT / DEBUG
      -> KEEP / REJECT / BRANCH
      -> RUN_WIDER_WHEN_JUSTIFIED
  -> VALIDATE_FINALISTS
  -> ROBUSTNESS
  -> FINAL_RECOMMENDATION
```

Failures should route to bounded recovery/debug states rather than silently skipping evidence.

The exact state machine is not frozen here; it must be designed in the future planning cycle.

---

# 18. Experiment ledger / research memory schema considerations

The local ledger should be capable of answering questions such as:

- What have we already tried?
- Which query versions are descendants of which ideas?
- Which parameter changes helped?
- Which hypotheses repeatedly failed?
- Which experiments are comparable because they used the same evidence partition?
- Which result is currently best by each objective dimension?
- Which finalists passed holdout?
- Can this exact experiment be reproduced?

Planning should evaluate normalized records for:

- research run/session;
- objective/version;
- experiment;
- query artifact;
- evidence partition;
- sweep point;
- metric set;
- candidate/result reference;
- hypothesis;
- decision;
- final recommendation.

Do not copy source market rows wholesale into the ledger unless bounded evidence snapshots are explicitly required for reproducibility and safe to retain. Prefer stable references plus immutable source identity/checksums where possible.

---

# 19. Debuggability / observability requirements

The AI must be able to distinguish at least:

- SQL admission failure;
- SQL execution failure;
- zero rows as a legitimate result;
- baseline unavailable;
- baseline integrity defect;
- source missing/incompatible/in-use;
- outcome unavailable because of evidence;
- horizon not covered by source end time;
- experiment request invalid;
- cancellation/timeout;
- MCP transport failure;
- local research-server defect;
- product defect discovered by research.

Errors should expose:

- experiment/request ID;
- stage;
- stable code;
- safe short message;
- bounded structured remediation hints;
- relevant non-sensitive IDs.

Do not expose credentials, machine-private paths, browser data or raw arbitrary exceptions to the AI client.

---

# 20. Performance / resource / abuse bounds

Because an autonomous AI can generate far more workload than a human, the future design must explicitly cover resource governance.

Plan and test:

- max SQL bytes;
- Scanner result bounds where required;
- query timeout;
- cancellation propagation;
- max concurrent experiments;
- max concurrent DuckDB readers;
- Sweep bounds;
- max evidence drill-down rows;
- pagination;
- memory limits if evidence shows they are needed;
- experiment-budget enforcement;
- detection/prevention of accidental Cartesian explosions where practical without changing legitimate Scanner semantics;
- backpressure;
- server recovery after cancelled/failed expensive queries;
- workload measurement using representative full-universe/day shapes.

Optimization must follow measured evidence rather than speculative subsystem invention.

---

# 21. Security / authority boundaries

Autonomy means freedom to conduct research within the research domain, **not unrestricted local-machine authority**.

The MCP researcher must never receive:

- broker order authority;
- IBKR caller tokens/credentials;
- provider/browser authentication/session state;
- unrestricted shell access merely for convenience;
- arbitrary filesystem paths;
- write access to source market DuckDB files;
- Replay Host process authority unless separately justified for research (default: no);
- automatic production Scanner activation;
- automatic trading capability.

If the local MCP/research server exposes a socket/HTTP/SSE/WebSocket/etc. transport, localhost alone is not authorization. Ownership/authentication and cross-origin/caller boundaries must be designed explicitly.

If stdio/owned-process MCP is available and suitable for the target ChatGPT environment, compare it against network transport during planning rather than assuming one prematurely.

---

# 22. ChatGPT connection / operator experience

The final project must include a usable local operator path, not only library code.

Planning must cover:

- one clear startup command/launcher;
- configuration defaults;
- how the user connects/registers the local MCP with the intended ChatGPT client;
- how server readiness is shown;
- how the AI gets the bootstrap instructions;
- how a research run is started;
- how the user sees progress without micromanaging every experiment;
- how research can be cancelled;
- how a run resumes after ChatGPT/server restart;
- where the final SQL/report is found;
- how to manually open the winning experiment in Backtest UI for independent verification.

The final acceptance must test the real intended ChatGPT/MCP integration on the target machine when the relevant client supports it.

---

# 23. Progress reporting for long autonomous runs

The system should support concise progress summaries such as:

```text
Experiments run: 84
Current best: query q_071
Why it leads: stronger 30-90s positive rate on development and holdout, similar result count
Current hypothesis: remove condition X because it contributes little outside one day
Next: parameter sensitivity around threshold Y
Budget remaining: 36 experiments
```

Progress reports must be derived from the experiment ledger, not hidden model reasoning.

The AI should not flood the user with every SQL execution unless requested.

---

# 24. Final recommendation artifact contract

At the end of a research run produce, at minimum:

## Recommended Scanner SQL

The exact copy/paste-ready SQL.

## Objective

The exact research objective and constraints used.

## Evidence universe

- source/day IDs;
- time ranges/T0 policy;
- number of experiments;
- development vs holdout/validation split.

## Performance evidence

For each material metric:

- value;
- denominator;
- horizons;
- sample count;
- unavailable count;
- breakdown by day/time where relevant.

## Comparison

Compare the winner against:

- initial baseline query;
- strongest materially different alternative(s);
- any existing production/built-in query used as reference.

## Robustness

Include:

- holdout result;
- parameter sensitivity;
- day/time stability;
- dependence on outliers;
- known sparse-field limitations.

## Research history

Summarize:

- important successful hypotheses;
- important rejected hypotheses;
- material anomalies/debug discoveries;
- search budget/stopping reason.

## Reproducibility

Provide a stable research-run ID and exact artifact references sufficient to reproduce the recommendation.

## Limitations

Clearly identify what the local evidence cannot prove.

---

# 25. Success evidence the future project should ultimately require

The future ST Planner must refine these, but completion should require proof that:

1. ChatGPT can connect to the local MCP on the intended target machine through the approved local boundary.
2. A new AI conversation can reconstruct schema, contracts and prior experiment state without old chat history.
3. The AI can autonomously run a bounded multi-experiment research loop.
4. It can create and validate Scanner SQL candidates without gaining arbitrary SQL/filesystem/write authority.
5. It can inspect exact numeric results rather than relying on prose summaries.
6. It can explain a returned candidate from baseline through outcome evidence.
7. It can investigate at least representative non-return reasons.
8. It can detect and debug an intentionally planted surprising/null/tie-break case.
9. It can compare experiments across identical evidence partitions reproducibly.
10. It can resume after server/client restart using the ledger.
11. It respects holdout/validation boundaries and cannot accidentally consume future/forbidden evidence through Scanner SQL.
12. It respects experiment/time/resource budgets.
13. It returns a final SQL + evidence artifact with objective, metrics, denominators, validation and limitations.
14. Source market DB bytes remain unchanged throughout AI research.
15. No provider/browser credentials, account identifiers or broker authority enter MCP artifacts/logs.
16. Manual Backtest can independently reproduce representative winning-result evidence.
17. Deterministic Fast/contract/security/integration/workload gates are green.
18. Final target-machine ChatGPT/MCP acceptance is green before calling the follow-on project complete.

---

# 26. Planning questions that must be answered before implementation

The future ST Planner cycle must explicitly answer and justify at least:

1. What precisely is the research objective / definition of "best"?
2. Which objective dimensions remain separate vs combined into a score?
3. Which evidence is exploration vs validation vs final holdout?
4. How many days/times are required for minimally credible validation?
5. Which current Backtest engine seams can be reused directly?
6. Which new machine-first server APIs are actually necessary?
7. What should live in MCP tools vs server-side orchestration vs ChatGPT prompt logic?
8. How does ChatGPT obtain schema/semantic metadata without drift?
9. How does the AI obtain exact numeric result data without huge payloads?
10. How is returned-row provenance/debugging implemented generically enough for arbitrary Scanner SQL?
11. How is non-return debugging implemented without corrupting authoritative execution semantics?
12. How are semantically duplicate SQL candidates detected or bounded?
13. What research ledger schema is smallest but sufficient for restart/reproducibility?
14. What resource bounds prevent an autonomous AI from overwhelming DuckDB?
15. What cancellation semantics are required?
16. How does an AI run survive ChatGPT conversation restart?
17. Which ChatGPT MCP transport/setup is supported at implementation time?
18. What bootstrap/system instructions produce reliable autonomous operation?
19. When should the AI ask the user vs decide independently?
20. What exact stopping rule prevents endless search?
21. How is the final recommendation independently reproduced in the human Backtest Lab?
22. What target-machine acceptance proves that the whole ChatGPT -> MCP -> server -> Backtest -> recommendation loop really works?

---

# 27. Non-goals unless later explicitly approved

Default exclusions for this follow-on project:

- automatic live trading;
- automatic IBKR order creation/submission;
- browser/provider credential access;
- unrestricted shell/file access;
- mutation of market evidence;
- cloud upload of raw local evidence;
- claiming statistical certainty unsupported by the available data;
- replacing Scanner SQL with an opaque proprietary strategy engine;
- silently applying AI-generated SQL to live production Scanner;
- optimizing fees/fills/slippage/liquidity without a separate evidence contract.

---

# 28. Handoff rule after Branch 10

Once Branch 10 is fully completed and merged, the repo truth should point to a **new planning chat/project** whose first action is to read this mandate and perform fresh deep ST Planner design.

Do not blindly convert the illustrative tool names or architecture in this file into implementation. They are requirements and design questions. The later planning cycle must deeply justify the final architecture based on the completed Backtest implementation and the current ChatGPT/MCP capabilities available at that time.
