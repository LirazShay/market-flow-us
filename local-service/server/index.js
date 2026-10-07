import {
  createDiagnosticTracker,
  DIAGNOSTIC_CODES,
  formatCliDiagnostic
} from "../../shared/diagnostics/index.js";
import { ERROR_CODES } from "../../shared/protocol/index.js";
import { openMarketFlowUsDatabase } from "../database/database.js";
import {
  BasicBuySidecarError,
  startBasicBuySidecar
} from "../orders/basic-buy-sidecar.js";
import { parseServiceConfig } from "./config.js";
import { startMarketScopeService } from "./service.js";

const SERVICE_VERSION = "0.1.0";
const diagnosticTracker = createDiagnosticTracker({ productVersion: SERVICE_VERSION });

let service = null;
let basicBuySidecar = null;

try {
  const config = parseServiceConfig(process.argv.slice(2));
  if (config.buy?.enabled === true) {
    basicBuySidecar = await startBasicBuySidecar({ buyConfig: config.buy });
    diagnosticTracker.recordSuccess({
      component: "basic_buy",
      operation: "basic_buy.sidecar.start",
      operationId: "basic-buy-sidecar-start",
      checkpoint: "basic_buy.sidecar"
    });
  }

  service = await startMarketScopeService({
    config,
    serviceVersion: SERVICE_VERSION,
    diagnosticTracker,
    openDatabase: openMarketFlowUsDatabase,
    basicBuyReadiness: () => basicBuySidecar?.isReady() === true,
    basicBuyExecution: basicBuySidecar
  });

  process.stdout.write(
    JSON.stringify({
      event: "service.ready",
      host: service.host,
      port: service.port,
      schemaVersion: service.database.schemaVersion
    }) + "\n"
  );
} catch (error) {
  if (basicBuySidecar) {
    try {
      await basicBuySidecar.close();
    } catch {
      // Startup already failed; preserve that failure while stopping only our owned child.
    }
    basicBuySidecar = null;
  }

  const diagnosticRecord = error?.diagnosticRecord ?? (
    error instanceof BasicBuySidecarError
      ? diagnosticTracker.recordError({
        component: "basic_buy",
        operation: "basic_buy.sidecar.start",
        operationId: "basic-buy-sidecar-start",
        checkpoint: "basic_buy.sidecar",
        error: {
          code: error.code,
          name: "BasicBuySidecarError",
          message: "Basic BUY sidecar startup failed safely.",
          retryable: false
        }
      })
      : diagnosticTracker.recordError({
        component: "node.service",
        operation: "service.startup",
        operationId: "service-startup",
        checkpoint: "node.service.ready",
        error: {
          code: error?.code === ERROR_CODES.DB_SCHEMA_UNSUPPORTED
            ? ERROR_CODES.DB_SCHEMA_UNSUPPORTED
            : DIAGNOSTIC_CODES.SERVICE_LISTEN_ERROR,
          name: "ServiceStartupError",
          message: "Market Flow US service startup failed.",
          retryable: false
        }
      })
  );

  process.stderr.write(formatCliDiagnostic(diagnosticRecord) + "\n");
  process.exitCode = 1;
}

if (service) {
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    let shutdownFailed = false;
    try {
      await service.close();
    } catch {
      shutdownFailed = true;
    }

    if (basicBuySidecar) {
      try {
        await basicBuySidecar.close();
      } catch {
        shutdownFailed = true;
      }
      basicBuySidecar = null;
    }

    if (!shutdownFailed) {
      process.stdout.write(JSON.stringify({ event: "service.closed", signal }) + "\n");
      process.exitCode = 0;
      return;
    }

    const record = diagnosticTracker.recordError({
      component: "node.service",
      operation: "service.shutdown",
      operationId: "service-shutdown",
      checkpoint: "node.service.ready",
      error: {
        code: DIAGNOSTIC_CODES.SERVICE_LISTEN_ERROR,
        name: "ServiceShutdownError",
        message: "Market Flow US service shutdown failed.",
        retryable: false
      }
    });
    process.stderr.write(formatCliDiagnostic(record) + "\n");
    process.exitCode = 1;
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
