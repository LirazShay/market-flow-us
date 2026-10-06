import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoBuyCaptureController,
  DEMO_BUY_AI_EXPORT_PRECHECK,
  DEMO_BUY_AUTO_MODE,
  DEMO_BUY_CAPTURE_PRECHECK
} from "../../browser/viewer/demo-buy-capture-controller.js";
import {
  DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT,
  DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT
} from "../../browser/viewer/client.js";

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function generation({
  generationId = 1,
  ids = ["A", "B", "C"],
  rows = null,
  columns = null,
  sql = "SELECT securityId, Price FROM latest ORDER BY Price DESC, securityId ASC",
  queryId = "builtin-test",
  name = "Test query",
  intervalMs = 5000,
  startedAtMs = 1000,
  completedAtMs = 1100
} = {}) {
  const resolvedColumns = columns ?? [
    { name: "securityId", type: "VARCHAR" },
    { name: "Price", type: "DOUBLE" }
  ];
  const resolvedRows = rows ?? ids.map((id, index) => [id, 100 - index]);
  return {
    generation: generationId,
    query: { queryId, name, sql, intervalMs },
    result: {
      startedAtMs,
      completedAtMs,
      rowCount: resolvedRows.length,
      columns: resolvedColumns,
      rows: resolvedRows
    }
  };
}

function committed(captureId = 1, count = 1) {
  return {
    status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.COMMITTED,
    captureId,
    capturedAtMs: 2000 + captureId,
    capturedItemCount: count
  };
}

test("Demo Buy selection is source-row-first, dedupes by first occurrence and resets on a new rendered generation", async () => {
  const payloads = [];
  const controller = createDemoBuyCaptureController({
    client: {
      async captureDemoBuy(payload) {
        payloads.push(payload);
        return committed(1, payload.items.length);
      }
    },
    now: () => 3000
  });

  controller.setRenderedGeneration(generation({ ids: ["A", "A", "B", "C"] }));
  controller.setSelected(2, true);
  controller.setSelected(3, true);
  assert.equal(controller.getState().selectedCount, 2);

  const selected = await controller.captureSelected();
  assert.equal(selected.started, true);
  assert.deepEqual(payloads[0].items, [
    { securityId: "A", resultRank: 2 },
    { securityId: "B", resultRank: 3 }
  ]);
  assert.equal(selected.result.sourceRowCount, 2);
  assert.equal(selected.result.uniqueItemCount, 2);

  const top = await controller.captureTopX(2);
  assert.equal(top.started, true);
  assert.deepEqual(payloads[1].items, [
    { securityId: "A", resultRank: 1 }
  ]);
  assert.equal(top.result.sourceRowCount, 2);
  assert.equal(top.result.uniqueItemCount, 1);

  controller.setRenderedGeneration(generation({ generationId: 2, ids: ["D"] }));
  assert.equal(controller.getState().selectedCount, 0);
});

test("invalid identity is never silently dropped and exactly one recognized identity column is required", async () => {
  let calls = 0;
  const controller = createDemoBuyCaptureController({
    client: {
      async captureDemoBuy() {
        calls += 1;
        return committed();
      }
    }
  });

  controller.setRenderedGeneration(generation({ ids: ["A", "", "C"] }));
  const all = await controller.captureAll();
  assert.equal(all.started, false);
  assert.equal(all.reason, DEMO_BUY_CAPTURE_PRECHECK.INVALID_IDENTITY);
  assert.equal(all.error.details.resultRank, 2);
  assert.equal(calls, 0);

  controller.setRenderedGeneration(generation({
    columns: [
      { name: "securityId", type: "VARCHAR" },
      { name: "security_id", type: "VARCHAR" }
    ],
    rows: [["A", "A"]]
  }));
  const ambiguous = await controller.captureAll();
  assert.equal(ambiguous.started, false);
  assert.equal(ambiguous.reason, DEMO_BUY_CAPTURE_PRECHECK.IDENTITY_COLUMN);
  assert.equal(calls, 0);
});

test("capture synchronously freezes the displayed generation before async submission", async () => {
  const first = deferred();
  const payloads = [];
  const controller = createDemoBuyCaptureController({
    client: {
      captureDemoBuy(payload) {
        payloads.push(payload);
        return first.promise;
      }
    }
  });

  controller.setRenderedGeneration(generation({ ids: ["A", "B"] }));
  controller.setSelected(1, true);
  const capturePromise = controller.captureSelected();

  controller.setRenderedGeneration(generation({
    generationId: 2,
    ids: ["Z"],
    sql: "SELECT securityId FROM latest ORDER BY securityId",
    completedAtMs: 5000
  }));

  assert.deepEqual(payloads[0].items, [{ securityId: "A", resultRank: 1 }]);
  assert.match(payloads[0].sourceQuery.sql, /Price DESC/);
  assert.equal(payloads[0].sourceResult.completedAtMs, 1100);

  first.resolve(committed(7, 1));
  const outcome = await capturePromise;
  assert.equal(outcome.result.captureId, 7);
  assert.equal(controller.getState().rendered.generation, 2);
});

test("one Viewer capture slot skips busy Auto generations instead of queueing them", async () => {
  const first = deferred();
  const payloads = [];
  const controller = createDemoBuyCaptureController({
    client: {
      captureDemoBuy(payload) {
        payloads.push(payload);
        return first.promise;
      }
    }
  });

  controller.setAutoMode(DEMO_BUY_AUTO_MODE.ALL);
  controller.setRenderedGeneration(generation({ generationId: 1, ids: ["A"] }));
  const inFlight = controller.captureAutomaticGeneration();
  assert.equal(controller.getState().captureBusy, true);

  controller.setRenderedGeneration(generation({ generationId: 2, ids: ["B"] }));
  const skipped = await controller.captureAutomaticGeneration();
  assert.equal(skipped.started, false);
  assert.equal(skipped.reason, DEMO_BUY_CAPTURE_PRECHECK.CAPTURE_BUSY);
  assert.equal(controller.getState().autoBusySkippedCount, 1);
  assert.equal(payloads.length, 1);

  first.resolve(committed(2, 1));
  await inFlight;
  assert.equal(controller.getState().captureBusy, false);
});

test("Auto starts only on future successful generations, zero rows are a no-op, and Turn off does not cancel in-flight capture", async () => {
  const first = deferred();
  let calls = 0;
  const controller = createDemoBuyCaptureController({
    client: {
      captureDemoBuy() {
        calls += 1;
        return first.promise;
      }
    }
  });

  controller.setRenderedGeneration(generation({ generationId: 1, ids: ["A"] }));
  controller.setAutoMode(DEMO_BUY_AUTO_MODE.ALL);
  assert.equal(calls, 0, "enabling Auto must not retroactively capture the rendered result");

  controller.setRenderedGeneration(generation({ generationId: 2, ids: [] }));
  const empty = await controller.captureAutomaticGeneration();
  assert.equal(empty.reason, "NO_CANDIDATES");
  assert.equal(calls, 0);

  controller.setRenderedGeneration(generation({ generationId: 3, ids: ["B"] }));
  const inFlight = controller.captureAutomaticGeneration();
  assert.equal(calls, 1);
  controller.turnAutoOff();
  assert.equal(controller.getState().autoMode, DEMO_BUY_AUTO_MODE.OFF);
  assert.equal(controller.getState().captureBusy, true);

  first.resolve(committed(3, 1));
  const result = await inFlight;
  assert.equal(result.result.captureId, 3);
});

test("acknowledgement unknown locks the Viewer capture controller without blind replay", async () => {
  let calls = 0;
  const controller = createDemoBuyCaptureController({
    client: {
      async captureDemoBuy() {
        calls += 1;
        return { status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.UNKNOWN };
      }
    }
  });

  controller.setRenderedGeneration(generation({ ids: ["A"] }));
  const first = await controller.captureAll();
  assert.equal(first.started, true);
  assert.equal(first.result.status, DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.UNKNOWN);
  assert.equal(controller.getState().captureLocked, true);

  const second = await controller.captureAll();
  assert.equal(second.started, false);
  assert.equal(second.reason, DEMO_BUY_CAPTURE_PRECHECK.CAPTURE_LOCKED);
  assert.equal(calls, 1);
});

test("one Viewer AI export slot refuses concurrent generation without queueing and releases after outcome", async () => {
  const first = deferred();
  const calls = [];
  let nowMs = 4000;
  const controller = createDemoBuyCaptureController({
    client: {
      async captureDemoBuy() {
        return committed();
      },
      createDemoBuyAiPack(captureId, securityId) {
        calls.push([captureId, securityId]);
        return first.promise;
      }
    },
    now: () => nowMs
  });

  const inFlight = controller.createAiPack(7, "1001");
  assert.equal(controller.getState().aiExportBusy, true);
  assert.equal(controller.getState().aiExportTargetKey, "7\u00001001");

  const refused = await controller.createAiPack(8, "1002");
  assert.equal(refused.started, false);
  assert.equal(refused.reason, DEMO_BUY_AI_EXPORT_PRECHECK.BUSY);
  assert.deepEqual(calls, [[7, "1001"]]);

  first.resolve({
    status: DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.UNKNOWN
  });
  const completed = await inFlight;
  assert.equal(completed.started, true);
  assert.equal(completed.result.status, DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.UNKNOWN);
  assert.equal(controller.getState().aiExportBusy, false);
  assert.equal(controller.getState().aiExportTargetKey, null);
  assert.equal(controller.getState().lastAiExport.status, DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.UNKNOWN);

  nowMs = 5000;
  const secondClient = deferred();
  const retryController = createDemoBuyCaptureController({
    client: {
      async captureDemoBuy() {
        return committed();
      },
      createDemoBuyAiPack() {
        return secondClient.promise;
      }
    },
    now: () => nowMs
  });
  const retry = retryController.createAiPack(7, "1001");
  secondClient.resolve({
    status: DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.CREATED,
    outcomeEvidenceStatus: "PARTIAL_OUTCOME",
    targetInScannerContext: true,
    exportPathRelative: "exports/ai-investigations/example",
    fileCount: 10
  });
  const retried = await retry;
  assert.equal(retried.result.status, DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.CREATED);
  assert.equal(retryController.getState().aiExportBusy, false);
});
