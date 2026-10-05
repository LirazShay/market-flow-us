# Integrated Offline Release Candidate Gate

This document records TREE node `7.1` evidence for the integrated deterministic offline release candidate.

The authoritative candidate is `cb912741c22eeedec2b4f2ecf17348134e1814f3` on `main`. The Chat 7 gate branch changes only durable evidence/status truth; it does not change product/runtime code from that candidate.

## Required gate results

| Gate | Run | Result | Evidence |
| --- | --- | --- | --- |
| Fast CI | `37291127424` | PASS | 100 unit tests + 83 real-service tests, zero failures. The parallel Fast step completed with unit `2235 ms` and service `16032 ms`; full job wall-clock was about `21.4 s`. |
| Browser CI | `37291127412` | PASS | 18 Chromium E2E tests passed. Playwright reported `20.2 s`; full hosted job wall-clock was about `37.4 s`. |
| Bounded workload | `37291127578` | PASS | Bounded end-to-end profile passed in `1559 ms` report wall-clock; isolated probes passed in `4895 ms`. Reports are diagnostic and explicitly `targetAuthority: false`. |
| Planning Docs CI | `37291127425` | PASS | Durable planning/execution truth validated on the merged candidate. |

No deterministic blocking defect remained after these runs.

## Workload evidence

The bounded end-to-end report proves:

- 64 securities × 45 cycles;
- 2,880 expected/final history rows;
- 64 latest rows and 45 completed cycles;
- Current and History reads;
- general Scanner queries;
- staged-candidate Scanner execution;
- restart-to-ready preservation;
- sanitized diagnostic reporting.

The isolated report proves:

- isolated persistence correctness;
- one approximately-full-universe width cycle at 4,096 securities / 4,096 history rows;
- direct 64 × 45 day-shaped read/Scanner seeding;
- Current, History and staged/general Scanner probes;
- sanitized reporting without target-machine performance claims.

Artifacts from run `37291127578`:

- bounded end-to-end: artifact `11336705537`;
- isolated probes: artifact `11336790373`.

Heavy `4096 × 180` and one-day target-machine timing remain final acceptance work; this gate does not promote hosted-runner timing into a release SLO.

## Browser feedback review — best practical verified state

`D-US-020` requires recurring automation in the 10–30 second range to be reviewed rather than normalized blindly.

The Browser gate was reviewed at the dominant-cost level:

- the same product content passed the immediately preceding PR Browser run `37290541200` with `18 passed (14.1 s)`;
- the merged-main Browser run `37291127412` reported `18 passed (20.2 s)`;
- therefore the observed increase is hosted-runner variance, not a deterministic code/test regression;
- the prior full PR job was about `27.6 s`, while the merged-main job was about `37.4 s` because hosted setup/cache/runtime timings varied;
- exact Chromium cache restore is large (~271 MB) and runner/network dependent;
- the full runtime E2E family intentionally uses one Playwright worker because normal-runtime integration tests bind the canonical local service port `8765`; parallelizing those tests safely would require changing test/runtime topology rather than removing a simple duplicate wait;
- no focused suite is redundantly rerun before the full Browser suite in this workflow;
- no timeout/retry increase or coverage deletion was used to obtain PASS.

The current Browser suite is therefore recorded as the best practical verified state for this architecture. Reopen automation-performance work if the deterministic test execution materially regresses, if the runtime/service port topology changes, or if a low-risk optimization can remove meaningful recurring cost without weakening the integration proof.

## Closure

TREE `7.1` success evidence is satisfied on the integrated candidate:

- Fast CI green;
- Browser CI green;
- bounded U.S. workload correctness/performance-smoke green with sanitized reports;
- no blocking deterministic defect;
- Fast/Browser feedback reviewed against the repository guidance, with no deterministic regression or avoidable focused+full duplication identified.
