import assert from "node:assert/strict";
import test from "node:test";

import {
  MOVEMENT_FIELDS,
  buildMovementWitnessSql,
  evaluateMovementEvidence
} from "../../browser/live-verification/movement-evidence.js";

const BASE_REPORT = Object.freeze({
  overall: "PASS",
  sustainedRun: Object.freeze({
    firstCycleId: 101,
    lastCycleId: 120
  })
});

function createViewerFactory({
  scannerRows,
  currentPrice = 12,
  historyPrices = [12, 11]
}) {
  return () => ({
    async executeScanner(sql) {
      assert.match(sql, /cycle_id BETWEEN 101 AND 120/);
      assert.match(sql, /l\.cycle_id = 120/);
      assert.match(sql, /LIMIT 1/);
      assert.equal(sql.includes("collected_at_ms"), false);
      return {
        columns: [
          { name: "securityId" },
          { name: "changedField" },
          { name: "latestCycleId" }
        ],
        rows: scannerRows,
        rowCount: scannerRows.length
      };
    },
    async getCurrent() {
      return {
        summary: { lastCycleId: 120 },
        rows: [{ securityId: "1001", Price: currentPrice }]
      };
    },
    async getHistoryPage() {
      return {
        rows: historyPrices.map((Price, index) => ({
          securityId: "1001",
          cycleId: 120 - index,
          Price
        })),
        hasMore: false,
        nextCursor: null
      };
    },
    close() {}
  });
}

test("movement evidence is PASS only when a provider-field change is reflected in Current and History", async () => {
  const evidence = await evaluateMovementEvidence({
    baseReport: BASE_REPORT,
    viewerClientFactory: createViewerFactory({
      scannerRows: [["1001", "Price", "120"]]
    })
  });

  assert.deepEqual(evidence, {
    status: "PASS",
    observed: true,
    securityId: "1001",
    field: "Price",
    currentReflected: true,
    historyReflected: true,
    code: "MARKET_MOVEMENT_COMMITTED"
  });
});

test("movement evidence remains PENDING when the committed live range is static", async () => {
  const evidence = await evaluateMovementEvidence({
    baseReport: BASE_REPORT,
    viewerClientFactory: createViewerFactory({ scannerRows: [] })
  });

  assert.equal(evidence.status, "PENDING");
  assert.equal(evidence.observed, false);
  assert.equal(evidence.code, "NO_MARKET_MOVEMENT_OBSERVED");
});

test("movement evidence fails when the witness is not reflected by final Current authority", async () => {
  const evidence = await evaluateMovementEvidence({
    baseReport: BASE_REPORT,
    viewerClientFactory: createViewerFactory({
      scannerRows: [["1001", "Price", "120"]],
      currentPrice: 999
    })
  });

  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.observed, true);
  assert.equal(evidence.currentReflected, false);
  assert.equal(evidence.historyReflected, true);
  assert.equal(evidence.code, "MOVEMENT_EVIDENCE_NOT_PROVEN");
});

test("movement witness SQL is bounded to fixed public market fields and rejects invalid cycle ranges", () => {
  const sql = buildMovementWitnessSql({ firstCycleId: 5, lastCycleId: 25 });
  for (const field of MOVEMENT_FIELDS) {
    assert.ok(sql.includes(field), field);
  }
  assert.match(sql, /cycle_id BETWEEN 5 AND 25/);
  assert.match(sql, /ORDER BY m\.security_id ASC/);
  assert.match(sql, /LIMIT 1/);
  assert.equal(sql.includes("raw_data"), false);
  assert.equal(sql.includes("source_metadata_json"), false);
  assert.equal(sql.includes("collected_at_ms"), false);

  assert.throws(
    () => buildMovementWitnessSql({ firstCycleId: 10, lastCycleId: 9 }),
    /cannot be earlier/
  );
});
