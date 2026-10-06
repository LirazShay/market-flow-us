import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { US_CURRENT_COLUMNS } from "../../browser/viewer/current-model.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function text(relativePath) {
  return await readFile(path.join(ROOT, relativePath), "utf8");
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("Product Spec Current behavior delegates exact U.S. provider fields to the Data Contract without executable drift", async () => {
  const [spec, dataContract] = await Promise.all([
    text("docs/PRODUCT_SPEC.md"),
    text("docs/DATA_CONTRACT.md")
  ]);

  assert.match(spec, /Current with U\.S\. fields and `DailyVolume DESC` default/);
  assert.match(
    spec,
    /Schema\/provider field details remain owned by `DATA_CONTRACT\.md` and `TECHNICAL_SPEC\.md`/
  );

  const derivedKeys = new Set(["paperName", "securityId", "collectedAtMs"]);
  for (const column of US_CURRENT_COLUMNS) {
    if (derivedKeys.has(column.key)) continue;
    assert.match(
      dataContract,
      new RegExp(`\\b${regexEscape(column.key)}\\b`),
      `DATA_CONTRACT is missing executable Current source field ${column.key}`
    );
  }

  assert.match(dataContract, /securityId\s*=\s*String\(PaperId\)/);
  assert.match(dataContract, /collected_at_ms/);
});

test("PaperId fail-closed source-type detail is owned by DATA_CONTRACT and higher-level specs retain validated identity", async () => {
  const dataContract = await text("docs/DATA_CONTRACT.md");
  assert.match(dataContract, /(safe integer|Number\.isSafeInteger)/i);
  assert.match(dataContract, /object\/array\/boolean/i);
  assert.match(dataContract, /blank identity: rejected/i);

  for (const relativePath of [
    "docs/PRODUCT_REQUIREMENTS.md",
    "docs/PRODUCT_SPEC.md",
    "docs/TECHNICAL_SPEC.md"
  ]) {
    const source = await text(relativePath);
    assert.match(source, /String\(PaperId\)/, relativePath);
    assert.match(source, /(validated|fail-closed)/i, relativePath);
  }
});

test("first-run surfaces require mechanical movement PASS instead of a manual market-open claim", async () => {
  for (const relativePath of [
    "README.md",
    "START_HERE.md",
    "PREPARE_LIVE_VERIFICATION.cmd",
    "docs/FIRST_RUN_ACCEPTANCE.md",
    "docs/LIVE_VERIFICATION.md",
    "docs/USER_GUIDE.md"
  ]) {
    const source = await text(relativePath);
    assert.match(source, /movement\.status[^\r\n]*PASS/i, relativePath);
  }

  const firstRun = await text("docs/FIRST_RUN_ACCEPTANCE.md");
  assert.match(firstRun, /movement\.status = "PENDING"/);
  assert.match(firstRun, /movement\.status = "FAIL"/);
  assert.doesNotMatch(firstRun, /live gate regular.*does not mark movement/i);
});
