import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeLiveIbkrAdapter } from "../../ibkr-order-service/fake-live-adapter.js";
import { createLiveOrderAuthority } from "../../ibkr-order-service/live-order-authority.js";
import {
  CANCELLED,
  PARTIALLY_FILLED,
  SUBMITTED,
  openOrderExecutionStore
} from "../../ibkr-order-service/store.js";

function validLiveIntent() {
  return {
    requestId: "req-cancel-status-1",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 2,
    orderType: "MKT",
    tif: "DAY",
    executionMode: "LIVE"
  };
}

test("reconciliation treats only confirmed Cancelled as terminal cancellation", async () => {
  const store = await openOrderExecutionStore({ dbPath: ":memory:" });
  const adapter = new FakeLiveIbkrAdapter();
  const authority = createLiveOrderAuthority({
    adapter,
    store,
    processLiveEnabled: true,
    createLocalOrderId: () => "ord_77777777-7777-4777-8777-777777777777"
  });

  try {
    const created = await authority.create(validLiveIntent());
    assert.equal(created.lifecycleState, SUBMITTED);

    adapter.setObservation({ filledQuantity: 0, status: "PendingCancel" });
    const pendingCancel = await authority.reconcile(created.localOrderId);
    assert.equal(pendingCancel.lifecycleState, SUBMITTED);

    adapter.setObservation({ filledQuantity: 1, status: "PreCancelled" });
    const preCancelled = await authority.reconcile(created.localOrderId);
    assert.equal(preCancelled.lifecycleState, PARTIALLY_FILLED);
    assert.equal(preCancelled.filledQuantity, 1);

    adapter.setObservation({ filledQuantity: 1, status: "Cancelled" });
    const cancelled = await authority.reconcile(created.localOrderId);
    assert.equal(cancelled.lifecycleState, CANCELLED);
    assert.equal(cancelled.filledQuantity, 1);
  } finally {
    await store.close();
  }
});
