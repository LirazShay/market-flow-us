import path from "node:path";

export const MARKET_SCOPE_DB_FILENAME = "market-scope.duckdb";
export const MARKET_FLOW_US_DB_FILENAME = "market-flow-us.duckdb";

function baseConfig(dbFilename) {
  return Object.freeze({
    host: "127.0.0.1",
    port: 8765,
    dbPath: path.resolve("data", dbFilename),
    maxInboundMessageBytes: 16 * 1024 * 1024,
    producerHeartbeatMs: 5000,
    producerStaleAfterMs: 15000,
    historyPageSize: 500
  });
}

export const DEFAULT_SERVICE_CONFIG = baseConfig(MARKET_SCOPE_DB_FILENAME);
export const DEFAULT_MARKET_FLOW_US_SERVICE_CONFIG = baseConfig(MARKET_FLOW_US_DB_FILENAME);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function readValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Port must be an integer between 0 and 65535");
  }
  return port;
}

function parseOrigin(value) {
  if (value === "*") {
    throw new Error("Wildcard Origin is not allowed");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Allowed Origin must be a valid absolute Origin");
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== value) {
    throw new Error("Allowed Origin must contain scheme + host + optional port only");
  }

  return value;
}

function parseConfig(argv, { cwd, defaults, dbFilename }) {
  const config = {
    ...defaults,
    dbPath: path.resolve(cwd, "data", dbFilename),
    allowedOrigins: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];

    if (option === "--db") {
      config.dbPath = path.resolve(cwd, readValue(argv, index, option));
      index += 1;
      continue;
    }

    if (option === "--host") {
      const host = readValue(argv, index, option);
      if (!LOOPBACK_HOSTS.has(host)) {
        throw new Error("Service host must be loopback");
      }
      config.host = host;
      index += 1;
      continue;
    }

    if (option === "--port") {
      config.port = parsePort(readValue(argv, index, option));
      index += 1;
      continue;
    }

    if (option === "--allowed-origin") {
      config.allowedOrigins.push(parseOrigin(readValue(argv, index, option)));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${option}`);
  }

  if (config.allowedOrigins.length === 0) {
    throw new Error("At least one exact --allowed-origin is required");
  }

  return Object.freeze({
    ...config,
    allowedOrigins: Object.freeze([...config.allowedOrigins])
  });
}

export function parseServiceConfig(argv, { cwd = process.cwd() } = {}) {
  return parseConfig(argv, {
    cwd,
    defaults: DEFAULT_SERVICE_CONFIG,
    dbFilename: MARKET_SCOPE_DB_FILENAME
  });
}

export function parseMarketFlowUsServiceConfig(argv, { cwd = process.cwd() } = {}) {
  return parseConfig(argv, {
    cwd,
    defaults: DEFAULT_MARKET_FLOW_US_SERVICE_CONFIG,
    dbFilename: MARKET_FLOW_US_DB_FILENAME
  });
}
