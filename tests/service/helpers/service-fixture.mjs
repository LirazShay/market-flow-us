import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { startMarketScopeService } from "../../../local-service/server/service.js";

export const DEFAULT_TEST_ORIGIN = "http://127.0.0.1:19001";

export class InjectedPersistenceFault extends Error {
  constructor(point) {
    super(`Injected persistence fault at ${point}`);
    this.name = "InjectedPersistenceFault";
    this.point = point;
  }
}

export function createPersistenceFaultInjector(points = []) {
  const enabled = new Set(points);
  return Object.freeze({
    hit(point) {
      if (enabled.has(point)) {
        throw new InjectedPersistenceFault(point);
      }
    },
    enable(point) {
      enabled.add(point);
    },
    disable(point) {
      enabled.delete(point);
    },
    clear() {
      enabled.clear();
    }
  });
}

async function rows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function openClient({ url, origin, role, clientInstanceId }) {
  const socket = new WebSocket(url, { origin });
  await once(socket, "open");

  let requestSequence = 0;

  async function send(message) {
    const response = once(socket, "message");
    socket.send(JSON.stringify(message));
    const [data] = await response;
    return JSON.parse(data.toString());
  }

  const hello = await send({
    v: 1,
    type: "client.hello",
    requestId: `hello-${clientInstanceId}`,
    payload: {
      role,
      clientInstanceId,
      productVersion: "test-client"
    }
  });

  return {
    socket,
    hello,
    async request(type, payload = {}) {
      requestSequence += 1;
      return await send({
        v: 1,
        type,
        requestId: `${clientInstanceId}-${requestSequence}`,
        payload
      });
    },
    async send(message) {
      return await send(message);
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close");
      socket.close();
      await closed;
    }
  };
}

export async function createServiceFixture({
  origin = DEFAULT_TEST_ORIGIN,
  config = {},
  persistenceFault = createPersistenceFaultInjector(),
  aiPackFault = createPersistenceFaultInjector(),
  now = () => Date.now(),
  openDatabase = undefined,
  basicBuyReadiness = () => false,
  basicBuyExecution = null
} = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-service-"));
  const dbPath = path.join(tempDir, "fixture.duckdb");
  const aiPackExportRoot = path.join(tempDir, "exports", "ai-investigations");
  const clients = new Set();

  let service;
  try {
    service = await startMarketScopeService({
      config: {
        host: "127.0.0.1",
        port: 0,
        dbPath,
        maxInboundMessageBytes: 16 * 1024 * 1024,
        producerHeartbeatMs: 5000,
        producerStaleAfterMs: 15000,
        historyPageSize: 500,
        allowedOrigins: [origin],
        ...config
      },
      serviceVersion: "test-version",
      persistenceFault,
      aiPackExportRoot,
      aiPackFault,
      now,
      openDatabase,
      basicBuyReadiness,
      basicBuyExecution
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  const url = `ws://127.0.0.1:${service.port}`;

  return {
    tempDir,
    dbPath,
    aiPackExportRoot,
    port: service.port,
    url,
    origin,
    service,
    persistenceFault,
    aiPackFault,
    async connect(role, clientInstanceId = `${role}-fixture`) {
      const client = await openClient({ url, origin, role, clientInstanceId });
      clients.add(client);
      return {
        ...client,
        async close() {
          await client.close();
          clients.delete(client);
        }
      };
    },
    async rows(sql, values) {
      return await rows(service.database.viewerReadConnection, sql, values);
    },
    async cleanup() {
      await Promise.all([...clients].map((client) => client.close()));
      clients.clear();
      await service.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}
