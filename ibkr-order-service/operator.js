import {
  CpgwAdapter,
  createCpgwTransport
} from "./cpgw-adapter.js";
import { startOrderService } from "./service.js";

export function createOperatorAdapter(config) {
  if (!config || typeof config !== "object") {
    throw new TypeError("operator config is required");
  }
  return new CpgwAdapter({
    requestJson: createCpgwTransport({
      baseUrl: config.cpgwBaseUrl,
      allowInsecureLoopbackTls: config.allowInsecureLoopbackTls === true
    })
  });
}

export async function startOperatorOrderService(config, options = {}) {
  const adapter = options.adapter ?? createOperatorAdapter(config);
  return startOrderService({
    adapter,
    dbPath: config.dbPath,
    processLiveEnabled: config.processLiveEnabled === true,
    ...(options.port === undefined ? {} : { port: options.port })
  });
}
