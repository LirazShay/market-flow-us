import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_SERVICE_CONFIG,
  parseServiceConfig
} from "../../local-service/server/config.js";

test("service config uses secure defaults and accepts repeatable exact Origins", () => {
  const config = parseServiceConfig([
    "--allowed-origin", "https://example.test",
    "--allowed-origin", "http://127.0.0.1:9000"
  ], { cwd: "/tmp/market-flow-us-config" });

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, DEFAULT_SERVICE_CONFIG.port);
  assert.equal(config.maxInboundMessageBytes, 16 * 1024 * 1024);
  assert.equal(config.producerHeartbeatMs, 5000);
  assert.equal(config.producerStaleAfterMs, 15000);
  assert.equal(config.historyPageSize, 500);
  assert.deepEqual(config.allowedOrigins, [
    "https://example.test",
    "http://127.0.0.1:9000"
  ]);
  assert.deepEqual(config.buy, {
    enabled: false,
    quantity: null,
    mode: "DRY_RUN"
  });
  assert.equal(
    config.dbPath,
    path.resolve("/tmp/market-flow-us-config", "data", "market-flow-us.duckdb")
  );
});

test("service config accepts explicit local overrides only", () => {
  const config = parseServiceConfig([
    "--db", "state/test.duckdb",
    "--host", "::1",
    "--port", "0",
    "--allowed-origin", "http://localhost:3210"
  ], { cwd: "/tmp/market-flow-us-config" });

  assert.equal(config.host, "::1");
  assert.equal(config.port, 0);
  assert.equal(
    config.dbPath,
    path.resolve("/tmp/market-flow-us-config", "state", "test.duckdb")
  );
});

test("BUY run configuration is disabled by default and DRY_RUN unless LIVE is explicit", () => {
  const dryRun = parseServiceConfig([
    "--allowed-origin", "https://example.test",
    "--buy-quantity", "2.5"
  ], { cwd: "/tmp/market-flow-us-config" });

  assert.deepEqual(dryRun.buy, {
    enabled: true,
    quantity: 2.5,
    mode: "DRY_RUN"
  });
  assert.equal(Object.isFrozen(dryRun.buy), true);

  const live = parseServiceConfig([
    "--allowed-origin", "https://example.test",
    "--buy-quantity", "3",
    "--buy-live"
  ], { cwd: "/tmp/market-flow-us-config" });

  assert.deepEqual(live.buy, {
    enabled: true,
    quantity: 3,
    mode: "LIVE"
  });
});

test("BUY run configuration rejects missing, repeated or non-positive quantity and implicit LIVE", () => {
  const withOrigin = (...args) => [
    "--allowed-origin", "https://example.test",
    ...args
  ];

  for (const value of ["0", "-1", "NaN", "Infinity"]) {
    assert.throws(
      () => parseServiceConfig(withOrigin("--buy-quantity", value)),
      /positive finite number/
    );
  }

  assert.throws(
    () => parseServiceConfig(withOrigin("--buy-live")),
    /requires --buy-quantity/
  );
  assert.throws(
    () => parseServiceConfig(withOrigin(
      "--buy-quantity", "1",
      "--buy-quantity", "2"
    )),
    /only once/
  );
  assert.throws(
    () => parseServiceConfig(withOrigin(
      "--buy-quantity", "1",
      "--buy-live",
      "--buy-live"
    )),
    /only once/
  );
});

test("service config fails closed for missing/wildcard/path Origins, non-loopback host and unknown options", () => {
  assert.throws(() => parseServiceConfig([]), /allowed-origin/);
  assert.throws(
    () => parseServiceConfig(["--allowed-origin", "*"]),
    /Wildcard Origin/
  );
  assert.throws(
    () => parseServiceConfig(["--allowed-origin", "https://example.test/path"]),
    /scheme \+ host/
  );
  assert.throws(
    () => parseServiceConfig([
      "--host", "0.0.0.0",
      "--allowed-origin", "https://example.test"
    ]),
    /loopback/
  );
  assert.throws(
    () => parseServiceConfig([
      "--bogus", "x",
      "--allowed-origin", "https://example.test"
    ]),
    /Unknown option/
  );
});
