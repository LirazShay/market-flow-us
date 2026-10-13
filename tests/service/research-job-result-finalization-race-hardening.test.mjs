import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import {
  durableAuthoritativeExperimentRequest,
  freezeAuthoritativeExperimentBatchRequest
} from "../../research-server/experiment-authority.js";

const RUN_ID = "run_91919191-9191-4191-8191-919191919191";
const OBJECTIVE_ID = "obj_91919191-9191-4191-8191-919191919191";
const QUERY_ID = "qry_91919191-9191-4191-8191-919191919191";
const INVENTORY_ID = "inv_91919191-9191-4191-8191-919191919191";
const PLAN_ID = "plan_91919191-9191-4191-8191-919191919191";
const PART_DEV = "part_91919191-9191-4191-8191-919191919191";
const PART_VALIDATION = "part_92929292-9292-4292-8292-929292929292";
const EXPERIMENT_ID = "exp_91919191-9191-4191-8191-919191919191";
const METRIC_SET_ID = "metrics_91919191-9191-4191-8191-919191919191";
const JOB_ID = "job_91919191-9191-4191-8191-919191919191";
const RESULT_HANDLE = "res_91919191-9191-4191-8191-919191919191";
const SOURCE_ID = "archive:result-finalization-race.duckdb";
const SOURCE_FINGERPRINT = "9".repeat(64);
const NOW = 1_891_000_000_000;

const RESOURCE_POLICY = Object.freeze({
  concurrency: Object.freeze({
    maxActiveJobs: 1,
    maxQueuedJobs: 2,
    maxActiveJobsPerRun: 1,
    maxAnalyticalReaders: 1,
    maxAnalyticalReadersPerRun: 1,
    maxAnalyticalReadersPerJob: 1
  }),
  budgets: Object.freeze({
    server: Object.freeze({ workUnits: 100, t0Evaluations: 1000, resultRows: 1000, resultBytes: 1_000_000 }),
    run: Object.freeze({ workUnits: 50, t0Evaluations: 500, resultRows: 500, resultBytes: 500_000 }),
    job: Object.freeze({ workUnits: 10, t0Evaluations: 100, resultRows: 100, resultBytes: 250_000 }),
    request: Object.freeze({ workUnits: 10, t0Evaluations: 100, resultRows: 100, resultBytes: 250_000 }),
    sqlAnalysis: Object.freeze({ workUnits: 5, t0Evaluations: 100, resultRows: 50, resultBytes: 100_000 })
  })
});

function completedExperimentExecution(input) {
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
      queries: Object.freeze([])
    })
  });
}

async function waitForTerminal(domain) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, JOB_ID);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Result-finalization race Job did not reach terminal state");
}

test("TREE 11.7 durable Result publication and Job cancellation cannot split terminal truth", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-result-finalization-race-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let cancellationPromise = null;
  const partitionIds = [PART_DEV, PART_VALIDATION];

  try {
    domain = await openManagedResearchDomain({
      dbPath,
      marketDataDir: "server-owned-market-data",
      now: () => NOW,
      resourcePolicy: RESOURCE_POLICY,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: () => QUERY_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: () => partitionIds.shift(),
      experimentIdFactory: () => EXPERIMENT_ID,
      metricSetIdFactory: () => METRIC_SET_ID,
      jobIdFactory: () => JOB_ID,
      resultHandleFactory: () => {
        if (cancellationPromise === null) {
          cancellationPromise = domain.cancelJob(RUN_ID, JOB_ID);
        }
        return RESULT_HANDLE;
      },
      executeExperimentBatch: async (input) => completedExperimentExecution(input),
      verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
        assert.equal(sourceId, SOURCE_ID);
        assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
        return expectedFingerprint;
      }
    });

    await domain.createResearchRun({
      userIntent: "Prove cancellation cannot split durable Result and Job terminal truth.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Result publication is the durable success boundary.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: "SELECT security_id FROM latest LIMIT 1",
      scannerContractVersion: "scanner-authority-v1",
      label: "result-finalization-race"
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: SOURCE_ID,
          sourceFingerprint: SOURCE_FINGERPRINT,
          classification: "ARCHIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "result-finalization-race-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: [SOURCE_ID] } },
        { role: "VALIDATION", partition: { sourceIds: [SOURCE_ID] } }
      ]
    });

    const submitted = await domain.submitDevelopmentExperiment({
      clientRequestId: "result-finalization-race-1",
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_DEV,
      sourceId: SOURCE_ID,
      queryArtifactIds: [QUERY_ID],
      fromAtMs: 0,
      toAtMs: 0,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 1,
      horizonsMs: [10_000]
    });
    assert.equal(submitted.jobId, JOB_ID);

    const terminal = await waitForTerminal(domain);
    assert.ok(cancellationPromise, "Result publication must trigger the deterministic cancellation race");
    const cancellation = await cancellationPromise;

    assert.equal(
      cancellation.accepted,
      false,
      "once durable Result publication begins, cancellation must no longer win the terminal race"
    );
    assert.ok(
      ["CANCELLATION_NOT_AVAILABLE", "ALREADY_TERMINAL"].includes(cancellation.reason),
      `unexpected late-cancellation reason ${cancellation.reason}`
    );
    assert.equal(
      terminal.status,
      "SUCCEEDED",
      "a published durable Result must not belong to a CANCELLED Job"
    );
    assert.equal(terminal.progress.completedUnits, 1);
    assert.equal(terminal.progress.totalUnits, 1);
    assert.deepEqual(
      terminal.progress.resultHandles.map((result) => result.resultHandle),
      [RESULT_HANDLE]
    );
    const result = await domain.getResult(RUN_ID, RESULT_HANDLE);
    assert.equal(result.sourceJobId, JOB_ID);
    assert.equal(result.resultKind, "EXPERIMENT_SUMMARY");
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});