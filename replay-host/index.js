import { parseReplayHostConfig } from "./config.js";
import { startReplayHost } from "./host.js";

let config;
try {
  config = parseReplayHostConfig(process.argv.slice(2));
} catch (error) {
  console.error(`[ERROR] ${error?.message ?? "invalid Replay Host startup options"}`);
  process.exitCode = 2;
}

if (config) {
  const host = await startReplayHost(config);
  console.log(`market-flow-us Replay Host listening on http://127.0.0.1:${host.controlPort}`);
  console.log(`allowed-origin=${config.allowedOrigin} control-credential=ephemeral-not-logged`);
  console.log("Run the dedicated Market Replay browser artifact on that exact provider Origin.");

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await host.close();
      process.exitCode = 0;
    } catch {
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
