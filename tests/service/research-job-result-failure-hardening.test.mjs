import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
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
      userIntent: "Prove a failed Job cannot retain a previously published provisional Result."
    });
  } finally {
    await ledger.close();
  }
}

test("TREE 11.7 FAILED Job terminalization removes a previously published provisional Result", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-result-failure-hardening-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let jobs = null;
  let results = null;

  try {
    await createRun(dbPath);

    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_893_000_001_000,
      jobIdFactory: () => JOB_ID
    });
    await jobs.createJob({
      researchRunId: RUN_ID,
      operation: "research_sql",
      clientRequestId: "published-result-then-failed",
      intent: { partitionId: "part_failure_hardening", sqlHash: "c".repeat(64) }
    });
    await jobs.markJobRunning(RUN_ID, JOB_ID);
    await jobs.close();
    jobs = null;

    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_893_000_002_000,
      resultHandleFactory: () => RESULT_HANDLE
    });
    await results.createResult({
      researchRunId: RUN_ID,
      sourceJobId: JOB_ID,
      resultKind: "RESEARCH_SQL_RESULT",
      columns: [{ name: "value", type: "INTEGER", nullable: false }],
      rows: [{ value: 1 }],
      provenance: { partitionId: "part_failure_hardening" }
    });
    assert.equal((await results.getResult(RUN_ID, RESULT_HANDLE)).sourceJobId, JOB_ID);
    await results.close();
    results = null;

    jobs = await openResearchJobLedger({
      dbPath,
      reconcileInterrupted: false,
      now: () => 1_893_000_003_000,
      jobIdFactory: () => {
        throw new Error("failure terminalization must not allocate a Job ID");
      }
    });
    const failed = await jobs.markJobFailed(RUN_ID, JOB_ID, "RESEARCH_JOB_FAILED");
    assert.equal(failed.status, "FAILED");
    await jobs.close();
    jobs = null;

    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_893_000_004_000,
      resultHandleFactory: () => {
        throw new Error("failure read must not allocate a Result Handle");
      }
    });
    assert.equal(
      await results.getResult(RUN_ID, RESULT_HANDLE),
      null,
      "a Result whose owning Job terminalizes FAILED must not remain authoritative or readable"
    );
  } finally {
    if (results) await results.close();
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
