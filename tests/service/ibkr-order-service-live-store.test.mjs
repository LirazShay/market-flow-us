import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  ACKNOWLEDGEMENT_UNKNOWN,
  DRY_RUN_COMPLETE,
  FILLED,
  READY_TO_SUBMIT,
  REPLY_REQUIRED,
  openOrderExecutionStore
} from "../../ibkr-order-service/store.js";

const DRY_ORDER_ID = "ord_11111111-1111-4111-8111-111111111111";
const LIVE_ORDER_ID = "ord_22222222-2222-4222-8222-222222222222";
const DUPLICATE_ORDER_ID = "ord_33333333-3333-4333-8333-333333333333";
const DRY_FINGERPRINT = "a".repeat(64);
const LIVE_FINGERPRINT = "b".repeat(64);

function expectedDryKeys(row) {
  assert.deepEqual(Object.keys(row).sort(), [
    "createdAtMs",
    "intentFingerprint",
    "lifecycleState",
    "localOrderId",
    "requestId",
    "updatedAtMs"
  ]);
}

test("TREE 8.2 store extends an existing dry-run database without changing DRY_RUN row shape", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-order-live-store-"));
  const dbPath = path.join(tempDir, "orders.duckdb");
  let store = null;

  try {
    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_010_000 });
    const dry = await store.insertDryRun({
      requestId: "req-dry-existing",
      intentFingerprint: DRY_FINGERPRINT,
      localOrderId: DRY_ORDER_ID
    });
    expectedDryKeys(dry);
    assert.equal(dry.lifecycleState, DRY_RUN_COMPLETE);
    assert.equal(await store.getProviderState(DRY_ORDER_ID), null);

    await store.close();
    store = null;

    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_010_500 });
    const reopened = await store.getByRequestId("req-dry-existing");
    expectedDryKeys(reopened);
    assert.equal(reopened.localOrderId, DRY_ORDER_ID);
    assert.equal(reopened.lifecycleState, DRY_RUN_COMPLETE);
    assert.equal(await store.getProviderState(DRY_ORDER_ID), null);
  } finally {
    if (store) await store.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("LIVE identity/provider state commits together, transitions atomically, and survives restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-order-live-store-"));
  const dbPath = path.join(tempDir, "orders.duckdb");
  const timestamps = [
    1_700_000_020_000,
    1_700_000_020_100,
    1_700_000_020_200,
    1_700_000_020_300
  ];
  let store = null;

  try {
    store = await openOrderExecutionStore({
      dbPath,
      now: () => timestamps.shift() ?? 1_700_000_020_999
    });

    const inserted = await store.insertLive({
      requestId: "req-live-store",
      intentFingerprint: LIVE_FINGERPRINT,
      localOrderId: LIVE_ORDER_ID,
      providerConid: 265598,
      requestedQuantity: 2
    });
    assert.equal(inserted.execution.lifecycleState, READY_TO_SUBMIT);
    assert.deepEqual(inserted.provider, {
      localOrderId: LIVE_ORDER_ID,
      providerConid: 265598,
      requestedQuantity: 2,
      providerOrderId: null,
      replyId: null,
      replyMessageIds: [],
      filledQuantity: 0,
      updatedAtMs: 1_700_000_020_000
    });

    const reply = await store.updateLiveState({
      localOrderId: LIVE_ORDER_ID,
      lifecycleState: REPLY_REQUIRED,
      replyId: "SYNTH-REPLY-1",
      replyMessageIds: ["o163"]
    });
    assert.equal(reply.execution.lifecycleState, REPLY_REQUIRED);
    assert.equal(reply.provider.replyId, "SYNTH-REPLY-1");
    assert.deepEqual(reply.provider.replyMessageIds, ["o163"]);

    const uncertain = await store.updateLiveState({
      localOrderId: LIVE_ORDER_ID,
      lifecycleState: ACKNOWLEDGEMENT_UNKNOWN,
      replyId: null,
      replyMessageIds: []
    });
    assert.equal(uncertain.execution.lifecycleState, ACKNOWLEDGEMENT_UNKNOWN);
    assert.equal(uncertain.provider.replyId, null);
    assert.deepEqual(uncertain.provider.replyMessageIds, []);

    const filled = await store.updateLiveState({
      localOrderId: LIVE_ORDER_ID,
      lifecycleState: FILLED,
      providerOrderId: "SYNTH-ORDER-1",
      filledQuantity: 2
    });
    assert.equal(filled.execution.lifecycleState, FILLED);
    assert.equal(filled.provider.providerOrderId, "SYNTH-ORDER-1");
    assert.equal(filled.provider.filledQuantity, 2);

    await store.close();
    store = null;

    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_021_000 });
    const executionAfterRestart = await store.getByRequestId("req-live-store");
    const providerAfterRestart = await store.getProviderState(LIVE_ORDER_ID);
    assert.equal(executionAfterRestart.localOrderId, LIVE_ORDER_ID);
    assert.equal(executionAfterRestart.lifecycleState, FILLED);
    assert.deepEqual(providerAfterRestart, {
      localOrderId: LIVE_ORDER_ID,
      providerConid: 265598,
      requestedQuantity: 2,
      providerOrderId: "SYNTH-ORDER-1",
      replyId: null,
      replyMessageIds: [],
      filledQuantity: 2,
      updatedAtMs: 1_700_000_020_300
    });
  } finally {
    if (store) await store.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("duplicate LIVE identity rolls back provider-state insert and persistence excludes private canaries", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-order-live-store-"));
  const dbPath = path.join(tempDir, "orders.duckdb");
  let store = null;

  try {
    store = await openOrderExecutionStore({ dbPath, now: () => 1_700_000_030_000 });
    await store.insertLive({
      requestId: "req-live-duplicate",
      intentFingerprint: LIVE_FINGERPRINT,
      localOrderId: LIVE_ORDER_ID,
      providerConid: 265598,
      requestedQuantity: 1
    });

    await assert.rejects(
      store.insertLive({
        requestId: "req-live-duplicate",
        intentFingerprint: "c".repeat(64),
        localOrderId: DUPLICATE_ORDER_ID,
        providerConid: 8314,
        requestedQuantity: 3
      })
    );
    assert.equal(await store.getProviderState(DUPLICATE_ORDER_ID), null);
    assert.equal((await store.getByRequestId("req-live-duplicate")).localOrderId, LIVE_ORDER_ID);

    await assert.rejects(
      store.updateLiveState({
        localOrderId: LIVE_ORDER_ID,
        lifecycleState: FILLED,
        filledQuantity: 2
      })
    );

    await store.close();
    store = null;

    const rawDatabase = await readFile(dbPath);
    for (const forbidden of [
      "SYNTH-ACCOUNT-PRIVATE",
      "PRIVATE-SESSION-TOKEN",
      "PRIVATE-COOKIE",
      "PRIVATE-WARNING-TEXT"
    ]) {
      assert.equal(rawDatabase.includes(Buffer.from(forbidden, "utf8")), false, forbidden);
    }
  } finally {
    if (store) await store.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
