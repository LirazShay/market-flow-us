import { openDevelopmentResearchSqlSession as openCoreDevelopmentResearchSqlSession } from "./research-sql-session-core.js";

export const DEFAULT_RESEARCH_SQL_TIMEOUT_MS = 60_000;
export const RESEARCH_SQL_TIMEOUT_ENV = "MARKET_FLOW_US_RESEARCH_SQL_TIMEOUT_MS";

function assertPositiveTimeoutMs(value, label) {
  const number = typeof value === "string" && value.trim().length > 0
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
}

export function resolveResearchSqlTimeoutMs(
  explicitTimeoutMs,
  environment = process.env
) {
  if (explicitTimeoutMs !== undefined) {
    return assertPositiveTimeoutMs(explicitTimeoutMs, "sqlTimeoutMs");
  }
  if (environment?.[RESEARCH_SQL_TIMEOUT_ENV] !== undefined) {
    return assertPositiveTimeoutMs(
      environment[RESEARCH_SQL_TIMEOUT_ENV],
      RESEARCH_SQL_TIMEOUT_ENV
    );
  }
  return DEFAULT_RESEARCH_SQL_TIMEOUT_MS;
}

function timeoutError(timeoutMs) {
  const error = new Error(`Research SQL exceeded the ${timeoutMs}ms execution ceiling`);
  error.code = "RESEARCH_SQL_TIMEOUT";
  return error;
}

export async function openDevelopmentResearchSqlSession(options = {}) {
  const timeoutMs = resolveResearchSqlTimeoutMs(options.sqlTimeoutMs);
  const { sqlTimeoutMs: _sqlTimeoutMs, ...coreOptions } = options;
  const session = await openCoreDevelopmentResearchSqlSession(coreOptions);

  return Object.freeze({
    ...session,
    sqlTimeoutMs: timeoutMs,
    async execute(sql) {
      let timedOut = false;
      const error = timeoutError(timeoutMs);
      const timer = setTimeout(() => {
        timedOut = true;
        void session.close().catch(() => undefined);
      }, timeoutMs);
      timer.unref?.();

      try {
        const result = await session.execute(sql);
        if (timedOut) throw error;
        return result;
      } catch (executionError) {
        if (timedOut) throw error;
        throw executionError;
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      await session.close();
    }
  });
}
