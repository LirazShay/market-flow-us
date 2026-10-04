import assert from "node:assert/strict";
import test from "node:test";

import { createProducerBridge } from "../../browser/runtime/producer-bridge.js";

class FakeSocket {
  constructor() {
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open() {
    this.readyState = 1;
    this.emit("open");
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code: 1000, reason: "closed" });
  }

  respondOk(request, data = {}) {
    this.emit("message", {
      data: JSON.stringify({
        v: 1,
        type: "response.ok",
        requestId: request.requestId,
        payload: {
          requestType: request.type,
          data
        }
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

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function startBridge({ onDisconnect = () => {} } = {}) {
  const socket = new FakeSocket();
  const hints = [];
  const timers = [];
  let now = 1000;

  const bridge = createProducerBridge({
    url: "ws://127.0.0.1:8765",
    productVersion: "test-browser",
    clientInstanceId: "browser-producer-test",
    createSocket: () => socket,
    createBroadcastChannel: () => ({
      postMessage(message) {
        hints.push(message);
      },
      close() {}
    }),
    heartbeatMs: 5000,
    schedule(callback, delayMs) {
      const timer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancelSchedule(timer) {
      timer.cancelled = true;
    },
    now: () => now,
    onDisconnect
  });

  const started = bridge.startSession({
    snapshotIntervalMs: 3000,
    chunkDelayMs: 1000,
    chunkSize: 187,
    refreshUniverseEveryCycle: false,
    authToken: "must-never-cross-protocol",
    cookie: "must-never-cross-protocol",
    accountId: "must-never-cross-protocol"
  });

  socket.open();
  await nextTurn();

  const hello = socket.sent[0];
  assert.equal(hello.type, "client.hello");
  socket.respondOk(hello, {
    protocolVersion: 1,
    serviceVersion: "test-service",
    role: "producer",
    ready: true
  });
  await nextTurn();

  const sessionStart = socket.sent[1];
  assert.equal(sessionStart.type, "producer.session.start");
  assert.deepEqual(sessionStart.payload.config, {
    snapshotIntervalMs: 3000,
    chunkDelayMs: 1000,
    chunkSize: 187,
    refreshUniverseEveryCycle: false
  });
  assert.equal(JSON.stringify(sessionStart).includes("authToken"), false);
  assert.equal(JSON.stringify(sessionStart).includes("cookie"), false);
  assert.equal(JSON.stringify(sessionStart).includes("accountId"), false);

  socket.respondOk(sessionStart, { sessionId: "session-1" });
  await started;

  return {
    bridge,
    socket,
    hints,
    timers,
    setNow(value) {
      now = value;
    }
  };
}

function universe() {
  return {
    loadedAtMs: 1100,
    recordCount: 1,
    securities: [{
      securityId: "1001",
      paperName: "Fixture Alpha",
      mapHeatDateChange: 1.5,
      rawMapHeat: {
        PaperId: 1001,
        PaperName: "Fixture Alpha",
        DateChange: 1.5
      }
    }]
  };
}

function cycle() {
  return {
    status: "complete",
    startedAtMs: 1200,
    completedAtMs: 1250,
    durationMs: 50,
    requested: 1,
    received: 1,
    unique: 1,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: [{
      chunkIndex: 0,
      requested: 1,
      received: 1,
      unique: 1,
      requestStartedAtMs: 1200,
      receivedAtMs: 1240,
      completedAtMs: 1250,
      durationMs: 50,
      serverAsOfDate: "fixture",
      httpStatus: 200
    }],
    securities: [{
      securityId: "1001",
      chunkIndex: 0,
      chunkReceivedAtMs: 1240,
      collectedAtMs: 1250,
      serverAsOfDate: "fixture",
      data: {
        Key: 1001,
        LastKnownRate: 101.25
      }
    }]
  };
}

test("producer bridge waits for durable ACKs, enforces universe ordering, and emits metadata-only commit hints", async () => {
  const { bridge, socket, hints } = await startBridge();

  await assert.rejects(
    bridge.commitCycle(cycle()),
    /acknowledged universe revision/i
  );

  const accepting = bridge.acceptUniverse(universe());
  await nextTurn();
  const universeRequest = socket.sent.at(-1);
  assert.equal(universeRequest.type, "producer.universe.replace");

  await assert.rejects(
    bridge.commitCycle(cycle()),
    /acknowledged universe revision/i
  );

  socket.respondOk(universeRequest, {
    universeRevision: 7,
    recordCount: 1
  });
  assert.deepEqual(await accepting, {
    universeRevision: 7,
    recordCount: 1
  });

  let commitSettled = false;
  const committing = bridge.commitCycle(cycle()).then((value) => {
    commitSettled = true;
    return value;
  });
  await nextTurn();

  const commitRequest = socket.sent.at(-1);
  assert.equal(commitRequest.type, "producer.cycle.commit");
  assert.equal(commitRequest.payload.universeRevision, 7);
  assert.equal(commitSettled, false);
  assert.deepEqual(hints, []);

  socket.respondOk(commitRequest, {
    cycleId: 42,
    committedAtMs: 1300
  });

  assert.deepEqual(await committing, {
    cycleId: 42,
    committedAtMs: 1300
  });
  assert.deepEqual(hints, [{
    type: "CYCLE_COMMITTED",
    cycleId: 42,
    completedAtMs: 1250
  }]);
  assert.equal(Object.hasOwn(hints[0], "securities"), false);
  assert.equal(Object.hasOwn(hints[0], "rows"), false);
});

test("producer bridge never emits a commit hint for a rejected commit", async () => {
  const { bridge, socket, hints } = await startBridge();

  const accepting = bridge.acceptUniverse(universe());
  await nextTurn();
  socket.respondOk(socket.sent.at(-1), {
    universeRevision: 1,
    recordCount: 1
  });
  await accepting;

  const committing = bridge.commitCycle(cycle());
  await nextTurn();
  const commitRequest = socket.sent.at(-1);
  socket.respondError(commitRequest, "DB_ERROR");

  await assert.rejects(committing, (error) => {
    assert.equal(error.code, "DB_ERROR");
    return true;
  });
  assert.deepEqual(hints, []);
});


test("producer bridge sends heartbeat on the configured cadence and rearms only after ACK", async () => {
  const { socket, timers, setNow } = await startBridge();

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delayMs, 5000);

  setNow(6000);
  const heartbeatRun = timers[0].callback();
  await nextTurn();

  const heartbeat = socket.sent.at(-1);
  assert.equal(heartbeat.type, "producer.heartbeat");
  assert.deepEqual(heartbeat.payload, { atMs: 6000 });
  assert.equal(timers.length, 1);

  socket.respondOk(heartbeat, { acceptedAtMs: 6001 });
  await heartbeatRun;

  assert.equal(timers.length, 2);
  assert.equal(timers[1].delayMs, 5000);
});
