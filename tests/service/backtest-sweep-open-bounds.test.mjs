import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startBacktestLabRuntime } from "../../backtest-lab/runtime.js";

async function postJson(runtime, pathname, body) {
  const response = await fetch(`http://${runtime.host}:${runtime.port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test("Backtest Sweep Open rejects a non-negative index beyond the active run", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-sweep-open-bounds-"));
  let runtime = null;
  let openCalls = 0;

  try {
    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      runSweep: async () => Object.freeze({
        metrics: Object.freeze({ requestedPointCount: 2 }),
        page: () => Object.freeze({ offset: 0, limit: 50, totalCount: 2, items: Object.freeze([]) }),
        openPoint: () => {
          openCalls += 1;
          throw new Error("must not open");
        }
      })
    });

    const run = await postJson(runtime, "/api/sweep/run", {
      sourceId: "active",
      fromAtMs: 1_000,
      toAtMs: 2_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      queries: [{ id: "A", name: "Query A", sql: "SELECT security_id FROM latest" }],
      topX: 10,
      horizonsMs: [10_000]
    });
    assert.equal(run.status, 200);

    const opened = await postJson(runtime, "/api/sweep/open", {
      sweepId: run.body.sweep.id,
      index: 2
    });
    assert.equal(opened.status, 400);
    assert.deepEqual(opened.body, {
      error: {
        code: "BACKTEST_REQUEST_INVALID",
        message: "Backtest Sweep Open index is out of range."
      }
    });
    assert.equal(openCalls, 0);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
