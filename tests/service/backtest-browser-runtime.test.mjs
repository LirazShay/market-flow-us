import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startBacktestLabRuntime } from "../../backtest-lab/runtime.js";

async function get(runtime, pathname) {
  const response = await fetch(`http://${runtime.host}:${runtime.port}${pathname}`);
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text()
  };
}

test("Backtest runtime serves one same-origin Inspect/Compare app and bounded built-in Query templates", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-browser-"));
  let runtime = null;

  try {
    runtime = await startBacktestLabRuntime({ dataDir, port: 0 });

    const page = await get(runtime, "/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /^text\/html/);
    assert.equal(page.headers.get("access-control-allow-origin"), null);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(page.text, /Market Flow US — Backtest Lab/);
    assert.match(page.text, /src="\/app\/index\.js"/);
    assert.equal(page.text.includes(dataDir), false);

    const index = await get(runtime, "/app/index.js");
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /^text\/javascript/);
    assert.match(index.text, /createBacktestLabSurface/);

    const client = await get(runtime, "/app/client.js");
    assert.equal(client.status, 200);
    assert.match(client.text, /\/api\/point\/run/);

    const surface = await get(runtime, "/app/surface.js");
    assert.equal(surface.status, 200);
    assert.match(surface.text, /Compare result/);
    assert.match(surface.text, /No-lookahead/);

    const queries = await get(runtime, "/api/queries");
    assert.equal(queries.status, 200);
    const queryBody = JSON.parse(queries.text);
    assert.equal(queryBody.count, 3);
    assert.deepEqual(queryBody.queries.map((query) => query.id), [
      "builtin:all-current-fields",
      "builtin:market-ranking-example",
      "builtin:staged-candidate-ranking"
    ]);
    assert.equal(queryBody.queries.every((query) => query.source === "builtin"), true);
    assert.equal(queries.text.includes("createdAtMs"), false);
    assert.equal(queries.text.includes("updatedAtMs"), false);
    assert.equal(queries.text.includes(dataDir), false);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest browser asset routing stays closed to arbitrary paths and query strings", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-browser-route-"));
  let runtime = null;

  try {
    runtime = await startBacktestLabRuntime({ dataDir, port: 0 });

    for (const pathname of [
      "/app/../runtime.js",
      "/app/index.js?path=private",
      "/api/queries?sourceId=../../private"
    ]) {
      const response = await get(runtime, pathname);
      assert.equal(response.status, 404, pathname);
      const body = JSON.parse(response.text);
      assert.equal(body.error.code, "BACKTEST_ROUTE_NOT_FOUND");
      assert.equal(response.text.includes(dataDir), false);
    }
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
