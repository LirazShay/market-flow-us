import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import {
  BacktestEvidenceSourceError,
  openBacktestEvidenceSource
} from "../../backtest-lab/evidence-source.js";

const DATABASE_MODULE_URL = new URL(
  "../../local-service/database/database.js",
  import.meta.url
).href;

const FOREIGN_OWNER_SOURCE = `
import { DuckDBInstance } from "@duckdb/node-api";

const [dbPath, databaseModuleUrl] = process.argv.slice(1);
const { DUCKDB_HARDENING } = await import(databaseModuleUrl);
const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
const connection = await instance.connect();
let closed = false;

function close() {
  if (closed) return;
  closed = true;
  try { connection.closeSync(); } catch {}
  try { instance.closeSync(); } catch {}
  process.exit(0);
}

process.on("SIGTERM", close);
process.on("SIGINT", close);
process.stdout.write("READY\\n");
setInterval(() => {}, 1000);
`;

async function waitForReady(child) {
  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("foreign DuckDB owner did not become ready"));
    }, 5000);

    const onExit = (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`foreign DuckDB owner exited before ready: ${code ?? signal}`));
    };

    child.once("exit", onExit);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (!output.includes("READY\n")) return;
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve();
    });
  });
}

async function stopForeignOwner(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}

test("Backtest fails clearly on a real foreign-process DuckDB lock without mutating the source", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-lock-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  let child = null;

  try {
    const database = await openMarketFlowUsDatabase({
      dbPath,
      productVersion: "backtest-lock-proof",
      now: () => 1700000000000
    });
    await database.close();

    const before = await readFile(dbPath);
    child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        FOREIGN_OWNER_SOURCE,
        dbPath,
        DATABASE_MODULE_URL
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    await waitForReady(child);

    await assert.rejects(
      () => openBacktestEvidenceSource({ dataDir, sourceId: "active" }),
      (error) => {
        assert.ok(error instanceof BacktestEvidenceSourceError);
        assert.equal(error.code, "BACKTEST_SOURCE_UNAVAILABLE");
        assert.equal(error.message, "Backtest evidence source is unavailable for read-only access.");
        assert.equal(error.message.includes(dataDir), false);
        return true;
      }
    );

    await stopForeignOwner(child);
    child = null;
    assert.deepEqual(await readFile(dbPath), before);
  } finally {
    await stopForeignOwner(child);
    await rm(dataDir, { recursive: true, force: true });
  }
});
