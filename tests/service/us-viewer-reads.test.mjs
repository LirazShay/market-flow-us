import assert from "node:assert/strict";
import test from "node:test";
import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function rawSecurity({
  paperId,
  symbol,
  paperNameEng,
  paperNameHeb = null,
  exchangeName = "NASDAQ",
  price,
  changePercent = 1.25,
  bidRate = null,
  askRate = null,
  dailyVolume = null,
  dailyLow = null,
  dailyHigh = null,
  yesterdayRate = null,
  paperMarketCap = null,
  tradeDateTime = null
}) {
  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: paperNameEng,
    PaperNameHeb: paperNameHeb,
    ExchangeName: exchangeName,
    TradeDateTime: tradeDateTime,
    Price: price,
    ChangePercent: changePercent,
    BidRate: bidRate,
    AskRate: askRate,
    DailyVolume: dailyVolume,
    DailyLow: dailyLow,
    DailyHigh: dailyHigh,
    YesterdayRate: yesterdayRate,
    PaperMarketCap: paperMarketCap
  };
}

function candidate({ startedAtMs, completedAtMs, rows }) {
  const responseIds = rows.map((row) => String(row.PaperId));
  return buildUsCollectionCandidate({
    recordCount: rows.length,
    records: rows,
    responseIds,
    membership: [...responseIds].sort(),
    timing: {
      startedAtMs,
      responseReceivedAtMs: completedAtMs - 10,
      completedAtMs,
      durationMs: completedAtMs - startedAtMs
    },
    sourceMetadata: {
      endpoint: "ScreenerHulPaging3",
      source: "synthetic-viewer-test"
    },
    httpStatus: 200
  });
}

function wireUniverse(value) {
  return {
    loadedAtMs: value.loadedAtMs,
    recordCount: value.recordCount,
    securities: value.securities
  };
}

async function startProducer(fixture) {
  const producer = await fixture.connect("producer", "us-viewer-producer");
  const started = await producer.request("producer.session.start", {
    startedAtMs: 1000,
    config: { snapshotIntervalMs: 3000 }
  });
  assert.equal(started.type, "response.ok");
  return producer;
}

async function replaceAndCommit(producer, value) {
  const replaced = await producer.request(
    "producer.universe.replace",
    wireUniverse(value.universe)
  );
  assert.equal(replaced.type, "response.ok");

  const committed = await producer.request("producer.cycle.commit", {
    universeRevision: replaced.payload.data.universeRevision,
    cycle: value.cycle
  });
  assert.equal(committed.type, "response.ok");
  return committed.payload.data;
}

test("schema-v3 trusted reads expose U.S. Current/Security/status shapes and display-name fallback", async () => {
  const clock = { value: 10000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase
  });

  try {
    const viewer = await fixture.connect("viewer", "us-viewer-reader");

    const emptyCurrent = await viewer.request("viewer.current.get");
    assert.equal(emptyCurrent.type, "response.ok");
    assert.deepEqual(emptyCurrent.payload.data, {
      rows: [],
      summary: {
        rowCount: 0,
        lastCycleId: null,
        lastCollectedAtMs: null
      }
    });

    const emptyStatus = await viewer.request("viewer.status.get");
    assert.equal(emptyStatus.type, "response.ok");
    assert.equal(emptyStatus.payload.data.latestCount, 0);
    assert.equal(emptyStatus.payload.data.completedCycles, 0);
    assert.equal(emptyStatus.payload.data.failedCycles, 0);
    assert.equal(emptyStatus.payload.data.historyCount, 0);

    const producer = await startProducer(fixture);
    const first = candidate({
      startedAtMs: 2000,
      completedAtMs: 2100,
      rows: [
        rawSecurity({
          paperId: 101,
          symbol: "AAA",
          paperNameEng: "Alpha Inc",
          price: 0,
          changePercent: 0,
          bidRate: 9.9,
          askRate: 10.1,
          dailyVolume: 0,
          dailyLow: 9,
          dailyHigh: 11,
          yesterdayRate: 10,
          paperMarketCap: 1000000,
          tradeDateTime: "2026-10-04T19:00:00"
        }),
        rawSecurity({
          paperId: 202,
          symbol: "BBB",
          paperNameEng: "",
          paperNameHeb: "Beta Local",
          price: 20,
          dailyVolume: 2000
        }),
        rawSecurity({
          paperId: 303,
          symbol: "CCC",
          paperNameEng: null,
          paperNameHeb: "",
          price: 30,
          dailyVolume: 3000
        }),
        rawSecurity({
          paperId: 404,
          symbol: null,
          paperNameEng: null,
          paperNameHeb: null,
          price: null,
          changePercent: null,
          dailyVolume: null
        })
      ]
    });
    await replaceAndCommit(producer, first);

    const current = await viewer.request("viewer.current.get");
    assert.equal(current.type, "response.ok");
    assert.deepEqual(current.payload.data.summary, {
      rowCount: 4,
      lastCycleId: 1,
      lastCollectedAtMs: 2100
    });
    assert.deepEqual(current.payload.data.rows, [
      {
        paperName: "Alpha Inc",
        Symbol: "AAA",
        ExchangeName: "NASDAQ",
        securityId: "101",
        Price: 0,
        ChangePercent: 0,
        BidRate: 9.9,
        AskRate: 10.1,
        DailyVolume: 0,
        DailyLow: 9,
        DailyHigh: 11,
        YesterdayRate: 10,
        PaperMarketCap: 1000000,
        TradeDateTime: "2026-10-04T19:00:00",
        collectedAtMs: 2100
      },
      {
        paperName: "Beta Local",
        Symbol: "BBB",
        ExchangeName: "NASDAQ",
        securityId: "202",
        Price: 20,
        ChangePercent: 1.25,
        BidRate: null,
        AskRate: null,
        DailyVolume: 2000,
        DailyLow: null,
        DailyHigh: null,
        YesterdayRate: null,
        PaperMarketCap: null,
        TradeDateTime: null,
        collectedAtMs: 2100
      },
      {
        paperName: "CCC",
        Symbol: "CCC",
        ExchangeName: "NASDAQ",
        securityId: "303",
        Price: 30,
        ChangePercent: 1.25,
        BidRate: null,
        AskRate: null,
        DailyVolume: 3000,
        DailyLow: null,
        DailyHigh: null,
        YesterdayRate: null,
        PaperMarketCap: null,
        TradeDateTime: null,
        collectedAtMs: 2100
      },
      {
        paperName: "404",
        Symbol: null,
        ExchangeName: "NASDAQ",
        securityId: "404",
        Price: null,
        ChangePercent: null,
        BidRate: null,
        AskRate: null,
        DailyVolume: null,
        DailyLow: null,
        DailyHigh: null,
        YesterdayRate: null,
        PaperMarketCap: null,
        TradeDateTime: null,
        collectedAtMs: 2100
      }
    ]);

    const currentSecurity = await viewer.request("viewer.security.get", {
      securityId: "101"
    });
    assert.equal(currentSecurity.type, "response.ok");
    assert.equal(currentSecurity.payload.data.found, true);
    assert.equal(currentSecurity.payload.data.paperName, "Alpha Inc");
    assert.equal(currentSecurity.payload.data.isCurrent, true);
    assert.deepEqual(currentSecurity.payload.data.currentRow, current.payload.data.rows[0]);

    clock.value = 10100;
    const second = candidate({
      startedAtMs: 3000,
      completedAtMs: 3100,
      rows: [
        rawSecurity({
          paperId: 202,
          symbol: "BBB",
          paperNameEng: "",
          paperNameHeb: "Beta Local",
          price: 21,
          dailyVolume: 2100
        }),
        rawSecurity({
          paperId: 303,
          symbol: "CCC",
          paperNameEng: null,
          paperNameHeb: "",
          price: 31,
          dailyVolume: 3100
        }),
        rawSecurity({
          paperId: 404,
          symbol: null,
          paperNameEng: null,
          paperNameHeb: null,
          price: null,
          changePercent: null,
          dailyVolume: null
        })
      ]
    });
    await replaceAndCommit(producer, second);

    const historicalOnly = await viewer.request("viewer.security.get", {
      securityId: "101"
    });
    assert.deepEqual(historicalOnly.payload.data, {
      found: true,
      securityId: "101",
      paperName: "Alpha Inc",
      isCurrent: false,
      currentRow: null
    });

    const unknown = await viewer.request("viewer.security.get", {
      securityId: "999"
    });
    assert.deepEqual(unknown.payload.data, {
      found: false,
      securityId: "999",
      paperName: null,
      isCurrent: false,
      currentRow: null
    });

    const status = await viewer.request("viewer.status.get");
    assert.equal(status.type, "response.ok");
    assert.equal(status.payload.data.latestCount, 3);
    assert.equal(status.payload.data.completedCycles, 2);
    assert.equal(status.payload.data.failedCycles, 0);
    assert.equal(status.payload.data.historyCount, 7);
    assert.equal(status.payload.data.lastCompletedCycleId, 2);

    await producer.close();
    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("schema-v3 history keeps 500-row keyset continuation and binds cursors to security", async () => {
  const fixture = await createServiceFixture({
    openDatabase: openMarketFlowUsDatabase
  });

  try {
    await fixture.service.database.writerConnection.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms,
        last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName, raw_source
      ) VALUES (
        '9001', false, 1, 1, 1, 'HIST', 'History Only', NULL, 'NASDAQ',
        '{"PaperId":9001,"Symbol":"HIST","PaperNameEng":"History Only"}'
      )
    `);

    await fixture.service.database.writerConnection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        Symbol, PaperNameEng, ExchangeName, Price, ChangePercent,
        BidRate, AskRate, DailyVolume, DailyLow, DailyHigh,
        YesterdayRate, PaperMarketCap, TradeDateTime, raw_data
      )
      SELECT
        10000 + n,
        'synthetic-session',
        1,
        '9001',
        0,
        9000,
        9990,
        10000,
        'HIST',
        'History Only',
        'NASDAQ',
        CAST(n AS DOUBLE),
        1.5,
        CAST(n AS DOUBLE) - 0.1,
        CAST(n AS DOUBLE) + 0.1,
        CAST(n AS DOUBLE) * 10,
        CAST(n AS DOUBLE) - 1,
        CAST(n AS DOUBLE) + 1,
        CAST(n AS DOUBLE) - 0.5,
        1000000 + n,
        CAST(n AS VARCHAR),
        '{}'
      FROM range(502) AS rows(n)
    `);

    const viewer = await fixture.connect("viewer", "us-history-reader");

    const security = await viewer.request("viewer.security.get", {
      securityId: "9001"
    });
    assert.deepEqual(security.payload.data, {
      found: true,
      securityId: "9001",
      paperName: "History Only",
      isCurrent: false,
      currentRow: null
    });

    const first = await viewer.request("viewer.history.page", {
      securityId: "9001",
      cursor: null
    });
    assert.equal(first.type, "response.ok");
    assert.equal(first.payload.data.rows.length, 500);
    assert.equal(first.payload.data.hasMore, true);
    assert.equal(typeof first.payload.data.nextCursor, "string");
    assert.deepEqual(first.payload.data.rows[0], {
      collectedAtMs: 10000,
      cycleId: 10501,
      Price: 501,
      ChangePercent: 1.5,
      BidRate: 500.9,
      AskRate: 501.1,
      DailyVolume: 5010,
      DailyLow: 500,
      DailyHigh: 502,
      YesterdayRate: 500.5,
      PaperMarketCap: 1000501,
      TradeDateTime: "501"
    });
    assert.equal(first.payload.data.rows[499].cycleId, 10002);

    const second = await viewer.request("viewer.history.page", {
      securityId: "9001",
      cursor: first.payload.data.nextCursor
    });
    assert.equal(second.type, "response.ok");
    assert.deepEqual(second.payload.data.rows.map((row) => row.cycleId), [10001, 10000]);
    assert.equal(second.payload.data.hasMore, false);
    assert.equal(second.payload.data.nextCursor, null);

    const allIds = [
      ...first.payload.data.rows.map((row) => row.cycleId),
      ...second.payload.data.rows.map((row) => row.cycleId)
    ];
    assert.equal(allIds.length, 502);
    assert.equal(new Set(allIds).size, 502);

    const wrongSecurityCursor = await viewer.request("viewer.history.page", {
      securityId: "9002",
      cursor: first.payload.data.nextCursor
    });
    assert.equal(wrongSecurityCursor.type, "response.error");
    assert.equal(wrongSecurityCursor.payload.code, "CURSOR_INVALID");

    const empty = await viewer.request("viewer.history.page", {
      securityId: "9002",
      cursor: null
    });
    assert.deepEqual(empty.payload.data, {
      rows: [],
      hasMore: false,
      nextCursor: null
    });

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
