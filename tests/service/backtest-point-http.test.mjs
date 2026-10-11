import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";
import {
  startBacktestLabRuntime
} from "../../backtest-lab/runtime.js";
import {
  BacktestPointResultError
} from "../../backtest-lab/point-result.js";

async function postJson(runtime, pathname, body) {
  const response = await fetch(`http://${runtime.host}:${runtime.port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: JSON.parse(text)
  };
}

function pointRequest(overrides = {}) {
  return {
    sourceId: "active",
    requestedAtMs: 25_000,
    queries: [
      { id: "A", name: "Query A", sql: "SELECT security_id FROM latest ORDER BY security_id" },
      { id: "B", name: "Query B", sql: "SELECT security_id FROM latest ORDER BY security_id DESC" }
    ],
    topX: 10,
    horizonsMs: [10_000, 20_000, 30_000],
    ...overrides
  };
}

test("Backtest point HTTP freezes and delegates one exact shared-point request", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-point-http-"));
  let runtime = null;
  let captured = null;

  try {
    const expectedPoint = Object.freeze({
      available: false,
      unavailableReason: "NO_BASELINE",
      sourceId: "active",
      requestedAtMs: 25_000,
      baseline: null,
      topX: 10,
      horizonsMs: Object.freeze([10_000, 20_000, 30_000]),
      queries: Object.freeze([])
    });

    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      runPoint: async (request) => {
        captured = request;
        return expectedPoint;
      }
    });

    const response = await postJson(runtime, "/api/point/run", pointRequest());

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { point: expectedPoint });
    assert.deepEqual(captured, {
      dataDir,
      sourceId: "active",
      requestedAtMs: 25_000,
      queries: [
        { id: "A", name: "Query A", sql: "SELECT security_id FROM latest ORDER BY security_id" },
        { id: "B", name: "Query B", sql: "SELECT security_id FROM latest ORDER BY security_id DESC" }
      ],
      topX: 10,
      horizonsMs: [10_000, 20_000, 30_000]
    });
    assert.equal(Object.isFrozen(captured.queries), true);
    assert.equal(Object.isFrozen(captured.queries[0]), true);
    assert.equal(Object.isFrozen(captured.horizonsMs), true);
    assert.equal(response.text.includes(dataDir), false);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest point HTTP rejects shape drift and invalid shared configuration before execution", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-point-invalid-"));
  let runtime = null;
  let runCalls = 0;

  try {
    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      runPoint: async () => {
        runCalls += 1;
        throw new Error("must not execute");
      }
    });

    const extraTopLevel = await postJson(runtime, "/api/point/run", {
      ...pointRequest(),
      path: path.join(dataDir, "private.duckdb")
    });
    assert.equal(extraTopLevel.status, 400);
    assert.equal(extraTopLevel.body.error.code, "BACKTEST_REQUEST_INVALID");
    assert.equal(extraTopLevel.text.includes(dataDir), false);

    const extraQueryField = await postJson(runtime, "/api/point/run", pointRequest({
      queries: [{ id: "A", name: "Query A", sql: "SELECT 1", intervalMs: 3000 }]
    }));
    assert.equal(extraQueryField.status, 400);
    assert.equal(extraQueryField.body.error.code, "BACKTEST_REQUEST_INVALID");

    const duplicateQueryIds = await postJson(runtime, "/api/point/run", pointRequest({
      queries: [
        { id: "A", name: "Query A", sql: "SELECT 1" },
        { id: "A", name: "Query A copy", sql: "SELECT 2" }
      ]
    }));
    assert.equal(duplicateQueryIds.status, 400);
    assert.equal(duplicateQueryIds.body.error.code, "BACKTEST_REQUEST_INVALID");

    const reorderedHorizons = await postJson(runtime, "/api/point/run", pointRequest({
      horizonsMs: [20_000, 10_000]
    }));
    assert.equal(reorderedHorizons.status, 400);
    assert.equal(reorderedHorizons.body.error.code, "BACKTEST_REQUEST_INVALID");

    assert.equal(runCalls, 0);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest point HTTP exposes stable Scanner and selected-row errors without private details", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-point-errors-"));
  let runtime = null;
  let failure = new ProtocolValidationError(ERROR_CODES.SCANNER_NON_SELECT);

  try {
    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      runPoint: async () => {
        throw failure;
      }
    });

    const unsupported = await postJson(runtime, "/api/point/run", pointRequest());
    assert.equal(unsupported.status, 422);
    assert.deepEqual(unsupported.body, {
      error: {
        code: ERROR_CODES.SCANNER_NON_SELECT,
        message: "Scanner accepts SELECT statements only."
      }
    });

    failure = new BacktestPointResultError(
      "Return exactly one securityId/security_id column.",
      "BACKTEST_IDENTITY_COLUMN_INVALID"
    );
    const missingIdentity = await postJson(runtime, "/api/point/run", pointRequest());
    assert.equal(missingIdentity.status, 422);
    assert.deepEqual(missingIdentity.body, {
      error: {
        code: "BACKTEST_IDENTITY_COLUMN_INVALID",
        message: "Return exactly one securityId/security_id column."
      }
    });

    failure = new Error(`private failure at ${dataDir}/market-flow-us.duckdb with raw rows`);
    const privateFailure = await postJson(runtime, "/api/point/run", pointRequest());
    assert.equal(privateFailure.status, 500);
    assert.deepEqual(privateFailure.body, {
      error: {
        code: "BACKTEST_RUNTIME_ERROR",
        message: "Backtest Lab operation failed safely."
      }
    });
    assert.equal(privateFailure.text.includes(dataDir), false);
    assert.equal(privateFailure.text.includes("raw rows"), false);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
