import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function responseWithPaperId(PaperId) {
  return {
    data: {
      ScreenerHulPaging: {
        recordCount: 1,
        records: [{ PaperId, Symbol: "SAFE" }]
      }
    },
    resultCode: 0,
    rtUsa: true
  };
}

const timing = {
  startedAtMs: 100,
  responseReceivedAtMs: 101,
  completedAtMs: 102
};

test("U.S. provider identity rejects malformed PaperId values before canonicalization", () => {
  const malformed = [
    {},
    [],
    true,
    false,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "   "
  ];

  for (const PaperId of malformed) {
    assert.throws(
      () => buildValidatedSnapshot({
        responseJson: responseWithPaperId(PaperId),
        timing,
        httpStatus: 200
      }),
      /PaperId/i,
      `PaperId ${String(PaperId)} must fail closed`
    );
  }

  assert.equal(
    buildValidatedSnapshot({
      responseJson: responseWithPaperId(12345),
      timing,
      httpStatus: 200
    }).responseIds[0],
    "12345"
  );
  assert.equal(
    buildValidatedSnapshot({
      responseJson: responseWithPaperId("US-12345"),
      timing,
      httpStatus: 200
    }).responseIds[0],
    "US-12345"
  );
});

test("release commit-hint channel is isolated from donor MarketScope namespace", async () => {
  const files = [
    "browser/runtime/producer-bridge.js",
    "browser/viewer/refresh-controller.js"
  ];

  for (const relativePath of files) {
    const source = await readFile(path.join(ROOT, relativePath), "utf8");
    assert.match(source, /market-flow-us:v1/);
    assert.doesNotMatch(source, /market-scope:v1/);
  }
});
