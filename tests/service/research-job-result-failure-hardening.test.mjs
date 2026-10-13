import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchJobLedger as openCoreResearchJobLedger } from "../../research-server/job-ledger-core.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchResultLedger } from "../../research-server/result-ledger.js";

const RUN_ID = "run_61616161-6161-4161-8161-616161616161";
const JOB_ID = "job_61616161-6161-4161-8161-616161616161";
const RESULT_HANDLE = "res_61616161-6161-4161-8161-616161616161";

async function createRun(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => 1_893_000_000_000,
    idFactory: () => RUN_ID
  });
  try {
    await ledger.createResearchRun({
      userIntent: "Prove non-successful Jobs cannot retain previously published provisional Results."
    });
  } finally {
    await ledger.close();
  }
}

async function createRunningJobWithResult(dbPath, clientRequestId) {
  let jobs = await openResearchJobLedger({
    dbPath,
    now: () => 1_893_000_001_000,
    jobIdFactory: () => JOB_ID
  });
  try {
    await jobs.createJob({
      researchRunId: RUN_ID,
      operation: "research_sql",
      clientRequestId,
      intent: { partitionId: "part_failure_hardening", sqlHash: "c".repeat(64) }
    });
    await jobs.markJobRunning(RUN_ID, JOB_ID);
  } finally {
    await jobs.close();
  }

  const results = await openResearchResultLedger({
    dbPath,
    now: () => 1_893_000_002_000,
    resultHandleFactory: () => RESULT_HANDLE
  });
  try {
    await results.createResult({
      researchRunId: RUN_ID,
      sourceJobId: JOB_ID,
      resultKind: "RESEARCH_SQL_RESULT",
      columns: [{ name: "value", type: "INTEGER", nullable: false }],
      rows: [{ value: 1 }],
      provenance: { partitionId: "part_failure_hardening" }
    });
    assert.equal((await results.getResult(RUN_ID, RESULT_HANDLE)).sourceJobId, JOB_ID);
  } finally {
    await results.close();
  }
}

async function assertResultMissing(dbPath, nowValue) {
  const results = await openResearchResultLedger({
    dbPath,
    now: () => nowValue,
    resultHandleFactory: () => {
      throw new Error("non-success Result read must not allocate a Result Handle");
    }
  });
  try {
    assert.equal(
      await results.getResult(RUN_ID, RESULT_HANDLE),
      null,
      "a Result whose owning Job is non-successful must not remain authoritative or readable"
    );
  } finally {
    await results.close();
  }
}

async function withFixture(prefix, operation) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  try {
    await createRun(dbPath);
    await operation(dbPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("TREE 11.7 FAILED Job terminalization removes a previously published provisional Result", async () => {
  await withFixture("market-flow-us-result-failure-hardening-", async (dbPath) => {
    await createRunningJobWithResult(dbPath, "published-result-then-failed");

    const jobs = await openResearchJobLedger({
      dbPath,
      reconcileInterrupted: false,
      now: () => 1_893_000_003_000,
      jobIdFactory: () => {
        throw new Error("failure terminalization must not allocate a Job ID");
      }
    });
    try {
      const failed = await jobs.markJobFailed(RUN_ID, JOB_ID, "RESEARCH_JOB_FAILED");
      assert.equal(failed.status, "FAILED");
    } finally {
      await jobs.close();
    }

    await assertResultMissing(dbPath, 1_893_000_004_000);
  });
});

test("TREE 11.7 CANCELLED Job terminalization removes any provisional Result defensively", async () => {
  await withFixture("market-flow-us-result-cancel-hardening-", async (dbPath) => {
    await createRunningJobWithResult(dbPath, "published-result-then-cancelled");

    const jobs = await openResearchJobLedger({
      dbPath,
      reconcileInterrupted: false,
      now: () => 1_893_000_005_000,
      jobIdFactory: () => {
        throw new Error("cancel terminalization must not allocate a Job ID");
      }
    });
    try {
      const cancelled = await jobs.finalizeJobCancelled(RUN_ID, JOB_ID);
      assert.equal(cancelled.status, "CANCELLED");
    } finally {
      await jobs.close();
    }

    await assertResultMissing(dbPath, 1_893_000_006_000);
  });
});

test("TREE 11.7 restart repairs a legacy FAILED Job that still owns a provisional Result", async () => {
  await withFixture("market-flow-us-result-failed-restart-hardening-", async (dbPath) => {
    await createRunningJobWithResult(dbPath, "legacy-failed-result-before-restart");

    const core = await openCoreResearchJobLedger({
      dbPath,
      reconcileInterrupted: false,
      now: () => 1_893_000_007_000,
      jobIdFactory: () => {
        throw new Error("legacy terminalization must not allocate a Job ID");
      }
    });
    try {
      const failed = await core.markJobFailed(RUN_ID, JOB_ID, "RESEARCH_JOB_FAILED");
      assert.equal(failed.status, "FAILED");
    } finally {
      await core.close();
    }

    const beforeRepair = await openResearchResultLedger({
      dbPath,
      now: () => 1_893_000_008_000,
      resultHandleFactory: () => {
        throw new Error("legacy Result read must not allocate a Result Handle");
      }
    });
    try {
      assert.equal((await beforeRepair.getResult(RUN_ID, RESULT_HANDLE)).sourceJobId, JOB_ID);
    } finally {
      await beforeRepair.close();
    }

    const reopened = await openResearchJobLedger({
      dbPath,
      now: () => 1_893_000_009_000,
      jobIdFactory: () => {
        throw new Error("restart reconciliation must not allocate a Job ID");
      }
    });
    try {
      assert.equal((await reopened.getJob(RUN_ID, JOB_ID)).status, "FAILED");
    } finally {
      await reopened.close();
    }

    await assertResultMissing(dbPath, 1_893_000_010_000);
  });
});
