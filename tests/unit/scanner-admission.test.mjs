import assert from "node:assert/strict";
import test from "node:test";
import { extractScannerFunctionCalls } from "../../local-service/scanner/scanner.js";

test("scanner function lexer finds invoked identifiers while ignoring comments and string contents", () => {
  const calls = extractScannerFunctionCalls(`
    SELECT
      lower('query(\\'ignored\\')'),
      "quoted helper"(1),
      main.rank() OVER (),
      /* query_table('latest') */ abs(-1)
    -- nextval('ignored')
  `);

  assert.deepEqual(calls, ["lower", "quoted helper", "rank", "over", "abs"]);
});

test("scanner function lexer recognizes quoted forbidden function identifiers", () => {
  assert.deepEqual(
    extractScannerFunctionCalls(`SELECT * FROM "query_table"('latest')`),
    ["query_table"]
  );
});
