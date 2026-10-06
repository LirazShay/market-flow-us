import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((candidateResolve) => {
    resolve = candidateResolve;
  });
  return { promise, resolve };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createResponseRouter(socket) {
  const pending = new Map();

  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const waiter = pending.get(message.requestId);
    if (!waiter) return;
    pending.delete(message.requestId);
    waiter.resolve(message);
  });

  socket.on("close", () => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error("Socket closed before response."));
    }
    pending.clear();
  });

  return function request(type, requestId, payload = {}) {
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({
        v: 1,
        type,
        requestId,
        payload
      }));
    });
  };
}

function testUniverse() {
  return {
    loadedAtMs: 1000,
    recordCount: 1,
    securities: [
      {
        securityId: "101",
        symbol: "AAA",
        paperNameEng: "AAA Incorporated",
        paperNameHeb: null,
        exchangeName: "NASDAQ",
        rawSource: {
          PaperId: 101,
          Symbol: "AAA"
        }
      }
    ]
  };
}

test("queued heartbeat supersedes a stale deadline after a long serialized universe replace", async () => {
  const universeEntered = deferred();
  const releaseUniverse = deferred();
  let delayedUniverseWrite = false;

  const openDatabase = async (options) => {
    const database = await openMarketFlowUsDatabase(options);
    const connection = database.writerConnection;

    database.writerConnection = new Proxy(connection, {
      get(target, property, receiver) {
        if (property === "run") {
          return async (sql, ...args) => {
            if (
              !delayedUniverseWrite
              && String(sql).trim() === "UPDATE universe SET is_current = false"
            ) {
              delayedUniverseWrite = true;
              universeEntered.resolve();
              await releaseUniverse.promise;
            }
            return await target.run(sql, ...args);
          };
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });

    return database;
  };

  const fixture = await createServiceFixture({
    config: {
      producerHeartbeatMs: 10,
      producerStaleAfterMs: 40
    },
    openDatabase
  });

  const socket = new WebSocket(fixture.url, { origin: fixture.origin });

  try {
    await once(socket, "open");
    const request = createResponseRouter(socket);

    const hello = await request("client.hello", "hello", {
      role: "producer",
      clientInstanceId: "producer-heartbeat-queue",
      productVersion: "test-client"
    });
    assert.equal(hello.type, "response.ok");

    const started = await request("producer.session.start", "start", {
      startedAtMs: 100,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(started.type, "response.ok");

    const universeResponse = request(
      "producer.universe.replace",
      "universe",
      testUniverse()
    );
    await universeEntered.promise;

    const heartbeatResponse = request("producer.heartbeat", "heartbeat-queued", {
      atMs: 200
    });

    await delay(80);
    releaseUniverse.resolve();

    assert.equal((await universeResponse).type, "response.ok");
    assert.equal((await heartbeatResponse).type, "response.ok");

    const laterHeartbeat = await request("producer.heartbeat", "heartbeat-after-drain", {
      atMs: 300
    });
    assert.equal(laterHeartbeat.type, "response.ok");
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    releaseUniverse.resolve();
    if (socket.readyState !== WebSocket.CLOSED) {
      const closed = once(socket, "close");
      socket.close();
      await closed.catch(() => {});
    }
    await fixture.cleanup();
  }
});
