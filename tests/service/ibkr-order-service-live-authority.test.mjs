import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { FakeLiveIbkrAdapter } from "../../ibkr-order-service/fake-live-adapter.js";
import { createLiveOrderAuthority } from "../../ibkr-order-service/live-order-authority.js";
import {
  ACKNOWLEDGEMENT_UNKNOWN,
  CANCELLED,
  FILLED,
  PARTIALLY_FILLED,
  REPLY_REQUIRED,
  SUBMIT_FAILED,
  SUBMITTED,
  openOrderExecutionStore
} from "../../ibkr-order-service/store.js";

function validLiveIntent(overrides = {}) {
  return {
    requestId: "req-live-authority-1",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 2,
    orderType: "LMT",
    limitPrice: 123.45,
    tif: "DAY",
    executionMode: "LIVE",
    ...overrides
  };
}

function deterministicOrderId(value = "44444444-4444-4444-8444-444444444444") {
  return () => `ord_${value}`;
}

async function withMemoryAuthority(config, operation) {
  const store = await openOrderExecutionStore({
    dbPath: ":memory:",
    now: (() => {
      let now = 1_700_000_100_000;
      return () => now++;
    })()
  });
  const adapter = new FakeLiveIbkrAdapter(config);
  const authority = createLiveOrderAuthority({
    adapter,
    store,
    processLiveEnabled: true,
    createLocalOrderId: deterministicOrderId()
  });
  try {
    return await operation({ store, adapter, authority });
  } finally {
    await store.close();
  }
}

test("LIVE create cannot reach submit when process LIVE is not armed", async () => {
  const store = await openOrderExecutionStore({ dbPath: ":memory:" });
  const adapter = new FakeLiveIbkrAdapter();
  const authority = createLiveOrderAuthority({
    adapter,
    store,
    processLiveEnabled: false,
    createLocalOrderId: deterministicOrderId()
  });

  try {
    await assert.rejects(
      authority.create(validLiveIntent()),
      (error) => error.code === "LIVE_PROCESS_NOT_ENABLED"
    );
    assert.equal(adapter.getCallCounts().submitOrder, 0);
    assert.equal(await store.getByRequestId("req-live-authority-1"), null);
  } finally {
    await store.close();
  }
});

test("successful LIVE create runs what-if before one submit and same request never blind-resubmits", async () => {
  await withMemoryAuthority({}, async ({ store, adapter, authority }) => {
    const created = await authority.create(validLiveIntent());
    assert.equal(created.lifecycleState, SUBMITTED);
    assert.equal(created.replayed, false);
    assert.equal(created.providerOrderId, "SYNTH-ORDER-1");
    assert.equal(adapter.getCallCounts().previewOrder, 1);
    assert.equal(adapter.getCallCounts().submitOrder, 1);

    const replay = await authority.create(validLiveIntent());
    assert.equal(replay.lifecycleState, SUBMITTED);
    assert.equal(replay.replayed, true);
    assert.equal(replay.localOrderId, created.localOrderId);
    assert.equal(adapter.getCallCounts().submitOrder, 1);

    const persisted = await store.getByRequestId("req-live-authority-1");
    assert.equal(persisted.lifecycleState, SUBMITTED);
  });
});

test("post-submit acknowledgement loss is durable and same-request replay reconciles without a second submit", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-order-ack-"));
  const dbPath = path.join(tempDir, "orders.duckdb");
  const adapter = new FakeLiveIbkrAdapter({ submitMode: "ACKNOWLEDGEMENT_UNKNOWN" });
  let store = null;

  try {
    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_110_000 });
    let authority = createLiveOrderAuthority({
      adapter,
      store,
      processLiveEnabled: true,
      createLocalOrderId: deterministicOrderId()
    });

    const uncertain = await authority.create(validLiveIntent());
    assert.equal(uncertain.lifecycleState, ACKNOWLEDGEMENT_UNKNOWN);
    assert.equal(adapter.getCallCounts().submitOrder, 1);

    await store.close();
    store = null;

    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_110_500 });
    authority = createLiveOrderAuthority({
      adapter,
      store,
      processLiveEnabled: true,
      createLocalOrderId: deterministicOrderId("55555555-5555-4555-8555-555555555555")
    });

    const reconciled = await authority.create(validLiveIntent());
    assert.equal(reconciled.replayed, true);
    assert.equal(reconciled.lifecycleState, SUBMITTED);
    assert.equal(reconciled.providerOrderId, "SYNTH-ORDER-1");
    assert.equal(adapter.getCallCounts().submitOrder, 1);
    assert.ok(adapter.getCallCounts().getOrders >= 1);
    assert.ok(adapter.getCallCounts().getTrades >= 1);
  } finally {
    if (store) await store.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("provider reply is explicit, known reply continues, and unknown reply message fails closed", async () => {
  await withMemoryAuthority(
    { submitMode: "REPLY_REQUIRED", confirmMode: "SUBMITTED", replyMessageIds: ["o163"] },
    async ({ adapter, authority }) => {
      const pending = await authority.create(validLiveIntent());
      assert.equal(pending.lifecycleState, REPLY_REQUIRED);
      assert.equal(pending.replyRequired, true);
      assert.deepEqual(pending.replyMessageIds, ["o163"]);
      assert.equal(adapter.getCallCounts().confirmReply, 0);

      await assert.rejects(
        authority.confirm(pending.localOrderId, { confirmed: false }),
        (error) => error.code === "EXPLICIT_CONFIRMATION_REQUIRED"
      );
      assert.equal(adapter.getCallCounts().confirmReply, 0);

      const confirmed = await authority.confirm(pending.localOrderId, { confirmed: true });
      assert.equal(confirmed.lifecycleState, SUBMITTED);
      assert.equal(confirmed.replyRequired, false);
      assert.equal(adapter.getCallCounts().confirmReply, 1);
    }
  );

  await withMemoryAuthority(
    { submitMode: "REPLY_REQUIRED", replyMessageIds: ["SYNTH-UNKNOWN-QUESTION"] },
    async ({ adapter, authority }) => {
      const pending = await authority.create(validLiveIntent());
      await assert.rejects(
        authority.confirm(pending.localOrderId, { confirmed: true }),
        (error) => error.code === "PROVIDER_REPLY_UNMODELED"
      );
      assert.equal(adapter.getCallCounts().confirmReply, 0);
    }
  );
});

test("conclusive submit failure is distinct from acknowledgement unknown", async () => {
  await withMemoryAuthority(
    { submitMode: "SUBMIT_FAILED" },
    async ({ store, adapter, authority }) => {
      await assert.rejects(
        authority.create(validLiveIntent()),
        (error) => error.code === "CPGW_REQUEST_FAILED"
      );
      assert.equal(adapter.getCallCounts().submitOrder, 1);
      const persisted = await store.getByRequestId("req-live-authority-1");
      assert.equal(persisted.lifecycleState, SUBMIT_FAILED);
    }
  );
});

test("reconciliation distinguishes partial and full fills", async () => {
  await withMemoryAuthority({}, async ({ adapter, authority }) => {
    const created = await authority.create(validLiveIntent({ quantity: 2 }));
    adapter.setObservation({ filledQuantity: 1 });
    const partial = await authority.reconcile(created.localOrderId);
    assert.equal(partial.lifecycleState, PARTIALLY_FILLED);
    assert.equal(partial.filledQuantity, 1);

    adapter.setObservation({ filledQuantity: 2, status: "Filled" });
    const filled = await authority.reconcile(created.localOrderId);
    assert.equal(filled.lifecycleState, FILLED);
    assert.equal(filled.filledQuantity, 2);

    const beforeCancel = adapter.getCallCounts().cancelOrder;
    const noCancel = await authority.cancel(created.localOrderId);
    assert.equal(noCancel.lifecycleState, FILLED);
    assert.equal(adapter.getCallCounts().cancelOrder, beforeCancel);
  });
});

test("cancel after a partial fill cancels only the remainder and preserves observed filled quantity", async () => {
  await withMemoryAuthority({}, async ({ adapter, authority }) => {
    const created = await authority.create(validLiveIntent({ quantity: 2 }));
    adapter.setObservation({ filledQuantity: 1 });
    const partial = await authority.reconcile(created.localOrderId);
    assert.equal(partial.lifecycleState, PARTIALLY_FILLED);
    assert.equal(partial.filledQuantity, 1);

    const cancelled = await authority.cancel(created.localOrderId);
    assert.equal(cancelled.lifecycleState, CANCELLED);
    assert.equal(cancelled.filledQuantity, 1);
    assert.equal(cancelled.requestedQuantity, 2);
    assert.equal(adapter.getCallCounts().cancelOrder, 1);
  });
});
