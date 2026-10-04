import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_MARKET_FLOW_US_SERVICE_CONFIG,
  MARKET_FLOW_US_DB_FILENAME,
  parseMarketFlowUsServiceConfig
} from "../../local-service/server/config.js";

test("Market Flow US service config defaults to its own database filename", () => {
  const config = parseMarketFlowUsServiceConfig([
    "--allowed-origin", "https://example.test"
  ], { cwd: "/tmp/market-flow-us-config" });

  assert.equal(MARKET_FLOW_US_DB_FILENAME, "market-flow-us.duckdb");
  assert.equal(
    DEFAULT_MARKET_FLOW_US_SERVICE_CONFIG.dbPath,
    path.resolve("data", "market-flow-us.duckdb")
  );
  assert.equal(
    config.dbPath,
    path.resolve("/tmp/market-flow-us-config", "data", "market-flow-us.duckdb")
  );
  assert.deepEqual(config.allowedOrigins, ["https://example.test"]);
});
