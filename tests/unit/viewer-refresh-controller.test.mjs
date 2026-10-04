import assert from "node:assert/strict";
import test from "node:test";

import { createViewerRefreshController } from "../../browser/viewer/refresh-controller.js";

class FakeChannel {
  constructor() {
    this.listeners = new Map();
    this.closed = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((item) => item !== listener));
  }

  emit(data) {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data });
    }
  }

  close() {
    this.closed = true;
  }
}

function createRoot() {
  return { hidden: false };
}

test("Viewer refresh coalesces overlapping work and treats commit payload as hint only", async () => {
  const channel = new FakeChannel();
  let currentRefreshes = 0;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const currentSurface = {
    async refresh() {
      currentRefreshes += 1;
      if (currentRefreshes === 1) await firstGate;
    },
    captureViewState() {
      return { sort: { key: "DailyDealsQuantity", direction: "desc" }, scrollLeft: 0, scrollTop: 0 };
    },
    restoreViewState() {},
    mountDiagnostics() {}
  };

  const detailSurface = {
    async open() {},
    async refresh() {},
    getState() {
      return { state: "IDLE", selectedSecurityId: null, rowCount: 0 };
    }
  };

  const controls = {
    ownerDocument: {
      createElement() {
        return {
          type: "",
          textContent: "",
          disabled: false,
          dataset: {},
          addEventListener() {},
          append() {},
          replaceChildren() {}
        };
      }
    },
    replaceChildren() {}
  };

  const controller = createViewerRefreshController({
    currentSurface,
    detailSurface,
    currentRoot: createRoot(),
    detailRoot: createRoot(),
    controlsRoot: controls,
    diagnosticsRoot: { replaceChildren() {} },
    createBroadcastChannel: () => channel
  });

  controller.start();

  const first = controller.manualRefresh();
  channel.emit({ type: "CYCLE_COMMITTED", cycleId: 99, completedAtMs: 12345 });
  channel.emit({ type: "CYCLE_COMMITTED", cycleId: 100, completedAtMs: 12346 });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(currentRefreshes, 1);

  releaseFirst();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(currentRefreshes, 2);
  assert.deepEqual(controller.getState(), {
    activeSurface: "MAIN",
    liveRefreshAvailable: true,
    refreshInFlight: false,
    refreshPending: false
  });

  controller.close();
  assert.equal(channel.closed, true);
});

test("Viewer refresh remains manually usable when live hint transport is unavailable", async () => {
  let currentRefreshes = 0;
  const currentSurface = {
    async refresh() {
      currentRefreshes += 1;
    },
    captureViewState() {
      return { sort: { key: "DailyDealsQuantity", direction: "desc" }, scrollLeft: 0, scrollTop: 0 };
    },
    restoreViewState() {},
    mountDiagnostics() {}
  };
  const detailSurface = {
    async open() {},
    async refresh() {},
    getState() {
      return { state: "IDLE", selectedSecurityId: null, rowCount: 0 };
    }
  };
  const created = [];
  const controls = {
    ownerDocument: {
      createElement(tag) {
        const element = {
          tag,
          type: "",
          textContent: "",
          disabled: false,
          dataset: {},
          listeners: new Map(),
          addEventListener(type, listener) {
            this.listeners.set(type, listener);
          }
        };
        created.push(element);
        return element;
      }
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };

  const controller = createViewerRefreshController({
    currentSurface,
    detailSurface,
    currentRoot: createRoot(),
    detailRoot: createRoot(),
    controlsRoot: controls,
    diagnosticsRoot: { replaceChildren() {} },
    createBroadcastChannel: () => null
  });

  controller.start();
  assert.equal(controller.getState().liveRefreshAvailable, false);
  assert.ok(created.some((element) => element.textContent === "רענון ידני בלבד"));

  await controller.manualRefresh();
  assert.equal(currentRefreshes, 1);
});
