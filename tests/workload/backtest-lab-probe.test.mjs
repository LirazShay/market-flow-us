import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { startBacktestLabRuntime } from "../../backtest-lab/runtime.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import {
  distribution,
  roundMs,
  sanitizedFailure,
  workloadMode
} from "./us-workload-support.mjs";

const REPORT_PATH = process.env.MARKET_FLOW_US_BACKTEST_REPORT
  ?? path.resolve("test-results/workload/backtest-lab.json");
const SYNTHETIC_EPOCH_MS = Date.UTC(2026, 9, 5, 13, 30, 0);
const CADENCE_MS = 3000;
const DEFAULT_HORIZONS_MS = Object.freeze([
  10_000,
  20_000,
  30_000,
  45_000,
  60_000,
  90_000,
  120_000
]);
const QUERY_A = Object.freeze({
  id: "volume-desc",
  name: "Volume DESC",
  sql: "SELECT security_id, Price, DailyVolume FROM latest ORDER BY DailyVolume DESC, security_id ASC"
});
const QUERY_B = Object.freeze({
  id: "price-asc",
  name: "Price ASC",
  sql: "SELECT security_id, Price, DailyVolume FROM latest ORDER BY Price ASC, security_id ASC"
});

function resolveProfile() {
  const mode = workloadMode();
  if (mode === "target-e2e" || mode === "target-day") {
    return {
      name: "target-4096x180",
      universeSize: 4096,
      cycleCount: 180,
      targetAuthority: true
    };
  }
  if (mode === "custom") {
    const universeSize = Number(process.env.MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE ?? 1024);
    const cycleCount = Number(process.env.MARKET_FLOW_US_WORKLOAD_CYCLES ?? 120);
    assert.ok(Number.isSafeInteger(universeSize) && universeSize >= 10);
    assert.ok(Number.isSafeInteger(cycleCount) && cycleCount >= 100);
    return {
      name: `custom-${universeSize}x${cycleCount}`,
      universeSize,
      cycleCount,
      targetAuthority: false
    };
  }
  return {
    name: "ci-1024x120",
    universeSize: 1024,
    cycleCount: 120,
    targetAuthority: false
  };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function seedRepresentativeBacktestDay(dbPath, profile) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "market-flow-us-backtest-workload"
  });
  const connection = database.writerConnection;
  const lastCollectedAtMs = SYNTHETIC_EPOCH_MS + (profile.cycleCount * CADENCE_MS);
  const started = performance.now();

  try {
    await connection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        'backtest-workload-session', 'backtest-workload-producer', 'stopped',
        ${SYNTHETIC_EPOCH_MS}, ${lastCollectedAtMs + 1000}, 'synthetic-workload-complete',
        ${lastCollectedAtMs}, ${profile.cycleCount}, 0, ${profile.cycleCount},
        ${lastCollectedAtMs}, CAST('{"snapshotIntervalMs":${CADENCE_MS}}' AS JSON), NULL
      )
    `);

    await connection.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms, last_seen_at_ms,
        Symbol, PaperNameEng, PaperNameHeb, ExchangeName, raw_source
      )
      SELECT
        CAST(1000000 + security_index AS VARCHAR),
        true,
        1,
        ${SYNTHETIC_EPOCH_MS},
        ${lastCollectedAtMs},
        'BT' || CAST(security_index AS VARCHAR),
        'Backtest Security ' || CAST(security_index AS VARCHAR),
        NULL,
        'SYNTH',
        CAST('{}' AS JSON)
      FROM range(0, ${profile.universeSize}) AS securities(security_index)
    `);

    await connection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      )
      SELECT
        cycle_id,
        'backtest-workload-session',
        1,
        'complete',
        ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${CADENCE_MS}) - 100,
        ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${CADENCE_MS}),
        ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${CADENCE_MS}) + 1,
        100,
        ${profile.universeSize},
        ${profile.universeSize},
        ${profile.universeSize},
        0,
        0,
        0,
        1,
        CAST('[]' AS JSON),
        NULL,
        NULL
      FROM range(1, ${profile.cycleCount + 1}) AS cycles(cycle_id)
    `);

    await connection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName,
        Price, ChangePercent, DailyVolume, raw_data
      )
      SELECT
        cycle_id,
        'backtest-workload-session',
        1,
        CAST(1000000 + security_index AS VARCHAR),
        0,
        ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${CADENCE_MS}) - 100,
        ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${CADENCE_MS}) - 10,
        ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${CADENCE_MS}),
        CAST('{"source":"synthetic-backtest-workload"}' AS JSON),
        'BT' || CAST(security_index AS VARCHAR),
        'Backtest Security ' || CAST(security_index AS VARCHAR),
        'SYNTH',
        100 + (security_index * 0.01) + (cycle_id * 0.05),
        cycle_id * 0.01,
        (security_index * 1000) + cycle_id,
        CAST('{}' AS JSON)
      FROM range(1, ${profile.cycleCount + 1}) AS cycles(cycle_id)
      CROSS JOIN range(0, ${profile.universeSize}) AS securities(security_index)
    `);

    await connection.run(`
      INSERT INTO latest
      SELECT * FROM history WHERE cycle_id = ${profile.cycleCount}
    `);
  } finally {
    await database.close();
  }

  return roundMs(performance.now() - started);
}

async function postJson(runtime, pathname, body) {
  const started = performance.now();
  const response = await fetch(`http://${runtime.host}:${runtime.port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return {
    status: response.status,
    body: payload,
    durationMs: performance.now() - started
  };
}

function pointRequest(queries) {
  return {
    sourceId: "active",
    requestedAtMs: SYNTHETIC_EPOCH_MS + 180_001,
    queries,
    topX: 10,
    horizonsMs: [...DEFAULT_HORIZONS_MS]
  };
}

function sweepRequest(queries) {
  return {
    sourceId: "active",
    fromAtMs: SYNTHETIC_EPOCH_MS + 120_001,
    toAtMs: SYNTHETIC_EPOCH_MS + 180_001,
    intervalValue: 1,
    intervalUnit: "seconds",
    queries,
    topX: 10,
    horizonsMs: [...DEFAULT_HORIZONS_MS]
  };
}

async function measurePoint(runtime, queries, samples = 3) {
  const timings = [];
  let last = null;
  for (let index = 0; index < samples; index += 1) {
    last = await postJson(runtime, "/api/point/run", pointRequest(queries));
    assert.equal(last.status, 200);
    assert.equal(last.body.point.available, true);
    assert.equal(last.body.point.queries.length, queries.length);
    timings.push(last.durationMs);
  }
  return {
    latencyMs: distribution(timings),
    available: last.body.point.available,
    baselineCycleId: last.body.point.baseline.cycleId,
    queryCount: last.body.point.queries.length
  };
}

async function measureSweep(runtime, queries) {
  const result = await postJson(runtime, "/api/sweep/run", sweepRequest(queries));
  assert.equal(result.status, 200);
  const metrics = result.body.sweep.metrics;
  assert.equal(metrics.requestedPointCount, 61);
  assert.equal(metrics.availablePointCount, 61);
  assert.equal(metrics.unavailablePointCount, 0);
  assert.equal(metrics.distinctBaselineCount, 21);
  assert.equal(metrics.queryExecutionCount, 21 * queries.length);
  return {
    latencyMs: roundMs(result.durationMs),
    ...metrics,
    queryCount: queries.length,
    topX: 10,
    horizonCount: DEFAULT_HORIZONS_MS.length,
    outcomeEvaluationCount: metrics.availablePointCount * queries.length
  };
}

test("Backtest Lab bounded workload records Inspect/Compare/second-level Sweep measurements", { timeout: 4 * 60 * 1000 }, async () => {
  const profile = resolveProfile();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-workload-"));
  const dbPath = path.join(tempDir, "market-flow-us.duckdb");
  const report = {
    schemaVersion: 1,
    product: "Market Flow US",
    profileMode: workloadMode(),
    profile,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    result: "running",
    scenario: {
      cadenceMs: CADENCE_MS,
      historyRows: profile.universeSize * profile.cycleCount,
      pointTopX: 10,
      horizonsMs: DEFAULT_HORIZONS_MS,
      sweepIntervalMs: 1000,
      sweepPointCount: 61
    },
    seedMs: null,
    dbFileBytes: null,
    inspect: null,
    compare: null,
    sweep: null,
    sweepCompare: null,
    sourceSha256Before: null,
    sourceSha256After: null,
    wallClockMs: null,
    error: null
  };
  const wallStarted = performance.now();
  let runtime = null;
  let failure = null;

  try {
    report.seedMs = await seedRepresentativeBacktestDay(dbPath, profile);
    report.dbFileBytes = (await stat(dbPath)).size;
    report.sourceSha256Before = sha256(await readFile(dbPath));

    runtime = await startBacktestLabRuntime({ dataDir: tempDir, port: 0 });
    report.inspect = await measurePoint(runtime, [QUERY_A]);
    report.compare = await measurePoint(runtime, [QUERY_A, QUERY_B]);
    report.sweep = await measureSweep(runtime, [QUERY_A]);
    report.sweepCompare = await measureSweep(runtime, [QUERY_A, QUERY_B]);

    await runtime.close();
    runtime = null;
    report.sourceSha256After = sha256(await readFile(dbPath));
    assert.equal(report.sourceSha256After, report.sourceSha256Before);
    report.result = "pass";
  } catch (error) {
    failure = error;
    report.result = "fail";
    report.error = sanitizedFailure(error, tempDir);
  } finally {
    try {
      await runtime?.close();
    } catch {}
    report.wallClockMs = roundMs(performance.now() - wallStarted);
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rm(tempDir, { recursive: true, force: true });
  }

  if (failure) throw failure;
});
