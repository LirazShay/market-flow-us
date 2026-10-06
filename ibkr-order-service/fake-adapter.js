import { createHash } from "node:crypto";

function syntheticConid(symbol) {
  const digest = createHash("sha256").update(`market-flow-us:${symbol}`, "utf8").digest();
  return 900_000_000 + (digest.readUInt32BE(0) % 90_000_000);
}

function assertConid(conid) {
  if (!Number.isSafeInteger(conid) || conid <= 0) {
    throw new TypeError("conid must be a positive safe integer");
  }
}

export function buildProviderOrderPayload(normalizedIntent, { conid }) {
  assertConid(conid);

  return Object.freeze({
    conid,
    side: normalizedIntent.side,
    orderType: normalizedIntent.orderType,
    quantity: normalizedIntent.quantity,
    tif: normalizedIntent.tif,
    ...(normalizedIntent.orderType === "LMT"
      ? { price: normalizedIntent.limitPrice }
      : {})
  });
}

export class FakeIbkrAdapter {
  #calls = {
    resolveInstrument: 0,
    previewOrder: 0,
    submitOrder: 0
  };

  async resolveInstrument(instrument) {
    this.#calls.resolveInstrument += 1;
    return Object.freeze({
      status: "EXACT",
      synthetic: true,
      conid: syntheticConid(instrument.symbol),
      instrument: Object.freeze({ ...instrument })
    });
  }

  async previewOrder(normalizedIntent) {
    this.#calls.previewOrder += 1;
    const resolution = await this.resolveInstrument(normalizedIntent.instrument);
    const providerPayload = buildProviderOrderPayload(normalizedIntent, {
      conid: resolution.conid
    });

    return Object.freeze({
      kind: "SYNTHETIC_WHAT_IF",
      status: "ACCEPTED",
      synthetic: true,
      providerPayload,
      evidence: Object.freeze({
        currency: "USD",
        estimatedCommissionUsd: 0,
        estimatedOrderValueUsd: normalizedIntent.orderType === "LMT"
          ? normalizedIntent.quantity * normalizedIntent.limitPrice
          : null
      })
    });
  }

  async submitOrder() {
    this.#calls.submitOrder += 1;
    const error = new Error("Synthetic adapter submit is unavailable in TREE 8.1");
    error.code = "PROVIDER_SUBMIT_NOT_IMPLEMENTED";
    throw error;
  }

  getCallCounts() {
    return { ...this.#calls };
  }
}
