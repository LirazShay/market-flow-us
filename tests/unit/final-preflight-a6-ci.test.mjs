import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function workflow(name) {
  return await readFile(path.join(ROOT, ".github", "workflows", name), "utf8");
}

function count(text, fragment) {
  return text.split(fragment).length - 1;
}

test("Fast CI reruns when files consumed by Fast tests change", async () => {
  const fast = await workflow("fast-ci.yml");
  for (const dependency of [
    '- "*.cmd"',
    '- "START_HERE.md"',
    '- "docs/SCANNER_SQL_GUIDE.md"',
    '- "docs/FIRST_RUN_ACCEPTANCE.md"'
  ]) {
    assert.equal(
      count(fast, dependency),
      2,
      `${dependency} must be present in both push and pull_request path filters`
    );
  }
});

test("Browser CI reruns when shared E2E service helpers change", async () => {
  const browser = await workflow("browser-ci.yml");
  assert.equal(
    count(browser, '- "tests/service/helpers/**"'),
    2,
    "Browser CI must include service helpers in push and pull_request path filters"
  );
});
