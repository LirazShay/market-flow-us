import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";

import {
  BASIC_BUY_CSRF_HEADER,
  createBasicBuyConfirmationHandler
} from "../../local-service/orders/basic-buy-confirmation.js";
import { BasicBuySidecarError } from "../../local-service/orders/basic-buy-sidecar.js";

function ticket() {
  return Object.freeze({
    ticketId: "ticket-ack-1",
    requestId: "buy-request-ack-1",
    securityId: "101",
    paperName: "AAA Incorporated",
    expiresAtMs: 120_000,
    intent: Object.freeze({
      requestId: "buy-request-ack-1",
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

function result(lifecycleState, localOrderId = "local-order-ack-1") {
  return {
    localOrderId,
    lifecycleState,
    executionMode: "LIVE",
    replayed: lifecycleState !== "REPLY_REQUIRED",
    requestedQuantity: 2,
    filledQuantity: 0,
    replyMessageIds: lifecycleState === "REPLY_REQUIRED" ? ["o163"] : []
  };
}

async function harness({ executeConfirmedBuy, confirmProviderReply = null }) {
  let storedTicket = ticket();
  let origin = null;
  let nonceSequence = 0;
  const tickets = {
    read(ticketId) {
      return storedTicket?.ticketId === ticketId ? storedTicket : null;
    },
    consume(ticketId) {
      if (storedTicket?.ticketId !== ticketId) return null;
      const value = storedTicket;
      storedTicket = null;
      return value;
    },
    clear() {
      storedTicket = null;
    }
  };
  const handler = createBasicBuyConfirmationHandler({
    tickets,
    getLocalOrigin: () => origin,
    executeConfirmedBuy,
    confirmProviderReply,
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

  async function pageNonce() {
    const response = await fetch(`${origin}/buy/confirm`);
    const html = await response.text();
    const match = html.match(/<body data-csrf="([^"]+)"/);
    assert.ok(match);
    return match[1];
  }

  async function post(path, nonce, body) {
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
      status: response.status,
      payload: await response.json()
    };
  }

  return {
    tickets,
    pageNonce,
    post,
    async close() {
      handler.clear();
      tickets.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

async function inspect(fixture, nonce) {
  const inspected = await fixture.post("/buy/confirm/inspect", nonce, {
    ticketId: "ticket-ack-1"
  });
  assert.equal(inspected.status, 200);
}

test("ACKNOWLEDGEMENT_UNKNOWN keeps only same-request reconciliation available after ticket consumption", async () => {
  const requestIds = [];
  let calls = 0;
  const fixture = await harness({
    executeConfirmedBuy: async (currentTicket) => {
      calls += 1;
      requestIds.push(currentTicket.intent.requestId);
      if (calls === 1) {
        throw new BasicBuySidecarError("ACKNOWLEDGEMENT_UNKNOWN");
      }
      return result("SUBMITTED");
    }
  });

  try {
    const nonce = await fixture.pageNonce();
    await inspect(fixture, nonce);

    const uncertain = await fixture.post("/buy/confirm/execute", nonce, {
      ticketId: "ticket-ack-1"
    });
    assert.equal(uncertain.status, 502);
    assert.deepEqual(uncertain.payload, { code: "ACKNOWLEDGEMENT_UNKNOWN" });
    assert.equal(fixture.tickets.read("ticket-ack-1"), null);

    const reconciled = await fixture.post("/buy/confirm/execute", nonce, {
      ticketId: "ticket-ack-1"
    });
    assert.equal(reconciled.status, 200);
    assert.equal(reconciled.payload.result.lifecycleState, "SUBMITTED");
    assert.deepEqual(requestIds, ["buy-request-ack-1", "buy-request-ack-1"]);

    const third = await fixture.post("/buy/confirm/execute", nonce, {
      ticketId: "ticket-ack-1"
    });
    assert.equal(third.status, 403);
    assert.deepEqual(third.payload, { code: "BASIC_BUY_CSRF_INVALID" });
    assert.equal(calls, 2);
  } finally {
    await fixture.close();
  }
});

test("provider-reply uncertainty reconciles through the original immutable request instead of repeating reply confirmation", async () => {
  const createRequestIds = [];
  let createCalls = 0;
  let replyCalls = 0;
  const fixture = await harness({
    executeConfirmedBuy: async (currentTicket) => {
      createCalls += 1;
      createRequestIds.push(currentTicket.intent.requestId);
      return createCalls === 1 ? result("REPLY_REQUIRED") : result("SUBMITTED");
    },
    confirmProviderReply: async () => {
      replyCalls += 1;
      throw new BasicBuySidecarError("ACKNOWLEDGEMENT_UNKNOWN");
    }
  });

  try {
    const nonce = await fixture.pageNonce();
    await inspect(fixture, nonce);

    const created = await fixture.post("/buy/confirm/execute", nonce, {
      ticketId: "ticket-ack-1"
    });
    assert.equal(created.status, 200);
    assert.equal(created.payload.result.lifecycleState, "REPLY_REQUIRED");

    const uncertainReply = await fixture.post("/buy/confirm/reply", nonce, {});
    assert.equal(uncertainReply.status, 502);
    assert.deepEqual(uncertainReply.payload, { code: "ACKNOWLEDGEMENT_UNKNOWN" });

    const reconciled = await fixture.post("/buy/confirm/execute", nonce, {
      ticketId: "ticket-ack-1"
    });
    assert.equal(reconciled.status, 200);
    assert.equal(reconciled.payload.result.lifecycleState, "SUBMITTED");
    assert.deepEqual(createRequestIds, ["buy-request-ack-1", "buy-request-ack-1"]);
    assert.equal(replyCalls, 1);
  } finally {
    await fixture.close();
  }
});
