import assert from "node:assert/strict";
import test from "node:test";

import { DuckDBInstance } from "@duckdb/node-api";

import {
  CONTROLLED_RESEARCH_RELATIONS,
  CONTROLLED_RESEARCH_SCHEMA_MANIFEST,
  materializeControlledResearchInputs
} from "../../research-server/research-sql-controlled-inputs.js";

const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";

async function openMemory() {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  return {
    instance,
    connection,
    close() {
      connection.closeSync();
      instance.closeSync();
    }
  };
}

async function rows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowsJson();
}

function relation(name) {
  const result = CONTROLLED_RESEARCH_SCHEMA_MANIFEST.relations.find((item) => item.relation === name);
  assert.ok(result, `missing ${name}`);
  return result;
}

function field(relationManifest, name) {
  const result = relationManifest.fields.find((item) => item.column === name);
  assert.ok(result, `missing ${relationManifest.relation}.${name}`);
  return result;
}

test("TREE 11.3 controlled authority inputs materialize explicit Development-only decision/outcome/experiment truth", async () => {
  const memory = await openMemory();
  try {
    const summary = await materializeControlledResearchInputs({
      connection: memory.connection,
      inputs: {
        partitionRole: "DEVELOPMENT",
        decisionPoints: [
          {
            pointId: "point-1",
            sourceId: "active",
            requestedT0Ms: 2_000,
            baselineCycleId: 7,
            baselineCommittedAtMs: 1_990,
            baselineAvailable: true,
            partitionRole: "DEVELOPMENT"
          },
          {
            pointId: "point-unavailable",
            sourceId: "active",
            requestedT0Ms: 500,
            baselineCycleId: null,
            baselineCommittedAtMs: null,
            baselineAvailable: false,
            partitionRole: "DEVELOPMENT"
          }
        ],
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
            futurePrice: 101,
            changePercent: 1,
            outcome: "UP",
            unavailableReason: null
          },
          {
            pointId: "point-1",
            sourceId: "active",
            requestedT0Ms: 2_000,
            baselineCycleId: 7,
            securityId: "1001",
            horizonMs: 20_000,
            baselinePrice: 100,
            baselineCollectedAtMs: 1_980,
            futureCycleId: null,
            futureCollectedAtMs: null,
            futurePrice: null,
            changePercent: null,
            outcome: "UNAVAILABLE",
            unavailableReason: "SOURCE_ENDED"
          }
        ],
        experimentPoints: [
          {
            experimentId: EXPERIMENT_ID,
            queryArtifactId: QUERY_ID,
            pointRef: "pt_0_0123456789abcdef",
            sourceId: "active",
            requestedT0Ms: 2_000,
            baselineCycleId: 7,
            returnedRowCount: 3,
            evaluatedUniqueCount: 2,
            availability: "AVAILABLE"
          },
          {
            experimentId: EXPERIMENT_ID,
            queryArtifactId: QUERY_ID,
            pointRef: "pt_1_0123456789abcdef",
            sourceId: "active",
            requestedT0Ms: 500,
            baselineCycleId: null,
            returnedRowCount: 0,
            evaluatedUniqueCount: 0,
            availability: "UNAVAILABLE"
          }
        ],
        experimentCandidates: [
          {
            experimentId: EXPERIMENT_ID,
            queryArtifactId: QUERY_ID,
            pointRef: "pt_0_0123456789abcdef",
            securityId: "1001",
            returnedPosition: 1,
            baselinePrice: 100,
            baselineCollectedAtMs: 1_980
          }
        ],
        experimentOutcomes: [
          {
            experimentId: EXPERIMENT_ID,
            queryArtifactId: QUERY_ID,
            pointRef: "pt_0_0123456789abcdef",
            securityId: "1001",
            returnedPosition: 1,
            horizonMs: 10_000,
            futureCycleId: 8,
            futureCollectedAtMs: 12_000,
            futurePrice: 101,
            changePercent: 1,
            outcome: "UP",
            unavailableReason: null
          }
        ],
        experimentMetrics: [
          {
            experimentId: EXPERIMENT_ID,
            metricSetId: METRIC_SET_ID,
            queryArtifactId: QUERY_ID,
            metricName: "positive_rate",
            horizonMs: 10_000,
            numerator: 1,
            denominator: 1,
            excludedCount: 0,
            value: 1
          },
          {
            experimentId: EXPERIMENT_ID,
            metricSetId: METRIC_SET_ID,
            queryArtifactId: null,
            metricName: "point_availability_rate",
            horizonMs: null,
            numerator: 1,
            denominator: 2,
            excludedCount: 1,
            value: 0.5
          }
        ]
      }
    });

    assert.deepEqual(summary.rowCounts, {
      researchDecisionPoints: 2,
      researchAuthoritativeOutcomes: 2,
      experimentPoints: 2,
      experimentCandidates: 1,
      experimentOutcomes: 1,
      experimentMetrics: 2
    });

    const tableRows = await rows(memory.connection, `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'main'
      ORDER BY table_name
    `);
    assert.deepEqual(tableRows, [...CONTROLLED_RESEARCH_RELATIONS].sort().map((name) => [name]));

    assert.deepEqual(await rows(memory.connection, `
      SELECT point_id, source_id, requested_t0_ms, baseline_cycle_id,
             baseline_committed_at_ms, baseline_available, partition_role
      FROM research_decision_points
      ORDER BY point_id
    `), [
      ["point-1", "active", "2000", "7", "1990", true, "DEVELOPMENT"],
      ["point-unavailable", "active", "500", null, null, false, "DEVELOPMENT"]
    ]);

    assert.deepEqual(await rows(memory.connection, `
      SELECT horizon_ms, future_cycle_id, future_price, change_percent, outcome, unavailable_reason
      FROM research_authoritative_outcomes
      ORDER BY horizon_ms
    `), [
      ["10000", "8", 101, 1, "UP", null],
      ["20000", null, null, null, "UNAVAILABLE", "SOURCE_ENDED"]
    ]);

    assert.deepEqual(await rows(memory.connection, `
      SELECT point_ref, baseline_cycle_id, returned_row_count, evaluated_unique_count, availability
      FROM experiment_points
      ORDER BY requested_t0_ms
    `), [
      ["pt_1_0123456789abcdef", null, "0", "0", "UNAVAILABLE"],
      ["pt_0_0123456789abcdef", "7", "3", "2", "AVAILABLE"]
    ]);

    assert.deepEqual(await rows(memory.connection, `
      SELECT security_id, returned_position, baseline_price, baseline_collected_at_ms
      FROM experiment_candidates
    `), [["1001", "1", 100, "1980"]]);

    assert.deepEqual(await rows(memory.connection, `
      SELECT security_id, returned_position, horizon_ms, future_cycle_id, future_price,
             change_percent, outcome
      FROM experiment_outcomes
    `), [["1001", "1", "10000", "8", 101, 1, "UP"]]);

    assert.deepEqual(await rows(memory.connection, `
      SELECT query_artifact_id, metric_name, horizon_ms, numerator, denominator, excluded_count, value
      FROM experiment_metrics
      ORDER BY metric_name
    `), [
      [null, "point_availability_rate", null, 1, 2, "1", 0.5],
      [QUERY_ID, "positive_rate", "10000", 1, 1, "0", 1]
    ]);

    const decisionManifest = relation("research_decision_points");
    assert.equal(field(decisionManifest, "baseline_cycle_id").future_dependent, false);
    assert.equal(field(decisionManifest, "baseline_cycle_id").decision_time_eligible, false);

    const outcomeManifest = relation("research_authoritative_outcomes");
    assert.equal(field(outcomeManifest, "future_price").future_dependent, true);
    assert.equal(field(outcomeManifest, "change_percent").decision_time_eligible, false);
    assert.equal(field(outcomeManifest, "outcome").research_only, true);

    const historyLeak = JSON.stringify(CONTROLLED_RESEARCH_SCHEMA_MANIFEST);
    assert.equal(historyLeak.includes("future_price_30s"), false);
    assert.equal(historyLeak.includes("will_go_up"), false);
  } finally {
    memory.close();
  }
});

test("TREE 11.3 controlled input admission rejects authority mismatch before creating any relations", async () => {
  for (const badInputs of [
    {
      partitionRole: "VALIDATION",
      decisionPoints: []
    },
    {
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
        sourceId: "archive:wrong.duckdb",
        requestedT0Ms: 2_000,
        baselineCycleId: 7,
        securityId: "1001",
        horizonMs: 10_000,
        baselinePrice: 100,
        baselineCollectedAtMs: 1_980,
        futureCycleId: 8,
        futureCollectedAtMs: 12_000,
        futurePrice: 101,
        changePercent: 1,
        outcome: "UP",
        unavailableReason: null
      }]
    },
    {
      partitionRole: "DEVELOPMENT",
      experimentPoints: [{
        experimentId: EXPERIMENT_ID,
        queryArtifactId: QUERY_ID,
        pointRef: "pt_0_0123456789abcdef",
        sourceId: "active",
        requestedT0Ms: 2_000,
        baselineCycleId: 7,
        returnedRowCount: 1,
        evaluatedUniqueCount: 1,
        availability: "AVAILABLE"
      }],
      experimentCandidates: [{
        experimentId: EXPERIMENT_ID,
        queryArtifactId: QUERY_ID,
        pointRef: "pt_missing_0123456789abcdef",
        securityId: "1001",
        returnedPosition: 1,
        baselinePrice: 100,
        baselineCollectedAtMs: 1_980
      }]
    }
  ]) {
    const memory = await openMemory();
    try {
      await assert.rejects(
        materializeControlledResearchInputs({ connection: memory.connection, inputs: badInputs })
      );
      assert.deepEqual(await rows(memory.connection, `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
      `), []);
    } finally {
      memory.close();
    }
  }
});
