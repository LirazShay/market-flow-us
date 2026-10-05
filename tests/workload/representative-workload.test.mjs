import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { WebSocket } from "ws";
import {
  buildUsCollectionCandidate,
  buildUsCompleteCycle
} from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { startMarketScopeService } from "../../local-service/server/service.js";
import { createUsSyntheticGenerator } from "../fake-market/us-synthetic.mjs";
import {
  GENERAL_SCANNER_QUERIES,
  SYNTHETIC_EPOCH_MS,
  assertUsGeneratedRow,
  distribution,
  measure,
  resolveEndToEndProfiles,
  roundMs,
  sanitizedFailure,
  stagedScannerSql,
  workloadMode
} from "./us-workload-support.mjs";

const ORIGIN = "http://127.0.0.1:19014";
const REPORT_PATH = process.env.MARKET_FLOW_US_WORKLOAD_REPORT
  ?? path.resolve("test-results/workload/end-to-end-workload.json");
const TARGET_MACHINE_CEILING_MS = 5 * 60 * 1000;

async function openClient({ url, role, clientInstanceId }) {
  const socket = new WebSocket(url, { origin: ORIGIN });
  await once(socket, "open");
  let sequence = 0;

  async function send(message) {
    const response = once(socket, "message");
    socket.send(JSON.stringify(message));
    const [data] = await response;
    return JSON.parse(data.toString());
  }

  const hello = await send({
    v: 1,
    type: "client.hello",
    requestId: `hello-${clientInstanceId}`,
    payload: {
      role,
      clientInstanceId,
      productVersion: "market-flow-us-workload"
    }
  });
  assert.equal(hello.type, "response.ok", "workload client hello failed");

  return {
    async request(type, payload = {}) {
      sequence += 1;
      return await send({
        v: 1,
        type,
        requestId: `${clientInstanceId}-${sequence}`,
        payload
      });
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close");
      socket.close();
      await closed;
    }
  };
}

function serviceConfig(dbPath) {
  return {
    host: "127.0.0.1",
    port: 0,
    dbPath,
    maxInboundMessageBytes: 16 * 1024 * 1024,
    producerHeartbeatMs: 5000,
    producerStaleAfterMs: 15000,
    historyPageSize: 500,
    allowedOrigins: [ORIGIN]
  };
}

async function startService(dbPath) {
  const service = await startMarketScopeService({
    config: serviceConfig(dbPath),
    serviceVersion: "market-flow-us-workload-proof",
    openDatabase: openMarketFlowUsDatabase
  });
  return {
    service,
    url: `ws://127.0.0.1:${service.port}`
  };
}

function assertOk(response, label) {
  assert.equal(
    response.type,
    "response.ok",
    `${label} failed with ${response?.payload?.code ?? "unknown error"}`
  );
  return response.payload.data;
}

function expectedPrice(index, logicalCycle, dataPattern) {
  const movementCycle = dataPattern === "static" ? 0 : logicalCycle;
  return 100 + index + movementCycle;
}

function assertCurrent(response, profile, logicalCycle, generator) {
  const data = assertOk(response, "Current read");
  assert.equal(data.summary.rowCount, profile.universeSize);
  assert.equal(data.rows.length, profile.universeSize);
  assert.equal(data.rows[0].securityId, String(generator.paperIds[0]));
  assert.equal(data.rows.at(-1).securityId, String(generator.paperIds.at(-1)));
  assert.equal(
    data.rows[0].Price,
    expectedPrice(0, logicalCycle, profile.dataPattern)
  );
  assert.equal(
    data.rows.at(-1).Price,
    expectedPrice(profile.universeSize - 1, logicalCycle, profile.dataPattern)
  );
}

function assertHistoryPage(response, expectedCompleted, logicalCycle, profile) {
  const data = assertOk(response, "History read");
  assert.equal(data.rows.length, expectedCompleted);
  assert.equal(
    data.rows[0].Price,
    expectedPrice(0, logicalCycle, profile.dataPattern)
  );
  assert.equal(data.hasMore, false);
  assert.equal(data.nextCursor, null);
}

function assertGeneralScanner(response, name, profile, logicalCycle, generator) {
  const data = assertOk(response, `Scanner ${name}`);
  assert.equal(data.rowCount, 10, `Scanner ${name} row count`);

  if (name === "join") {
    assert.deepEqual(data.rows[0].slice(0, 2), [
      String(generator.paperIds[0]),
      "Synthetic US Security 0000"
    ]);
    assert.equal(
      data.rows[0][2],
      expectedPrice(0, logicalCycle, profile.dataPattern)
    );
  } else if (name === "groupHaving") {
    assert.equal(data.rows[0][0], String(generator.paperIds[0]));
  } else if (name === "windowRank") {
    assert.deepEqual(data.rows[0], [
      String(generator.paperIds.at(-1)),
      ((profile.dataPattern === "static" ? 0 : logicalCycle) * 100000)
        + (profile.universeSize - 1),
      "1"
    ]);
  } else if (name === "timePredicate") {
    assert.equal(data.rows[0][0], String(generator.paperIds[0]));
    assert.ok(Number(data.rows[0][1]) > 0);
  }
}

function assertStagedScanner(response, profile) {
  const data = assertOk(response, "Scanner staged candidate");
  assert.equal(data.rowCount, Math.min(100, profile.universeSize));
  const columnNames = data.columns.map((column) => column.name);
  const stageIndex = columnNames.indexOf("stage_reached");
  assert.ok(stageIndex >= 0, "staged candidate must expose stage_reached");
  const expectedStage = profile.dataPattern === "moving" ? 7 : 0;
  for (const row of data.rows) {
    assert.equal(Number(row[stageIndex]), expectedStage);
  }
}

async function runReadProof({
  viewer,
  profile,
  generator,
  logicalCycle,
  expectedCompleted,
  metrics
}) {
  const current = await measure(metrics.currentReadMs, () =>
    viewer.request("viewer.current.get"));
  assertCurrent(current, profile, logicalCycle, generator);

  const history = await measure(metrics.historyPageMs, () =>
    viewer.request("viewer.history.page", {
      securityId: String(generator.paperIds[0]),
      cursor: null
    }));
  assertHistoryPage(history, expectedCompleted, logicalCycle, profile);

  for (const [name, sql] of Object.entries(GENERAL_SCANNER_QUERIES)) {
    const response = await measure(metrics.generalScannerMs[name], () =>
      viewer.request("scanner.execute", { sql }));
    assertGeneralScanner(response, name, profile, logicalCycle, generator);
  }

  const staged = await measure(metrics.stagedScannerMs, () =>
    viewer.request("scanner.execute", { sql: stagedScannerSql() }));
  assertStagedScanner(staged, profile);
}

async function durableCounts(viewer) {
  const status = assertOk(await viewer.request("viewer.status.get"), "Status read");
  return {
    completedCycles: status.completedCycles,
    failedCycles: status.failedCycles,
    latestCount: status.latestCount,
    historyCount: status.historyCount,
    lastCompletedCycleId: status.lastCompletedCycleId
  };
}

function metricsSummary(metrics) {
  return {
    commit: distribution(metrics.commitMs),
    current: distribution(metrics.currentReadMs),
    historyPage: distribution(metrics.historyPageMs),
    scanner: {
      general: {
        overall: distribution(Object.values(metrics.generalScannerMs).flat()),
        byQuery: Object.fromEntries(
          Object.entries(metrics.generalScannerMs)
            .map(([name, samples]) => [name, distribution(samples)])
        )
      },
      stagedCandidate: distribution(metrics.stagedScannerMs)
    }
  };
}

async function runProfile(profile) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `market-flow-us-${profile.name}-`));
  const dbPath = path.join(tempDir, `${profile.name}.duckdb`);
  const generator = createUsSyntheticGenerator({
    universeSize: profile.universeSize,
    cycleCount: profile.cycleCount,
    cadenceMs: profile.cadenceMs,
    firstPaperId: 1000000,
    epochMs: SYNTHETIC_EPOCH_MS,
    dataPattern: profile.dataPattern,
    failureCycles: profile.failureCycles
  });
  const metrics = {
    commitMs: [],
    currentReadMs: [],
    historyPageMs: [],
    generalScannerMs: Object.fromEntries(
      Object.keys(GENERAL_SCANNER_QUERIES).map((name) => [name, []])
    ),
    stagedScannerMs: []
  };
  const report = {
    name: profile.name,
    targetAuthority: profile.targetAuthority,
    scenario: {
      universeSize: profile.universeSize,
      cycles: profile.cycleCount,
      cadenceMs: profile.cadenceMs,
      dataPattern: profile.dataPattern,
      configuredFailureCycles: profile.failureCycles,
      expectedHistoryRows: null,
      stagedAgesSeconds: [10, 20, 30, 45, 60, 90, 120]
    },
    result: "running",
    counts: null,
    dbFileBytes: null,
    latencyMs: null,
    restartToReadyMs: null,
    wallClockMs: null,
    error: null
  };

  let service = null;
  let producer = null;
  let viewer = null;
  const wallStarted = performance.now();

  try {
    ({ service } = await startService(dbPath));
    const url = `ws://127.0.0.1:${service.port}`;
    producer = await openClient({
      url,
      role: "producer",
      clientInstanceId: `${profile.name}-producer`
    });
    viewer = await openClient({
      url,
      role: "viewer",
      clientInstanceId: `${profile.name}-viewer`
    });

    assertOk(await producer.request("producer.session.start", {
      startedAtMs: 2000,
      config: { snapshotIntervalMs: profile.cadenceMs }
    }), "Producer session start");

    const firstSnapshot = generator.snapshot(1);
    assertUsGeneratedRow(firstSnapshot.records[0]);
    assertUsGeneratedRow(firstSnapshot.records.at(-1));
    const firstCandidate = buildUsCollectionCandidate(firstSnapshot);
    const replaced = assertOk(await producer.request("producer.universe.replace", {
      loadedAtMs: firstCandidate.universe.loadedAtMs,
      recordCount: firstCandidate.universe.recordCount,
      securities: firstCandidate.universe.securities
    }), "Universe replace");
    assert.equal(replaced.recordCount, profile.universeSize);
    assert.equal(replaced.universeRevision, 1);

    let completed = 0;
    let failed = 0;
    let lastSuccessfulLogicalCycle = null;
    let lastCompletedCycleId = null;

    for (let logicalCycle = 1; logicalCycle <= profile.cycleCount; logicalCycle += 1) {
      if (generator.shouldFail(logicalCycle)) {
        const failedAtMs = 10000 + (logicalCycle * profile.cadenceMs);
        const failure = assertOk(await producer.request("producer.cycle.failed", {
          report: {
            phase: "provider-fetch",
            startedAtMs: failedAtMs - 100,
            failedAtMs,
            requested: profile.universeSize,
            received: null,
            unique: null,
            missing: null,
            duplicates: null,
            unexpected: null,
            error: {
              name: "SyntheticProviderError",
              message: "Deterministic synthetic workload failure."
            }
          }
        }), `Cycle ${logicalCycle} failure`);
        assert.equal(failure.cycleId, logicalCycle);
        failed += 1;
        continue;
      }

      const cycle = logicalCycle === 1
        ? firstCandidate.cycle
        : buildUsCompleteCycle({ snapshot: generator.snapshot(logicalCycle) });
      const committed = await measure(metrics.commitMs, () =>
        producer.request("producer.cycle.commit", {
          universeRevision: replaced.universeRevision,
          cycle
        }));
      const commitData = assertOk(committed, `Cycle ${logicalCycle} commit`);
      assert.equal(commitData.cycleId, logicalCycle);
      completed += 1;
      lastSuccessfulLogicalCycle = logicalCycle;
      lastCompletedCycleId = commitData.cycleId;

      assertOk(await producer.request("producer.heartbeat", {
        atMs: Date.now()
      }), `Cycle ${logicalCycle} heartbeat`);
    }

    assert.ok(completed > 0, "profile must commit at least one complete cycle");
    const expectedCounts = {
      completedCycles: completed,
      failedCycles: failed,
      latestCount: profile.universeSize,
      historyCount: profile.universeSize * completed,
      lastCompletedCycleId
    };
    report.scenario.expectedHistoryRows = expectedCounts.historyCount;
    const beforeRestart = await durableCounts(viewer);
    assert.deepEqual(beforeRestart, expectedCounts);

    if (profile.proveScanner) {
      assert.ok(
        lastSuccessfulLogicalCycle * profile.cadenceMs >= 120000,
        "staged Scanner proof requires at least 120 seconds of logical history"
      );
      await runReadProof({
        viewer,
        profile,
        generator,
        logicalCycle: lastSuccessfulLogicalCycle,
        expectedCompleted: completed,
        metrics
      });
    } else {
      const current = await measure(metrics.currentReadMs, () =>
        viewer.request("viewer.current.get"));
      assertCurrent(current, profile, lastSuccessfulLogicalCycle, generator);
    }

    assertOk(await producer.request("producer.session.stop", {
      stoppedAtMs: 10000 + (profile.cycleCount * profile.cadenceMs) + 1000,
      reason: "workload-complete"
    }), "Producer session stop");

    await producer.close();
    producer = null;
    await viewer.close();
    viewer = null;
    await service.close();
    service = null;
    report.dbFileBytes = (await stat(dbPath)).size;

    if (profile.proveRestart) {
      const restartStarted = performance.now();
      ({ service } = await startService(dbPath));
      report.restartToReadyMs = roundMs(performance.now() - restartStarted);
      viewer = await openClient({
        url: `ws://127.0.0.1:${service.port}`,
        role: "viewer",
        clientInstanceId: `${profile.name}-viewer-restart`
      });
      assert.deepEqual(await durableCounts(viewer), expectedCounts);
      if (profile.proveScanner) {
        await runReadProof({
          viewer,
          profile,
          generator,
          logicalCycle: lastSuccessfulLogicalCycle,
          expectedCompleted: completed,
          metrics
        });
      }
    }

    report.counts = expectedCounts;
    report.latencyMs = metricsSummary(metrics);
    report.wallClockMs = roundMs(performance.now() - wallStarted);
    if (profile.targetAuthority) {
      assert.ok(
        report.wallClockMs <= TARGET_MACHINE_CEILING_MS,
        `target 4096 x 180 profile exceeded ${TARGET_MACHINE_CEILING_MS} ms ceiling`
      );
    }
    report.result = "pass";
    return report;
  } catch (error) {
    report.wallClockMs = roundMs(performance.now() - wallStarted);
    report.result = "fail";
    report.error = sanitizedFailure(error, tempDir);
    error.workloadReport = report;
    throw error;
  } finally {
    try {
      await producer?.close();
    } catch {}
    try {
      await viewer?.close();
    } catch {}
    try {
      await service?.close();
    } catch {}
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("Market Flow US end-to-end workload profiles prove bounded CI correctness and expose target scale", { timeout: 40 * 60 * 1000 }, async () => {
  const profiles = resolveEndToEndProfiles();
  const report = {
    schemaVersion: 3,
    product: "Market Flow US",
    profileMode: workloadMode(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    result: "running",
    profiles: [],
    error: null
  };
  let failure = null;

  try {
    for (const profile of profiles) {
      report.profiles.push(await runProfile(profile));
    }
    report.result = profiles.length === 0 ? "not-applicable" : "pass";
  } catch (error) {
    failure = error;
    if (error.workloadReport) report.profiles.push(error.workloadReport);
    report.result = "fail";
    report.error = {
      name: typeof error?.name === "string" ? error.name : "Error",
      message: typeof error?.message === "string"
        ? error.message.slice(0, 500)
        : "End-to-end workload failed."
    };
  } finally {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (failure) throw failure;
});
