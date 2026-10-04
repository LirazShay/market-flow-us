import assert from "node:assert/strict";
import test from "node:test";
import {
  createPersistenceFaultInjector,
  createServiceFixture
} from "./helpers/service-fixture.mjs";

test("service fixtures isolate real temp DuckDB paths, ephemeral ports and real ws clients", async () => {
  const [first, second] = await Promise.all([
    createServiceFixture(),
    createServiceFixture()
  ]);

  try {
    assert.notEqual(first.tempDir, second.tempDir);
    assert.notEqual(first.dbPath, second.dbPath);
    assert.notEqual(first.port, second.port);

    const firstViewer = await first.connect("viewer", "fixture-viewer-1");
    const secondViewer = await second.connect("viewer", "fixture-viewer-2");

    assert.equal(firstViewer.hello.type, "response.ok");
    assert.equal(secondViewer.hello.type, "response.ok");

    const rows = await first.rows(
      "SELECT schema_version, product_version FROM schema_info"
    );
    assert.deepEqual(rows, [{
      schema_version: 2,
      product_version: "test-version"
    }]);

    await Promise.all([
      firstViewer.close(),
      secondViewer.close()
    ]);
  } finally {
    await Promise.all([
      first.cleanup(),
      second.cleanup()
    ]);
  }
});

test("construction-time persistence fault injector is deterministic and not reachable through protocol", async () => {
  const fault = createPersistenceFaultInjector(["F2", "U1"]);

  assert.doesNotThrow(() => fault.hit("F1"));
  assert.throws(
    () => fault.hit("F2"),
    (error) => error?.name === "InjectedPersistenceFault" && error?.point === "F2"
  );
  assert.throws(
    () => fault.hit("U1"),
    (error) => error?.point === "U1"
  );

  const fixture = await createServiceFixture({ persistenceFault: fault });
  try {
    const viewer = await fixture.connect("viewer", "fault-viewer");
    const response = await viewer.send({
      v: 1,
      type: "test.persistence.fault",
      requestId: "fault-over-protocol",
      payload: { point: "F2" }
    });

    assert.equal(response.type, "response.error");
    assert.equal(response.requestId, "fault-over-protocol");
    assert.equal(response.payload.code, "INVALID_MESSAGE");
    assert.equal(response.payload.details, null);

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
