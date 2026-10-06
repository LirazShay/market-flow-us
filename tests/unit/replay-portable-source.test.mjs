import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import {
  createIndexedDbRecordingSource,
  createRecordingSource
} from "../../browser/replay/recording-source.js";
import {
  REPLAY_PORTABLE_FORMAT,
  REPLAY_PORTABLE_VERSION,
  ReplayPortableFormatError,
  exportPortableReplay,
  openPortableReplayFile
} from "../../browser/replay/portable-format.js";

function row(id, extra = {}) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
    Price: 100 + Number(id),
    DailyVolume: 1_000 + Number(id),
    ...extra
  };
}

function snapshot(ids, completedAtMs) {
  return buildValidatedSnapshot({
    responseJson: {
      data: { ScreenerHulPaging: { recordCount: ids.length, records: ids.map((id) => row(id)) } },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-provider-node"
    },
    timing: {
      startedAtMs: completedAtMs - 8,
      responseReceivedAtMs: completedAtMs - 3,
      completedAtMs
    },
    httpStatus: 200
  });
}

function frames() {
  return [
    createReplayFrame({ recordingId: "r-portable", sequence: 0, snapshot: snapshot([2, 1], 1_000) }),
    createReplayFrame({ recordingId: "r-portable", sequence: 1, snapshot: snapshot([1, 2], 1_137) }),
    createReplayFrame({ recordingId: "r-portable", sequence: 2, snapshot: snapshot([1, 2, 3], 1_911) }),
    createReplayFrame({ recordingId: "r-portable", sequence: 3, snapshot: snapshot([3, 1], 3_006) })
  ];
}

function metadata(frameList) {
  const first = frameList[0]?.snapshot.timing.completedAtMs ?? null;
  const last = frameList.at(-1)?.snapshot.timing.completedAtMs ?? null;
  return {
    recordingId: "r-portable",
    frameCount: frameList.length,
    originalStartedAtMs: first,
    originalCompletedAtMs: last,
    originalDurationMs: first === null || last === null ? 0 : last - first
  };
}

function memoryWriter() {
  const chunks = [];
  let closed = false;
  return {
    chunks,
    get closed() { return closed; },
    async write(value) { chunks.push(String(value)); },
    async close() { closed = true; }
  };
}

function sourceFor(frameList, readCalls = []) {
  return createRecordingSource({
    kind: "fixture",
    metadata: metadata(frameList),
    async readFrame(sequence) {
      readCalls.push(sequence);
      return structuredClone(frameList[sequence]);
    }
  });
}

async function portableText(frameList = frames()) {
  const writer = memoryWriter();
  await exportPortableReplay({ source: sourceFor(frameList), writable: writer });
  return writer.chunks.join("");
}

test("portable export is versioned line-oriented and reads one source frame at a time", async () => {
  const frameList = frames();
  const readCalls = [];
  const source = sourceFor(frameList, readCalls);
  const writer = memoryWriter();

  const result = await exportPortableReplay({ source, writable: writer });

  assert.equal(writer.closed, true);
  assert.deepEqual(readCalls, [0, 1, 2, 3]);
  assert.equal(writer.chunks.length, frameList.length + 2);
  assert.equal(writer.chunks.every((chunk) => chunk.endsWith("\n")), true);
  assert.equal(result.frameCount, frameList.length);
  assert.equal(result.recordingId, "r-portable");

  const lines = writer.chunks.map((chunk) => JSON.parse(chunk));
  assert.deepEqual(lines[0], {
    type: "manifest",
    format: REPLAY_PORTABLE_FORMAT,
    version: REPLAY_PORTABLE_VERSION,
    recordingId: "r-portable",
    frameCount: 4,
    originalStartedAtMs: 1_000,
    originalCompletedAtMs: 3_006,
    originalDurationMs: 2_006
  });
  assert.deepEqual(lines.slice(1, -1).map((line) => line.sequence), [0, 1, 2, 3]);
  assert.deepEqual(lines.at(-1), {
    type: "footer",
    format: REPLAY_PORTABLE_FORMAT,
    version: REPLAY_PORTABLE_VERSION,
    recordingId: "r-portable",
    frameCount: 4,
    lastSequence: 3
  });
});

test("validated portable File source reads frames directly and resolves deterministic real frame boundaries", async () => {
  const text = await portableText();
  const file = new Blob([text], { type: "application/x-ndjson" });
  const source = await openPortableReplayFile(file, { chunkSize: 47 });

  assert.equal(source.kind, "file");
  assert.deepEqual(source.metadata, metadata(frames()));
  assert.deepEqual(await source.getFrameIndex(), [
    { sequence: 0, completedAtMs: 1_000 },
    { sequence: 1, completedAtMs: 1_137 },
    { sequence: 2, completedAtMs: 1_911 },
    { sequence: 3, completedAtMs: 3_006 }
  ]);
  assert.deepEqual(await source.readFrame(2), frames()[2]);
  assert.equal(await source.resolveFrameAtOrBefore(0), 0);
  assert.equal(await source.resolveFrameAtOrBefore(136), 0);
  assert.equal(await source.resolveFrameAtOrBefore(137), 1);
  assert.equal(await source.resolveFrameAtOrBefore(2_005), 2);
  assert.equal(await source.resolveFrameAtOrBefore(2_006), 3);
});

test("IndexedDB-backed and File-backed sources expose equivalent frame semantics without whole-recording reads", async () => {
  const frameList = frames();
  const readCalls = [];
  const store = {
    async getRecording(id) {
      assert.equal(id, "r-portable");
      return {
        id,
        name: "Indexed recording",
        status: "complete",
        firstFrameAtMs: 1_000,
        lastFrameAtMs: 3_006,
        durationMs: 2_006,
        frameCount: 4,
        approximateBytes: 1234
      };
    },
    async readFrame(id, sequence) {
      assert.equal(id, "r-portable");
      readCalls.push(sequence);
      return structuredClone(frameList[sequence]);
    }
  };
  const indexed = await createIndexedDbRecordingSource({ store, recordingId: "r-portable" });
  assert.deepEqual(readCalls, [], "opening IndexedDB source must not eagerly load all frames");
  assert.deepEqual(await indexed.readFrame(1), frameList[1]);
  assert.deepEqual(readCalls, [1]);

  const file = await openPortableReplayFile(new Blob([await portableText(frameList)]));
  for (let sequence = 0; sequence < frameList.length; sequence += 1) {
    assert.deepEqual(await indexed.readFrame(sequence), await file.readFrame(sequence));
  }
  assert.equal(await indexed.resolveFrameAtOrBefore(911), 2);
  assert.equal(await file.resolveFrameAtOrBefore(911), 2);
});

test("portable validation fails closed for malformed/truncated/version/order/count/frame defects", async () => {
  const validText = await portableText();
  const validLines = validText.trimEnd().split("\n").map((line) => JSON.parse(line));
  const cases = [];

  const wrongVersion = structuredClone(validLines);
  wrongVersion[0].version = 999;
  cases.push(wrongVersion);

  cases.push(validLines.slice(0, -1));

  const duplicate = structuredClone(validLines);
  duplicate[2].sequence = 0;
  cases.push(duplicate);

  const countMismatch = structuredClone(validLines);
  countMismatch[0].frameCount = 5;
  cases.push(countMismatch);

  const footerMismatch = structuredClone(validLines);
  footerMismatch.at(-1).lastSequence = 2;
  cases.push(footerMismatch);

  const invalidFrame = structuredClone(validLines);
  invalidFrame[1].snapshot.recordCount = 999;
  cases.push(invalidFrame);

  const sensitiveExtra = structuredClone(validLines);
  sensitiveExtra[1].snapshot.requestHeaders = { Authorization: "SECRET" };
  cases.push(sensitiveExtra);

  for (const records of cases) {
    const blob = new Blob([records.map((record) => JSON.stringify(record)).join("\n") + "\n"]);
    await assert.rejects(
      () => openPortableReplayFile(blob),
      (error) => error instanceof ReplayPortableFormatError
    );
  }

  await assert.rejects(
    () => openPortableReplayFile(new Blob(["{not-json}\n"])),
    (error) => error instanceof ReplayPortableFormatError
  );
});
