import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import {
  PORTABLE_REPLAY_FORMAT,
  PORTABLE_REPLAY_VERSION,
  ReplayPortableError,
  openPortableFileRecordingSource,
  validatePortableRecordingFile,
  writePortableRecording
} from "../../browser/replay/portable-recording.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";

function row(id, extra = {}) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
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
      startedAtMs: completedAtMs - 7,
      responseReceivedAtMs: completedAtMs - 2,
      completedAtMs
    },
    httpStatus: 200
  });
}

function fixture() {
  const recordingId = "portable-r1";
  const frames = [
    createReplayFrame({ recordingId, sequence: 0, snapshot: snapshot([row(2), row(1)], 1_000) }),
    createReplayFrame({ recordingId, sequence: 1, snapshot: snapshot([row(1), row(2)], 1_151) }),
    createReplayFrame({ recordingId, sequence: 2, snapshot: snapshot([row(1), row(2), row(3, { Price: 222.5 })], 1_907) }),
    createReplayFrame({ recordingId, sequence: 3, snapshot: snapshot([row(3), row(1)], 3_111) })
  ];
  const summary = {
    id: recordingId,
    name: "Portable proof",
    status: "complete",
    createdAtMs: 900,
    firstFrameAtMs: 1_000,
    lastFrameAtMs: 3_111,
    durationMs: 2_111,
    frameCount: frames.length,
    approximateBytes: 5_000,
    lastErrorCode: null
  };
  const frameIndex = frames.map((frame) => ({
    sequence: frame.sequence,
    completedAtMs: frame.snapshot.timing.completedAtMs
  }));
  const source = createRecordingSource({
    kind: "memory",
    summary,
    frameIndex,
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
  return { frames, source, summary };
}

async function exportFixture() {
  const { source, frames, summary } = fixture();
  const writes = [];
  let closed = false;
  const result = await writePortableRecording({
    source,
    writable: {
      async write(chunk) { writes.push(chunk); },
      async close() { closed = true; }
    }
  });
  return { writes, closed, result, frames, summary, file: new Blob(writes, { type: "application/x-ndjson" }) };
}

function rewriteLine(writes, index, mutate) {
  const records = [...writes];
  const value = JSON.parse(records[index]);
  mutate(value);
  records[index] = `${JSON.stringify(value)}\n`;
  return new Blob(records, { type: "application/x-ndjson" });
}

async function expectPortableFailure(file, code = "REPLAY_FILE_INVALID") {
  await assert.rejects(
    () => validatePortableRecordingFile(file),
    (error) => error instanceof ReplayPortableError && error.code === code
  );
}

test("portable Replay export is line-oriented streaming and preserves exact frame order/timing/provider values", async () => {
  const { writes, closed, result, frames, file } = await exportFixture();

  assert.equal(closed, true);
  assert.equal(writes.length, frames.length + 2, "manifest + one write per frame + footer");
  assert.equal(result.format, PORTABLE_REPLAY_FORMAT);
  assert.equal(result.version, PORTABLE_REPLAY_VERSION);
  assert.equal(result.recordingId, "portable-r1");
  assert.equal(result.frameCount, 4);
  assert.ok(result.bytesWritten > 0);

  const manifest = JSON.parse(writes[0]);
  const footer = JSON.parse(writes.at(-1));
  assert.deepEqual(manifest, {
    type: "manifest",
    format: "market-flow-us-replay",
    version: 1,
    recordingId: "portable-r1",
    name: "Portable proof",
    frameCount: 4,
    originalStartedAtMs: 1_000,
    originalCompletedAtMs: 3_111,
    originalDurationMs: 2_111
  });
  assert.deepEqual(footer, {
    type: "footer",
    format: "market-flow-us-replay",
    version: 1,
    recordingId: "portable-r1",
    frameCount: 4,
    terminalSequence: 3
  });

  const validated = await validatePortableRecordingFile(file);
  assert.deepEqual(validated.frameIndex.map(({ sequence, completedAtMs }) => ({ sequence, completedAtMs })), [
    { sequence: 0, completedAtMs: 1_000 },
    { sequence: 1, completedAtMs: 1_151 },
    { sequence: 2, completedAtMs: 1_907 },
    { sequence: 3, completedAtMs: 3_111 }
  ]);

  const fileSource = await openPortableFileRecordingSource({ file });
  assert.equal(fileSource.kind, "file");
  assert.deepEqual(fileSource.getSummary(), validated.summary);
  assert.deepEqual(await fileSource.getFrame(0), frames[0]);
  assert.deepEqual(await fileSource.getFrame(2), frames[2]);
  assert.equal((await fileSource.getFrame(2)).snapshot.records[2].Price, 222.5);
  assert.deepEqual((await fileSource.getFrame(3)).snapshot.responseIds, ["3", "1"]);
});

test("file source seek index resolves deterministic real frame boundaries", async () => {
  const { file } = await exportFixture();
  const source = await openPortableFileRecordingSource({ file });

  assert.equal(source.resolveFrameAtOrBefore(999), null);
  assert.equal(source.resolveFrameAtOrBefore(1_000), 0);
  assert.equal(source.resolveFrameAtOrBefore(1_150), 0);
  assert.equal(source.resolveFrameAtOrBefore(1_151), 1);
  assert.equal(source.resolveFrameAtOrBefore(1_906), 1);
  assert.equal(source.resolveFrameAtOrBefore(1_907), 2);
  assert.equal(source.resolveFrameAtOrBefore(99_999), 3);
});

test("portable validation fails closed for truncated, malformed, unsupported, duplicated/out-of-order and count-mismatched files", async () => {
  const { writes } = await exportFixture();

  await expectPortableFailure(new Blob(writes.slice(0, -1)));

  const malformed = [...writes];
  malformed[2] = "{this-is-not-json}\n";
  await expectPortableFailure(new Blob(malformed));

  await expectPortableFailure(rewriteLine(writes, 0, (manifest) => { manifest.version = 99; }), "REPLAY_FILE_UNSUPPORTED");
  await expectPortableFailure(rewriteLine(writes, 2, (frame) => { frame.sequence = 0; }));
  await expectPortableFailure(rewriteLine(writes, 2, (frame) => { frame.sequence = 3; }));
  await expectPortableFailure(rewriteLine(writes, 0, (manifest) => { manifest.frameCount = 5; }));
  await expectPortableFailure(rewriteLine(writes, writes.length - 1, (footer) => { footer.recordingId = "other"; }));

  const afterFooter = [...writes, `${JSON.stringify({ type: "extra" })}\n`];
  await expectPortableFailure(new Blob(afterFooter));
});

test("portable validation re-runs exact snapshot validation instead of trusting frame JSON", async () => {
  const { writes } = await exportFixture();
  await expectPortableFailure(rewriteLine(writes, 1, (frame) => {
    frame.snapshot.recordCount += 1;
  }));
  await expectPortableFailure(rewriteLine(writes, 1, (frame) => {
    frame.snapshot.membership = ["999"];
  }));
});

test("portable file frame reads use indexed byte ranges after validation", async () => {
  const { writes } = await exportFixture();
  const blob = new Blob(writes);
  const sliceCalls = [];
  const file = {
    size: blob.size,
    stream: () => blob.stream(),
    slice(start, end) {
      sliceCalls.push({ start, end });
      return blob.slice(start, end);
    }
  };

  const source = await openPortableFileRecordingSource({ file });
  assert.equal(sliceCalls.length, 0, "validation streams the file instead of slicing every frame");

  const frame = await source.getFrame(3);
  assert.equal(frame.sequence, 3);
  assert.equal(sliceCalls.length, 1);
  assert.ok(sliceCalls[0].end > sliceCalls[0].start);
});
