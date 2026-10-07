import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";

import { parseServiceConfig } from "../../local-service/server/config.js";

test("ordinary service config keeps BUY execution disabled by default", () => {
  const config = parseServiceConfig([
    "--allowed-origin",
    "https://provider.example"
  ], { cwd: os.tmpdir() });

  assert.deepEqual(config.buy, {
    enabled: false,
    quantity: null,
    mode: "DRY_RUN"
  });
});
