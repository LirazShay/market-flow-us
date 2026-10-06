import assert from "node:assert/strict";
import test from "node:test";

import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function rawSecurity(paperId, symbol, price) {
  const numericPrice = price === null ? null : Number(price);
  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: `${symbol} Incorporated`,
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-06T10:00:00",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: numericPrice,
    ChangePercent: numericPrice === null ? null : 1,
    DailyHigh: numericPrice === null ? null : numericPrice + 1,
    DailyLow: numericPrice === null ? null : numericPrice - 1,
    YearHigh: numericPrice === null ? null : numericPrice + 10,
    YearLow: numericPrice === null ? null : numericPrice - 10,
    DailyVolume: 1000,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: numericPrice === null ? null : numericPrice + 0.1,
    BidRate: numericPrice === null ? null : numericPrice - 0.1,
    YesterdayRate: numericPrice === null ? null : numericPrice - 0.5,
    PaperMarketCap: 1000000,
    PaperIdYatab: 500 + Number(paperId),
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function candidate({ completedAtMs, rows }) {
  const records = rows.map(({ id, symbol, price }) => rawSecurity(id, symbol, price));
  const responseIds = records.map((row) => String(row.PaperId));
  return buildUsCollectionCandidate({
    recordCount: records.length,
    records,
    responseIds,
    membership: [...responseIds].sort(),
    timing: {
      startedAtMs: completedAtMs - 100,
      responseReceivedAtMs: completedAtMs - 10,
      completedAtMs,
      durationMs: 100
    },
    sourceMetadata: {
      endpoint: "ScreenerHulPaging3",
      source: "demo-buy-reads-test"
    },
    httpStatus: 200
  });
}

function wireUniverse(universe) {
  return {
    loadedAtMs: universe.loadedAtMs,
    recordCount: universe.recordCount,
    securities: universe.securities
  };
}

function capturePayload({
  sourceRows,
  items,
  sql = "SELECT security_id, score FROM latest ORDER BY score DESC, security_id",
  startedAtMs = 4000,
  completedAtMs = 4100,
  selectionMode = "all",
  isAutomatic = false,
  topX = null
}) {
  return {
    items,
    sourceQuery: {
      queryId: "user:demo-buy-reads",
      name: "Demo Buy reads",
      sql,
      intervalMs: 3000
    },
    sourceResult: {
      startedAtMs,
      completedAtMs,
      rowCount: sourceRows.length,
      context: shapeDemoBuyScannerContext({
        columns: [
          { name: "security_id", type: "VARCHAR" },
          { name: "score", type: "DOUBLE" }
        ],
        rows: sourceRows
      })
    },
    selectionMode,
    isAutomatic,
    topX
  };
}

async function startProducerAndUniverse(fixture, rows, completedAtMs = 20000) {
  const producer = await fixture.connect("producer", `demo-buy-read-producer-${rows.length}`);
  await producer.request("producer.session.start", {
    startedAtMs: 1000,
    config: { snapshotIntervalMs: 3000 }
  });
  const first = candidate({ completedAtMs, rows });
  await producer.request("producer.universe.replace", wireUniverse(first.universe));
  const committed = await producer.request("producer.cycle.commit", {
    universeRevision: 1,
    cycle: first.cycle
  });
  assert.equal(committed.type, "response.ok");
  return producer;
}

async function commitCycle(producer, rows, completedAtMs) {
  const next = candidate({ completedAtMs, rows });
  const response = await producer.request("producer.cycle.commit", {
    universeRevision: 1,
    cycle: next.cycle
  });
  assert.equal(response.type, "response.ok");
  return response.payload.data;
}

function horizon(item, horizonMs) {
  return item.horizons.find((entry) => entry.horizonMs === horizonMs);
}

function assertClose(actual, expected, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test("trusted Demo Buy page and targeted observation share exact watermark, target and tie-break semantics", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 60000 }
  });

  try {
    const baselineRows = [{ id: 202, symbol: "BBB", price: 20 }];
    const producer = await startProducerAndUniverse(fixture, baselineRows, 20000);
    const viewer = await fixture.connect("viewer", "demo-buy-read-viewer");
    const exactSql = "SELECT security_id, score FROM latest ORDER BY score DESC, security_id";

    const captured = await viewer.request("demo.buy.capture", capturePayload({
      sourceRows: [["202", 9]],
      items: [{ securityId: "202", resultRank: 1 }],
      sql: exactSql
    }));
    assert.equal(captured.type, "response.ok");
    assert.equal(captured.payload.data.captureId, 1);
    assert.equal(captured.payload.data.capturedAtMs, 5000);

    await commitCycle(producer, [{ id: 202, symbol: "BBB", price: 21 }], 15000);
    await commitCycle(producer, [{ id: 202, symbol: "BBB", price: 22 }], 15000);
    await commitCycle(producer, [{ id: 202, symbol: "BBB", price: null }], 25000);

    const pageResponse = await viewer.request("demo.buy.page", { cursor: null });
    assert.equal(pageResponse.type, "response.ok");
    const page = pageResponse.payload.data;
    assert.equal(page.items.length, 1);
    assert.equal(page.hasMore, false);
    assert.equal(page.nextCursor, null);

    const item = page.items[0];
    assert.equal(item.capture.captureId, 1);
    assert.equal(item.capture.sourceQueryName, "Demo Buy reads");
    assert.equal(item.capture.sourceIntervalMs, 3000);
    assert.equal(item.capture.sourceResultRowCount, 1);
    assert.equal(item.securityId, "202");
    assert.equal(item.resultRank, 1);
    assert.equal(item.buyCycleId, 1);
    assert.equal(item.baseline.cycleId, 1);
    assert.equal(item.baseline.collectedAtMs, 20000);
    assert.equal(item.baseline.price, 20);
    assert.equal(item.baseline.symbol, "BBB");
    assert.equal(item.baseline.paperName, "BBB Incorporated");
    assert.equal(item.baseline.ageMs, null);
    assert.match(item.timing.anomaly, /BASELINE_CLOCK_REGRESSION/);

    const ten = horizon(item, 10000);
    assert.equal(ten.targetAtMs, 15000);
    assert.equal(ten.observedAtMs, 15000);
    assert.equal(ten.actualElapsedMs, 10000);
    assert.equal(ten.price, 21);
    assert.equal(ten.outcome, "UP");
    assert.equal(ten.unavailableReason, null);
    assertClose(ten.changePercent, 5);

    const twenty = horizon(item, 20000);
    assert.equal(twenty.targetAtMs, 25000);
    assert.equal(twenty.observedAtMs, 25000);
    assert.equal(twenty.price, null);
    assert.equal(twenty.changePercent, null);
    assert.equal(twenty.outcome, "UNAVAILABLE");
    assert.equal(twenty.unavailableReason, "FUTURE_PRICE_UNAVAILABLE");

    const thirty = horizon(item, 30000);
    assert.equal(thirty.targetAtMs, 35000);
    assert.equal(thirty.observedAtMs, null);
    assert.equal(thirty.price, null);
    assert.equal(thirty.outcome, "UNAVAILABLE");
    assert.equal(thirty.unavailableReason, "NO_FUTURE_OBSERVATION");

    const targetedResponse = await viewer.request("demo.buy.observation.get", {
      captureId: 1,
      securityId: "202"
    });
    assert.equal(targetedResponse.type, "response.ok");
    const targeted = targetedResponse.payload.data;
    assert.equal(targeted.outcomeEvidenceStatus, "PARTIAL_OUTCOME");
    assert.equal(targeted.evidenceWatermarkMs, 25000);
    assert.equal(targeted.postWindowEndMs, 605000);
    const {
      outcomeEvidenceStatus,
      evidenceWatermarkMs,
      postWindowEndMs,
      ...targetedObservation
    } = targeted;
    assert.equal(outcomeEvidenceStatus, "PARTIAL_OUTCOME");
    assert.equal(evidenceWatermarkMs, 25000);
    assert.equal(postWindowEndMs, 605000);
    assert.deepEqual(targetedObservation, item);

    const captureResponse = await viewer.request("demo.buy.capture.get", { captureId: 1 });
    assert.equal(captureResponse.type, "response.ok");
    const provenance = captureResponse.payload.data;
    assert.equal(provenance.captureId, 1);
    assert.equal(provenance.sourceQuerySql, exactSql);
    assert.equal(provenance.capturedItemCount, 1);
    assert.equal(provenance.scannerDurationMs, 100);
    assert.equal(provenance.captureLatencyMs, 900);

    assert.equal(JSON.stringify(page).includes(exactSql), false);
    assert.equal(JSON.stringify(page).includes("sourceResultContext"), false);

    const diagnosticsJson = JSON.stringify(fixture.service.diagnostics.snapshot());
    assert.equal(diagnosticsJson.includes(exactSql), false);
    assert.equal(diagnosticsJson.includes("source_result_context"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("trusted evaluator preserves unavailable precedence and UP/DOWN/FLAT semantics", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 60000 }
  });

  try {
    const rows = [
      { id: 101, symbol: "NULLBASE", price: null },
      { id: 202, symbol: "ZEROBASE", price: 0 },
      { id: 303, symbol: "NULLFUT", price: 10 },
      { id: 404, symbol: "DOWN", price: 10 },
      { id: 505, symbol: "FLAT", price: 10 }
    ];
    const producer = await startProducerAndUniverse(fixture, rows, 4000);
    const viewer = await fixture.connect("viewer", "demo-buy-reason-viewer");
    const sourceRows = rows.map((row, index) => [String(row.id), 100 - index]);
    const items = rows.map((row, index) => ({
      securityId: String(row.id),
      resultRank: index + 1
    }));

    const capture = await viewer.request("demo.buy.capture", capturePayload({ sourceRows, items }));
    assert.equal(capture.type, "response.ok");

    await commitCycle(producer, [
      { id: 101, symbol: "NULLBASE", price: null },
      { id: 202, symbol: "ZEROBASE", price: null },
      { id: 303, symbol: "NULLFUT", price: null },
      { id: 404, symbol: "DOWN", price: 9 },
      { id: 505, symbol: "FLAT", price: 10 }
    ], 15000);

    const pageResponse = await viewer.request("demo.buy.page", { cursor: null });
    assert.equal(pageResponse.type, "response.ok");
    const byId = new Map(pageResponse.payload.data.items.map((item) => [item.securityId, item]));

    assert.equal(horizon(byId.get("101"), 10000).unavailableReason, "BASELINE_PRICE_UNAVAILABLE");
    assert.equal(horizon(byId.get("202"), 10000).unavailableReason, "BASELINE_PRICE_ZERO");
    assert.equal(horizon(byId.get("303"), 10000).unavailableReason, "FUTURE_PRICE_UNAVAILABLE");

    const down = horizon(byId.get("404"), 10000);
    assert.equal(down.outcome, "DOWN");
    assertClose(down.changePercent, -10);

    const flat = horizon(byId.get("505"), 10000);
    assert.equal(flat.outcome, "FLAT");
    assert.equal(flat.changePercent, 0);

    for (const item of byId.values()) {
      assert.equal(horizon(item, 20000).unavailableReason, "NO_FUTURE_OBSERVATION");
    }
  } finally {
    await fixture.cleanup();
  }
});

test("50-item keyset continuation stays stable while a newer capture arrives", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 60000 }
  });

  try {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: 1000 + index,
      symbol: `S${index + 1}`,
      price: 10 + index
    }));
    await startProducerAndUniverse(fixture, rows, 4000);
    const viewer = await fixture.connect("viewer", "demo-buy-page-viewer");
    const sourceRows = rows.map((row, index) => [String(row.id), 1000 - index]);
    const items = rows.map((row, index) => ({
      securityId: String(row.id),
      resultRank: index + 1
    }));

    const firstCapture = await viewer.request("demo.buy.capture", capturePayload({ sourceRows, items }));
    assert.equal(firstCapture.type, "response.ok");
    assert.equal(firstCapture.payload.data.captureId, 1);

    const firstPageResponse = await viewer.request("demo.buy.page", { cursor: null });
    assert.equal(firstPageResponse.type, "response.ok");
    const firstPage = firstPageResponse.payload.data;
    assert.equal(firstPage.items.length, 50);
    assert.equal(firstPage.hasMore, true);
    assert.equal(typeof firstPage.nextCursor, "string");
    assert.equal(firstPage.items[0].resultRank, 1);
    assert.equal(firstPage.items[49].resultRank, 50);

    clock.value = 6000;
    const newerCapture = await viewer.request("demo.buy.capture", capturePayload({
      sourceRows: [[String(rows[0].id), 1]],
      items: [{ securityId: String(rows[0].id), resultRank: 1 }],
      sql: "SELECT security_id FROM latest LIMIT 1"
    }));
    assert.equal(newerCapture.type, "response.ok");
    assert.equal(newerCapture.payload.data.captureId, 2);

    const continuationResponse = await viewer.request("demo.buy.page", {
      cursor: firstPage.nextCursor
    });
    assert.equal(continuationResponse.type, "response.ok");
    const continuation = continuationResponse.payload.data;
    assert.equal(continuation.items.length, 1);
    assert.equal(continuation.items[0].capture.captureId, 1);
    assert.equal(continuation.items[0].resultRank, 51);
    assert.equal(continuation.hasMore, false);
    assert.equal(continuation.nextCursor, null);

    const refreshedResponse = await viewer.request("demo.buy.page", { cursor: null });
    assert.equal(refreshedResponse.type, "response.ok");
    const refreshed = refreshedResponse.payload.data;
    assert.equal(refreshed.items.length, 50);
    assert.equal(refreshed.items[0].capture.captureId, 2);
    assert.equal(refreshed.items[0].resultRank, 1);
    assert.equal(refreshed.items[1].capture.captureId, 1);
    assert.equal(refreshed.items[1].resultRank, 1);

    const badCursor = await viewer.request("demo.buy.page", { cursor: "not-a-valid-cursor" });
    assert.equal(badCursor.type, "response.error");
    assert.equal(badCursor.payload.code, "DEMO_BUY_CURSOR_INVALID");

    const missingObservation = await viewer.request("demo.buy.observation.get", {
      captureId: 999,
      securityId: "missing"
    });
    assert.equal(missingObservation.type, "response.error");
    assert.equal(missingObservation.payload.code, "NOT_FOUND");

    const missingCapture = await viewer.request("demo.buy.capture.get", { captureId: 999 });
    assert.equal(missingCapture.type, "response.error");
    assert.equal(missingCapture.payload.code, "NOT_FOUND");
  } finally {
    await fixture.cleanup();
  }
});
