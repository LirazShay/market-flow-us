import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { MARKET_FLOW_US_REQUIRED_TABLES } from "../../local-service/database/schema.js";
import { createScannerAuthority } from "../../local-service/scanner/scanner.js";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";

const GUIDE_PATH = fileURLToPath(
  new URL("../../docs/SCANNER_SQL_GUIDE.md", import.meta.url)
);
const SCANNER_TABLES = new Set(MARKET_FLOW_US_REQUIRED_TABLES);

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

function parseColumnsManifest(guide) {
  const lines = extractTextManifest(
    guide,
    "SCANNER_US_SCHEMA_MANIFEST_V4",
    "END_SCANNER_US_SCHEMA_MANIFEST_V4"
  );
  const tables = new Map();

  for (const line of lines) {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `Invalid U.S. schema manifest line: ${line}`);
    const table = line.slice(0, separator).trim();
    const columns = line
      .slice(separator + 1)
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    assert.equal(tables.has(table), false, `Duplicate U.S. schema table ${table}`);
    tables.set(table, columns);
  }

  return tables;
}

function parseTypesManifest(guide) {
  return extractTextManifest(
    guide,
    "SCANNER_US_SCHEMA_TYPES_V4",
    "END_SCANNER_US_SCHEMA_TYPES_V4"
  ).map((line) => {
    const [qualifiedName, dataType, nullable] = line.split("|");
    assert.ok(qualifiedName?.includes("."), `Invalid U.S. schema type line: ${line}`);
    assert.ok(dataType, `Missing U.S. schema type: ${line}`);
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
    "SCANNER_US_BUILTIN_MANIFEST_V1",
    "END_SCANNER_US_BUILTIN_MANIFEST_V1"
  ).map((line) => {
    const [queryId, name, intervalRaw] = line.split("|");
    const intervalMs = Number(intervalRaw);
    assert.ok(queryId);
    assert.ok(name);
    assert.ok(Number.isSafeInteger(intervalMs) && intervalMs > 0);
    return { queryId, name, intervalMs };
  });
}

function executableExamples(guide) {
  const pattern = /<!-- scanner-us-executable:([a-z0-9-]+) -->\s*```sql\s*([\s\S]*?)```/g;
  return [...guide.matchAll(pattern)].map((match) => ({
    id: match[1],
    sql: match[2].trim()
  }));
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
      const table = left.tableName.localeCompare(right.tableName);
      return table !== 0 ? table : left.columnName.localeCompare(right.columnName);
    });
}

async function createFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-guide-"));
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(tempDir, "guide-v4.duckdb"),
    productVersion: "scanner-guide-test",
    now: () => 1
  });
  const scanner = await createScannerAuthority({
    connection: database.scannerConnection,
    now: () => 1
  });

  return {
    tempDir,
    database,
    scanner,
    async cleanup() {
      await database.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

test("Market Flow US Scanner guide keeps the complete schema-v4 manifest synchronized", async () => {
  const guide = await readFile(GUIDE_PATH, "utf8");
  const fixture = await createFixture();

  try {
    for (const anchor of [
      "# Market Flow US Scanner SQL Guide",
      "## 5. Public Scanner schema — schema v4",
      "demo_buy_captures",
      "demo_buy_items",
      "no persisted Demo Buy outcome table",
      "## 6. Market Flow US built-in queries",
      "security_id AS securityId",
      "Staged candidate ranking",
      "10s, 20s, 30s, 45s, 60s, 90s and 120s",
      "## 9. Prompt template for an AI assistant",
      "## 11. Maintenance contract"
    ]) {
      assert.ok(guide.includes(anchor), `Guide is missing U.S. authoring contract: ${anchor}`);
    }

    const documentedColumns = parseColumnsManifest(guide);
    assert.deepEqual(
      [...documentedColumns.keys()].sort(),
      [...MARKET_FLOW_US_REQUIRED_TABLES].sort()
    );
    assert.equal(documentedColumns.has("demo_buy_outcomes"), false);

    const allColumns = (await fixture.database.viewerReadConnection.runAndReadAll(`
      SELECT
        table_name AS tableName,
        column_name AS columnName,
        data_type AS dataType,
        is_nullable AS nullable,
        ordinal_position AS ordinalPosition
      FROM information_schema.columns
      WHERE table_schema = 'main'
      ORDER BY table_name, ordinal_position
    `)).getRowObjectsJson();
    const actualColumns = allColumns.filter((row) =>
      SCANNER_TABLES.has(String(row.tableName ?? row.table_name))
    );

    const actualByTable = new Map();
    for (const row of actualColumns) {
      const tableName = String(row.tableName ?? row.table_name);
      const columnName = String(row.columnName ?? row.column_name);
      if (!actualByTable.has(tableName)) actualByTable.set(tableName, []);
      actualByTable.get(tableName).push(columnName);
    }

    for (const tableName of MARKET_FLOW_US_REQUIRED_TABLES) {
      assert.deepEqual(
        documentedColumns.get(tableName),
        actualByTable.get(tableName),
        `U.S. schema-v4 guide column order drifted for ${tableName}`
      );
    }

    assert.deepEqual(
      sortedSchemaRows(parseTypesManifest(guide)),
      sortedSchemaRows(actualColumns),
      "U.S. guide schema-v4 type/nullability manifest drifted"
    );

    assert.deepEqual(
      parseBuiltinManifest(guide),
      MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.map(({ queryId, name, intervalMs }) => ({
        queryId,
        name,
        intervalMs
      })),
      "U.S. built-in ID/name/interval manifest drifted from source"
    );
  } finally {
    await fixture.cleanup();
  }
});

test("every U.S. guide SQL example executes through the real Scanner and built-in SQL text is exact", async () => {
  const guide = await readFile(GUIDE_PATH, "utf8");
  const examples = executableExamples(guide);

  assert.deepEqual(
    examples.map((example) => example.id),
    [
      "latest-with-universe",
      "recent-history",
      "demo-buy-captures",
      "builtin-all-current-fields",
      "builtin-market-ranking-example",
      "builtin-staged-candidate-ranking",
      "history-sample-counts",
      "current-rank",
      "saved-query-config"
    ]
  );

  const byId = new Map(examples.map((example) => [example.id, example.sql]));
  for (const [exampleId, queryId] of [
    ["builtin-all-current-fields", "builtin:all-current-fields"],
    ["builtin-market-ranking-example", "builtin:market-ranking-example"],
    ["builtin-staged-candidate-ranking", "builtin:staged-candidate-ranking"]
  ]) {
    const source = MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.find(
      (query) => query.queryId === queryId
    );
    assert.ok(source, queryId);
    assert.equal(byId.get(exampleId), source.sql.trim(), `${queryId} guide SQL drifted`);
  }

  const fixture = await createFixture();
  try {
    for (const example of examples) {
      const result = await fixture.scanner.execute(example.sql);
      assert.ok(Array.isArray(result.columns), example.id);
      assert.ok(Array.isArray(result.rows), example.id);
    }
  } finally {
    await fixture.cleanup();
  }
});
