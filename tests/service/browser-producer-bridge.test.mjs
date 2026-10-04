import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

import { createRecorder } from "../../browser/recorder/recorder.js";
import { createProducerBridge } from "../../browser/runtime/producer-bridge.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function universe() {
  return {
    loadedAtMs: 1000,
    recordCount: 2,
    securities: [
      {
        securityId: "1001",
        paperName: "Fixture Alpha",
        mapHeatDateChange: 1.25,
        rawMapHeat: {
          PaperId: 1001,
          PaperName: "Fixture Alpha",
          DateChange: 1.25
        }
      },
      {
        securityId: "1002",
        paperName: "Fixture Beta",
        mapHeatDateChange: null,
        rawMapHeat: {
          PaperId: 1002,
          PaperName: "Fixture Beta",
          DateChange: null
        }
      }
    ]
  };
}

function completeCycle() {
  return {
    status: "complete",
    startedAtMs: 2000,
    completedAtMs: 2100,
    durationMs: 100,
    requested: 2,
    received: 2,
    unique: 2,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: [{
      chunkIndex: 0,
      requested: 2,
      received: 2,
      unique: 2,
      requestStartedAtMs: 2000,
      receivedAtMs: 2080,
      completedAtMs: 2090,
      durationMs: 90,
      serverAsOfDate: "fixture",
      httpStatus: 200
    }],
    securities: [
      {
        securityId: "1001",
        chunkIndex: 0,
        chunkReceivedAtMs: 2080,
        collectedAtMs: 2090,
        serverAsOfDate: "fixture",
        data: {
          Key: 1001,
          LastKnownRate: 101.25,
          BuyLimit1: 101
        }
      },
      {
        securityId: "1002",
        chunkIndex: 0,
        chunkReceivedAtMs: 2080,
        collectedAtMs: 2090,
        serverAsOfDate: "fixture",
        data: {
          Key: 1002,
          LastKnownRate: 202.5,
          BuyLimit1: null
        }
      }
    ]
  };
}

test("browser producer bridge drives real session/universe/cycle/failure/stop authority through ACKs", async () => {
  const fixture = await createServiceFixture();
  const sentMessages = [];
  const hints = [];
  const scheduled = [];
  let now = 5000;

  const bridge = createProducerBridge({
    url: fixture.url,
    productVersion: "browser-bridge-test",
    clientInstanceId: "browser-bridge-real-service",
    createSocket(url) {
      const socket = new WebSocket(url, { origin: fixture.origin });
      const send = socket.send.bind(socket);
      socket.send = (value, ...args) => {
        sentMessages.push(JSON.parse(value.toString()));
        return send(value, ...args);
      };
      return socket;
    },
    createBroadcastChannel() {
      return {
        postMessage(message) {
          hints.push(message);
        },
        close() {}
      };
    },
    schedule(callback, delayMs) {
      const token = { callback, delayMs, cancelled: false };
      scheduled.push(token);
      return token;
    },
    cancelSchedule(token) {
      token.cancelled = true;
    },
    now: () => now
  });

  try {
    const started = await bridge.startSession({
      snapshotIntervalMs: 3000,
      chunkDelayMs: 1000,
      chunkSize: 187,
      refreshUniverseEveryCycle: false,
      authToken: "must-not-cross",
      cookie: "must-not-cross",
      accountIdentifier: "must-not-cross"
    });

    assert.equal(typeof started.sessionId, "string");
    assert.ok(started.sessionId.length > 0);
    assert.deepEqual(sentMessages.map((message) => message.type).slice(0, 2), [
      "client.hello",
      "producer.session.start"
    ]);

    const sessionStartMessage = sentMessages.find(
      (message) => message.type === "producer.session.start"
    );
    assert.deepEqual(sessionStartMessage.payload.config, {
      snapshotIntervalMs: 3000,
      chunkDelayMs: 1000,
      chunkSize: 187,
      refreshUniverseEveryCycle: false
    });
    const sessionWire = JSON.stringify(sessionStartMessage);
    assert.equal(sessionWire.includes("authToken"), false);
    assert.equal(sessionWire.includes("cookie"), false);
    assert.equal(sessionWire.includes("accountIdentifier"), false);

    const acceptedUniverse = await bridge.acceptUniverse(universe());
    assert.deepEqual(acceptedUniverse, {
      universeRevision: 1,
      recordCount: 2
    });

    const committed = await bridge.commitCycle(completeCycle());
    assert.equal(committed.cycleId, 1);
    assert.equal(Number.isSafeInteger(committed.committedAtMs), true);
    assert.deepEqual(hints, [{
      type: "CYCLE_COMMITTED",
      cycleId: 1,
      completedAtMs: 2100
    }]);

    let authority = await fixture.rows(
      `SELECT
         (SELECT COUNT(*) FROM cycles WHERE status = 'complete') AS complete_cycles,
         (SELECT COUNT(*) FROM history) AS history_count,
         (SELECT COUNT(*) FROM latest) AS latest_count`
    );
    assert.deepEqual(authority, [{
      complete_cycles: "1",
      history_count: "2",
      latest_count: "2"
    }]);

    now = 6000;
    const failed = await bridge.reportFailedCycle({
      phase: "chunk-fetch",
      startedAtMs: 3000,
      failedAtMs: 3050,
      requested: 2,
      received: null,
      unique: null,
      missing: null,
      duplicates: null,
      unexpected: null,
      error: {
        name: "Error",
        message: "synthetic provider failure"
      }
    });
    assert.deepEqual(failed, { cycleId: 2 });

    authority = await fixture.rows(
      `SELECT
         (SELECT COUNT(*) FROM cycles WHERE status = 'failed') AS failed_cycles,
         (SELECT COUNT(*) FROM history) AS history_count,
         (SELECT COUNT(*) FROM latest) AS latest_count`
    );
    assert.deepEqual(authority, [{
      failed_cycles: "1",
      history_count: "2",
      latest_count: "2"
    }]);

    now = 7000;
    const stopped = await bridge.stopSession("manual-test");
    assert.equal(stopped.status, "stopped");

    const sessions = await fixture.rows(
      "SELECT status, stop_reason FROM sessions WHERE session_id = $sessionId",
      { sessionId: started.sessionId }
    );
    assert.deepEqual(sessions, [{
      status: "stopped",
      stop_reason: "manual-test"
    }]);

    assert.equal(
      scheduled.some((timer) => timer.delayMs === 5000),
      true
    );
  } finally {
    await fixture.cleanup();
  }
});


function createManualScheduler() {
  const queue = [];
  let nextId = 1;

  return {
    schedule(callback, delayMs) {
      const task = { id: nextId++, callback, delayMs, cancelled: false };
      queue.push(task);
      return task.id;
    },
    cancelSchedule(id) {
      const task = queue.find((item) => item.id === id);
      if (task) task.cancelled = true;
    },
    next() {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task.cancelled) return task;
      }
      return null;
    },
    pending() {
      return queue.filter((task) => !task.cancelled);
    }
  };
}

async function eventually(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition was not satisfied");
}

function createWithholdingSocket(url, origin, holdRequestType) {
  const realSocket = new WebSocket(url, { origin });
  const listeners = new Map();
  const sent = [];
  const held = [];

  function emit(type, event) {
    for (const listener of listeners.get(type) ?? []) {
      listener(event);
    }
  }

  realSocket.on("open", () => emit("open", {}));
  realSocket.on("error", (error) => emit("error", error));
  realSocket.on("close", (code, reason) => {
    emit("close", { code, reason: reason.toString() });
  });
  realSocket.on("message", (data) => {
    const text = data.toString();
    const message = JSON.parse(text);
    if (
      message.type === "response.ok" &&
      message.payload?.requestType === holdRequestType
    ) {
      held.push(message);
      return;
    }
    emit("message", { data: text });
  });

  return {
    get readyState() {
      return realSocket.readyState;
    },
    sent,
    held,
    addEventListener(type, listener) {
      const bucket = listeners.get(type) ?? [];
      bucket.push(listener);
      listeners.set(type, bucket);
    },
    send(value) {
      sent.push(JSON.parse(value.toString()));
      realSocket.send(value);
    },
    close(code, reason) {
      realSocket.close(code, reason);
    }
  };
}

test("lost commit ACK fails pending Browser authority work, stops Recorder, and never queues offline cycles", async () => {
  const fixture = await createServiceFixture();
  const recorderScheduler = createManualScheduler();
  let transportSocket = null;
  let recorder = null;

  const bridge = createProducerBridge({
    url: fixture.url,
    productVersion: "browser-disconnect-test",
    clientInstanceId: "browser-disconnect-producer",
    createSocket(url) {
      transportSocket = createWithholdingSocket(
        url,
        fixture.origin,
        "producer.cycle.commit"
      );
      return transportSocket;
    },
    createBroadcastChannel: () => ({
      postMessage() {},
      close() {}
    }),
    heartbeatMs: 5000,
    onDisconnect() {
      recorder?.stop("transport_lost");
    }
  });

  try {
    await bridge.startSession({
      snapshotIntervalMs: 3000,
      chunkDelayMs: 1000,
      chunkSize: 187,
      refreshUniverseEveryCycle: false
    });

    const callbacks = bridge.getRecorderCallbacks();
    recorder = createRecorder({
      loadUniverse: async () => universe(),
      acceptUniverse: callbacks.acceptUniverse,
      collectCycle: async () => completeCycle(),
      onCycle: callbacks.onCycle,
      onFailure: callbacks.onFailure,
      schedule: recorderScheduler.schedule,
      cancelSchedule: recorderScheduler.cancelSchedule
    });

    recorder.start({ snapshotIntervalMs: 3000 });
    const first = recorderScheduler.next();
    assert.ok(first);
    const cycleRun = first.callback();

    await eventually(async () => {
      const rows = await fixture.rows(
        "SELECT COUNT(*) AS complete_cycles FROM cycles WHERE status = 'complete'"
      );
      return rows[0]?.complete_cycles === "1";
    });

    assert.equal(transportSocket.held.length, 1);
    assert.equal(recorder.getState().completedCycles, 0);

    transportSocket.close(1000, "synthetic transport loss");
    await cycleRun;

    const state = recorder.getState();
    assert.equal(state.isRunning, false);
    assert.equal(state.status, "stopped");
    assert.equal(state.completedCycles, 0);
    assert.equal(state.failedCycles, 1);
    assert.equal(state.latestCycle, null);
    assert.equal(recorderScheduler.pending().length, 0);
    assert.equal(bridge.getState().state, "disconnected");
    await assert.rejects(
      bridge.connect(),
      /explicit relaunch after disconnect/i
    );

    const sentBeforeOfflineAttempt = transportSocket.sent.length;
    await assert.rejects(
      bridge.commitCycle(completeCycle()),
      /session is not started|not connected|explicit relaunch/i
    );
    assert.equal(transportSocket.sent.length, sentBeforeOfflineAttempt);

    const interruptedRows = await eventually(async () => {
      const sessionRows = await fixture.rows(
        "SELECT status, stop_reason FROM sessions ORDER BY started_at_ms"
      );
      return sessionRows[0]?.status === "interrupted" ? sessionRows : null;
    });
    assert.deepEqual(interruptedRows, [{
      status: "interrupted",
      stop_reason: "connection_lost"
    }]);
  } finally {
    await fixture.cleanup();
  }
});
