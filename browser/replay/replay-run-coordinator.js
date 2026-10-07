import {
  VIEWER_WINDOW_NAME,
  createMarketScopeRuntime
} from "../runtime/application.js";
import { createProducerBridge } from "../runtime/producer-bridge.js";

const PRODUCT_VERSION = "0.1.0";

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function.`);
}

export function createReplayRunCoordinator({
  hostClient,
  target = globalThis,
  productVersion = PRODUCT_VERSION,
  producerBridgeFactory = createProducerBridge,
  viewerRuntimeFactory = (options) => createMarketScopeRuntime(options)
} = {}) {
  if (!hostClient || typeof hostClient.startRun !== "function" || typeof hostClient.stopRun !== "function") {
    throw new TypeError("Replay Host client is required.");
  }
  assertFunction(producerBridgeFactory, "producerBridgeFactory");
  assertFunction(viewerRuntimeFactory, "viewerRuntimeFactory");
  if (!target || typeof target.open !== "function") throw new TypeError("Replay browser target must support window.open.");

  let generation = 0;
  let activeRunId = null;
  let lifecycle = Promise.resolve();

  function staleGenerationError() {
    return new Error("Replay run generation changed during startup.");
  }

  function startFreshRun({ reason = "replay-fresh-run", selectedSequence = 0 } = {}) {
    const viewerWindow = target.open("", VIEWER_WINDOW_NAME);
    if (!viewerWindow) {
      const error = new Error("Market Flow US Replay Viewer popup was blocked.");
      error.code = "REPLAY_VIEWER_BLOCKED";
      throw error;
    }

    generation += 1;
    const currentGeneration = generation;

    const operation = lifecycle.then(async () => {
      if (currentGeneration !== generation) throw staleGenerationError();

      await hostClient.stopRun(`replace-${reason}`);
      if (currentGeneration !== generation) throw staleGenerationError();

      const run = await hostClient.startRun(reason);
      if (currentGeneration !== generation) {
        await hostClient.stopRun("stale-run-generation");
        throw staleGenerationError();
      }

      activeRunId = run.runId;
      try {
        const producerBridge = producerBridgeFactory({
          url: run.serviceUrl,
          productVersion,
          clientInstanceId: `market-flow-us-replay-producer-${currentGeneration}`
        });

        const viewerRuntime = viewerRuntimeFactory({
          target,
          serviceUrl: run.serviceUrl,
          productVersion,
          openWindow: () => viewerWindow,
          collectCandidate: async () => {
            throw new Error("Replay Viewer runtime must never acquire provider market data.");
          }
        });
        const viewer = viewerRuntime.openViewer({ rebuild: true });
        if (viewer.opened !== true) {
          const error = new Error("Market Flow US Replay Viewer could not open.");
          error.code = "REPLAY_VIEWER_OPEN_FAILED";
          throw error;
        }

        return producerBridge;
      } catch (error) {
        try {
          await hostClient.stopRun("replay-composition-failed");
        } finally {
          activeRunId = null;
        }
        throw error;
      }
    });

    lifecycle = operation.catch(() => {});
    return operation;
  }

  return Object.freeze({
    startFreshRun,
    getState: () => Object.freeze({
      generation,
      activeRunId
    })
  });
}
