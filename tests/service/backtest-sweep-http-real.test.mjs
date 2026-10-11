import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startBacktestLabRuntime } from "../../backtest-lab/runtime.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";

async function postJson(runtime, pathname, body) {
  const response = await fetch(`http://${runtime.host}:${runtime.port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

async function seedSweepEvidence(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-sweep-http-real-test",
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
        'sweep-session', 'sweep-producer', 'stopped', 100, 13_500,
        'test', 13_500, 3, 0, 3, 13_200, '{}', NULL
      )
    `);

    await connection.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms,
        last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName,
        raw_source
      ) VALUES
        ('1001', true, 1, 100, 13_200, 'AAA', 'Alpha', NULL, 'NYSE', '{"PaperId":1001}')
    `);

    await connection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'sweep-session', 1, 'complete', 1_700, 1_900, 2_000, 200, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'sweep-session', 1, 'complete', 11_700, 11_900, 12_100, 200, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (3, 'sweep-session', 1, 'complete', 12_700, 12_900, 13_100, 200, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);

    await connection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, Price,
        ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'sweep-session', 1, '1001', 0, 1_700, 1_890, 1_900,
         NULL, 'AAA', 'Alpha', 'NYSE', 100, 0, 100, '{"PaperId":1001,"Price":100}'),
        (2, 'sweep-session', 1, '1001', 0, 11_700, 11_890, 12_000,
         NULL, 'AAA', 'Alpha', 'NYSE', 110, 0, 100, '{"PaperId":1001,"Price":110}'),
        (3, 'sweep-session', 1, '1001', 0, 12_700, 12_890, 13_000,
         NULL, 'AAA', 'Alpha', 'NYSE', 120, 0, 100, '{"PaperId":1001,"Price":120}')
    `);

    await connection.run("DELETE FROM latest");
    await connection.run("INSERT INTO latest SELECT * FROM history WHERE cycle_id = 3");
  } finally {
    await database.close();
  }
}

test("real Backtest Sweep HTTP keeps shared baseline selection while Open preserves each T0 outcome", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-sweep-http-real-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  let runtime = null;

  try {
    await seedSweepEvidence(dbPath);
    const before = await readFile(dbPath);
    runtime = await startBacktestLabRuntime({ dataDir, port: 0 });

    const run = await postJson(runtime, "/api/sweep/run", {
      sourceId: "active",
      fromAtMs: 2_000,
      toAtMs: 3_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      queries: [{
        id: "price",
        name: "Price",
        sql: "SELECT security_id FROM latest ORDER BY Price DESC"
      }],
      topX: 1,
      horizonsMs: [10_000]
    });

    assert.equal(run.status, 200);
    assert.deepEqual(run.body.sweep.metrics, {
      requestedPointCount: 2,
      availablePointCount: 2,
      unavailablePointCount: 0,
      distinctBaselineCount: 1,
      queryExecutionCount: 1
    });
    assert.deepEqual(run.body.sweep.page.items.map((item) => [
      item.requestedAtMs,
      item.baseline.cycleId,
      Math.round(item.queries[0].summary[0].averagePercent)
    ]), [
      [2_000, 1, 10],
      [3_000, 1, 20]
    ]);

    const first = await postJson(runtime, "/api/sweep/open", {
      sweepId: run.body.sweep.id,
      index: 0
    });
    const second = await postJson(runtime, "/api/sweep/open", {
      sweepId: run.body.sweep.id,
      index: 1
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.point.requestedAtMs, 2_000);
    assert.equal(second.body.point.requestedAtMs, 3_000);
    assert.deepEqual(first.body.point.baseline, { cycleId: 1, committedAtMs: 2_000 });
    assert.deepEqual(second.body.point.baseline, { cycleId: 1, committedAtMs: 2_000 });
    assert.equal(first.body.point.queries[0].items[0].horizons[0].price, 110);
    assert.equal(second.body.point.queries[0].items[0].horizons[0].price, 120);
    assert.equal(Math.round(first.body.point.queries[0].items[0].horizons[0].changePercent), 10);
    assert.equal(Math.round(second.body.point.queries[0].items[0].horizons[0].changePercent), 20);
    assert.deepEqual(await readFile(dbPath), before);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
