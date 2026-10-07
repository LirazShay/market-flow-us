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
    ticketId: "ticket-restart-1",
    requestId: "buy-request-restart-1",
    securityId: "101",
    paperName: "AAA Incorporated",
    expiresAtMs: 120_000,
    intent: Object.freeze({
      requestId: "buy-request-restart-1",
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

async function harness({ executeConfirmedBuy = null } = {}) {
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
    handler,
    pageNonce,
    post,
    async close() {
      handler.clear();
      tickets.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

test("post-submit local transport uncertainty is surfaced exactly as ACKNOWLEDGEMENT_UNKNOWN", async () => {
  let executionCalls = 0;
  const fixture = await harness({
    executeConfirmedBuy: async () => {
      executionCalls += 1;
      throw new BasicBuySidecarError("ACKNOWLEDGEMENT_UNKNOWN");
    }
  });

  try {
    const nonce = await fixture.pageNonce();
    const inspected = await fixture.post("/buy/confirm/inspect", nonce, {
      ticketId: "ticket-restart-1"
    });
    assert.equal(inspected.status, 200);

    const executed = await fixture.post("/buy/confirm/execute", nonce, {
      ticketId: "ticket-restart-1"
    });
    assert.equal(executed.status, 502);
    assert.deepEqual(executed.payload, { code: "ACKNOWLEDGEMENT_UNKNOWN" });
    assert.equal(executionCalls, 1);
    assert.equal(fixture.tickets.read("ticket-restart-1"), null);
  } finally {
    await fixture.close();
  }
});

test("shutdown boundary clears confirmation nonce and ticket so old browser state cannot survive restart", async () => {
  const fixture = await harness();
  try {
    const nonce = await fixture.pageNonce();
    const inspected = await fixture.post("/buy/confirm/inspect", nonce, {
      ticketId: "ticket-restart-1"
    });
    assert.equal(inspected.status, 200);

    fixture.handler.clear();
    fixture.tickets.clear();

    const stalePage = await fixture.post("/buy/confirm/inspect", nonce, {
      ticketId: "ticket-restart-1"
    });
    assert.equal(stalePage.status, 403);
    assert.deepEqual(stalePage.payload, { code: "BASIC_BUY_CSRF_INVALID" });
    assert.equal(fixture.tickets.read("ticket-restart-1"), null);
  } finally {
    await fixture.close();
  }
});
