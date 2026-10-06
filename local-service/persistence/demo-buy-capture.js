import {
  deriveDemoBuyCaptureTiming,
  validateDemoBuyCapturePayload
} from "../../shared/demo-buy/capture.js";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

function fail(code) {
  throw new ProtocolValidationError(code);
}

function assertSafeInteger(value, name, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new TypeError(`${name} is invalid.`);
  }
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
    // Preserve the original transaction error.
  }
}

function mapLatestRows(rows) {
  const bySecurityId = new Map();
  for (const row of rows) {
    const securityId = String(row.security_id ?? "");
    const cycleId = Number(row.cycle_id);
    const collectedAtMs = Number(row.collected_at_ms);

    if (securityId.length === 0 || bySecurityId.has(securityId)) {
      throw new Error("Persisted latest identity authority is invalid.");
    }
    assertSafeInteger(cycleId, "Persisted latest cycle ID", { min: 1 });
    assertSafeInteger(collectedAtMs, "Persisted latest collected_at_ms");

    bySecurityId.set(securityId, Object.freeze({
      securityId,
      cycleId,
      collectedAtMs
    }));
  }
  return bySecurityId;
}

async function allocateCaptureId(connection) {
  const rows = await queryRows(
    connection,
    "SELECT COALESCE(MAX(capture_id), 0) AS capture_id FROM demo_buy_captures"
  );
  if (rows.length !== 1) {
    throw new Error("Demo Buy capture ID allocation returned an invalid result.");
  }
  const previous = Number(rows[0]?.capture_id ?? 0);
  assertSafeInteger(previous, "Persisted Demo Buy capture ID");
  const next = previous + 1;
  assertSafeInteger(next, "Allocated Demo Buy capture ID", { min: 1 });
  return next;
}

const INSERT_ITEM_SQL = `INSERT INTO demo_buy_items (
  capture_id,
  result_rank,
  security_id,
  buy_cycle_id
) VALUES (
  $captureId,
  $resultRank,
  $securityId,
  $buyCycleId
)`;

export function createDemoBuyCapturePersistence({
  writer,
  now = () => Date.now(),
  persistenceFault = null
}) {
  if (!writer || typeof writer.enqueue !== "function") {
    throw new TypeError("serialized writer is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  async function capture(payload) {
    const validated = validateDemoBuyCapturePayload(payload);

    return await writer.enqueue(async (connection) => {
      await connection.run("BEGIN TRANSACTION");
      try {
        const capturedAtMs = now();
        assertSafeInteger(capturedAtMs, "Demo Buy capturedAtMs");

        const latestRows = await queryRows(
          connection,
          `SELECT security_id, cycle_id, collected_at_ms
           FROM latest`
        );
        const latestBySecurityId = mapLatestRows(latestRows);

        const resolvedItems = validated.items.map((item) => {
          const baseline = latestBySecurityId.get(item.securityId);
          if (!baseline) fail(ERROR_CODES.NOT_FOUND);
          return Object.freeze({
            ...item,
            buyCycleId: baseline.cycleId,
            baselineCollectedAtMs: baseline.collectedAtMs
          });
        });

        const captureId = await allocateCaptureId(connection);
        await connection.run(
          `INSERT INTO demo_buy_captures (
            capture_id,
            captured_at_ms,
            source_query_id,
            source_query_name,
            source_query_sql,
            source_interval_ms,
            source_result_started_at_ms,
            source_result_completed_at_ms,
            source_result_row_count,
            source_result_context_json,
            selection_mode,
            is_automatic,
            top_x
          ) VALUES (
            $captureId,
            $capturedAtMs,
            $sourceQueryId,
            $sourceQueryName,
            $sourceQuerySql,
            $sourceIntervalMs,
            $sourceResultStartedAtMs,
            $sourceResultCompletedAtMs,
            $sourceResultRowCount,
            $sourceResultContextJson,
            $selectionMode,
            $isAutomatic,
            $topX
          )`,
          {
            captureId,
            capturedAtMs,
            sourceQueryId: validated.sourceQuery.queryId,
            sourceQueryName: validated.sourceQuery.name,
            sourceQuerySql: validated.sourceQuery.sql,
            sourceIntervalMs: validated.sourceQuery.intervalMs,
            sourceResultStartedAtMs: validated.sourceResult.startedAtMs,
            sourceResultCompletedAtMs: validated.sourceResult.completedAtMs,
            sourceResultRowCount: validated.sourceResult.rowCount,
            sourceResultContextJson: validated.sourceResult.contextJson,
            selectionMode: validated.selectionMode,
            isAutomatic: validated.isAutomatic,
            topX: validated.topX
          }
        );

        persistenceFault?.hit?.("DEMO_BUY_AFTER_CAPTURE_HEADER");

        for (let index = 0; index < resolvedItems.length; index += 1) {
          const item = resolvedItems[index];
          await connection.run(INSERT_ITEM_SQL, {
            captureId,
            resultRank: item.resultRank,
            securityId: item.securityId,
            buyCycleId: item.buyCycleId
          });
          if (index === 0) {
            persistenceFault?.hit?.("DEMO_BUY_AFTER_FIRST_ITEM");
          }
        }

        persistenceFault?.hit?.("DEMO_BUY_BEFORE_COMMIT");
        await connection.run("COMMIT");

        const timingAnomalies = new Set();
        for (const item of resolvedItems) {
          const timing = deriveDemoBuyCaptureTiming({
            sourceResultStartedAtMs: validated.sourceResult.startedAtMs,
            sourceResultCompletedAtMs: validated.sourceResult.completedAtMs,
            capturedAtMs,
            baselineCollectedAtMs: item.baselineCollectedAtMs
          });
          if (timing.timingAnomaly !== null) {
            for (const anomaly of timing.timingAnomaly.split("|")) {
              timingAnomalies.add(anomaly);
            }
          }
        }

        return Object.freeze({
          captureId,
          capturedAtMs,
          capturedItemCount: resolvedItems.length,
          timingAnomaly: timingAnomalies.size === 0
            ? null
            : [...timingAnomalies].sort().join("|")
        });
      } catch (error) {
        await rollbackPreservingOriginal(connection);
        throw error;
      }
    });
  }

  return Object.freeze({ capture });
}
