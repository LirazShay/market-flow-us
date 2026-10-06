import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_PORT
} from "../ibkr-order-service/service.js";
import { parseOperatorArgs } from "../ibkr-order-service/operator-config.js";
import { startOperatorOrderService } from "../ibkr-order-service/operator.js";

const config = parseOperatorArgs(process.argv.slice(2));
if (config.processLiveEnabled) {
  throw new Error("CPGW session check never accepts --live");
}
if (config.help) {
  console.log("Usage: npm run order-service:session-check -- [--allow-insecure-loopback-tls] [--cpgw-url=https://localhost:5000/v1/api] [--db=path]");
  process.exit(0);
}

const runtime = await startOperatorOrderService(config);
try {
  const response = await fetch(`http://${ORDER_SERVICE_HOST}:${ORDER_SERVICE_PORT}/session`, {
    headers: { Authorization: `Bearer ${runtime.callerToken}` }
  });
  const body = await response.json();
  const report = response.ok
    ? {
        status: "PASS",
        check: "CPGW_SESSION_COMPATIBILITY",
        authenticated: body.authenticated === true,
        brokerageSession: body.brokerageSession === true,
        connected: body.connected === true,
        liveSubmissionEnabled: false
      }
    : {
        status: "FAIL",
        check: "CPGW_SESSION_COMPATIBILITY",
        httpStatus: response.status,
        code: typeof body.code === "string" ? body.code : "ORDER_SERVICE_ERROR",
        liveSubmissionEnabled: false
      };
  console.log(JSON.stringify(report, null, 2));
  if (!response.ok) process.exitCode = 1;
} finally {
  await runtime.close();
}
