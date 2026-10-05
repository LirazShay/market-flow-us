import assert from "node:assert/strict";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function failureReport(error) {
  return {
    report: {
      phase: "provider-fetch",
      startedAtMs: 2000,
      failedAtMs: 2050,
      requested: 1,
      received: null,
      unique: null,
      missing: null,
      duplicates: null,
      unexpected: null,
      error
    }
  };
}

test("trusted status read never re-emits arbitrary persisted failure text", async () => {
  const fixture = await createServiceFixture({
    now: () => 5000,
    openDatabase: openMarketFlowUsDatabase
  });

  try {
    const producer = await fixture.connect("producer", "a3-producer");
    const viewer = await fixture.connect("viewer", "a3-viewer");

    const started = await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(started.type, "response.ok");

    const rawSecret = "cookie=SENTINEL_COOKIE account=SENTINEL_ACCOUNT authorization=SENTINEL_AUTH";
    const failed = await producer.request("producer.cycle.failed", failureReport({
      name: "RawProviderError",
      message: rawSecret
    }));
    assert.equal(failed.type, "response.ok");

    const status = await viewer.request("viewer.status.get");
    assert.equal(status.type, "response.ok");
    assert.equal(status.payload.data.recorderHealth, "ERROR");
    assert.deepEqual(status.payload.data.lastError, {
      name: "CollectionError",
      message: "A sanitized collection error was recorded."
    });
    assert.equal(JSON.stringify(status).includes("SENTINEL_"), false);

    const safeFailed = await producer.request("producer.cycle.failed", failureReport({
      name: "ProviderSnapshotError",
      message: "Provider snapshot acquisition or validation failed."
    }));
    assert.equal(safeFailed.type, "response.ok");

    const safeStatus = await viewer.request("viewer.status.get");
    assert.deepEqual(safeStatus.payload.data.lastError, {
      name: "ProviderSnapshotError",
      message: "Provider snapshot acquisition or validation failed."
    });

    await producer.close();
    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
