import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthoritativeExperimentMetrics } from "../../research-server/experiment-authority.js";

const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function outcome({ horizonMs = 10_000, state, changePercent = null, unavailableReason = null }) {
  return Object.freeze({
    horizonMs,
    outcome: state,
    changePercent,
    unavailableReason
  });
}

function item(securityId, returnedPosition, horizon) {
  return Object.freeze({
    securityId,
    returnedPosition,
    horizons: Object.freeze([horizon])
  });
}

function availablePoint(requestedAtMs, cycleId, items) {
  return Object.freeze({
    available: true,
    unavailableReason: null,
    requestedAtMs,
    baseline: Object.freeze({ cycleId, committedAtMs: requestedAtMs }),
    queries: Object.freeze([Object.freeze({
      id: QUERY_ID,
      sourceRowCount: items.length,
      selectedSourceRowCount: items.length,
      evaluatedUniqueCount: items.length,
      duplicateRowCount: 0,
      items: Object.freeze(items)
    })])
  });
}

test("TREE 11.2 robustness metrics expose deterministic UTC, concentration and returned-position breakdowns", () => {
  const requestedAtMsList = Object.freeze([
    0,
    HOUR_MS,
    DAY_MS + HOUR_MS,
    DAY_MS + 2 * HOUR_MS
  ]);
  const points = Object.freeze([
    Object.freeze({
      available: false,
      unavailableReason: "NO_BASELINE",
      requestedAtMs: 0,
      baseline: null,
      queries: Object.freeze([])
    }),
    availablePoint(HOUR_MS, 1, [
      item("A", 1, outcome({ state: "UP", changePercent: 10 })),
      item("B", 2, outcome({ state: "DOWN", changePercent: -5 }))
    ]),
    availablePoint(DAY_MS + HOUR_MS, 2, []),
    availablePoint(DAY_MS + 2 * HOUR_MS, 3, [
      item("A", 1, outcome({ state: "UNAVAILABLE", unavailableReason: "NO_FUTURE_OBSERVATION" })),
      item("C", 3, outcome({ state: "FLAT", changePercent: 0 }))
    ])
  ]);
  const request = Object.freeze({
    requestFingerprint: "a".repeat(64),
    queryArtifacts: Object.freeze([Object.freeze({ queryArtifactId: QUERY_ID })]),
    schedule: Object.freeze({
      requestedAtMsList,
      topX: 3,
      horizonsMs: Object.freeze([10_000])
    }),
    backtestRequest: Object.freeze({
      sourceId: "active",
      requestedAtMsList,
      topX: 3,
      horizonsMs: Object.freeze([10_000])
    })
  });
  const sweep = Object.freeze({
    request: Object.freeze({
      sourceId: "active",
      requestedAtMsList,
      topX: 3,
      horizonsMs: Object.freeze([10_000])
    }),
    metrics: Object.freeze({
      requestedPointCount: 4,
      availablePointCount: 3,
      unavailablePointCount: 1,
      distinctBaselineCount: 3,
      queryExecutionCount: 3
    }),
    openPoint(index) {
      return points[index];
    }
  });

  const metrics = buildAuthoritativeExperimentMetrics({ request, sweep });
  assert.equal(Object.isFrozen(metrics), true);
  assert.deepEqual(metrics.timeBreakdowns, {
    timezone: "UTC",
    days: [
      {
        utcDayStartAtMs: 0,
        requestedPointCount: 2,
        availablePointCount: 1,
        unavailablePointCount: 1,
        pointAvailabilityRate: 0.5,
        distinctBaselineCount: 1,
        unavailableReasonBreakdown: { NO_BASELINE: 1 }
      },
      {
        utcDayStartAtMs: DAY_MS,
        requestedPointCount: 2,
        availablePointCount: 2,
        unavailablePointCount: 0,
        pointAvailabilityRate: 1,
        distinctBaselineCount: 2,
        unavailableReasonBreakdown: {}
      }
    ],
    hoursOfDay: [
      {
        utcHourOfDay: 0,
        requestedPointCount: 1,
        availablePointCount: 0,
        unavailablePointCount: 1,
        pointAvailabilityRate: 0,
        distinctBaselineCount: 0,
        unavailableReasonBreakdown: { NO_BASELINE: 1 }
      },
      {
        utcHourOfDay: 1,
        requestedPointCount: 2,
        availablePointCount: 2,
        unavailablePointCount: 0,
        pointAvailabilityRate: 1,
        distinctBaselineCount: 2,
        unavailableReasonBreakdown: {}
      },
      {
        utcHourOfDay: 2,
        requestedPointCount: 1,
        availablePointCount: 1,
        unavailablePointCount: 0,
        pointAvailabilityRate: 1,
        distinctBaselineCount: 1,
        unavailableReasonBreakdown: {}
      }
    ]
  });

  const query = metrics.queries[0];
  assert.deepEqual(query.robustness.selectionConcentration, {
    selectedObservationCount: 4,
    distinctSecurityCount: 3,
    repeatedSelectionObservationCount: 1,
    maxSecurityObservationCount: 2,
    maxSecurityShare: 0.5,
    topSecurities: [
      { securityId: "A", count: 2, share: 0.5 },
      { securityId: "B", count: 1, share: 0.25 },
      { securityId: "C", count: 1, share: 0.25 }
    ]
  });
  assert.equal(query.robustness.positionSemantics, "SCANNER_RETURNED_POSITION_ONLY");
  assert.deepEqual(
    query.robustness.returnedPositionBreakdown.map((entry) => ({
      returnedPosition: entry.returnedPosition,
      selectedObservationCount: entry.selectedObservationCount,
      distinctSecurityCount: entry.distinctSecurityCount,
      availableOutcomeCount: entry.horizons[0].availableOutcomeCount,
      unavailableOutcomeCount: entry.horizons[0].unavailableOutcomeCount,
      positiveRate: entry.horizons[0].positiveRate,
      negativeRate: entry.horizons[0].negativeRate,
      flatRate: entry.horizons[0].flatRate
    })),
    [
      {
        returnedPosition: 1,
        selectedObservationCount: 2,
        distinctSecurityCount: 1,
        availableOutcomeCount: 1,
        unavailableOutcomeCount: 1,
        positiveRate: 1,
        negativeRate: 0,
        flatRate: 0
      },
      {
        returnedPosition: 2,
        selectedObservationCount: 1,
        distinctSecurityCount: 1,
        availableOutcomeCount: 1,
        unavailableOutcomeCount: 0,
        positiveRate: 0,
        negativeRate: 1,
        flatRate: 0
      },
      {
        returnedPosition: 3,
        selectedObservationCount: 1,
        distinctSecurityCount: 1,
        availableOutcomeCount: 1,
        unavailableOutcomeCount: 0,
        positiveRate: 0,
        negativeRate: 0,
        flatRate: 1
      }
    ]
  );

  assert.deepEqual(
    query.robustness.utcDayBreakdown.map((entry) => ({
      utcDayStartAtMs: entry.utcDayStartAtMs,
      pointCount: entry.pointCount,
      zeroResultPointCount: entry.zeroResultPointCount,
      selectedObservationCount: entry.selectedObservationCount,
      distinctSecurityCount: entry.distinctSecurityCount
    })),
    [
      { utcDayStartAtMs: 0, pointCount: 1, zeroResultPointCount: 0, selectedObservationCount: 2, distinctSecurityCount: 2 },
      { utcDayStartAtMs: DAY_MS, pointCount: 2, zeroResultPointCount: 1, selectedObservationCount: 2, distinctSecurityCount: 2 }
    ]
  );
  assert.deepEqual(
    query.robustness.utcHourOfDayBreakdown.map((entry) => ({
      utcHourOfDay: entry.utcHourOfDay,
      pointCount: entry.pointCount,
      zeroResultPointCount: entry.zeroResultPointCount,
      selectedObservationCount: entry.selectedObservationCount
    })),
    [
      { utcHourOfDay: 1, pointCount: 2, zeroResultPointCount: 1, selectedObservationCount: 2 },
      { utcHourOfDay: 2, pointCount: 1, zeroResultPointCount: 0, selectedObservationCount: 2 }
    ]
  );
});
