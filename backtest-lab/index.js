import path from "node:path";
import {
  BACKTEST_LAB_HOST,
  BACKTEST_LAB_PORT,
  startBacktestLabRuntime
} from "./runtime.js";

let runtime = null;
try {
  runtime = await startBacktestLabRuntime({
    dataDir: path.resolve(process.cwd(), "data"),
    host: BACKTEST_LAB_HOST,
    port: BACKTEST_LAB_PORT
  });
  process.stdout.write(JSON.stringify({
    event: "backtest_lab.ready",
    host: runtime.host,
    port: runtime.port
  }) + "\n");
} catch {
  process.stderr.write(JSON.stringify({
    event: "backtest_lab.error",
    code: "BACKTEST_RUNTIME_START_ERROR",
    message: "Backtest Lab failed to start safely."
  }) + "\n");
  process.exitCode = 1;
}

if (runtime) {
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await runtime.close();
      process.stdout.write(JSON.stringify({
        event: "backtest_lab.closed",
        signal
      }) + "\n");
      process.exitCode = 0;
    } catch {
      process.stderr.write(JSON.stringify({
        event: "backtest_lab.error",
        code: "BACKTEST_RUNTIME_STOP_ERROR",
        message: "Backtest Lab failed to stop cleanly."
      }) + "\n");
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
