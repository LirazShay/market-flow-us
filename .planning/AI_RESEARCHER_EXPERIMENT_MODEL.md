# ‏Autonomous AI Researcher — Experiment / Evidence / Anti-Overfitting Model

‏Status: selected methodology direction for discovery; not implementation-authorized

‏Scope: `B-US-008`

‏This document defines the research-truth model that sits above the selected hybrid Research Server architecture. It exists so autonomous AI exploration can remain flexible without allowing the same evidence to be repeatedly tuned against and then mislabeled as independent proof.

## ‏1. Outcome

‏The platform must let the AI freely investigate short-horizon U.S.-equity momentum and stock-selection hypotheses while producing a final Scanner SQL recommendation whose evidence history is reproducible and whose validation/holdout claims are technically enforceable.

‏The user supplies the precise momentum objective at Research Run time. The server does not hard-code one permanent objective such as `+1.3% in 60s` or `UP at 30s`.

‏The system must distinguish:

```text
exploration evidence
!= validation evidence
!= sealed final holdout evidence
```

‏and:

```text
interesting historical result
!= independently validated strategy
```

## ‏2. Selected research-truth hierarchy

‏Use the following small set of durable concepts.

```text
Research Run
├─ Objective Versions
├─ Evidence Plan
│  ├─ Development partition
│  ├─ Validation partition
│  └─ Sealed Holdout partition
├─ Candidate Query Artifacts
├─ Experiments
├─ Material Research Analyses
├─ Validation Checkpoints
├─ Finalist Set
├─ Holdout Evaluation
└─ Final Recommendation
```

‏Do not create a server-side algorithm that decides the AI's research sequence. These objects record and constrain evidence, not hidden reasoning.

## ‏3. Research Run

‏A Research Run is the durable container for one user-requested research mission.

‏It binds at minimum:

- ‏stable `researchRunId`;
- ‏user-supplied natural-language objective;
- ‏current structured Objective Version;
- ‏evidence inventory snapshot/fingerprints;
- ‏Evidence Plan;
- ‏research/compute budget;
- ‏candidate/experiment lineage;
- ‏validation exposure history;
- ‏finalist set when selected;
- ‏final recommendation or explicit no-recommendation result;
- ‏product/Backtest/Research Server versions needed for reproduction.

‏A restarted Research Server or a new ChatGPT conversation must be able to resume from these durable facts without prior chat history.

## ‏4. Objective Version

‏The user's natural-language goal remains the source intent. The AI operationalizes it into a structured Objective Version before claiming one Query is better than another.

‏The Objective Version records, where relevant:

- ‏target direction: upward momentum / continuation;
- ‏primary horizon or horizon set;
- ‏target move threshold when the user specified one;
- ‏selection policy being evaluated, e.g. first returned row / Top-N;
- ‏intended live scan interval when relevant;
- ‏primary comparison metric(s);
- ‏hard acceptance constraints;
- ‏secondary/tie-break metrics;
- ‏risk/negative-outcome constraints;
- ‏minimum evidence/coverage expectations if meaningful;
- ‏resource/search budget;
- ‏plain-language explanation of how the user's request was interpreted.

‏The model may refine this interpretation during development research when the original request permits a reasonable autonomous choice. Every material change creates a new Objective Version; prior experiment results remain bound to the version they actually evaluated.

### ‏No hidden universal Score

‏The server does not silently collapse all research into one permanent weighted score.

‏Default comparison is multi-metric. When the user's objective clearly identifies a primary target, the Objective Version may specify a primary metric plus constraints/tie-breaks. When legitimate objectives conflict, retain Pareto/multi-metric evidence unless the user's request itself supplies or requires a trade-off rule.

‏Examples:

```text
"highest chance to continue up at 30s"
→ primary: Top-1 positive rate at 30s
→ constraints/tie-breaks: evidence coverage, opportunity rate, downside, median move, robustness

"maximize probability of +1.3% by 60s"
→ primary: Top-1 >= +1.3% hit rate at 60s
→ constraints/tie-breaks: coverage, sample support, downside, cross-day stability
```

‏These are examples of operationalization, not permanent product constants.

## ‏5. Evidence inventory precedes partitioning

‏Before exploration, the server produces an immutable evidence inventory containing at least:

- ‏eligible source/day IDs and fingerprints;
- ‏schema versions;
- ‏available time ranges;
- ‏successful cycle counts;
- ‏actual cadence distribution and gaps;
- ‏universe-size coverage;
- ‏horizon feasibility near source/time boundaries;
- ‏known incompatible/locked/unavailable sources;
- ‏material field availability/null coverage.

‏Partitioning is based on this inventory, not on which days later happen to produce attractive results.

## ‏6. Evidence Plan

‏The Evidence Plan is created before materially tuning candidate SQL and is immutable for the Research Run except through an explicit new plan/version that invalidates prior independent-validation claims.

‏It defines three evidence roles.

### ‏6.1 Development

‏Purpose: unrestricted hypothesis generation and debugging.

‏The AI may:

- ‏run many candidate Scanner experiments;
- ‏use general research SQL;
- ‏inspect exact rows and outcomes;
- ‏profile distributions/nulls/cadence;
- ‏investigate failures/non-returns;
- ‏perform ablations/parameter sweeps;
- ‏select interesting targeted T0 points.

‏Development results are optimization evidence, never final independent proof.

### ‏6.2 Validation

‏Purpose: repeatedly but deliberately test whether promising development findings generalize.

‏Validation is less exposed than Development:

- ‏the server uses a frozen query-independent validation schedule/partition;
- ‏all comparable candidates see the same validation evidence;
- ‏default responses emphasize aggregate/breakdown metrics rather than unrestricted row-by-row outcome inspection;
- ‏every validation exposure is counted in the ledger;
- ‏the AI may use validation to choose among/refine candidates, so validation is **not** labeled final untouched evidence.

‏Because repeated validation peeking itself creates selection pressure, final reporting includes the number of validation checkpoints/candidates evaluated there.

### ‏6.3 Sealed Holdout

‏Purpose: one independent final confirmation after the candidate search has effectively stopped.

‏Before finalization the AI cannot obtain:

- ‏holdout future/outcome rows;
- ‏per-security holdout results;
- ‏holdout research SQL access;
- ‏holdout target-specific metric breakdowns that reveal optimization feedback.

‏The server may know the partition internally, but the AI-facing research surface treats it as sealed.

‏Finalization freezes a small Finalist Set and their exact Query artifacts/configuration. One server-owned holdout job evaluates those finalists on the same frozen holdout schedule and Objective Version.

‏After holdout evaluation, the run may expose the permitted final metrics and, once the recommendation is frozen/closed, detailed holdout evidence for audit/reproduction.

‏If the AI changes SQL/thresholds/ranking logic because of holdout results, that evidence is contaminated for the revised candidate. The revised work requires a new Research Run/Evidence Plan with fresh independent evidence if available; the old holdout may be reclassified as development/validation evidence but cannot remain the final independent holdout for that lineage.

## ‏7. Partition selection policy

‏Short-horizon market evidence is temporal, so arbitrary row-level random splitting is rejected as the default.

‏Preferred order:

1. ‏whole-day chronological partitions when enough usable days exist;
2. ‏chronological time blocks when whole-day separation is impossible;
3. ‏a reduced-confidence protocol when evidence is too small for strong independent partitioning.

‏The exact ratios/counts are selected from the available evidence during implementation/runtime policy rather than hard-coded here as universal percentages.

### ‏7.1 Whole-day preference

‏Whole-day isolation is preferred because it naturally reduces overlap between neighboring decision/outcome windows and makes cross-day stability visible.

### ‏7.2 Time-block fallback

‏If there are too few usable days, the server may create chronological Development / Validation / Holdout time blocks.

‏Boundary protection must prevent outcome leakage from an earlier partition into the next partition. At minimum, T0 points whose evaluated future horizon crosses the next partition boundary are excluded/purged from the earlier partition.

‏The purge/embargo is horizon-aware and based on the maximum outcome horizon actually used by the Objective/experiment suite, plus any measured timing tolerance required by the outcome-selection contract.

‏Historical rows before a Validation/Holdout T0 may still be visible to the **strategy sandbox** because a real live Scanner at that future T0 would legitimately know prior market history. What remains sealed is the later partition's optimization/outcome evidence before its authorized evaluation.

### ‏7.3 Insufficient evidence is a first-class result

‏Do not fabricate confidence when there are too few independent days/blocks/outcomes.

‏The system may still return the strongest candidate found from current evidence, but the final artifact must clearly distinguish:

```text
best found on available evidence
```

‏from:

```text
strongly independently validated
```

## ‏8. Query-independent evaluation schedules

‏Development may use arbitrary targeted T0 investigation.

‏Validation and Holdout use deterministic schedules frozen independently of candidate results. A Query cannot choose only the times where it looks good.

‏The schedule definition binds at minimum:

- ‏source/time ranges;
- ‏requested T0 generation rule;
- ‏intended interval/cadence policy;
- ‏Top-N/selection policy;
- ‏horizons;
- ‏availability/exclusion rules.

‏Every candidate in a comparable validation/finalist set uses the same schedule and configuration.

## ‏9. Repeated baselines and overlapping outcomes remain visible

‏Fast requested T0 cadence may resolve multiple points to the same baseline cycle. Those points remain distinct because their future horizon targets differ.

‏Metrics therefore report separately:

- ‏requested T0 count;
- ‏available T0 count;
- ‏distinct baseline cycle count;
- ‏zero-result T0 count;
- ‏selected/evaluated security count;
- ‏available outcome count per horizon.

‏Do not inflate apparent evidence strength by describing many repeated-baseline requested points as though they were independent market snapshots.

‏Likewise, short-interval T0 points can have overlapping future windows. Preserve them because they model the intended repeated scanner use, but expose overlap/cadence concentration and run a wider-spaced sensitivity slice when useful for robustness.

## ‏10. Candidate Query artifact

‏Every candidate strategy is stored immutably before authoritative experiment execution.

‏Bind:

- ‏exact Scanner SQL bytes/text;
- ‏cryptographic hash/fingerprint;
- ‏normalized display fingerprint where useful;
- ‏creation/parent lineage;
- ‏Objective Version;
- ‏concise hypothesis/reason supplied by the AI;
- ‏relevant parameter metadata when the AI provides it.

‏Exact SQL hash is authoritative identity.

‏A whitespace/comment-normalized fingerprint may suppress obvious duplicate work, but semantic equivalence of arbitrary SQL is **not** assumed. Do not build a speculative SQL-equivalence engine.

## ‏11. Experiment

‏An Experiment is an immutable authoritative evaluation of one Candidate Query against one explicit evidence scope/configuration.

‏Bind at minimum:

- ‏`experimentId`;
- ‏`researchRunId`;
- ‏candidate-query ID/hash;
- ‏Objective Version;
- ‏evidence partition/version;
- ‏phase: Development or Validation (Holdout uses its dedicated final evaluation record);
- ‏exact T0 schedule/configuration;
- ‏Top-N/selection policy;
- ‏horizon set;
- ‏Backtest/Research Server versions;
- ‏job/result references;
- ‏metrics with denominators/exclusions;
- ‏material warnings/coverage defects;
- ‏concise explicit keep/reject/investigate decision when the AI records one.

‏Experiments never store or require model chain-of-thought.

## ‏12. Material Research Analysis

‏General `research_sql` profiling/debug work is not mislabeled as an authoritative strategy Experiment.

‏Material analyses that influence research decisions may be recorded with:

- ‏analysis ID;
- ‏Research Run;
- ‏allowed Development/Validation research partition;
- ‏exact analytical SQL/tool request fingerprint;
- ‏bounded result reference;
- ‏source fingerprints;
- ‏concise purpose/conclusion when the AI chooses to record one.

‏This preserves reproducibility while keeping exploratory analytics distinct from candidate-strategy truth.

## ‏13. Standard metric surface

‏The server should compute a broad stable metric surface so the AI can compare candidates without needing to rerun raw aggregation for every obvious measure.

‏For each selected horizon where meaningful, expose with exact denominators:

- ‏evaluable count / unavailable count / coverage rate;
- ‏positive / flat / negative counts and rates;
- ‏threshold-hit rates for thresholds explicitly requested by the Objective Version;
- ‏mean change percentage;
- ‏median change percentage;
- ‏bounded quantiles/distribution summaries;
- ‏negative-tail / worst descriptive outcomes where statistically meaningful;
- ‏best descriptive outcomes without treating them as expectation;
- ‏result/selection count and zero-result rate;
- ‏Top-1 versus Top-N / returned-position breakdown where relevant;
- ‏per-day and material time-block breakdowns;
- ‏security concentration / repeated-selection concentration;
- ‏unavailable/missing-reason breakdowns.

‏The exact metric set may evolve, but no metric is valid without denominator, exclusions and horizon identity.

### ‏13.1 Momentum-specific robustness views

‏The research layer should make it inexpensive to inspect:

- ‏neighboring horizons around the primary horizon;
- ‏nearby parameter/threshold variants;
- ‏day/time stability;
- ‏dependence on one or a few securities;
- ‏ablation of material query conditions;
- ‏ranking quality by returned position;
- ‏opportunity/selectivity trade-offs.

‏These are evidence views, not a hard-coded optimization algorithm.

## ‏14. Comparable-candidate rule

‏Two candidate metrics are directly comparable only when their material evaluation configuration is compatible, especially:

- ‏same Objective Version or an explicitly compatible interpretation;
- ‏same evidence partition/version;
- ‏same T0 schedule;
- ‏same horizons;
- ‏same Top-N/selection policy;
- ‏same outcome semantics/engine version where version differences could affect results.

‏The server should reject or visibly label invalid apples-to-oranges comparison rather than silently rank incomparable experiments.

## ‏15. Baseline and alternatives

‏Each Research Run should preserve at least:

- ‏an initial/reference baseline Query when one can be defined;
- ‏the strongest materially different candidate families retained by the AI;
- ‏the eventual finalist set.

‏Final reporting compares the recommendation not only with its parent mutation but also with a meaningful baseline and strong alternatives under identical validation/holdout evidence.

## ‏16. Validation checkpoint policy

‏Validation is intentionally useful but expensive in terms of overfitting risk.

‏The server records:

- ‏how many unique candidates reached Validation;
- ‏how many Validation checkpoints occurred;
- ‏which Objective Version/partition each used;
- ‏whether detailed validation evidence was opened beyond standard summaries.

‏The Research Run budget may cap validation exposures independently from Development experiment count.

‏The AI remains free to decide **when** a candidate is promising enough to validate. The server only ensures the exposure is visible and bounded.

## ‏17. Finalist lock and holdout protocol

‏Before Holdout:

1. ‏the AI records a bounded Finalist Set of exact immutable Query artifacts;
2. ‏the current Objective Version is frozen for final evaluation;
3. ‏the Holdout schedule/configuration is frozen;
4. ‏no finalist SQL may change inside that evaluation.

‏The server evaluates all finalists on the same sealed evidence in one logically comparable holdout batch where practical.

‏The first holdout response should contain only what is needed to choose/report the final result under the frozen Objective Version: exact aggregate metrics, denominators, coverage/warnings and candidate comparisons.

‏After the run is finalized, exact holdout rows/evidence can be exposed for audit/reproduction. Opening them does not retroactively invalidate the already-frozen result; modifying/re-optimizing from them does invalidate independent-holdout claims for any new candidate.

## ‏18. Search-breadth / multiple-hypothesis transparency

‏The platform does not pretend that the winning Query was the only hypothesis tested.

‏Final evidence records at least:

- ‏number of candidate Query artifacts;
- ‏Development experiments;
- ‏Validation candidates/checkpoints;
 ‏- ‏parameter/ablation families where tracked;
- ‏research budget consumed;
- ‏stopping reason.

‏This is necessary context for interpreting a result selected from a large search.

‏The initial project does not need to invent a universal statistical p-value correction for arbitrary adaptive AI research. It must instead preserve the search history, independent holdout boundary and honest limitations so unsupported certainty is not manufactured.

## ‏19. Stopping criteria

‏The AI may choose when to stop within the Research Run's configured budget, but the server enforces hard resource ceilings.

‏Useful stop signals available to the AI include:

- ‏objective threshold reached with adequate validation evidence;
- ‏no material Development/Validation improvement after a chosen number of experiments;
- ‏top candidate family stabilizes;
- ‏nearby-parameter/ablation checks stop changing the conclusion;
- ‏validation degrades despite Development gains;
- ‏independent evidence is insufficient;
- ‏experiment/time/compute budget exhausted.

‏When the budget ends, return the best candidate supported so far and state the evidence limitation; do not fabricate completion.

## ‏20. Final recommendation selection

‏A final recommendation is chosen only from the frozen Finalist Set under the frozen Objective Version.

‏Selection uses the objective's declared comparison rule:

- ‏primary metric/goal;
- ‏hard constraints;
- ‏secondary metrics/tie-breaks;
- ‏multi-metric/Pareto evidence where no scalar ordering is justified.

‏If no finalist satisfies the Objective Version's minimum conditions, the valid outcome is `NO_RECOMMENDATION` / insufficient evidence rather than selecting a weak Query merely because one must win.

## ‏21. Final artifact evidence

‏The final artifact must include at least:

- ‏copy/paste-ready recommended Scanner SQL or explicit no-recommendation result;
- ‏original user objective;
- ‏final Objective Version/interpretation;
- ‏evidence inventory summary and cadence limitations;
- ‏partition plan and fingerprints;
- ‏Development/Validation/Holdout boundaries;
- ‏search breadth and budget consumed;
- ‏baseline + finalist comparison;
- ‏Holdout metrics with exact denominators;
- ‏day/time/security concentration robustness;
- ‏nearby-horizon/parameter/ablation findings where material;
- ‏known missing evidence/limitations;
- ‏stable run/query/experiment/evidence references for reproduction.

## ‏22. Resume semantics

‏Resume never relies on remembering the old chat.

‏A new AI client retrieves:

- ‏user objective and Objective Versions;
- ‏Evidence Plan and which partitions remain sealed;
- ‏candidate Query artifacts and lineage;
- ‏experiment/validation history;
- ‏material recorded analyses;
- ‏current finalists if any;
- ‏budgets consumed/remaining;
- ‏next explicit research pointer/status.

‏The server never reveals sealed Holdout evidence merely because a new ChatGPT conversation starts.

## ‏23. Rejected shortcuts

‏Do not implement research validity as any of the following:

```text
one historical day repeatedly tuned until it looks good
random row split as the universal market-validation method
AI prompt alone asking "don't look at holdout"
holdout rows exposed through general research_sql
validation metric checked unlimited times but still called independent
Query-specific cherry-picked validation/holdout T0 schedules
mixing candidates with different Top-N/horizons and silently ranking metrics
counting repeated-baseline T0s as independent snapshots
winner selected by undocumented weighted Score
always returning a winner even when evidence is insufficient
semantic SQL dedupe engine invented before a real need exists
```

## ‏24. Methodology decision summary

‏Selected direction:

```text
runtime user objective
→ explicit Objective Version
→ evidence inventory
→ immutable Evidence Plan
→ open Development research
→ bounded, logged Validation checkpoints
→ freeze Finalist Set
→ one sealed comparable Holdout evaluation
→ freeze recommendation
→ expose detailed holdout for audit/reproduction
```

‏This model gives the AI wide research freedom while preserving a technically meaningful distinction between discovery, repeated validation and final independent evidence.

## ‏25. Questions deliberately left for later planning

‏The following are intentionally not frozen in this segment:

- ‏exact minimum number of days/points for each confidence level;
- ‏default day/time split ratios;
- ‏numeric Validation peek budget;
- ‏exact finalist-count cap;
- ‏exact resource/query/job limits;
- ‏exact ledger table schema;
- ‏exact standard metric JSON schemas/tool names;
- ‏exact UI/operator presentation.

‏Those values should be selected from actual available evidence shape, target-machine measurements and the later contract/implementation decomposition rather than guessed now.
