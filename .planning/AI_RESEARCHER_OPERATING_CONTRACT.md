# ‏Autonomous AI Researcher — AI Operating Contract / Bootstrap & Autonomy

‏Status: selected operating-contract direction for discovery; not implementation-authorized

‏Scope: `B-US-008`

‏This document defines how the AI client is taught to use the Research Server well. It complements the machine API and data-surface contracts without turning the server into a hard-coded optimizer or the AI into a scripted state machine.

---

## ‏1. Outcome

‏A fresh desktop ChatGPT conversation must be able to connect to Market Flow US, understand the research environment, start or resume a short-horizon momentum Research Run, use the available tools correctly, preserve scientific validity and eventually return a reproducible Scanner SQL recommendation without relying on prior chat history.

‏The design must optimize for the AI researcher rather than a human UI.

‏The AI should receive:

```text
small durable operating instructions
+ machine-readable environment/authority metadata
+ focused MCP tools
+ on-demand schema/evidence/results
+ durable Research Ledger state
```

‏It should **not** receive one enormous static prompt containing the whole database contract, every field, every experiment and every prior result.

---

## ‏2. Current ChatGPT plugin/MCP product finding

‏OpenAI product documentation checked on 2026-10-12 supports the architectural split selected here:

- ‏a Plugin may package Skills and MCP capabilities together;
- ‏Skills provide reusable workflow/instruction context around MCP tools;
- ‏the MCP server provides live data, controlled actions and structured tool contracts;
- ‏Plugins can include local MCP apps that run on the user's computer and can be used from ChatGPT Desktop on supported surfaces;
- ‏plugin/MCP surfaces are evolving, so final implementation/acceptance must verify the exact supported Desktop path available on the user's current client/plan rather than assume one transport forever.

‏Current references:

- `https://developers.openai.com/plugins/concepts/skills`
- `https://developers.openai.com/plugins/concepts/mcp-server`
- `https://developers.openai.com/plugins/build/plugins`
- `https://help.openai.com/en/articles/20001256-plugins-in-chatgpt`

‏Selected packaging direction:

```text
Market Flow US AI Researcher plugin
├─ research skill(s)          operating contract / workflow guidance
└─ local MCP app              Research Server tools/resources
```

‏The plugin package is an AI-client adapter. Research truth remains in the local Research Server / Research Ledger.

---

## ‏3. Skill versus MCP responsibility

### ‏3.1 Skill owns reusable operating guidance

‏The research Skill should teach the AI:

- ‏what the research mission/domain is;
- ‏which authority boundaries matter;
- ‏how to resume durable work;
- ‏how to distinguish research analytics from candidate Scanner truth;
- ‏how Development / Validation / Sealed Holdout differ;
- ‏what must be recorded for reproducibility;
- ‏what the final deliverable must contain;
- ‏how to use tools economically and avoid context/payload waste.

‏The Skill must **not** contain:

- ‏a fixed momentum formula;
- ‏a fixed threshold search sequence;
- ‏a required feature order;
- ‏a rigid mutation algorithm;
- ‏a hidden universal Score;
- ‏a giant hard-coded schema copy;
- ‏previous run results;
- ‏private chain-of-thought instructions.

### ‏3.2 MCP/Research Server owns facts and enforcement

‏The MCP surface supplies live/durable facts and controlled capabilities:

- ‏environment/version/authority metadata;
- ‏Research Run lifecycle and resume;
- ‏schema/field semantics;
- ‏evidence inventory/coverage;
- ‏query artifacts;
- ‏experiments/jobs/results;
- ‏research SQL;
- ‏diagnosis;
- ‏validation/holdout enforcement;
- ‏ledger state;
- ‏final artifact creation.

‏The Skill must never be the only place a correctness/security rule exists. Anything that must be enforced remains server-side.

---

## ‏4. Core AI mission

‏The reusable mission is intentionally broad inside the project domain:

> ‏Find the strongest evidence-backed Market Flow US Scanner SQL you can justify for the user's current short-horizon upward-momentum / stock-selection objective, using the local Research Server, while preserving decision-time truth, validation integrity and reproducibility.

‏The exact objective is supplied at Research Run time.

‏Examples may emphasize:

- ‏30-second continuation probability;
- ‏60/120-second continuation;
- ‏a positive-return threshold;
- ‏Top-1 versus Top-N selectivity;
- ‏false-positive reduction;
- ‏downside control;
- ‏robustness/stability;
- ‏another short-horizon momentum-selection criterion supported by the evidence.

‏The Skill must not assume any one example is the permanent objective.

---

## ‏5. Mandatory invariants, not a rigid workflow

‏The AI is free to choose its research method, experiment order, hypotheses and analytical queries.

‏However, the following invariants are mandatory.

### ‏5.1 Durable-state invariant

‏Do not treat chat memory as research truth.

‏Use server IDs and the ledger for:

- ‏current objective;
- ‏evidence plan;
- ‏candidate queries;
- ‏experiments;
- ‏research analyses;
- ‏jobs/results;
- ‏validation exposures;
- ‏finalists;
- ‏holdout state;
- ‏final recommendation.

### ‏5.2 Authority invariant

‏Never confuse `research_sql` findings with authoritative Scanner results.

‏Any idea intended for live Scanner use must become an immutable Query Artifact and be executed through the Strategy Sandbox using the proven Backtest anti-lookahead contract.

### ‏5.3 Holdout invariant

‏Do not attempt to inspect, infer through unrestricted tools or request detailed Sealed Holdout outcome evidence before the authorized finalist evaluation.

‏If the server reports the holdout is sealed, treat that as an authority boundary rather than an obstacle to work around.

### ‏5.4 Objective-version invariant

‏When the operational meaning of the user objective materially changes, record a new Objective Version before comparing new experiments as though they evaluated the old objective.

### ‏5.5 Reproducibility invariant

‏Every meaningful experiment/candidate used in a conclusion must be durable and referencable from the ledger.

‏Ephemeral ad-hoc observations may guide exploration, but they cannot become final evidence unless captured through the proper research objects.

### ‏5.6 Public-safe/security invariant

‏Never request or attempt to discover credentials, cookies, account identifiers, provider session state, arbitrary filesystem paths or broker/order capabilities.

### ‏5.7 No automatic execution invariant

‏The final Scanner SQL is a research recommendation. The AI researcher does not automatically activate the Scanner Query, place an order or mutate live collection configuration.

---

## ‏6. Bootstrap strategy: progressive disclosure

‏A fresh AI session should learn only enough to act correctly, then retrieve detail on demand.

### ‏6.1 Static Skill bootstrap

‏The Skill should carry a compact static contract containing:

- ‏mission/domain;
- ‏key authority distinctions;
- ‏durable-state/resume rule;
- ‏holdout rule;
- ‏final-output expectations;
- ‏instruction to consult the server for current environment/schema/resource limits.

‏It should remain small enough that it does not consume a large fraction of model context on every turn.

### ‏6.2 Dynamic environment bootstrap

‏At the beginning of a fresh research conversation or after server/plugin compatibility changes, use `describe_research_environment` rather than relying on Skill text for current values.

‏This supplies:

- ‏capability/API versions;
- ‏current authority rules;
- ‏resource-limit summary;
- ‏supported evidence/schema versions;
- ‏phase/holdout semantics;
- ‏current server/product version.

### ‏6.3 On-demand detail

‏Load detailed information only when needed:

- `describe_schema` / `describe_field` for field semantics;
- ‏coverage tools for cadence/gaps;
- ‏result handles/pages for exact evidence;
- ‏experiment detail only for candidates under investigation;
- ‏ledger search for relevant prior work rather than dumping all experiments.

‏Progressive disclosure is both a context-efficiency and reasoning-quality requirement.

---

## ‏7. Research Run bootstrap / resume behavior

### ‏7.1 Explicit `researchRunId`

‏If the user provides a Research Run ID or the current conversation already has one, resume that exact run through the server before doing new work.

### ‏7.2 User asks to continue without an ID

‏The MCP surface should support bounded discovery of resumable local runs.

‏Recommended behavior:

```text
0 resumable runs   → create a new run only when the user's message supplies a new objective
1 resumable run    → resume it automatically when the user clearly asks to continue
>1 resumable runs  → present the small candidate list and require disambiguation
```

‏Do not guess among multiple active runs.

### ‏7.3 New objective

‏When the user supplies a new short-horizon momentum objective, create a new Research Run unless they explicitly ask to redirect/version the current run and doing so preserves evidence semantics.

---

## ‏8. Resume Capsule

‏`resume_research_run` should return a compact **Resume Capsule** optimized for a fresh model context.

‏It is not a transcript and not hidden reasoning.

‏Minimum contents:

```text
researchRunId
user objective
current objectiveVersionId + concise interpretation
current evidencePlanId + partition state
current phase
budget totals / remaining budget
candidate count / experiment count / analysis count
validation exposure count
strongest currently retained candidate references + compact metrics
baseline/reference candidate
important rejected candidate references where useful
open questions / explicit investigate-next notes
running/queued/recent failed jobs
finalistSet / holdout state if any
final artifact state if any
last material server-recorded decisions
server/product/data-surface versions
```

‏The capsule should be bounded. The AI can drill into individual candidates/experiments when needed.

### ‏8.1 Resume quality requirement

‏A new ChatGPT conversation given only the plugin + `researchRunId` must be able to reach an accurate understanding of current research state without reading the previous chat.

‏This becomes explicit acceptance evidence later.

---

## ‏9. AI autonomy model

‏The operating contract is **constraint-based**, not state-machine-based.

‏Inside the invariants the AI may choose to:

- ‏profile fields before writing a candidate;
- ‏start from an existing Scanner Query;
- ‏form a novel SQL hypothesis immediately;
- ‏run broad exploratory SQL;
- ‏investigate false positives first;
- ‏compare several candidate families;
- ‏perform ablations;
- ‏sweep thresholds/windows;
- ‏branch from more than one promising candidate;
- ‏revisit an earlier rejected direction when new evidence justifies it;
- ‏stop a weak direction early;
- ‏spend more budget on stability/diagnosis instead of creating more SQL variants.

‏The server does not prescribe the order.

### ‏9.1 Autonomous decision default

‏For the intended product, ordinary research decisions should be autonomous.

‏The AI should not ask the user to approve every:

- ‏hypothesis;
- ‏threshold;
- ‏experiment;
- ‏research SQL query;
- ‏validation checkpoint;
- ‏candidate rejection;
- ‏finalist choice.

‏It should make the best reasonable choice under the user's objective and record material decisions concisely.

‏Ask the user only when:

- ‏the objective is materially ambiguous in a way that cannot be reasonably operationalized;
- ‏the user imposed a constraint whose interpretation changes the research question materially;
- ‏an operation requires explicit external authorization outside this research contract;
- ‏multiple resumable runs require user disambiguation.

---

## ‏10. Explicit research artifacts instead of chain-of-thought

‏The system needs enough reasoning artifacts for scientific continuity, but never private chain-of-thought.

‏The AI records concise explicit artifacts such as:

### ‏Hypothesis

```text
Sparse recent observations appear concentrated in false positives; test a minimum activity/history condition.
```

### ‏Experiment decision

```text
KEEP_FOR_VALIDATION: improves 30s Top-1 positive rate on development without degrading opportunity rate materially; test cross-day stability next.
```

### ‏Rejection

```text
REJECT: gain is isolated to one day and disappears under nearby threshold values.
```

### ‏Open question

```text
Investigate whether raw provider field X has stable coverage and decision-time availability before using it in Scanner SQL.
```

‏These are durable, bounded and useful to a future AI session.

---

## ‏11. Context-budget discipline

‏The AI client should avoid using context as a data warehouse.

### ‏11.1 Prefer summaries + stable references

‏Default responses should return:

- ‏compact metrics;
- ‏counts/denominators;
- ‏warnings;
- ‏top relevant references;
- `resultHandle` for detailed rows.

### ‏11.2 Drill down intentionally

‏Fetch raw rows only when they can answer a concrete research question.

‏Do not load thousands of candidate rows into the model simply because they are available.

### ‏11.3 Search ledger before reloading history

‏When revisiting prior research, search experiments/notes by structured filters and retrieve only relevant artifacts.

### ‏11.4 Prefer server aggregation

‏When the desired result is a distribution, breakdown, correlation or grouped metric, ask the Research Server / `research_sql` to calculate it rather than transferring all rows to the model for manual aggregation.

---

## ‏12. Tool-discovery and metadata design

‏Tool descriptions are part of AI correctness.

‏Each AI-facing capability should make clear:

- ‏what question it answers;
- ‏whether it is authoritative strategy evidence, exploratory research, metadata or durable state;
- ‏which Research Phase permits it;
- ‏whether it creates durable work;
- ‏whether it can be expensive/asynchronous;
- ‏which stable IDs it expects/returns;
- ‏what to use instead when access is denied.

‏Avoid vague generic names such as `query`, `execute` or `get_data` where a domain-specific name gives the model better affordance.

‏Exact final MCP tool names may be reduced/combined for ergonomics after prototype testing, but semantic boundaries from the API contract remain.

---

## ‏13. Research phases as authority labels, not AI workflow steps

‏The server may expose a compact current phase such as:

```text
DEVELOPMENT
VALIDATION_ACTIVE
FINALISTS_LOCKED
HOLDOUT_COMPLETE
CLOSED
```

‏This describes what evidence/actions are currently legal.

‏It must not imply the AI is required to follow one fixed sequence of hypotheses inside Development.

‏The Skill teaches the model to respect the current authority label and use the available capabilities accordingly.

---

## ‏14. Development behavior

‏During Development the AI may use the full allowed research capability:

- ‏typed coverage/profiling;
- ‏general research SQL;
- ‏raw provider-field discovery;
- ‏exact experiment results;
- ‏returned/non-returned diagnosis;
- ‏candidate generation;
- ‏ablation/sensitivity/parameter exploration;
- ‏cross-day/time/security breakdowns within Development evidence.

‏The operating contract should encourage disciplined hypotheses and comparisons, but not require a particular search algorithm.

---

## ‏15. Validation behavior

‏Validation is allowed to influence candidate selection but its exposure must remain explicit.

‏The AI should:

- ‏compare candidates on the same frozen schedule/configuration;
- ‏use compact aggregate/breakdown results by default;
- ‏treat every validation exposure as selection pressure;
- ‏record material candidate decisions;
- ‏avoid opening detailed validation evidence merely out of curiosity when aggregate evidence is enough.

‏If detailed validation debugging is explicitly opened, the ledger records that exposure and the AI treats that evidence as less independent.

---

## ‏16. Finalist / Holdout behavior

‏The AI may decide autonomously when search is mature enough to freeze a bounded Finalist Set, subject to run budget and Evidence Plan rules.

‏Before finalist lock it should ensure that retained candidates have enough evidence to justify spending the sealed holdout.

‏After finalist lock:

- ‏do not mutate finalist SQL/configuration before holdout evaluation;
- ‏submit only the dedicated holdout evaluation operation;
- ‏consume the contracted final metrics;
- ‏do not route around holdout sealing through research SQL or diagnostic tools.

‏If holdout evidence causes a proposed SQL change, record that as a new lineage and do not claim the old holdout as independent validation for the revised candidate.

---

## ‏17. Jobs and long-running operations

‏The AI should treat expensive work as durable server jobs rather than waiting on one giant synchronous tool call.

‏Expected behavior:

```text
submit job
→ retain jobId
→ continue with other useful bounded work when appropriate
→ poll/get status at reasonable checkpoints
→ inspect result when complete
→ cancel if hypothesis becomes irrelevant or budget pressure requires it
```

‏Do not spam status polling.

‏If future MCP Events are available and useful, they may improve notification ergonomics, but correctness/resume must remain job/ledger based rather than event dependent.

---

## ‏18. Failure/recovery behavior

### ‏18.1 Invalid SQL

‏Use the structured validation/admission error to repair the Query. Do not repeatedly resubmit the identical invalid request.

### ‏18.2 Research SQL timeout/resource limit

‏Narrow the time range, fields, aggregation or query shape, or use a dedicated typed/batch capability if one exists.

‏Do not respond by attempting to bypass server limits.

### ‏18.3 Source fingerprint changed

‏Stop making claims that depend on the old inventory/partition. Refresh/reconcile evidence through the server before continuing.

### ‏18.4 Interrupted job

‏Use durable job state to decide whether the work completed, must be resumed or must be safely resubmitted. Never assume a lost response means the experiment failed or succeeded.

### ‏18.5 Budget exhausted

‏Return/finalize the strongest validated candidate found so far, or `NO_RECOMMENDATION`, and state that the search was bounded rather than exhaustive.

---

## ‏19. Capability-gap behavior

‏The AI may discover that Market Flow US itself limits research quality.

‏Examples:

- ‏cadence is too sparse;
- ‏a potentially useful field is unavailable/missing;
- ‏a repeated computation is prohibitively expensive;
- ‏a useful decision-time feature cannot be expressed efficiently with the current Scanner surface.

‏The AI should record a concise **capability-gap finding** containing:

- ‏what limitation was observed;
- ‏evidence supporting it;
- ‏why it materially affects the current objective;
- ‏candidate product change, if obvious;
- ‏whether the current recommendation remains usable despite the limitation.

‏The Research Run does not edit product code/configuration itself. Capability gaps become normal future Market Flow US engineering work with contracts/tests/verification.

---

## ‏20. Final recommendation behavior

‏The AI must not return only a SQL code block with an unsupported claim that it is "best".

‏The final user-facing result should be generated from the deterministic recommendation artifact and include at least:

- ‏copy/paste-ready Scanner SQL;
- ‏the exact operationalized objective;
- ‏what selection policy the Query assumes;
- ‏primary metrics + exact denominators;
- ‏coverage/opportunity rate;
- ‏Development / Validation / valid Holdout status;
- ‏comparison against baseline and strongest alternatives;
- ‏cross-day/time stability where supported;
- ‏robustness/ablation/sensitivity evidence where material;
- ‏actual evidence cadence/coverage limitations;
- ‏search breadth / stopping reason;
- ‏confidence/limitations;
- `researchRunId` and reproduction references.

‏If evidence is insufficient, return `NO_RECOMMENDATION` or explicitly "best found on available evidence" rather than presenting weak evidence as independently validated truth.

---

## ‏21. Suggested plugin package shape

‏Exact packaging may change with current OpenAI plugin tooling during implementation, but the intended conceptual package is:

```text
market-flow-us-ai-researcher/
├─ plugin.json / supported compatibility manifest
├─ mcp.json / local MCP-app mapping as required by the current client
└─ skills/
   ├─ research/
   │  └─ SKILL.md
   └─ setup/
      └─ SKILL.md          optional onboarding/setup verification
```

### ‏21.1 Research Skill

‏Contains the small reusable operating contract summarized above.

### ‏21.2 Setup/onboarding Skill

‏May help the user verify:

- ‏Research Server is installed/runnable;
- ‏local MCP connection is configured;
- ‏plugin can see `describe_research_environment`;
- ‏versions are compatible;
- ‏market evidence is discoverable;
- ‏a tiny read-only smoke succeeds.

‏Setup does not run a large research mission automatically.

### ‏21.3 Do not duplicate server contracts in Skill text

‏Schema fields, resource limits, exact supported horizons and API versions should come from the live server rather than being copied into a Skill that can drift.

---

## ‏22. Default prompt / user ergonomics

‏The plugin should make the common path simple.

‏Useful user prompts should be as short as:

```text
Use Market Flow US AI Researcher to find the strongest Scanner SQL for 30-second upward continuation.
```

‏or:

```text
Continue my Market Flow US research run.
```

‏The user should not need to know tool names, database tables, MCP protocol details or Backtest internals.

‏The AI handles the research-domain translation and uses server metadata to fill in implementation details.

---

## ‏23. Acceptance implications

‏Future implementation is not complete merely because MCP tools can be called manually.

‏Target-machine acceptance must prove at least:

1. ‏plugin installs/connects on the intended ChatGPT Desktop surface supported at acceptance time;
2. ‏a new conversation can bootstrap from the Skill + server metadata;
3. ‏a natural-language objective creates a valid Research Run without manual tool choreography;
4. ‏the AI performs multiple materially different autonomous experiments using server capabilities;
5. ‏research SQL and Strategy Sandbox are used for their distinct purposes;
6. ‏the AI records concise hypotheses/decisions without storing chain-of-thought;
7. ‏a server/client restart or new conversation resumes correctly from durable state;
8. ‏Validation/Holdout boundaries remain enforced despite model attempts to request forbidden detail;
9. ‏large results stay handle/pagination based rather than flooding context;
10. ‏the AI can finish with a deterministic recommendation artifact or `NO_RECOMMENDATION`;
11. ‏the source DB remains immutable and no broker/provider auth authority is introduced;
12. ‏the same final Query/result can be reproduced through the authoritative Backtest/Research Server seams.

---

## ‏24. Selected decision summary

‏Use a **Plugin = Skill + local MCP app** operating model where supported by the intended Desktop client.

‏The Skill supplies a small constraint-based research operating contract; the Research Server supplies current facts, tools and durable state.

‏Autonomy is achieved by giving the AI broad research capabilities and freedom of method inside explicit authority/evidence/resource boundaries — not by hard-coding the AI's search algorithm.

‏Research continuity comes from a bounded Resume Capsule and stable server IDs, not chat history.

‏Progressive disclosure is mandatory: bootstrap small, fetch schema/evidence/results only when needed, use summaries/handles before raw rows, and keep the model context focused on the current research decision.

‏The AI may autonomously choose hypotheses, experiments, validations and finalists, while the server technically enforces strategy truth, holdout sealing, resource limits and reproducibility.
