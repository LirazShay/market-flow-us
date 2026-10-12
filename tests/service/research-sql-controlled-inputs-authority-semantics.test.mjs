import assert from "node:assert/strict";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";

import { materializeControlledResearchInputs } from "../../research-server/research-sql-controlled-inputs.js";

const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";

async function withMemory(operation) {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    return await operation(connection);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function resultRows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowsJson();
}

test("TREE 11.3 controlled inputs preserve nullable baseline/future authority without strengthening Backtest semantics", async () => {
  await withMemory(async (connection) => {
    await materializeControlledResearchInputs({
      connection,
      inputs: {
        partitionRole: "DEVELOPMENT",
        decisionPoints: [{
          pointId: "point-1",
          sourceId: "active",
          requestedT0Ms: 2_000,
          baselineCycleId: 7,
          baselineCommittedAtMs: 1_990,
          baselineAvailable: true,
          partitionRole: "DEVELOPMENT"
        }],
        authoritativeOutcomes: [
          {
            pointId: "point-1",
            sourceId: "active",
            requestedT0Ms: 2_000,
            baselineCycleId: 7,
            securityId: "1001",
            horizonMs: 10_000,
            baselinePrice: 100,
            baselineCollectedAtMs: 1_980,
            futureCycleId: 8,
            futureCollectedAtMs: 12_000,
            futurePrice: null,
            changePercent: null,
            outcome: "UNAVAILABLE",
            unavailableReason: "FUTURE_PRICE_UNAVAILABLE"
          },
          {
            pointId: "point-1",
            sourceId: "active",
            requestedT0Ms: 2_000,
            baselineCycleId: 7,
            securityId: "1002",
            horizonMs: 10_000,
            baselinePrice: null,
            baselineCollectedAtMs: 1_980,
            futureCycleId: 8,
            futureCollectedAtMs: 12_000,
            futurePrice: 50,
            changePercent: null,
            outcome: "UNAVAILABLE",
            unavailableReason: "BASELINE_PRICE_UNAVAILABLE"
          }
        ],
        experimentPoints: [{
          experimentId: EXPERIMENT_ID,
          queryArtifactId: QUERY_ID,
          pointRef: "pt_0_0123456789abcdef",
          sourceId: "active",
          requestedT0Ms: 2_000,
          baselineCycleId: 7,
          returnedRowCount: 2,
          evaluatedUniqueCount: 2,
          availability: "AVAILABLE"
        }],
        experimentCandidates: [{
          experimentId: EXPERIMENT_ID,
          queryArtifactId: QUERY_ID,
          pointRef: "pt_0_0123456789abcdef",
          securityId: "1002",
          returnedPosition: 1,
          baselinePrice: null,
          baselineCollectedAtMs: 1_980
        }],
        experimentOutcomes: [{
          experimentId: EXPERIMENT_ID,
          queryArtifactId: QUERY_ID,
          pointRef: "pt_0_0123456789abcdef",
          securityId: "1002",
          returnedPosition: 1,
          horizonMs: 10_000,
          futureCycleId: 8,
          futureCollectedAtMs: 12_000,
          futurePrice: 50,
          changePercent: null,
          outcome: "UNAVAILABLE",
          unavailableReason: "BASELINE_PRICE_UNAVAILABLE"
        }]
      }
    });

    assert.deepEqual(await resultRows(connection, `
      SELECT security_id, baseline_price, future_cycle_id, future_collected_at_ms,
             future_price, change_percent, outcome, unavailable_reason
      FROM research_authoritative_outcomes
      ORDER BY security_id
    `), [
      ["1001", 100, "8", "12000", null, null, "UNAVAILABLE", "FUTURE_PRICE_UNAVAILABLE"],
      ["1002", null, "8", "12000", 50, null, "UNAVAILABLE", "BASELINE_PRICE_UNAVAILABLE"]
    ]);

    assert.deepEqual(await resultRows(connection, `
      SELECT baseline_price FROM experiment_candidates
    `), [[null]]);
  });
});

test("TREE 11.3 controlled inputs reject outcome facts that drift from the shared authoritative derivation", async () => {
  await withMemory(async (connection) => {
    await assert.rejects(
      materializeControlledResearchInputs({
        connection,
        inputs: {
          partitionRole: "DEVELOPMENT",
          decisionPoints: [{
            pointId: "point-1",
            sourceId: "active",
            requestedT0Ms: 2_000,
            baselineCycleId: 7,
            baselineCommittedAtMs: 1_990,
            baselineAvailable: true,
            partitionRole: "DEVELOPMENT"
          }],
          authoritativeOutcomes: [{
            pointId: "point-1",
            sourceId: "active",
            requestedT0Ms: 2_000,
            baselineCycleId: 7,
            securityId: "1001",
            horizonMs: 10_000,
            baselinePrice: 100,
            baselineCollectedAtMs: 1_980,
            futureCycleId: 8,
            futureCollectedAtMs: 12_000,
            futurePrice: 101,
            changePercent: 999,
            outcome: "UP",
            unavailableReason: null
          }]
        }
      }),
      /authoritative outcome semantics/u
    );

    assert.deepEqual(await resultRows(connection, `
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'
    `), []);
  });
});
