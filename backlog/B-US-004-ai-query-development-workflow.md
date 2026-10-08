# B-US-004 — Query development workflow for AI

## Backlog metadata

- Status: `Backlog`
- Priority: `Unprioritized`
- Blocking: `No`

## Goal

Make "ask AI to add/change a Scanner query" a safe repeatable workflow.

## Desired flow

```text
AI edits/adds .sql file
→ metadata validation
→ correctness tests
→ static performance gate
→ human 10+ preflight for material SQL
→ tiny deterministic probe
→ normal Scanner activation only after green proof
```

## Acceptance evidence

- Documentation provides a short prompt/workflow for adding a query.
- The AI does not need to modify DuckDB directly.
- CI gives precise feedback for syntax/schema/correctness/performance-static failures.
- The workflow preserves normal saved-query UX and does not create a second Scanner engine.

## Sequencing note

`B-US-001` through `B-US-004` are strongly related and may eventually be planned as one coherent capability:

```text
file-backed query source
→ correctness harness
→ static performance analyzer/gate
→ AI authoring workflow/docs
```

Future planning must re-evaluate the smallest sufficient decomposition from fresh `main`; this backlog item does not pre-authorize that exact PLAN shape.
