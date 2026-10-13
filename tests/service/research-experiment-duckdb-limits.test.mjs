import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  duckDbSizeToBytes,
  resolveResearchDuckDbResourceLimits
} from "../../backtest-lab/duckdb-resource-limits.js";
import { openBacktestEvidenceSource } from "../../backtest-lab/evidence-source.js";
import { openBacktestHistoricalScanner } from "../../backtest-lab/historical-scanner.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";

const LIMITS = Object.freeze({
  threads: 1,
  memoryLimit: "128MB",
  maxTempDirectorySize: "256MB"
});

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-experiment-duckdb-limits-test-v1",
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
        (1, 'resource-limit-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'resource-limit-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

async function settings(connection) {
  const reader = await connection.runAndReadAll(`
    SELECT
      current_setting('threads') AS threads,
      current_setting('memory_limit') AS memory_limit,
      current_setting('max_temp_directory_size') AS max_temp_directory_size
  `);
  const rows = reader.getRowObjects();
  assert.equal(rows.length, 1);
  return rows[0];
}

function assertBoundedSize(actual, requested, label) {
  const actualBytes = duckDbSizeToBytes(String(actual));
  const requestedBytes = duckDbSizeToBytes(requested);
  assert.ok(actualBytes > 0, `${label} must stay positive`);
  assert.ok(
    actualBytes <= requestedBytes * 1.02,
    `${label} ${actual} must not exceed requested ${requested}`
  );
}

test("TREE 11.4 Research DuckDB resource limits are bounded, configurable and reject unsafe values", () => {
  assert.deepEqual(
    resolveResearchDuckDbResourceLimits(undefined, {
      MARKET_FLOW_US_RESEARCH_DUCKDB_THREADS: "2",
      MARKET_FLOW_US_RESEARCH_DUCKDB_MEMORY_LIMIT: "384MB",
      MARKET_FLOW_US_RESEARCH_DUCKDB_MAX_TEMP_DIRECTORY_SIZE: "1GB"
    }),
    {
      threads: 2,
      memoryLimit: "384MB",
      maxTempDirectorySize: "1GB"
    }
  );

  assert.throws(
    () => resolveResearchDuckDbResourceLimits({ threads: 0 }),
    /threads must be an integer between 1 and 64/u
  );
  assert.throws(
    () => resolveResearchDuckDbResourceLimits({ memoryLimit: "unbounded" }),
    /memoryLimit must be a bounded DuckDB byte-size string/u
  );
  assert.throws(
    () => resolveResearchDuckDbResourceLimits({ maxTempDirectorySize: "0MB" }),
    /maxTempDirectorySize must be greater than zero/u
  );
});

test("TREE 11.4 Research evidence DuckDB applies CPU/RAM/temp-disk ceilings before configuration lock", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-duckdb-limits-"));
  let evidence = null;

  try {
    await seedMarketData(dataDir);
    evidence = await openBacktestEvidenceSource({
      dataDir,
      sourceId: "active",
      duckdbResourceLimits: LIMITS
    });

    assert.deepEqual(evidence.resourceLimits, LIMITS);
    const applied = await settings(evidence.connection);
    assert.equal(Number(applied.threads), 1);
    assertBoundedSize(applied.memory_limit, LIMITS.memoryLimit, "memory_limit");
    assertBoundedSize(
      applied.max_temp_directory_size,
      LIMITS.maxTempDirectorySize,
      "max_temp_directory_size"
    );
    await assert.rejects(() => evidence.connection.run("SET threads = 2"));
  } finally {
    if (evidence) await evidence.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 Research historical Scanner carries the same DuckDB ceilings without changing query semantics", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-historical-limits-"));
  let historical = null;

  try {
    await seedMarketData(dataDir);
    historical = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000,
      now: () => 1_860_000_000_000,
      duckdbResourceLimits: LIMITS
    });

    assert.equal(historical.available, true);
    assert.deepEqual(historical.resourceLimits, LIMITS);
    const result = await historical.scanner.execute(
      "SELECT security_id, Price FROM latest ORDER BY security_id ASC"
    );
    assert.equal(result.rowCount, 1);
    assert.deepEqual(result.rows, [["1001", 100]]);
  } finally {
    if (historical) await historical.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
