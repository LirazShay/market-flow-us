import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDiagnosticTracker,
  DIAGNOSTIC_CODES,
  formatCliDiagnostic
} from "../shared/diagnostics/index.js";
import { openMarketFlowUsDatabase } from "../local-service/database/database.js";
import { DEFAULT_SERVICE_CONFIG } from "../local-service/server/config.js";
import { startMarketScopeService } from "../local-service/server/service.js";
import { startUsFakeMarket } from "../tests/fake-market/us-server.mjs";
import { buildBrowser } from "./build-browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_VERSION = "0.1.0";

function websocketUrl(host, port) {
  const hostForUrl = host.includes(":") ? `[${host}]` : host;
  return `ws://${hostForUrl}:${port}`;
}

function attachDiagnosticRecord(error, record) {
  if (error && (typeof error === "object" || typeof error === "function")) {
    try {
      Object.defineProperty(error, "diagnosticRecord", {
        value: record,
        configurable: true,
        enumerable: false,
        writable: false
      });
      return error;
    } catch {
      // Use a safe wrapper when the original error cannot carry diagnostic metadata.
    }
  }

  const wrapped = new Error("MarketScope demo startup failed.");
  wrapped.name = "DemoStartupError";
  Object.defineProperty(wrapped, "diagnosticRecord", {
    value: record,
    configurable: true,
    enumerable: false,
    writable: false
  });
  return wrapped;
}

function recordDemoFailure(tracker, {
  checkpoint,
  lastSuccessfulCheckpoint = null,
  code,
  name,
  message,
  error
}) {
  const record = tracker.recordError({
    component: "demo",
    operation: "demo.startup",
    operationId: "demo-startup",
    checkpoint,
    lastSuccessfulCheckpoint,
    error: {
      code,
      name,
      message,
      retryable: false
    }
  });
  return attachDiagnosticRecord(error, record);
}

export async function startDemo({
  rootDir = ROOT,
  fakeHost = "127.0.0.1",
  fakePort = 4173,
  serviceHost = "127.0.0.1",
  servicePort = 8765,
  output = (line) => process.stdout.write(`${line}\n`),
  buildBrowserImpl = buildBrowser,
  startFakeMarketImpl = startUsFakeMarket,
  startServiceImpl = startMarketScopeService,
  openDatabase = openMarketFlowUsDatabase,
  diagnosticTracker = createDiagnosticTracker({ productVersion: DEMO_VERSION })
} = {}) {
  if (typeof output !== "function") {
    throw new TypeError("output must be a function.");
  }

  const resolvedRoot = path.resolve(rootDir);
  const demoDir = path.join(resolvedRoot, ".demo");
  const dbPath = path.join(demoDir, "market-scope.duckdb");

  await mkdir(demoDir, { recursive: true });

  let buildResult;
  try {
    buildResult = await buildBrowserImpl();
    diagnosticTracker.recordSuccess({
      component: "demo",
      operation: "demo.startup",
      operationId: "demo-startup",
      checkpoint: "demo.runtime.built"
    });
  } catch (error) {
    throw recordDemoFailure(diagnosticTracker, {
      checkpoint: "demo.runtime.built",
      code: DIAGNOSTIC_CODES.BROWSER_BUILD_ERROR,
      name: "BrowserBuildError",
      message: "Browser runtime build failed.",
      error
    });
  }

  let fake = null;
  let service = null;

  try {
    try {
      fake = await startFakeMarketImpl({
        host: fakeHost,
        port: fakePort,
        runtimePath: buildResult.runtimePath
      });
      diagnosticTracker.recordSuccess({
        component: "demo",
        operation: "demo.startup",
        operationId: "demo-startup",
        checkpoint: "demo.fake_market.ready"
      });
    } catch (error) {
      throw recordDemoFailure(diagnosticTracker, {
        checkpoint: "demo.fake_market.ready",
        lastSuccessfulCheckpoint: "demo.runtime.built",
        code: DIAGNOSTIC_CODES.FAKE_MARKET_START_ERROR,
        name: "FakeMarketStartError",
        message: "Fake Market listener could not start.",
        error
      });
    }

    const fakeOrigin = new URL(fake.baseUrl).origin;
    service = await startServiceImpl({
      config: {
        ...DEFAULT_SERVICE_CONFIG,
        host: serviceHost,
        port: servicePort,
        dbPath,
        allowedOrigins: [fakeOrigin]
      },
      serviceVersion: DEMO_VERSION,
      diagnosticTracker,
      openDatabase
    });

    diagnosticTracker.recordSuccess({
      component: "demo",
      operation: "demo.startup",
      operationId: "demo-startup",
      checkpoint: "demo.stack.ready"
    });

    const serviceUrl = websocketUrl(service.host, service.port);
    let closed = false;

    const handle = Object.freeze({
      url: fake.baseUrl,
      serviceUrl,
      dbPath,
      diagnostics: diagnosticTracker,
      async close() {
        if (closed) return;
        closed = true;

        const failures = [];
        try {
          await service.close();
        } catch (error) {
          failures.push(error);
        }

        try {
          await fake.close();
        } catch (error) {
          failures.push(error);
        }

        if (failures.length > 0) {
          throw new AggregateError(failures, "Failed to close MarketScope demo cleanly.");
        }
      }
    });

    output(handle.url);
    return handle;
  } catch (error) {
    if (service) {
      await service.close().catch(() => {});
    }
    if (fake) {
      await fake.close().catch(() => {});
    }
    throw error;
  }
}

async function runCli() {
  const diagnosticTracker = createDiagnosticTracker({ productVersion: DEMO_VERSION });
  let handle;

  try {
    handle = await startDemo({ diagnosticTracker });
  } catch (error) {
    const record = error?.diagnosticRecord ?? diagnosticTracker.recordError({
      component: "demo",
      operation: "demo.startup",
      operationId: "demo-startup",
      checkpoint: "demo.stack.ready",
      error: {
        code: DIAGNOSTIC_CODES.DEMO_START_ERROR,
        name: "DemoStartupError",
        message: "MarketScope demo startup failed.",
        retryable: false
      }
    });
    process.stderr.write(formatCliDiagnostic(record) + "\n");
    process.exitCode = 1;
    return;
  }

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await handle.close();
    } catch {
      const record = diagnosticTracker.recordError({
        component: "demo",
        operation: "demo.shutdown",
        operationId: "demo-shutdown",
        checkpoint: "demo.stack.ready",
        error: {
          code: DIAGNOSTIC_CODES.DEMO_START_ERROR,
          name: "DemoShutdownError",
          message: "MarketScope demo shutdown failed.",
          retryable: false
        }
      });
      process.stderr.write(formatCliDiagnostic(record) + "\n");
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", () => {
    void shutdown();
  });

  process.once("SIGTERM", () => {
    void shutdown();
  });
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  await runCli();
}
