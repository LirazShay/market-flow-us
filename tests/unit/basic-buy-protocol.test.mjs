import assert from "node:assert/strict";
import test from "node:test";

import {
  ERROR_CODES,
  ProtocolValidationError,
  isOperationAllowed,
  validateRequest
} from "../../shared/protocol/index.js";

function request(payload, overrides = {}) {
  return {
    v: 1,
    type: "order.buy.prepare",
    requestId: "buy-prepare-1",
    payload,
    ...overrides
  };
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProtocolValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("BUY prepare is a Viewer-only protocol operation with securityId as its entire browser-owned payload", () => {
  const message = request({ securityId: "1001" });

  assert.equal(isOperationAllowed("viewer", "order.buy.prepare"), true);
  assert.equal(isOperationAllowed("producer", "order.buy.prepare"), false);
  assert.equal(
    validateRequest(message, { role: "viewer", helloComplete: true }),
    message
  );

  assertCode(
    () => validateRequest(message, { role: "producer", helloComplete: true }),
    ERROR_CODES.ROLE_VIOLATION
  );
});

test("BUY prepare rejects every browser attempt to supply broker or execution authority", () => {
  for (const extra of [
    { symbol: "MSFT" },
    { quantity: 999 },
    { side: "SELL" },
    { orderType: "LMT" },
    { tif: "GTC" },
    { executionMode: "LIVE" },
    { instrument: { symbol: "MSFT" } }
  ]) {
    assertCode(
      () => validateRequest(
        request({ securityId: "1001", ...extra }),
        { role: "viewer", helloComplete: true }
      ),
      ERROR_CODES.INVALID_MESSAGE
    );
  }

  assertCode(
    () => validateRequest(
      request({ securityId: "" }),
      { role: "viewer", helloComplete: true }
    ),
    ERROR_CODES.INVALID_MESSAGE
  );
});
