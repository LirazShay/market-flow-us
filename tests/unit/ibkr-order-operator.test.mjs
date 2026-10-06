import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CPGW_BASE_URL,
  operatorUsage,
  parseOperatorArgs
} from "../../ibkr-order-service/operator-config.js";
import { DEFAULT_ORDER_STORE_PATH } from "../../ibkr-order-service/store.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("operator defaults are DRY_RUN with loopback CPGW and the separate execution store", () => {
  const config = parseOperatorArgs([]);
  assert.deepEqual(config, {
    processLiveEnabled: false,
    allowInsecureLoopbackTls: false,
    cpgwBaseUrl: DEFAULT_CPGW_BASE_URL,
    dbPath: DEFAULT_ORDER_STORE_PATH,
    help: false
  });
  assert.equal(Object.isFrozen(config), true);
});

test("LIVE and insecure localhost TLS require independent explicit flags", () => {
  const live = parseOperatorArgs(["--live"]);
  assert.equal(live.processLiveEnabled, true);
  assert.equal(live.allowInsecureLoopbackTls, false);

  const insecure = parseOperatorArgs(["--allow-insecure-loopback-tls"]);
  assert.equal(insecure.processLiveEnabled, false);
  assert.equal(insecure.allowInsecureLoopbackTls, true);
});

test("CPGW override accepts HTTPS loopback only and never accepts credential-like URL data", () => {
  assert.equal(
    parseOperatorArgs(["--cpgw-url=https://127.0.0.1:5000/v1/api"]).cpgwBaseUrl,
    "https://127.0.0.1:5000/v1/api"
  );
  assert.equal(
    parseOperatorArgs(["--cpgw-url=https://[::1]:5000/v1/api"]).cpgwBaseUrl,
    "https://[::1]:5000/v1/api"
  );

  for (const value of [
    "http://localhost:5000/v1/api",
    "https://example.com:5000/v1/api",
    "https://user:secret@localhost:5000/v1/api",
    "https://localhost:5000/v1/api?token=secret",
    "https://localhost:5000/v1/api#secret"
  ]) {
    assert.throws(() => parseOperatorArgs([`--cpgw-url=${value}`]), TypeError);
  }
});

test("operator rejects unknown options and bounds the execution-store path", () => {
  assert.throws(() => parseOperatorArgs(["--enable-everything"]), /unknown order-service option/u);
  assert.throws(() => parseOperatorArgs(["--db="]), /non-empty bounded value/u);
  assert.throws(() => parseOperatorArgs([`--db=${"x".repeat(1025)}`]), /non-empty bounded value/u);
  assert.equal(parseOperatorArgs(["--db=data/custom-order.duckdb"]).dbPath, "data/custom-order.duckdb");
});

test("operator entrypoint keeps caller token off console and exposes it only through in-memory IPC", async () => {
  const [indexSource, operatorSource] = await Promise.all([
    readFile(path.join(ROOT, "ibkr-order-service", "index.js"), "utf8"),
    readFile(path.join(ROOT, "ibkr-order-service", "operator.js"), "utf8")
  ]);

  assert.match(indexSource, /typeof process\.send === "function"/u);
  assert.match(indexSource, /callerToken: runtime\.callerToken/u);
  assert.match(indexSource, /caller-token=ephemeral-not-logged/u);
  assert.doesNotMatch(indexSource, /console\.(?:log|error)\([^\n]*runtime\.callerToken/u);
  assert.doesNotMatch(indexSource, /writeFile|appendFile|localStorage|sessionStorage/u);

  assert.match(operatorSource, /processLiveEnabled: config\.processLiveEnabled === true/u);
  assert.doesNotMatch(operatorSource, /\bport\s*:/u);
});

test("operator help makes DRY_RUN default and deliberate LIVE opt-in explicit", () => {
  const usage = operatorUsage();
  assert.match(usage, /Default mode is DRY_RUN/u);
  assert.match(usage, /unless --live is supplied/u);
  assert.match(usage, /loopback CPGW client/u);
});
