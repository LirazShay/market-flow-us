import assert from "node:assert/strict";
import test from "node:test";

import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function candidate(price) {
  const raw = {
    PaperId: 101,
    Symbol: "AAA",
    PaperNameEng: "AAA Incorporated",
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-05T01:00:00",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: 1.25,
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
    PaperIdYatab: 601,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0,
    cookie: "SENTINEL_COOKIE",
    accountId: "SENTINEL_ACCOUNT",
    authorization: "SENTINEL_AUTH"
  };

  return buildUsCollectionCandidate({
    recordCount: 1,
    records: [raw],
    responseIds: ["101"],
    membership: ["101"],
    timing: {
      startedAtMs: 2000,
      responseReceivedAtMs: 2090,
      completedAtMs: 2100,
      durationMs: 100
    },
    sourceMetadata: {
      resultCode: 0,
      version: "synthetic"
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

function snapshotData(response) {
  assert.equal(response.type, "response.ok");
  assert.equal(response.payload.requestType, "viewer.support.snapshot");
  return response.payload.data;
}

test("schema-v4 support snapshot localizes U.S. commit failure without exposing provider/session material", async () => {
  const fixture = await createServiceFixture({
    openDatabase: openMarketFlowUsDatabase
  });
  const viewer = await fixture.connect("viewer", "us-diagnostic-viewer");
  const producer = await fixture.connect("producer", "us-diagnostic-producer");

  try {
    const started = await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(started.type, "response.ok");

    const proofCandidate = candidate(101.25);
    const accepted = await producer.request(
      "producer.universe.replace",
      wireUniverse(proofCandidate.universe)
    );
    assert.equal(accepted.type, "response.ok");
    assert.equal(accepted.payload.data.universeRevision, 1);

    fixture.persistenceFault.enable("F1");
    const rejected = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: proofCandidate.cycle
    });
    assert.equal(rejected.type, "response.error");
    assert.equal(rejected.payload.code, "DB_ERROR");

    const support = snapshotData(await viewer.request("viewer.support.snapshot"));
    assert.equal(support.service.schemaVersion, 4);
    assert.equal(support.authority.latestCount, 0);
    assert.equal(support.authority.historyCount, 0);
    assert.equal(support.diagnostics.lastError.component, "persistence");
    assert.equal(support.diagnostics.lastError.checkpoint, "producer.cycle.committed");
    assert.equal(support.diagnostics.lastError.error.code, "DB_ERROR");
    assert.equal(
      support.diagnostics.lastError.lastSuccessfulCheckpoint,
      "producer.universe.accepted"
    );

    const serialized = JSON.stringify(support);
    for (const forbidden of [
      "SENTINEL_COOKIE",
      "SENTINEL_ACCOUNT",
      "SENTINEL_AUTH",
      started.payload.data.sessionId
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  } finally {
    await fixture.cleanup();
  }
});
