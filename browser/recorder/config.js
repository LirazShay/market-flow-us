export const DEFAULT_RECORDER_CONFIG = Object.freeze({
  snapshotIntervalMs: 3000,
  chunkDelayMs: 1000,
  chunkSize: 187,
  refreshUniverseEveryCycle: false
});

export const DEFAULT_US_RECORDER_CONFIG = Object.freeze({
  snapshotIntervalMs: 3000
});

const US_RECORDER_CONFIG_MARKER = Symbol("market-flow-us-recorder-config");

function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

export function createRecorderConfig(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new TypeError("Recorder config overrides must be an object.");
  }

  if (overrides[US_RECORDER_CONFIG_MARKER] === true) {
    assertNonNegativeInteger(overrides.snapshotIntervalMs, "snapshotIntervalMs");
    return overrides;
  }

  const config = {
    ...DEFAULT_RECORDER_CONFIG,
    ...overrides
  };

  assertNonNegativeInteger(config.snapshotIntervalMs, "snapshotIntervalMs");
  assertNonNegativeInteger(config.chunkDelayMs, "chunkDelayMs");
  assertPositiveInteger(config.chunkSize, "chunkSize");

  if (typeof config.refreshUniverseEveryCycle !== "boolean") {
    throw new TypeError("refreshUniverseEveryCycle must be a boolean.");
  }

  return Object.freeze(config);
}

export function createUsRecorderConfig(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new TypeError("U.S. Recorder config overrides must be an object.");
  }

  const unsupported = Object.keys(overrides).filter((key) => key !== "snapshotIntervalMs");
  if (unsupported.length > 0) {
    throw new TypeError(`Unsupported U.S. Recorder config: ${unsupported.join(", ")}.`);
  }

  const config = {
    ...DEFAULT_US_RECORDER_CONFIG,
    ...overrides
  };
  assertNonNegativeInteger(config.snapshotIntervalMs, "snapshotIntervalMs");
  Object.defineProperty(config, US_RECORDER_CONFIG_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return Object.freeze(config);
}
