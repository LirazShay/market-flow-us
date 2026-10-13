import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DuckDBInstance } from "@duckdb/node-api";
import { openResearchDomain } from "../../research-server/domain.js";
import {
  durableAuthoritativeExperimentRequest,
  freezeAuthoritativeExperimentBatchRequest
} from "../../research-server/experiment-authority.js";

const RUN_ID = "run_51515151-5151-4151-8151-515151515151";
const OBJECTIVE_ID = "obj_51515151-5151-4151-8151-515151515151";
const QUERY_ID = "qry_51515151-5151-4151-8151-515151515151";
const INVENTORY_ID = "inv_51515151-5151-4151-8151-515151515151";
const PLAN_ID = "plan_51515151-5151-4151-8151-515151515151";
const PART_DEV = "part_51515151-5151-4151-8151-515151515151";
const PART_VALIDATION = "part_52525252-5252-4252-8252-525252525252";
const PART_HOLDOUT = "part_53535353-5353-4353-8353-535353535353";
const VALIDATION_EXPERIMENT_ID = "exp_51515151-5151-4151-8151-515151515151";
const VALIDATION_METRIC_SET_ID = "metrics_51515151-5151-4151-8151-515151515151";
const EXPOSURE_ID = "vexp_51515151-5151-4151-8151-515151515151";
const FINALIST_ID = "finalist_51515151-5151-4151-8151-515151515151";
const HOLDOUT_ID = "holdout_51515151-5151-4151-8151-515151515151";
const SOURCE_ID = "archive:holdout-restart-hardening.duckdb";
const SOURCE_FINGERPRINT = "5".repeat(64);
const FINALIST_SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 3";
const NOW = 1_951_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

function completedExecution(input) {
  const request = freezeAuthoritativeExperimentBatchRequest(input);
  const durableRequest = durableAuthoritativeExperimentRequest(request);
  return Object.freeze({
    durableRequest,
    metrics: Object.freeze({
      contractVersion: "research-experiment-metrics-v1",
      requestFingerprint: durableRequest.requestFingerprint,
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
      queries: Object.freeze([Object.freeze({
        queryArtifactId: QUERY_ID,
        zeroResultPointCount: 0,
        horizons: Object.freeze([])
      })])
    })
  });
}

function evaluationProfile() {
  return {
    selectionPolicy: "TOP_N",
    topX: 3,
    horizonsMs: [10_000, 60_000],
    intervalValue: 1,
    intervalUnit: "seconds",
    metricProfile: {
      contractVersion: "research-experiment-metrics-v1",
      primaryMetric: "positiveRate"
    }
  };
}

function commonOptions(dbPath) {
  return {
    dbPath,
    marketDataDir: "server-owned-market-data",
    now: (() => {
      let value = NOW;
      return () => value++;
    })(),
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID,
    queryArtifactIdFactory: () => QUERY_ID,
    evidenceInventoryIdFactory: () => INVENTORY_ID,
    evidencePlanIdFactory: () => PLAN_ID,
    partitionIdFactory: sequence([PART_DEV, PART_VALIDATION, PART_HOLDOUT]),
    experimentIdFactory: () => VALIDATION_EXPERIMENT_ID,
    metricSetIdFactory: () => VALIDATION_METRIC_SET_ID,
    validationExposureIdFactory: () => EXPOSURE_ID,
    finalistSetIdFactory: () => FINALIST_ID,
    holdoutEvaluationIdFactory: () => HOLDOUT_ID
  };
}

async function seedFinalist(domain) {
  await domain.createResearchRun({
    userIntent: "Prove sealed Holdout consumption survives a crash boundary.",
    budgetPolicy: { maxExperiments: 40 },
    environmentSnapshot: { productVersion: "0.1.0" }
  });
  await domain.createObjectiveVersion({
    researchRunId: RUN_ID,
    interpretationText: "Prefer robust positive short-horizon outcomes.",
    objective: { targetDirection: "UP", primaryHorizonsSec: [10, 60] }
  });
  await domain.createQueryArtifact({
    researchRunId: RUN_ID,
    sqlText: FINALIST_SQL,
    scannerContractVersion: "scanner-authority-v1",
    label: "restart-safe finalist"
  });
  await domain.createEvidenceInventory({
    researchRunId: RUN_ID,
    inventory: {
      sources: [{
        sourceId: SOURCE_ID,
        sourceFingerprint: SOURCE_FINGERPRINT,
        classification: "ARCHIVE",
        schemaVersion: 4,
        firstCompleteAtMs: 0,
        lastCompleteAtMs: 1_000_000
      }]
    }
  });
  const proposal = await domain.proposeEvidencePlan({
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    evidenceInventoryId: INVENTORY_ID,
    evaluationProfile: evaluationProfile()
  });
  await domain.commitEvidencePlan({
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    evidenceInventoryId: INVENTORY_ID,
    proposal
  });

  const validationSchedule = proposal.partitions[1].partition.validationSchedule.sources[0];
  await domain.executeValidationExperiment({
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    partitionId: PART_VALIDATION,
    sourceId: SOURCE_ID,
    queryArtifactIds: [QUERY_ID],
    fromAtMs: validationSchedule.fromAtMs,
    toAtMs: validationSchedule.toAtMs,
    intervalValue: validationSchedule.intervalValue,
    intervalUnit: validationSchedule.intervalUnit,
    topX: 3,
    horizonsMs: [10_000, 60_000]
  });
  await domain.createFinalistSet({
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    queryArtifactIds: [QUERY_ID],
    evaluationProfile: evaluationProfile(),
    justification: "Freeze exact Validation-supported authority before Holdout."
  });
}

test("TREE 11.7 a crash after sealed Holdout compute cannot consume the same Finalist again after restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-holdout-restart-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let holdoutExecutionCount = 0;

  try {
    let failAfterHoldoutCompute = false;
    domain = await openResearchDomain({
      ...commonOptions(dbPath),
      executeExperimentBatch: async (input) => {
        if (input.evidencePartitionId === PART_HOLDOUT) {
          holdoutExecutionCount += 1;
          failAfterHoldoutCompute = true;
        }
        return completedExecution(input);
      },
      verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
        assert.equal(sourceId, SOURCE_ID);
        assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
        if (failAfterHoldoutCompute) {
          failAfterHoldoutCompute = false;
          const error = new Error("injected failure after sealed Holdout compute");
          error.code = "TEST_POST_HOLDOUT_FAULT";
          throw error;
        }
        return expectedFingerprint;
      }
    });

    await seedFinalist(domain);

    await assert.rejects(
      domain.executeHoldoutEvaluation({ researchRunId: RUN_ID, finalistSetId: FINALIST_ID }),
      (error) => error?.code === "TEST_POST_HOLDOUT_FAULT"
    );
    assert.equal(holdoutExecutionCount, 1, "the first attempt reached sealed Holdout exactly once");

    await assert.rejects(
      domain.executeHoldoutEvaluation({ researchRunId: RUN_ID, finalistSetId: FINALIST_ID }),
      (error) => error?.code === "RESEARCH_INTEGRITY_ERROR"
    );
    assert.equal(holdoutExecutionCount, 1, "same-process retry must not consume sealed Holdout again");

    await domain.close();
    domain = null;

    domain = await openResearchDomain({
      ...commonOptions(dbPath),
      executeExperimentBatch: async (input) => {
        if (input.evidencePartitionId === PART_HOLDOUT) holdoutExecutionCount += 1;
        return completedExecution(input);
      },
      verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
        assert.equal(sourceId, SOURCE_ID);
        assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
        return expectedFingerprint;
      }
    });

    await assert.rejects(
      domain.executeHoldoutEvaluation({ researchRunId: RUN_ID, finalistSetId: FINALIST_ID }),
      (error) => error?.code === "RESEARCH_INTEGRITY_ERROR"
    );
    assert.equal(holdoutExecutionCount, 1, "restart must preserve the consumed/uncertain Holdout boundary");
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.7 Holdout schema v1 migrates to v2 without losing existing Research authority", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-holdout-migration-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let instance = null;
  let connection = null;

  try {
    domain = await openResearchDomain(commonOptions(dbPath));
    await domain.createResearchRun({
      userIntent: "Preserve durable authority across Holdout schema migration.",
      budgetPolicy: { maxExperiments: 40 },
      environmentSnapshot: { productVersion: "0.1.0" }
    });
    await domain.close();
    domain = null;

    instance = await DuckDBInstance.create(dbPath);
    connection = await instance.connect();
    await connection.run("DROP TABLE holdout_execution_claims");
    await connection.run("UPDATE research_holdout_info SET schema_version = 1");
    connection.closeSync();
    connection = null;
    instance.closeSync();
    instance = null;

    domain = await openResearchDomain(commonOptions(dbPath));
    assert.equal((await domain.getResearchRun(RUN_ID)).researchRunId, RUN_ID);
    await domain.close();
    domain = null;

    instance = await DuckDBInstance.create(dbPath);
    connection = await instance.connect();
    const versionReader = await connection.runAndReadAll(
      "SELECT schema_version FROM research_holdout_info"
    );
    const versionRows = versionReader.getRowObjects();
    assert.equal(versionRows.length, 1);
    assert.equal(Number(versionRows[0].schema_version), 2);

    const tableReader = await connection.runAndReadAll(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'main' AND table_name = 'holdout_execution_claims'`
    );
    assert.equal(tableReader.getRowObjects().length, 1);
  } finally {
    if (connection) connection.closeSync();
    if (instance) instance.closeSync();
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
