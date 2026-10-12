import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchResultLedger } from "../../research-server/result-ledger.js";

const RUN_A = "run_11111111-1111-4111-8111-111111111111";
const RUN_B = "run_22222222-2222-4222-8222-222222222222";
const JOB_A = "job_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_B = "job_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RESULT_A = "res_aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const RESULT_B = "res_bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

async function seedRunsAndJobs(dbPath) {
  let nextRunId = RUN_A;
  let ledger = await openResearchLedger({
    dbPath,
    now: () => 1_800_100_000_000,
    idFactory: () => nextRunId
  });
  await ledger.createResearchRun({ userIntent: "run a" });
  nextRunId = RUN_B;
  await ledger.createResearchRun({ userIntent: "run b" });
  await ledger.close();

  let nextJobId = JOB_A;
  const jobs = await openResearchJobLedger({
    dbPath,
    now: () => 1_800_100_000_100,
    jobIdFactory: () => nextJobId
  });
  await jobs.createJob({
    researchRunId: RUN_A,
    operation: "research_sql",
    clientRequestId: "run-a-analysis-1",
    intent: { partitionId: "part_a", sqlHash: "a".repeat(64) }
  });
  nextJobId = JOB_B;
  await jobs.createJob({
    researchRunId: RUN_B,
    operation: "research_sql",
    clientRequestId: "run-b-analysis-1",
    intent: { partitionId: "part_b", sqlHash: "b".repeat(64) }
  });
  await jobs.close();
}

function columns() {
  return [
    { name: "securityId", type: "VARCHAR", nullable: false },
    { name: "rank", type: "INTEGER", nullable: false }
  ];
}

function provenance() {
  return {
    partitionId: "part_development",
    evidenceFingerprints: ["sha256:" + "c".repeat(64)]
  };
}

test("TREE 11.4 result handle freezes ordered rows and survives reopen without recomputation", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-results-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let results = null;

  try {
    await seedRunsAndJobs(dbPath);
    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_800_100_000_200,
      resultHandleFactory: () => RESULT_A
    });

    const created = await results.createResult({
      researchRunId: RUN_A,
      sourceJobId: JOB_A,
      resultKind: "RESEARCH_SQL_ROWS",
      resultSchemaVersion: 1,
      columns: columns(),
      rows: [
        { securityId: "AAA", rank: 1 },
        { securityId: "BBB", rank: 2 },
        { securityId: "CCC", rank: 3 }
      ],
      provenance: provenance(),
      retention: { mode: "DURABLE" }
    });

    assert.equal(created.resultHandle, RESULT_A);
    assert.equal(created.researchRunId, RUN_A);
    assert.equal(created.sourceJobId, JOB_A);
    assert.equal(created.resultKind, "RESEARCH_SQL_ROWS");
    assert.equal(created.resultSchemaVersion, 1);
    assert.equal(created.rowCount, 3);
    assert.ok(created.serializedBytes > 0);
    assert.deepEqual(created.columns, columns());
    assert.deepEqual(created.provenance, provenance());
    assert.deepEqual(created.retention, { mode: "DURABLE" });

    const first = await results.getResultPage(RUN_A, RESULT_A, { pageSize: 2 });
    assert.deepEqual(first.rows, [
      { securityId: "AAA", rank: 1 },
      { securityId: "BBB", rank: 2 }
    ]);
    assert.equal(first.totalRows, 3);
    assert.equal(first.offset, 0);
    assert.equal(first.returnedRows, 2);
    assert.equal(first.truncated, true);
    assert.equal(typeof first.nextCursor, "string");

    await results.close();
    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_800_100_000_500,
      resultHandleFactory: () => "res_cccccccc-3333-4333-8333-cccccccccccc"
    });

    assert.deepEqual(await results.getResult(RUN_A, RESULT_A), created);
    const second = await results.getResultPage(RUN_A, RESULT_A, {
      pageSize: 2,
      cursor: first.nextCursor
    });
    assert.deepEqual(second.rows, [{ securityId: "CCC", rank: 3 }]);
    assert.equal(second.totalRows, 3);
    assert.equal(second.offset, 2);
    assert.equal(second.returnedRows, 1);
    assert.equal(second.truncated, false);
    assert.equal(second.nextCursor, null);
  } finally {
    if (results) await results.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 result pages are independently byte bounded and cursor is handle scoped", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-results-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let results = null;

  try {
    await seedRunsAndJobs(dbPath);
    let nextResultHandle = RESULT_A;
    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_800_100_100_000,
      resultHandleFactory: () => nextResultHandle,
      maxPageRows: 10,
      maxPageBytes: 180,
      maxRowBytes: 160
    });

    await results.createResult({
      researchRunId: RUN_A,
      sourceJobId: JOB_A,
      resultKind: "RESEARCH_SQL_ROWS",
      columns: [{ name: "payload", type: "VARCHAR", nullable: false }],
      rows: [
        { payload: "a".repeat(80) },
        { payload: "b".repeat(80) },
        { payload: "c".repeat(80) }
      ],
      provenance: provenance()
    });

    const first = await results.getResultPage(RUN_A, RESULT_A, { pageSize: 10 });
    assert.equal(first.rows.length, 1);
    assert.equal(first.truncated, true);
    assert.equal(typeof first.nextCursor, "string");
    assert.ok(Buffer.byteLength(JSON.stringify(first.rows), "utf8") <= 180);

    nextResultHandle = RESULT_B;
    await results.createResult({
      researchRunId: RUN_B,
      sourceJobId: JOB_B,
      resultKind: "RESEARCH_SQL_ROWS",
      columns: [{ name: "value", type: "INTEGER", nullable: false }],
      rows: [{ value: 1 }],
      provenance: { partitionId: "part_b" }
    });

    await assert.rejects(
      results.getResultPage(RUN_B, RESULT_B, {
        pageSize: 1,
        cursor: first.nextCursor
      }),
      (error) => error?.code === "RESEARCH_RESULT_CURSOR_MISMATCH"
    );
    await assert.rejects(
      results.getResultPage(RUN_B, RESULT_A, { pageSize: 1 }),
      /Result Handle was not found in this Research Run/u
    );
    await assert.rejects(
      results.getResultPage(RUN_A, RESULT_A, { pageSize: 11 }),
      /pageSize/u
    );
  } finally {
    if (results) await results.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 result persistence rejects unbounded rows and oversized result snapshots", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-results-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let results = null;

  try {
    await seedRunsAndJobs(dbPath);
    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_800_100_200_000,
      resultHandleFactory: () => RESULT_A,
      maxResultRows: 2,
      maxResultBytes: 256,
      maxPageBytes: 128,
      maxRowBytes: 100
    });

    await assert.rejects(
      results.createResult({
        researchRunId: RUN_A,
        sourceJobId: JOB_A,
        resultKind: "RESEARCH_SQL_ROWS",
        columns: [{ name: "value", type: "INTEGER", nullable: false }],
        rows: [{ value: 1 }, { value: 2 }, { value: 3 }],
        provenance: provenance()
      }),
      (error) => error?.code === "RESEARCH_RESULT_ROW_LIMIT"
    );

    await assert.rejects(
      results.createResult({
        researchRunId: RUN_A,
        sourceJobId: JOB_A,
        resultKind: "RESEARCH_SQL_ROWS",
        columns: [{ name: "payload", type: "VARCHAR", nullable: false }],
        rows: [{ payload: "x".repeat(120) }],
        provenance: provenance()
      }),
      (error) => error?.code === "RESEARCH_RESULT_ROW_BYTES_LIMIT"
    );
  } finally {
    if (results) await results.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
