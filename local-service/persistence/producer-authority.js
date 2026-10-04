import { randomUUID } from "node:crypto";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

const CONFIG_KEYS = Object.freeze([
  "snapshotIntervalMs",
  "chunkDelayMs",
  "chunkSize",
  "refreshUniverseEveryCycle"
]);

const INTERRUPT_REASONS = new Set([
  "connection_lost",
  "service_shutdown",
  "heartbeat_stale"
]);

function fail(code) {
  throw new ProtocolValidationError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertSafeInteger(value, { min = 0, code = ERROR_CODES.INVALID_MESSAGE } = {}) {
  if (!Number.isSafeInteger(value) || value < min) {
    fail(code);
  }
}

export function sanitizeCollectorConfig(config) {
  if (!isPlainObject(config)) {
    fail(ERROR_CODES.INVALID_MESSAGE);
  }

  const sanitized = {};

  for (const key of CONFIG_KEYS) {
    if (!Object.hasOwn(config, key)) continue;

    const value = config[key];

    if (key === "refreshUniverseEveryCycle") {
      if (typeof value !== "boolean") {
        fail(ERROR_CODES.INVALID_MESSAGE);
      }
    } else if (key === "chunkSize") {
      assertSafeInteger(value, { min: 1 });
    } else {
      assertSafeInteger(value);
    }

    sanitized[key] = value;
  }

  return Object.freeze(sanitized);
}

function validateUniverse(payload) {
  if (!isPlainObject(payload)) {
    fail(ERROR_CODES.UNIVERSE_INVALID);
  }

  assertSafeInteger(payload.loadedAtMs, {
    code: ERROR_CODES.UNIVERSE_INVALID
  });
  assertSafeInteger(payload.recordCount, {
    min: 1,
    code: ERROR_CODES.UNIVERSE_INVALID
  });

  if (!Array.isArray(payload.securities) || payload.securities.length !== payload.recordCount) {
    fail(ERROR_CODES.UNIVERSE_INVALID);
  }

  const seen = new Set();
  const securities = payload.securities.map((security) => {
    if (!isPlainObject(security)) {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }

    const securityId = security.securityId;
    if (typeof securityId !== "string" || securityId.length === 0 || securityId.length > 128) {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }
    if (seen.has(securityId)) {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }
    seen.add(securityId);

    if (security.paperName !== null && typeof security.paperName !== "string") {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }

    if (!Object.hasOwn(security, "mapHeatDateChange")) {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }

    if (!isPlainObject(security.rawMapHeat)) {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }

    const paperId = security.rawMapHeat.PaperId;
    if (paperId === null || paperId === undefined || paperId === "") {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }
    if (String(paperId) !== securityId) {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }

    const dateChangeJson = JSON.stringify(security.mapHeatDateChange);
    const rawMapHeatJson = JSON.stringify(security.rawMapHeat);
    if (dateChangeJson === undefined || rawMapHeatJson === undefined) {
      fail(ERROR_CODES.UNIVERSE_INVALID);
    }

    return Object.freeze({
      securityId,
      paperName: security.paperName,
      mapHeatDateChangeJson: dateChangeJson,
      rawMapHeatJson
    });
  });

  return Object.freeze({
    loadedAtMs: payload.loadedAtMs,
    recordCount: payload.recordCount,
    securities: Object.freeze(securities)
  });
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function assertRunningSession(connection, sessionId) {
  const rows = await queryRows(
    connection,
    "SELECT status FROM sessions WHERE session_id = $sessionId",
    { sessionId }
  );

  if (rows.length !== 1 || rows[0].status !== "running") {
    fail(ERROR_CODES.SESSION_NOT_STARTED);
  }
}

async function rollbackPreservingOriginal(connection) {
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}

export function createProducerPersistence({
  writer,
  now = () => Date.now(),
  createSessionId = () => randomUUID(),
  persistenceFault = null
}) {
  if (!writer || typeof writer.enqueue !== "function") {
    throw new TypeError("serialized writer is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (typeof createSessionId !== "function") {
    throw new TypeError("createSessionId must be a function");
  }

  async function startSession({ producerInstanceId, startedAtMs, config }) {
    if (typeof producerInstanceId !== "string" || producerInstanceId.length === 0) {
      fail(ERROR_CODES.INVALID_MESSAGE);
    }
    assertSafeInteger(startedAtMs);

    const sanitizedConfig = sanitizeCollectorConfig(config);
    const sessionId = createSessionId();
    const acceptedAtMs = now();
    assertSafeInteger(acceptedAtMs);

    await writer.enqueue(async (connection) => {
      await connection.run(
        `INSERT INTO sessions (
          session_id,
          producer_instance_id,
          status,
          started_at_ms,
          stopped_at_ms,
          stop_reason,
          last_heartbeat_at_ms,
          completed_cycles,
          failed_cycles,
          last_completed_cycle_id,
          last_completed_at_ms,
          config_json,
          last_error_json
        ) VALUES (
          $sessionId,
          $producerInstanceId,
          'running',
          $startedAtMs,
          NULL,
          NULL,
          $acceptedAtMs,
          0,
          0,
          NULL,
          NULL,
          $configJson,
          NULL
        )`,
        {
          sessionId,
          producerInstanceId,
          startedAtMs,
          acceptedAtMs,
          configJson: JSON.stringify(sanitizedConfig)
        }
      );
    });

    return Object.freeze({
      sessionId,
      acceptedAtMs
    });
  }

  async function heartbeat({ sessionId }) {
    const acceptedAtMs = now();
    assertSafeInteger(acceptedAtMs);

    await writer.enqueue(async (connection) => {
      await assertRunningSession(connection, sessionId);
      await connection.run(
        `UPDATE sessions
         SET last_heartbeat_at_ms = $acceptedAtMs
         WHERE session_id = $sessionId AND status = 'running'`,
        { sessionId, acceptedAtMs }
      );
    });

    return Object.freeze({ acceptedAtMs });
  }

  async function stopSession({ sessionId, stoppedAtMs, reason }) {
    assertSafeInteger(stoppedAtMs);
    if (typeof reason !== "string" || reason.length === 0 || reason.length > 256) {
      fail(ERROR_CODES.INVALID_MESSAGE);
    }

    await writer.enqueue(async (connection) => {
      await assertRunningSession(connection, sessionId);
      await connection.run(
        `UPDATE sessions
         SET status = 'stopped',
             stopped_at_ms = $stoppedAtMs,
             stop_reason = $reason
         WHERE session_id = $sessionId AND status = 'running'`,
        { sessionId, stoppedAtMs, reason }
      );
    });

    return Object.freeze({
      sessionId,
      status: "stopped"
    });
  }

  async function interruptSession({ sessionId, reason }) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new TypeError("sessionId is required");
    }
    if (!INTERRUPT_REASONS.has(reason)) {
      throw new TypeError("Unsupported producer interruption reason");
    }

    const stoppedAtMs = now();
    assertSafeInteger(stoppedAtMs);

    await writer.enqueue(async (connection) => {
      await connection.run(
        `UPDATE sessions
         SET status = 'interrupted',
             stopped_at_ms = COALESCE(stopped_at_ms, $stoppedAtMs),
             stop_reason = COALESCE(stop_reason, $reason)
         WHERE session_id = $sessionId AND status = 'running'`,
        { sessionId, stoppedAtMs, reason }
      );
    });

    return Object.freeze({
      sessionId,
      status: "interrupted",
      stoppedAtMs,
      reason
    });
  }

  async function replaceUniverse({ sessionId, universe }) {
    return await writer.enqueue(async (connection) => {
      await connection.run("BEGIN TRANSACTION");

      try {
        const validated = validateUniverse(universe);
        await assertRunningSession(connection, sessionId);

        const revisionRows = await queryRows(
          connection,
          "SELECT COALESCE(MAX(universe_revision), 0) AS revision FROM universe"
        );
        const previousRevision = Number(revisionRows[0]?.revision ?? 0);
        if (!Number.isSafeInteger(previousRevision) || previousRevision < 0) {
          throw new Error("Invalid persisted universe revision");
        }
        const universeRevision = previousRevision + 1;

        await connection.run("UPDATE universe SET is_current = false");
        persistenceFault?.hit?.("U1");

        for (let index = 0; index < validated.securities.length; index++) {
          const security = validated.securities[index];

          await connection.run(
            `INSERT INTO universe (
              security_id,
              is_current,
              universe_revision,
              first_seen_at_ms,
              last_seen_at_ms,
              paper_name,
              map_heat_date_change_json,
              raw_map_heat
            ) VALUES (
              $securityId,
              true,
              $universeRevision,
              $loadedAtMs,
              $loadedAtMs,
              $paperName,
              $mapHeatDateChangeJson,
              $rawMapHeatJson
            )
            ON CONFLICT (security_id) DO UPDATE SET
              is_current = true,
              universe_revision = EXCLUDED.universe_revision,
              last_seen_at_ms = EXCLUDED.last_seen_at_ms,
              paper_name = EXCLUDED.paper_name,
              map_heat_date_change_json = EXCLUDED.map_heat_date_change_json,
              raw_map_heat = EXCLUDED.raw_map_heat`,
            {
              securityId: security.securityId,
              universeRevision,
              loadedAtMs: validated.loadedAtMs,
              paperName: security.paperName,
              mapHeatDateChangeJson: security.mapHeatDateChangeJson,
              rawMapHeatJson: security.rawMapHeatJson
            }
          );

          if (index === 0) {
            persistenceFault?.hit?.("U2");
          }
        }

        const currentRows = await queryRows(
          connection,
          "SELECT COUNT(*) AS current_count FROM universe WHERE is_current = true"
        );
        const currentCount = Number(currentRows[0]?.current_count ?? -1);
        if (currentCount !== validated.recordCount) {
          throw new Error(
            `Universe current count mismatch after replace. Expected ${validated.recordCount}, got ${currentCount}.`
          );
        }

        persistenceFault?.hit?.("U3");
        await connection.run("COMMIT");

        return Object.freeze({
          universeRevision,
          recordCount: validated.recordCount
        });
      } catch (error) {
        await rollbackPreservingOriginal(connection);
        throw error;
      }
    });
  }

  return Object.freeze({
    startSession,
    heartbeat,
    stopSession,
    interruptSession,
    replaceUniverse
  });
}
