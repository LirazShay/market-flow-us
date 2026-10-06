import assert from "node:assert/strict";
import test from "node:test";

import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function rawSecurity(paperId, symbol, price) {
  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: `${symbol} Incorporated`,
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-06T10:00:00",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: 1,
    DailyHigh: price + 1,
    DailyLow: price - 1,
    YearHigh: price + 10,
    YearLow: price - 10,
    DailyVolume: 1000,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: price + 0.1,
    BidRate: price - 0.1,
    YesterdayRate: price - 0.5,
    PaperMarketCap: 1000000,
    PaperIdYatab: 500 + paperId,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function candidate({ startedAtMs, completedAtMs, rows }) {
  const records = rows.map(([paperId, symbol, price]) => rawSecurity(paperId, symbol, price));
  const responseIds = records.map((row) => String(row.PaperId));
  return buildUsCollectionCandidate({
    recordCount: records.length,
    records,
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
      source: "demo-buy-capture-test"
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
  rows = [["101", 9], ["202", 8]],
  items = [{ securityId: "202", resultRank: 2 }],
  sql = "SELECT security_id, score FROM latest ORDER BY score DESC, security_id",
  name = "Capture source",
  startedAtMs = 4000,
  completedAtMs = 4100,
  selectionMode = "manual",
  isAutomatic = false,
  topX = null
} = {}) {
  return {
    items,
    sourceQuery: {
      queryId: "user:capture-source",
      name,
      sql,
      intervalMs: 3000
    },
    sourceResult: {
      startedAtMs,
      completedAtMs,
      rowCount: rows.length,
      context: shapeDemoBuyScannerContext({
        columns: [
          { name: "security_id", type: "VARCHAR" },
          { name: "score", type: "DOUBLE" }
        ],
        rows
      })
    },
    selectionMode,
    isAutomatic,
    topX
  };
}

function asNumber(value) {
  return Number(value);
}

test("real service capture persists immutable provenance and exact writer-ordered baseline without mutating market authority", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase
  });

  try {
    const producer = await fixture.connect("producer", "demo-buy-producer");
    const viewer = await fixture.connect("viewer", "demo-buy-viewer");

    await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });

    const first = candidate({
      startedAtMs: 2000,
      completedAtMs: 2100,
      rows: [
        [101, "AAA", 10],
        [202, "BBB", 20]
      ]
    });
    await producer.request("producer.universe.replace", wireUniverse(first.universe));
    const firstCommit = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: first.cycle
    });
    assert.equal(asNumber(firstCommit.payload.data.cycleId), 1);

    const historyBefore = await fixture.rows(
      "SELECT cycle_id, security_id, Price FROM history ORDER BY cycle_id, security_id"
    );
    const latestBefore = await fixture.rows(
      "SELECT cycle_id, security_id, Price FROM latest ORDER BY security_id"
    );

    clock.value = 5000;
    const firstPayload = capturePayload();
    const firstCapture = await viewer.request("demo.buy.capture", firstPayload);
    assert.equal(firstCapture.type, "response.ok");
    assert.deepEqual(firstCapture.payload.data, {
      captureId: 1,
      capturedAtMs: 5000,
      capturedItemCount: 1
    });

    const captures = await fixture.rows(`
      SELECT capture_id, captured_at_ms, source_query_id, source_query_name,
             source_query_sql, source_interval_ms, source_result_started_at_ms,
             source_result_completed_at_ms, source_result_row_count,
             source_result_context_json, selection_mode, is_automatic, top_x
      FROM demo_buy_captures
      ORDER BY capture_id
    `);
    assert.equal(captures.length, 1);
    assert.equal(asNumber(captures[0].capture_id), 1);
    assert.equal(asNumber(captures[0].captured_at_ms), 5000);
    assert.equal(captures[0].source_query_id, "user:capture-source");
    assert.equal(captures[0].source_query_name, "Capture source");
    assert.equal(captures[0].source_query_sql, firstPayload.sourceQuery.sql);
    assert.equal(asNumber(captures[0].source_interval_ms), 3000);
    assert.equal(asNumber(captures[0].source_result_started_at_ms), 4000);
    assert.equal(asNumber(captures[0].source_result_completed_at_ms), 4100);
    assert.equal(asNumber(captures[0].source_result_row_count), 2);
    assert.deepEqual(JSON.parse(captures[0].source_result_context_json), firstPayload.sourceResult.context);
    assert.equal(captures[0].selection_mode, "manual");
    assert.equal(captures[0].is_automatic, false);
    assert.equal(captures[0].top_x, null);

    const firstItems = await fixture.rows(`
      SELECT capture_id, result_rank, security_id, buy_cycle_id
      FROM demo_buy_items
      ORDER BY capture_id, result_rank
    `);
    assert.deepEqual(firstItems.map((row) => ({
      captureId: asNumber(row.capture_id),
      resultRank: asNumber(row.result_rank),
      securityId: row.security_id,
      buyCycleId: asNumber(row.buy_cycle_id)
    })), [{
      captureId: 1,
      resultRank: 2,
      securityId: "202",
      buyCycleId: 1
    }]);

    assert.deepEqual(await fixture.rows(
      "SELECT cycle_id, security_id, Price FROM history ORDER BY cycle_id, security_id"
    ), historyBefore);
    assert.deepEqual(await fixture.rows(
      "SELECT cycle_id, security_id, Price FROM latest ORDER BY security_id"
    ), latestBefore);

    const second = candidate({
      startedAtMs: 9900,
      completedAtMs: 10000,
      rows: [
        [101, "AAA", 11],
        [202, "BBB", 21]
      ]
    });
    clock.value = 5500;
    const secondCommit = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: second.cycle
    });
    assert.equal(asNumber(secondCommit.payload.data.cycleId), 2);

    const originalItemAfterLaterMarketCommit = await fixture.rows(
      "SELECT buy_cycle_id FROM demo_buy_items WHERE capture_id = 1 AND security_id = '202'"
    );
    assert.equal(asNumber(originalItemAfterLaterMarketCommit[0].buy_cycle_id), 1);

    clock.value = 6000;
    const secondPayload = capturePayload({
      sql: "SELECT security_id, score FROM latest WHERE score > 0",
      name: "Edited later",
      startedAtMs: 6500,
      completedAtMs: 7000
    });
    const secondCapture = await viewer.request("demo.buy.capture", secondPayload);
    assert.equal(secondCapture.type, "response.ok");
    assert.deepEqual(secondCapture.payload.data, {
      captureId: 2,
      capturedAtMs: 6000,
      capturedItemCount: 1
    });

    const secondItem = await fixture.rows(
      "SELECT result_rank, security_id, buy_cycle_id FROM demo_buy_items WHERE capture_id = 2"
    );
    assert.equal(asNumber(secondItem[0].result_rank), 2);
    assert.equal(secondItem[0].security_id, "202");
    assert.equal(asNumber(secondItem[0].buy_cycle_id), 2);

    const immutableFirst = await fixture.rows(
      "SELECT source_query_name, source_query_sql FROM demo_buy_captures WHERE capture_id = 1"
    );
    assert.deepEqual(immutableFirst, [{
      source_query_name: "Capture source",
      source_query_sql: firstPayload.sourceQuery.sql
    }]);

    const lastDemoDiagnostic = [...fixture.service.diagnostics.snapshot().recent]
      .reverse()
      .find((record) => record.operation === "demo.buy.capture" && record.status === "ok");
    assert.equal(lastDemoDiagnostic?.context.captureId, 2);
    assert.equal(lastDemoDiagnostic?.context.capturedItemCount, 1);
    assert.match(lastDemoDiagnostic?.context.timingAnomaly ?? "", /CAPTURE_CLOCK_REGRESSION/);
    assert.match(lastDemoDiagnostic?.context.timingAnomaly ?? "", /BASELINE_CLOCK_REGRESSION/);
    assert.equal(JSON.stringify(lastDemoDiagnostic).includes(secondPayload.sourceQuery.sql), false);
  } finally {
    await fixture.cleanup();
  }
});

test("unresolved item and injected persistence faults roll back capture header/items together", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase
  });

  try {
    const producer = await fixture.connect("producer", "demo-buy-rollback-producer");
    const viewer = await fixture.connect("viewer", "demo-buy-rollback-viewer");
    await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });
    const first = candidate({
      startedAtMs: 2000,
      completedAtMs: 2100,
      rows: [
        [101, "AAA", 10],
        [202, "BBB", 20]
      ]
    });
    await producer.request("producer.universe.replace", wireUniverse(first.universe));
    await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: first.cycle
    });

    const unresolved = capturePayload({
      rows: [["101", 9], ["999", 8]],
      items: [
        { securityId: "101", resultRank: 1 },
        { securityId: "999", resultRank: 2 }
      ],
      selectionMode: "all"
    });
    const unresolvedResponse = await viewer.request("demo.buy.capture", unresolved);
    assert.equal(unresolvedResponse.type, "response.error");
    assert.equal(unresolvedResponse.payload.code, "NOT_FOUND");
    assert.equal((await fixture.rows("SELECT COUNT(*) AS n FROM demo_buy_captures"))[0].n, "0");
    assert.equal((await fixture.rows("SELECT COUNT(*) AS n FROM demo_buy_items"))[0].n, "0");

    for (const point of [
      "DEMO_BUY_AFTER_CAPTURE_HEADER",
      "DEMO_BUY_AFTER_FIRST_ITEM",
      "DEMO_BUY_BEFORE_COMMIT"
    ]) {
      fixture.persistenceFault.enable(point);
      const response = await viewer.request("demo.buy.capture", capturePayload({
        items: [
          { securityId: "101", resultRank: 1 },
          { securityId: "202", resultRank: 2 }
        ],
        selectionMode: "all"
      }));
      fixture.persistenceFault.disable(point);

      assert.equal(response.type, "response.error", point);
      assert.equal(response.payload.code, "DB_ERROR", point);
      assert.equal((await fixture.rows("SELECT COUNT(*) AS n FROM demo_buy_captures"))[0].n, "0", point);
      assert.equal((await fixture.rows("SELECT COUNT(*) AS n FROM demo_buy_items"))[0].n, "0", point);
    }

    const historyCount = await fixture.rows("SELECT COUNT(*) AS n FROM history");
    const latestCount = await fixture.rows("SELECT COUNT(*) AS n FROM latest");
    assert.equal(historyCount[0].n, "2");
    assert.equal(latestCount[0].n, "2");
  } finally {
    await fixture.cleanup();
  }
});
