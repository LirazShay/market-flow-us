# B-US-002 — Query correctness contract tests

## Backlog metadata

- Status: `Backlog`
- Priority: `Unprioritized`
- Blocking: `No`

## Goal

Every file-backed production/example query must have executable correctness proof, not only parser/admission proof.

## Required outcome

For every checked-in executable query:

- parse/admission test against the current Scanner security contract;
- schema-binding test against a real temporary DuckDB using the current schema;
- deterministic fixture with expected rows/columns/order;
- assertions for query-specific semantics, not merely "query executed";
- explicit edge cases where applicable: `NULL`, numeric zero, missing history, equal timestamps, `cycle_id` tie-break, ties in ranking, empty history, static/repeated values and membership changes;
- deterministic bounds/`LIMIT` assertions where the query is intended to be bounded;
- exact file↔loaded-SQL drift test so documentation/runtime/test copies cannot diverge.

Prefer small deterministic fixtures and millisecond/seconds feedback. Do not use the representative workload to prove basic correctness.

## Acceptance evidence

- Adding or changing a `.sql` query without adding/updating its correctness contract fails Fast verification.
- Intentional semantic changes require an explicit expected-result test change.
- Incorrect nearest-history/tie/null/ranking behavior is caught by focused tests before any performance run.
