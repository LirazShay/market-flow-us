import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LOCAL_ACCEPTANCE_PROFILES,
  resolveLocalAcceptanceProfile,
  sanitizeAcceptanceDiagnostic
} from "../../scripts/run-local-acceptance.mjs";

test("local acceptance profiles route to the intended first-run checkpoints and existing runners", () => {
  assert.deepEqual(Object.keys(LOCAL_ACCEPTANCE_PROFILES), [
    "static",
    "recovery",
    "all",
    "isolated",
    "target"
  ]);

  assert.deepEqual(resolveLocalAcceptanceProfile("static"), {
    checkpoint: "FR-7",
    kind: "playwright",
    grep: "repeated identical complete responses"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("recovery"), {
    checkpoint: "FR-8",
    kind: "playwright",
    grep: "preserves committed authority|applies add/remove membership"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("all"), {
    checkpoint: "FR-7+FR-8",
    kind: "playwright",
    grep: null
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("isolated"), {
    checkpoint: "FR-9",
    kind: "workload",
    workloadProfile: "target-day",
    detailReport: "isolated-target-day.json",
    detailEnv: "MARKET_FLOW_US_ISOLATED_REPORT"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("target"), {
    checkpoint: "FR-9",
    kind: "workload",
    workloadProfile: "target-e2e",
    detailReport: "target-4096x180.json",
    detailEnv: "MARKET_FLOW_US_WORKLOAD_REPORT"
  });
  assert.equal(resolveLocalAcceptanceProfile("unknown"), null);
});

test("local acceptance diagnostics redact machine paths and URLs and stay bounded", () => {
  const longTail = "x".repeat(5000);
  const raw = [
    `repo=${path.join(process.cwd(), "secret", "fixture.txt")}`,
    `home=${path.join(os.homedir(), "private", "state.json")}`,
    `temp=${path.join(os.tmpdir(), "market-flow-us", "fixture.duckdb")}`,
    "provider=https://example.test/private/session?id=123",
    longTail
  ].join("\n");

  const sanitized = sanitizeAcceptanceDiagnostic(raw);
  assert.equal(typeof sanitized, "string");
  assert.ok(sanitized.length <= 4000);
  assert.equal(sanitized.includes(process.cwd()), false);
  assert.equal(sanitized.includes(os.homedir()), false);
  assert.equal(sanitized.includes(os.tmpdir()), false);
  assert.equal(sanitized.includes("https://example.test"), false);
});
