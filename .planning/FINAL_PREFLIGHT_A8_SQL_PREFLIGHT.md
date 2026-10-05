# A8 Static SQL Preflight — live movement witness

Purpose: add a bounded read-only Scanner query that can mechanically classify TREE 7.4 / FR-13 market-open movement evidence without weakening the existing authenticated static gate.

## Query shape

The query reads only `history` and `latest` for the already-completed live verification cycle-id range, groups by `security_id`, detects change in one persisted/visible provider field (`Price`, `ChangePercent`, `BidRate`, `AskRate`, `DailyVolume`, `TradeDateTime`), joins the final `latest` row, orders by identity and returns at most one witness.

## 10-stage static preflight

1. **Single statement** — one `WITH ... SELECT`; no second statement or semicolon chain.
2. **Read only** — only `SELECT`/CTEs over `history` and `latest`; no DDL/DML/PRAGMA/COPY/ATTACH.
3. **No parameters** — first/last cycle IDs are already validated safe integers and are embedded as decimal literals because Scanner accepts zero parameters.
4. **Bounded authority range** — `history.cycle_id BETWEEN firstCycleId AND lastCycleId`; it never scans outside the SHA-bound live run except the one-row-per-security `latest` join.
5. **Bounded result** — deterministic `ORDER BY security_id ASC LIMIT 1`.
6. **Identity** — grouping and join use canonical `security_id`; no Symbol/name/order-derived identity.
7. **Movement semantics** — only persisted provider market/freshness fields are considered; local `collected_at_ms` is deliberately excluded so normal polling time cannot fabricate movement.
8. **NULL semantics** — each candidate field is normalized with an explicit NULL sentinel before `COUNT(DISTINCT ...)`, so NULL→value and value→NULL count as observable provider change.
9. **Final authority witness** — the movement security must still exist in `latest`; the query returns final `latest.cycle_id` and the final changed-field value for comparison with trusted Current.
10. **Determinism/security** — fixed field list, fixed CASE order, identity ordering, no dynamic function names, filesystem/network/secret access, or provider raw payload output.

First execution after this preflight must be a tiny deterministic regression fixture before any authenticated use.
