import assert from "node:assert/strict";
import test from "node:test";

import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { BASIC_BUY_CSRF_HEADER } from "../../local-service/orders/basic-buy-confirmation.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function rawSecurity() {
  return {
    PaperId: 101,
    Symbol: "AAA",
    PaperNameEng: "AAA Incorporated",
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-07T14:00:00",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: 10,
    ChangePercent: 1.25,
    DailyHigh: 11,
    DailyLow: 9,
    YearHigh: 20,
    YearLow: 5,
    DailyVolume: 1000,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: 10.1,
    BidRate: 9.9,
    YesterdayRate: 9.5,
    PaperMarketCap: 1000000,
    PaperIdYatab: 601,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function candidate() {
  const record = rawSecurity();
  return buildUsCollectionCandidate({
    recordCount: 1,
    records: [record],
    responseIds: ["101"],
    membership: ["101"],
    timing: {
      startedAtMs: 2_000,
      responseReceivedAtMs: 2_090,
      completedAtMs: 2_100,
      durationMs: 100
    },
    sourceMetadata: {
      endpoint: "ScreenerHulPaging3",
      source: "synthetic-basic-buy-flow"
    },
    httpStatus: 200
  });
}

function nonceFrom(html) {
  const match = html.match(/<body data-csrf="([^"]+)"/);
  assert.ok(match, "confirmation page must contain a CSRF nonce");
  return match[1];
}

async function confirmationPost(origin, path, nonce, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      [BASIC_BUY_CSRF_HEADER]: nonce
    },
    body: JSON.stringify(body)
  });
  return {
    response,
    payload: await response.json()
  };
}

test("real service composes prepare, trusted confirmation, one-time execution and server-owned provider reply", async () => {
  const createCalls = [];
  const replyCalls = [];
  const execution = {
    async createOrder(intent) {
      createCalls.push(intent);
      return {
        localOrderId: "local-order-1",
        lifecycleState: "REPLY_REQUIRED",
        executionMode: "DRY_RUN",
        replayed: false,
        requestedQuantity: intent.quantity,
        filledQuantity: 0,
        replyMessageIds: ["reply-1"]
      };
    },
    async confirmReply(localOrderId) {
      replyCalls.push(localOrderId);
      return {
        localOrderId,
        lifecycleState: "DRY_RUN_COMPLETE",
        executionMode: "DRY_RUN",
        replayed: false,
        requestedQuantity: 2,
        filledQuantity: 0,
        replyMessageIds: []
      };
    }
  };

  const fixture = await createServiceFixture({
    config: {
      buy: {
        enabled: true,
        quantity: 2,
        mode: "DRY_RUN"
      }
    },
    openDatabase: openMarketFlowUsDatabase,
    basicBuyReadiness: () => true,
    basicBuyExecution: execution
  });

  try {
    const producer = await fixture.connect("producer", "basic-buy-producer");
    const viewer = await fixture.connect("viewer", "basic-buy-viewer");

    const started = await producer.request("producer.session.start", {
      startedAtMs: 1_000,
      config: { snapshotIntervalMs: 3_000 }
    });
    assert.equal(started.type, "response.ok");

    const collected = candidate();
    const universe = await producer.request("producer.universe.replace", {
      loadedAtMs: collected.universe.loadedAtMs,
      recordCount: collected.universe.recordCount,
      securities: collected.universe.securities
    });
    assert.equal(universe.type, "response.ok");
    assert.equal(universe.payload.data.universeRevision, 1);

    const committed = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: collected.cycle
    });
    assert.equal(committed.type, "response.ok");

    const prepared = await viewer.request("order.buy.prepare", {
      securityId: "101"
    });
    assert.equal(prepared.type, "response.ok");
    assert.deepEqual(prepared.payload.data.summary, {
      securityId: "101",
      paperName: "AAA Incorporated",
      symbol: "AAA",
      quantity: 2,
      side: "BUY",
      orderType: "MKT",
      tif: "DAY",
      executionMode: "DRY_RUN"
    });
    assert.equal(JSON.stringify(prepared.payload.data).includes("requestId"), false);

    const confirmationUrl = new URL(prepared.payload.data.confirmationUrl);
    const localOrigin = `http://127.0.0.1:${fixture.port}`;
    assert.equal(confirmationUrl.origin, localOrigin);
    assert.equal(confirmationUrl.pathname, "/buy/confirm");
    assert.equal(confirmationUrl.search, "");
    const ticketId = confirmationUrl.hash.slice(1);
    assert.ok(ticketId.length > 0);

    const page = await fetch(`${localOrigin}/buy/confirm`);
    const nonce = nonceFrom(await page.text());
    assert.equal(page.status, 200);

    const inspected = await confirmationPost(
      localOrigin,
      "/buy/confirm/inspect",
      nonce,
      { ticketId }
    );
    assert.equal(inspected.response.status, 200);
    assert.deepEqual(inspected.payload.summary, prepared.payload.data.summary);
    assert.equal(createCalls.length, 0);

    const executed = await confirmationPost(
      localOrigin,
      "/buy/confirm/execute",
      nonce,
      { ticketId }
    );
    assert.equal(executed.response.status, 200);
    assert.equal(executed.payload.result.lifecycleState, "REPLY_REQUIRED");
    assert.equal(executed.payload.result.localOrderId, "local-order-1");
    assert.equal(JSON.stringify(executed.payload).includes("requestId"), false);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].requestId.startsWith("buy-"), true);
    assert.equal(createCalls[0].instrument.symbol, "AAA");
    assert.equal(createCalls[0].quantity, 2);
    assert.equal(createCalls[0].executionMode, "DRY_RUN");

    const secondPage = await fetch(`${localOrigin}/buy/confirm`);
    const secondNonce = nonceFrom(await secondPage.text());
    const consumed = await confirmationPost(
      localOrigin,
      "/buy/confirm/inspect",
      secondNonce,
      { ticketId }
    );
    assert.equal(consumed.response.status, 410);
    assert.deepEqual(consumed.payload, { code: "BASIC_BUY_TICKET_INVALID" });
    assert.equal(createCalls.length, 1);

    const replied = await confirmationPost(
      localOrigin,
      "/buy/confirm/reply",
      nonce,
      {}
    );
    assert.equal(replied.response.status, 200);
    assert.equal(replied.payload.result.lifecycleState, "DRY_RUN_COMPLETE");
    assert.equal(replied.payload.result.localOrderId, "local-order-1");
    assert.deepEqual(replyCalls, ["local-order-1"]);

    const replayedReply = await confirmationPost(
      localOrigin,
      "/buy/confirm/reply",
      nonce,
      {}
    );
    assert.equal(replayedReply.response.status, 403);
    assert.deepEqual(replayedReply.payload, { code: "BASIC_BUY_CSRF_INVALID" });
    assert.deepEqual(replyCalls, ["local-order-1"]);
  } finally {
    await fixture.cleanup();
  }
});
