# Portable S&T Planning Kernel

This is the minimum planning method a fresh GPT needs.

## 0. Connect to an existing project without context dumping

Before building S&T, understand only the current reality needed for this goal.

If the repository already has `AGENTS.md`, workstream routing, status files, context-loading rules, specs, or other source-of-truth conventions, **use them**. The S&T framework does not replace project-native context management.

Progressive disclosure rule:

1. read the project's normal AI entry point;
2. identify the relevant workstream/component for the requested goal;
3. read its current status/context;
4. read directly relevant code/docs/tests/specs as planning questions require them;
5. load history or unrelated areas only when a concrete uncertainty requires it.

Do not recursively scan the repository by default.

The test for loading more context is:

> Could this information materially change GOAL, TREE, DECISIONS, or a review?

If not, do not preload it.

## 1. Strategy + Tactic

Every node contains:

- **Strategy** — what objective must exist?
- **Tactic** — how will it be achieved?
- **Parallel assumptions** — why can this tactic achieve this strategy?
- **Necessary assumptions** — why is this child necessary for its parent?
- **Sufficiency assumptions** — why are the children enough together?
- **Success evidence** — how will achievement be recognized?

## 2. Where each assumption belongs

Keep the three logical relationships distinct:

- `parallel_assumptions` belong to the **node itself**: why this node's Tactic can achieve this node's Strategy.
- `necessary_assumptions` belong to the **child → parent relationship**: why this child Strategy is necessary for its parent. Store them on the child.
- `sufficiency_assumptions` belong to the **children-as-a-group → parent relationship**: why this parent's children are sufficient together. Store them on the parent.

V1 deliberately does **not** add a separate edge object or duplicate `parent` field:
- the parent is derived from the parent's `children` list;
- every non-root node has exactly one logical parent;
- the root has no necessary assumptions;
- a leaf normally has no sufficiency assumptions because it has no children.

This placement keeps the tree compact while preserving the S&T logic.

## 3. Go down by asking "How?"

For the parent tactic ask:

> How exactly must this be performed?

Each child should represent an independently necessary part of performing the parent tactic.

A one-child decomposition is usually just rewording.

## 4. Necessity

For every child:

> Remove it without replacing it. Can the parent still be achieved?

If yes, challenge its place in the required tree.

## 5. Sufficiency

For every parent:

> Assume all children succeed. What required condition could still be missing?

If something is missing, the group is incomplete.

## 6. Alternatives and unknowns

Do not represent alternatives as simultaneous necessary children.

Material unresolved questions belong in `DECISIONS.md`.

Do not guess important unknowns.

## 7. Stop at implementation-ready leaves

There is no QUICK/DEEP mode. Small problems naturally produce small trees; difficult problems naturally produce deeper trees.

Stop when an executor would not need another material design/product decision.

For an implementation-ready leaf, also record any real execution prerequisites in `depends_on` using S&T node IDs.

`depends_on` means only:

> This node's execution cannot correctly begin until those node outcomes exist.

It is **not**:
- the S&T parent/child relationship;
- priority;
- a preferred sequence;
- a general schedule.

V1 dependency invariants:
- reference existing implementation-ready leaf node IDs only;
- no self-dependency;
- no dependency cycles;
- if two leaves can execute independently, do not invent a dependency.

Do not decompose into trivial coding/clicking instructions.

## 8. Node planning status

Use exactly three local planning statuses:

- `draft` — the node is still being designed/reviewed and may change.
- `blocked` — planning for this node cannot proceed because a material unresolved question exists.
- `approved` — this node's own Strategy/Tactic logic and immediate decomposition have passed local review.

KISS rules:

- Do not add more node statuses in V1.
- `blocked` is not a synonym for "unfinished"; ordinary unfinished work stays `draft`.
- Every `blocked` node must have at least one open entry in `DECISIONS.md` that references that node.
- Do not add a separate `blocked_by` field to TREE; the D-entry is the source of the reason.
- Status is local. A blocked descendant does not automatically change its parent from approved to blocked.
- Local approval never authorizes implementation before the whole plan is frozen.

## 9. Review as you build

Check:
- Strategy/Tactic validity;
- necessity;
- sufficiency;
- assumptions;
- KISS;
- tree consistency.

Local approval means planning logic is sound locally. It does not authorize implementation.

## 10. Whole-plan completeness audit

Local Necessity/Sufficiency checks can still miss a whole concern if that concern never entered the tree.

Before Final Planning Review, perform one **outside-in coverage audit** from `GOAL.md`.

Do not create a separate coverage file. Use these challenge questions:

1. **Goal traceability** — For every meaningful clause in the desired outcome and every hard constraint, where is it protected by the TREE, a material assumption, a decision, or success evidence?
2. **Root gap test** — Assume every planned leaf succeeds exactly as written. Can the desired outcome still fail for a reason the plan should have handled?
3. **Boundary challenge** — Look only at actors, system boundaries, external dependencies, and failure paths that materially affect this goal. Did the plan silently assume one of them away?
4. **Negative-space check** — Did the tree accidentally include work that belongs to a stated non-goal?
5. **Scenario walkthrough** — Walk a small number of representative end-to-end scenarios implied by the goal. Include a failure/edge scenario only when it could materially invalidate the plan.

If the audit finds a gap:
- add/correct the smallest affected S&T branch;
- create a D-entry if the gap is an unresolved material question;
- re-run affected Necessity/Sufficiency reviews.

If it finds no gap, record the pass in the normal Final Planning Review. Do not persist a duplicate coverage matrix.

## 11. Finish the entire plan before execution

Do not hand partially planned leaves to implementation.

When the whole intended tree is ready, run Final Planning Review across the complete plan.

Only after it passes:

```yaml
plan_state: frozen
```

Before that:

```yaml
plan_state: active
```

## 12. Keep state simple

- `GOAL.md` — stable boundary.
- `TREE.yaml` — S&T plan.
- `DECISIONS.md` — material questions/decisions.
- `REVIEWS.md` — review history.
- `STATUS.yaml` — where planning currently stands.

Prefer one planning conversation. Repository state exists so continuation is possible when needed.

## 13. Execution handoff

After freeze, do not translate the S&T tree into another task system.

Create/populate `EXECUTION.yaml`.

Every implementation-ready leaf appears exactly once under one numbered chat:

```yaml
chats:
  "1":
    nodes:
      "1.2.1":
        state: pending
        result: null
```

The executor reads Strategy, Tactic, assumptions, `depends_on`, and `success_evidence` directly from TREE.

### Allocation

Choose the number of chats from the real amount of work.

Group nodes by:
- shared implementation context;
- dependency compatibility;
- manageable chat workload;
- reasonable balance.

Do not use a fixed leaf count.

If one leaf is too large for a practical executor chat, planning stopped too early: reopen and decompose it.

### State

Use only:
- pending
- in_progress
- done
- blocked

Set `done` only after success evidence is verified.

Dependencies remain only in TREE. A chat checks prerequisite node states in EXECUTION.

A chat that says "I am chat N" / "אני צ'אט מספר N" loads exactly its assigned nodes and works only within that scope.

Do not build an execution engine, scheduler, or duplicated task database.


## 14. Replanning after execution discovers a defect

A frozen plan may still meet reality and prove wrong.

Do not patch around a material planning defect during execution.

### Executor response

When an executor discovers a material planning defect:

1. stop the affected node;
2. set that node in `EXECUTION.yaml` to `blocked`;
3. put a short concrete reason in `result`;
4. change `.planning/STATUS.yaml -> plan_state` back to `active`;
5. set `.planning/STATUS.yaml -> replan_mode: execution_reopen`;
6. set root `STATUS.yaml -> phase: planning`;
7. set STATUS to the smallest S&T area that must be reconsidered.

No other execution may start while `plan_state: active`.

`execution_reopen` means implementation already exists and must be preserved. In this mode:

- existing product files are expected and must not be deleted merely because root phase is temporarily `planning`;
- existing valid `done` nodes stay done;
- the affected current node is `blocked` with a factual reason;
- no node may remain `in_progress`;
- EXECUTION remains allocated and is repaired only where the changed plan requires it;
- planning/static CI validates the preserved allocation/dependency order instead of applying the clean-room initial-planning rules.

### Planner response

Reopen only the smallest affected planning area.

Review:
- the defective node/branch;
- its parent logic upward until the changed logic is contained;
- affected `depends_on` relationships;
- any previously executed nodes whose validity depends on the changed outcome;
- whole-plan coverage only where the change can affect it.

Do not re-plan unrelated branches.

### Preserve valid completed work

A node already marked `done` stays `done` if:
- its Strategy still means the same thing;
- its success evidence still proves that Strategy;
- the revised plan does not invalidate the produced outcome.

If any of those are false, reset that node to `pending` (or remove it if the node no longer exists) and record the reason in the review.

Do not add a `stale` state.

### Rebuild only affected allocation

After the corrected planning area passes review:

1. ensure obsolete leaf IDs are removed from EXECUTION;
2. add any new implementation-ready leaves exactly once as `pending`;
3. keep unaffected chat allocations and valid `done` nodes unchanged where practical;
4. re-check dependencies and chat coherence only for affected work;
5. set `plan_state: frozen` again.

No plan-version registry is required. Git history already records prior file versions.
