import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";
import {
  createMarketReplayPlayer,
  projectReplayFrameToSegment
} from "../../browser/replay/market-player.js";
import { REQUEST_TYPES } from "../../shared/protocol/index.js";

function row(id, extra = {}) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
    TradeDateTime: "2026-10-05T14:31:00Z",
    Price: 100 + Number(id),
    BidRate: 99 + Number(id),
    AskRate: 101 + Number(id),
    DailyVolume: 1_000 + Number(id),
    ...extra
  };
}

function snapshot(records, completedAtMs) {
  return buildValidatedSnapshot({
    responseJson: {
      data: { ScreenerHulPaging: { recordCount: records.length, records } },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-provider-node"
    },
    timing: {
      startedAtMs: completedAtMs - 20,
      responseReceivedAtMs: completedAtMs - 5,
      completedAtMs
    },
    httpStatus: 200
  });
}

function sourceFromSnapshots(snapshots) {
  const frames = snapshots.map((item, sequence) => createReplayFrame({
    recordingId: "player-recording",
    sequence,
    snapshot: item
  }));
  const firstFrameAtMs = frames[0]?.snapshot.timing.completedAtMs ?? null;
  const lastFrameAtMs = frames.at(-1)?.snapshot.timing.completedAtMs ?? null;
  const summary = {
    id: "player-recording",
    name: "Player proof",
    status: "complete",
    createdAtMs: firstFrameAtMs,
    firstFrameAtMs,
    lastFrameAtMs,
    durationMs: firstFrameAtMs === null ? 0 : lastFrameAtMs - firstFrameAtMs,
    frameCount: frames.length,
    approximateBytes: 123
  };
  const frameIndex = frames.map((frame) => ({
    sequence: frame.sequence,
    completedAtMs: frame.snapshot.timing.completedAtMs
  }));
  return createRecordingSource({
    kind: "memory-test",
    summary,
    frameIndex,
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
}

function createFakeClock(startMs) {
  let nowMs = startMs;
  let sequence = 0;
  const scheduled = [];

  function sort() {
    scheduled.sort((left, right) => left.dueAtMs - right.dueAtMs || left.sequence - right.sequence);
  }

  async function runDue(targetMs) {
    while (true) {
      sort();
      const next = scheduled.find((entry) => !entry.fired && !entry.cancelled && entry.dueAtMs <= targetMs);
      if (!next) break;
      next.fired = true;
      nowMs = next.dueAtMs;
      await next.callback();
    }
    nowMs = targetMs;
  }

  return {
    now: () => nowMs,
    setTimer(callback, delayMs) {
      const handle = {
        sequence: sequence++,
        dueAtMs: nowMs + delayMs,
        callback,
        cancelled: false,
        fired: false
      };
      scheduled.push(handle);
      return handle;
    },
    clearTimer(handle) {
      handle.cancelled = true;
    },
    async advance(ms) {
      await runDue(nowMs + ms);
    },
    advanceWithoutTimers(ms) {
      nowMs += ms;
    },
    pending() {
      return scheduled.filter((entry) => !entry.fired && !entry.cancelled);
    },
    latestHandle() {
      return scheduled.at(-1) ?? null;
    },
    async fireEvenIfCancelled(handle) {
      assert.ok(handle);
      await handle.callback();
    }
  };
}

function createFakeProducer({ firstCommitGate = null } = {}) {
  const calls = [];
  const cycles = [];
  let bridgeState = "idle";
  let commitCount = 0;

  return {
    calls,
    cycles,
    getState: () => ({ state: bridgeState }),
    async startSession() {
      calls.push({ type: "client.hello/producer.session.start" });
      bridgeState = "ready";
      return { sessionId: "session-1" };
    },
    async acceptUniverse(universe) {
      calls.push({ type: "producer.universe.replace", loadedAtMs: universe.loadedAtMs });
      return { universeRevision: calls.length };
    },
    async commitCycle(cycle) {
      calls.push({ type: "producer.cycle.commit", completedAtMs: cycle.completedAtMs });
      cycles.push(structuredClone(cycle));
      commitCount += 1;
      if (commitCount === 1 && firstCommitGate) await firstCommitGate.promise;
      return { cycleId: commitCount };
    },
    async stopSession(reason) {
      calls.push({ type: "producer.session.stop", reason });
      bridgeState = "stopped";
      return { stopped: true };
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("Replay projection shifts all locally-owned frame timestamps coherently and preserves provider facts", async () => {
  const originalRows = [row(1, { Price: 123.45 }), row(2, { BidRate: 200.1 })];
  const source = sourceFromSnapshots([snapshot(originalRows, 10_000)]);
  const frame = await source.getFrame(0);
  const projected = projectReplayFrameToSegment(frame, {
    originalReferenceMs: 10_000,
    wallReferenceMs: 1_000_000
  });

  assert.equal(projected.deltaMs, 990_000);
  assert.equal(projected.universe.loadedAtMs, 1_000_000);
  assert.equal(projected.cycle.startedAtMs, 999_980);
  assert.equal(projected.cycle.completedAtMs, 1_000_000);
  assert.equal(projected.cycle.chunks[0].requestStartedAtMs, 999_980);
  assert.equal(projected.cycle.chunks[0].receivedAtMs, 999_995);
  assert.equal(projected.cycle.chunks[0].completedAtMs, 1_000_000);
  assert.deepEqual(
    projected.cycle.securities.map((item) => item.collectedAtMs),
    [1_000_000, 1_000_000]
  );
  assert.deepEqual(
    projected.cycle.securities.map((item) => item.chunkReceivedAtMs),
    [999_995, 999_995]
  );
  assert.equal(projected.cycle.durationMs, 20);
  assert.deepEqual(projected.cycle.securities.map((item) => item.data), originalRows);
  assert.equal(projected.cycle.securities[0].data.TradeDateTime, "2026-10-05T14:31:00Z");
});

test("Market Player reproduces exact irregular 1x completion gaps", async () => {
  const source = sourceFromSnapshots([
    snapshot([row(1)], 1_000),
    snapshot([row(1)], 11_140),
    snapshot([row(1)], 21_082),
    snapshot([row(1)], 34_401)
  ]);
  const clock = createFakeClock(500_000);
  const producer = createFakeProducer();
  const player = createMarketReplayPlayer({
    source,
    producerBridge: producer,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });

  await player.play();
  assert.deepEqual(producer.cycles.map((cycle) => cycle.completedAtMs), [500_000]);
  assert.equal(clock.pending()[0].dueAtMs, 510_140);

  await clock.advance(10_139);
  assert.equal(producer.cycles.length, 1);
  await clock.advance(1);
  assert.deepEqual(producer.cycles.map((cycle) => cycle.completedAtMs), [500_000, 510_140]);

  await clock.advance(9_942);
  assert.deepEqual(producer.cycles.map((cycle) => cycle.completedAtMs), [500_000, 510_140, 520_082]);
  await clock.advance(13_319);
  assert.deepEqual(
    producer.cycles.map((cycle) => cycle.completedAtMs),
    [500_000, 510_140, 520_082, 533_401]
  );
  assert.equal(player.getState().status, "completed");
  assert.equal(producer.calls.at(-1).type, "producer.session.stop");
});

test("Pause freezes position; Resume preserves remaining delay in a contemporary timing segment", async () => {
  const source = sourceFromSnapshots([
    snapshot([row(1)], 1_000),
    snapshot([row(1)], 11_000),
    snapshot([row(1)], 20_000)
  ]);
  const clock = createFakeClock(100_000);
  const producer = createFakeProducer();
  const player = createMarketReplayPlayer({
    source,
    producerBridge: producer,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });

  await player.play();
  await clock.advance(4_000);
  const paused = player.pause();
  assert.equal(paused.status, "paused");
  assert.equal(paused.positionMs, 4_000);
  assert.equal(paused.remainingDelayMs, 6_000);

  clock.advanceWithoutTimers(5_000);
  assert.equal(producer.cycles.length, 1);
  const resumed = await player.resume();
  assert.equal(resumed.remainingDelayMs, 6_000);

  await clock.advance(5_999);
  assert.equal(producer.cycles.length, 1);
  await clock.advance(1);
  assert.equal(producer.cycles.length, 2);
  assert.equal(producer.cycles[1].completedAtMs, 115_000);
  assert.equal(producer.cycles[1].startedAtMs, 114_980);
});

test("ACK gating prevents scheduling the next frame before the current commit resolves", async () => {
  const source = sourceFromSnapshots([
    snapshot([row(1)], 1_000),
    snapshot([row(1)], 2_000)
  ]);
  const clock = createFakeClock(50_000);
  const gate = deferred();
  const producer = createFakeProducer({ firstCommitGate: gate });
  const player = createMarketReplayPlayer({
    source,
    producerBridge: producer,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });

  const playPromise = player.play();
  await settle();
  assert.equal(producer.cycles.length, 1);
  assert.equal(clock.pending().length, 0);

  gate.resolve();
  await playPromise;
  assert.equal(clock.pending().length, 1);
  assert.equal(clock.pending()[0].dueAtMs, 51_000);
});

test("Pause and Seek generation changes suppress stale scheduled callbacks", async () => {
  const source = sourceFromSnapshots([
    snapshot([row(1)], 1_000),
    snapshot([row(1)], 11_000),
    snapshot([row(1), row(2)], 21_000)
  ]);
  const clock = createFakeClock(200_000);
  const producer = createFakeProducer();
  const player = createMarketReplayPlayer({
    source,
    producerBridge: producer,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });

  await player.play();
  const beforePause = clock.latestHandle();
  player.pause();
  await clock.fireEvenIfCancelled(beforePause);
  assert.equal(producer.cycles.length, 1);

  await player.resume();
  const beforeSeek = clock.latestHandle();
  const sought = await player.seek(2);
  assert.equal(sought.status, "seek_pending");
  assert.equal(sought.selectedSequence, 2);
  assert.equal(sought.requiresFreshRun, true);
  await clock.fireEvenIfCancelled(beforeSeek);
  assert.equal(producer.cycles.length, 1);
  assert.equal(producer.calls.at(-1).type, "producer.session.stop");
});

test("shared producer protocol remains Replay-unaware", () => {
  const forbidden = /replay|seek|playback|recording|virtual.?clock|fast.?forward/iu;
  assert.deepEqual(REQUEST_TYPES.filter((type) => forbidden.test(type)), []);
});
