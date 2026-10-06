import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { FakeLiveIbkrAdapter } from "../../ibkr-order-service/fake-live-adapter.js";
import {
  ORDER_SERVICE_HOST,
  createOrderServiceRuntime
} from "../../ibkr-order-service/service.js";
import { openOrderExecutionStore } from "../../ibkr-order-service/store.js";

function liveIntent(overrides = {}) {
  return {
    requestId: "req-live-http-1",
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

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function listen(runtime) {
  const server = createServer(runtime.handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, ORDER_SERVICE_HOST, resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    server,
    baseUrl: `http://${ORDER_SERVICE_HOST}:${address.port}`
  };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function jsonRequest({ baseUrl, token, path, method = "GET", body }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...auth(token),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

async function withRuntime({ adapter, processLiveEnabled }, operation) {
  const store = await openOrderExecutionStore({ dbPath: ":memory:" });
  const runtime = createOrderServiceRuntime({ adapter, store, processLiveEnabled });
  const http = await listen(runtime);
  try {
    await operation({ store, runtime, ...http });
  } finally {
    await closeServer(http.server);
    await store.close();
  }
}

test("LIVE request is rejected before submit unless process LIVE enablement is explicit", async () => {
  const adapter = new FakeLiveIbkrAdapter();
  await withRuntime({ adapter, processLiveEnabled: false }, async ({ runtime, baseUrl }) => {
    assert.equal(runtime.liveCapable, true);
    assert.equal(runtime.liveEnabled, false);

    const result = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/orders",
      method: "POST",
      body: liveIntent()
    });

    assert.equal(result.status, 409);
    assert.equal(result.body.code, "LIVE_PROCESS_NOT_ENABLED");
    assert.equal(adapter.getCallCounts().submitOrder, 0);
  });
});

test("provider preview and explicit reply-confirm/cancel lifecycle are exposed through the loopback API", async () => {
  const adapter = new FakeLiveIbkrAdapter({
    submitMode: "REPLY_REQUIRED",
    confirmMode: "SUBMITTED"
  });

  await withRuntime({ adapter, processLiveEnabled: true }, async ({ runtime, baseUrl }) => {
    assert.equal(runtime.liveEnabled, true);

    const session = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/session"
    });
    assert.deepEqual(session.body, {
      authenticated: true,
      brokerageSession: true,
      connected: true
    });

    const rejectedInitBody = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/session/init",
      method: "POST",
      body: { username: "must-not-be-accepted" }
    });
    assert.equal(rejectedInitBody.status, 400);
    assert.equal(rejectedInitBody.body.code, "INVALID_REQUEST_BODY");
    assert.equal(adapter.getCallCounts().initializeSession, 0);

    const initialized = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/session/init",
      method: "POST",
      body: {}
    });
    assert.equal(initialized.status, 200);

    const resolved = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/instruments/resolve",
      method: "POST",
      body: liveIntent().instrument
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.status, "EXACT");
    assert.equal(resolved.body.conid, 265598);

    const preview = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/orders/preview",
      method: "POST",
      body: liveIntent()
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.preview.status, "ACCEPTED");
    assert.equal(adapter.getCallCounts().submitOrder, 0);

    const created = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/orders",
      method: "POST",
      body: liveIntent()
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.lifecycleState, "REPLY_REQUIRED");
    assert.equal(created.body.replyRequired, true);
    assert.deepEqual(created.body.replyMessageIds, ["o163"]);
    assert.equal(adapter.getCallCounts().submitOrder, 1);
    assert.equal(adapter.getCallCounts().confirmReply, 0);

    const refusedImplicitConfirm = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: `/orders/${created.body.localOrderId}/confirm`,
      method: "POST",
      body: { confirmed: false }
    });
    assert.equal(refusedImplicitConfirm.status, 409);
    assert.equal(refusedImplicitConfirm.body.code, "EXPLICIT_CONFIRMATION_REQUIRED");
    assert.equal(adapter.getCallCounts().confirmReply, 0);

    const confirmed = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: `/orders/${created.body.localOrderId}/confirm`,
      method: "POST",
      body: { confirmed: true }
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.lifecycleState, "SUBMITTED");
    assert.equal(adapter.getCallCounts().confirmReply, 1);

    adapter.setObservation({ filledQuantity: 1, status: "Submitted" });

    const cancelled = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: `/orders/${created.body.localOrderId}/cancel`,
      method: "POST",
      body: {}
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.lifecycleState, "CANCELLED");
    assert.equal(cancelled.body.filledQuantity, 1);

    const local = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: `/orders/${created.body.localOrderId}`
    });
    assert.equal(local.status, 200);
    assert.equal(local.body.lifecycleState, "CANCELLED");
    assert.equal(local.body.filledQuantity, 1);

    const orders = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/orders"
    });
    assert.equal(orders.status, 200);
    assert.equal(orders.body.orders.length, 1);
    assert.equal(JSON.stringify(orders.body).includes("SYNTH-ACCOUNT-1"), false);

    const trades = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/trades"
    });
    assert.equal(trades.status, 200);
    assert.equal(trades.body.trades.length, 1);
    assert.equal(JSON.stringify(trades.body).includes("SYNTH-ACCOUNT-1"), false);
  });
});

test("ACKNOWLEDGEMENT_UNKNOWN replay reconciles remote state without a second submit", async () => {
  const adapter = new FakeLiveIbkrAdapter({ submitMode: "ACKNOWLEDGEMENT_UNKNOWN" });

  await withRuntime({ adapter, processLiveEnabled: true }, async ({ runtime, baseUrl }) => {
    const first = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/orders",
      method: "POST",
      body: liveIntent({ requestId: "req-live-http-unknown" })
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.lifecycleState, "ACKNOWLEDGEMENT_UNKNOWN");
    assert.equal(adapter.getCallCounts().submitOrder, 1);

    const replay = await jsonRequest({
      baseUrl,
      token: runtime.callerToken,
      path: "/orders",
      method: "POST",
      body: liveIntent({ requestId: "req-live-http-unknown" })
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.lifecycleState, "SUBMITTED");
    assert.equal(replay.body.replayed, true);
    assert.equal(adapter.getCallCounts().submitOrder, 1);
    assert.equal(adapter.getCallCounts().getOrders > 0, true);
  });
});
