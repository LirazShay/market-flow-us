import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { collectUsCollectionCandidate } from "../../browser/collector/us-cycle.js";

function row(id) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
    Price: id,
    DailyVolume: id * 10
  };
}

function snapshot(records) {
  return buildValidatedSnapshot({
    responseJson: {
      data: {
        ScreenerHulPaging: {
          recordCount: records.length,
          records
        }
      },
      resultCode: 0,
      rtUsa: true
    },
    timing: {
      startedAtMs: 10,
      responseReceivedAtMs: 11,
      completedAtMs: 12
    }
  });
}

test("U.S. collection candidate derives universe and cycle from the exact same response rows", async () => {
  const records = [row(2), row(1)];
  const validated = snapshot(records);
  let fetches = 0;

  const candidate = await collectUsCollectionCandidate({
    fetchSnapshot: async () => {
      fetches++;
      return validated;
    }
  });

  assert.equal(fetches, 1);
  assert.equal(candidate.universe.securities[0].rawSource, records[0]);
  assert.equal(candidate.cycle.securities[0].data, records[0]);
  assert.equal(candidate.universe.securities[1].rawSource, records[1]);
  assert.equal(candidate.cycle.securities[1].data, records[1]);
  assert.deepEqual(candidate.universe.membership, ["1", "2"]);
  assert.deepEqual(candidate.cycle.securities.map((item) => item.securityId), ["2", "1"]);
  assert.equal(candidate.cycle.chunks.length, 1);
  assert.equal(candidate.cycle.chunks[0].chunkIndex, 0);
});
