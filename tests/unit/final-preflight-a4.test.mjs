import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertLoopbackPortsAvailable } from "../../scripts/check-demo-ports.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const POST_SETUP_LAUNCHERS = Object.freeze([
  "RUN_TESTS.cmd",
  "START_DEMO.cmd",
  "RESET_DEMO.cmd",
  "START_MARKET_FLOW_US.cmd",
  "PREPARE_LIVE_VERIFICATION.cmd",
  "RUN_LOCAL_ACCEPTANCE.cmd",
  "NEW_TRADING_DAY.cmd"
]);

async function readRoot(name) {
  return await readFile(path.join(ROOT, name), "utf8");
}

test("every post-setup Windows entry point revalidates Node 24 before product work", async () => {
  const helper = await readFile(path.join(ROOT, "scripts", "windows-require-node24.cmd"), "utf8");
  assert.match(helper, /where node/i);
  assert.match(helper, /requires Node\.js 24\.x/i);
  assert.match(helper, /=="24"/);

  for (const launcherName of POST_SETUP_LAUNCHERS) {
    const launcher = await readRoot(launcherName);
    const runtimeCheck = launcher.indexOf("scripts\\windows-require-node24.cmd");
    const nodeModulesCheck = launcher.indexOf('if not exist "node_modules"');
    assert.ok(runtimeCheck >= 0, `${launcherName} must invoke the Node 24 preflight`);
    assert.ok(
      nodeModulesCheck === -1 || runtimeCheck < nodeModulesCheck,
      `${launcherName} must validate runtime before installed dependencies`
    );
  }

  const setup = await readRoot("SETUP.cmd");
  assert.match(setup, /process\.versions\.node\.split\('\.'\)\[0\]/);
  assert.match(setup, /=="24"/);
});

test("demo port preflight rejects an already-owned loopback port and succeeds after release", async () => {
  const blocker = createServer();
  blocker.listen(0, "127.0.0.1");
  await once(blocker, "listening");
  const port = blocker.address().port;

  try {
    await assert.rejects(
      assertLoopbackPortsAvailable({ ports: [port] }),
      new RegExp(`port ${port} is unavailable`, "i")
    );
  } finally {
    blocker.close();
    await once(blocker, "close");
  }

  await assertLoopbackPortsAvailable({ ports: [port] });
});

test("START_DEMO checks port ownership before launching the browser opener", async () => {
  const launcher = await readRoot("START_DEMO.cmd");
  const portCheck = launcher.indexOf("node scripts\\check-demo-ports.mjs");
  const browserOpener = launcher.indexOf("start \"\" /b powershell");
  const demoStart = launcher.indexOf("npm run demo:fake-market");

  assert.ok(portCheck >= 0);
  assert.ok(browserOpener > portCheck);
  assert.ok(demoStart > browserOpener);
});
