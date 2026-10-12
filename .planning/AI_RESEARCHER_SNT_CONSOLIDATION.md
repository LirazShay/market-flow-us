# ‏Autonomous AI Researcher — S&T Consolidation / Promotion Candidate

‏Status: `promotion-ready planning candidate`; **not yet authoritative PLAN/EXECUTION and not implementation-authorized**

‏Scope: `B-US-008`

‏This document consolidates the completed discovery into one reviewed Strategy & Tactics candidate before promotion into `.planning/PLAN.md`, `.planning/DECISIONS.md`, `.planning/EXECUTION.md`, `docs/EXECUTOR_ROUTING.md` and `STATUS.yaml`.

‏It exists to make that promotion mechanical and reviewable rather than forcing a risky rewrite of the existing historical authoritative files during discovery.

‏Inputs:

- `.planning/AI_RESEARCHER_DISCOVERY.md`
- `.planning/AI_RESEARCHER_ARCHITECTURE_DISCOVERY.md`
- `.planning/AI_RESEARCHER_EXPERIMENT_MODEL.md`
- `.planning/AI_RESEARCHER_API_LEDGER_CONTRACT.md`
- `.planning/AI_RESEARCHER_DATA_SURFACE.md`
- `.planning/AI_RESEARCHER_OPERATING_CONTRACT.md`
- `.planning/AI_RESEARCHER_SECURITY_RESOURCE_MODEL.md`
- `docs/BACKTEST_LAB.md`
- `docs/DATA_CONTRACT.md`
- `docs/SCANNER_SQL_GUIDE.md`
- `AGENTS.md`

---

## ‏1. Planning boundary

### ‏Strategy

‏Enable desktop ChatGPT to autonomously research **short-horizon U.S.-equity upward momentum / buy-candidate selection** over Market Flow US historical evidence and return the strongest defensible copy/paste Scanner SQL for the exact objective supplied at research time, together with reproducible evidence and honest limitations.

### ‏Tactic

‏Add one local autonomous research capability consisting of:

```text
ChatGPT Desktop
→ project-owned Plugin / research Skill
→ thin local MCP adapter
→ dedicated Research Server
→ durable Research Ledger
→ typed authoritative experiment capabilities
   + bounded general read-only research SQL
→ immutable active/archive Market Flow US evidence
→ server-enforced Development / Validation / Sealed Holdout
→ final Scanner SQL + reproducible recommendation artifact
```

‏The AI owns hypotheses, investigation order, experiment branching and stopping. The server owns authority, evidence access, immutable artifacts, resource limits, anti-lookahead, holdout sealing and durable state.

### ‏Tactic-validity assumptions

- ‏The proven Backtest source opener, baseline resolver, historical Scanner sandbox, Scanner admission and outcome evaluator can be reused/adapted rather than reimplemented.
- ‏The historical evidence is useful immediately even when cadence is currently around ten seconds; actual timestamps/cycles rather than a hard-coded cadence are authoritative.
- ‏A hybrid interface is required: typed tools alone are too restrictive for autonomous discovery; unrestricted direct DuckDB ownership is too permissive and weakens governance/reproducibility.
- ‏Desktop ChatGPT can consume a project-owned Skill plus approved MCP integration at implementation/acceptance time; exact transport/package mechanics must be reverified against then-current OpenAI support without changing domain semantics.
- ‏A separate research-owned DuckDB is sufficient for ledger/state; original market DBs remain immutable evidence and are never converted into a writable research warehouse.
- ‏Server-enforced evidence separation materially reduces overfitting/hindsight risk compared with prompt discipline alone.

### ‏Material alternatives considered

1. **Typed MCP tools only** — rejected as the permanent architecture because it can only answer investigation patterns predicted during implementation and would constrain autonomous signal discovery.
2. **Direct raw read-only DuckDB connection owned by the AI** — rejected because connection ownership can bypass source/phase/resource/provenance rules and makes sealed-holdout enforcement fragile.
3. **Separate permanent multi-day analytical warehouse** — rejected initially because it duplicates market evidence and creates new synchronization/authority cost before workload proves it necessary.
4. **Mirror the human Backtest Inspect/Compare/Sweep API** — rejected as the machine interface blueprint; its authority semantics are reusable, its human interaction model is not sufficient for long autonomous research.
5. **Hard-coded optimizer / momentum score** — rejected because the user's exact research objective changes per run and the AI must be free to discover useful predictors and tradeoffs.
6. **Prompt-only research discipline** — rejected because phase access, holdout sealing, budgets and immutable experiment facts are correctness constraints and belong in code/data boundaries.

### ‏Invalidation conditions

‏Reopen the smallest affected tactic if proof shows any of the following:

- ‏current detached DuckDB sandbox cannot safely support the required research SQL surface;
- ‏representative multi-day research is impractical after eliminating avoidable repeated work and bounded cache reuse;
- ‏DuckDB is materially unsuitable for the ledger under measured restart/concurrency behavior;
- ‏current ChatGPT/MCP integration cannot support the selected local plugin/adapter boundary;
- ‏existing Backtest authority seams cannot be reused without semantic drift;
- ‏current evidence resolution materially prevents the objective and denser Collector cadence is proven necessary.

‏Do not preemptively add a warehouse, index/precompute subsystem, feature store or alternate transport merely because one might help.

### ‏Necessity

‏The parent outcome fails if any of these independent outcomes is missing:

- ‏durable run/objective/evidence identity and resume;
- ‏authoritative Scanner experiments with exact Backtest semantics;
- ‏open-ended research analytics beyond fixed typed calls;
- ‏bounded durable jobs/results/resources for long autonomous work;
- ‏server-enforced validation/holdout/finalization validity;
- ‏usable ChatGPT Plugin/MCP bootstrap and resume path;
- ‏security/adversarial proof across SQL, evidence, phase and local-machine boundaries;
- ‏representative workload plus real target-machine desktop acceptance and deterministic reclosure.

### ‏Sufficiency

‏Leaves `11.1`–`11.8` below jointly provide those outcomes while preserving existing Scanner, Backtest, market authority, Replay and order boundaries. No broker automation, strategy engine, permanent research warehouse, automatic production mutation or fixed optimizer is necessary.

### ‏Branch success evidence

‏On the user's target machine, a fresh desktop ChatGPT conversation can connect through the shipped Plugin/MCP integration, discover/resume one durable Research Run, inspect real evidence/coverage/cadence, autonomously perform bounded authoritative experiments and general research analytics, preserve Development/Validation/Sealed-Holdout validity, survive server/chat restart, and return a copy/paste Scanner SQL or explicit `NO_RECOMMENDATION` with objective, denominators, robustness, holdout state, limitations and reproduction references. Original market DB fingerprints remain unchanged and no broker/provider/auth/private-browser authority is exposed.

---

## ‏2. Branch 11 implementation-ready leaves

### ‏11.1 — Research Server domain foundation and durable ledger

**Strategy:** ‏Create a durable machine-research authority that can start/resume research independently of chat history.

**Tactic:** ‏Introduce the dedicated Research Server domain layer plus separate hardened research-owned DuckDB ledger implementing stable IDs, Research Run lifecycle, immutable user intent / Objective Versions, evidence inventory/plan/partition records, query artifacts, notes, environment/version snapshots and compact Resume Capsule retrieval.

**Boundary:** ‏No expensive experiment engine or arbitrary research SQL is implemented here beyond the minimum seams needed to prove persistence and authorization structure.

**Success evidence:**

- ‏fresh ledger bootstrap/reopen is deterministic and separate from market DB lifecycle;
- ‏`create/get/resume/list` Research Run behavior survives process restart without chat history;
- ‏stable IDs are scoped to a run and invalid/cross-run IDs fail closed;
- ‏Objective Version and query artifact records are immutable/hash-bound;
- ‏evidence sources use logical IDs/fingerprints, never arbitrary client paths;
- ‏transaction-fault tests prove partial writes cannot fabricate completed state;
- ‏Resume Capsule reconstructs objective/current phase/important artifacts/jobs/decisions from durable facts only;
- ‏no chain-of-thought, credentials, browser session data or account identifiers are persisted.

### ‏11.2 — Authoritative experiment engine and research diagnostics

**Strategy:** ‏Let the AI evaluate arbitrary Scanner SQL candidates over historical decision points with exactly the already-proven anti-lookahead/outcome authority and enough deterministic diagnosis to understand results.

**Tactic:** ‏Compose the proven Backtest source/baseline/Scanner/outcome seams behind machine-first experiment operations: immutable candidate SQL artifacts, frozen T0 schedules, Top-X/horizons, batch execution, metric sets with denominators, experiment summaries/points/candidates, returned/non-return diagnosis and exact evidence references.

**Boundary:** ‏Do not fork baseline resolution, Scanner admission, percentage arithmetic or future-row selection. Do not turn returned position into semantic rank unless SQL proves it.

**Success evidence:**

- ‏representative Scanner SQL produces the same B/T0/returned order/outcome evidence as Backtest authority;
- ‏multi-query/batch experiments freeze exact schedule/config/fingerprints and remain reproducible;
- ‏metrics include explicit denominators, exclusions, zero-result/unavailable coverage and per-day/time breakdowns where relevant;
- ‏duplicate identities preserve source-row-first Top-X semantics;
- ‏typed returned/non-return diagnostics never rewrite the original Query as authority;
- ‏candidate/evidence drill-down is bounded and stable-ID based;
- ‏source DB SHA/fingerprint is unchanged before/after focused experiments.

### ‏11.3 — Phase-aware research SQL data surface

**Strategy:** ‏Give the AI enough expressive numeric/raw evidence to discover signals not predicted during implementation without granting source-catalog or strategy-authority ownership.

**Tactic:** ‏Build the server-owned isolated research projection and `research_sql` execution surface over explicit relations such as `research_sources`, `research_partition`, `research_cycles`, `research_history`, `research_universe`, controlled decision-point/outcome relations and explicitly referenced experiment result relations.

**Boundary:** ‏Research relation names are deliberately different from Scanner `latest/history`; original sources are detached/unreachable while AI SQL executes; future-dependent data is never silently inserted into decision-time predictor rows.

**Success evidence:**

- ‏all documented typed market fields, canonical identity/timing and bounded provider `raw_data` are researchable across one/multiple authorized day sources using `source_id`;
- ‏operational session/config/error/path/auth fields are absent from the normal research surface;
- ‏schema/field metadata marks raw/typed/derived, null/missing caveats, decision-time eligibility and future dependence;
- ‏raw-field key/type/coverage discovery works without dumping unbounded JSON rows;
- ‏Development research SQL can perform joins/windows/aggregates/correlations/cross-security analysis under bounded SELECT-only admission;
- ‏Validation/Holdout phase rules cannot be bypassed through research SQL or result handles;
- ‏a finding can be converted only by creating Scanner SQL and re-running it through 11.2 authority;
- ‏SQL escape/admission tests cover external access, extension/file/network/catalog/config/side-effect/query-table attempts.

### ‏11.4 — Durable jobs, result handles and resource governance

**Strategy:** ‏Long autonomous research remains bounded, cancellable, restart-safe and efficient without requiring one giant MCP call or keeping large results in model context.

**Tactic:** ‏Implement persistent `QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED` jobs, retry-safe `clientRequestId`, result handles/pagination, hierarchical budgets, cancellation propagation, deterministic restart recovery and measured optional partition-cache reuse only when workload proves it useful.

**Success evidence:**

- ‏expensive experiment/analysis work returns durable `jobId` and compact progress/status;
- ‏success is recorded only after durable results/metrics/provenance commit;
- ‏crash/restart distinguishes completed atomic units from interrupted work and never invents success;
- ‏cancel is idempotent, stops future scheduling and attempts to interrupt active DuckDB work; partial output never masquerades as complete;
- ‏payload/page byte and row bounds are enforced independently;
- ‏per-request/job/run/global resource budgets prevent runaway CPU/memory/disk/result/concurrency growth;
- ‏duplicate retry with same intent reuses the created object/job, while changed intent under same idempotency key rejects;
- ‏measured workload determines practical default limits; hard timeouts are failure ceilings, not performance targets.

### ‏11.5 — Validation, sealed holdout and final recommendation authority

**Strategy:** ‏Research can adapt aggressively during discovery yet still produce evidence whose final validation is not silently optimized on the same outcomes.

**Tactic:** ‏Implement server-enforced Development / Validation / Sealed Holdout partitions, temporal split/purge rules, frozen T0 schedules, validation-exposure accounting, immutable Finalist Sets, one controlled holdout evaluation, contamination tracking and deterministic final recommendation artifact generation.

**Success evidence:**

- ‏Development permits broad drill-down while Validation exposure is explicit/countable and Holdout rows/outcomes are physically unavailable to general research before authorized evaluation;
- ‏partition generation is deterministic from evidence fingerprints and uses whole-day temporal units where feasible, otherwise chronological blocks with horizon-aware purge/embargo;
- ‏Validation/Holdout schedules do not depend on candidate Query output;
- ‏finalists lock exact `queryArtifactId` + Objective Version + evaluation profile before holdout;
- ‏changing SQL because of holdout output creates new lineage and invalidates that holdout as independent proof for the revision;
- ‏final artifact supports both selected Query and `NO_RECOMMENDATION` and includes exact SQL, objective, partitions, search breadth, denominators, validation/holdout evidence, robustness, failures, cadence limits and reproduction references;
- ‏holdout detail cannot leak via metadata/errors/debug helpers/caches/cross-run handles.

### ‏11.6 — ChatGPT Plugin / Skill + MCP operating integration

**Strategy:** ‏A fresh desktop ChatGPT conversation can correctly bootstrap, operate and resume the researcher without a giant prompt or hidden chat-only state.

**Tactic:** ‏Ship a project-owned Plugin containing a compact research Skill plus thin local MCP adapter over the Research Domain API. The Skill teaches mission, authority boundaries, progressive disclosure, durable-state discipline, autonomy invariants, holdout rules, capability-gap reporting and final-output requirements; heavy schema/evidence/results remain on-demand server data.

**Success evidence:**

- ‏current OpenAI Plugin/MCP support is reverified at implementation time and the chosen packaging/transport is documented without changing domain semantics;
- ‏fresh session bootstrap begins from compact environment/run summaries and loads detailed schema/results only as needed;
- ‏zero/one/multiple resumable-run behavior is deterministic and does not guess among multiple runs;
- ‏all model-facing tools map thinly to server domain operations and contain no duplicate experiment/holdout/ledger logic;
- ‏new conversation can resume from `researchRunId` and continue using repository/server state alone;
- ‏raw market strings are treated as data, not dynamic tool instructions;
- ‏the Skill does not prescribe a fixed hypothesis sequence, formula or optimizer.

### ‏11.7 — Adversarial security and failure hardening

**Strategy:** ‏No known material SQL/MCP/evidence/phase/restart failure can mutate source authority, reveal sealed evidence, escape local boundaries or corrupt research truth before the system is trusted for autonomous work.

**Tactic:** ‏Run a dedicated adversarial audit across Research Server APIs, logical-ID authorization, SQL admission/sandbox, source attachment lifecycle, DuckDB hardening, ledger transactions, jobs/cancellation/restart, phase/result-handle isolation, cache boundaries, local transport and public-safe diagnostics; every blocker remains owned through RCA → fix → regression → affected verification.

**Success evidence:**

- ‏source files remain byte/fingerprint identical across hostile SQL/tool sequences;
- ‏`ATTACH/COPY`, external readers, file/network paths, extensions, secrets/config mutation, side-effecting functions, `query/query_table`, obfuscation/multi-statement and equivalent catalog escapes fail closed;
- ‏cross-run IDs/handles/cursors and phase-confused requests cannot expose unauthorized evidence;
- ‏sealed Holdout is absent from lower-phase sandboxes and result/cache/error side channels;
- ‏loopback/local process boundary rejects unapproved exposure/origin/body/path use;
- ‏crash/fault injection cannot create false `SUCCEEDED`, false validation exposure state or half-created finalist/holdout authority;
- ‏diagnostics/artifacts remain bounded and public-safe;
- ‏material findings receive regression proof and analogous-area review before closure.

### ‏11.8 — Representative workload, desktop acceptance and deterministic reclosure

**Strategy:** ‏The complete autonomous researcher is practical on the intended machine, coherent in durable contracts and proven end-to-end rather than only as isolated APIs.

**Tactic:** ‏Extend the existing workload framework from bounded CI through synthetic 4,096-security profiles to real target-machine evidence; measure bootstrap, single/multi-day projection, experiment batches, research SQL, result paging, cancellation/restart and holdout; remove measured repeated work; then run real Desktop ChatGPT → Plugin/Skill + MCP → Research Server → historical evidence → recommendation acceptance and reclose the branch by repository PR/CI policy.

**Success evidence:**

- ‏bounded CI proves correctness/security without turning ordinary feedback into heavy performance testing;
- ‏synthetic 4,096-security target profiles cover representative row widths/cadence/days and source immutability;
- ‏target-machine run measures practical wall-clock/RAM/disk/concurrency/result-size behavior on actual evidence and tunes configurable limits from evidence rather than guesses;
- ‏a fresh desktop ChatGPT mission creates/resumes a run, performs autonomous multi-step research, survives conversation/server restart and produces a reproducible final SQL/report through the actual shipped integration;
- ‏a controlled failure/cancellation/restart case is exercised end-to-end;
- ‏generic durable product/technical/data/test/user contracts are updated to the final implemented truth;
- ‏focused and materially affected Fast/Browser/Planning/Workload gates are green;
- ‏final security/diff/public-safe/source-immutability review is clean; PR merges, `main` CI is green and open PR state is reconciled.

---

## ‏3. Execution-shape candidate — group by feature/context, not chat count

‏Chat numbers below are a proposed allocation for authoritative promotion. They are **not execution authority until copied into `.planning/EXECUTION.md`**.

‏The rule is not “more chats is always better” and not “minimize chats”. A chat owns the leaves that naturally share contracts/code/tests/context. All correctness-critical context is stored in GitHub so a later chat must not rely on previous-chat memory.

| Proposed owner | Leaves | Feature/context boundary | Real dependency |
|---|---|---|---|
| `Chat 35` | `11.1` | Research Server domain + ledger + run/objective/evidence identity/resume foundation | Branch 10 complete |
| `Chat 36` | `11.2` | Backtest-authority reuse + experiment engine + typed diagnostics/metrics | `11.1` |
| `Chat 37` | `11.3` | General research SQL projection/sandbox + field/raw-data discovery | `11.1`; may proceed in parallel with 11.2 where interfaces are already fixed |
| `Chat 38` | `11.4` | Jobs/result handles/budgets/cancel/restart around both expensive execution families | `11.2`, `11.3` |
| `Chat 39` | `11.5` | Research-validity lifecycle: partitions/validation/finalists/holdout/final artifact | `11.2`, `11.3`, `11.4` |
| `Chat 40` | `11.6` | OpenAI-facing Plugin/Skill/MCP integration and fresh-session/resume UX | `11.4`, `11.5` |
| `Chat 41` | `11.7` | Cross-cutting adversarial security/failure hardening after composed core exists | `11.1`–`11.6` |
| `Chat 42` | `11.8` | Workload tuning + real desktop target-machine acceptance + docs/reclosure | `11.7` |

### ‏Why this grouping is coherent

- `11.1` owns one persistence/domain context; mixing later SQL or MCP work would make foundation work unnecessarily broad.
- `11.2` is mostly the existing Backtest/Scanner/outcome authority context.
- `11.3` is DuckDB research-projection/security context and can evolve alongside 11.2 after the foundation contract exists.
- `11.4` is deliberately its own reliability/resource subsystem because both 11.2 and 11.3 consume it and restart/cancel semantics cut across them.
- `11.5` is one methodological authority boundary; splitting validation and holdout across separate owners would increase contamination/state handoff risk.
- `11.6` is one external integration context and should consume stable server contracts rather than drive them.
- `11.7` is intentionally a fresh adversarial read of the complete composed feature rather than self-certification inside each implementation chat.
- `11.8` combines performance/target-machine/desktop integration/reclosure because those proofs need the same final composed candidate and are not useful before hardening.

### ‏Fresh-chat recoverability requirement

‏Before any proposed owner is activated, authoritative promotion must ensure that a fresh executor can recover entirely from:

```text
AGENTS.md
→ current ST Planner source commit
→ .planning/PLAN.md
→ .planning/EXECUTION.md
→ docs/EXECUTOR_ROUTING.md row(s)
→ routed durable contract(s)
→ code/tests
```

‏No previous chat summary is required for correctness.

---

## ‏4. Material decisions to promote

‏The following are durable enough for `.planning/DECISIONS.md`. Suggested IDs continue after `D-US-048`; exact wording may be tightened during promotion.

### ‏D-US-049 — Autonomous researcher is a hybrid machine-research capability, not a hard-coded optimizer

‏Use typed authoritative experiment operations plus bounded general read-only research SQL. ChatGPT chooses the investigation path; the server enforces authority/resources/reproducibility. Scanner SQL remains final strategy authority.

### ‏D-US-050 — Strategy truth and post-experiment research are separate sandboxes

‏Authoritative candidate execution uses proven `latest=B` / `history<=B` historical Scanner semantics. Broader research/debug analytics uses explicit `research_*` relations and cannot become a valid strategy result without re-entering the authoritative Scanner path.

### ‏D-US-051 — Research validity is server-enforced Development / Validation / Sealed Holdout

‏Holdout evidence is inaccessible to ordinary research before finalist lock; exposure and contamination are durable facts. Prompt discipline alone is not the validity boundary.

### ‏D-US-052 — Research continuity lives in a separate durable ledger, not chat memory

‏Stable IDs, objective/evidence/query/experiment/job/validation/finalist/final-artifact facts live in a research-owned DuckDB. It stores research facts, not private chain-of-thought or a copied market warehouse.

### ‏D-US-053 — ChatGPT integration is Skill + thin MCP adapter over a transport-neutral Research Domain API

‏The reusable Skill teaches mission/invariants/progressive disclosure/resume/final output; MCP maps tools to server operations and owns no research authority. Reverify exact OpenAI packaging/transport at implementation time.

### ‏D-US-054 — Research infrastructure may evolve Market Flow US only through normal planned product work

‏If evidence proves that cadence, metadata, derived features, indexes/caches or another product capability materially limits research, record a capability gap and plan the smallest justified change with regression/workload proof. An autonomous Research Run cannot silently self-modify production or collection.

### ‏D-US-055 — AI research input is untrusted local analytical input

‏Use defense-in-depth: logical source IDs, phase authorization, detached sandbox, DuckDB hardening, SQL/function/catalog admission, resource budgets, bounded outputs, cancellation/restart integrity and immutable-source proof. Loopback/MCP trust does not substitute for these controls.

---

## ‏5. Promotion checklist

‏The next planning segment may promote this candidate mechanically by updating:

1. `.planning/PLAN.md`
   - add Autonomous AI Researcher as the fifth capability lane/current active scope;
   - update root Tactic/Necessity/Sufficiency/success evidence from ten to eleven capability branches;
   - add Branch 11 with leaves `11.1`–`11.8` above;
   - add Final Planning Review — Branch 11;
   - include D-US-049–055 in carried-forward decisions;
   - update implementation-leaf coverage.
2. `.planning/DECISIONS.md`
   - append D-US-049–055.
3. `.planning/EXECUTION.md`
   - replace the “no active execution” boundary with planned Branch 11 context;
   - add pending rows `11.1`–`11.8` using the feature/context allocation above and only real dependencies;
   - do **not** mark `in_progress` merely because planning is promoted.
4. `docs/EXECUTOR_ROUTING.md`
   - add focused rows for `11.1`–`11.8` pointing to the appropriate AI researcher contracts and existing Backtest/data/Scanner/test seams.
5. `STATUS.yaml`
   - project Branch 11 planning/execution truth only after PLAN/EXECUTION are authoritative;
   - first pointer should be `11.1 / Chat 35 / pending` unless promotion review changes the execution map.
6. Durable generic contracts
   - do not bulk-update `PRODUCT_REQUIREMENTS/PRODUCT_SPEC/DATA_CONTRACT/TECHNICAL_SPEC/TEST_STRATEGY` during planning merely to duplicate future behavior;
   - promote stable implemented contracts at the leaves/reclosure point where future product work truly must obey them.

---

## ‏6. Final Planning Review of the consolidation

### ‏Outcome boundary

‏The scope is correctly limited to autonomous research that produces evidence-backed Scanner SQL for short-horizon U.S.-equity momentum/buy-candidate selection. It does not include brokerage execution, arbitrary finance research or automatic production activation.

### ‏Tactic validity

‏The selected hybrid architecture preserves the already-proven Backtest authority while adding the freedom the AI requires. It avoids both extremes: rigid typed-only research and uncontrolled direct database ownership.

### ‏Removal / necessity test

- ‏Remove 11.1 → no durable run truth/resume/evidence identity.
- ‏Remove 11.2 → no authoritative candidate evaluation or exact Backtest equivalence.
- ‏Remove 11.3 → autonomous investigation is restricted to questions anticipated by implementation.
- ‏Remove 11.4 → long work becomes fragile/unbounded and context/payload dependent.
- ‏Remove 11.5 → final results can overfit/peek without enforceable independent evidence.
- ‏Remove 11.6 → target Desktop ChatGPT cannot reliably discover/use/resume the product.
- ‏Remove 11.7 → hostile SQL/phase/restart/resource boundaries remain materially under-proven.
- ‏Remove 11.8 → no evidence that the composed product is practical or actually works through the intended desktop client.

### ‏Sibling sufficiency

‏If all eight leaves succeed, the AI has durable state, authoritative experiments, expressive analytics, reliable long-job mechanics, anti-overfit validation, a usable desktop integration, adversarial safety proof and target-machine acceptance. No separate optimizer, feature store, research warehouse or broker subsystem is required for the root outcome.

### ‏Decision completeness

‏No executor should need to invent a material product/architecture decision. Remaining implementation choices are local/reversible or intentionally evidence-driven:

- ‏exact HTTP/stdio/IPC form behind the transport-neutral domain API;
- ‏concrete configurable timeout/RAM/disk/concurrency values after workload measurement;
- ‏whether a transient partition cache is justified by measured multi-day projection cost;
- ‏exact current OpenAI Plugin/MCP packaging supported at implementation time.

‏If any of those measurements invalidate the selected tactic rather than merely tune it, apply the normal Planning Impact Test and reopen only the affected area.

### ‏KISS review

‏The plan reuses Backtest source/baseline/Scanner/outcome authority, existing DuckDB hardening and workload framework. It adds one Research Server domain, one research-owned ledger and one external adapter rather than a second market authority or optimizer stack. Optional cache/index/precompute work remains evidence-gated.

### ‏Execution-group review

‏The proposed Chat 35–42 grouping is feature/context-driven. It is deliberately neither minimum-chat nor maximum-chat planning. All cross-chat truth is durable in GitHub, and parallelism is allowed where dependencies are not real (notably 11.2 and 11.3 after 11.1).

---

## ‏7. Current checkpoint

‏Discovery and deep S&T consolidation are complete enough for authoritative promotion.

‏Implementation is still **not authorized by this file**. The next work segment is the mechanical/reviewed promotion into the repository authorities listed in section 5, followed by the normal planning PR/CI/merge cycle. Only after `main` contains the promoted PLAN/EXECUTION truth may an explicitly activated `Chat 35` start `11.1`.
