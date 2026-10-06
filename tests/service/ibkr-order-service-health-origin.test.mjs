import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import {
  ORDER_SERVICE_HOST,
  createOrderServiceRuntime
} from "../../ibkr-order-service/service.js";

test("GET /health rejects browser Origin without granting CORS", async () => {
  const runtime = createOrderServiceRuntime();
  const server = createServer(runtime.handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, ORDER_SERVICE_HOST, resolve);
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://${ORDER_SERVICE_HOST}:${address.port}/health`, {
      headers: { Origin: "https://attacker.example" }
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await response.json(), {
      code: "BROWSER_ORIGIN_REJECTED"
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
