import assert from "node:assert/strict";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createDemoBuyReads } from "../../local-service/reads/demo-buy-reads.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

test("Demo Buy page SQL compiles and returns an empty fixed page on fresh schema v4", async () => {
  const fixture = await createServiceFixture({ openDatabase: openMarketFlowUsDatabase });
  try {
    const reads = createDemoBuyReads({
      connection: fixture.service.database.viewerReadConnection
    });
    assert.deepEqual(await reads.page(null), {
      items: [],
      hasMore: false,
      nextCursor: null
    });
  } finally {
    await fixture.cleanup();
  }
});
