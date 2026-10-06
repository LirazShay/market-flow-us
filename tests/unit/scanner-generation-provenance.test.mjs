import assert from "node:assert/strict";
import test from "node:test";
import { createScannerScheduler } from "../../browser/viewer/scanner-scheduler.js";

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("Scanner scheduler freezes query identity and raw generation timing at activation/execution", async () => {
  const pending = deferred();
  const contexts = [];
  const times = [1000, 1125];
  const scheduler = createScannerScheduler({
    execute: () => pending.promise,
    onResult(_result, context) {
      contexts.push(context);
    },
    now: () => times.shift()
  });

  scheduler.setDraft({
    sql: "SELECT securityId FROM latest ORDER BY securityId",
    intervalMs: 5000,
    queryId: "query-1",
    queryName: "Original query"
  });
  scheduler.activate();

  scheduler.setDraft({
    sql: "SELECT securityId FROM latest WHERE 1 = 0",
    intervalMs: 1000,
    queryId: "query-2",
    queryName: "Edited later"
  });

  pending.resolve({ columns: [], rows: [], rowCount: 0 });
  await flush();

  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0], {
    generation: 1,
    sql: "SELECT securityId FROM latest ORDER BY securityId",
    intervalMs: 5000,
    queryId: "query-1",
    queryName: "Original query",
    startedAtMs: 1000,
    completedAtMs: 1125
  });
  scheduler.stop();
});
