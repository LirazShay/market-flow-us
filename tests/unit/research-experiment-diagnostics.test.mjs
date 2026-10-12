import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthoritativeExperimentDiagnostics,
  RESEARCH_EXPERIMENT_DIAGNOSTICS_PAGE_LIMIT
} from "../../research-server/experiment-diagnostics.js";

const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const REQUEST_FINGERPRINT = "a".repeat(64);

function availablePoint({
  requestedAtMs,
  sourceRowCount,
  selectedSourceRowCount,
  items,
  duplicateRowCount = 0,
  topX = 1
}) {
  return Object.freeze({
    available: true,
    unavailableReason: null,
    sourceId: "archive:2026-10-01",
    requestedAtMs,
    baseline: Object.freeze({ cycleId: 7, committedAtMs: 1_900 }),
    topX,
    horizonsMs: Object.freeze([10_000]),
    queries: Object.freeze([Object.freeze({
      id: QUERY_ID,
      name: "Candidate",
      sql: "SELECT security_id FROM latest ORDER BY Price DESC",
      sourceRowCount,
      selectedSourceRowCount,
      evaluatedUniqueCount: items.length,
      duplicateRowCount,
      items: Object.freeze(items),
      summary: Object.freeze([Object.freeze({
        horizonMs: 10_000,
        availableCount: items.length,
        unavailableCount: 0,
        averagePercent: -10,
        medianPercent: -10,
        positiveCount: 0,
        positiveRate: 0,
        bestPercent: -10,
        worstPercent: -10
      })])
    })]),
    comparison: Object.freeze({
      unionCount: items.length,
      commonCount: items.length,
      exclusiveCounts: Object.freeze([0]),
      securities: Object.freeze([]),
      pairs: Object.freeze([])
    })
  });
}

function candidate(securityId, returnedPosition) {
  return Object.freeze({
    returnedPosition,
    securityId,
    baseline: Object.freeze({
      cycleId: 7,
      collectedAtMs: 1_850,
      price: 200,
      symbol: "AAA",
      paperName: "Alpha",
      exchangeName: "NYSE",
      ageMs: 150,
      timingAnomaly: null
    }),
    horizons: Object.freeze([Object.freeze({
      horizonMs: 10_000,
      targetAtMs: 12_000,
      futureCycleId: 8,
      observedAtMs: 12_050,
      actualElapsedMs: 10_050,
      price: 180,
      changePercent: -10,
      outcome: "DOWN",
      unavailableReason: null,
      timingAnomaly: null
    })])
  });
}

function execution(phase = "DEVELOPMENT") {
  const points = Object.freeze([
    Object.freeze({
      available: false,
      unavailableReason: "NO_BASELINE",
      sourceId: "archive:2026-10-01",
      requestedAtMs: 1_000,
      baseline: null,
      topX: 1,
      horizonsMs: Object.freeze([10_000]),
      queries: Object.freeze([])
    }),
    availablePoint({
      requestedAtMs: 2_000,
      sourceRowCount: 2,
      selectedSourceRowCount: 1,
      items: [candidate("2002", 1)],
      topX: 1
    }),
    availablePoint({
      requestedAtMs: 3_000,
      sourceRowCount: 2,
      selectedSourceRowCount: 2,
      items: [candidate("2002", 1)],
      duplicateRowCount: 1,
      topX: 2
    })
  ]);
  const request = Object.freeze({
    researchRunId: "run_11111111-1111-4111-8111-111111111111",
    objectiveVersionId: "obj_11111111-1111-4111-8111-111111111111",
    evidencePartitionId: "part_11111111-1111-4111-8111-111111111111",
    phase,
    requestFingerprint: REQUEST_FINGERPRINT,
    source: Object.freeze({
      sourceId: "archive:2026-10-01",
      sourceFingerprint: "f".repeat(64)
    }),
    queryArtifacts: Object.freeze([Object.freeze({
      queryArtifactId: QUERY_ID,
      sqlHash: "e".repeat(64),
      scannerContractVersion: "scanner-authority-v1"
    })]),
    schedule: Object.freeze({
      requestedAtMsList: Object.freeze([1_000, 2_000, 3_000]),
      topX: 1,
      horizonsMs: Object.freeze([10_000])
    })
  });
  const metrics = Object.freeze({
    requestFingerprint: REQUEST_FINGERPRINT,
    denominators: Object.freeze({
      requestedPointCount: 3,
      availablePointCount: 2,
      unavailablePointCount: 1,
      repeatedBaselineRequestedPointCount: 1
    }),
    exclusions: Object.freeze({ unavailablePointReasonBreakdown: Object.freeze({ NO_BASELINE: 1 }) }),
    queries: Object.freeze([Object.freeze({ queryArtifactId: QUERY_ID, zeroResultPointCount: 0 })])
  });
  return Object.freeze({
    request,
    durableRequest: request,
    metrics,
    sweep: Object.freeze({
      metrics: Object.freeze({ requestedPointCount: 3 }),
      page() {
        throw new Error("diagnostics must use bounded direct point access, not an untrusted page shape");
      },
      openPoint(index) {
        return points[index];
      }
    })
  });
}

test("TREE 11.2 typed diagnostics expose stable bounded refs without inventing Scanner rank semantics", () => {
  const diagnostics = createAuthoritativeExperimentDiagnostics({
    experimentId: EXPERIMENT_ID,
    metricSetId: METRIC_SET_ID,
    execution: execution()
  });

  const summary = diagnostics.getSummary();
  assert.equal(summary.experimentId, EXPERIMENT_ID);
  assert.equal(summary.metricSetId, METRIC_SET_ID);
  assert.deepEqual(summary.warnings, ["UNAVAILABLE_POINTS", "REPEATED_BASELINES"]);

  const page = diagnostics.getPoints({ offset: 0, limit: 3 });
  assert.equal(page.totalCount, 3);
  assert.equal(page.items[0].available, false);
  assert.equal(page.items[1].available, true);
  assert.match(page.items[1].pointRef, /^pt_1_[0-9a-f]{16}$/u);
  assert.equal(
    diagnostics.getPoints({ offset: 1, limit: 1 }).items[0].pointRef,
    page.items[1].pointRef
  );

  const candidates = diagnostics.getCandidates({
    pointRef: page.items[1].pointRef,
    queryArtifactId: QUERY_ID,
    offset: 0,
    limit: 10
  });
  assert.equal(candidates.totalCount, 1);
  assert.equal(candidates.items[0].securityId, "2002");
  assert.equal(candidates.items[0].returnedPosition, 1);
  assert.match(candidates.items[0].candidateRef, /^cand_1_0_0_[0-9a-f]{16}$/u);

  const returned = diagnostics.diagnoseReturnedCandidate({
    candidateRef: candidates.items[0].candidateRef
  });
  assert.equal(returned.diagnosis, "RETURNED_BY_ORIGINAL_SCANNER_QUERY");
  assert.equal(returned.semanticRankClaim, false);
  assert.equal(returned.positionSemantics, "SCANNER_RETURNED_POSITION_ONLY");
  assert.equal(returned.candidate.baseline.price, 200);
  assert.equal(returned.candidate.horizons[0].futureCycleId, 8);
  assert.equal(returned.exactEvidenceRefs.sourceFingerprint, "f".repeat(64));

  const ambiguous = diagnostics.diagnoseMissingCandidate({
    pointRef: page.items[1].pointRef,
    queryArtifactId: QUERY_ID,
    securityId: "1001"
  });
  assert.equal(ambiguous.diagnosis, "NOT_SELECTED_BELOW_TOP_X_OR_FILTERED_UNKNOWN");
  assert.equal(ambiguous.originalQueryRewritten, false);
  assert.equal(ambiguous.queryBoundary.completeOriginalResultObserved, false);
  assert.equal(ambiguous.baselineMembership, "NOT_INSPECTED");

  const exactMissing = diagnostics.diagnoseMissingCandidate({
    pointRef: page.items[2].pointRef,
    queryArtifactId: QUERY_ID,
    securityId: "1001"
  });
  assert.equal(exactMissing.diagnosis, "NOT_RETURNED_BY_ORIGINAL_SCANNER_QUERY");
  assert.equal(exactMissing.queryBoundary.completeOriginalResultObserved, true);
  assert.equal(exactMissing.originalQueryRewritten, false);

  const unavailable = diagnostics.diagnoseMissingCandidate({
    pointRef: page.items[0].pointRef,
    queryArtifactId: QUERY_ID,
    securityId: "1001"
  });
  assert.equal(unavailable.diagnosis, "POINT_UNAVAILABLE");
  assert.equal(unavailable.unavailableReason, "NO_BASELINE");

  assert.throws(
    () => diagnostics.getPoints({ limit: RESEARCH_EXPERIMENT_DIAGNOSTICS_PAGE_LIMIT + 1 }),
    /diagnostic page/u
  );
  assert.throws(
    () => diagnostics.diagnoseReturnedCandidate({
      candidateRef: candidates.items[0].candidateRef.replace(/[0-9a-f]$/u, "0")
    }),
    /does not belong|invalid/u
  );
});

test("TREE 11.2 candidate-level diagnostics fail closed outside Development", () => {
  const diagnostics = createAuthoritativeExperimentDiagnostics({
    experimentId: EXPERIMENT_ID,
    execution: execution("VALIDATION")
  });
  const pointRef = diagnostics.getPoints({ offset: 1, limit: 1 }).items[0].pointRef;

  assert.equal(diagnostics.getSummary().phase, "VALIDATION");
  assert.throws(
    () => diagnostics.getCandidates({ pointRef, queryArtifactId: QUERY_ID }),
    /only for DEVELOPMENT/u
  );
  assert.throws(
    () => diagnostics.diagnoseMissingCandidate({
      pointRef,
      queryArtifactId: QUERY_ID,
      securityId: "1001"
    }),
    /only for DEVELOPMENT/u
  );
});
