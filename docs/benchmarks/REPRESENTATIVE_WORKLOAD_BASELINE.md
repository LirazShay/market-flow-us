# Representative Workload Baseline

This document records the first measured MarketScope representative workload baseline required by `docs/TEST_STRATEGY.md` §9.

It is evidence, not a numeric latency SLO. The acceptance policy remains the frozen Test Strategy: address measured latency only if it materially prevents the selected collector/Scanner cadence or makes ordinary interactive reads unusable.

## Evidence

- GitHub Actions workflow: `MarketScope Workload`
- Run ID: `36357127789`
- Artifact ID: `10944652741`
- Result: `pass`
- Environment: Node `v24.21.0`, Linux x64
- Scenario: 561 securities × 600 complete cycles
- Expected/final history rows: 336,600
- Failed cycles: 0
- Final latest rows: 561
- Final completed cycles: 600
- Final cycle ID: 600
- DuckDB file size: 133,705,728 bytes
- Restart-to-ready: 44.613 ms

## Latency distributions

| Operation | Samples | Min ms | Median ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cycle commit | 600 | 1583.682 | 1644.866 | 1945.302 | 2609.652 |
| Current read | 13 | 6.122 | 6.953 | 11.965 | 11.965 |
| History page | 16 | 4.227 | 8.618 | 163.471 | 163.471 |
| Scanner overall | 52 | 1.963 | 3.235 | 6.212 | 167.686 |
| Scanner JOIN | 13 | 2.231 | 2.630 | 167.686 | 167.686 |
| Scanner GROUP/HAVING | 13 | 2.853 | 4.469 | 6.880 | 6.880 |
| Scanner window/rank | 13 | 1.963 | 2.378 | 5.925 | 5.925 |
| Scanner time predicate | 13 | 2.904 | 3.418 | 3.968 | 3.968 |

## Correctness covered by the run

The representative scenario passed all programmed assertions for:

- deterministic 561-security universe;
- 600 full protocol/service commits;
- exact final history/latest/session counts;
- no failed writes;
- interleaved Current reads;
- History first-page reads and keyset continuation;
- Scanner JOIN;
- Scanner GROUP BY/HAVING;
- Scanner window/rank;
- Scanner historical time predicate;
- service close/reopen against the same DuckDB;
- representative reads after restart.

## Review

No workload blocker was identified by this baseline.

The read paths remained interactive in this measured run. The commit distribution is recorded as the first empirical baseline and does not establish a new hard SLO. No batching or persistence redesign is introduced solely because a theoretically faster implementation may exist.

This workload does not prove live provider limits, authenticated provider behavior, browser correctness, or real-market compatibility; those remain owned by their separate verification layers.
