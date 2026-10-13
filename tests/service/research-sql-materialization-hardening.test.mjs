import assert from "node:assert/strict";
import test from "node:test";

import { StatementType } from "@duckdb/node-api";

import { createScannerAuthority } from "../../local-service/scanner/scanner.js";

function sideEffectReader() {
  return {
    getRowObjectsJson() {
      return [];
    }
  };
}

function createStreamingReader(rows) {
  let current = 0;
  return {
    columnCount: 1,
    get currentRowCount() {
      return current;
    },
    get done() {
      return current >= rows.length;
    },
    async readUntil(targetRowCount) {
      current = Math.min(rows.length, Math.max(current, targetRowCount));
    },
    columnName() {
      return "value";
    },
    columnType() {
      return { toString: () => "VARCHAR" };
    },
    getRowsJson() {
      return rows.slice(0, current);
    }
  };
}

function createConnection(rows) {
  let unboundedExecutions = 0;
  let streamingExecutions = 0;
  const prepared = {
    statementType: StatementType.SELECT,
    parameterCount: 0,
    async runAndReadAll() {
      unboundedExecutions += 1;
      return {
        columnCount: 1,
        columnName: () => "value",
        columnType: () => ({ toString: () => "VARCHAR" }),
        getRowsJson: () => rows
      };
    },
    async streamAndRead() {
      streamingExecutions += 1;
      return createStreamingReader(rows);
    },
    destroySync() {}
  };

  return {
    async runAndReadAll() {
      return sideEffectReader();
    },
    async extractStatements() {
      return {
        count: 1,
        async prepare() {
          return prepared;
        }
      };
    },
    executions() {
      return { unboundedExecutions, streamingExecutions };
    }
  };
}

test("TREE 11.7 Research-bounded Scanner stops huge row output before unbounded materialization", async () => {
  const connection = createConnection([["a"], ["b"], ["c"], ["d"]]);
  const scanner = await createScannerAuthority({
    connection,
    resultLimits: { maxRows: 2, maxBytes: 10_000 },
    now: () => 123
  });

  await assert.rejects(
    scanner.execute("SELECT value FROM research_history"),
    (error) => error?.code === "RESEARCH_BUDGET_EXCEEDED"
      && error?.dimension === "resultRows"
      && error?.limit === 2
  );

  assert.deepEqual(connection.executions(), {
    unboundedExecutions: 0,
    streamingExecutions: 1
  });
});

test("TREE 11.7 Research-bounded Scanner stops oversized serialized output before full result materialization", async () => {
  const connection = createConnection([["0123456789"], ["abcdefghij"], ["klmnopqrst"]]);
  const scanner = await createScannerAuthority({
    connection,
    resultLimits: { maxRows: 100, maxBytes: 20 },
    now: () => 456
  });

  await assert.rejects(
    scanner.execute("SELECT value FROM research_history"),
    (error) => error?.code === "RESEARCH_BUDGET_EXCEEDED"
      && error?.dimension === "resultBytes"
      && error?.limit === 20
  );

  assert.deepEqual(connection.executions(), {
    unboundedExecutions: 0,
    streamingExecutions: 1
  });
});
