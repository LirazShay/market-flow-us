import assert from "node:assert/strict";
import test from "node:test";

import {
  validateDesktopPluginRepositoryContract
} from "../../scripts/check-research-desktop-preflight.mjs";

test("TREE 11.8 Desktop preflight validates repo marketplace, plugin and PATH executable contract", async () => {
  assert.deepEqual(
    await validateDesktopPluginRepositoryContract(),
    {
      marketplaceEntry: true,
      pluginManifest: true,
      mcpStdio: true,
      packageBin: true
    }
  );
});
