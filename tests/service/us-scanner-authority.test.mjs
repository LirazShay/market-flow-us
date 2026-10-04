import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createScannerAuthority } from "../../local-service/scanner/scanner.js";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";

const CURRENT_AT_MS = 200000;

function builtin(queryId) {
  const query = MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.find(
    (item) => item.queryId === queryId
  );
  assert.ok(query, `Missing U.S. Scanner built-in ${queryId}`);
  return query;
}

async function insertHistory(connection, {
  cycleId,
  securityId,
  collectedAtMs,
  price
}) {
  await connection.run(
    `INSERT INTO history (
      cycle_id, session_id, universe_revision, security_id, chunk_index,
      cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      source_metadata_json, Price, raw_data
    ) VALUES (
      $cycleId, 'scanner-us-session', 1, $securityId, 0,
      $collectedAtMs, $collectedAtMs, $collectedAtMs,
      '{}', $price, '{}'
    )`,
    { cycleId, securityId, collectedAtMs, price }
  );
}

async function insertLatest(connection, {
  cycleId,
  securityId,
  symbol,
  price,
  changePercent,
  dailyVolume
}) {
  await connection.run(
    `INSERT INTO latest (
      cycle_id, session_id, universe_revision, security_id, chunk_index,
      cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      source_metadata_json, Symbol, PaperNameEng, ExchangeName,
      Price, ChangePercent, DailyVolume, raw_data
    ) VALUES (
      $cycleId, 'scanner-us-session', 1, $securityId, 0,
      $collectedAtMs, $collectedAtMs, $collectedAtMs,
      '{}', $symbol, $paperNameEng, 'NASDAQ',
      $price, $changePercent, $dailyVolume, '{}'
    )`,
    {
      cycleId,
      securityId,
      collectedAtMs: CURRENT_AT_MS,
      symbol,
      paperNameEng: `${symbol} Corp`,
      price,
      changePercent,
      dailyVolume
    }
  );
}

async function seedStageHistory(connection, {
  securityId,
  currentPrice,
  stages,
  cycleBase
}) {
  const ages = [10, 20, 30, 45, 60, 90, 120];
  let cycleId = cycleBase;

  for (let index = 0; index < stages.length; index += 1) {
    const ageSeconds = ages[index];
    const price = stages[index];
    await insertHistory(connection, {
      cycleId,
      securityId,
      collectedAtMs: CURRENT_AT_MS - ageSeconds * 1000,
      price
    });
    cycleId += 1;
  }

  await insertLatest(connection, {
    cycleId: cycleBase + 100,
    securityId,
    symbol: `S${securityId}`,
    price: currentPrice,
    changePercent: 0,
    dailyVolume: 0
  });
}

function rowsAsObjects(result) {
  const names = result.columns.map((column) => column.name);
  return result.rows.map((row) => Object.fromEntries(
    names.map((name, index) => [name, row[index]])
  ));
}

async function createFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-scanner-"));
  const dbPath = path.join(tempDir, "scanner-v3.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "scanner-us-test",
    now: () => 1
  });
  const scanner = await createScannerAuthority({
    connection: database.scannerConnection,
    now: () => 1000
  });

  return {
    tempDir,
    database,
    scanner,
    async cleanup() {
      await database.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

test("Market Flow US Scanner profile contains bounded current, ranking and staged built-ins", () => {
  assert.deepEqual(
    MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.map((query) => [
      query.queryId,
      query.name,
      query.intervalMs,
      query.editable,
      query.deletable
    ]),
    [
      ["builtin:all-current-fields", "All current fields", 5000, false, false],
      ["builtin:market-ranking-example", "U.S. market ranking example", 5000, false, false],
      ["builtin:staged-candidate-ranking", "Staged candidate ranking", 5000, false, false]
    ]
  );

  for (const query of MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES) {
    assert.match(query.sql, /\bLIMIT\s+\d+\s*;/i, `${query.queryId} must be bounded`);
  }

  const staged = builtin("builtin:staged-candidate-ranking").sql;
  for (const ageMs of [10000, 20000, 30000, 45000, 60000, 90000, 120000]) {
    assert.ok(staged.includes(`l.collected_at_ms - ${ageMs}`), `missing ${ageMs}ms stage`);
  }
  assert.match(staged, /security_id AS securityId/);
  assert.match(staged, /ORDER BY stage_reached DESC/);
});

test("all Market Flow US built-ins are admitted and execute against a real schema-v3 DuckDB", async () => {
  const fixture = await createFixture();

  try {
    await insertLatest(fixture.database.writerConnection, {
      cycleId: 1,
      securityId: "101",
      symbol: "AAA",
      price: 10,
      changePercent: 1.5,
      dailyVolume: 1000
    });
    await insertHistory(fixture.database.writerConnection, {
      cycleId: 2,
      securityId: "101",
      collectedAtMs: CURRENT_AT_MS - 120000,
      price: 9
    });

    for (const query of MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES) {
      const result = await fixture.scanner.execute(query.sql);
      assert.ok(Array.isArray(result.columns), query.queryId);
      assert.ok(Array.isArray(result.rows), query.queryId);
      assert.ok(Number.isSafeInteger(result.rowCount), query.queryId);
    }
  } finally {
    await fixture.cleanup();
  }
});

test("staged candidate ranking gives only contiguous credit, stops on missing history and applies deterministic tie-breakers", async () => {
  const fixture = await createFixture();
  const writer = fixture.database.writerConnection;

  try {
    // Four full-stage rows exercise ChangePercent, DailyVolume and securityId tie-breaks.
    for (const candidate of [
      { securityId: "1001", price: 110, change: 5, volume: 1000, base: 100 },
      { securityId: "2002", price: 120, change: 5, volume: 500, base: 200 },
      { securityId: "2003", price: 125, change: 5, volume: 500, base: 300 },
      { securityId: "3001", price: 130, change: 4, volume: 9999, base: 400 }
    ]) {
      await seedStageHistory(writer, {
        securityId: candidate.securityId,
        currentPrice: candidate.price,
        stages: [
          candidate.price - 1,
          candidate.price - 2,
          candidate.price - 3,
          candidate.price - 4,
          candidate.price - 5,
          candidate.price - 6,
          candidate.price - 7
        ],
        cycleBase: candidate.base
      });
      await writer.run(
        `UPDATE latest
         SET ChangePercent = $change, DailyVolume = $volume
         WHERE security_id = $securityId`,
        {
          securityId: candidate.securityId,
          change: candidate.change,
          volume: candidate.volume
        }
      );
    }

    // Same collected_at_ms must choose the highest cycle_id before evaluating stage 10s.
    await insertHistory(writer, {
      cycleId: 99,
      securityId: "1001",
      collectedAtMs: CURRENT_AT_MS - 10000,
      price: 111
    });
    await insertHistory(writer, {
      cycleId: 199,
      securityId: "1001",
      collectedAtMs: CURRENT_AT_MS - 10000,
      price: 109
    });

    // Passes 10s and 20s, then fails at 30s; older successes cannot restore credit.
    await seedStageHistory(writer, {
      securityId: "4001",
      currentPrice: 100,
      stages: [90, 95, 105, 80, 70, 60, 50],
      cycleBase: 500
    });
    await writer.run(
      "UPDATE latest SET ChangePercent = 20, DailyVolume = 20000 WHERE security_id = '4001'"
    );

    // Has a 10s row only. The absent <=20s row must end progression at stage 1.
    await seedStageHistory(writer, {
      securityId: "5001",
      currentPrice: 100,
      stages: [90],
      cycleBase: 600
    });
    await writer.run(
      "UPDATE latest SET ChangePercent = 30, DailyVolume = 30000 WHERE security_id = '5001'"
    );

    const result = await fixture.scanner.execute(
      builtin("builtin:staged-candidate-ranking").sql
    );
    const rows = rowsAsObjects(result);

    assert.deepEqual(
      rows.map((row) => [row.securityId, row.stage_reached]),
      [
        ["1001", 7],
        ["2002", 7],
        ["2003", 7],
        ["3001", 7],
        ["4001", 2],
        ["5001", 1]
      ]
    );

    const alpha = rows.find((row) => row.securityId === "1001");
    assert.equal(alpha.price_10s_ago, 109);

    const missing = rows.find((row) => row.securityId === "5001");
    assert.equal(missing.price_10s_ago, 90);
    assert.equal(missing.price_20s_ago, null);
  } finally {
    await fixture.cleanup();
  }
});
