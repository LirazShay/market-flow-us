import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { packageBookmarklet } from "./build-browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY_POINT = path.join(ROOT, "browser", "replay", "index.js");

async function bundle({ minify }) {
  const result = await build({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    minify,
    write: false,
    legalComments: "none",
    sourcemap: false
  });

  if (result.outputFiles.length !== 1) {
    throw new Error(`Expected one Replay browser bundle, got ${result.outputFiles.length}`);
  }
  return result.outputFiles[0].text;
}

export async function buildReplayBrowser({ outDir = path.join(ROOT, "dist", "replay") } = {}) {
  const [readableRuntime, compactRuntime] = await Promise.all([
    bundle({ minify: false }),
    bundle({ minify: true })
  ]);
  const bookmarklet = packageBookmarklet(compactRuntime);
  await mkdir(outDir, { recursive: true });

  const runtimePath = path.join(outDir, "market-flow-us-replay.runtime.js");
  const bookmarkletPath = path.join(outDir, "market-flow-us-replay.bookmarklet.txt");
  await Promise.all([
    writeFile(runtimePath, readableRuntime, "utf8"),
    writeFile(bookmarkletPath, bookmarklet, "utf8")
  ]);

  return {
    entryPoint: ENTRY_POINT,
    runtimePath,
    bookmarkletPath,
    runtimeBytes: Buffer.byteLength(readableRuntime),
    bookmarkletBytes: Buffer.byteLength(bookmarklet)
  };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = await buildReplayBrowser();
  process.stdout.write(
    `Built Market Flow US Replay runtime (${result.runtimeBytes} bytes) and bookmarklet (${result.bookmarkletBytes} bytes).\n`
  );
}
