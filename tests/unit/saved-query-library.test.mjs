import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILTIN_SCANNER_QUERIES,
  builtinNameKeys,
  isBuiltinQueryId
} from "../../shared/scanner/builtins.js";
import { normalizeSavedQueryName } from "../../local-service/scanner/query-library.js";

test("saved-query name normalization is deterministic and collision-oriented", () => {
  assert.deepEqual(normalizeSavedQueryName("  My   Query  "), {
    name: "My   Query",
    nameKey: "my query"
  });
  assert.deepEqual(normalizeSavedQueryName("ＡＢＣ"), {
    name: "ABC",
    nameKey: "abc"
  });
  assert.throws(() => normalizeSavedQueryName("   "), /INVALID_MESSAGE|invalid/i);
  assert.throws(() => normalizeSavedQueryName("x".repeat(121)), /INVALID_MESSAGE|invalid/i);
});

test("built-in saved-query identities and names are stable and reserved", () => {
  assert.deepEqual(BUILTIN_SCANNER_QUERIES.map(({ queryId, name, intervalMs }) => ({
    queryId,
    name,
    intervalMs
  })), [
    {
      queryId: "builtin:all-current-fields",
      name: "All current fields",
      intervalMs: 5000
    },
    {
      queryId: "builtin:market-ranking-example",
      name: "Market ranking example",
      intervalMs: 5000
    }
  ]);

  assert.equal(isBuiltinQueryId("builtin:all-current-fields"), true);
  assert.equal(isBuiltinQueryId("user:anything"), false);
  assert.deepEqual([...builtinNameKeys()].sort(), [
    "all current fields",
    "market ranking example"
  ]);
});
