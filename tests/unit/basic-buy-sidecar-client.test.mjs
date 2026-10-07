import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  BasicBuySidecarError,
  startBasicBuySidecar
} from "../../local-service/orders/basic-buy-sidecar.js";

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
  }

  kill(signal) {
    this.signalCode = signal;
    queueMicrotask(() => this.emit("exit", 0, signal));
    return true;
  }
}

function intent() {
  return {
    requestId: "buy-stable-request-1",
    instrument: {
      symbol: "AAA",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 2,
    orderType: "MKT",
    tif: "DAY",
    executionMode: "DRY_RUN"
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
    async json() {
      return body;
    }
  };
}

function harness(fetchImpl) {
  const child = new FakeChild();
  return {
    child,
    fetchImpl,
    spawnProcess() {
      queueMicrotask(() => child.emit("message", {
        type: "ibkr-order-service.ready",
        baseUrl: "http://127.0.0.1:8770",
        mode: "DRY_RUN",
        callerToken: "T".repeat(48)
      }));
      return child;
    }
  };
}

async function start(fetchImpl) {
  const fixture = harness(fetchImpl);
  const sidecar = await startBasicBuySidecar({
    buyConfig: { enabled: true, quantity: 2, mode: "DRY_RUN" },
    spawnProcess: fixture.spawnProcess.bind(fixture),
    fetchImpl,
    readyTimeoutMs: 100,
    stopTimeoutMs: 100
  });
  return { sidecar, fixture };
}

test("owned sidecar client sends the exact stable intent with Node-only Bearer authorization and no Origin", async () => {
  const calls = [];
  const { sidecar } = await start(async (url, options) => {
    calls.push({ url, options });
    return response(200, {
      localOrderId: "ord_test_1",
      lifecycleState: "DRY_RUN_COMPLETE",
      executionMode: "DRY_RUN",
      replayed: false
    });
  });

  try {
    const result = await sidecar.createOrder(intent());
    assert.equal(result.lifecycleState, "DRY_RUN_COMPLETE");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8770/orders");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${"T".repeat(48)}`);
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    assert.equal("Origin" in calls[0].options.headers, false);
    assert.deepEqual(JSON.parse(calls[0].options.body), intent());
    assert.equal(JSON.stringify(result).includes("TTTT"), false);
  } finally {
    await sidecar.close();
  }
});

test("create retry after local transport loss reuses the same requestId and exact normalized intent", async () => {
  const bodies = [];
  let attempt = 0;
  const { sidecar } = await start(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    attempt += 1;
    if (attempt === 1) throw new Error("synthetic local response loss");
    return response(200, {
      localOrderId: "ord_test_2",
      lifecycleState: "DRY_RUN_COMPLETE",
      executionMode: "DRY_RUN",
      replayed: true
    });
  });

  try {
    const result = await sidecar.createOrder(intent());
    assert.equal(result.replayed, true);
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(bodies[0].requestId, "buy-stable-request-1");
  } finally {
    await sidecar.close();
  }
});

test("two local transport failures surface acknowledgement unknown without inventing a fresh requestId", async () => {
  const bodies = [];
  const { sidecar } = await start(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    throw new Error("synthetic local transport loss");
  });

  try {
    await assert.rejects(
      () => sidecar.createOrder(intent()),
      (error) => error instanceof BasicBuySidecarError
        && error.code === "BASIC_BUY_ORDER_SERVICE_RESPONSE_UNKNOWN"
    );
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].requestId, "buy-stable-request-1");
    assert.equal(bodies[1].requestId, "buy-stable-request-1");
  } finally {
    await sidecar.close();
  }
});

test("sidecar HTTP rejection preserves only the bounded order-service code", async () => {
  const { sidecar } = await start(async () => response(409, {
    code: "LIVE_PROCESS_NOT_ENABLED",
    privateDetail: "must-not-cross"
  }));

  try {
    await assert.rejects(
      () => sidecar.createOrder(intent()),
      (error) => error instanceof BasicBuySidecarError
        && error.code === "BASIC_BUY_ORDER_SERVICE_REJECTED"
        && error.orderServiceCode === "LIVE_PROCESS_NOT_ENABLED"
        && JSON.stringify(error).includes("privateDetail") === false
        && JSON.stringify(error).includes("TTTT") === false
    );
  } finally {
    await sidecar.close();
  }
});

test("explicit provider reply confirmation uses the protected owned-sidecar endpoint and never accepts browser order fields", async () => {
  const calls = [];
  const { sidecar } = await start(async (url, options) => {
    calls.push({ url, options });
    return response(200, {
      localOrderId: "ord_reply_1",
      lifecycleState: "SUBMITTED",
      executionMode: "LIVE",
      replayed: false
    });
  });

  try {
    const result = await sidecar.confirmReply("ord_reply_1");
    assert.equal(result.lifecycleState, "SUBMITTED");
    assert.equal(calls[0].url, "http://127.0.0.1:8770/orders/ord_reply_1/confirm");
    assert.deepEqual(JSON.parse(calls[0].options.body), { confirmed: true });
  } finally {
    await sidecar.close();
  }
});

test("child exit revokes execution authority before any protected HTTP call", async () => {
  let fetchCalls = 0;
  const { sidecar, fixture } = await start(async () => {
    fetchCalls += 1;
    return response(200, {});
  });

  fixture.child.exitCode = 1;
  fixture.child.emit("exit", 1, null);

  await assert.rejects(
    () => sidecar.createOrder(intent()),
    (error) => error instanceof BasicBuySidecarError
      && error.code === "BASIC_BUY_SIDECAR_NOT_READY"
  );
  assert.equal(fetchCalls, 0);
});
