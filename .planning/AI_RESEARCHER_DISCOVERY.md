# Autonomous AI Researcher — Discovery / Requirements

Status: active discovery
Scope: B-US-008
Implementation: not started
Execution allocation: not created

This document captures product/architecture discovery for the post-Backtest autonomous AI researcher before the work is converted into a complete ST Planner implementation plan. It is supporting discovery truth for the active planning branch; once the design is mature, durable decisions and the selected S&T must be promoted into the normal authoritative planning/contracts.

## Product outcome

Build the local infrastructure that lets an AI researcher connected from the user's desktop ChatGPT client autonomously research **short-horizon U.S.-equity momentum candidate selection for a potential buy** using Market Flow US evidence, and return the strongest evidence-backed Scanner SQL it can justify for the precise objective supplied by the user at run time.

The permanent product is not a general-purpose finance/quant research platform and is not a hard-coded optimizer for one exact threshold/horizon. Its domain is deliberately narrower:

```text
Market Flow US universe
→ detect/rank the stocks showing the strongest actionable short-horizon upward momentum/continuation evidence
→ produce Scanner SQL suitable for selecting the best current buy candidate(s)
```

Within that domain, the exact Research Run objective is supplied at run time. Examples may include maximizing continuation probability over 30 seconds, emphasizing 60/120-second continuation, seeking a particular positive move threshold, reducing false positives/drawdown, increasing selectivity, or balancing several momentum-quality dimensions. The infrastructure must let the AI choose an appropriate research method for the supplied momentum/selection objective without requiring a new product implementation for each variation.

The intended operator experience is approximately:

```text
user starts local AI research environment
→ desktop ChatGPT connects through the approved MCP boundary
→ user supplies a momentum/stock-selection research objective in natural language
→ AI inspects environment/data/coverage/contracts
→ AI conducts bounded autonomous research
→ AI persists explicit experiments/evidence so the run can resume
→ AI validates finalists against the selected validation protocol
→ AI returns copy/paste-ready Scanner SQL + reproducible evidence report + limitations
```

The AI is the researcher. The product supplies the research environment, authoritative evidence, safe capabilities, memory and governance.

## Domain boundary

This project's research freedom is broad **inside short-horizon momentum candidate selection**, not across arbitrary financial questions.

The AI should be able to investigate, when supported by available fields/evidence:

- recent price-change shape and acceleration/deceleration;
- consistency of upward movement across multiple recent windows;
- relative momentum versus the rest of the current universe;
- activity/volume and other available provider fields as filters or explanatory variables;
- spread/bid/ask-shaped fields only to the extent their documented semantics support mechanical use;
- persistence versus reversal/false-positive patterns;
- ranking/selectivity/top-N behavior;
- different prediction horizons and positive-move thresholds;
- robustness across times/days/securities and nearby parameter changes;
- why apparently hot stocks did or did not continue upward after selection.

The platform does not need to support unrelated portfolio construction, valuation, long-horizon investing, fundamentals research, brokerage execution or arbitrary external-data research unless a future separately planned scope explicitly adds them.

## Evidence cadence is an observed research property, not a fixed assumption

The AI must research against the evidence that actually exists now and extract the strongest defensible result from it.

Current historical collection may be approximately 10-second cadence, but the research platform must inspect actual per-source/per-day timing rather than assume a constant interval. It must expose cadence distributions, gaps and horizon feasibility so the AI knows what temporal resolution the evidence really supports.

A denser future collection cadence such as approximately 5 seconds or 3 seconds may later provide additional predictive information for very short-horizon momentum. That is **not** a prerequisite for this project and must not block the AI from optimizing against today's evidence.

The intended behavior is:

```text
use current evidence fully
→ quantify what can and cannot be learned at its actual cadence
→ produce the best validated Scanner SQL supported by that evidence
→ if research reveals a material information-resolution limitation, report it explicitly
→ later, after denser evidence exists, rerun/reopen research rather than redesigning the research platform
```

The infrastructure should therefore remain cadence-agnostic within the existing market-data contract: experiments use actual collected timestamps/cycles, not a hard-coded 10s/5s/3s assumption.

## Critical design correction: human Backtest is not the AI interface blueprint

The completed Backtest Lab was intentionally optimized for a human investigator using Inspect / Compare / Sweep. Those surfaces prove valuable semantics and engines, but their interaction model is not a requirement for the AI researcher.

Reuse what is authoritative and already proven:

- source enumeration and immutable read-only evidence opening;
- historical decision time `T0` and baseline resolution `B`;
- anti-lookahead Scanner execution;
- existing Scanner SQL admission/security semantics;
- canonical identity and returned-position semantics;
- shared post-decision outcome semantics and horizon evidence;
- deterministic source/result provenance;
- source immutability and public-safe diagnostics.

Redesign freely for machine research where that improves AI capability. The AI research surface may introduce new purpose-built APIs, batch operations, profiling, analytical access, experiment abstractions, provenance/debug primitives, persistence and resource controls. It need not mirror Inspect / Compare / Sweep or the browser UI.

## Fixed principle: run-time objective within a fixed momentum-research domain

The infrastructure owns the momentum-research domain, capabilities and constraints; the user owns the precise objective for each run.

The system must therefore separate:

### Run-time research objective

Supplied when the user starts or redirects a Research Run. It may define, for example:

- target prediction horizon(s), especially short horizons such as 30/60/120 seconds;
- target positive move/threshold or directional continuation objective;
- selectivity expectations;
- acceptable negative-outcome/drawdown trade-offs;
- preferred result count / top-N behavior;
- validation emphasis;
- search/resource budget;
- other constraints relevant to identifying the best near-term momentum buy candidate.

The AI may operationalize the objective into explicit metrics/validation criteria, but it must record the exact interpretation used and must not silently replace a genuinely multi-objective request with an arbitrary scalar score.

### Stable research capabilities

The platform must be rich enough to support momentum/stock-selection objectives we did not predesign. The capability set is expected to include, subject to architecture validation:

- authoritative machine-readable schema/field semantics;
- evidence-source/day discovery and exact cadence/coverage profiling;
- field completeness/null/missing/value-distribution profiling;
- authoritative Scanner SQL validation and execution at historical decision points;
- efficient batch/historical evaluation over many T0 values;
- exact returned rows, returned positions, baselines and horizon outcomes;
- bounded post-experiment analytical access to raw/derived evidence;
- general read-only analytical SQL or an equivalently expressive research sandbox if selected by design;
- per-security and cross-security time-window inspection;
- aggregate/distribution/correlation-style exploration where semantically legitimate;
- returned-candidate and non-return diagnosis;
- query comparison, ablation and parameter/feature exploration primitives without prescribing the AI's search algorithm;
- development/validation/holdout evidence partitioning;
- experiment/research ledger, deduplication aids and restart/resume;
- reproducible artifact generation;
- cancellation, timeouts, concurrency and workload/resource budgets.

## Authority separation

Two evidence domains must remain explicit and non-interchangeable.

### Decision-time strategy truth

When testing Scanner SQL at `T0`, the strategy sees only the historical authority allowed by the proven Backtest contract (`latest = B`, `history <= B`). Future evidence must not become available to the candidate Scanner decision.

### Post-experiment research/debug evidence

After an experiment has produced a decision/result, the AI may need broader read-only evidence to learn why it worked or failed: later observations, distributions, raw-number inspection, null patterns, competing securities, correlations, outcome breakdowns and similar forensic/research information.

This broader research access is legitimate only when clearly labeled and technically isolated so it cannot silently leak into authoritative decision-time SQL.

## Autonomy target

Do not implement a rigid research state machine that dictates the model's exact reasoning sequence, threshold order or mutation strategy.

The system should provide enough context and trustworthy capabilities for the AI to decide what to inspect, what hypothesis to test, which query to write, which data to profile, when to drill into raw evidence, when to branch/revisit a direction, and when validation is strong enough to stop.

Server-side orchestration may enforce safety, reproducibility, budgets, immutable experiment facts and efficient execution. It must not replace the AI with a hard-coded strategy optimizer unless later evidence proves a narrowly scoped deterministic mechanism is necessary.

## AI-first research model to design

Discovery must determine the smallest durable model that still supports long autonomous work. Candidate concepts include:

- Research Run;
- run-time Objective / Objective Version;
- Experiment;
- Candidate Query / immutable query artifact;
- Evidence Partition;
- Hypothesis / concise experiment rationale;
- Metrics / breakdowns with denominators;
- Validation / Holdout result;
- explicit keep/reject/investigate decision;
- Research Ledger;
- Final Recommendation artifact.

Private model chain-of-thought must never be required or persisted. Only explicit research artifacts necessary for reproducibility/resume are stored.

## Architecture questions that require deep research before contract freeze

### 1. AI client / MCP boundary

Determine the actual supported desktop ChatGPT integration at implementation time and choose the local connection model that best supports long-running, resumable autonomous research. MCP is an intended boundary, but the exact transport/process split must be verified rather than assumed.

### 2. Research-server boundary

Decide whether the AI research server is a new dedicated local process, a composition around the Backtest modules, or another minimal isolation boundary. It must not become a second market authority and must remain separate from broker/order authority.

### 3. Data-access model

Seriously compare:

- typed research tools only;
- typed tools + bounded general read-only analytical SQL;
- typed tools + direct read-only DuckDB research sandbox;
- a separate research view/database layer;
- hybrid approaches.

Selection must optimize AI research quality and flexibility while preserving authority/security, not merely implementation simplicity.

### 4. Machine-first experiment API

Determine which operations should be first-class server contracts instead of forcing the AI to emulate the human Backtest workflow. Evaluate batch evaluation, reusable evidence handles, compact summaries plus drill-down, asynchronous/long-running jobs where justified, and exact cancellation/resource semantics.

### 5. Debug/provenance

Design generic enough support for both:

- why a returned security matched/ranked where it did;
- why an expected security did not return.

Diagnostics must never be confused with authoritative Scanner execution.

### 6. Research methodology / overfitting control

Determine how momentum-domain run-time objectives map to exploration, validation and holdout protocols. The infrastructure must support time/day-based splits, walk-forward or another justified protocol, minimum evidence rules, parameter stability, multiple-hypothesis/search-bias awareness and out-of-sample evidence without hard-coding one universal scoring function.

### 7. Persistence and resume

Design a local public-safe ledger that allows a new ChatGPT conversation or restarted client/server to reconstruct the research state without previous chat history and without copying whole market databases unnecessarily.

### 8. Resource governance

Define query/runtime bounds, experiment budgets, concurrency, cancellation, payload limits, paging/streaming, caching/reuse and restart behavior appropriate to an AI that can generate much more work than a human operator.

### 9. Final recommendation / reproducibility

Define the final artifact contract so the user receives at least copy/paste-ready Scanner SQL, the exact run-time objective used, evidence partitions, metrics with denominators, validation/holdout results, comparison against strong alternatives, robustness evidence, material failures/unknowns and stable reproduction references.

### 10. Cadence adequacy / future evidence improvement

Define how the AI distinguishes a weak strategy idea from an information-resolution limitation. The platform should be able to report when current cadence/gaps materially limit a requested very-short-horizon objective and preserve enough experiment detail that later 5s/3s evidence can test the same hypotheses/query family comparably.

This is an evidence-quality output, not permission for the researcher to modify the live Collector cadence itself.

## Hard boundaries already fixed

- source market DuckDB files remain immutable evidence;
- no broker/order authority is exposed to the researcher;
- no provider/browser credentials, cookies or session/auth material;
- no arbitrary filesystem mutation or arbitrary source paths;
- no automatic Scanner activation or trading;
- no authority for the researcher to change live collection cadence/configuration automatically;
- expensive work is bounded and cancellable;
- diagnostics/research artifacts remain public-safe;
- meaningful experiments are reproducible;
- decision-time evidence and post-decision research evidence are always distinguishable;
- reuse the proven Backtest authority semantics rather than reimplementing baseline, anti-lookahead, Scanner admission or outcome calculations in an AI-specific parallel engine.

## Completion boundary for this discovery phase

Discovery is ready to become a full ST Planner implementation cycle only when:

1. the AI-first momentum/stock-selection product behavior is unambiguous;
2. the architecture/data-access alternatives above have been investigated deeply enough to select and justify a tactic;
3. the run-time objective contract is defined within the momentum candidate-selection domain without hard-coding one query mission;
4. actual evidence cadence/coverage is first-class research metadata and does not become a hidden fixed assumption;
5. the experiment/ledger/resume and validation model is sufficiently specified;
6. MCP/desktop integration assumptions have been checked against current capabilities;
7. security/resource/reproducibility boundaries are contract-ready;
8. final target-machine acceptance can be stated end-to-end from desktop ChatGPT through MCP/research server to reproducible final SQL/report.

Until then, do not allocate implementation tasks and do not write implementation code.