import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { openMarketScopeDatabase } from "../../local-service/database/database.js";
import { startMarketScopeService } from "../../local-service/server/service.js";

const ALLOWED_ORIGIN = "http://127.0.0.1:19001";

function request(type, requestId, payload = {}) {
  return { v: 1, type, requestId, payload };
}

async function startTestService(overrides = {}, serviceOptions = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-ws-"));
  const dbPath = path.join(tempDir, "service.duckdb");
  const service = await startMarketScopeService({
    config: {
      host: "127.0.0.1",
      port: 0,
      dbPath,
      maxInboundMessageBytes: 16 * 1024 * 1024,
      producerHeartbeatMs: 5000,
      producerStaleAfterMs: 15000,
      historyPageSize: 500,
      allowedOrigins: [ALLOWED_ORIGIN],
      ...overrides
    },
    serviceVersion: "test-version",
    ...serviceOptions
  });

  return {
    ...service,
    async cleanup() {
      await service.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

function socketUrl(service) {
  return `ws://127.0.0.1:${service.port}`;
}

async function openSocket(url, origin = ALLOWED_ORIGIN) {
  const ws = new WebSocket(url, origin === null ? {} : { origin });
  await once(ws, "open");
  return ws;
}

async function rejectionStatus(url, origin) {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(url, origin === null ? {} : { origin });
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for rejected upgrade")), 2000);

    ws.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      response.resume();
      resolve(response.statusCode);
    });
    ws.once("open", () => {
      clearTimeout(timeout);
      ws.close();
      reject(new Error("Upgrade unexpectedly succeeded"));
    });
    ws.once("error", () => {});
  });
}

async function receiveJson(ws) {
  const [data] = await once(ws, "message");
  return JSON.parse(data.toString());
}

async function sendJson(ws, message) {
  ws.send(JSON.stringify(message));
  return await receiveJson(ws);
}

async function hello(ws, role, id) {
  return await sendJson(ws, request("client.hello", id, {
    role,
    clientInstanceId: `${role}-fixture`,
    productVersion: "test-client"
  }));
}

async function closeSocket(ws) {
  if (ws.readyState === WebSocket.CLOSED) return;
  const closed = once(ws, "close");
  ws.close();
  await closed;
}

test("WebSocket upgrade requires one exact allowed Origin and successful hello is correlated", async () => {
  const service = await startTestService();

  try {
    assert.equal(await rejectionStatus(socketUrl(service), null), 403);
    assert.equal(await rejectionStatus(socketUrl(service), "https://wrong.example"), 403);

    const viewer = await openSocket(socketUrl(service));
    const response = await hello(viewer, "viewer", "hello-viewer");

    assert.equal(response.type, "response.ok");
    assert.equal(response.requestId, "hello-viewer");
    assert.equal(response.payload.requestType, "client.hello");
    assert.deepEqual(response.payload.data, {
      protocolVersion: 1,
      serviceVersion: "test-version",
      role: "viewer",
      ready: true
    });

    await closeSocket(viewer);
  } finally {
    await service.cleanup();
  }
});

test("hello-first, malformed input and role violations fail with safe correlated protocol errors", async () => {
  const service = await startTestService();

  try {
    const viewer = await openSocket(socketUrl(service));

    const beforeHello = await sendJson(viewer, request("viewer.status.get", "before-hello"));
    assert.equal(beforeHello.requestId, "before-hello");
    assert.equal(beforeHello.payload.code, "ROLE_VIOLATION");

    viewer.send("{broken-json");
    const malformed = await receiveJson(viewer);
    assert.equal(malformed.type, "response.error");
    assert.equal(malformed.payload.code, "INVALID_MESSAGE");
    assert.equal(malformed.payload.details, null);

    assert.equal((await hello(viewer, "viewer", "hello-after-errors")).type, "response.ok");

    const wrongRole = await sendJson(
      viewer,
      request("producer.heartbeat", "wrong-role", { atMs: 1 })
    );
    assert.equal(wrongRole.requestId, "wrong-role");
    assert.equal(wrongRole.payload.requestType, "producer.heartbeat");
    assert.equal(wrongRole.payload.code, "ROLE_VIOLATION");
    assert.equal(JSON.stringify(wrongRole).includes("stack"), false);

    await closeSocket(viewer);
  } finally {
    await service.cleanup();
  }
});

test("oversized WebSocket payload is rejected by the real ws transport", async () => {
  const service = await startTestService({ maxInboundMessageBytes: 512 });

  try {
    const viewer = await openSocket(socketUrl(service));
    assert.equal((await hello(viewer, "viewer", "hello-size")).type, "response.ok");

    const closed = once(viewer, "close");
    viewer.send("x".repeat(2048));
    const [code] = await closed;
    assert.equal(code, 1009);
  } finally {
    await service.cleanup();
  }
});

test("exactly one producer is accepted while multiple viewers remain independently usable", async () => {
  const service = await startTestService();

  try {
    const producer1 = await openSocket(socketUrl(service));
    assert.equal((await hello(producer1, "producer", "producer-1")).type, "response.ok");

    const producer2 = await openSocket(socketUrl(service));
    const producer2Closed = once(producer2, "close");
    const rejected = await hello(producer2, "producer", "producer-2");
    assert.equal(rejected.requestId, "producer-2");
    assert.equal(rejected.payload.code, "PRODUCER_ALREADY_ACTIVE");
    const [closeCode] = await producer2Closed;
    assert.equal(closeCode, 1008);

    const viewer1 = await openSocket(socketUrl(service));
    const viewer2 = await openSocket(socketUrl(service));
    assert.equal((await hello(viewer1, "viewer", "viewer-1")).type, "response.ok");
    assert.equal((await hello(viewer2, "viewer", "viewer-2")).type, "response.ok");

    const viewer1Violation = await sendJson(
      viewer1,
      request("producer.heartbeat", "viewer-1-still-usable", { atMs: 2 })
    );
    const viewer2Violation = await sendJson(
      viewer2,
      request("producer.heartbeat", "viewer-2-still-usable", { atMs: 3 })
    );
    assert.equal(viewer1Violation.requestId, "viewer-1-still-usable");
    assert.equal(viewer2Violation.requestId, "viewer-2-still-usable");
    assert.equal(viewer1Violation.payload.code, "ROLE_VIOLATION");
    assert.equal(viewer2Violation.payload.code, "ROLE_VIOLATION");

    await Promise.all([
      closeSocket(producer1),
      closeSocket(viewer1),
      closeSocket(viewer2)
    ]);
  } finally {
    await service.cleanup();
  }
});


test("service shutdown drains an in-flight Viewer message before closing DuckDB", async () => {
  let enterRead;
  const readEntered = new Promise((resolve) => {
    enterRead = resolve;
  });
  let releaseRead;
  const readRelease = new Promise((resolve) => {
    releaseRead = resolve;
  });

  const openDatabase = async (options) => {
    const database = await openMarketScopeDatabase(options);
    const connection = database.viewerReadConnection;
    const originalRunAndReadAll = connection.runAndReadAll.bind(connection);

    database.viewerReadConnection = {
      async runAndReadAll(sql, values) {
        if (String(sql).includes("FROM scanner_saved_queries")) {
          enterRead();
          await readRelease;
        }

        return values === undefined
          ? await originalRunAndReadAll(sql)
          : await originalRunAndReadAll(sql, values);
      }
    };

    return database;
  };

  const service = await startTestService({}, { openDatabase });
  const viewer = await openSocket(socketUrl(service));
  let closeSettled = false;

  try {
    assert.equal((await hello(viewer, "viewer", "shutdown-drain")).type, "response.ok");

    viewer.send(JSON.stringify(
      request("scanner.queries.list", "in-flight-library-read")
    ));
    await readEntered;

    const closing = service.close().then(() => {
      closeSettled = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      closeSettled,
      false,
      "service close must wait for in-flight Viewer operations before closing DuckDB"
    );

    releaseRead();
    await closing;
    assert.equal(closeSettled, true);
  } finally {
    releaseRead();
    if (viewer.readyState !== WebSocket.CLOSED) {
      await closeSocket(viewer).catch(() => {});
    }
    await service.cleanup();
  }
});
