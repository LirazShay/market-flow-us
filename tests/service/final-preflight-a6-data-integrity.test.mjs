import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createScannerAuthority } from "../../local-service/scanner/scanner.js";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

const STRING_FIELDS = Object.freeze([
  "Symbol",
  "PaperNameEng",
  "PaperNameHeb",
  "ExchangeName",
  "TradeDateTime",
  "CountryName",
  "CountryNameEng"
]);

const NUMERIC_FIELDS = Object.freeze([
  "Price",
  "ChangePercent",
  "DailyHigh",
  "DailyLow",
  "YearHigh",
  "YearLow",
  "DailyVolume",
  "BeginYearChangePercent",
  "Month12ChangePercent",
  "Month36ChangePercent",
  "AskRate",
  "BidRate",
  "YesterdayRate",
  "PaperMarketCap",
  "PaperIdYatab",
  "CountryId",
  "PaperType",
  "ESGRatingId",
  "ESGScope"
]);

function providerEnvelope(row) {
  return {
    data: {
      ScreenerHulPaging: {
        recordCount: 1,
        maxDateChange: "2026-10-05",
        records: [row]
      }
    },
    resultCode: 0,
    rsCount: 1,
    rtUsa: true,
    serverId: "a6-provider",
    version: "a6-v1"
  };
}

function exactSourceRow() {
  return {
    Id: 701,
    PaperId: 7001,
    Symbol: "A6SYM",
    PaperNameEng: "A6 English",
    PaperNameHeb: "A6 Local",
    ExchangeName: "NASDAQ-A6",
    TradeDateTime: "2026-10-05T15:30:10.123",
    CountryName: "United States A6",
    CountryNameEng: "United States English A6",
    Price: 101.125,
    ChangePercent: 2.25,
    DailyHigh: 103.375,
    DailyLow: 97.625,
    YearHigh: 150.5,
    YearLow: 70.75,
    DailyVolume: 123456.5,
    BeginYearChangePercent: 3.125,
    Month12ChangePercent: 4.25,
    Month36ChangePercent: 5.375,
    AskRate: 101.5,
    BidRate: 101.0,
    YesterdayRate: 99.875,
    PaperMarketCap: 987654321.25,
    PaperIdYatab: 17001,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: 4,
    ESGScope: 2,
    Logo: "raw-only-logo",
    ExtraProviderField: "raw-only-extra"
  };
}

function wireUniverse(universe) {
  return {
    loadedAtMs: universe.loadedAtMs,
    recordCount: universe.recordCount,
    securities: universe.securities
  };
}

function rowObject(result, index = 0) {
  const names = result.columns.map((column) => column.name);
  return Object.fromEntries(names.map((name, columnIndex) => [name, result.rows[index][columnIndex]]));
}

test("critical U.S. data path preserves every typed provider projection in the correct DuckDB column", async () => {
  const source = exactSourceRow();
  const snapshot = buildValidatedSnapshot({
    responseJson: providerEnvelope(source),
    timing: {
      startedAtMs: 1000,
      responseReceivedAtMs: 1010,
      completedAtMs: 1020
    },
    httpStatus: 200
  });
  const candidate = buildUsCollectionCandidate(snapshot);
  const fixture = await createServiceFixture({ openDatabase: openMarketFlowUsDatabase });
  let producer = null;

  try {
    producer = await fixture.connect("producer", "a6-data-integrity-producer");
    const started = await producer.request("producer.session.start", {
      startedAtMs: 900,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(started.type, "response.ok");

    const replaced = await producer.request("producer.universe.replace", wireUniverse(candidate.universe));
    assert.equal(replaced.type, "response.ok");

    const committed = await producer.request("producer.cycle.commit", {
      universeRevision: replaced.payload.data.universeRevision,
      cycle: candidate.cycle
    });
    assert.equal(committed.type, "response.ok");

    const projection = ["security_id", ...STRING_FIELDS, ...NUMERIC_FIELDS, "raw_data"].join(", ");
    const history = await fixture.rows(`SELECT ${projection} FROM history`);
    const latest = await fixture.rows(`SELECT ${projection} FROM latest`);
    assert.equal(history.length, 1);
    assert.equal(latest.length, 1);

    for (const persisted of [history[0], latest[0]]) {
      assert.equal(persisted.security_id, String(source.PaperId));
      for (const field of STRING_FIELDS) {
        assert.equal(persisted[field], source[field], `${field} column mapping`);
      }
      for (const field of NUMERIC_FIELDS) {
        assert.equal(Number(persisted[field]), source[field], `${field} column mapping`);
      }
      assert.deepEqual(JSON.parse(persisted.raw_data), source);
    }
  } finally {
    await producer?.close().catch(() => {});
    await fixture.cleanup();
  }
});

test("critical staged Scanner resolves each 10/20/30/45/60/90/120-second anchor independently", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-a6-anchors-"));
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(tempDir, "anchors.duckdb"),
    productVersion: "a6-anchor-proof",
    now: () => 1
  });
  const scanner = await createScannerAuthority({ connection: database.scannerConnection });
  const currentAtMs = 500000;
  const currentPrice = 1000;
  const anchors = [
    [10000, "price_10s_ago", 10],
    [20000, "price_20s_ago", 20],
    [30000, "price_30s_ago", 30],
    [45000, "price_45s_ago", 45],
    [60000, "price_60s_ago", 60],
    [90000, "price_90s_ago", 90],
    [120000, "price_120s_ago", 120]
  ];

  try {
    let cycleId = 1;
    for (const [ageMs, , expectedPrice] of anchors) {
      const targetAtMs = currentAtMs - ageMs;
      await database.writerConnection.run(
        `INSERT INTO history (
          cycle_id, session_id, universe_revision, security_id, chunk_index,
          cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
          source_metadata_json, Price, raw_data
        ) VALUES (
          $cycleId, 'a6-anchor-session', 1, '7001', 0,
          $collectedAtMs, $collectedAtMs, $collectedAtMs,
          '{}', $price, '{}'
        )`,
        {
          cycleId,
          collectedAtMs: targetAtMs - 321,
          price: expectedPrice
        }
      );
      cycleId += 1;

      await database.writerConnection.run(
        `INSERT INTO history (
          cycle_id, session_id, universe_revision, security_id, chunk_index,
          cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
          source_metadata_json, Price, raw_data
        ) VALUES (
          $cycleId, 'a6-anchor-session', 1, '7001', 0,
          $collectedAtMs, $collectedAtMs, $collectedAtMs,
          '{}', 9999, '{}'
        )`,
        {
          cycleId,
          collectedAtMs: targetAtMs + 1
        }
      );
      cycleId += 1;
    }

    await database.writerConnection.run(
      `INSERT INTO latest (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES (
        999, 'a6-anchor-session', 1, '7001', 0,
        $currentAtMs, $currentAtMs, $currentAtMs,
        '{}', 'A6', 'A6 Anchor', 'NASDAQ',
        $currentPrice, 1, 100, '{}'
      )`,
      { currentAtMs, currentPrice }
    );

    const builtIn = MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.find(
      (query) => query.queryId === "builtin:staged-candidate-ranking"
    );
    assert.ok(builtIn);

    const result = await scanner.execute(builtIn.sql);
    assert.equal(result.rowCount, 1);
    const row = rowObject(result);
    assert.equal(row.securityId, "7001");
    assert.equal(Number(row.stage_reached), 7);
    for (const [, field, expectedPrice] of anchors) {
      assert.equal(Number(row[field]), expectedPrice, field);
    }
  } finally {
    await database.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
