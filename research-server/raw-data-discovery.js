import { describeResearchSqlSchema } from "./research-sql.js";

export const RAW_DATA_DISCOVERY_LIMITS = Object.freeze({
  maxKeys: 100,
  maxKeyCharacters: 256,
  maxSamples: 20,
  maxSampleCharacters: 256
});

function assertExecute(execute) {
  if (typeof execute !== "function") {
    throw new TypeError("research SQL execute function is required");
  }
  return execute;
}

function assertIntegerInRange(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer in ${minimum}..${maximum}`);
  }
  return value;
}

function assertRawKey(value) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > RAW_DATA_DISCOVERY_LIMITS.maxKeyCharacters
    || value.includes("\0")
  ) {
    throw new TypeError(
      `raw-data key must be a non-empty string of at most ${RAW_DATA_DISCOVERY_LIMITS.maxKeyCharacters} characters without NUL`
    );
  }
  return value;
}

function sqlStringLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function safeCount(value, label) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    const parsed = BigInt(value);
    if (parsed <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(parsed);
  }
  throw new Error(`${label} exceeded the safe integer result boundary`);
}

function booleanValue(value, label) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0") return false;
  if (value === 1 || value === "1") return true;
  throw new Error(`${label} was not a boolean result`);
}

function historyTypedField(key) {
  const history = describeResearchSqlSchema().relations.find(
    (relation) => relation.relation === "research_history"
  );
  return history?.fields.find(
    (field) => field.column === key && field.origin === "source_typed"
  ) ?? null;
}

function typeCountsFromRows(rows, keyIndex = 0, countIndex = 1) {
  return rows.map((row) => Object.freeze({
    type: row[keyIndex],
    count: safeCount(row[countIndex], "raw-data type count")
  }));
}

function freezeKeys(keys) {
  return Object.freeze(keys.map((entry) => Object.freeze({
    ...entry,
    typeCounts: Object.freeze(entry.typeCounts)
  })));
}

export function createResearchRawDataDiscovery({ execute } = {}) {
  const run = assertExecute(execute);

  async function listRawDataKeys({ limit = 50 } = {}) {
    const boundedLimit = assertIntegerInRange(
      limit,
      "raw-data key limit",
      1,
      RAW_DATA_DISCOVERY_LIMITS.maxKeys
    );
    const queryLimit = boundedLimit + 1;

    const summary = await run(`
      SELECT
        (SELECT COUNT(*) FROM research_history) AS total_rows,
        COUNT(*) FILTER (
          WHERE entry.key IS NULL
             OR length(entry.key) < 1
             OR length(entry.key) > ${RAW_DATA_DISCOVERY_LIMITS.maxKeyCharacters}
        ) AS excluded_key_occurrences
      FROM research_history AS history
      CROSS JOIN LATERAL json_each(history.raw_data) AS entry
    `);
    const totalRows = safeCount(summary.rows[0][0], "raw-data total row count");
    const excludedKeyOccurrences = safeCount(
      summary.rows[0][1],
      "raw-data excluded key occurrence count"
    );

    const result = await run(`
      WITH expanded AS (
        SELECT entry.key AS raw_key, entry.type AS raw_type
        FROM research_history AS history
        CROSS JOIN LATERAL json_each(history.raw_data) AS entry
        WHERE entry.key IS NOT NULL
          AND length(entry.key) BETWEEN 1 AND ${RAW_DATA_DISCOVERY_LIMITS.maxKeyCharacters}
      ),
      ranked_keys AS (
        SELECT raw_key, COUNT(*) AS present_count
        FROM expanded
        GROUP BY raw_key
        ORDER BY present_count DESC, raw_key ASC
        LIMIT ${queryLimit}
      )
      SELECT
        ranked.raw_key,
        ranked.present_count,
        expanded.raw_type,
        COUNT(*) AS type_count
      FROM ranked_keys AS ranked
      JOIN expanded ON expanded.raw_key = ranked.raw_key
      GROUP BY ranked.raw_key, ranked.present_count, expanded.raw_type
      ORDER BY ranked.present_count DESC, ranked.raw_key ASC, expanded.raw_type ASC
    `);

    const grouped = [];
    let current = null;
    for (const row of result.rows) {
      const key = row[0];
      if (!current || current.key !== key) {
        current = {
          key,
          presentRows: safeCount(row[1], "raw-data key presence count"),
          typeCounts: []
        };
        grouped.push(current);
      }
      current.typeCounts.push(Object.freeze({
        type: row[2],
        count: safeCount(row[3], "raw-data key type count")
      }));
    }

    const truncated = grouped.length > boundedLimit;
    const keys = grouped.slice(0, boundedLimit).map((entry) => ({
      ...entry,
      coverageFraction: totalRows === 0 ? null : entry.presentRows / totalRows
    }));

    return Object.freeze({
      scope: "research_history.raw_data:top_level",
      totalRows,
      limit: boundedLimit,
      maxKeyCharacters: RAW_DATA_DISCOVERY_LIMITS.maxKeyCharacters,
      excludedKeyOccurrences,
      truncated,
      keys: freezeKeys(keys)
    });
  }

  async function profileRawDataKey({ key, sampleLimit = 5 } = {}) {
    const boundedKey = assertRawKey(key);
    const boundedSampleLimit = assertIntegerInRange(
      sampleLimit,
      "raw-data sample limit",
      0,
      RAW_DATA_DISCOVERY_LIMITS.maxSamples
    );
    const keyLiteral = sqlStringLiteral(boundedKey);

    const summary = await run(`
      WITH matched AS (
        SELECT entry.type AS raw_type
        FROM research_history AS history
        CROSS JOIN LATERAL json_each(history.raw_data) AS entry
        WHERE entry.key = ${keyLiteral}
      )
      SELECT
        (SELECT COUNT(*) FROM research_history) AS total_rows,
        COUNT(*) AS present_rows,
        COUNT(*) FILTER (WHERE raw_type = 'NULL') AS null_rows
      FROM matched
    `);
    const totalRows = safeCount(summary.rows[0][0], "raw-data profile total row count");
    const presentRows = safeCount(summary.rows[0][1], "raw-data profile presence count");
    const nullRows = safeCount(summary.rows[0][2], "raw-data profile null count");

    const typesResult = await run(`
      SELECT entry.type AS raw_type, COUNT(*) AS type_count
      FROM research_history AS history
      CROSS JOIN LATERAL json_each(history.raw_data) AS entry
      WHERE entry.key = ${keyLiteral}
      GROUP BY entry.type
      ORDER BY entry.type ASC
    `);

    const typedField = historyTypedField(boundedKey);
    let typedComparison = null;
    if (typedField) {
      const identifier = quoteIdentifier(typedField.column);
      const typedResult = await run(`
        SELECT
          COUNT(*) FILTER (WHERE ${identifier} IS NOT NULL) AS non_null_rows,
          COUNT(*) FILTER (WHERE ${identifier} IS NULL) AS null_rows
        FROM research_history
      `);
      typedComparison = Object.freeze({
        column: typedField.column,
        nonNullRows: safeCount(typedResult.rows[0][0], "typed comparison non-null count"),
        nullRows: safeCount(typedResult.rows[0][1], "typed comparison null count")
      });
    }

    let samples = [];
    if (boundedSampleLimit > 0) {
      const sampleResult = await run(`
        SELECT
          history.source_id,
          history.cycle_id,
          history.security_id,
          history.collected_at_ms,
          history.cycle_committed_at_ms,
          entry.type AS raw_type,
          substr(CAST(entry.value AS VARCHAR), 1, ${RAW_DATA_DISCOVERY_LIMITS.maxSampleCharacters}) AS value_json,
          length(CAST(entry.value AS VARCHAR)) > ${RAW_DATA_DISCOVERY_LIMITS.maxSampleCharacters} AS value_truncated
        FROM research_history AS history
        CROSS JOIN LATERAL json_each(history.raw_data) AS entry
        WHERE entry.key = ${keyLiteral}
        ORDER BY
          history.source_id ASC,
          history.cycle_committed_at_ms ASC,
          history.cycle_id ASC,
          history.security_id ASC
        LIMIT ${boundedSampleLimit}
      `);
      samples = sampleResult.rows.map((row) => Object.freeze({
        sourceId: row[0],
        cycleId: row[1],
        securityId: row[2],
        collectedAtMs: row[3],
        cycleCommittedAtMs: row[4],
        rawType: row[5],
        valueJson: row[6],
        valueTruncated: booleanValue(row[7], "raw-data sample truncation flag")
      }));
    }

    return Object.freeze({
      scope: "research_history.raw_data:top_level",
      key: boundedKey,
      totalRows,
      presentRows,
      missingRows: totalRows - presentRows,
      nullRows,
      coverageFraction: totalRows === 0 ? null : presentRows / totalRows,
      typeCounts: Object.freeze(typeCountsFromRows(typesResult.rows)),
      typedComparison,
      sampleLimit: boundedSampleLimit,
      maxSampleCharacters: RAW_DATA_DISCOVERY_LIMITS.maxSampleCharacters,
      samples: Object.freeze(samples)
    });
  }

  return Object.freeze({
    listRawDataKeys,
    profileRawDataKey
  });
}
