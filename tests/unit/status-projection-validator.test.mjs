import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VALIDATOR = path.join(ROOT, "scripts", "validate-status-projection.mjs");

function execution(status) {
  return [
    "# Fixture execution",
    "",
    "| Task | Owner | Status | Depends on | Result/Evidence |",
    "|---|---|---|---|---|",
    `| \`B-US-009\` | Target-machine acceptance executor | \`${status}\` | \`12.9\` | fixture |`,
    ""
  ].join("\n");
}

function statusProjection({ status, activationRequired }) {
  return [
    "current:",
    "  chat: null",
    '  node: "B-US-009"',
    `  status: ${status}`,
    `  activation_required: ${activationRequired}`,
    "",
    "execution_projection:",
    "  active_execution_rows: 1",
    `  done: ${status === "done" ? 1 : 0}`,
    `  pending: ${status === "pending" ? 1 : 0}`,
    `  in_progress: ${status === "in_progress" ? 1 : 0}`,
    `  blocked: ${status === "blocked" ? 1 : 0}`,
    "  current_chat: null",
    '  current_node: "B-US-009"',
    "",
    "next_pointer:",
    '  task: "B-US-009"',
    '  owner: "Target-machine acceptance executor"',
    `  status: ${status}`,
    ""
  ].join("\n");
}

async function runFixture({ status, activationRequired }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-status-projection-"));
  try {
    await mkdir(path.join(tempDir, ".planning"), { recursive: true });
    await Promise.all([
      writeFile(path.join(tempDir, ".planning", "EXECUTION.md"), execution(status), "utf8"),
      writeFile(path.join(tempDir, "STATUS.yaml"), statusProjection({ status, activationRequired }), "utf8")
    ]);
    return await execFileAsync(process.execPath, [VALIDATOR], {
      cwd: tempDir,
      windowsHide: true
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("STATUS projection accepts a blocked current task without pretending activation can start it", async () => {
  const result = await runFixture({
    status: "blocked",
    activationRequired: false
  });

  assert.match(result.stdout, /currentStatus: 'blocked'/u);
});

test("STATUS projection rejects a blocked current task marked as activation-required", async () => {
  await assert.rejects(
    runFixture({
      status: "blocked",
      activationRequired: true
    }),
    (error) => {
      assert.equal(error?.code, 1);
      assert.match(error?.stderr ?? "", /current\.activation_required: expected false, got true/u);
      return true;
    }
  );
});

test("STATUS projection still rejects a done task as the current pointer", async () => {
  await assert.rejects(
    runFixture({
      status: "done",
      activationRequired: false
    }),
    (error) => {
      assert.equal(error?.code, 1);
      assert.match(error?.stderr ?? "", /must be pending, in_progress or blocked, got done/u);
      return true;
    }
  );
});
