import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { REQUIRED_TABLES } from "../../local-service/database/schema.js";
import { BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

const GUIDE_PATH = fileURLToPath(
  new URL("../../docs/SCANNER_SQL_GUIDE.md", import.meta.url)
);

function extractTextManifest(guide, startMarker, endMarker) {
  const start = guide.indexOf(startMarker);
  const end = guide.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing guide marker ${startMarker}`);
  assert.notEqual(end, -1, `Missing guide marker ${endMarker}`);

  return guide
    .slice(start + startMarker.length, end)
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseSchemaColumnsManifest(guide) {
  const lines = extractTextManifest(
    guide,
    "SCANNER_SCHEMA_MANIFEST_V2",
    "END_SCANNER_SCHEMA_MANIFEST_V2"
  );
  const result = new Map();

  for (const line of lines) {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `Invalid schema manifest line: ${line}`);
    const table = line.slice(0, separator).trim();
    const columns = line
      .slice(separator + 1)
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    assert.equal(result.has(table), false, `Duplicate schema table ${table}`);
    result.set(table, columns);
  }

  return result;
}

function parseSchemaTypesManifest(guide) {
  const lines = extractTextManifest(
    guide,
    "SCANNER_SCHEMA_TYPES_V2",
    "END_SCANNER_SCHEMA_TYPES_V2"
  );

  return lines.map((line) => {
    const [qualifiedName, dataType, nullable] = line.split("|");
    assert.ok(qualifiedName?.includes("."), `Invalid schema type line: ${line}`);
    assert.ok(dataType, `Missing data type: ${line}`);
    assert.match(nullable ?? "", /^(YES|NO)$/);

    const dot = qualifiedName.indexOf(".");
    return {
      tableName: qualifiedName.slice(0, dot),
      columnName: qualifiedName.slice(dot + 1),
      dataType,
      nullable
    };
  });
}

function parseBuiltinManifest(guide) {
  return extractTextManifest(
    guide,
    "SCANNER_BUILTIN_MANIFEST_V1",
    "END_SCANNER_BUILTIN_MANIFEST_V1"
  ).map((line) => {
    const [queryId, name, intervalMsRaw] = line.split("|");
    const intervalMs = Number(intervalMsRaw);
    assert.ok(queryId);
    assert.ok(name);
    assert.ok(Number.isSafeInteger(intervalMs) && intervalMs > 0);
    return { queryId, name, intervalMs };
  });
}

function executableExamples(guide) {
  const pattern = /<!-- scanner-executable:([a-z0-9-]+) -->\s*```sql\s*([\s\S]*?)```/g;
  const examples = [];
  for (const match of guide.matchAll(pattern)) {
    examples.push({
      id: match[1],
      sql: match[2].trim()
    });
  }
  return examples;
}

function sortedSchemaRows(rows) {
  return rows
    .map((row) => ({
      tableName: String(row.tableName ?? row.table_name),
      columnName: String(row.columnName ?? row.column_name),
      dataType: String(row.dataType ?? row.data_type),
      nullable: String(row.nullable ?? row.is_nullable)
    }))
    .sort((left, right) => {
      const table = left.tableName < right.tableName ? -1 : left.tableName > right.tableName ? 1 : 0;
      if (table !== 0) return table;
      return left.columnName < right.columnName ? -1 : left.columnName > right.columnName ? 1 : 0;
    });
}

async function seedAuthority(fixture) {
  const writer = fixture.service.database.writerConnection;

  await writer.run(`
    INSERT INTO sessions (
      session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
      stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
      last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
    ) VALUES (
      'scanner-session', 'scanner-producer', 'stopped', 1000, 3000,
      'test', 3000, 2, 0, 2, 2200, '{}', NULL
    )
  `);

  await writer.run(`
    INSERT INTO universe (
      security_id, is_current, universe_revision, first_seen_at_ms,
      last_seen_at_ms, paper_name, map_heat_date_change_json, raw_map_heat
    ) VALUES
      ('1001', true, 1, 1000, 2200, 'Alpha', NULL, '{"PaperId":1001}'),
      ('1002', true, 1, 1000, 2200, 'Beta', NULL, '{"PaperId":1002}')
  `);

  await writer.run(`
    INSERT INTO cycles (
      cycle_id, session_id, universe_revision, status, started_at_ms,
      completed_at_ms, committed_at_ms, duration_ms, requested, received,
      unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
      failure_phase, error_json
    ) VALUES
      (1, 'scanner-session', 1, 'complete', 1900, 2000, 2000, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
      (2, 'scanner-session', 1, 'complete', 2100, 2200, 2200, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL)
  `);

  await writer.run(`
    INSERT INTO history (
      cycle_id, session_id, universe_revision, security_id, chunk_index,
      cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      LastKnownRate, BaseRateChangePercentage, BuyLimit1, BuyVolume1,
      SellLimit1, SellVolume1, DailyDealsQuantity, LastDealVolume,
      DailyTurnover, DailyNISRevenue, DailyLowestRate, DailyHighestRate,
      LastDealTimeOnly, raw_data
    ) VALUES
      (1, 'scanner-session', 1, '1001', 0, 1900, 1990, 2000, 100, 1, 99, 10, 101, 11, 8, 1, 1000, 10000, 95, 105, '10:00:00', '{}'),
      (1, 'scanner-session', 1, '1002', 0, 1900, 1990, 2000, 200, 2, 199, 12, 201, 13, 9, 2, 2000, 20000, 190, 205, '10:00:01', '{}'),
      (2, 'scanner-session', 1, '1001', 0, 2100, 2190, 2200, 110, 3, 109, 14, 111, 15, 10, 3, 3000, 30000, 95, 115, '10:00:02', '{}'),
      (2, 'scanner-session', 1, '1002', 0, 2100, 2190, 2200, 190, -1, 189, 16, 191, 17, 11, 4, 4000, 40000, 185, 205, '10:00:03', '{}')
  `);

  await writer.run(`
    INSERT INTO latest
    SELECT * FROM history WHERE cycle_id = 2
  `);
}

async function authorityFingerprint(fixture) {
  const tables = ["schema_info", "sessions", "universe", "cycles", "history", "latest"];
  const snapshot = {
    schema: await fixture.rows(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'main'
        AND table_name IN ('schema_info', 'sessions', 'universe', 'cycles', 'history', 'latest')
      ORDER BY table_name, ordinal_position
    `),
    sequences: await fixture.rows(`
      SELECT sequence_name
      FROM duckdb_sequences()
      ORDER BY sequence_name
    `)
  };

  for (const table of tables) {
    snapshot[table] = await fixture.rows(`SELECT * FROM ${table} ORDER BY ALL`);
  }

  return JSON.stringify(snapshot);
}

test("scanner executes broad admitted analytical SELECTs with exact columns and row order", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    await seedAuthority(fixture);
    const viewer = await fixture.connect("viewer", "scanner-positive");

    const simple = await viewer.request("scanner.execute", {
      sql: "SELECT 42 AS answer"
    });
    assert.equal(simple.type, "response.ok");
    assert.deepEqual(simple.payload.data.columns, [{ name: "answer", type: "INTEGER" }]);
    assert.deepEqual(simple.payload.data.rows, [[42]]);
    assert.equal(simple.payload.data.rowCount, 1);
    assert.equal(simple.payload.data.startedAtMs, 5000);
    assert.equal(simple.payload.data.completedAtMs, 5000);
    assert.equal(simple.payload.data.durationMs, 0);

    const joined = await viewer.request("scanner.execute", {
      sql: `
        SELECT u.security_id, u.paper_name, l.LastKnownRate
        FROM latest AS l
        JOIN universe AS u ON u.security_id = l.security_id
        WHERE l.LastKnownRate >= 100
        ORDER BY l.LastKnownRate DESC
        LIMIT 2
      `
    });
    assert.equal(joined.type, "response.ok");
    assert.deepEqual(joined.payload.data.rows, [
      ["1002", "Beta", 190],
      ["1001", "Alpha", 110]
    ]);

    const grouped = await viewer.request("scanner.execute", {
      sql: `
        SELECT security_id, COUNT(*) AS samples, MAX(LastKnownRate) AS peak
        FROM history
        GROUP BY security_id
        HAVING COUNT(*) >= 2
        ORDER BY peak DESC
      `
    });
    assert.equal(grouped.type, "response.ok");
    assert.deepEqual(grouped.payload.data.rows, [
      ["1002", "2", 200],
      ["1001", "2", 110]
    ]);

    const ranked = await viewer.request("scanner.execute", {
      sql: `
        SELECT security_id, collected_at_ms,
               RANK() OVER (PARTITION BY security_id ORDER BY collected_at_ms DESC) AS recency_rank
        FROM history
        WHERE collected_at_ms >= 2000
        ORDER BY security_id, collected_at_ms DESC
      `
    });
    assert.equal(ranked.type, "response.ok");
    assert.deepEqual(ranked.payload.data.rows, [
      ["1001", "2200", "1"],
      ["1001", "2000", "2"],
      ["1002", "2200", "1"],
      ["1002", "2000", "2"]
    ]);

    const temporal = await viewer.request("scanner.execute", {
      sql: "SELECT DATE '2026-09-27' + INTERVAL 1 DAY AS next_day"
    });
    assert.equal(temporal.type, "response.ok");
    assert.deepEqual(temporal.payload.data.columns, [
      { name: "next_day", type: "TIMESTAMP" }
    ]);
    assert.equal(temporal.payload.data.rowCount, 1);

    const duplicateColumns = await viewer.request("scanner.execute", {
      sql: "SELECT 1 AS duplicate, 2 AS duplicate"
    });
    assert.equal(duplicateColumns.type, "response.ok");
    assert.deepEqual(duplicateColumns.payload.data.columns, [
      { name: "duplicate", type: "INTEGER" },
      { name: "duplicate", type: "INTEGER" }
    ]);
    assert.deepEqual(duplicateColumns.payload.data.rows, [[1, 2]]);

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("scanner rejects non-read-only or unsafe SQL and preserves authority for every rejection", async () => {
  const fixture = await createServiceFixture();

  try {
    await seedAuthority(fixture);
    await fixture.service.database.writerConnection.run("CREATE SEQUENCE scanner_guard_sequence START 7");
    const viewer = await fixture.connect("viewer", "scanner-negative");

    const cases = [
      ["   ", "SCANNER_EMPTY_SQL"],
      ["SELECT 1; SELECT 2", "SCANNER_MULTIPLE_STATEMENTS"],
      ["INSERT INTO universe (security_id) VALUES ('x')", "SCANNER_NON_SELECT"],
      ["UPDATE universe SET paper_name = 'changed'", "SCANNER_NON_SELECT"],
      ["DELETE FROM universe", "SCANNER_NON_SELECT"],
      ["CREATE TABLE scanner_bad(i INTEGER)", "SCANNER_NON_SELECT"],
      ["DROP TABLE latest", "SCANNER_NON_SELECT"],
      ["ALTER TABLE universe ADD COLUMN scanner_bad INTEGER", "SCANNER_NON_SELECT"],
      ["SELECT $1", "SCANNER_PARAMETERS_UNSUPPORTED"],
      ["SELECT * FROM query('SELECT 1')", "SCANNER_FORBIDDEN_FUNCTION"],
      ["SELECT * FROM query_table('latest')", "SCANNER_FORBIDDEN_FUNCTION"],
      ["SELECT nextval('scanner_guard_sequence')", "SCANNER_FORBIDDEN_FUNCTION"],
      ["SELECT * FROM \"query_table\"('latest')", "SCANNER_FORBIDDEN_FUNCTION"]
    ];

    for (const [sql, expectedCode] of cases) {
      const before = await authorityFingerprint(fixture);
      const response = await viewer.request("scanner.execute", { sql });
      const after = await authorityFingerprint(fixture);

      assert.equal(response.type, "response.error", sql);
      assert.equal(response.payload.code, expectedCode, sql);
      assert.equal(after, before, sql);
    }

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});


test("Scanner SQL guide stays synchronized with fresh schema and source-defined built-ins", async () => {
  const guide = await readFile(GUIDE_PATH, "utf8");
  const fixture = await createServiceFixture();

  try {
    for (const anchor of [
      "## 1. Scanner rules in one page",
      "## 3. Canonical identity and joins",
      "### Known versus unknown market semantics",
      "## 5. Public Scanner schema — schema v2",
      "## 9. Prompt template for an AI assistant",
      "## 11. Maintenance contract",
      "security_id AS securityId",
      "0\n!= null\n!= \"\"\n!= missing property"
    ]) {
      assert.ok(guide.includes(anchor), `Guide is missing required authoring contract: ${anchor}`);
    }

    const columnsManifest = parseSchemaColumnsManifest(guide);
    const documentedTables = [...columnsManifest.keys()].sort();
    assert.deepEqual(documentedTables, [...REQUIRED_TABLES].sort());

    const actualTables = await fixture.rows(`
      SELECT table_name AS tableName
      FROM information_schema.tables
      WHERE table_schema = 'main'
      ORDER BY table_name
    `);
    assert.deepEqual(
      actualTables.map((row) => String(row.tableName ?? row.table_name)).sort(),
      [...REQUIRED_TABLES].sort()
    );

    const actualColumns = await fixture.rows(`
      SELECT
        table_name AS tableName,
        column_name AS columnName,
        data_type AS dataType,
        is_nullable AS nullable
      FROM information_schema.columns
      WHERE table_schema = 'main'
      ORDER BY table_name, ordinal_position
    `);

    const actualColumnsByTable = new Map();
    for (const row of actualColumns) {
      const tableName = String(row.tableName ?? row.table_name);
      const columnName = String(row.columnName ?? row.column_name);
      if (!actualColumnsByTable.has(tableName)) {
        actualColumnsByTable.set(tableName, []);
      }
      actualColumnsByTable.get(tableName).push(columnName);
    }

    for (const tableName of REQUIRED_TABLES) {
      assert.deepEqual(
        columnsManifest.get(tableName),
        actualColumnsByTable.get(tableName),
        `Guide column order drifted for ${tableName}`
      );
    }

    assert.deepEqual(
      sortedSchemaRows(parseSchemaTypesManifest(guide)),
      sortedSchemaRows(actualColumns),
      "Guide schema type/nullability manifest drifted from fresh DuckDB"
    );

    assert.deepEqual(
      parseBuiltinManifest(guide),
      BUILTIN_SCANNER_QUERIES.map(({ queryId, name, intervalMs }) => ({
        queryId,
        name,
        intervalMs
      })),
      "Guide built-in ID/name/interval manifest drifted from source"
    );
  } finally {
    await fixture.cleanup();
  }
});

test("every marked executable SQL guide example is admitted by the real Scanner and built-in SQL is exact", async () => {
  const guide = await readFile(GUIDE_PATH, "utf8");
  const examples = executableExamples(guide);
  const expectedExampleIds = [
    "latest-with-universe",
    "history-with-universe",
    "builtin-all-current-fields",
    "builtin-market-ranking-example",
    "current-with-names",
    "recent-history",
    "history-sample-counts",
    "current-rank",
    "saved-query-config"
  ];

  assert.deepEqual(
    examples.map((example) => example.id),
    expectedExampleIds,
    "Executable guide example inventory drifted"
  );

  const byId = new Map(examples.map((example) => [example.id, example.sql]));
  assert.equal(
    byId.get("builtin-all-current-fields"),
    BUILTIN_SCANNER_QUERIES.find(
      (query) => query.queryId === "builtin:all-current-fields"
    ).sql.trim()
  );
  assert.equal(
    byId.get("builtin-market-ranking-example"),
    BUILTIN_SCANNER_QUERIES.find(
      (query) => query.queryId === "builtin:market-ranking-example"
    ).sql.trim()
  );

  const fixture = await createServiceFixture();
  try {
    const viewer = await fixture.connect("viewer", "scanner-guide-examples");

    for (const example of examples) {
      const response = await viewer.request("scanner.execute", {
        sql: example.sql
      });
      assert.equal(
        response.type,
        "response.ok",
        `Guide SQL example ${example.id} failed admission/execution: ${JSON.stringify(response.payload)}`
      );
      assert.ok(Array.isArray(response.payload.data.columns), example.id);
      assert.ok(Array.isArray(response.payload.data.rows), example.id);
    }

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
