import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiagnosticTracker,
  DIAGNOSTIC_CHECKPOINTS
} from "../../shared/diagnostics/index.js";

const DEMO_BUY_READ_CHECKPOINTS = [
  "demo_buy.evaluate",
  "demo_buy.read",
  "demo_buy.provenance_read",
  "demo_buy.observation_read"
];

test("Demo Buy evaluator/read checkpoints are registered to the existing bounded diagnostic component", () => {
  const tracker = createDiagnosticTracker({ now: () => 1000 });

  for (const checkpoint of DEMO_BUY_READ_CHECKPOINTS) {
    assert.equal(DIAGNOSTIC_CHECKPOINTS[checkpoint], "demo_buy");
    const record = tracker.recordSuccess({
      component: "demo_buy",
      operation: checkpoint,
      operationId: checkpoint,
      checkpoint,
      context: {
        itemCount: 50,
        hasMore: true,
        sql: "SENTINEL_SQL",
        contextJson: "SENTINEL_CONTEXT"
      }
    });
    assert.deepEqual(record.context, { itemCount: 50, hasMore: true });
  }

  const serialized = JSON.stringify(tracker.snapshot());
  assert.equal(serialized.includes("SENTINEL_SQL"), false);
  assert.equal(serialized.includes("SENTINEL_CONTEXT"), false);
});
