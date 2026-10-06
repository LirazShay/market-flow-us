import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_PORT,
  startOrderService
} from "./service.js";

const { server } = await startOrderService();

console.log(`ibkr-order-service listening on http://${ORDER_SERVICE_HOST}:${ORDER_SERVICE_PORT}`);

function shutdown() {
  server.close(() => {
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
