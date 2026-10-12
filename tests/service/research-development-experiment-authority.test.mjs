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

test("TREE 11.2 Research Domain resolves immutable experiment authority before execution", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-experiment-authority-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const calls = [];
  let domain = null;

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
      executeExperimentBatch: async (input) => {
        calls.push(input);
        const request = freezeAuthoritativeExperimentBatchRequest(input);
        return Object.freeze({
          durableRequest: durableAuthoritativeExperimentRequest(request),
          metrics: metricSet(request.requestFingerprint)
        });
      }
    });

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
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});