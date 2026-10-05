import {
  BIGINT,
  DOUBLE,
  DuckDBDataChunk,
  INTEGER,
  VARCHAR
} from "@duckdb/node-api";

const BULK_TABLES = new Set(["history", "latest"]);
const DATA_CHUNK_ROWS = 2048;
const BIGINT_PARAMETERS = new Set([
  "cycleId",
  "universeRevision",
  "cycleStartedAtMs",
  "chunkReceivedAtMs",
  "collectedAtMs"
]);
const INTEGER_PARAMETERS = new Set(["chunkIndex"]);
const STRING_PARAMETERS = new Set([
  "sessionId",
  "securityId",
  "serverAsOfDateJson",
  "sourceMetadataJson",
  "Symbol",
  "PaperNameEng",
  "PaperNameHeb",
  "ExchangeName",
  "TradeDateTime",
  "CountryName",
  "CountryNameEng",
  "LastDealTimeOnly",
  "rawDataJson"
]);

function parameterType(name) {
  if (BIGINT_PARAMETERS.has(name)) return BIGINT;
  if (INTEGER_PARAMETERS.has(name)) return INTEGER;
  if (STRING_PARAMETERS.has(name)) return VARCHAR;
  return DOUBLE;
}

function normalizeParameter(name, value) {
  if (value === null || value === undefined) return null;

  if (BIGINT_PARAMETERS.has(name)) {
    if (typeof value === "bigint") return value;
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${name} must be a safe integer for DuckDB BIGINT append.`);
    }
    return BigInt(value);
  }

  if (INTEGER_PARAMETERS.has(name)) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${name} must be a safe integer for DuckDB INTEGER append.`);
    }
    return value;
  }

  if (STRING_PARAMETERS.has(name)) {
    if (typeof value !== "string") {
      throw new TypeError(`${name} must be a string for DuckDB VARCHAR append.`);
    }
    return value;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite for DuckDB DOUBLE append.`);
  }
  return value;
}

function createInsertPlan(sql) {
  if (typeof sql !== "string") return null;

  const match = sql.match(
    /^\s*INSERT\s+INTO\s+(history|latest)\s*\([\s\S]*?\)\s*VALUES\s*\(([\s\S]*?)\)\s*$/i
  );
  if (!match) return null;

  const table = match[1].toLowerCase();
  if (!BULK_TABLES.has(table)) return null;

  const parameterNames = [...match[2].matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((parameter) => parameter[1]);
  if (parameterNames.length === 0) return null;

  return Object.freeze({
    table,
    parameterNames: Object.freeze(parameterNames),
    columnTypes: Object.freeze(parameterNames.map(parameterType)),
    signature: `${table}:${parameterNames.join(",")}`
  });
}

function closeAppenderPreservingOriginal(appender, originalError = null) {
  if (!appender) {
    if (originalError) throw originalError;
    return;
  }

  let error = originalError;
  try {
    appender.closeSync();
  } catch (closeError) {
    if (!error) error = closeError;
  }

  if (error) throw error;
}

function createBulkWriterConnection(connection) {
  if (typeof connection.createAppender !== "function") {
    return {
      connection,
      async flush() {}
    };
  }

  const planCache = new Map();
  let pendingPlan = null;
  let pendingRows = [];

  async function flush() {
    if (!pendingPlan || pendingRows.length === 0) return;

    const plan = pendingPlan;
    const rows = pendingRows;
    pendingPlan = null;
    pendingRows = [];

    const appender = await connection.createAppender(plan.table);
    let error = null;
    try {
      for (let offset = 0; offset < rows.length; offset += DATA_CHUNK_ROWS) {
        const chunk = DuckDBDataChunk.create(plan.columnTypes);
        chunk.setRows(rows.slice(offset, offset + DATA_CHUNK_ROWS));
        appender.appendDataChunk(chunk);
      }
      appender.flushSync();
    } catch (flushError) {
      error = flushError;
    }
    closeAppenderPreservingOriginal(appender, error);
  }

  async function bufferInsert(plan, params) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new TypeError("Bulk market insert parameters must be an object.");
    }

    if (pendingPlan && pendingPlan.signature !== plan.signature) {
      await flush();
    }
    if (!pendingPlan) pendingPlan = plan;

    pendingRows.push(plan.parameterNames.map((name) => {
      if (!Object.hasOwn(params, name)) {
        throw new TypeError(`Bulk market insert is missing parameter ${name}.`);
      }
      return normalizeParameter(name, params[name]);
    }));
  }

  const wrapped = new Proxy(connection, {
    get(target, property, receiver) {
      if (property === "run") {
        return async (sql, params, types) => {
          let plan = planCache.get(sql);
          if (plan === undefined) {
            plan = createInsertPlan(sql) ?? false;
            planCache.set(sql, plan);
          }

          if (plan) {
            await bufferInsert(plan, params);
            return undefined;
          }

          await flush();
          return await target.run(sql, params, types);
        };
      }

      if (property === "runAndReadAll") {
        return async (...args) => {
          await flush();
          return await target.runAndReadAll(...args);
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  return { connection: wrapped, flush };
}

export function createSerializedWriter(connection) {
  if (!connection || typeof connection.run !== "function") {
    throw new TypeError("writer connection is required");
  }

  let tail = Promise.resolve();

  function enqueue(work) {
    if (typeof work !== "function") {
      throw new TypeError("writer work must be a function");
    }

    const run = tail.then(async () => {
      const bulk = createBulkWriterConnection(connection);
      const result = await work(bulk.connection);
      await bulk.flush();
      return result;
    });
    tail = run.catch(() => {});
    return run;
  }

  return Object.freeze({
    enqueue,
    async drain() {
      await tail;
    }
  });
}
