import path from "node:path";

export const REPLAY_HOST_CONTROL_PORT = 8766;
export const REPLAY_SERVICE_PORT = 8765;

function readValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function parsePort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${name} must be an integer between 0 and 65535`);
  }
  return port;
}

function parseOrigin(value) {
  if (value === "*") throw new Error("Wildcard Origin is not allowed");

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

export function parseReplayHostConfig(argv, { cwd = process.cwd() } = {}) {
  const config = {
    allowedOrigin: null,
    controlPort: REPLAY_HOST_CONTROL_PORT,
    servicePort: REPLAY_SERVICE_PORT,
    replayRoot: path.resolve(cwd, "data", "replay")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--allowed-origin") {
      config.allowedOrigin = parseOrigin(readValue(argv, index, option));
      index += 1;
      continue;
    }
    if (option === "--control-port") {
      config.controlPort = parsePort(readValue(argv, index, option), "Control port");
      index += 1;
      continue;
    }
    if (option === "--service-port") {
      config.servicePort = parsePort(readValue(argv, index, option), "Service port");
      index += 1;
      continue;
    }
    if (option === "--replay-root") {
      config.replayRoot = path.resolve(cwd, readValue(argv, index, option));
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${option}`);
  }

  if (config.allowedOrigin === null) {
    throw new Error("Exactly one --allowed-origin is required");
  }

  return Object.freeze(config);
}
