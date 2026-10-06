import assert from "node:assert/strict";
import test from "node:test";

import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createDemoBuyReads } from "../../local-service/reads/demo-buy-reads.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function candidate(price, completedAtMs) {
  const raw = {
    PaperId: 202,
    Symbol: "BBB",
    PaperNameEng: "BBB Incorporated",
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
    PaperIdYatab: 702,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
  return buildUsCollectionCandidate({
    recordCount: 1,
    records: [raw],
    responseIds: ["202"],
    membership: ["202"],
    timing: {
      startedAtMs: completedAtMs - 100,
      responseReceivedAtMs: completedAtMs - 10,
      completedAtMs,
      durationMs: 100
    },
    sourceMetadata: { endpoint: "ScreenerHulPaging3", source: "read-smoke" },
    httpStatus: 200
  });
}

test("Demo Buy populated page proves delayed observation timing and fails closed when its immutable baseline row is missing", async () => {
  const fixture = await createServiceFixture({
    now: () => 5000,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 60000 }
  });
  try {
    const producer = await fixture.connect("producer", "read-smoke-producer");
    const viewer = await fixture.connect("viewer", "read-smoke-viewer");
    await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });
    const baseline = candidate(20, 4000);
    await producer.request("producer.universe.replace", {
      loadedAtMs: baseline.universe.loadedAtMs,
      recordCount: baseline.universe.recordCount,
      securities: baseline.universe.securities
    });
    const committed = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: baseline.cycle
    });
    assert.equal(committed.type, "response.ok");

    const captured = await viewer.request("demo.buy.capture", {
      items: [{ securityId: "202", resultRank: 1 }],
      sourceQuery: {
        queryId: null,
        name: "read smoke",
        sql: "SELECT security_id FROM latest",
        intervalMs: 3000
      },
      sourceResult: {
        startedAtMs: 4100,
        completedAtMs: 4200,
        rowCount: 1,
        context: shapeDemoBuyScannerContext({
          columns: [{ name: "security_id", type: "VARCHAR" }],
          rows: [["202"]]
        })
      },
      selectionMode: "all",
      isAutomatic: false,
      topX: null
    });
    assert.equal(captured.type, "response.ok");

    const delayedFuture = candidate(21, 16000);
    const futureCommit = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: delayedFuture.cycle
    });
    assert.equal(futureCommit.type, "response.ok");

    const reads = createDemoBuyReads({
      connection: fixture.service.database.viewerReadConnection
    });
    const page = await reads.page(null);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].securityId, "202");
    assert.equal(page.items[0].horizons.length, 10);

    const delayedTenSecond = page.items[0].horizons.find(
      (entry) => entry.horizonMs === 10000
    );
    assert.ok(delayedTenSecond);
    assert.equal(delayedTenSecond.targetAtMs, 15000);
    assert.equal(delayedTenSecond.observedAtMs, 16000);
    assert.equal(delayedTenSecond.actualElapsedMs, 11000);
    assert.equal(delayedTenSecond.price, 21);
    assert.equal(delayedTenSecond.outcome, "UP");
    assert.equal(delayedTenSecond.unavailableReason, null);

    await fixture.service.database.writerConnection.run(
      "DELETE FROM history WHERE cycle_id = 1 AND security_id = '202'"
    );

    const targeted = await viewer.request("demo.buy.observation.get", {
      captureId: 1,
      securityId: "202"
    });
    assert.equal(targeted.type, "response.error");
    assert.equal(targeted.payload.code, "DEMO_BUY_BASELINE_INTEGRITY");

    const corruptPage = await viewer.request("demo.buy.page", { cursor: null });
    assert.equal(corruptPage.type, "response.error");
    assert.equal(corruptPage.payload.code, "DEMO_BUY_BASELINE_INTEGRITY");
  } finally {
    await fixture.cleanup();
  }
});
