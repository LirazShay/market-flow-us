import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildReplayBrowser } from "../../scripts/build-replay-browser.mjs";

test("Replay has a dedicated browser runtime/bookmarklet build", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-replay-"));
  try {
    const result = await buildReplayBrowser({ outDir });
    assert.match(result.entryPoint.replaceAll("\\", "/"), /browser\/replay\/index\.js$/u);
    assert.equal(path.basename(result.runtimePath), "market-flow-us-replay.runtime.js");
    assert.equal(path.basename(result.bookmarkletPath), "market-flow-us-replay.bookmarklet.txt");
    assert.ok(result.runtimeBytes > 0);
    assert.ok(result.bookmarkletBytes > 0);

    const runtime = await readFile(result.runtimePath, "utf8");
    const bookmarklet = await readFile(result.bookmarkletPath, "utf8");
    assert.match(runtime, /__MARKET_FLOW_US_REPLAY_V1__/u);
    assert.match(runtime, /ScreenerHulPaging3/u);
    assert.doesNotMatch(runtime, /replayMode/u);
    assert.ok(bookmarklet.startsWith("javascript:"));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
