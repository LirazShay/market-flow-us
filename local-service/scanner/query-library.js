import { randomUUID } from "node:crypto";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";
import {
  builtinNameKeys,
  mergeScannerQueryLibrary,
  isBuiltinQueryId,
  normalizeScannerQueryNameKey
} from "../../shared/scanner/builtins.js";

function fail(code) {
  throw new ProtocolValidationError(code);
}

function assertSafePositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(ERROR_CODES.INVALID_MESSAGE);
  }
}

function assertSql(sql) {
  if (typeof sql !== "string") {
    fail(ERROR_CODES.INVALID_MESSAGE);
  }
}

function assertUserQueryId(queryId) {
  if (typeof queryId !== "string" || queryId.length === 0 || queryId.length > 128) {
    fail(ERROR_CODES.INVALID_MESSAGE);
  }
  if (isBuiltinQueryId(queryId)) {
    fail(ERROR_CODES.SCANNER_QUERY_READ_ONLY);
  }
}

export function normalizeSavedQueryName(value) {
  if (typeof value !== "string") {
    fail(ERROR_CODES.INVALID_MESSAGE);
  }

  const name = value.normalize("NFKC").trim();
  if (name.length === 0 || [...name].length > 120) {
    fail(ERROR_CODES.INVALID_MESSAGE);
  }

  return Object.freeze({
    name,
    nameKey: normalizeScannerQueryNameKey(name)
  });
}

function toSafeNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error("Persisted saved-query integer is invalid");
  }
  return number;
}

function shapeUserQuery(row) {
  return Object.freeze({
    queryId: String(row.query_id),
    source: "user",
    name: String(row.name),
    sql: String(row.sql_text),
    intervalMs: toSafeNumber(row.interval_ms),
    editable: true,
    deletable: true,
    createdAtMs: toSafeNumber(row.created_at_ms),
    updatedAtMs: toSafeNumber(row.updated_at_ms)
  });
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function rollbackPreservingOriginal(connection) {
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Preserve the original CRUD error.
  }
}

export function createSavedQueryLibrary({
  writer,
  readConnection,
  now = () => Date.now(),
  createQueryId = () => `user:${randomUUID()}`,
  persistenceFault = null
}) {
  if (!writer || typeof writer.enqueue !== "function") {
    throw new TypeError("serialized writer is required");
  }
  if (!readConnection || typeof readConnection.runAndReadAll !== "function") {
    throw new TypeError("saved-query read connection is required");
  }

  const reservedNameKeys = builtinNameKeys();

  function validateDraft({ name, sql, intervalMs }) {
    const normalized = normalizeSavedQueryName(name);
    assertSql(sql);
    assertSafePositiveInteger(intervalMs);

    if (reservedNameKeys.has(normalized.nameKey)) {
      fail(ERROR_CODES.SCANNER_QUERY_NAME_CONFLICT);
    }

    return {
      ...normalized,
      sql,
      intervalMs
    };
  }

  async function assertNameAvailable(connection, nameKey, exceptQueryId = null) {
    const rows = exceptQueryId === null
      ? await queryRows(
        connection,
        "SELECT query_id FROM scanner_saved_queries WHERE name_key = $nameKey LIMIT 1",
        { nameKey }
      )
      : await queryRows(
        connection,
        `SELECT query_id
         FROM scanner_saved_queries
         WHERE name_key = $nameKey AND query_id <> $queryId
         LIMIT 1`,
        { nameKey, queryId: exceptQueryId }
      );

    if (rows.length > 0) {
      fail(ERROR_CODES.SCANNER_QUERY_NAME_CONFLICT);
    }
  }

  async function userRow(connection, queryId) {
    const rows = await queryRows(
      connection,
      `SELECT query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
       FROM scanner_saved_queries
       WHERE query_id = $queryId`,
      { queryId }
    );
    return rows[0] ?? null;
  }

  async function list() {
    const rows = await queryRows(
      readConnection,
      `SELECT query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
       FROM scanner_saved_queries
       ORDER BY name_key, query_id`
    );

    return Object.freeze({
      queries: mergeScannerQueryLibrary(rows.map(shapeUserQuery))
    });
  }

  async function create({ name, sql, intervalMs }) {
    const draft = validateDraft({ name, sql, intervalMs });
    const queryId = createQueryId();
    if (typeof queryId !== "string" || !queryId.startsWith("user:") || queryId.length > 128) {
      throw new TypeError("createQueryId must return a user: query ID");
    }

    const atMs = now();
    if (!Number.isSafeInteger(atMs) || atMs < 0) {
      throw new TypeError("now must return a non-negative safe integer");
    }

    return await writer.enqueue(async (connection) => {
      await connection.run("BEGIN TRANSACTION");
      try {
        await assertNameAvailable(connection, draft.nameKey);
        await connection.run(
          `INSERT INTO scanner_saved_queries (
            query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
          ) VALUES (
            $queryId, $name, $nameKey, $sql, $intervalMs, $atMs, $atMs
          )`,
          {
            queryId,
            name: draft.name,
            nameKey: draft.nameKey,
            sql: draft.sql,
            intervalMs: draft.intervalMs,
            atMs
          }
        );
        persistenceFault?.hit?.("Q1");
        await connection.run("COMMIT");

        return Object.freeze({
          query: shapeUserQuery({
            query_id: queryId,
            name: draft.name,
            sql_text: draft.sql,
            interval_ms: draft.intervalMs,
            created_at_ms: atMs,
            updated_at_ms: atMs
          })
        });
      } catch (error) {
        await rollbackPreservingOriginal(connection);
        throw error;
      }
    });
  }

  async function update({ queryId, name, sql, intervalMs }) {
    assertUserQueryId(queryId);
    const draft = validateDraft({ name, sql, intervalMs });
    const updatedAtMs = now();
    if (!Number.isSafeInteger(updatedAtMs) || updatedAtMs < 0) {
      throw new TypeError("now must return a non-negative safe integer");
    }

    return await writer.enqueue(async (connection) => {
      await connection.run("BEGIN TRANSACTION");
      try {
        const existing = await userRow(connection, queryId);
        if (!existing) fail(ERROR_CODES.NOT_FOUND);

        await assertNameAvailable(connection, draft.nameKey, queryId);
        await connection.run(
          `UPDATE scanner_saved_queries
           SET name = $name,
               name_key = $nameKey,
               sql_text = $sql,
               interval_ms = $intervalMs,
               updated_at_ms = $updatedAtMs
           WHERE query_id = $queryId`,
          {
            queryId,
            name: draft.name,
            nameKey: draft.nameKey,
            sql: draft.sql,
            intervalMs: draft.intervalMs,
            updatedAtMs
          }
        );
        persistenceFault?.hit?.("Q2");
        await connection.run("COMMIT");

        return Object.freeze({
          query: shapeUserQuery({
            query_id: queryId,
            name: draft.name,
            sql_text: draft.sql,
            interval_ms: draft.intervalMs,
            created_at_ms: existing.created_at_ms,
            updated_at_ms: updatedAtMs
          })
        });
      } catch (error) {
        await rollbackPreservingOriginal(connection);
        throw error;
      }
    });
  }

  async function remove({ queryId }) {
    assertUserQueryId(queryId);

    return await writer.enqueue(async (connection) => {
      await connection.run("BEGIN TRANSACTION");
      try {
        const existing = await userRow(connection, queryId);
        if (!existing) fail(ERROR_CODES.NOT_FOUND);

        await connection.run(
          "DELETE FROM scanner_saved_queries WHERE query_id = $queryId",
          { queryId }
        );
        persistenceFault?.hit?.("Q3");
        await connection.run("COMMIT");

        return Object.freeze({ queryId });
      } catch (error) {
        await rollbackPreservingOriginal(connection);
        throw error;
      }
    });
  }

  return Object.freeze({
    list,
    create,
    update,
    delete: remove
  });
}
