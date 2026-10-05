import assert from "node:assert/strict";
import test from "node:test";

import { fetchValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketScopeRuntime } from "../../browser/runtime/application.js";
import { createProducerBridge } from "../../browser/runtime/producer-bridge.js";

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeSocket {
  constructor() {
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open() {
    this.readyState = 1;
    this.emit("open");
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close(code = 1000, reason = "closed") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  respondOk(request, data = {}) {
    this.emit("message", {
      data: JSON.stringify({
        v: 1,
        type: "response.ok",
        requestId: request.requestId,
        payload: { requestType: request.type, data }
      })
    });
  }

  respondError(request, code = "DB_ERROR") {
    this.emit("message", {
      data: JSON.stringify({
        v: 1,
        type: "response.error",
        requestId: request.requestId,
        payload: {
          requestType: request.type,
          code,
          message: "safe failure",
          retryable: false,
          details: null
        }
      })
    });
  }
}

test("U.S. provider request has a hard failure bound even when fetch never settles", async () => {
  const startedAt = Date.now();

  await assert.rejects(fetchValidatedSnapshot({
    fetchImpl: async () => await new Promise(() => {}),
    now: () => 1,
    requestTimeoutMs: 5
  }));

  assert.ok(Date.now() - startedAt < 1000);
});

test("runtime launch failure after producer session start cleans up the partial session", async () => {
  let sessionId = null;
  let stopCalls = 0;
  let recorderStopped = false;

  const bridge = {
    async startSession() {
      sessionId = "session-1";
      return { sessionId };
    },
    async stopSession(reason) {
      assert.equal(reason, "launch_failed");
      stopCalls += 1;
      sessionId = null;
      return { status: "stopped" };
    },
    getRecorderCallbacks() {
      return {
        acceptUniverse: async () => {},
        onCycle: async () => {},
        onFailure: async () => {}
      };
    },
    getState() {
      return {
        state: sessionId === null ? "stopped" : "ready",
        sessionId,
        acknowledgedUniverseRevision: null,
        pendingRequests: 0
      };
    }
  };

  const recorder = {
    start() {
      return { status: "scheduled" };
    },
    stop() {
      recorderStopped = true;
      return { status: "stopped" };
    },
    getState() {
      return {
        status: recorderStopped ? "stopped" : "scheduled",
        cycleInFlight: false
      };
    }
  };

  const target = {
    document: {},
    fetch: async () => { throw new Error("not used"); },
    open: () => ({ document: null, closed: false }),
    setTimeout
  };

  const runtime = createMarketScopeRuntime({
    target,
    producerBridgeFactory: () => bridge,
    recorderFactory: () => recorder,
    collectCandidate: async () => { throw new Error("not used"); }
  });

  await assert.rejects(runtime.launch());
  assert.equal(recorderStopped, true);
  assert.equal(stopCalls, 1);
  assert.equal(sessionId, null);
  assert.equal(runtime.getState().state, "error");
});

test("producer stop rejection fails closed instead of rearming a live session", async () => {
  const socket = new FakeSocket();
  const timers = [];
  const bridge = createProducerBridge({
    createSocket: () => socket,
    createBroadcastChannel: () => ({ close() {}, postMessage() {} }),
    schedule(callback, delayMs) {
      const timer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancelSchedule(timer) {
      timer.cancelled = true;
    },
    now: () => 1000
  });

  const starting = bridge.startSession({
    snapshotIntervalMs: 3000,
    chunkDelayMs: 1000,
    chunkSize: 187,
    refreshUniverseEveryCycle: false
  });

  socket.open();
  await nextTurn();
  socket.respondOk(socket.sent[0], {
    protocolVersion: 1,
    role: "producer",
    ready: true
  });
  await nextTurn();
  socket.respondOk(socket.sent[1], { sessionId: "session-1" });
  await starting;

  assert.equal(bridge.getState().state, "ready");
  assert.equal(timers.length, 1);

  const stopping = bridge.stopSession("manual");
  await nextTurn();
  const stopRequest = socket.sent.at(-1);
  assert.equal(stopRequest.type, "producer.session.stop");
  socket.respondError(stopRequest, "DB_ERROR");

  await assert.rejects(stopping);
  assert.equal(socket.readyState, 3);
  assert.equal(bridge.getState().state, "disconnected");
  assert.equal(bridge.getState().sessionId, null);
  assert.equal(timers[0].cancelled, true);
  assert.equal(timers.length, 1);
});
