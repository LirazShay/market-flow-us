import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchDomain } from "../../research-server/domain.js";
import {
  durableAuthoritativeExperimentRequest,
  freezeAuthoritativeExperimentBatchRequest
} from "../../research-server/experiment-authority.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const UNKNOWN_QUERY_ID = "qry_99999999-9999-4999-8999-999999999999";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";
const SOURCE_FINGERPRINT = "a".repeat(64);
const SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 1";

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

function metricSet(requestFingerprint) {
  return Object.freeze({
    contractVersion: "research-experiment-metrics-v1",
    requestFingerprint,
    denominators: Object.freeze({
      requestedPointCount: 1,
      availablePointCount: 1,
      unavailablePointCount: 0,
      pointAvailabilityRate: 1,
      distinctBaselineCount: 1,
      repeatedBaselineRequestedPointCount: 0,
      queryExecutionCount: 1
    }),
    exclusions: Object.freeze({ unavailablePointReasonBreakdown: Object.freeze({}) }),
    queries: Object.freeze([])
  });
}

function completedExecution(input) {
  const request = freezeAuthoritativeExperimentBatchRequest(input);
  const queryId = input.queryArtifacts[0].queryArtifactId;
  const requestedAtMs = request.schedule.requestedAtMsList[0];
  const point = Object.freeze({
    available: true,
    unavailableReason: null,
    sourceId: input.sourceId,
    requestedAtMs,
    baseline: Object.freeze({ cycleId: 7, committedAtMs: requestedAtMs }),
    topX: input.topX,
    horizonsMs: Object.freeze([...input.horizonsMs]),
    queries: Object.freeze([Object.freeze({
      id: queryId,
      name: "baseline",
      sql: SQL,
      sourceRowCount: 1,
      selectedSourceRowCount: 1,
      evaluatedUniqueCount: 1,
      duplicateRowCount: 0,
      items: Object.freeze([Object.freeze({
        securityId: "1001",
        returnedPosition: 1,
        baseline: Object.freeze({
          cycleId: 7,
          collectedAtMs: requestedAtMs,
          price: 100,
          symbol: "AAA",
          paperName: "Alpha",
          exchangeName: "NYSE",
          ageMs: 0,
          timingAnomaly: null
        }),
        horizons: Object.freeze([Object.freeze({
          horizonMs: 10_000,
          targetAtMs: requestedAtMs + 10_000,
          futureCycleId: 8,
          observedAtMs: requestedAtMs + 10_000,
          actualElapsedMs: 10_000,
          price: 101,
          changePercent: 1,
          outcome: "UP",
          unavailableReason: null,
          timingAnomaly: null
        })])
      })]),
      summary: Object.freeze([])
    })]),
    comparison: Object.freeze({
      unionCount: 1,
      commonCount: 1,
      exclusiveCounts: Object.freeze([0]),
      securities: Object.freeze([]),
      pairs: Object.freeze([])
    })
  });
  return Object.freeze({
    request,
    durableRequest: durableAuthoritativeExperimentRequest(request),
    metrics: metricSet(request.requestFingerprint),
    sweep: Object.freeze({
      metrics: Object.freeze({ requestedPointCount: 1 }),
      page() { return null; },
      openPoint(index) {
        if (index !== 0) throw new RangeError("point index out of range");
        return point;
      }
    })
  });
}

test("TREE 11.2 Research Domain resolves immutable authority and reconstructs drill-down after restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-experiment-authority-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const calls = [];
  const fingerprintChecks = [];
  let domain = null;

  const executeExperimentBatch = async (input) => {
    calls.push(input);
    return completedExecution(input);
  };
  const verifySourceFingerprint = async (input) => {
    fingerprintChecks.push(input);
    assert.deepEqual(input, {
      dataDir: "server-owned-market-data",
      sourceId: "active",
      expectedFingerprint: SOURCE_FINGERPRINT
    });
    return SOURCE_FINGERPRINT;
  };

  try {
    domain = await openResearchDomain({
      dbPath,
      marketDataDir: "server-owned-market-data",
      now: () => 1_860_000_000_000,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: () => QUERY_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION]),
      experimentIdFactory: () => EXPERIMENT_ID,
      metricSetIdFactory: () => METRIC_SET_ID,
      executeExperimentBatch,
      verifySourceFingerprint
    });

    assert.equal(domain.recordCompletedExperiment, undefined);

    await domain.createResearchRun({
      userIntent: "Find robust short-horizon upward momentum candidates.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer positive 60s outcomes.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [60] }
    });
    const query = await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "baseline"
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: SOURCE_FINGERPRINT,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "test-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    const experiment = await domain.executeDevelopmentExperiment({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_DEV,
      sourceId: "active",
      queryArtifactIds: [QUERY_ID],
      fromAtMs: 1_000,
      toAtMs: 1_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 1,
      horizonsMs: [10_000]
    });

    assert.equal(experiment.experimentId, EXPERIMENT_ID);
    assert.equal(experiment.metricSetId, METRIC_SET_ID);
    assert.equal(calls.length, 1);
    assert.equal(fingerprintChecks.length, 2);
    assert.equal(calls[0].dataDir, "server-owned-market-data");
    assert.equal(calls[0].phase, "DEVELOPMENT");
    assert.equal(calls[0].sourceId, "active");
    assert.equal(calls[0].sourceFingerprint, SOURCE_FINGERPRINT);
    assert.equal(calls[0].queryArtifacts.length, 1);
    assert.equal(calls[0].queryArtifacts[0].queryArtifactId, QUERY_ID);
    assert.equal(calls[0].queryArtifacts[0].sqlText, SQL);
    assert.equal(calls[0].queryArtifacts[0].sqlHash, query.sqlHash);

    await assert.rejects(
      domain.executeDevelopmentExperiment({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        partitionId: PART_DEV,
        sourceId: "archive:market-flow-us-unauthorized.duckdb",
        queryArtifactIds: [QUERY_ID],
        fromAtMs: 1_000,
        toAtMs: 1_000,
        intervalValue: 1,
        intervalUnit: "seconds",
        topX: 1,
        horizonsMs: [10_000]
      }),
      /source is not authorized by the Development partition/u
    );
    assert.equal(calls.length, 1);

    await assert.rejects(
      domain.executeDevelopmentExperiment({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        partitionId: PART_DEV,
        sourceId: "active",
        sourceFingerprint: "b".repeat(64),
        queryArtifactIds: [QUERY_ID],
        fromAtMs: 1_000,
        toAtMs: 1_000,
        intervalValue: 1,
        intervalUnit: "seconds",
        topX: 1,
        horizonsMs: [10_000]
      }),
      /sourceFingerprint is server-owned experiment authority/u
    );
    assert.equal(calls.length, 1);

    await assert.rejects(
      domain.executeDevelopmentExperiment({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        partitionId: PART_DEV,
        sourceId: "active",
        queryArtifactIds: [UNKNOWN_QUERY_ID],
        fromAtMs: 1_000,
        toAtMs: 1_000,
        intervalValue: 1,
        intervalUnit: "seconds",
        topX: 1,
        horizonsMs: [10_000]
      }),
      /Query Artifact was not found in this Research Run/u
    );
    assert.equal(calls.length, 1);

    await assert.rejects(
      domain.executeDevelopmentExperiment({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        partitionId: PART_VALIDATION,
        sourceId: "active",
        queryArtifactIds: [QUERY_ID],
        fromAtMs: 1_000,
        toAtMs: 1_000,
        intervalValue: 1,
        intervalUnit: "seconds",
        topX: 1,
        horizonsMs: [10_000]
      }),
      /Only DEVELOPMENT experiments are authorized/u
    );
    assert.equal(calls.length, 1);

    await domain.close();
    domain = null;

    domain = await openResearchDomain({
      dbPath,
      marketDataDir: "server-owned-market-data",
      now: () => 1_860_000_010_000,
      executeExperimentBatch,
      verifySourceFingerprint
    });

    assert.equal(domain.recordCompletedExperiment, undefined);
    const summary = await domain.getExperimentSummary(RUN_ID, EXPERIMENT_ID);
    assert.equal(summary.experimentId, EXPERIMENT_ID);
    assert.equal(summary.metricSetId, METRIC_SET_ID);
    assert.equal(summary.requestFingerprint, experiment.requestFingerprint);
    assert.deepEqual(summary.warnings, []);
    assert.equal(calls.length, 1, "summary must use durable metrics without replaying the Sweep");

    const points = await domain.getExperimentPoints(RUN_ID, EXPERIMENT_ID, { limit: 1 });
    assert.equal(points.totalCount, 1);
    assert.equal(points.items[0].available, true);
    assert.match(points.items[0].pointRef, /^pt_0_[0-9a-f]{16}$/u);

    const candidates = await domain.getExperimentCandidates(RUN_ID, EXPERIMENT_ID, {
      pointRef: points.items[0].pointRef,
      queryArtifactId: QUERY_ID,
      limit: 1
    });
    assert.equal(candidates.totalCount, 1);
    assert.equal(candidates.items[0].securityId, "1001");
    assert.match(candidates.items[0].candidateRef, /^cand_0_0_0_[0-9a-f]{16}$/u);

    const returned = await domain.diagnoseReturnedCandidate(RUN_ID, EXPERIMENT_ID, {
      candidateRef: candidates.items[0].candidateRef
    });
    assert.equal(returned.diagnosis, "RETURNED_BY_ORIGINAL_SCANNER_QUERY");
    assert.equal(returned.semanticRankClaim, false);

    const missing = await domain.diagnoseMissingCandidate(RUN_ID, EXPERIMENT_ID, {
      pointRef: points.items[0].pointRef,
      queryArtifactId: QUERY_ID,
      securityId: "9999"
    });
    assert.equal(missing.diagnosis, "NOT_RETURNED_BY_ORIGINAL_SCANNER_QUERY");
    assert.equal(missing.originalQueryRewritten, false);
    assert.ok(calls.length >= 5, "detailed reads reconstruct from durable truth after restart");
    assert.equal(fingerprintChecks.length, calls.length * 2);
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
