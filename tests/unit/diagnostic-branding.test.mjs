import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticTracker } from "../../shared/diagnostics/index.js";

test("diagnostic error messages normalize legacy product naming at the public support boundary", () => {
  const tracker = createDiagnosticTracker({ productVersion: "6.2-proof", now: () => 1234 });

  const record = tracker.recordError({
    component: "browser.runtime",
    operation: "service.connection",
    operationId: "producer-service-connection",
    checkpoint: "browser.service.connection",
    error: {
      code: "SERVICE_DISCONNECTED",
      name: "ServiceDisconnectedError",
      message: "Local MarketScope service connection was lost.",
      retryable: false
    }
  });

  assert.equal(record.error.message, "Local Market Flow US service connection was lost.");
  assert.equal(JSON.stringify(record).includes("MarketScope"), false);
});
