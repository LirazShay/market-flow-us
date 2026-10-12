import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  fingerprintResearchEvidenceSource,
  verifyResearchEvidenceSourceFingerprint
} from "../../research-server/source-fingerprint.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("TREE 11.2 evidence fingerprint verification binds the actual source bytes", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-source-fingerprint-"));
  const sourcePath = path.join(dataDir, "market-flow-us.duckdb");
  const original = Buffer.from("immutable-market-evidence-v1", "utf8");

  try {
    await writeFile(sourcePath, original);
    const expectedFingerprint = sha256(original);

    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" }),
      expectedFingerprint
    );
    assert.equal(
      await verifyResearchEvidenceSourceFingerprint({
        dataDir,
        sourceId: "active",
        expectedFingerprint
      }),
      expectedFingerprint
    );

    await writeFile(sourcePath, Buffer.from("mutated-market-evidence-v2", "utf8"));
    await assert.rejects(
      verifyResearchEvidenceSourceFingerprint({
        dataDir,
        sourceId: "active",
        expectedFingerprint
      }),
      (error) => {
        assert.equal(error.code, "RESEARCH_SOURCE_FINGERPRINT_MISMATCH");
        assert.match(error.message, /no longer matches/u);
        return true;
      }
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
