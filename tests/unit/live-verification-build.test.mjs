import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildLiveVerification } from "../../scripts/build-live-verification.mjs";

const execFileAsync = promisify(execFile);

test("live-verification build emits a separate self-contained bookmarklet with the candidate commit embedded", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-live-build-"));
  const candidateCommit = "abcdef1234567890";

  try {
    const result = await buildLiveVerification({
      outDir: tempDir,
      candidateCommit
    });
    const runtime = await readFile(result.runtimePath, "utf8");
    const bookmarklet = await readFile(result.bookmarkletPath, "utf8");

    assert.equal(result.candidateCommit, candidateCommit);
    assert.match(result.entryPoint, /browser[\\/]live-verification[\\/]index\.js$/);
    assert.ok(runtime.includes(candidateCommit));
    assert.ok(runtime.includes("__MARKET_SCOPE_LIVE_VERIFICATION_RESULT_V1__"));
    assert.equal(runtime.includes("__MARKET_SCOPE_RUNTIME_V1__"), false);

    assert.ok(bookmarklet.startsWith("javascript:"));
    assert.ok(bookmarklet.includes(candidateCommit));
    assert.ok(bookmarklet.includes("__MARKET_SCOPE_LIVE_VERIFICATION_RESULT_V1__"));
    assert.equal(bookmarklet.includes("__MARKET_SCOPE_RUNTIME_V1__"), false);
    assert.equal(bookmarklet.includes("\n"), false);
    assert.equal(bookmarklet.includes("\r"), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("live-verification build rejects a non-commit candidate instead of creating an ambiguous report", async () => {
  await assert.rejects(
    buildLiveVerification({ candidateCommit: "not-a-commit" }),
    /candidateCommit/
  );
});

test("live-verification default build embeds the exact clean checkout HEAD", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-live-head-"));

  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
    const expectedHead = stdout.trim().toLowerCase();
    const result = await buildLiveVerification({ outDir: tempDir });
    const bookmarklet = await readFile(result.bookmarkletPath, "utf8");

    assert.equal(result.candidateCommit, expectedHead);
    assert.ok(bookmarklet.includes(expectedHead));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
