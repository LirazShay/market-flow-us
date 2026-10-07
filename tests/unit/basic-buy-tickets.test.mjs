import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIC_BUY_TICKET_TTL_MS,
  createBasicBuyTicketAuthority
} from "../../local-service/orders/basic-buy-tickets.js";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

function currentSecurity(overrides = {}) {
  return {
    found: true,
    securityId: "1001",
    paperName: "Alpha Corp",
    isCurrent: true,
    currentRow: {
      securityId: "1001",
      Symbol: "aapl",
      ...overrides
    }
  };
}

function createFixture({
  security = currentSecurity(),
  enabled = true,
  ready = true,
  quantity = 3,
  mode = "DRY_RUN"
} = {}) {
  let nowMs = 1_000;
  let readCount = 0;
  const ids = ["request-id", "ticket-id", "request-2", "ticket-2"];
  const viewerReads = {
    async security(securityId) {
      readCount += 1;
      assert.equal(securityId, "1001");
      return security;
    }
  };
  const authority = createBasicBuyTicketAuthority({
    viewerReads,
    buyConfig: { enabled, quantity, mode },
    isReady: () => ready,
    getLocalOrigin: () => "http://127.0.0.1:8765",
    now: () => nowMs,
    randomId: () => ids.shift()
  });

  return {
    authority,
    getReadCount: () => readCount,
    advance(ms) {
      nowMs += ms;
    }
  };
}

function assertProtocolCode(error, code) {
  assert.ok(error instanceof ProtocolValidationError);
  assert.equal(error.code, code);
  return true;
}

test("basic BUY preparation freezes Node-owned current authority and returns only a local ticket URL plus safe summary", async () => {
  const fixture = createFixture();

  const prepared = await fixture.authority.prepare("1001");

  assert.equal(fixture.getReadCount(), 1);
  assert.deepEqual(prepared, {
    confirmationUrl: "http://127.0.0.1:8765/buy/confirm#ticket-id",
    expiresAtMs: 1_000 + BASIC_BUY_TICKET_TTL_MS,
    summary: {
      securityId: "1001",
      paperName: "Alpha Corp",
      symbol: "AAPL",
      quantity: 3,
      side: "BUY",
      orderType: "MKT",
      tif: "DAY",
      executionMode: "DRY_RUN"
    }
  });
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.summary), true);
  assert.equal(JSON.stringify(prepared).includes("request-id"), false);

  const ticket = fixture.authority.read("ticket-id");
  assert.equal(ticket.requestId, "buy-request-id");
  assert.equal(ticket.securityId, "1001");
  assert.equal(ticket.paperName, "Alpha Corp");
  assert.deepEqual(ticket.intent, {
    requestId: "buy-request-id",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 3,
    orderType: "MKT",
    tif: "DAY",
    executionMode: "DRY_RUN"
  });
  assert.deepEqual(fixture.authority.diagnostics(), {
    enabled: true,
    pendingTicket: true
  });
});

test("basic BUY preparation fails closed before authority reads when composition is disabled or unavailable", async () => {
  for (const options of [
    { enabled: false, ready: true },
    { enabled: true, ready: false }
  ]) {
    const fixture = createFixture(options);
    await assert.rejects(
      fixture.authority.prepare("1001"),
      (error) => assertProtocolCode(error, ERROR_CODES.SERVICE_NOT_READY)
    );
    assert.equal(fixture.getReadCount(), 0);
    assert.deepEqual(fixture.authority.diagnostics(), {
      enabled: options.enabled,
      pendingTicket: false
    });
  }
});

test("basic BUY preparation rejects historical-only, missing and malformed current Symbol without creating a ticket", async () => {
  const cases = [
    { found: false, securityId: "1001", paperName: null, isCurrent: false, currentRow: null },
    { ...currentSecurity(), isCurrent: false, currentRow: null },
    currentSecurity({ Symbol: null }),
    currentSecurity({ Symbol: "" }),
    currentSecurity({ Symbol: " AAPL " })
  ];

  for (const security of cases) {
    const fixture = createFixture({ security });
    await assert.rejects(
      fixture.authority.prepare("1001"),
      (error) => assertProtocolCode(error, ERROR_CODES.NOT_FOUND)
    );
    assert.equal(fixture.authority.diagnostics().pendingTicket, false);
  }
});

test("basic BUY tickets are short-lived, memory-only and disappear after expiry", async () => {
  const fixture = createFixture({ mode: "LIVE", quantity: 1.5 });
  const prepared = await fixture.authority.prepare("1001");
  assert.equal(prepared.summary.executionMode, "LIVE");
  assert.equal(prepared.summary.quantity, 1.5);
  assert.ok(fixture.authority.read("ticket-id"));

  fixture.advance(BASIC_BUY_TICKET_TTL_MS);

  assert.equal(fixture.authority.read("ticket-id"), null);
  assert.deepEqual(fixture.authority.diagnostics(), {
    enabled: true,
    pendingTicket: false
  });
});
