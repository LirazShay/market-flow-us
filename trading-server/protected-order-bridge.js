export class ProtectedOrderBridgeError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProtectedOrderBridgeError";
    this.code = code;
    this.statusCode = 409;
  }
}

function assertDependencies({ hardRiskAuthority, orderServiceClient, requestLiveOperatorConfirmation }) {
  if (!hardRiskAuthority || typeof hardRiskAuthority.gateOrderIntent !== "function") {
    throw new TypeError("hardRiskAuthority with gateOrderIntent() is required");
  }
  if (!orderServiceClient || typeof orderServiceClient.createOrder !== "function") {
    throw new TypeError("orderServiceClient with createOrder() is required");
  }
  if (requestLiveOperatorConfirmation !== null
    && requestLiveOperatorConfirmation !== undefined
    && typeof requestLiveOperatorConfirmation !== "function") {
    throw new TypeError("requestLiveOperatorConfirmation must be a function when supplied");
  }
}

export function createProtectedOrderBridge({
  hardRiskAuthority,
  orderServiceClient,
  requestLiveOperatorConfirmation = null
}) {
  assertDependencies({
    hardRiskAuthority,
    orderServiceClient,
    requestLiveOperatorConfirmation
  });

  return Object.freeze({
    async submitOrderIntent({
      tradingRunId,
      tradeEpisodeId,
      intent,
      quote,
      policyLimits
    }) {
      return await hardRiskAuthority.gateOrderIntent({
        tradingRunId,
        tradeEpisodeId,
        intent,
        quote,
        policyLimits
      }, async ({ normalizedIntent, riskPermit }) => {
        if (normalizedIntent.executionMode === "LIVE") {
          if (requestLiveOperatorConfirmation === null) {
            throw new ProtectedOrderBridgeError("LIVE_OPERATOR_CONFIRMATION_REQUIRED");
          }

          let confirmation;
          try {
            confirmation = await requestLiveOperatorConfirmation(Object.freeze({
              tradingRunId,
              tradeEpisodeId,
              intent: normalizedIntent,
              riskPermit
            }));
          } catch (error) {
            if (error instanceof ProtectedOrderBridgeError) throw error;
            throw new ProtectedOrderBridgeError("LIVE_OPERATOR_CONFIRMATION_REQUIRED");
          }
          if (!confirmation || confirmation.confirmed !== true) {
            throw new ProtectedOrderBridgeError("LIVE_OPERATOR_CONFIRMATION_REQUIRED");
          }
        }

        // The bridge performs no broker logic and no retry of its own.
        // The shared local client preserves exact request identity and the existing
        // IBKR Order Service owns idempotency, ACK reconciliation and lifecycle state.
        return await orderServiceClient.createOrder(normalizedIntent);
      });
    }
  });
}
