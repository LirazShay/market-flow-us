import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_PACK_FILE_NAMES,
  AI_PACK_FORMAT_VERSION,
  AI_PACK_PROMPT_MAX_BYTES,
  AI_PACK_RELATIVE_ROOT,
  projectScannerContextForSharing
} from "../../local-service/exports/demo-buy-ai-pack.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";

const CANARY = "AI_PACK_ARBITRARY_TEXT_CANARY_7f5e6f";

test("AI Investigation sharing projection preserves safe evidence and redacts arbitrary Scanner text/non-scalars", () => {
  const context = shapeDemoBuyScannerContext({
    columns: [
      { name: "security_id", type: "VARCHAR" },
      { name: "score", type: "DOUBLE" },
      { name: "eligible", type: "BOOLEAN" },
      { name: "comment", type: "VARCHAR" },
      { name: "Symbol", type: "VARCHAR" },
      { name: "payload", type: "JSON" }
    ],
    rows: [[
      "42",
      9.75,
      true,
      CANARY,
      "SAFE",
      { secret: CANARY, nested: [1, 2, 3] }
    ]]
  });

  const projected = projectScannerContextForSharing(context);
  assert.equal(projected.preservedValueCount, 4);
  assert.equal(projected.redactedValueCount, 2);
  assert.equal(projected.identityValueIndex, 0);

  const values = projected.context.rows[0].values;
  assert.equal(values[0], "42");
  assert.equal(values[1], 9.75);
  assert.equal(values[2], true);
  assert.equal(values[4], "SAFE");

  assert.deepEqual(values[3], {
    sourceColumnIndex: 3,
    sourceColumnName: "comment",
    valueType: "string",
    redactedForSharing: true,
    capturedUtf8Bytes: Buffer.byteLength(CANARY),
    resultRank: 1
  });
  assert.equal(values[5].redactedForSharing, true);
  assert.equal(values[5].valueType, "encoded_json");
  assert.equal(values[5].encoding, "canonical_json");

  const serialized = JSON.stringify(projected.context);
  assert.equal(serialized.includes(CANARY), false);
  assert.match(serialized, /redactedForSharing/);
  assert.match(serialized, /canonical_json/);
});

test("AI Investigation pack constants freeze the required local bundle and response bounds", () => {
  assert.equal(AI_PACK_FORMAT_VERSION, 1);
  assert.equal(AI_PACK_RELATIVE_ROOT, "exports/ai-investigations");
  assert.equal(AI_PACK_PROMPT_MAX_BYTES, 256 * 1024);
  assert.deepEqual(AI_PACK_FILE_NAMES, [
    "README.md",
    "PROMPT.md",
    "MANIFEST.json",
    "QUERY.sql",
    "SCANNER_CONTEXT.json",
    "TARGET_BEFORE.jsonl",
    "BASELINE.json",
    "TARGET_AFTER.jsonl",
    "OUTCOME.json",
    "FIELD_GUIDE.md"
  ]);
});
