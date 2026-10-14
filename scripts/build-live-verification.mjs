import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { packageBookmarklet } from "./build-browser.mjs";
import {
  readCleanCheckoutCommit,
  validateCandidateCommit
} from "./clean-checkout-commit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY_POINT = path.join(ROOT, "browser", "live-verification", "index.js");

async function bundle({ minify, candidateCommit }) {
  const result = await build({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    minify,
    write: false,
    legalComments: "none",
    sourcemap: false,
    define: {
      __MARKET_FLOW_US_CANDIDATE_COMMIT__: JSON.stringify(candidateCommit)
    }
  });

  if (result.outputFiles.length !== 1) {
    throw new Error(`Expected one live-verification browser bundle, got ${result.outputFiles.length}`);
  }

  return result.outputFiles[0].text;
}

export async function buildLiveVerification({
  outDir = path.join(ROOT, "dist", "live-verification"),
  candidateCommit
} = {}) {
  const resolvedCommit = candidateCommit === undefined
    ? await readCleanCheckoutCommit({ root: ROOT })
    : validateCandidateCommit(candidateCommit);

  const [readableRuntime, compactRuntime] = await Promise.all([
    bundle({ minify: false, candidateCommit: resolvedCommit }),
    bundle({ minify: true, candidateCommit: resolvedCommit })
  ]);

  const bookmarklet = packageBookmarklet(compactRuntime);
  await mkdir(outDir, { recursive: true });

  const runtimePath = path.join(outDir, "market-flow-us-live-verification.js");
  const bookmarkletPath = path.join(
    outDir,
    "market-flow-us-live-verification.bookmarklet.txt"
  );

  await Promise.all([
    writeFile(runtimePath, readableRuntime, "utf8"),
    writeFile(bookmarkletPath, bookmarklet, "utf8")
  ]);

  return Object.freeze({
    candidateCommit: resolvedCommit,
    entryPoint: ENTRY_POINT,
    runtimePath,
    bookmarkletPath,
    runtimeBytes: Buffer.byteLength(readableRuntime),
    bookmarkletBytes: Buffer.byteLength(bookmarklet)
  });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = await buildLiveVerification();
  process.stdout.write(
    `Built Market Flow US live-verification gate for ${result.candidateCommit} (${result.bookmarkletBytes} bookmarklet bytes).\n`
  );
}
