import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_PORT
} from "./service.js";
import {
  operatorUsage,
  parseOperatorArgs
} from "./operator-config.js";
import { startOperatorOrderService } from "./operator.js";

let config;
try {
  config = parseOperatorArgs(process.argv.slice(2));
} catch (error) {
  console.error(`[ERROR] ${error?.message ?? "invalid order-service startup options"}`);
  console.error(operatorUsage());
  process.exitCode = 2;
}

if (config?.help === true) {
  console.log(operatorUsage());
} else if (config) {
  const runtime = await startOperatorOrderService(config);
  const mode = runtime.liveEnabled ? "LIVE" : "DRY_RUN";

  console.log(`ibkr-order-service listening on http://${ORDER_SERVICE_HOST}:${ORDER_SERVICE_PORT} mode=${mode}`);
  console.log(`CPGW=${config.cpgwBaseUrl} caller-token=ephemeral-not-logged`);

  if (typeof process.send === "function" && process.connected === true) {
    process.send({
      type: "ibkr-order-service.ready",
      baseUrl: `http://${ORDER_SERVICE_HOST}:${ORDER_SERVICE_PORT}`,
      mode,
      callerToken: runtime.callerToken
    });
  }

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await runtime.close();
      process.exitCode = 0;
    } catch {
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
