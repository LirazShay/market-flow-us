import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "node:test";

import { FakeIbkrAdapter } from "../../ibkr-order-service/fake-adapter.js";
import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_MAX_BODY_BYTES,
  createOrderServiceRuntime
} from "../../ibkr-order-service/service.js";

const servers = new Set();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve) => {
    server.close(() => resolve());
  })));
  servers.clear();
});

function validIntent(overrides = {}) {
  return {
    requestId: "req-http-security-1",
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

async function withRuntime(adapter = new FakeIbkrAdapter()) {
  const runtime = createOrderServiceRuntime({ adapter });
  const server = createServer(runtime.handler);
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, ORDER_SERVICE_HOST, resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.equal(address.address, ORDER_SERVICE_HOST);
  return {
    ...runtime,
    adapter,
    server,
    baseUrl: `http://${ORDER_SERVICE_HOST}:${address.port}`
  };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function jsonResponse(response) {
  return {
    response,
    body: await response.json()
  };
}

test("GET /health is unauthenticated, non-sensitive, and grants no CORS", async () => {
  const runtime = await withRuntime();
  const response = await fetch(`${runtime.baseUrl}/health`);
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(JSON.parse(text), {
    service: "ibkr-order-service",
    status: "ok"
  });
  for (const forbidden of [runtime.callerToken, "accountId", "cookie", "providerSession", "callerToken"]) {
    assert.equal(text.includes(forbidden), false);
  }
});

test("missing and wrong caller tokens are rejected before adapter interaction", async () => {
  const runtime = await withRuntime();
  const body = JSON.stringify(validIntent());

  for (const headers of [
    { "content-type": "application/json" },
    { ...auth("definitely-the-wrong-token"), "content-type": "application/json" }
  ]) {
    const { response, body: error } = await jsonResponse(await fetch(`${runtime.baseUrl}/orders/preview`, {
      method: "POST",
      headers,
      body
    }));
    assert.equal(response.status, 401);
    assert.equal(error.code, "LOCAL_CALLER_UNAUTHORIZED");
    assert.equal(JSON.stringify(error).includes(runtime.callerToken), false);
  }

  assert.deepEqual(runtime.adapter.getCallCounts(), {
    resolveInstrument: 0,
    previewOrder: 0,
    submitOrder: 0
  });
});

test("valid caller token permits DRY_RUN preview without provider submit", async () => {
  const runtime = await withRuntime();
  const { response, body } = await jsonResponse(await fetch(`${runtime.baseUrl}/orders/preview`, {
    method: "POST",
    headers: {
      ...auth(runtime.callerToken),
      "content-type": "application/json"
    },
    body: JSON.stringify(validIntent())
  }));

  assert.equal(response.status, 200);
  assert.equal(body.requestId, "req-http-security-1");
  assert.equal(body.preview.kind, "SYNTHETIC_WHAT_IF");
  assert.equal(body.preview.synthetic, true);
  assert.deepEqual(runtime.adapter.getCallCounts(), {
    resolveInstrument: 1,
    previewOrder: 1,
    submitOrder: 0
  });
});

test("browser Origin is rejected with a valid token and no CORS grant", async () => {
  const runtime = await withRuntime();
  const { response, body } = await jsonResponse(await fetch(`${runtime.baseUrl}/orders/preview`, {
    method: "POST",
    headers: {
      ...auth(runtime.callerToken),
      Origin: "https://attacker.example",
      "content-type": "application/json"
    },
    body: JSON.stringify(validIntent())
  }));

  assert.equal(response.status, 403);
  assert.equal(body.code, "BROWSER_ORIGIN_REJECTED");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(runtime.adapter.getCallCounts(), {
    resolveInstrument: 0,
    previewOrder: 0,
    submitOrder: 0
  });
});

test("protected reads require caller authorization", async () => {
  for (const path of ["/session", "/orders", "/orders/local-1", "/trades"]) {
    const runtime = await withRuntime();
    const unauthorized = await jsonResponse(await fetch(`${runtime.baseUrl}${path}`));
    assert.equal(unauthorized.response.status, 401, path);
    assert.equal(unauthorized.body.code, "LOCAL_CALLER_UNAUTHORIZED", path);

    const authorized = await jsonResponse(await fetch(`${runtime.baseUrl}${path}`, {
      headers: auth(runtime.callerToken)
    }));
    assert.notEqual(authorized.response.status, 401, path);
    assert.equal(authorized.response.headers.get("access-control-allow-origin"), null, path);
  }
});

test("state-changing non-JSON content is rejected before adapter interaction", async () => {
  const runtime = await withRuntime();
  const { response, body } = await jsonResponse(await fetch(`${runtime.baseUrl}/orders/preview`, {
    method: "POST",
    headers: {
      ...auth(runtime.callerToken),
      "content-type": "text/plain"
    },
    body: JSON.stringify(validIntent())
  }));

  assert.equal(response.status, 415);
  assert.equal(body.code, "UNSUPPORTED_CONTENT_TYPE");
  assert.deepEqual(runtime.adapter.getCallCounts(), {
    resolveInstrument: 0,
    previewOrder: 0,
    submitOrder: 0
  });
});

test("oversized JSON is rejected before adapter interaction", async () => {
  const runtime = await withRuntime();
  const oversized = JSON.stringify({
    ...validIntent(),
    padding: "x".repeat(ORDER_SERVICE_MAX_BODY_BYTES)
  });
  assert.ok(Buffer.byteLength(oversized) > ORDER_SERVICE_MAX_BODY_BYTES);

  const { response, body } = await jsonResponse(await fetch(`${runtime.baseUrl}/orders/preview`, {
    method: "POST",
    headers: {
      ...auth(runtime.callerToken),
      "content-type": "application/json"
    },
    body: oversized
  }));

  assert.equal(response.status, 413);
  assert.equal(body.code, "REQUEST_TOO_LARGE");
  assert.deepEqual(runtime.adapter.getCallCounts(), {
    resolveInstrument: 0,
    previewOrder: 0,
    submitOrder: 0
  });
});

test("OPTIONS never grants browser CORS", async () => {
  const runtime = await withRuntime();
  const response = await fetch(`${runtime.baseUrl}/orders`, {
    method: "OPTIONS",
    headers: {
      ...auth(runtime.callerToken),
      Origin: "https://attacker.example",
      "access-control-request-method": "POST"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("caller authorization cannot enable LIVE submit in TREE 8.1", async () => {
  const runtime = await withRuntime();
  const { response, body } = await jsonResponse(await fetch(`${runtime.baseUrl}/orders`, {
    method: "POST",
    headers: {
      ...auth(runtime.callerToken),
      "content-type": "application/json"
    },
    body: JSON.stringify(validIntent({ executionMode: "LIVE" }))
  }));

  assert.equal(response.status, 409);
  assert.equal(body.code, "LIVE_EXECUTION_NOT_ENABLED");
  assert.deepEqual(runtime.adapter.getCallCounts(), {
    resolveInstrument: 0,
    previewOrder: 0,
    submitOrder: 0
  });
});

test("POST /orders in DRY_RUN never invokes submit", async () => {
  const runtime = await withRuntime();
  const { response, body } = await jsonResponse(await fetch(`${runtime.baseUrl}/orders`, {
    method: "POST",
    headers: {
      ...auth(runtime.callerToken),
      "content-type": "application/json"
    },
    body: JSON.stringify(validIntent())
  }));

  assert.equal(response.status, 200);
  assert.equal(body.executionMode, "DRY_RUN");
  assert.equal(body.preview.synthetic, true);
  assert.deepEqual(runtime.adapter.getCallCounts(), {
    resolveInstrument: 1,
    previewOrder: 1,
    submitOrder: 0
  });
});

test("a new runtime invalidates the prior generated caller token", async () => {
  const first = await withRuntime();
  const second = await withRuntime();
  assert.notEqual(first.callerToken, second.callerToken);

  const response = await fetch(`${second.baseUrl}/orders`, {
    method: "POST",
    headers: {
      ...auth(first.callerToken),
      "content-type": "application/json"
    },
    body: JSON.stringify(validIntent())
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "LOCAL_CALLER_UNAUTHORIZED");
  assert.deepEqual(second.adapter.getCallCounts(), {
    resolveInstrument: 0,
    previewOrder: 0,
    submitOrder: 0
  });
});
