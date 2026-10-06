import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { FakeIbkrAdapter } from "../../ibkr-order-service/fake-adapter.js";
import {
  ORDER_SERVICE_HOST,
  createOrderServiceRuntime
} from "../../ibkr-order-service/service.js";
import { openOrderExecutionStore } from "../../ibkr-order-service/store.js";

function validIntent(overrides = {}) {
  return {
    requestId: "req-idempotency-1",
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
    executionMode: "DRY_RUN",
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

async function postOrder({ baseUrl, token, intent }) {
  const response = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: {
      ...auth(token),
      "content-type": "application/json"
    },
    body: JSON.stringify(intent)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

test("same requestId reuses persisted local result, different intent is rejected, and restart preserves facts but not token", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-order-store-"));
  const dbPath = path.join(tempDir, "orders.duckdb");
  let store = null;
  let server = null;

  try {
    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_000_000 });
    const firstAdapter = new FakeIbkrAdapter();
    const firstRuntime = createOrderServiceRuntime({ adapter: firstAdapter, store });
    const firstHttp = await listen(firstRuntime);
    server = firstHttp.server;

    const created = await postOrder({
      baseUrl: firstHttp.baseUrl,
      token: firstRuntime.callerToken,
      intent: validIntent()
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.replayed, false);
    assert.match(created.body.localOrderId, /^ord_[0-9a-f-]{36}$/u);
    assert.equal(created.body.lifecycleState, "DRY_RUN_COMPLETE");
    assert.equal(created.body.preview.synthetic, true);

    const replay = await postOrder({
      baseUrl: firstHttp.baseUrl,
      token: firstRuntime.callerToken,
      intent: validIntent()
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.localOrderId, created.body.localOrderId);
    assert.equal(replay.body.intentFingerprint, created.body.intentFingerprint);

    const conflict = await postOrder({
      baseUrl: firstHttp.baseUrl,
      token: firstRuntime.callerToken,
      intent: validIntent({ quantity: 3 })
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "REQUEST_ID_REUSE_MISMATCH");
    assert.equal(firstAdapter.getCallCounts().submitOrder, 0);

    const persistedBeforeRestart = await store.getByRequestId("req-idempotency-1");
    assert.deepEqual(Object.keys(persistedBeforeRestart).sort(), [
      "createdAtMs",
      "intentFingerprint",
      "lifecycleState",
      "localOrderId",
      "requestId",
      "updatedAtMs"
    ]);
    assert.equal(persistedBeforeRestart.localOrderId, created.body.localOrderId);
    assert.equal(persistedBeforeRestart.lifecycleState, "DRY_RUN_COMPLETE");

    const firstToken = firstRuntime.callerToken;
    await closeServer(server);
    server = null;
    await store.close();
    store = null;

    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_000_500 });
    const secondAdapter = new FakeIbkrAdapter();
    const secondRuntime = createOrderServiceRuntime({ adapter: secondAdapter, store });
    assert.notEqual(secondRuntime.callerToken, firstToken);
    const secondHttp = await listen(secondRuntime);
    server = secondHttp.server;

    const oldTokenResponse = await postOrder({
      baseUrl: secondHttp.baseUrl,
      token: firstToken,
      intent: validIntent()
    });
    assert.equal(oldTokenResponse.status, 401);
    assert.equal(oldTokenResponse.body.code, "LOCAL_CALLER_UNAUTHORIZED");
    assert.deepEqual(secondAdapter.getCallCounts(), {
      resolveInstrument: 0,
      previewOrder: 0,
      submitOrder: 0
    });

    const replayAfterRestart = await postOrder({
      baseUrl: secondHttp.baseUrl,
      token: secondRuntime.callerToken,
      intent: validIntent()
    });
    assert.equal(replayAfterRestart.status, 200);
    assert.equal(replayAfterRestart.body.replayed, true);
    assert.equal(replayAfterRestart.body.localOrderId, created.body.localOrderId);
    assert.equal(secondAdapter.getCallCounts().submitOrder, 0);

    const persistedAfterRestart = await store.getByRequestId("req-idempotency-1");
    assert.equal(persistedAfterRestart.localOrderId, created.body.localOrderId);
    assert.equal(persistedAfterRestart.createdAtMs, 1_700_000_000_000);

    await closeServer(server);
    server = null;
    await store.close();
    store = null;

    const rawDatabase = await readFile(dbPath);
    assert.equal(rawDatabase.includes(Buffer.from(firstToken, "utf8")), false);
    assert.equal(rawDatabase.includes(Buffer.from(secondRuntime.callerToken, "utf8")), false);
    for (const forbidden of ["accountId", "cookie", "providerSession", "authorization", "rawResponse"]) {
      assert.equal(rawDatabase.includes(Buffer.from(forbidden, "utf8")), false, forbidden);
    }
  } finally {
    if (server) await closeServer(server);
    if (store) await store.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("concurrent duplicate creates serialize to one stable local order identity", async () => {
  const store = await openOrderExecutionStore({ dbPath: ":memory:", now: () => 1_700_000_001_000 });
  const adapter = new FakeIbkrAdapter();
  const runtime = createOrderServiceRuntime({ adapter, store });
  const http = await listen(runtime);

  try {
    const [first, second] = await Promise.all([
      postOrder({ baseUrl: http.baseUrl, token: runtime.callerToken, intent: validIntent({ requestId: "req-concurrent" }) }),
      postOrder({ baseUrl: http.baseUrl, token: runtime.callerToken, intent: validIntent({ requestId: "req-concurrent" }) })
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.localOrderId, second.body.localOrderId);
    assert.deepEqual([first.body.replayed, second.body.replayed].sort(), [false, true]);
    assert.equal(adapter.getCallCounts().submitOrder, 0);

    const persisted = await store.getByRequestId("req-concurrent");
    assert.equal(persisted.localOrderId, first.body.localOrderId);
  } finally {
    await closeServer(http.server);
    await store.close();
  }
});
