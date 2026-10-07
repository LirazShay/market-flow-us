import assert from "node:assert/strict";
import test from "node:test";

import { createServiceFixture } from "./helpers/service-fixture.mjs";

test("Basic BUY prepare is routed by the Viewer service and fails closed until sidecar readiness", async () => {
  const fixture = await createServiceFixture({
    config: {
      buy: {
        enabled: true,
        quantity: 2,
        mode: "DRY_RUN"
      }
    }
  });
  const viewer = await fixture.connect("viewer", "basic-buy-viewer");

  try {
    const prepared = await viewer.request("order.buy.prepare", {
      securityId: "1001"
    });

    assert.equal(prepared.type, "response.error");
    assert.equal(prepared.payload.requestType, "order.buy.prepare");
    assert.equal(prepared.payload.code, "SERVICE_NOT_READY");
    assert.equal(prepared.payload.message, "Service is not ready.");
    assert.equal(prepared.payload.retryable, false);
    assert.equal(prepared.payload.details, null);

    const support = await viewer.request("viewer.support.snapshot");
    assert.equal(support.type, "response.ok");
    assert.equal(support.payload.data.authority.latestCount, 0);
    assert.equal(support.payload.data.authority.historyCount, 0);

    const lastError = support.payload.data.diagnostics.lastError;
    assert.equal(lastError.component, "basic_buy");
    assert.equal(lastError.operation, "order.buy.prepare");
    assert.equal(lastError.checkpoint, "basic_buy.prepare");
    assert.equal(lastError.error.code, "SERVICE_NOT_READY");
  } finally {
    await fixture.cleanup();
  }
});
