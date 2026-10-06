import { DEFAULT_ORDER_STORE_PATH } from "./store.js";

export const DEFAULT_CPGW_BASE_URL = "https://localhost:5000/v1/api";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message) {
  throw new TypeError(message);
}

function parseLoopbackHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("--cpgw-url must be a valid URL");
  }

  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  if (url.protocol !== "https:") {
    fail("--cpgw-url must use https");
  }
  if (!LOOPBACK_HOSTS.has(hostname.toLowerCase())) {
    fail("--cpgw-url must target loopback only");
  }
  if (url.username || url.password) {
    fail("--cpgw-url must not contain credentials");
  }
  return url.href.replace(/\/$/u, "");
}

function boundedPath(value, flagName) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) {
    fail(`${flagName} requires a non-empty bounded value`);
  }
  return value;
}

export function operatorUsage() {
  return [
    "Usage: node ibkr-order-service/index.js [options]",
    "",
    "Default mode is DRY_RUN. Actual provider submission is impossible unless --live is supplied",
    "and the request plus every provider/local LIVE gate also succeeds.",
    "",
    "Options:",
    "  --live                           Explicitly arm process-level LIVE submission gate",
    "  --allow-insecure-loopback-tls    Relax TLS verification only for the loopback CPGW client",
    "  --cpgw-url=<https-loopback-url>  Override CPGW base URL (default https://localhost:5000/v1/api)",
    `  --db=<path>                      Execution store path (default ${DEFAULT_ORDER_STORE_PATH})`,
    "  --help                           Show this help"
  ].join("\n");
}

export function parseOperatorArgs(argv = []) {
  if (!Array.isArray(argv)) {
    throw new TypeError("argv must be an array");
  }

  const config = {
    processLiveEnabled: false,
    allowInsecureLoopbackTls: false,
    cpgwBaseUrl: DEFAULT_CPGW_BASE_URL,
    dbPath: DEFAULT_ORDER_STORE_PATH,
    help: false
  };

  for (const rawArg of argv) {
    if (rawArg === "--live") {
      config.processLiveEnabled = true;
      continue;
    }
    if (rawArg === "--allow-insecure-loopback-tls") {
      config.allowInsecureLoopbackTls = true;
      continue;
    }
    if (rawArg === "--help" || rawArg === "-h") {
      config.help = true;
      continue;
    }
    if (typeof rawArg === "string" && rawArg.startsWith("--cpgw-url=")) {
      config.cpgwBaseUrl = parseLoopbackHttpsUrl(rawArg.slice("--cpgw-url=".length));
      continue;
    }
    if (typeof rawArg === "string" && rawArg.startsWith("--db=")) {
      config.dbPath = boundedPath(rawArg.slice("--db=".length), "--db");
      continue;
    }
    fail(`unknown order-service option: ${String(rawArg)}`);
  }

  config.cpgwBaseUrl = parseLoopbackHttpsUrl(config.cpgwBaseUrl);
  return Object.freeze({ ...config });
}
