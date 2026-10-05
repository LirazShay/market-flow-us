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
    "moving",
    "membership",
    "provider-recovery",
    "restart",
    "all",
    "isolated",
    "target"
  ]);

  assert.deepEqual(resolveLocalAcceptanceProfile("static"), {
    checkpoint: "FR-7",
    kind: "playwright",
    testFile: "tests/e2e/us-runtime-membership-recovery.spec.mjs",
    grep: "repeated identical complete responses"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("moving"), {
    checkpoint: "FR-8A",
    kind: "playwright",
    testFile: "tests/e2e/us-runtime-moving-values.spec.mjs",
    grep: "moves Current values while preserving prior values in History"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("membership"), {
    checkpoint: "FR-8B",
    kind: "playwright",
    testFile: "tests/e2e/us-runtime-membership-recovery.spec.mjs",
    grep: "applies add/remove membership under acknowledged universe revisions"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("provider-recovery"), {
    checkpoint: "FR-8C",
    kind: "playwright",
    testFile: "tests/e2e/us-runtime-membership-recovery.spec.mjs",
    grep: "records provider failure, recovers, and executes staged Scanner"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("restart"), {
    checkpoint: "FR-8D",
    kind: "playwright",
    testFile: "tests/e2e/us-runtime-membership-recovery.spec.mjs",
    grep: "preserves committed authority across service restart"
  });
  assert.deepEqual(resolveLocalAcceptanceProfile("all"), {
    checkpoint: "FR-7+FR-8",
    kind: "composite",
    profiles: [
      "static",
      "moving",
      "membership",
      "provider-recovery",
      "restart"
    ]
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

test("local acceptance diagnostics redact machine paths and URLs", () => {
  const raw = [
    `repo=${path.join(process.cwd(), "secret", "fixture.txt")}`,
    `home=${path.join(os.homedir(), "private", "state.json")}`,
    `temp=${path.join(os.tmpdir(), "market-flow-us", "fixture.duckdb")}`,
    "provider=https://example.test/private/session?id=123"
  ].join("\n");

  const sanitized = sanitizeAcceptanceDiagnostic(raw);
  assert.equal(typeof sanitized, "string");
  assert.equal(sanitized.includes(process.cwd()), false);
  assert.equal(sanitized.includes(os.homedir()), false);
  assert.equal(sanitized.includes(os.tmpdir()), false);
  assert.equal(sanitized.includes("https://example.test"), false);
  assert.match(sanitized, /<repo>|<home>|<temp>/);
  assert.match(sanitized, /<url>/);
});

test("local acceptance diagnostics keep only a bounded tail", () => {
  const sanitized = sanitizeAcceptanceDiagnostic("x".repeat(5000));
  assert.equal(sanitized.length, 4000);
  assert.equal(sanitized, "x".repeat(4000));
});
