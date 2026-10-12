import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";

import { resolveBacktestEvidenceSourcePath } from "../backtest-lab/source-catalog.js";

const SHA256 = /^[0-9a-f]{64}$/u;

async function assertRegularEvidenceFile(filePath) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch (error) {
    const wrapped = new Error("Research evidence source could not be fingerprinted", { cause: error });
    wrapped.code = "RESEARCH_SOURCE_FINGERPRINT_UNAVAILABLE";
    throw wrapped;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    const error = new Error("Research evidence source must be a regular non-symlink file");
    error.code = "RESEARCH_SOURCE_FINGERPRINT_INVALID_TYPE";
    throw error;
  }
}

export async function fingerprintResearchEvidenceSource({ dataDir, sourceId } = {}) {
  const filePath = resolveBacktestEvidenceSourcePath({ dataDir, sourceId });
  await assertRegularEvidenceFile(filePath);

  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (error) => reject(error));
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export async function verifyResearchEvidenceSourceFingerprint({
  dataDir,
  sourceId,
  expectedFingerprint
} = {}) {
  if (typeof expectedFingerprint !== "string" || !SHA256.test(expectedFingerprint)) {
    throw new TypeError("expectedFingerprint must be a SHA-256 value");
  }
  const actualFingerprint = await fingerprintResearchEvidenceSource({ dataDir, sourceId });
  if (actualFingerprint !== expectedFingerprint) {
    const error = new Error("Research evidence source fingerprint no longer matches the bound Evidence Inventory");
    error.code = "RESEARCH_SOURCE_FINGERPRINT_MISMATCH";
    throw error;
  }
  return actualFingerprint;
}
