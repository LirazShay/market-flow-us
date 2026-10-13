const SIZE_PATTERN = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB)$/iu;
const ALLOWED_KEYS = new Set(["threads", "memoryLimit", "maxTempDirectorySize"]);

export const DEFAULT_RESEARCH_DUCKDB_RESOURCE_LIMITS = Object.freeze({
  threads: 1,
  memoryLimit: "512MB",
  maxTempDirectorySize: "2GB"
});

const ENV_KEYS = Object.freeze({
  threads: "MARKET_FLOW_US_RESEARCH_DUCKDB_THREADS",
  memoryLimit: "MARKET_FLOW_US_RESEARCH_DUCKDB_MEMORY_LIMIT",
  maxTempDirectorySize: "MARKET_FLOW_US_RESEARCH_DUCKDB_MAX_TEMP_DIRECTORY_SIZE"
});

function invalid(message) {
  throw new TypeError(message);
}

function assertSize(value, label) {
  if (typeof value !== "string" || value.length > 32 || !SIZE_PATTERN.test(value)) {
    invalid(`${label} must be a bounded DuckDB byte-size string such as 512MB or 2GB`);
  }
  if (duckDbSizeToBytes(value) < 1) invalid(`${label} must be greater than zero`);
  return value.toUpperCase();
}

function optionalEnv(env, key) {
  const value = env?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function duckDbSizeToBytes(value) {
  if (typeof value !== "string") invalid("DuckDB size must be a string");
  const match = value.trim().match(SIZE_PATTERN);
  if (!match) invalid(`Unsupported DuckDB size value ${value}`);
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) invalid("DuckDB size must be finite and non-negative");
  const unit = match[2].toUpperCase();
  const multipliers = {
    B: 1,
    KB: 1_000,
    MB: 1_000_000,
    GB: 1_000_000_000,
    TB: 1_000_000_000_000,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4
  };
  return amount * multipliers[unit];
}

export function resolveResearchDuckDbResourceLimits(input = undefined, env = process.env) {
  const source = input ?? {};
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    invalid("duckdbResourceLimits must be an object");
  }
  for (const key of Object.keys(source)) {
    if (!ALLOWED_KEYS.has(key)) invalid(`duckdbResourceLimits contains unsupported field ${key}`);
  }

  const rawThreads = source.threads ?? optionalEnv(env, ENV_KEYS.threads) ?? DEFAULT_RESEARCH_DUCKDB_RESOURCE_LIMITS.threads;
  const threads = Number(rawThreads);
  if (!Number.isSafeInteger(threads) || threads < 1 || threads > 64) {
    invalid("duckdbResourceLimits.threads must be an integer between 1 and 64");
  }

  const memoryLimit = assertSize(
    source.memoryLimit ?? optionalEnv(env, ENV_KEYS.memoryLimit) ?? DEFAULT_RESEARCH_DUCKDB_RESOURCE_LIMITS.memoryLimit,
    "duckdbResourceLimits.memoryLimit"
  );
  const maxTempDirectorySize = assertSize(
    source.maxTempDirectorySize
      ?? optionalEnv(env, ENV_KEYS.maxTempDirectorySize)
      ?? DEFAULT_RESEARCH_DUCKDB_RESOURCE_LIMITS.maxTempDirectorySize,
    "duckdbResourceLimits.maxTempDirectorySize"
  );

  return Object.freeze({ threads, memoryLimit, maxTempDirectorySize });
}

export function researchDuckDbConfig(resourceLimits) {
  const limits = resolveResearchDuckDbResourceLimits(resourceLimits, {});
  return Object.freeze({
    threads: String(limits.threads),
    memory_limit: limits.memoryLimit,
    max_temp_directory_size: limits.maxTempDirectorySize
  });
}
