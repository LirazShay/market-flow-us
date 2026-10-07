import assert from "node:assert/strict";
import test from "node:test";

import { createBasicBuyTicketAuthority } from "../../local-service/orders/basic-buy-tickets.js";

function security() {
  return {
    found: true,
    isCurrent: true,
    paperName: "AAA Incorporated",
    currentRow: {
      Symbol: "AAA"
    }
  };
}

function ticketIdFrom(url) {
  return decodeURIComponent(new URL(url).hash.slice(1));
}

test("Basic BUY ticket is consumed exactly once before execution and cannot be reopened", async () => {
  let sequence = 0;
  const authority = createBasicBuyTicketAuthority({
    viewerReads: {
      async security() {
        return security();
      }
    },
    buyConfig: { enabled: true, quantity: 2, mode: "DRY_RUN" },
    isReady: () => true,
    getLocalOrigin: () => "http://127.0.0.1:8765",
    now: () => 1_000,
    randomId: () => `opaque-${++sequence}`
  });

  const prepared = await authority.prepare("101");
  const ticketId = ticketIdFrom(prepared.confirmationUrl);
  const before = authority.read(ticketId);

  assert.ok(before);
  assert.equal(before.intent.requestId, "buy-opaque-1");
  assert.equal(before.intent.instrument.symbol, "AAA");
  assert.equal(authority.diagnostics().pendingTicket, true);

  const consumed = authority.consume(ticketId);
  assert.equal(consumed, before);
  assert.equal(authority.read(ticketId), null);
  assert.equal(authority.consume(ticketId), null);
  assert.equal(authority.diagnostics().pendingTicket, false);
});

test("expired Basic BUY ticket cannot be consumed", async () => {
  let now = 5_000;
  let sequence = 0;
  const authority = createBasicBuyTicketAuthority({
    viewerReads: {
      async security() {
        return security();
      }
    },
    buyConfig: { enabled: true, quantity: 1, mode: "LIVE" },
    isReady: () => true,
    getLocalOrigin: () => "http://127.0.0.1:8765",
    now: () => now,
    randomId: () => `opaque-${++sequence}`,
    ttlMs: 100
  });

  const prepared = await authority.prepare("101");
  const ticketId = ticketIdFrom(prepared.confirmationUrl);
  now = 5_100;

  assert.equal(authority.consume(ticketId), null);
  assert.equal(authority.read(ticketId), null);
});
