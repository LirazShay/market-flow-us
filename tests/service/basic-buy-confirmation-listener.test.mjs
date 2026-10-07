import assert from "node:assert/strict";
import test from "node:test";

import { createServiceFixture } from "./helpers/service-fixture.mjs";

async function get(port, path) {
  return await fetch(`http://127.0.0.1:${port}${path}`);
}

test("BUY-enabled composition serves the trusted confirmation page on the existing market-service listener", async () => {
  const fixture = await createServiceFixture({
    config: {
      buy: {
        enabled: true,
        quantity: 2,
        mode: "DRY_RUN"
      }
    }
  });

  try {
    const response = await get(fixture.port, "/buy/confirm");
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.match(body, /Confirm BUY/);
  } finally {
    await fixture.cleanup();
  }
});

test("normal non-BUY service keeps confirmation routes absent", async () => {
  const fixture = await createServiceFixture();
  try {
    for (const path of [
      "/buy/confirm",
      "/buy/confirm/app.js",
      "/buy/confirm/inspect",
      "/buy/confirm/execute"
    ]) {
      const response = path.endsWith("inspect") || path.endsWith("execute")
        ? await fetch(`http://127.0.0.1:${fixture.port}${path}`, {
          method: "POST",
          headers: {
            Origin: `http://127.0.0.1:${fixture.port}`,
            "Content-Type": "application/json",
            "X-Market-Flow-CSRF": "not-present"
          },
          body: JSON.stringify({ ticketId: "not-present" })
        })
        : await get(fixture.port, path);
      assert.equal(response.status, 404, path);
    }
  } finally {
    await fixture.cleanup();
  }
});
