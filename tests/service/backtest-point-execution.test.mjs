import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { executeBacktestPoint } from "../../backtest-lab/point-execution.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { executeAuthoritativeExperimentPoint } from "../../research-server/experiment-authority.js";

async function seedPointEvidence(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-point-execution-test",
    now: () => 20_000
  });
  const connection = database.writerConnection;

  try {
    await connection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        'point-session', 'point-producer', 'stopped', 100, 13_000,
        'test', 13_000, 2, 0, 2, 12_100, '{}', NULL
      )
    `);

    await connection.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms,
        last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName,
        raw_source
      ) VALUES
        ('1001', true, 1, 100, 12_000, 'AAA', 'Alpha', NULL, 'NYSE', '{"PaperId":1001}'),
        ('2002', true, 1, 100, 12_000, 'BBB', 'Beta', NULL, 'NASDAQ', '{"PaperId":2002}')
    `);

    await connection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'point-session', 1, 'complete', 1_700, 1_900, 2_000, 200, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'point-session', 1, 'complete', 11_700, 11_900, 12_100, 200, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL)
    `);

    await connection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, Price,
        ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'point-session', 1, '1001', 0, 1_700, 1_890, 1_900,
         NULL, 'AAA', 'Alpha', 'NYSE', 100, 0, 100, '{"PaperId":1001,"Price":100}'),
        (1, 'point-session', 1, '2002', 0, 1_700, 1_890, 1_900,
         NULL, 'BBB', 'Beta', 'NASDAQ', 200, 0, 100, '{"PaperId":2002,"Price":200}'),
        (2, 'point-session', 1, '1001', 0, 11_700, 11_890, 12_000,
         NULL, 'AAA', 'Alpha', 'NYSE', 110, 0, 100, '{"PaperId":1001,"Price":110}'),
        (2, 'point-session', 1, '2002', 0, 11_700, 11_890, 12_000,
         NULL, 'BBB', 'Beta', 'NASDAQ', 180, 0, 100, '{"PaperId":2002,"Price":180}')
    `);

    await connection.run("DELETE FROM latest");
    await connection.run("INSERT INTO latest SELECT * FROM history WHERE cycle_id = 2");
  } finally {
    await database.close();
  }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("Backtest shared-point execution composes exact historical Scanner order with future outcome evidence", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-point-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await seedPointEvidence(dbPath);
    const before = await readFile(dbPath);

    const result = await executeBacktestPoint({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000,
      queries: [
        { id: "high", name: "Highest baseline price", sql: "SELECT security_id FROM latest ORDER BY Price DESC" },
        { id: "low", name: "Lowest baseline price", sql: "SELECT security_id FROM latest ORDER BY Price ASC" }
      ],
      topX: 2,
      horizonsMs: [10_000]
    });

    assert.equal(result.available, true);
    assert.deepEqual(result.baseline, { cycleId: 1, committedAtMs: 2_000 });
    assert.deepEqual(result.queries.map((queryResult) => queryResult.items.map((item) => item.securityId)), [
      ["2002", "1001"],
      ["1001", "2002"]
    ]);
    assert.deepEqual(result.queries[0].items.map((item) => item.baseline.price), [200, 100]);
    assert.deepEqual(result.queries[0].items.map((item) => item.horizons[0].price), [180, 110]);
    assert.deepEqual(result.queries[0].items.map((item) => Math.round(item.horizons[0].changePercent)), [-10, 10]);
    assert.equal(result.comparison.commonCount, 2);
    assert.deepEqual(result.comparison.exclusiveCounts, [0, 0]);
    assert.deepEqual(result.comparison.pairs[0].positionChanges, [
      { securityId: "2002", positions: [1, 2], delta: 1 },
      { securityId: "1001", positions: [2, 1], delta: -1 }
    ]);
    assert.deepEqual(await readFile(dbPath), before);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("TREE 11.2 experiment point is exactly Backtest authority with immutable Query Artifact provenance", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-experiment-authority-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  const researchRunId = "run_11111111-1111-4111-8111-111111111111";
  const highSql = "SELECT security_id FROM latest ORDER BY Price DESC";
  const lowSql = "SELECT security_id FROM latest ORDER BY Price ASC";
  const queryArtifacts = [
    Object.freeze({
      queryArtifactId: "qry_11111111-1111-4111-8111-111111111111",
      researchRunId,
      sqlText: highSql,
      sqlHash: sha256(highSql),
      scannerContractVersion: "scanner-authority-v1",
      label: "Highest baseline price"
    }),
    Object.freeze({
      queryArtifactId: "qry_22222222-2222-4222-8222-222222222222",
      researchRunId,
      sqlText: lowSql,
      sqlHash: sha256(lowSql),
      scannerContractVersion: "scanner-authority-v1",
      label: "Lowest baseline price"
    })
  ];

  try {
    await seedPointEvidence(dbPath);
    const before = await readFile(dbPath);

    const direct = await executeBacktestPoint({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000,
      queries: queryArtifacts.map((artifact) => ({
        id: artifact.queryArtifactId,
        name: artifact.label,
        sql: artifact.sqlText
      })),
      topX: 2,
      horizonsMs: [10_000]
    });

    const experiment = await executeAuthoritativeExperimentPoint({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000,
      queryArtifacts,
      topX: 2,
      horizonsMs: [10_000]
    });

    assert.equal(experiment.researchRunId, researchRunId);
    assert.deepEqual(experiment.queryArtifacts, queryArtifacts.map((artifact) => ({
      queryArtifactId: artifact.queryArtifactId,
      sqlHash: artifact.sqlHash,
      scannerContractVersion: artifact.scannerContractVersion
    })));
    assert.deepEqual(experiment.point, direct);
    assert.equal(Object.isFrozen(experiment), true);
    assert.equal(Object.isFrozen(experiment.queryArtifacts), true);
    assert.equal(Object.isFrozen(experiment.point), true);
    assert.deepEqual(await readFile(dbPath), before);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
