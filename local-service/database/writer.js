const BULK_TABLES = new Set(["history", "latest"]);
const BIGINT_PARAMETERS = new Set([
  "cycleId",
  "universeRevision",
  "cycleStartedAtMs",
  "chunkReceivedAtMs",
  "collectedAtMs"
]);
const INTEGER_PARAMETERS = new Set(["chunkIndex"]);

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
    parameterNames: Object.freeze(parameterNames)
  });
}

function appendParameter(appender, name, value) {
  if (value === null || value === undefined) {
    appender.appendNull();
    return;
  }

  if (BIGINT_PARAMETERS.has(name)) {
    if (!Number.isSafeInteger(value) && typeof value !== "bigint") {
      throw new TypeError(`${name} must be a safe integer for DuckDB BIGINT append.`);
    }
    appender.appendBigInt(typeof value === "bigint" ? value : BigInt(value));
    return;
  }

  if (INTEGER_PARAMETERS.has(name)) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${name} must be a safe integer for DuckDB INTEGER append.`);
    }
    appender.appendInteger(value);
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${name} must be finite for DuckDB DOUBLE append.`);
    }
    appender.appendDouble(value);
    return;
  }

  if (typeof value === "string") {
    appender.appendVarchar(value);
    return;
  }

  if (typeof value === "bigint") {
    appender.appendBigInt(value);
    return;
  }

  if (typeof value === "boolean") {
    appender.appendBoolean(value);
    return;
  }

  throw new TypeError(`Unsupported DuckDB appender value for ${name}.`);
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
  let activeAppender = null;
  let activeTable = null;

  async function flush() {
    if (!activeAppender) return;

    const appender = activeAppender;
    activeAppender = null;
    activeTable = null;

    let error = null;
    try {
      appender.flushSync();
    } catch (flushError) {
      error = flushError;
    }
    closeAppenderPreservingOriginal(appender, error);
  }

  async function appendInsert(plan, params) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new TypeError("Bulk market insert parameters must be an object.");
    }

    if (activeAppender && activeTable !== plan.table) {
      await flush();
    }
    if (!activeAppender) {
      activeAppender = await connection.createAppender(plan.table);
      activeTable = plan.table;
    }

    try {
      for (const name of plan.parameterNames) {
        if (!Object.hasOwn(params, name)) {
          throw new TypeError(`Bulk market insert is missing parameter ${name}.`);
        }
        appendParameter(activeAppender, name, params[name]);
      }
      activeAppender.endRow();
    } catch (error) {
      const appender = activeAppender;
      activeAppender = null;
      activeTable = null;
      closeAppenderPreservingOriginal(appender, error);
    }
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
            await appendInsert(plan, params);
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
