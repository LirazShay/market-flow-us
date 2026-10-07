# Portable S&T Planning Kernel

This is the minimum planning/execution method a fresh GPT needs.

The same method applies to any meaningful current planning scope: a whole project or initiative, a release, feature, migration, refactor, architectural change, or another substantial change inside an existing system. These are not different node types; they use the same S&T logic.

V1 supports **one active S&T planning+execution cycle per repository**. The same installed framework can be reused sequentially for later scopes after the current cycle is completed or abandoned.

---

## 0. Connect to the target project without context dumping

Before building S&T, understand only the current reality that can materially change the current planning scope.

If the repository already has `AGENTS.md`, workstream routing, status files, context-loading rules, specs, or other source-of-truth conventions, use them. S&T Planner does not replace project-native context management.

Progressive disclosure:

1. read the project's normal AI entry point;
2. identify the relevant workstream/component for the requested scope;
3. read its current status/context;
4. read directly relevant code/docs/tests/specs as planning questions require them;
5. load history or unrelated areas only when a concrete uncertainty requires it.

Use this test before loading more context:

> Could this information materially change GOAL, TREE, DECISIONS, or a review?

If not, do not preload it.

Investigate before asking the user. Default to informed planner autonomy: when the goal, constraints, repository evidence, and tradeoffs support a responsible choice, make that planner-owned product/technical choice, record the rationale, and continue. Do not ask merely because several valid implementations exist. Prefer a reasonable reversible default for low-risk uncertainty. Ask only when the missing input is genuinely user-owned or cannot be responsibly derived and different answers would materially change the plan. If a question is unavoidable, ask the smallest useful question, batch tightly related unknowns, and include a recommendation when useful.

### Efficient deep planning

S&T depth is mandatory. Efficiency must come from better ordering, batching, and reuse of already-proven reasoning — never from skipping a material decision, weakening justification, or accepting an existing pattern merely because it exists.

Before deep decomposition, make a short structural map of the current scope:
- outcome/boundary;
- material questions and decisions that must be resolved;
- dependencies between those questions;
- material evidence still needed;
- likely major tree areas.

This map is orientation only. It approves nothing and does not replace the recursive S&T challenge.

Then plan in coherent slices. Within each slice, gather only evidence that can change the reasoning, perform full S&T reasoning for every material choice, persist the rationale in the normal planning artifacts, use deterministic checks for deterministic invariants where practical, and review the coherent slice. Do not force a complete read/edit/status/review cycle after every small edit.

Once a material decision is justified and durably recorded, do not reopen the same reasoning merely for reassurance. Reopen it only when new evidence, a contradiction, a changed assumption, or a concrete review finding could materially change the decision.

Existing project patterns, prior designs, and reusable mechanisms are current-reality evidence or candidate alternatives only. They never replace justification for the current scope.

### Long-running work progress orientation

For long/tool-heavy work, give concise progress updates at meaningful boundaries: what is being checked, what is complete, what remains, and any meaningful discovery/blocker. Do not narrate every tool call. If the user requested one stage per message, updates stay inside that stage.

### Repository engineering rules

S&T Planner does not impose GitHub Flow, feature branches, pull requests, merge methods, or post-merge verification universally. Discover and follow the target repository's own workflow when one exists.

When CI/workflow validation logic becomes non-trivial, prefer a small versioned helper script over a large inline parser/heredoc.

For programmatic repository text edits, require expected source text, preserve inserted text literally, and reread the rendered file or complete diff before treating the edit as correct.

---

## 1. Planning cycles and current scope

`.planning/STATUS.yaml` separates three concerns:

```yaml
cycle_state: active | completed | abandoned
plan_state: active | frozen
implementation_authorized: false | true
```

- `cycle_state` is the lifecycle of the whole current planning+execution scope.
- `plan_state` describes whether the current planning baseline is editable or frozen.
- `implementation_authorized` is a separate execution permission gate.

A new cycle begins as:

```yaml
cycle_state: active
plan_state: active
implementation_authorized: false
```

A `completed` or `abandoned` cycle is terminal and must have `implementation_authorized: false`.

If a new request belongs to the same still-active intended scope, continue/replan that cycle. Do not reset active state merely because another request arrived.

A genuinely independent later scope may start only after the current cycle is `completed` or explicitly `abandoned` and its terminal review/snapshot is durably preserved.

Do not create parallel active scope directories, a plan registry, or `.planning/archive/` by default.

---

## 2. Start from the outcome, not the proposed solution

The current planning boundary belongs in `GOAL.md`:
- desired outcome;
- established current reality;
- hard constraints / already-fixed decisions;
- non-goals.

A user request can mix need and solution. Separate them.

A proposed feature, tool, technology, architecture, or implementation is normally a **candidate tactic**, not the desired outcome. Treat it as fixed only when the user explicitly makes it a constraint/decision or an existing durable project contract already does so.

If planning starts from a proposed solution, climb upward:

> Why is this needed? What outcome is it intended to create?

Do not challenge a genuinely fixed constraint merely to manufacture alternatives.

---

## 3. Every node is Strategy + selected Tactic

Every node contains:

- **Strategy** — what objective/outcome must exist?
- **Tactic** — the selected way to achieve it.
- **Parallel assumptions** — why this tactic can achieve this strategy.
- **Necessary assumptions** — why this child is necessary for its parent.
- **Sufficiency assumptions** — why the children are enough together.
- **Success evidence** — how achievement of the strategy will be recognized.

The same node model applies at business, product, feature, architecture, component, and technical levels. Do not add `kind`, `feature`, `release`, or other category fields merely to label those levels.

Assumption placement:
- `parallel_assumptions` justify **Tactic → Strategy**;
- `necessary_assumptions` live on the child and justify **child → parent** necessity;
- `sufficiency_assumptions` live on the parent and justify **children together → parent** sufficiency.

V1 keeps one logical parent per non-root node. Parent is derived from the parent's `children`; do not add a duplicate `parent` field or edge model.

---

## 4. Challenge every material Tactic before decomposing it

A material tactic is a choice, not merely a sentence in the tree.

Before approving it, challenge:

1. **Need** — why is this Strategy required inside the current planning boundary?
2. **Tactic validity** — why can this Tactic achieve the Strategy?
3. **Alternatives** — is another materially plausible tactic preferable under the actual constraints?
4. **Invalidation** — what fact/assumption, if false or changed, would make this choice wrong?

Do not mechanically brainstorm alternatives for trivial/reversible choices. Challenge depth is proportional to materiality: impact, reversibility, cross-cutting effect, uncertainty, and ability to reshape the plan.

Parallel assumptions must defend real claims. Avoid decorative statements such as "this tactic helps achieve the strategy."

This challenge is recursive. A feature choice can be challenged at product level, an architecture choice inside it at the next level, and component/technical choices below that.

Do not allow strong business reasoning at the top to degrade into an unchallenged technical checklist below.

---

## 5. Alternatives and Decisions

Alternatives are different ways of satisfying the same Strategy. They are not simultaneous necessary children.

Keep only the selected active path in `TREE.yaml`.

Ordinary local reasoning stays in TREE assumptions. Use `DECISIONS.md` only for a material unknown or choice whose resolution can significantly change product behavior, architecture, cross-cutting constraints, implementation scope, costly-to-reverse work, or the tree itself.

For material alternatives:
- preserve only options plausible enough to affect the choice;
- record the selected resolution and rationale;
- record what would reopen the decision when useful.

An `open` decision does not automatically block a node. Use `blocked` only when continuing would require guessing or could create a materially different subtree.

Do not guess material unknowns.

---

## 6. Go down by asking "How?"

After the parent tactic is sufficiently justified, ask:

> How exactly must this tactic be performed?

Each child should be an **independently necessary outcome** required for the parent tactic, with its own Strategy + candidate Tactic.

For each child:
- validate its own Tactic → Strategy relationship;
- explain why the child Strategy is necessary for its parent;
- challenge material alternatives when relevant.

Necessity test:

> If this child disappeared and nothing replaced it, could the parent still succeed?

Sufficiency test:

> Assume all children succeed. What required condition could still be missing?

Siblings should live at a coherent logical level. If one child merely implements another sibling, it belongs below that sibling.

Do not generate default folders such as `Frontend / Backend / Database / Tests` unless each is genuinely an independently necessary outcome.

A one-child decomposition is usually rewording. Merge it or find the missing independent required steps unless the extra level provides genuine control value.

---

## 7. Feature and release trees use the same S&T logic

A feature is an ordinary S&T node/subtree. It does not need a special schema.

A large feature may contain capabilities that teams informally call sub-features; S&T does not need an Epic/Feature/Story/Task taxonomy.

A release may contain multiple feature subtrees only when its parent logic is honest:
- the feature outcomes are jointly necessary for one shared release outcome; or
- each feature is explicitly required by an approved release commitment/scope.

Release membership alone is not S&T causality. If a release is merely packaging unrelated changes, do not invent a false causal relationship; each included change still needs its own justification inside the chosen boundary.

Architecture should emerge from required outcomes. Do not begin with a technology/component checklist and retrofit strategies around it.

---

## 8. Stop at implementation-ready leaves

There is no QUICK/DEEP mode. Small, obvious work naturally creates a shallow tree; ambiguous or architectural work naturally creates a deeper one.

A leaf is ready only when both are true:

1. **Decision-complete** — an executor does not need another material product/design/architecture decision.
2. **Practically executable** — the work is a coherent, manageable unit for an executor chat.

A leaf should make clear enough to derive:
- responsibility;
- scope/boundary;
- relevant constraints;
- selected implementation direction and material rationale;
- required inputs;
- real execution prerequisites in `depends_on`;
- objective success evidence.

Do not decompose into routine coding/clicking trivia.

If a leaf is decision-complete but too large for a practical executor chat, planning stopped too early; decompose it further into coherent necessary outcomes.

### Execution dependencies

`depends_on` means only:

> This implementation-ready leaf cannot correctly begin until those referenced leaf outcomes exist.

It is not the S&T parent/child relationship, priority, preferred sequence, or a general schedule.

Rules:
- reference existing implementation-ready leaf IDs only;
- no self-dependency;
- no dependency cycles;
- omit dependencies when leaves can execute independently.

Do not distort the S&T hierarchy to represent execution order.

---

## 9. Node planning status

Use exactly:
- `draft` — normal unfinished planning;
- `blocked` — cannot advance because a material unresolved D-entry blocks the node;
- `approved` — this node's Strategy/Tactic logic and immediate decomposition passed local review.

Rules:
- every blocked node has at least one open DECISIONS entry referencing it;
- do not duplicate a `blocked_by` field in TREE;
- status is local, not recursive;
- local approval never authorizes implementation.

---

## 10. Review deeply, but at coherent boundaries

Keep local quality control active while authoring:
- **Outcome validity** — Strategy is an outcome, not a disguised feature/tool.
- **Parallel logic** — selected Tactic genuinely supports the Strategy.
- **Alternative challenge** — material alternatives were handled where they could change the choice.
- **Epistemic honesty** — facts are supported, assumptions visible, unknowns not guessed.
- **Necessity** — every child survives removal.
- **Sufficiency** — every sibling group survives the missing-condition challenge.
- **Sibling coherence** — abstraction levels are not mixed.
- **KISS** — no speculative machinery, duplicate nodes, premature tools, or unnecessary detail.
- **Executability** — leaves are decision-complete and practical.

Correct obvious defects while authoring. But do not rerun the entire review matrix after every small edit or node merely because a change occurred.

Prefer:

```text
deep reasoning for a coherent slice
→ persist rationale
→ deterministic checks where available
→ multidimensional slice/subtree review
→ repair concrete findings
→ targeted recheck of affected logic
```

Repeat a broad review loop only when a concrete finding or material change justifies it. This changes review timing, not review depth. Local approval is not permission to execute.

---

## 11. Whole-plan completeness audit

Local Necessity/Sufficiency can still miss a concern that never entered the tree.

Before Final Planning Review perform an outside-in audit from `GOAL.md`:

1. **Goal traceability** — every meaningful desired-outcome clause and hard constraint is protected by TREE, an assumption, a decision, or success evidence.
2. **Root gap test** — assume every leaf succeeds; ask whether the desired outcome can still fail for a reason this plan should have handled.
3. **Boundary challenge** — inspect only materially relevant actors, boundaries, external dependencies, and failure paths.
4. **Negative-space check** — non-goals have not leaked into required work.
5. **Scenario walkthrough** — walk representative end-to-end scenarios; include failure/edge scenarios only when materially relevant.

For feature/release work additionally verify:
- each feature/change is justified by a real outcome or explicit committed scope;
- release membership is not used as fake causality;
- no material product/architecture choice was accepted merely because the user proposed it;
- the path from current system reality to requested outcome has no missing required capability.

If a gap appears, change only the smallest affected area and rerun affected logic reviews.

Do not create a permanent coverage artifact by default. Use one only when concrete high-complexity evidence shows normal outside-in auditing is insufficient.

For legacy migration/extraction, a fresh inventory-to-contract/tree completeness comparison may be required before freeze; discrepancies must be classified rather than silently ignored.

---

## 12. Final Planning Review and durable-contract hygiene

The whole intended planning scope must be complete before implementation begins.

Before Final Review:
- remove duplicated live progress from durable target-project contracts actually used by the plan;
- keep durable contracts about what must remain true, not today's planning status;
- verify every `open` DECISIONS entry is still genuinely unresolved;
- mark resolved choices `resolved` and obsolete questions `superseded`;
- remove/reclassify stale live markers such as `TBD` / `INVESTIGATE` where the underlying issue is already resolved.

Planning is complete only when:
- planning boundary is correct;
- outcome and proposed solution were not conflated;
- intended scope is represented;
- material tactics have defensible logic;
- material alternatives were handled;
- necessary/sufficient decomposition holds;
- material decisions affecting implementation are resolved;
- leaves are implementation-ready;
- execution dependencies are explicit and acyclic;
- outside-in coverage passes;
- KISS passes.

Record Final Planning Review in `REVIEWS.md`.

---

## 13. Freeze no-drift gate

Final Review approves a specific baseline, not whatever files exist later.

Default material baseline:
- `.planning/GOAL.md`;
- `.planning/TREE.yaml`;
- `.planning/DECISIONS.md`.

If another durable contract is explicitly material to the review, include it as an additional checked file rather than expanding the default globally.

Record reviewed-baseline evidence in `REVIEWS.md`.

When Git refs are available prefer:

```text
node .planning/verify-freeze-baseline.mjs --reviewed-ref <reviewed-ref>
```

If merge/rebase/integration later produces the frozen ref, verify it too:

```text
node .planning/verify-freeze-baseline.mjs --reviewed-ref <reviewed-ref> --frozen-ref <frozen-ref>
```

Any material drift makes the prior review stale. Keep/return:

```yaml
cycle_state: active
plan_state: active
implementation_authorized: false
```

Only the verified reviewed baseline may become:

```yaml
cycle_state: active
plan_state: frozen
implementation_authorized: false
```

Freeze closes ordinary planning edits. It does not finish the cycle and does not authorize implementation.

---

## 14. Keep state simple

Ownership:

- `GOAL.md` — stable boundary of the current planning scope.
- `TREE.yaml` — active S&T logic, assumptions, dependencies, evidence.
- `DECISIONS.md` — material open questions and decision history for the current cycle.
- `REVIEWS.md` — review/replanning/closure evidence for the current cycle.
- `.planning/STATUS.yaml` — cycle lifecycle, planning pointer/state, and execution authorization.
- `EXECUTION.yaml` — after freeze: chat allocation + execution state/result for leaf IDs only.
- `EXECUTOR_HANDOFF.md` — stable fresh-executor bootstrap and verification contract, never task content.
- `validate-allocation.mjs` — mechanical allocation validator, no planning state.
- `verify-freeze-baseline.mjs` — no-drift verifier, no planning state.

Framework/tooling files remain installed across cycles. Current-cycle state is GOAL/TREE/DECISIONS/REVIEWS/STATUS/EXECUTION.

Do not create plan-version machinery, feature/release registries, one file per node, archive directories, or a second task database. Git/repository history provides audit history unless real usage proves richer machinery necessary.

---

## 15. Execution handoff

After freeze, keep `implementation_authorized: false` while preparing execution.

The frozen implementation-ready leaves are already the work units. Do not create GitHub Issues merely to mirror them.

Populate `EXECUTION.yaml` by assigning every implementation-ready leaf exactly once to a numbered chat. Do not copy Strategy/Tactic text there; node IDs point back to TREE.

Choose chats from the actual shape of work:
- shared implementation context;
- dependency compatibility;
- manageable workload;
- reasonable balance.

There is no fixed leaves-per-chat rule and no rule that one feature equals one chat. One feature may span several chats; one chat may own leaves from multiple feature subtrees when shared implementation context makes that coherent.

Execution dependencies remain only in `TREE.yaml -> depends_on`; do not create a chat dependency graph.

### Mechanical allocation gate

Before first authorization run:

```text
node .planning/validate-allocation.mjs --initial
```

Add `--serial-chats` only when the target explicitly uses serial numbered chats. After execution/replanning preserves valid completed work, use `--resume`.

Any failure keeps implementation unauthorized.

### Mandatory fresh-chat handoff gate

Follow `EXECUTOR_HANDOFF.md` and simulate fresh executors from repository state only. Cover representative first-available, dependency-blocked, multi-dependency, and final-closure cases.

Verify repository state alone reveals:
- `cycle_state: active`;
- authorization;
- assignment;
- prerequisite states;
- first runnable node or none;
- exact next context to load;
- factual blocker when unavailable;
- after an executor finishes, the exact next runnable chat ID(s), or that Cycle Closure Review is next.

Record the result in `REVIEWS.md`, fix the smallest defect, and rerun failed cases.

Only then set:

```yaml
cycle_state: active
plan_state: frozen
implementation_authorized: true
```

After authorization, determine from `EXECUTION.yaml` and TREE `depends_on` which chat ID or IDs are runnable now and tell the user explicitly how many executor chats were allocated and which exact new chat command(s) may be opened. Do not make the user inspect YAML. Do not hard-code Chat 1 unless Chat 1 is actually runnable. If several independent chats are runnable and the target workflow permits parallel work, say so.

A chat saying "I am chat N" / "אני צ'אט מספר N" follows `EXECUTOR_HANDOFF.md` and may execute only when all three conditions above hold.

---

## 16. Execution state and evidence

Use only:
- `pending`;
- `in_progress`;
- `done`;
- `blocked`.

Set `done` only after the node's `success_evidence` is verified.

If implementation/offline verification is complete but required external live verification is temporarily unavailable:
- keep the leaf `blocked`, not `done`;
- record what evidence passed, what live evidence remains, and the factual availability reason;
- do not reopen planning merely because the external condition is unavailable when the plan itself is still correct;
- continue unrelated work;
- only dependent leaves wait.

Do not silently waive live evidence and do not add another execution state.

---

## 17. Learn from meaningful unexpected failures

Do not create ceremony for normal red-green TDD, trivial typos, expected validation failures, or isolated operator mistakes.

For a meaningful unexpected failure with reusable value:
1. identify technical root cause;
2. identify reasoning/process cause;
3. identify escape cause;
4. apply the local fix;
5. add appropriate regression proof;
6. add the smallest reusable prevention for the same failure class.

Use the target project's existing incident/retrospective/review owner when one exists; otherwise use `REVIEWS.md` when the learning is relevant to S&T quality.

Do not turn one failure into broad framework machinery without evidence.

---

## 18. Replanning after execution discovers a material defect

Do not improvise around a planning defect during execution and do not create a new cycle for it.

Executor response:
1. keep `.planning/STATUS.yaml -> cycle_state: active`;
2. mark the affected node `blocked` with a short factual result;
3. set `.planning/STATUS.yaml -> plan_state: active`;
4. set `.planning/STATUS.yaml -> implementation_authorized: false`;
5. stop starting new execution work.

Planner response:
1. reopen only the smallest affected S&T area;
2. review its parent logic upward until impact is contained;
3. inspect affected `depends_on` relationships and previously completed work;
4. preserve a `done` node only when its Strategy, evidence, and produced outcome remain valid;
5. reset invalidated work to `pending` or remove obsolete nodes;
6. correct only affected EXECUTION allocation;
7. record/review the corrected baseline and pass no-drift verification;
8. freeze again while still unauthorized;
9. run `validate-allocation.mjs --resume` (plus serial mode only when applicable);
10. rerun mandatory fresh-chat handoff verification;
11. explicitly re-authorize only after all gates pass.

Do not restart at the root unless the defect changes root framing. Do not create a plan-version registry; Git history and REVIEWS are enough.

---

## 19. Cycle closure and reuse

Leaf completion does not automatically prove the whole planning scope succeeded.

### Complete the cycle

After all required execution work appears done, run the Cycle Closure Review defined in `REVIEWS.md`.

A cycle may become `completed` only when:
- every required leaf is `done`;
- required leaf evidence is verified;
- the root/current-scope outcome is verified after integration;
- no required blocker remains;
- durable decisions/contracts needed by future work have been promoted into the target project's long-lived source of truth;
- repository current reality/documentation used by future planners reflects what was delivered;
- terminal review/evidence is durably recorded.

Then set:

```yaml
cycle_state: completed
implementation_authorized: false
```

`plan_state` normally remains `frozen`, describing the last reviewed planning baseline.

Tell the user explicitly that the current S&T scope is closed and that a later scope can be requested with the normal short S&T Planner command; do not make the user inspect lifecycle state to discover that reuse is available.

### Abandon the cycle

If the scope is intentionally stopped without proving the root outcome, record an abandonment review and set:

```yaml
cycle_state: abandoned
implementation_authorized: false
```

Do not call it completed. `plan_state` may remain `active` or `frozen` according to the last truthful planning state; the terminal `cycle_state` prevents execution. Tell the user that the scope was closed without claiming the intended outcome succeeded.

### Start a later cycle

A later project/release/feature/change does not reinstall the framework.

Only after the prior cycle is terminal and its snapshot is durable, reset current-cycle state:
- `GOAL.md`;
- `TREE.yaml`;
- `DECISIONS.md`;
- `REVIEWS.md`;
- `STATUS.yaml`;
- `EXECUTION.yaml`.

Keep `FRAMEWORK.md`, `.planning/README.md`, `EXECUTOR_HANDOFF.md`, helper scripts, and the project `AGENTS.md` S&T rules.

Start the new cycle from the current repository reality with:

```yaml
cycle_state: active
plan_state: active
implementation_authorized: false
```

Do not import old trees as active planning. Historical reasoning remains in repository history; truths that must constrain future work belong in durable project contracts.
