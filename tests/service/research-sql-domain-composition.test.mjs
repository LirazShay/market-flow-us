import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openResearchDomain } from "../../research-server/domain.js";
import {
  durableAuthoritativeExperimentRequest,
  freezeAuthoritativeExperimentBatchRequest
} from "../../research-server/experiment-authority.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";
const SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 1";

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

async function seedMarketData(dataDir) {
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "research-domain-sql-composition-test-v4",
    now: () => 1_700_000_000_000
  });
  try {
    const writer = database.writerConnection;
    await writer.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'composition-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'composition-seed', 1, 'complete', 11900, 11990, 12000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'composition-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001","ExtraSignal":7}'),
        (2, 'composition-seed', 1, '1001', 0, 11900, 11980, 12000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-future', 101, 1.5, 1200,
         '{"PaperId":"1001","ExtraSignal":9}')
    `);
  } finally {
    await database.close();
  }
}

function metricSet(requestFingerprint) {
  return Object.freeze({
    contractVersion: "research-experiment-metrics-v1",
    requestFingerprint,
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
  });
}

function completedExecution(input) {
  const request = freezeAuthoritativeExperimentBatchRequest(input);
  const requestedAtMs = request.schedule.requestedAtMsList[0];
  const changePercent = ((101 / 100) - 1) * 100;
  const point = Object.freeze({
    available: true,
    unavailableReason: null,
    sourceId: input.sourceId,
    requestedAtMs,
    baseline: Object.freeze({ cycleId: 1, committedAtMs: 2_000 }),
    topX: 1,
    horizonsMs: Object.freeze([10_000]),
    queries: Object.freeze([Object.freeze({
      id: QUERY_ID,
      name: "baseline",
      sql: SQL,
      sourceRowCount: 1,
      selectedSourceRowCount: 1,
      evaluatedUniqueCount: 1,
      duplicateRowCount: 0,
      items: Object.freeze([Object.freeze({
        securityId: "1001",
        returnedPosition: 1,
        baseline: Object.freeze({
          cycleId: 1,
          collectedAtMs: 1_980,
          price: 100,
          symbol: "AAA",
          paperName: "Alpha",
          exchangeName: "NYSE",
          ageMs: 20,
          timingAnomaly: null
        }),
        horizons: Object.freeze([Object.freeze({
          horizonMs: 10_000,
          targetAtMs: requestedAtMs + 10_000,
          futureCycleId: 2,
          observedAtMs: 12_000,
          actualElapsedMs: 10_000,
          price: 101,
          changePercent,
          outcome: "UP",
          unavailableReason: null,
          timingAnomaly: null
        })])
      })]),
      summary: Object.freeze([])
    })]),
    comparison: Object.freeze({
      unionCount: 1,
      commonCount: 1,
      exclusiveCounts: Object.freeze([0]),
      securities: Object.freeze([]),
      pairs: Object.freeze([])
    })
  });
  return Object.freeze({
    request,
    durableRequest: durableAuthoritativeExperimentRequest(request),
    metrics: metricSet(request.requestFingerprint),
    sweep: Object.freeze({
      metrics: Object.freeze({ requestedPointCount: 1 }),
      page() { return null; },
      openPoint(index) {
        if (index !== 0) throw new RangeError("point index out of range");
        return point;
      }
    })
  });
}

function manifestRelation(manifest, name) {
  const relation = manifest.relations.find((entry) => entry.relation === name);
  assert.ok(relation, `missing ${name}`);
  return relation;
}

test("TREE 11.3 Research Domain composes base evidence, explicit Experiment authority and raw discovery in one sandbox", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-sql-domain-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let session = null;

  try {
    await seedMarketData(tempDir);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });

    domain = await openResearchDomain({
      dbPath: ledgerPath,
      marketDataDir: tempDir,
      now: () => 1_860_000_000_000,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: () => QUERY_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION]),
      experimentIdFactory: () => EXPERIMENT_ID,
      metricSetIdFactory: () => METRIC_SET_ID,
      executeExperimentBatch: async (input) => completedExecution(input)
    });

    await domain.createResearchRun({
      userIntent: "Research short-horizon momentum.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer upward 10 second outcomes.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "baseline"
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: fingerprint,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "composition-test-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });
    await domain.executeDevelopmentExperiment({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_DEV,
      sourceId: "active",
      queryArtifactIds: [QUERY_ID],
      fromAtMs: 2_000,
      toAtMs: 2_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 1,
      horizonsMs: [10_000]
    });

    await assert.rejects(
      domain.openDevelopmentResearchSql({
        researchRunId: RUN_ID,
        partitionId: PART_DEV,
        experimentIds: [EXPERIMENT_ID],
        dataDir: "/client/must-not-control"
      }),
      /not client-owned research SQL authority/u
    );

    await assert.rejects(
      domain.openDevelopmentResearchSql({
        researchRunId: RUN_ID,
        partitionId: PART_VALIDATION,
        experimentIds: []
      }),
      /DEVELOPMENT partitions/u
    );

    session = await domain.openDevelopmentResearchSql({
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: [EXPERIMENT_ID]
    });
    assert.equal(session.phase, "DEVELOPMENT");
    assert.deepEqual(session.experimentIds, [EXPERIMENT_ID]);

    const tables = await session.execute(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'main'
      ORDER BY table_name
    `);
    assert.deepEqual(tables.rows.map((row) => row[0]), [
      "experiment_candidates",
      "experiment_metrics",
      "experiment_outcomes",
      "experiment_points",
      "research_authoritative_outcomes",
      "research_cycles",
      "research_decision_points",
      "research_history",
      "research_partition",
      "research_sources",
      "research_universe"
    ]);

    const joined = await session.execute(`
      SELECT
        history.security_id,
        history.Price AS baseline_price,
        outcome.future_price,
        outcome.change_percent,
        outcome.outcome
      FROM research_history AS history
      JOIN experiment_outcomes AS outcome
        ON outcome.security_id = history.security_id
       AND outcome.query_artifact_id = '${QUERY_ID}'
      WHERE history.cycle_id = 1
    `);
    assert.equal(joined.rowCount, 1);
    assert.equal(joined.rows[0][0], "1001");
    assert.equal(joined.rows[0][1], 100);
    assert.equal(joined.rows[0][2], 101);
    assert.ok(Math.abs(joined.rows[0][3] - (((101 / 100) - 1) * 100)) < Number.EPSILON * 10);
    assert.equal(joined.rows[0][4], "UP");

    const authoritative = await session.execute(`
      SELECT point_id, security_id, horizon_ms, future_cycle_id, outcome
      FROM research_authoritative_outcomes
    `);
    assert.equal(authoritative.rowCount, 1);
    assert.match(authoritative.rows[0][0], /^exp_.*:pt_0_[0-9a-f]{16}$/u);
    assert.deepEqual(authoritative.rows[0].slice(1), ["1001", "10000", "2", "UP"]);

    const metric = await session.execute(`
      SELECT metric_name, numerator, denominator, excluded_count, value
      FROM experiment_metrics
    `);
    assert.deepEqual(metric.rows, [["point_availability_rate", 1, 1, "0", 1]]);

    const rawKeys = await session.listRawDataKeys({ limit: 10 });
    const extraSignal = rawKeys.keys.find((entry) => entry.key === "ExtraSignal");
    assert.ok(extraSignal);
    assert.equal(extraSignal.presentRows, 2);
    const rawProfile = await session.profileRawDataKey({ key: "ExtraSignal", sampleLimit: 1 });
    assert.equal(rawProfile.presentRows, 2);
    assert.equal(rawProfile.samples[0].sourceId, "active");

    const manifest = session.describeSchema();
    assert.equal(manifest.relations.length, 11);
    const outcomeManifest = manifestRelation(manifest, "research_authoritative_outcomes");
    assert.equal(
      outcomeManifest.fields.find((field) => field.column === "future_price").future_dependent,
      true
    );
    const historyManifest = manifestRelation(manifest, "research_history");
    assert.equal(historyManifest.fields.some((field) => field.column.startsWith("future_")), false);

    await assert.rejects(() => session.execute("SELECT * FROM evidence.main.history"));

    await domain.close();
    domain = null;
    await assert.rejects(() => session.execute("SELECT 1"), /closed/u);
    await session.close();
    session = null;

    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprint
    );
  } finally {
    if (session) await session.close();
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
