import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateBacktestOutcomes } from "../../backtest-lab/outcome-evaluator.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";

async function seedOutcomeEvidence(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-outcome-evaluator-test",
    now: () => 40_000
  });
  const connection = database.writerConnection;

  try {
    await connection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        'outcome-session', 'outcome-producer', 'stopped', 100, 30_000,
        'test', 30_000, 6, 0, 6, 23_100, '{}', NULL
      )
    `);

    await connection.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms,
        last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName,
        raw_source
      ) VALUES (
        '1001', true, 1, 100, 23_100,
        'AAA', 'Alpha', NULL, 'NYSE', '{"PaperId":1001}'
      )
    `);

    await connection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'outcome-session', 1, 'complete', 100, 200, 300, 100, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'outcome-session', 1, 'complete', 1_700, 1_800, 2_000, 100, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (3, 'outcome-session', 1, 'complete', 11_700, 11_800, 12_100, 100, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (4, 'outcome-session', 1, 'complete', 11_710, 11_810, 12_110, 100, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (5, 'outcome-session', 1, 'complete', 21_700, 21_800, 22_100, 100, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (6, 'outcome-session', 1, 'complete', 22_700, 22_800, 23_100, 100, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);

    await connection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, Price,
        ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'outcome-session', 1, '1001', 0, 100, 190, 12_000,
         NULL, 'AAA', 'Alpha', 'NYSE', 999, 0, 100, '{"PaperId":1001,"Price":999}'),
        (2, 'outcome-session', 1, '1001', 0, 1_700, 1_890, 1_900,
         NULL, 'AAA', 'Alpha', 'NYSE', 100, 0, 100, '{"PaperId":1001,"Price":100}'),
        (3, 'outcome-session', 1, '1001', 0, 11_700, 11_890, 12_000,
         NULL, 'AAA', 'Alpha', 'NYSE', 110, 0, 100, '{"PaperId":1001,"Price":110}'),
        (4, 'outcome-session', 1, '1001', 0, 11_710, 11_900, 12_000,
         NULL, 'AAA', 'Alpha', 'NYSE', 120, 0, 100, '{"PaperId":1001,"Price":120}'),
        (5, 'outcome-session', 1, '1001', 0, 21_700, 21_890, 22_000,
         NULL, 'AAA', 'Alpha', 'NYSE', NULL, 0, 100, '{"PaperId":1001,"Price":null}'),
        (6, 'outcome-session', 1, '1001', 0, 22_700, 22_890, 23_000,
         NULL, 'AAA', 'Alpha', 'NYSE', 130, 0, 100, '{"PaperId":1001,"Price":130}')
    `);

    await connection.run("DELETE FROM latest");
    await connection.run("INSERT INTO latest SELECT * FROM history WHERE cycle_id = 6");
  } finally {
    await database.close();
  }
}

test("Backtest outcome evaluator uses post-B set-wise evidence with deterministic tie-break and null-first semantics", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-outcome-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await seedOutcomeEvidence(dbPath);
    const before = await readFile(dbPath);

    const result = await evaluateBacktestOutcomes({
      dataDir,
      sourceId: "active",
      baselineCycleId: 2,
      requestedAtMs: 2_000,
      selectedItems: [
        { returnedPosition: 1, securityId: "1001" }
      ],
      horizonsMs: [10_000, 20_000, 30_000]
    });

    assert.equal(result.baselineCycleId, 2);
    assert.equal(result.requestedAtMs, 2_000);
    assert.deepEqual(result.horizonsMs, [10_000, 20_000, 30_000]);
    assert.equal(result.items.length, 1);

    const item = result.items[0];
    assert.equal(item.returnedPosition, 1);
    assert.equal(item.securityId, "1001");
    assert.deepEqual(item.baseline, {
      cycleId: 2,
      collectedAtMs: 1_900,
      price: 100,
      symbol: "AAA",
      paperName: "Alpha",
      exchangeName: "NYSE",
      ageMs: 100,
      timingAnomaly: null
    });

    assert.deepEqual(item.horizons[0], {
      horizonMs: 10_000,
      targetAtMs: 12_000,
      futureCycleId: 3,
      observedAtMs: 12_000,
      actualElapsedMs: 10_000,
      price: 110,
      changePercent: 10.000000000000009,
      outcome: "UP",
      unavailableReason: null,
      timingAnomaly: null
    });

    assert.deepEqual(item.horizons[1], {
      horizonMs: 20_000,
      targetAtMs: 22_000,
      futureCycleId: 5,
      observedAtMs: 22_000,
      actualElapsedMs: 20_000,
      price: null,
      changePercent: null,
      outcome: "UNAVAILABLE",
      unavailableReason: "FUTURE_PRICE_UNAVAILABLE",
      timingAnomaly: null
    });

    assert.deepEqual(item.horizons[2], {
      horizonMs: 30_000,
      targetAtMs: 32_000,
      futureCycleId: null,
      observedAtMs: null,
      actualElapsedMs: null,
      price: null,
      changePercent: null,
      outcome: "UNAVAILABLE",
      unavailableReason: "NO_FUTURE_OBSERVATION",
      timingAnomaly: null
    });

    assert.deepEqual(await readFile(dbPath), before);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
