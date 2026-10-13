import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchResultLedger } from "../../research-server/result-ledger.js";

const RUN_ID = "run_51515151-5151-4151-8151-515151515151";
const INTERRUPTED_JOB_ID = "job_51515151-5151-4151-8151-515151515151";
const SUCCEEDED_JOB_ID = "job_52525252-5252-4252-8252-525252525252";
const INTERRUPTED_RESULT = "res_51515151-5151-4151-8151-515151515151";
const SUCCEEDED_RESULT = "res_52525252-5252-4252-8252-525252525252";

async function createRun(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => 1_892_000_000_000,
    idFactory: () => RUN_ID
  });
  try {
    await ledger.createResearchRun({
      userIntent: "Prove restart cannot retain a Result from an interrupted Job."
    });
  } finally {
    await ledger.close();
  }
}

function resultInput(sourceJobId) {
  return {
    researchRunId: RUN_ID,
    sourceJobId,
    resultKind: "RESEARCH_SQL_RESULT",
    columns: [{ name: "value", type: "INTEGER", nullable: false }],
    rows: [{ value: 1 }],
    provenance: { partitionId: "part_restart_hardening" }
  };
}

test("TREE 11.7 restart purges provisional Results from interrupted Jobs and preserves succeeded authority", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-result-restart-hardening-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let jobs = null;
  let results = null;

  try {
    await createRun(dbPath);

    const jobIds = [INTERRUPTED_JOB_ID, SUCCEEDED_JOB_ID];
    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_892_000_001_000,
      jobIdFactory: () => jobIds.shift()
    });
    await jobs.createJob({
      researchRunId: RUN_ID,
      operation: "research_sql",
      clientRequestId: "interrupted-result-publication",
      intent: { partitionId: "part_restart_hardening", sqlHash: "a".repeat(64) }
    });
    await jobs.createJob({
      researchRunId: RUN_ID,
      operation: "research_sql",
      clientRequestId: "succeeded-result-publication",
      intent: { partitionId: "part_restart_hardening", sqlHash: "b".repeat(64) }
    });
    await jobs.markJobRunning(RUN_ID, INTERRUPTED_JOB_ID);
    await jobs.markJobRunning(RUN_ID, SUCCEEDED_JOB_ID);
    await jobs.close();
    jobs = null;

    const resultHandles = [INTERRUPTED_RESULT, SUCCEEDED_RESULT];
    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_892_000_002_000,
      resultHandleFactory: () => resultHandles.shift()
    });
    await results.createResult(resultInput(INTERRUPTED_JOB_ID));
    await results.createResult(resultInput(SUCCEEDED_JOB_ID));
    assert.equal((await results.getResult(RUN_ID, INTERRUPTED_RESULT)).sourceJobId, INTERRUPTED_JOB_ID);
    assert.equal((await results.getResult(RUN_ID, SUCCEEDED_RESULT)).sourceJobId, SUCCEEDED_JOB_ID);
    await results.close();
    results = null;

    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_892_000_003_000,
      reconcileInterrupted: false,
      jobIdFactory: () => {
        throw new Error("terminalization must not allocate a Job ID");
      }
    });
    await jobs.markJobSucceeded(RUN_ID, SUCCEEDED_JOB_ID);
    await jobs.close();
    jobs = null;

    // Simulate process restart. The interrupted Job never crossed durable success.
    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_892_000_004_000,
      jobIdFactory: () => {
        throw new Error("restart reconciliation must not allocate a Job ID");
      }
    });
    const interrupted = await jobs.getJob(RUN_ID, INTERRUPTED_JOB_ID);
    const succeeded = await jobs.getJob(RUN_ID, SUCCEEDED_JOB_ID);
    assert.equal(interrupted.status, "FAILED");
    assert.equal(interrupted.errorCode, "RESEARCH_JOB_INTERRUPTED");
    assert.equal(succeeded.status, "SUCCEEDED");
    await jobs.close();
    jobs = null;

    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_892_000_005_000,
      resultHandleFactory: () => {
        throw new Error("restart read must not allocate a Result Handle");
      }
    });
    assert.equal(
      await results.getResult(RUN_ID, INTERRUPTED_RESULT),
      null,
      "a Result from work that restart reconciled as interrupted must not remain authoritative"
    );
    assert.equal(
      (await results.getResult(RUN_ID, SUCCEEDED_RESULT)).sourceJobId,
      SUCCEEDED_JOB_ID,
      "a Result owned by a successfully terminalized Job must survive restart reconciliation"
    );
  } finally {
    if (results) await results.close();
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
