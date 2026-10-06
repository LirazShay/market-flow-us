import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_PORT,
  startOrderService
} from "../../ibkr-order-service/service.js";

test("production order service binds only the contracted loopback host and port", async () => {
  const runtime = await startOrderService();
  try {
    const address = runtime.server.address();
    assert.equal(typeof address, "object");
    assert.equal(address.address, ORDER_SERVICE_HOST);
    assert.equal(address.port, ORDER_SERVICE_PORT);
    assert.equal(address.address, "127.0.0.1");
    assert.equal(address.port, 8770);
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
  }
});
