import assert from "node:assert/strict";
import test from "node:test";

import { createReplayRunCoordinator } from "../../browser/replay/replay-run-coordinator.js";

function createTarget() {
  return {
    open() {
      return {};
    }
  };
}

function createHostClient(log) {
  let sequence = 0;
  return {
    async stopRun(reason) {
      log.push(["stop", reason]);
      return { status: "stopped" };
    },
    async startRun(reason) {
      sequence += 1;
      log.push(["start", reason]);
      return {
        runId: `run-${sequence}`,
        serviceUrl: "ws://127.0.0.1:8765"
      };
    }
  };
}

for (const scenario of [
  {
    name: "producer bridge factory throws after Host run starts",
    producerBridgeFactory() {
      throw new Error("producer-factory-failed");
    },
    viewerRuntimeFactory() {
      throw new Error("viewer-runtime-must-not-run");
    },
    expected: /producer-factory-failed/
  },
  {
    name: "viewer runtime factory throws after Host run starts",
    producerBridgeFactory() {
      return { kind: "bridge" };
    },
    viewerRuntimeFactory() {
      throw new Error("viewer-runtime-failed");
    },
    expected: /viewer-runtime-failed/
  },
  {
    name: "viewer open throws after Host run starts",
    producerBridgeFactory() {
      return { kind: "bridge" };
    },
    viewerRuntimeFactory() {
      return {
        openViewer() {
          throw new Error("viewer-open-threw");
        }
      };
    },
    expected: /viewer-open-threw/
  },
  {
    name: "viewer reports not opened after Host run starts",
    producerBridgeFactory() {
      return { kind: "bridge" };
    },
    viewerRuntimeFactory() {
      return {
        openViewer() {
          return { opened: false };
        }
      };
    },
    expected: /could not open/
  }
]) {
  test(`Replay run coordinator cleans owned Host run when ${scenario.name}`, async () => {
    const log = [];
    const coordinator = createReplayRunCoordinator({
      hostClient: createHostClient(log),
      target: createTarget(),
      producerBridgeFactory: scenario.producerBridgeFactory,
      viewerRuntimeFactory: scenario.viewerRuntimeFactory
    });

    await assert.rejects(
      () => coordinator.startFreshRun({ reason: "test-composition-failure" }),
      scenario.expected
    );

    assert.deepEqual(log, [
      ["stop", "replace-test-composition-failure"],
      ["start", "test-composition-failure"],
      ["stop", "replay-composition-failed"]
    ]);
    assert.equal(coordinator.getState().activeRunId, null);
  });
}

test("Replay run coordinator preserves active ownership when composition cleanup itself fails", async () => {
  const log = [];
  const cleanupError = new Error("cleanup-stop-failed");
  const hostClient = {
    async stopRun(reason) {
      log.push(["stop", reason]);
      if (reason === "replay-composition-failed") throw cleanupError;
      return { status: "stopped" };
    },
    async startRun(reason) {
      log.push(["start", reason]);
      return {
        runId: "run-cleanup-failure",
        serviceUrl: "ws://127.0.0.1:8765"
      };
    }
  };
  const compositionError = new Error("producer-factory-failed");
  const coordinator = createReplayRunCoordinator({
    hostClient,
    target: createTarget(),
    producerBridgeFactory() {
      throw compositionError;
    },
    viewerRuntimeFactory() {
      throw new Error("viewer-runtime-must-not-run");
    }
  });

  await assert.rejects(
    () => coordinator.startFreshRun({ reason: "cleanup-failure" }),
    (error) => {
      assert.equal(error, cleanupError);
      assert.equal(error.cause, compositionError);
      return true;
    }
  );

  assert.deepEqual(log, [
    ["stop", "replace-cleanup-failure"],
    ["start", "cleanup-failure"],
    ["stop", "replay-composition-failed"]
  ]);
  assert.equal(coordinator.getState().activeRunId, "run-cleanup-failure");
});
