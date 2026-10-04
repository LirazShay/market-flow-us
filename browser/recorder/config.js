export const DEFAULT_RECORDER_CONFIG = Object.freeze({
  snapshotIntervalMs: 3000,
  chunkDelayMs: 1000,
  chunkSize: 187,
  refreshUniverseEveryCycle: false
});

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
