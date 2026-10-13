import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { createScannerCandidateHandoff } from "../../trading-server/scanner-candidate-handoff.js";

const SQL = "SELECT security_id, last, note FROM latest ORDER BY last DESC";
const ADMITTED_AT_MS = 2_000;

function source({
  generation = 7,
  sql = SQL,
  rows = [
    ["NASDAQ:MSFT", 420.25, "first"],
    ["NASDAQ:AAPL", 221.5, "selected"]
  ],
  columns = [
    { name: "security_id", type: "VARCHAR" },
    { name: "last", type: "DOUBLE" },
    { name: "note", type: "VARCHAR" }
  ]
} = {}) {
  return {
    context: {
      generation,
      sql,
      intervalMs: 5_000,
      queryId: "query-momentum",
      queryName: "Momentum",
      startedAtMs: 1_700,
      completedAtMs: 1_900
    },
    result: {
      columns,
      rows,
      rowCount: rows.length
    }
  };
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const item of Object.values(value)) assertDeepFrozen(item);
}

test("TREE 12.2 same Scanner generation/result produces the same immutable candidate handoff", () => {
  const firstSource = source();
  const secondSource = source();

  const first = createScannerCandidateHandoff({
    ...firstSource,
    resultRank: 2,
    admittedAtMs: ADMITTED_AT_MS
  });
  const second = createScannerCandidateHandoff({
    ...secondSource,
    resultRank: 2,
    admittedAtMs: ADMITTED_AT_MS
  });

  assert.deepEqual(first, second);
  assert.equal(first.candidateKey, "NASDAQ:AAPL");
  assert.equal(first.candidateProvenance.securityId, "NASDAQ:AAPL");
  assert.equal(first.candidateProvenance.resultRank, 2);
  assert.equal(first.candidateProvenance.rowEvidence.resultRank, 2);
  assert.equal(first.candidateProvenance.scannerGeneration.generation, 7);
  assert.equal(first.candidateProvenance.scannerGeneration.rowCount, 2);
  assert.equal(first.candidateProvenance.sourceQuery.sql, SQL);
  assert.equal(
    first.candidateProvenance.sourceQuery.sqlSha256,
    createHash("sha256").update(SQL, "utf8").digest("hex")
  );
  assert.equal(first.candidateProvenance.admittedAtMs, ADMITTED_AT_MS);
  assertDeepFrozen(first);
});

test("TREE 12.2 admitted handoff does not change when source objects or later Scanner generations change", () => {
  const original = source();
  const admitted = createScannerCandidateHandoff({
    ...original,
    resultRank: 2,
    admittedAtMs: ADMITTED_AT_MS
  });
  const snapshot = structuredClone(admitted);

  original.context.generation = 8;
  original.context.queryName = "Edited later";
  original.context.sql = "SELECT security_id FROM latest WHERE 1 = 0";
  original.result.rows[1][0] = "NASDAQ:NVDA";
  original.result.rows[1][1] = 999;

  const later = source({
    generation: 8,
    rows: [["NASDAQ:NVDA", 999, "later generation"]]
  });
  const laterHandoff = createScannerCandidateHandoff({
    ...later,
    resultRank: 1,
    admittedAtMs: ADMITTED_AT_MS + 1
  });

  assert.deepEqual(admitted, snapshot);
  assert.equal(admitted.candidateKey, "NASDAQ:AAPL");
  assert.equal(admitted.candidateProvenance.scannerGeneration.generation, 7);
  assert.equal(admitted.candidateProvenance.sourceQuery.name, "Momentum");
  assert.equal(laterHandoff.candidateKey, "NASDAQ:NVDA");
  assert.equal(laterHandoff.candidateProvenance.scannerGeneration.generation, 8);
});

test("TREE 12.2 canonical identity fails closed when missing, ambiguous or unusable", () => {
  const cases = [
    source({
      columns: [{ name: "Symbol", type: "VARCHAR" }],
      rows: [["AAPL"]]
    }),
    source({
      columns: [
        { name: "securityId", type: "VARCHAR" },
        { name: "security_id", type: "VARCHAR" }
      ],
      rows: [["NASDAQ:AAPL", "NASDAQ:AAPL"]]
    }),
    source({
      columns: [{ name: "securityId", type: "VARCHAR" }],
      rows: [["   "]]
    })
  ];

  for (const candidateSource of cases) {
    assert.throws(
      () => createScannerCandidateHandoff({
        ...candidateSource,
        resultRank: 1,
        admittedAtMs: ADMITTED_AT_MS
      }),
      /identity|securityId|recognized/iu
    );
  }
});

test("TREE 12.2 provenance keeps exact rank/query/generation while row evidence stays bounded", () => {
  const columns = [
    { name: "securityId", type: "VARCHAR" },
    ...Array.from({ length: 70 }, (_, index) => ({
      name: `metric_${index + 1}`,
      type: "VARCHAR"
    }))
  ];
  const rows = [[
    "NASDAQ:AAPL",
    ...Array.from({ length: 70 }, (_, index) => index === 0 ? "x".repeat(500) : `v${index + 1}`)
  ]];
  const candidateSource = source({
    generation: 19,
    sql: "SELECT * FROM bounded_candidate_fixture",
    columns,
    rows
  });

  const handoff = createScannerCandidateHandoff({
    ...candidateSource,
    resultRank: 1,
    admittedAtMs: ADMITTED_AT_MS
  });
  const provenance = handoff.candidateProvenance;

  assert.equal(provenance.scannerGeneration.generation, 19);
  assert.equal(provenance.scannerGeneration.startedAtMs, 1_700);
  assert.equal(provenance.scannerGeneration.completedAtMs, 1_900);
  assert.equal(provenance.scannerGeneration.rowCount, 1);
  assert.equal(provenance.sourceQuery.queryId, "query-momentum");
  assert.equal(provenance.sourceQuery.name, "Momentum");
  assert.equal(provenance.sourceQuery.sql, "SELECT * FROM bounded_candidate_fixture");
  assert.equal(provenance.resultRank, 1);
  assert.equal(provenance.rowEvidence.sourceColumnCount, 71);
  assert.ok(provenance.rowEvidence.retainedColumns.length <= 64);
  assert.ok(provenance.rowEvidence.omittedColumns.length > 0);
  assert.equal(provenance.rowEvidence.identityColumn.name, "securityId");
  assert.equal(provenance.rowEvidence.values[0], "NASDAQ:AAPL");
  assert.equal(new TextEncoder().encode(provenance.rowEvidence.values[1]).byteLength, 128);
  assert.equal(provenance.rowEvidence.cellMetadata[0].truncated, true);
});
