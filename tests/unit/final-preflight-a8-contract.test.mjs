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

function currentColumnsFromProductSpec(source) {
  const match = source.match(/Visible columns, in order:\s*```text\s*([\s\S]*?)```/);
  assert.ok(match, "PRODUCT_SPEC Current visible-column block is missing");
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

test("Product Spec Current column contract exactly matches the executable U.S. profile", async () => {
  const spec = await text("docs/PRODUCT_SPEC.md");
  assert.deepEqual(
    currentColumnsFromProductSpec(spec),
    US_CURRENT_COLUMNS.map((column) => column.key)
  );
});

test("PaperId fail-closed source-type contract is durable across provider/data specs", async () => {
  for (const relativePath of [
    "docs/DATA_CONTRACT.md",
    "docs/PRODUCT_REQUIREMENTS.md",
    "docs/PRODUCT_SPEC.md",
    "docs/TECHNICAL_SPEC.md"
  ]) {
    const source = await text(relativePath);
    assert.match(source, /(safe integer|Number\.isSafeInteger)/i, relativePath);
    assert.match(source, /object/i, relativePath);
    assert.match(source, /boolean/i, relativePath);
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
