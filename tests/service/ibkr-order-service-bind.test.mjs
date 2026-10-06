import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_PORT,
  startOrderService
} from "../../ibkr-order-service/service.js";

test("production order service binds only the contracted loopback host and port", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-order-bind-"));
  const dbPath = path.join(tempDir, "orders.duckdb");
  let runtime = null;

  try {
    runtime = await startOrderService({ dbPath });
    const address = runtime.server.address();
    assert.equal(typeof address, "object");
    assert.equal(address.address, ORDER_SERVICE_HOST);
    assert.equal(address.port, ORDER_SERVICE_PORT);
    assert.equal(address.address, "127.0.0.1");
    assert.equal(address.port, 8770);
  } finally {
    if (runtime) await runtime.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
