import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { collectUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { fetchValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { startDemo } from "../../scripts/demo-fake-market.mjs";
import { resetDemoState } from "../../scripts/demo-reset.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function openClient({ url, origin, role, clientInstanceId }) {
  const socket = new WebSocket(url, { origin });
  await once(socket, "open");
  let sequence = 0;

  async function request(type, payload = {}) {
    sequence += 1;
    const response = once(socket, "message");
    socket.send(JSON.stringify({
      v: 1,
      type,
      requestId: `${clientInstanceId}-${sequence}`,
      payload
    }));
    const [data] = await response;
    return JSON.parse(data.toString());
  }

  const hello = await request("client.hello", {
    role,
    clientInstanceId,
    productVersion: "demo-proof"
  });
  assert.equal(hello.type, "response.ok");

  return {
    request,
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close");
      socket.close();
      await closed;
    }
  };
}

async function startDemoCommand() {
  const child = spawn("npm", ["run", "demo:fake-market"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32"
  });

  let stdout = "";
  let stderr = "";
  let resolved = false;

  const urlPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for demo URL. stdout=${stdout} stderr=${stderr}`));
    }, 15_000);

    function inspect() {
      const matches = stdout.match(/http:\/\/127\.0\.0\.1:\d+\//g) ?? [];
      if (matches.length > 0 && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(matches[0]);
      }
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      inspect();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("exit", (code, signal) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(
          `Demo command exited before URL. code=${code} signal=${signal} stdout=${stdout} stderr=${stderr}`
        ));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return {
    child,
    async waitForUrl() {
      return await urlPromise;
    },
    getOutput() {
      return { stdout, stderr };
    },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;

      const exited = once(child, "exit");
      if (process.platform === "win32") {
        child.kill("SIGTERM");
      } else {
        process.kill(-child.pid, "SIGTERM");
      }

      let timeoutId;
      try {
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("Timed out stopping demo command process group.")),
              5000
            );
          })
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
    }
  };
}

async function commitOneDemoCycle(handle) {
  const origin = new URL(handle.url).origin;
  const producer = await openClient({
    url: handle.serviceUrl,
    origin,
    role: "producer",
    clientInstanceId: "demo-persistence-producer"
  });

  try {
    const started = await producer.request("producer.session.start", {
      startedAtMs: 500,
      config: {
        snapshotIntervalMs: 3000
      }
    });
    assert.equal(started.type, "response.ok");

    let nowMs = 2000;
    const candidate = await collectUsCollectionCandidate({
      fetchSnapshot: () => fetchValidatedSnapshot({
        fetchImpl: (input, init) => fetch(new URL(input, handle.url), init),
        now: () => {
          nowMs += 10;
          return nowMs;
        }
      })
    });

    const accepted = await producer.request("producer.universe.replace", candidate.universe);
    assert.equal(accepted.type, "response.ok");

    const committed = await producer.request("producer.cycle.commit", {
      universeRevision: accepted.payload.data.universeRevision,
      cycle: candidate.cycle
    });
    assert.equal(committed.type, "response.ok");

    const stopped = await producer.request("producer.session.stop", {
      stoppedAtMs: candidate.cycle.completedAtMs + 100,
      reason: "demo-proof"
    });
    assert.equal(stopped.type, "response.ok");
  } finally {
    await producer.close();
  }
}

test("npm run demo:fake-market starts the normal stack and prints one useful URL", async () => {
  await rm(path.join(ROOT, ".demo"), { recursive: true, force: true });

  const command = await startDemoCommand();
  try {
    const url = await command.waitForUrl();
    assert.equal(url, "http://127.0.0.1:4173/");

    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/assets\/market-flow-us\.runtime\.js/);

    const viewer = await openClient({
      url: "ws://127.0.0.1:8765",
      origin: new URL(url).origin,
      role: "viewer",
      clientInstanceId: "demo-cli-viewer"
    });
    await viewer.close();

    const output = command.getOutput();
    const printedUrls = output.stdout.match(/http:\/\/127\.0\.0\.1:\d+\//g) ?? [];
    assert.deepEqual(printedUrls, [url]);
  } finally {
    await command.close();
    await rm(path.join(ROOT, ".demo"), { recursive: true, force: true });
  }
});

test("startDemo builds and starts the normal fake/service stack and emits exactly one useful URL", async () => {
  const lines = [];
  const handle = await startDemo({
    fakePort: 0,
    servicePort: 0,
    output(line) {
      lines.push(line);
    }
  });

  try {
    assert.equal(lines.length, 1);
    assert.equal(lines[0], handle.url);
    assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.match(handle.serviceUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);

    const page = await fetch(handle.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/assets\/market-flow-us\.runtime\.js/);

    const runtime = await fetch(new URL("/assets/market-flow-us.runtime.js", handle.url));
    assert.equal(runtime.status, 200);
    assert.match(await runtime.text(), /__MARKET_FLOW_US_RUNTIME_V1__/);

    const viewer = await openClient({
      url: handle.serviceUrl,
      origin: new URL(handle.url).origin,
      role: "viewer",
      clientInstanceId: "demo-proof-viewer"
    });
    await viewer.close();
  } finally {
    await handle.close();
  }
});

test("restarting startDemo reopens the same .demo DuckDB and preserves committed U.S. history", async () => {
  await rm(path.join(ROOT, ".demo"), { recursive: true, force: true });

  let first;
  let second;
  try {
    first = await startDemo({
      fakePort: 0,
      servicePort: 0,
      output() {}
    });
    await commitOneDemoCycle(first);

    const firstViewer = await openClient({
      url: first.serviceUrl,
      origin: new URL(first.url).origin,
      role: "viewer",
      clientInstanceId: "demo-pre-restart-viewer"
    });
    try {
      const beforeRestart = await firstViewer.request("viewer.status.get");
      assert.equal(beforeRestart.type, "response.ok");
      assert.equal(beforeRestart.payload.data.historyCount, 4);
      assert.equal(beforeRestart.payload.data.latestCount, 4);
    } finally {
      await firstViewer.close();
    }

    const firstDbPath = first.dbPath;
    await first.close();
    first = null;

    second = await startDemo({
      fakePort: 0,
      servicePort: 0,
      output() {}
    });
    assert.equal(second.dbPath, firstDbPath);

    const viewer = await openClient({
      url: second.serviceUrl,
      origin: new URL(second.url).origin,
      role: "viewer",
      clientInstanceId: "demo-restart-viewer"
    });

    try {
      const status = await viewer.request("viewer.status.get");
      assert.equal(status.type, "response.ok");
      assert.equal(status.payload.data.historyCount, 4);
      assert.equal(status.payload.data.latestCount, 4);

      const history = await viewer.request("viewer.history.page", {
        securityId: "1001",
        cursor: null
      });
      assert.equal(history.type, "response.ok");
      assert.equal(history.payload.data.rows.length, 1);
      assert.equal(history.payload.data.rows[0].Price, 101.25);
      assert.equal(history.payload.data.rows[0].cycleId, 1);
    } finally {
      await viewer.close();
    }
  } finally {
    if (first) await first.close();
    if (second) await second.close();
    await rm(path.join(ROOT, ".demo"), { recursive: true, force: true });
  }
});

test("resetDemoState deletes only contained .demo state, refuses escape, and leaves production data untouched", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-demo-reset-"));
  const demoDir = path.join(rootDir, ".demo");
  const dataDir = path.join(rootDir, "data");
  const demoSentinel = path.join(demoDir, "demo.txt");
  const productionSentinel = path.join(dataDir, "production.txt");

  try {
    await mkdir(demoDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await writeFile(demoSentinel, "demo", "utf8");
    await writeFile(productionSentinel, "production", "utf8");

    await resetDemoState({ rootDir });

    await assert.rejects(readFile(demoSentinel, "utf8"));
    assert.equal(await readFile(productionSentinel, "utf8"), "production");

    const outside = path.resolve(rootDir, "..", "outside-demo");
    await assert.rejects(
      resetDemoState({ rootDir, demoDir: outside }),
      /outside|escape|\.demo/i
    );
    assert.equal(await readFile(productionSentinel, "utf8"), "production");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("demo startup diagnostics preserve exact build, Fake Market and Node-listen boundaries", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-demo-diag-"));
  const rawSentinel = "SENTINEL_RAW_DEMO /private/demo/path";

  try {
    await assert.rejects(
      startDemo({
        rootDir,
        output() {},
        buildBrowserImpl: async () => {
          throw new Error(rawSentinel);
        }
      }),
      (error) => {
        const record = error.diagnosticRecord;
        assert.equal(record.component, "demo");
        assert.equal(record.checkpoint, "demo.runtime.built");
        assert.equal(record.lastSuccessfulCheckpoint, null);
        assert.equal(record.error.code, "BROWSER_BUILD_ERROR");
        assert.equal(JSON.stringify(record).includes(rawSentinel), false);
        return true;
      }
    );

    await assert.rejects(
      startDemo({
        rootDir,
        output() {},
        buildBrowserImpl: async () => ({ runtimePath: path.join(rootDir, "runtime.js") }),
        startFakeMarketImpl: async () => {
          throw new Error(rawSentinel);
        }
      }),
      (error) => {
        const record = error.diagnosticRecord;
        assert.equal(record.component, "demo");
        assert.equal(record.checkpoint, "demo.fake_market.ready");
        assert.equal(record.lastSuccessfulCheckpoint, "demo.runtime.built");
        assert.equal(record.error.code, "FAKE_MARKET_START_ERROR");
        assert.equal(JSON.stringify(record).includes(rawSentinel), false);
        return true;
      }
    );

    const blocker = await new Promise((resolve, reject) => {
      const server = createNetServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve(server));
    });

    try {
      const port = blocker.address().port;
      await assert.rejects(
        startDemo({
          rootDir,
          servicePort: port,
          output() {},
          buildBrowserImpl: async () => ({ runtimePath: path.join(rootDir, "runtime.js") }),
          startFakeMarketImpl: async () => ({
            baseUrl: "http://127.0.0.1:19001/",
            async close() {}
          })
        }),
        (error) => {
          const record = error.diagnosticRecord;
          assert.equal(record.component, "node.service");
          assert.equal(record.checkpoint, "node.service.ready");
          assert.equal(record.lastSuccessfulCheckpoint, "node.database.ready");
          assert.equal(record.error.code, "SERVICE_LISTEN_ERROR");
          assert.equal(record.checkpoint === "demo.stack.ready", false);
          return true;
        }
      );
    } finally {
      blocker.close();
      await once(blocker, "close");
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
