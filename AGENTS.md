# AGENTS.md — MarketScope AI Operating Rules

GitHub `main` in `LirazShay/market-scope` is the product source of truth.

Default repository language is Hebrew. Code, identifiers, filenames and technical terms may remain in English.

## Repository roles

- `market-scope` = THE PRODUCT and current truth.
- `market-flow` = reference-only source library / historical evidence.
- `st-planner` = planning-framework source.

Do not copy Market Flow wholesale. Use:

```text
inspect evidence
→ extract product knowledge
→ KEEP / ADAPT / DROP / INVESTIGATE
→ define clean MarketScope contract
→ plan proof/tests
→ implement only after S&T freeze
```

`DROP` means do not migrate into MarketScope; never delete Market Flow merely because of this classification.

## Fresh-chat read order

During planning/product extraction:

```text
AGENTS.md
→ STATUS.yaml
→ .planning/README.md
→ .planning/FRAMEWORK.md
→ .planning/STATUS.yaml
→ only current-stage docs/source evidence
```

Use progressive disclosure. Do not preload Browser-SQL history, old execution graphs or unrelated planning.

After freeze, executor chats read `.planning/EXECUTOR_HANDOFF.md`, `EXECUTION.yaml`, only their assigned TREE nodes, dependencies and routed contract sections.

After implementation/release, ordinary maintenance chats should use:

```text
AGENTS.md
→ STATUS.yaml
→ README.md
→ only the durable contract/code/test area relevant to the requested change
```

Do not preload planning history, Market Flow, old execution graphs or completed executor evidence unless the current task specifically requires them. `STATUS.yaml` remains the operational truth for any remaining external gate or follow-up.

## Branch and PR workflow

For every **meaningful engineering/planning work unit**, do not develop directly on `main`.

Default lifecycle:

```text
fresh main
→ create one focused branch
→ complete one coherent work unit on that branch
→ run required targeted verification
→ set EXECUTION/STATUS done + next pointer on that same branch
→ open/update the one PR for that work unit
→ required CI green
→ review the PR diff against the work-unit contract
→ squash-merge
→ verify main CI
→ audit open PRs
→ only then start the next work unit
```

Branch names should describe the work, for example:

```text
plan/stage-08-st-decomposition
feat/local-service-bootstrap
feat/fake-market
fix/history-pagination
docs/product-contract-correction
```

Rules:

- one branch and one PR own one natural engineering outcome; do not mix unrelated cleanup/features;
- do not open a second post-merge "closure/evidence" PR for the same work unit; merge SHA, PR state and main-CI runs already live canonically in GitHub;
- repository state that must advance with the work unit (`EXECUTION.yaml`, root/planning `STATUS.yaml`, next pointer, durable proof references) must be finalized on the same work branch before its PR merges;
- after merge, verify main CI externally; do not create a new PR merely to copy the just-produced merge SHA or main-CI run ID back into STATUS;
- one user-facing stage/message should normally contain a **meaningful coherent change**, not a stream of tiny cosmetic steps;
- multiple commits inside the branch are fine when useful for proof/fix cycles;
- fixes discovered while verifying the branch stay on the same branch when they belong to that work unit;
- do not start the next independent work unit before the current PR is merged and required main verification is green;
- `main` represents the last accepted, verified product/planning truth;
- an open PR is work-in-progress, not accepted product truth;
- if work is interrupted mid-branch, the next chat must inspect the open PR/branch before starting overlapping work;
- before declaring a work unit/chat complete or handing off to another chat, query repository open PRs; under the serial executor the required count is zero;
- any unexpected open PR must be merged, closed as superseded, or deliberately adopted before progression; an unaccounted open PR is a blocking defect;
- direct-to-main writes are reserved only for cases where the available GitHub tooling cannot use a branch/PR and the user explicitly accepts that exception;
- after freeze, an executor chat should normally use one branch/PR for its assigned coherent node set rather than writing implementation directly to main.

Prefer squash merge so `main` records one clean commit per coherent work unit.

## Learning from failures

Unexpected defects, missing tests, flaky tests, CI failures, integration failures, rework, or flow-stopping discoveries are not closed by merely making the immediate symptom green.

For a meaningful unexpected failure, keep the analysis and fix in the same owning branch and ask:

```text
what happened?
→ technical root cause
→ reasoning/process cause
→ escape cause: why existing proof/review did not catch it earlier
→ local fix + regression proof
→ smallest reusable prevention for the whole failure family
```

Rules:

- prefer prevention of the causal class, not a special-case guard for one observed symptom;
- add a test/guard/rule/design correction only when it is the smallest reusable prevention;
- do not turn every typo or expected TDD red into permanent process ceremony;
- if the discovery proves the current S&T/contract materially wrong, stop coding forward and reopen the smallest owning planning area;
- record durable lessons in the narrowest owning artifact (`REVIEWS`, test policy, contract, decision, or code guard), not only in chat text.

### Programmatic text transformation rule

When editing repository text programmatically, especially YAML/workflows or generated config:

- never use a raw JavaScript `String.replace(search, replacementString)` when inserted text may contain `$`; JavaScript replacement tokens can silently rewrite unrelated suffix content;
- use a replacer function or construct the final file from a known-good baseline;
- reread the complete resulting file/diff before PR;
- a successful tool call is not evidence that the rendered file is correct.

This is a promoted reusable lesson from repeated workflow corruption caught before merge.

## Long-running work progress updates

When one work unit requires a long sequence of reads, edits, CI runs, or verification calls, keep the user oriented instead of going silent for a long stretch.

During long work:

- periodically state what is being checked or changed **now**;
- state what has already been completed inside the current stage;
- state the remaining sub-steps before the stage can close;
- report meaningful defects/discoveries as soon as they are known, not only in the final summary;
- if CI or a tool blocks progress, explain the blocker and what the next recovery action is;
- keep updates concise and useful; do not narrate every low-level tool call.

The user should be able to understand the current progress and why the next operation is necessary without waiting for the final stage report.

## Source ownership

- `STATUS.yaml` = operational stage pointer + verification + next.
- `.planning/STATUS.yaml` = S&T plan state/pointer only.
- `.planning/GOAL.md` = stable goal boundary.
- `.planning/TREE.yaml` = S&T logic/dependencies/evidence.
- `.planning/DECISIONS.md` = material questions/decisions.
- `.planning/REVIEWS.md` = review audit.
- `.planning/LEGACY_COMPLETENESS_AUDIT.md` = pre-freeze second-pass Market Flow migration/outside-in audit evidence.
- `.planning/COVERAGE_MAP.yaml` = exhaustive MASTER_COVERAGE ID → durable owner/S&T mapping.
- `.planning/EXECUTION.yaml` = post-freeze numbered executor allocation.
- `.planning/EXECUTOR_HANDOFF.md` = compact fresh-chat bootstrap/context-routing contract for numbered executors.
- `docs/PRODUCT_REQUIREMENTS.md` = what/why.
- `docs/PRODUCT_SPEC.md` = observable behavior.
- `docs/DATA_CONTRACT.md` = provider/data truth.
- `docs/TECHNICAL_SPEC.md` = current architecture contract.
- `docs/TEST_STRATEGY.md` = verification contract.
- `docs/SOURCE_EXTRACTION.md` = migration provenance.

Do not duplicate live status into README/specs/source-extraction.

## Planning boundary

Production implementation is forbidden while root `STATUS.yaml -> phase: planning`.

Planning state semantics:

```text
plan_state: active
→ contracts / S&T may still change
→ EXECUTION must remain unallocated
→ no production implementation

plan_state: frozen + phase: planning
→ reviewed planning baseline is locked
→ EXECUTION may be allocated / handoff may be verified
→ no production implementation yet

plan_state: frozen + phase: implementation
→ executor chats may implement only their assigned available nodes
```

If execution discovers a material planning defect, set `.planning/STATUS.yaml -> plan_state: active`, set root `STATUS.yaml -> phase: planning`, stop starting new implementation work, and reopen only the smallest affected S&T area.

The planner phase is preparation-only: extraction, clean documents, S&T decomposition/review, freeze, executor allocation and fresh-chat handoff verification. Product Knowledge Extraction precedes replacement implementation.

## Coverage re-audit discipline

`.planning/MASTER_COVERAGE.md` is the anti-forgetting inventory distilled from the original MarketScope brief. It is not a second STATUS file and does not dictate implementation order.

During planning, re-audit it after major contract phases, before outside-in review, before Final Planning Review, before freeze, and after EXECUTION allocation. Before freeze every coverage ID must map to a durable contract/decision/S&T node or explicit N/A rationale. `.planning/COVERAGE_MAP.yaml` must contain exactly the same unique coverage IDs as `.planning/MASTER_COVERAGE.md`: no missing IDs and no extras.

If the original brief is available in the active conversation, sample-check the durable coverage map against it again rather than assuming the summary is perfect.

## Serial executor protocol

A numbered executor chat may start production implementation only when both gates are true:

```text
.planning/STATUS.yaml -> plan_state: frozen
AND
STATUS.yaml -> phase: implementation
```

If the plan is frozen but root phase is still `planning`, allocation/handoff work is still in progress and the executor must not start code.

When implementation is authorized and the user says `אני צאט N תתחיל`, `אני צ'אט N תתחיל`, `אני צ'אט מספר N`, or equivalent:

1. read `.planning/EXECUTOR_HANDOFF.md`;
2. read `.planning/EXECUTION.yaml`;
3. load only chat N's assigned TREE nodes/dependencies and contract sections routed by the handoff guide;
4. verify `TREE.yaml -> depends_on` prerequisites are `done`;
5. verify root `STATUS.yaml` points to that current chat; otherwise report the blocker and do not code;
6. execute assigned nodes in listed order; same-chat dependencies must become `done` before later assigned nodes start;
7. set a node `in_progress` before work;
8. execute only assigned unblocked work;
9. verify `success_evidence` before `done`;
10. keep root `STATUS.yaml` current;
11. if a material planning defect appears, reopen only the smallest affected S&T area.

## Engineering defaults

KISS: current verified requirement → smallest sufficient mechanism → prove it → stop.

Tests protect observable/public contracts, not private implementation details.

### Diagnosability-by-design

Diagnosability is a product and engineering requirement, not an after-the-fact debugging task.

For every meaningful runtime/operational boundary, design the normal and failure path so a future failure can be localized from ordinary product/CLI diagnostics without first reproducing it under a debugger.

Required rules:

- give each meaningful boundary a stable component + checkpoint/stage identity;
- failures expose a stable error code, sanitized technical message and the checkpoint that failed;
- retain the last successful checkpoint so the failure boundary is obvious;
- preserve the causal error when wrapping failures; do not replace a specific cause with a generic-only message;
- expose a compact copyable support snapshot for normal operator/user troubleshooting when the product can render one;
- startup/CLI failures must remain diagnosable even when Viewer/service startup is unavailable;
- diagnostics must be public-safe: never include credentials, cookies, auth/session data, account identifiers, authorization headers, private browser state or raw authenticated/provider dumps;
- prefer counts, state, timestamps, generated correlation IDs and sanitized codes over raw payloads;
- keep diagnostic history bounded; do not build a telemetry platform, remote collector or generic logging framework without evidence;
- when adding/changing a capability, explicitly consider how its failure will identify component, checkpoint and cause; add proof for the relevant failure contract rather than relying on ad-hoc console output;
- CI/browser/demo failure evidence should make the first failing boundary obvious and preserve the useful sanitized diagnostics needed to reproduce/fix it quickly.

The desired support workflow is:

```text
something fails
→ product/CLI identifies component + failed checkpoint + stable error code
→ last successful checkpoint and sanitized cause are available
→ user copies the compact support snapshot / CI artifact
→ maintainer can start from the failing boundary instead of rediscovering it by broad debugging
```

Target boundary unless later evidence changes it:

```text
authenticated provider page
→ validated complete cycle
→ loopback WebSocket
→ one localhost Node.js service
→ one native DuckDB
→ Current / Detail-History / Scanner
```

## Security

Treat all repository artifacts as public-safe regardless of current GitHub visibility. Never commit credentials, cookies, session/auth data, authorization headers, account identifiers, private browser/session data or unsanitized authenticated dumps. Use sanitized synthetic fixtures. Do not bypass WAF/CSP/access controls.

---

# S&T Framework Rules

## One-command planning trigger

When the user asks to plan using **S&T Planner** (including natural variants such as "ST Planner", "S T Planner", or "תתכנן לי בשיטת S&T Planner לפי הריפו"), treat that request as the complete planning command.

The user does **not** need to explain the framework workflow, name planning files, choose a number of stages, or paste a special starter prompt.

On that trigger, automatically:

1. Read the repository's existing `AGENTS.md` / routing / source-of-truth rules.
2. Read `.planning/README.md`, `.planning/FRAMEWORK.md`, and `.planning/STATUS.yaml`.
3. Determine the requested planning goal from the user's request and current repository context. Do not invent a different goal.
4. Use the repository's own context-loading rules and inspect only the workstream/component and files needed to understand current reality.
5. Update `GOAL.md`.
6. Build the complete S&T tree in `TREE.yaml`, recording material unresolved questions/choices in `DECISIONS.md`.
7. Review/correct the plan as required by the framework, including necessity, sufficiency, KISS, implementation readiness, and whole-plan completeness.
8. Record meaningful reviews in `REVIEWS.md` and keep `STATUS.yaml` current.
9. Do **not** implement target-project work while planning.
10. Continue planning until the complete intended plan passes Final Planning Review.
11. Set `plan_state: frozen`.
12. Populate `EXECUTION.yaml` by assigning every implementation-ready leaf exactly once to numbered executor chats.

Unless the user explicitly asks to stop earlier or work one stage per message, complete this planning workflow autonomously in the same planning conversation.

If the user's request does not contain enough information to identify what should be planned and the repository has no single unambiguous active target, ask only for the missing goal—not for framework instructions.

This project uses the S&T Planner framework.

For meaningful work:

1. Read the repository's existing `AGENTS.md`/routing rules first, then `.planning/README.md` and `.planning/FRAMEWORK.md`.
2. Respect existing project context-loading/source-of-truth conventions; do not recursively preload the repository.
3. During planning, resume from `.planning/STATUS.yaml`.
4. Plan with Strategy & Tactics rather than arbitrary task lists.
5. Validate required children as necessary individually and sufficient together.
6. Keep material open questions in `.planning/DECISIONS.md`.
7. Continue until the complete intended S&T is implementation-ready.
8. Run Final Planning Review before freezing.
9. Do not implement while `plan_state: active`.
10. After freeze, allocate every implementation-ready leaf exactly once in `.planning/EXECUTION.yaml`.
11. Do not copy task descriptions into EXECUTION; node IDs point to TREE.
12. If the user says "I am chat N" / "אני צ'אט מספר N", load chat N from EXECUTION, read only its assigned S&T nodes/context, check TREE dependencies against EXECUTION states, and execute only available assigned nodes.
13. Mark a node `done` only after its `success_evidence` is verified.
14. If a material planning defect appears during execution, mark the affected node blocked with a factual reason, set `plan_state: active`, and stop starting new execution work.
15. Reopen only the smallest affected S&T area; preserve `done` work only when it remains valid under the corrected plan.
16. After focused review, repair only affected EXECUTION entries and freeze again. Git history is sufficient version history.
17. Prefer one planning chat; use repository state for durability and optional continuation.
