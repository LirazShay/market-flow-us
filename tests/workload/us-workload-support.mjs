import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";

export const SYNTHETIC_EPOCH_MS = Date.UTC(2026, 9, 5, 13, 30, 0);
export const DEFAULT_CADENCE_MS = 3000;

function readPositiveInteger(env, name, fallback, { allowZero = false } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be a safe integer >= ${minimum}.`);
  }
  return value;
}

function readPattern(env) {
  const value = env.MARKET_FLOW_US_WORKLOAD_PATTERN ?? "moving";
  if (value !== "moving" && value !== "static") {
    throw new TypeError("MARKET_FLOW_US_WORKLOAD_PATTERN must be moving or static.");
  }
  return value;
}

function readFailureCycles(env) {
  const raw = env.MARKET_FLOW_US_WORKLOAD_FAILURE_CYCLES;
  if (!raw) return [];
  return raw.split(",").map((token) => {
    const value = Number(token.trim());
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("MARKET_FLOW_US_WORKLOAD_FAILURE_CYCLES must contain non-negative integers.");
    }
    return value;
  });
}

export function workloadMode(env = process.env) {
  const value = env.MARKET_FLOW_US_WORKLOAD_PROFILE ?? "ci";
  if (!["ci", "target-e2e", "target-day", "custom"].includes(value)) {
    throw new TypeError(
      "MARKET_FLOW_US_WORKLOAD_PROFILE must be ci, target-e2e, target-day or custom."
    );
  }
  return value;
}

export function resolveEndToEndProfiles(env = process.env) {
  const mode = workloadMode(env);
  const pattern = readPattern(env);
  const failureCycles = readFailureCycles(env);

  if (mode === "target-day") return [];
  if (mode === "target-e2e") {
    return [{
      name: "target-4096x180",
      universeSize: 4096,
      cycleCount: 180,
      cadenceMs: DEFAULT_CADENCE_MS,
      dataPattern: pattern,
      failureCycles,
      proveScanner: true,
      proveRestart: true,
      targetAuthority: true
    }];
  }
  if (mode === "custom") {
    const universeSize = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE", 64);
    const cycleCount = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_CYCLES", 45);
    const cadenceMs = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_CADENCE_MS", DEFAULT_CADENCE_MS);
    return [{
      name: `custom-${universeSize}x${cycleCount}`,
      universeSize,
      cycleCount,
      cadenceMs,
      dataPattern: pattern,
      failureCycles,
      proveScanner: cycleCount * cadenceMs >= 120000,
      proveRestart: true,
      targetAuthority: false
    }];
  }

  return [{
    name: "ci-correctness",
    universeSize: 64,
    cycleCount: 45,
    cadenceMs: DEFAULT_CADENCE_MS,
    dataPattern: "moving",
    failureCycles: [],
    proveScanner: true,
    proveRestart: true,
    targetAuthority: false
  }];
}

export function resolveIsolatedProfile(env = process.env) {
  const mode = workloadMode(env);
  if (mode === "target-e2e") return null;

  if (mode === "target-day") {
    const universeSize = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE", 4096);
    const cadenceMs = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_CADENCE_MS", DEFAULT_CADENCE_MS);
    const tradingDayMinutes = readPositiveInteger(env, "MARKET_FLOW_US_TRADING_DAY_MINUTES", 390);
    const cycleCount = Math.max(1, Math.floor((tradingDayMinutes * 60000) / cadenceMs));
    return {
      name: "target-day-bounded",
      universeSize,
      cycleCount,
      cadenceMs,
      persistenceUniverseSize: readPositiveInteger(
        env,
        "MARKET_FLOW_US_PERSISTENCE_UNIVERSE_SIZE",
        universeSize
      ),
      persistenceCycles: readPositiveInteger(env, "MARKET_FLOW_US_PERSISTENCE_CYCLES", 10),
      widthUniverseSize: universeSize,
      targetAuthority: true
    };
  }

  if (mode === "custom") {
    const universeSize = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE", 64);
    const cycleCount = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_CYCLES", 45);
    const cadenceMs = readPositiveInteger(env, "MARKET_FLOW_US_WORKLOAD_CADENCE_MS", DEFAULT_CADENCE_MS);
    return {
      name: "custom-isolated",
      universeSize,
      cycleCount,
      cadenceMs,
      persistenceUniverseSize: Math.min(universeSize, 512),
      persistenceCycles: Math.min(cycleCount, 5),
      widthUniverseSize: universeSize,
      targetAuthority: false
    };
  }

  return {
    name: "ci-isolated",
    universeSize: 64,
    cycleCount: 45,
    cadenceMs: DEFAULT_CADENCE_MS,
    persistenceUniverseSize: 128,
    persistenceCycles: 3,
    widthUniverseSize: 4096,
    targetAuthority: false
  };
}

export function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

export function distribution(samples) {
  if (samples.length === 0) {
    return {
      samples: 0,
      minMs: null,
      medianMs: null,
      p95Ms: null,
      maxMs: null
    };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction) => sorted[Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  )];
  return {
    samples: sorted.length,
    minMs: roundMs(sorted[0]),
    medianMs: roundMs(at(0.5)),
    p95Ms: roundMs(at(0.95)),
    maxMs: roundMs(sorted.at(-1))
  };
}

export async function measure(samples, operation) {
  const started = performance.now();
  const result = await operation();
  samples.push(performance.now() - started);
  return result;
}

export const GENERAL_SCANNER_QUERIES = Object.freeze({
  join: `
    SELECT l.security_id, u.PaperNameEng, l.Price
    FROM latest AS l
    JOIN universe AS u ON u.security_id = l.security_id
    WHERE u.is_current = true
    ORDER BY l.security_id
    LIMIT 10
  `,
  groupHaving: `
    SELECT security_id, COUNT(*) AS samples, MAX(Price) AS peak
    FROM history
    GROUP BY security_id
    HAVING COUNT(*) >= 5
    ORDER BY security_id
    LIMIT 10
  `,
  windowRank: `
    SELECT
      security_id,
      DailyVolume,
      RANK() OVER (
        ORDER BY DailyVolume DESC, security_id ASC
      ) AS activity_rank
    FROM latest
    ORDER BY activity_rank, security_id
    LIMIT 10
  `,
  timePredicate: `
    WITH latest_time AS (
      SELECT MAX(collected_at_ms) AS max_collected_at_ms
      FROM history
    )
    SELECT h.security_id, COUNT(*) AS recent_samples
    FROM history AS h
    CROSS JOIN latest_time AS t
    WHERE h.collected_at_ms >= t.max_collected_at_ms - 150000
    GROUP BY h.security_id
    HAVING COUNT(*) > 0
    ORDER BY h.security_id
    LIMIT 10
  `
});

export function stagedScannerSql() {
  const query = MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.find(
    (candidate) => candidate.queryId === "builtin:staged-candidate-ranking"
  );
  assert.ok(query, "Market Flow US staged Scanner built-in is missing");
  return query.sql;
}

export function assertUsGeneratedRow(row) {
  assert.equal(typeof row.PaperId, "number");
  assert.equal(typeof row.Symbol, "string");
  assert.equal(typeof row.PaperNameEng, "string");
  assert.equal(typeof row.ExchangeName, "string");
  assert.ok(row.Price === null || Number.isFinite(row.Price));
  assert.ok(row.DailyVolume === null || Number.isFinite(row.DailyVolume));
  assert.equal(row.CountryId, 2);
  assert.equal(row.PaperType, 1);
}

export function sanitizedFailure(error, tempDir) {
  const rawMessage = typeof error?.message === "string"
    ? error.message
    : "Workload proof failed.";
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: rawMessage.replaceAll(tempDir, "<temp>").slice(0, 500)
  };
}
