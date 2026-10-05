# Representative Workload Baseline

This document records the current bounded Market Flow US workload evidence and preserves the earlier MarketScope donor measurement for historical comparison.

The numbers here are diagnostic evidence, not latency SLOs. Heavy performance authority belongs to the intended target machine under final acceptance; GitHub-hosted runners prove correctness and only small bounded performance sanity.

## Current Market Flow US bounded CI evidence

- GitHub Actions workflow: `Market Flow US Workload`
- Run ID: `37287906850`
- Result: `pass`
- Environment: Node `v24.21.0`, Linux x64
- End-to-end artifact ID: `11335013150`
- Isolated-probes artifact ID: `11335445868`

### Bounded end-to-end correctness profile

- Scenario: 64 securities × 45 complete cycles
- Logical cadence: 3000 ms
- Expected/final history rows: 2,880
- Final latest rows: 64
- Final completed cycles: 45
- Failed cycles: 0
- Restart-to-ready: 37.397 ms
- Profile wall clock: 1,674.337 ms

| Operation | Samples | Min ms | Median ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cycle commit | 45 | 15.419 | 18.407 | 25.990 | 35.373 |
| Current read | 2 | 4.903 | 4.903 | 5.631 | 5.631 |
| History page | 2 | 2.694 | 2.694 | 2.869 | 2.869 |
| General Scanner overall | 8 | 1.887 | 2.501 | 3.400 | 3.400 |
| Staged candidate Scanner | 2 | 20.659 | 20.659 | 30.263 | 30.263 |

The bounded end-to-end profile proves exact session/latest/history counts, restart preservation, Current/History reads, general Scanner queries and the production staged-candidate Scanner query over schema v3.

### Isolated component sanity

The isolated run intentionally avoids irrelevant browser/transport layers when measuring persistence/read/Scanner behavior.

- 128-security persistence sanity: 3 cycles / 384 history rows; commit median 39.110 ms, p95 44.149 ms.
- Approximately-4k width sanity: 4,096 securities × 1 cycle / 4,096 history rows; isolated cycle commit 233.558 ms.
- Read/Scanner fixture: 64 securities × 45 logical cycles / 2,880 history rows.
- Current read: 5.805 ms.
- History page: 3.092 ms.
- Staged candidate Scanner: 27.749 ms.

These hosted-runner timings are diagnostic only. They do not establish target-machine performance PASS.

## Heavy target-machine profiles

The workload tooling exposes, but hosted CI does not require:

- `4096 × 180` end-to-end U.S. profile;
- one-trading-day bounded isolated persistence/read/Scanner profiles;
- configurable universe size, cycle/history shape, cadence, moving/static data pattern and deterministic failure cycles.

Heavy timing conclusions are deferred to TREE `7.4` target-machine acceptance. No GitHub-hosted result may substitute for that final machine-specific evidence.

## Historical MarketScope donor baseline

The original donor workload remains useful only as historical implementation evidence and must not be treated as the Market Flow US acceptance baseline.

- Workflow: `MarketScope Workload`
- Run ID: `36357127789`
- Artifact ID: `10944652741`
- Scenario: 561 securities × 600 complete cycles
- History rows: 336,600
- Failed cycles: 0
- Final latest rows: 561
- Restart-to-ready: 44.613 ms
- Cycle commit median: 1,644.866 ms
- Current read median: 6.953 ms
- History page median: 8.618 ms

## Review

No blocking workload defect remains in the bounded CI evidence for TREE `6.3`.

The workload architecture now separates broad deterministic correctness, approximately-4k width sanity, isolated component probes and final target-machine authority. This avoids using slow hosted end-to-end replay as a proxy for component performance while preserving the full heavy path for final acceptance.

This evidence does not prove authenticated provider behavior, active-market movement or final target-machine heavy performance; those remain owned by the later release/acceptance leaves.
