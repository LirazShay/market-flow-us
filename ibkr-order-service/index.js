import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_PORT,
  startOrderService
} from "./service.js";

const runtime = await startOrderService();

console.log(`ibkr-order-service listening on http://${ORDER_SERVICE_HOST}:${ORDER_SERVICE_PORT}`);

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
