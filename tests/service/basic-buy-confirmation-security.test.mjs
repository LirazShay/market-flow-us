import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";

import {
  BASIC_BUY_CSRF_HEADER,
  createBasicBuyConfirmationHandler
} from "../../local-service/orders/basic-buy-confirmation.js";

function immutableTicket(ticketId = "ticket-1") {
  return Object.freeze({
    ticketId,
    requestId: "buy-request-1",
    securityId: "101",
    paperName: "AAA Incorporated",
    expiresAtMs: 120_000,
    intent: Object.freeze({
      requestId: "buy-request-1",
      instrument: Object.freeze({
        symbol: "AAA",
        secType: "STK",
        currency: "USD",
        exchange: "SMART"
      }),
      side: "BUY",
      quantity: 2,
      orderType: "MKT",
      tif: "DAY",
      executionMode: "LIVE"
    })
  });
}

function executionResult(overrides = {}) {
  return {
    localOrderId: "ord-test-1",
    lifecycleState: "SUBMITTED",
    executionMode: "LIVE",
    replayed: false,
    requestedQuantity: 2,
    filledQuantity: 0,
    replyRequired: false,
    replyMessageIds: [],
    privateProviderField: "must-not-cross",
    ...overrides
  };
}

async function startHarness({
  executeConfirmedBuy = async () => executionResult(),
  confirmProviderReply = async () => executionResult()
} = {}) {
  let origin = null;
  let ticket = immutableTicket();
  let consumeCalls = 0;
  const executeCalls = [];
  const replyCalls = [];
  let nonceSequence = 0;

  const tickets = {
    read(ticketId) {
      return ticket?.ticketId === ticketId ? ticket : null;
    },
    consume(ticketId) {
      if (ticket?.ticketId !== ticketId) return null;
      const consumed = ticket;
      ticket = null;
      consumeCalls += 1;
      return consumed;
    }
  };

  const handler = createBasicBuyConfirmationHandler({
    tickets,
    getLocalOrigin: () => origin,
    executeConfirmedBuy: executeConfirmedBuy === null
      ? null
      : async (value) => {
        executeCalls.push(value);
        return await executeConfirmedBuy(value);
      },
    confirmProviderReply: executeConfirmedBuy === null || confirmProviderReply === null
      ? null
      : async (localOrderId) => {
        replyCalls.push(localOrderId);
        return await confirmProviderReply(localOrderId);
      },
    now: () => 1_000,
    randomId: () => `${String(++nonceSequence).padStart(2, "0")}${"N".repeat(46)}`
  });

  const server = http.createServer((request, response) => {
    void handler.handle(request, response).then((handled) => {
      if (handled) return;
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not Found");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    executeCalls,
    replyCalls,
    getConsumeCalls: () => consumeCalls,
    expireTicket() {
      ticket = null;
    },
    async close() {
      handler.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

function nonceFrom(html) {
  const match = html.match(/<body data-csrf="([^"]+)"/);
  assert.ok(match, "page must contain one per-page CSRF nonce");
  return match[1];
}

async function page(harness) {
  const response = await fetch(`${harness.origin}/buy/confirm`);
  const html = await response.text();
  return { response, html, nonce: nonceFrom(html) };
}

async function post(harness, path, {
  origin = harness.origin,
  nonce,
  contentType = "application/json",
  body = { ticketId: "ticket-1" }
} = {}) {
  const headers = { Origin: origin, "Content-Type": contentType };
  if (nonce !== undefined) headers[BASIC_BUY_CSRF_HEADER] = nonce;
  const response = await fetch(`${harness.origin}${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
  return { response, json: await response.json() };
}

test("trusted BUY page uses fragment-only ticket transfer and hardened no-store/no-frame response", async () => {
  const harness = await startHarness();
  try {
    const { response, html, nonce } = await page(harness);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.match(response.headers.get("content-security-policy") ?? "", /object-src 'none'/);
    assert.match(response.headers.get("content-security-policy") ?? "", /base-uri 'none'/);
    assert.match(response.headers.get("content-security-policy") ?? "", /form-action 'self'/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.ok(nonce.length >= 32);
    assert.equal(html.includes("ticket-1"), false);
    assert.equal(html.includes("buy-request-1"), false);
    assert.match(html, /src="\/buy\/confirm\/app\.js"/);

    const script = await fetch(`${harness.origin}/buy/confirm/app.js`);
    const source = await script.text();
    assert.equal(script.status, 200);
    assert.equal(script.headers.get("cache-control"), "no-store");
    assert.equal(script.headers.get("access-control-allow-origin"), null);
    assert.match(source, /location\.hash/);
    assert.match(source, /history\.replaceState/);
    assert.match(source, /textContent/);
    assert.equal(source.includes("innerHTML"), false);
    assert.match(source, /X-Market-Flow-CSRF/);
    assert.match(source, /\/buy\/confirm\/reply/);
    assert.equal(source.includes("localOrderId"), false);
  } finally {
    await harness.close();
  }
});

test("confirmation POSTs require exact local Origin, JSON and a fresh page nonce", async () => {
  const harness = await startHarness();
  try {
    const { nonce } = await page(harness);

    const crossOrigin = await post(harness, "/buy/confirm/inspect", {
      origin: "https://provider.example",
      nonce
    });
    assert.equal(crossOrigin.response.status, 403);
    assert.deepEqual(crossOrigin.json, { code: "BASIC_BUY_CONFIRMATION_ORIGIN_REJECTED" });

    const simpleForm = await post(harness, "/buy/confirm/inspect", {
      nonce,
      contentType: "application/x-www-form-urlencoded",
      body: "ticketId=ticket-1"
    });
    assert.equal(simpleForm.response.status, 415);
    assert.deepEqual(simpleForm.json, { code: "BASIC_BUY_CONFIRMATION_CONTENT_TYPE_REJECTED" });

    const noNonce = await post(harness, "/buy/confirm/inspect");
    assert.equal(noNonce.response.status, 403);
    assert.deepEqual(noNonce.json, { code: "BASIC_BUY_CSRF_INVALID" });

    const override = await post(harness, "/buy/confirm/inspect", {
      nonce,
      body: { ticketId: "ticket-1", quantity: 999, symbol: "EVIL" }
    });
    assert.equal(override.response.status, 400);
    assert.deepEqual(override.json, { code: "BASIC_BUY_CONFIRMATION_BODY_INVALID" });

    const inspected = await post(harness, "/buy/confirm/inspect", { nonce });
    assert.equal(inspected.response.status, 200);
    assert.deepEqual(inspected.json, {
      summary: {
        securityId: "101",
        paperName: "AAA Incorporated",
        symbol: "AAA",
        quantity: 2,
        side: "BUY",
        orderType: "MKT",
        tif: "DAY",
        executionMode: "LIVE"
      }
    });
    assert.equal(harness.executeCalls.length, 0);
  } finally {
    await harness.close();
  }
});

test("execution requires prior review, consumes the immutable ticket once before execution and blocks replay", async () => {
  const harness = await startHarness();
  try {
    const { nonce } = await page(harness);

    const beforeReview = await post(harness, "/buy/confirm/execute", { nonce });
    assert.equal(beforeReview.response.status, 409);
    assert.deepEqual(beforeReview.json, { code: "BASIC_BUY_CONFIRMATION_STATE_INVALID" });
    assert.equal(harness.getConsumeCalls(), 0);
    assert.equal(harness.executeCalls.length, 0);

    const inspected = await post(harness, "/buy/confirm/inspect", { nonce });
    assert.equal(inspected.response.status, 200);

    const first = await post(harness, "/buy/confirm/execute", { nonce });
    assert.equal(first.response.status, 200);
    assert.deepEqual(first.json, {
      result: {
        localOrderId: "ord-test-1",
        lifecycleState: "SUBMITTED",
        executionMode: "LIVE",
        replayed: false,
        requestedQuantity: 2,
        filledQuantity: 0,
        replyRequired: false,
        replyMessageIds: []
      }
    });
    assert.equal(JSON.stringify(first.json).includes("privateProviderField"), false);
    assert.equal(harness.getConsumeCalls(), 1);
    assert.equal(harness.executeCalls.length, 1);
    assert.equal(harness.executeCalls[0].requestId, "buy-request-1");
    assert.equal(harness.executeCalls[0].intent.requestId, "buy-request-1");

    const replay = await post(harness, "/buy/confirm/execute", { nonce });
    assert.equal(replay.response.status, 403);
    assert.deepEqual(replay.json, { code: "BASIC_BUY_CSRF_INVALID" });
    assert.equal(harness.executeCalls.length, 1);

    const secondPage = await page(harness);
    const reopened = await post(harness, "/buy/confirm/inspect", { nonce: secondPage.nonce });
    assert.equal(reopened.response.status, 410);
    assert.deepEqual(reopened.json, { code: "BASIC_BUY_TICKET_INVALID" });
  } finally {
    await harness.close();
  }
});

test("REPLY_REQUIRED continues only with the server-held localOrderId and requires a second explicit click", async () => {
  const harness = await startHarness({
    executeConfirmedBuy: async () => executionResult({
      localOrderId: "ord-reply-1",
      lifecycleState: "REPLY_REQUIRED",
      replyRequired: true,
      replyMessageIds: ["o163"]
    }),
    confirmProviderReply: async (localOrderId) => {
      assert.equal(localOrderId, "ord-reply-1");
      return executionResult({ localOrderId, lifecycleState: "SUBMITTED" });
    }
  });

  try {
    const { nonce } = await page(harness);
    await post(harness, "/buy/confirm/inspect", { nonce });

    const created = await post(harness, "/buy/confirm/execute", { nonce });
    assert.equal(created.response.status, 200);
    assert.equal(created.json.result.lifecycleState, "REPLY_REQUIRED");
    assert.deepEqual(created.json.result.replyMessageIds, ["o163"]);
    assert.equal(harness.replyCalls.length, 0);

    const browserOverride = await post(harness, "/buy/confirm/reply", {
      nonce,
      body: { localOrderId: "evil-browser-order" }
    });
    assert.equal(browserOverride.response.status, 400);
    assert.deepEqual(browserOverride.json, { code: "BASIC_BUY_CONFIRMATION_BODY_INVALID" });
    assert.equal(harness.replyCalls.length, 0);

    const confirmed = await post(harness, "/buy/confirm/reply", { nonce, body: {} });
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.json.result.lifecycleState, "SUBMITTED");
    assert.deepEqual(harness.replyCalls, ["ord-reply-1"]);

    const replay = await post(harness, "/buy/confirm/reply", { nonce, body: {} });
    assert.equal(replay.response.status, 403);
    assert.deepEqual(replay.json, { code: "BASIC_BUY_CSRF_INVALID" });
    assert.deepEqual(harness.replyCalls, ["ord-reply-1"]);
  } finally {
    await harness.close();
  }
});

test("missing ticket and unavailable execution fail before any execution callback", async () => {
  const missing = await startHarness();
  try {
    const { nonce } = await page(missing);
    missing.expireTicket();
    const response = await post(missing, "/buy/confirm/inspect", { nonce });
    assert.equal(response.response.status, 410);
    assert.deepEqual(response.json, { code: "BASIC_BUY_TICKET_INVALID" });
    assert.equal(missing.executeCalls.length, 0);
  } finally {
    await missing.close();
  }

  const unwired = await startHarness({ executeConfirmedBuy: null, confirmProviderReply: null });
  try {
    const { nonce } = await page(unwired);
    const inspected = await post(unwired, "/buy/confirm/inspect", { nonce });
    assert.equal(inspected.response.status, 200);

    const response = await post(unwired, "/buy/confirm/execute", { nonce });
    assert.equal(response.response.status, 503);
    assert.deepEqual(response.json, { code: "BASIC_BUY_EXECUTION_UNAVAILABLE" });
    assert.equal(unwired.executeCalls.length, 0);
  } finally {
    await unwired.close();
  }
});
