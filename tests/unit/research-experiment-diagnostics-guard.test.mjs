import assert from "node:assert/strict";
import test from "node:test";

import { createAuthoritativeExperimentDiagnostics } from "../../research-server/experiment-diagnostics.js";

const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const FOREIGN_QUERY_ID = "qry_22222222-2222-4222-8222-222222222222";
const FINGERPRINT = "a".repeat(64);

function unavailableExecution() {
  const point = Object.freeze({
    available: false,
    unavailableReason: "NO_BASELINE",
    sourceId: "active",
    requestedAtMs: 1_000,
    baseline: null,
    topX: 10,
    horizonsMs: Object.freeze([10_000]),
    queries: Object.freeze([])
  });
  const request = Object.freeze({
    researchRunId: "run_11111111-1111-4111-8111-111111111111",
    objectiveVersionId: "obj_11111111-1111-4111-8111-111111111111",
    evidencePartitionId: "part_11111111-1111-4111-8111-111111111111",
    phase: "DEVELOPMENT",
    requestFingerprint: FINGERPRINT,
    source: Object.freeze({ sourceId: "active", sourceFingerprint: "f".repeat(64) }),
    queryArtifacts: Object.freeze([Object.freeze({
      queryArtifactId: QUERY_ID,
      sqlHash: "e".repeat(64),
      scannerContractVersion: "scanner-authority-v1"
    })]),
    schedule: Object.freeze({
      requestedAtMsList: Object.freeze([1_000]),
      topX: 10,
      horizonsMs: Object.freeze([10_000])
    })
  });
  return Object.freeze({
    request,
    durableRequest: request,
    metrics: Object.freeze({
      requestFingerprint: FINGERPRINT,
      denominators: Object.freeze({
        requestedPointCount: 1,
        availablePointCount: 0,
        unavailablePointCount: 1,
        repeatedBaselineRequestedPointCount: 0
      }),
      exclusions: Object.freeze({ unavailablePointReasonBreakdown: Object.freeze({ NO_BASELINE: 1 }) }),
      queries: Object.freeze([])
    }),
    sweep: Object.freeze({
      metrics: Object.freeze({ requestedPointCount: 1 }),
      page() { return null; },
      openPoint() { return point; }
    })
  });
}

test("TREE 11.2 unavailable points still reject foreign Query Artifact references", () => {
  const diagnostics = createAuthoritativeExperimentDiagnostics({
    experimentId: "exp_11111111-1111-4111-8111-111111111111",
    execution: unavailableExecution()
  });
  const pointRef = diagnostics.getPoints({ limit: 1 }).items[0].pointRef;

  assert.throws(
    () => diagnostics.getCandidates({ pointRef, queryArtifactId: FOREIGN_QUERY_ID }),
    /not part of this Experiment/u
  );
  assert.throws(
    () => diagnostics.diagnoseMissingCandidate({
      pointRef,
      queryArtifactId: FOREIGN_QUERY_ID,
      securityId: "1001"
    }),
    /not part of this Experiment/u
  );

  const legitimate = diagnostics.diagnoseMissingCandidate({
    pointRef,
    queryArtifactId: QUERY_ID,
    securityId: "1001"
  });
  assert.equal(legitimate.diagnosis, "POINT_UNAVAILABLE");
});
