import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildBrowser, packageBookmarklet } from "../../scripts/build-browser.mjs";
import { startRuntime } from "../../browser/runtime/index.js";

test("browser build emits runtime and one-line self-contained bookmarklet from one entry graph", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-build-"));

  try {
    const result = await buildBrowser({ outDir: tempDir });
    const runtime = await readFile(result.runtimePath, "utf8");
    const bookmarklet = await readFile(result.bookmarkletPath, "utf8");

    assert.match(result.entryPoint, /browser[\\/]runtime[\\/]index\.js$/);
    assert.ok(runtime.includes("__MARKET_SCOPE_RUNTIME_V1__"));
    assert.ok(bookmarklet.includes("__MARKET_SCOPE_RUNTIME_V1__"));
    assert.ok(bookmarklet.startsWith("javascript:"));
    assert.equal(bookmarklet.includes("\n"), false);
    assert.equal(bookmarklet.includes("\r"), false);
    assert.equal(bookmarklet.includes("%20"), false);
    assert.equal(bookmarklet.includes("%0A"), false);
    assert.equal(bookmarklet.includes("%0a"), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("bookmarklet packaging has no arbitrary absolute size ceiling", () => {
  const largeRuntime = `(()=>{"use strict";const payload="${"x".repeat(300_000)}";void payload;})();`;
  const bookmarklet = packageBookmarklet(largeRuntime);

  assert.ok(bookmarklet.length > 256 * 1024);
  assert.ok(bookmarklet.startsWith("javascript:"));
  assert.equal(bookmarklet.includes("\n"), false);
});

test("repeated runtime launch reuses the existing in-page runtime", () => {
  const target = {};
  const first = startRuntime(target, () => 1000);
  const second = startRuntime(target, () => 2000);

  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.runtime, second.runtime);
  assert.equal(second.runtime.startedAtMs, 1000);
});
