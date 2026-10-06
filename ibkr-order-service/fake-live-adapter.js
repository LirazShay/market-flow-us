import { buildProviderOrderPayload } from "./fake-adapter.js";
import {
  CpgwAdapterError,
  buildProviderCorrelationId
} from "./cpgw-adapter.js";

const SYNTHETIC_ACCOUNT = Object.freeze({
  tradable: true,
  providerAccountId: "SYNTH-ACCOUNT-1",
  allowedAssetTypes: Object.freeze(["STK"])
});

const DEFAULT_CONID = 265598;

function cloneAccount(account) {
  return Object.freeze({
    tradable: account.tradable === true,
    providerAccountId: String(account.providerAccountId),
    allowedAssetTypes: Object.freeze([...(account.allowedAssetTypes ?? [])])
  });
}

function submitFailure(code, checkpoint = "order-submit") {
  throw new CpgwAdapterError(code, checkpoint);
}

function initialCallCounts() {
  return {
    getSessionStatus: 0,
    initializeSession: 0,
    getTradableAccounts: 0,
    checkTradingPermission: 0,
    resolveInstrument: 0,
    getSnapshot: 0,
    previewOrder: 0,
    getLongPosition: 0,
    submitOrder: 0,
    confirmReply: 0,
    getOrders: 0,
    getTrades: 0,
    cancelOrder: 0,
    keepalive: 0
  };
}

export class FakeLiveIbkrAdapter {
  #config;
  #calls = initialCallCounts();
  #order = null;
  #trades = [];
  #pendingReply = null;

  constructor({
    authenticated = true,
    brokerageSession = true,
    accounts = [SYNTHETIC_ACCOUNT],
    tradingAllowed = true,
    resolutionStatus = "EXACT",
    snapshotStatus = "READY",
    whatIfStatus = "ACCEPTED",
    longQuantity = 10,
    submitMode = "SUBMITTED",
    confirmMode = "SUBMITTED",
    replyMessageIds = ["o163"],
    providerOrderId = "SYNTH-ORDER-1",
    conid = DEFAULT_CONID
  } = {}) {
    this.#config = {
      authenticated,
      brokerageSession,
      accounts: accounts.map(cloneAccount),
      tradingAllowed,
      resolutionStatus,
      snapshotStatus,
      whatIfStatus,
      longQuantity,
      submitMode,
      confirmMode,
      replyMessageIds: [...replyMessageIds],
      providerOrderId,
      conid
    };
  }

  async getSessionStatus() {
    this.#calls.getSessionStatus += 1;
    return {
      authenticated: this.#config.authenticated,
      brokerageSession: this.#config.brokerageSession,
      connected: this.#config.authenticated
    };
  }

  async initializeSession() {
    this.#calls.initializeSession += 1;
    return this.getSessionStatus();
  }

  async getTradableAccounts() {
    this.#calls.getTradableAccounts += 1;
    return this.#config.accounts.map(cloneAccount);
  }

  async checkTradingPermission() {
    this.#calls.checkTradingPermission += 1;
    return { allowed: this.#config.tradingAllowed };
  }

  async resolveInstrument(instrument) {
    this.#calls.resolveInstrument += 1;
    if (this.#config.resolutionStatus !== "EXACT") {
      return { status: this.#config.resolutionStatus };
    }
    return {
      status: "EXACT",
      conid: this.#config.conid,
      instrument: Object.freeze({ ...instrument })
    };
  }

  async getSnapshot() {
    this.#calls.getSnapshot += 1;
    if (this.#config.snapshotStatus !== "READY") {
      return { status: this.#config.snapshotStatus };
    }
    return {
      status: "READY",
      conid: this.#config.conid,
      last: 123.4,
      bid: 123.39,
      ask: 123.41,
      marketDataAvailability: "RpB"
    };
  }

  async previewOrder(intent, { resolution } = {}) {
    this.#calls.previewOrder += 1;
    const conid = resolution?.conid ?? this.#config.conid;
    if (this.#config.whatIfStatus !== "ACCEPTED") {
      return {
        status: this.#config.whatIfStatus,
        code: "SYNTHETIC_WHAT_IF_REJECTED"
      };
    }
    return {
      status: "ACCEPTED",
      synthetic: true,
      providerPayload: Object.freeze({
        ...buildProviderOrderPayload(intent, { conid }),
        cOID: buildProviderCorrelationId(intent.requestId)
      })
    };
  }

  async getLongPosition() {
    this.#calls.getLongPosition += 1;
    if (this.#config.longQuantity === "UNAVAILABLE") {
      return { status: "UNAVAILABLE" };
    }
    if (this.#config.longQuantity === "AMBIGUOUS") {
      return { status: "AMBIGUOUS" };
    }
    return {
      status: "EXACT",
      longQuantity: this.#config.longQuantity
    };
  }

  #createSubmittedOrder(intent) {
    this.#order = {
      providerOrderId: this.#config.providerOrderId,
      conid: this.#config.conid,
      status: "Submitted",
      filledQuantity: 0,
      remainingQuantity: intent.quantity,
      totalQuantity: intent.quantity,
      correlationId: buildProviderCorrelationId(intent.requestId)
    };
    return {
      status: "SUBMITTED",
      providerOrderId: this.#order.providerOrderId,
      providerStatus: this.#order.status
    };
  }

  #createReply(intent) {
    this.#pendingReply = {
      replyId: "SYNTH-REPLY-1",
      messageIds: [...this.#config.replyMessageIds],
      intent: Object.freeze({ ...intent })
    };
    return {
      status: "REPLY_REQUIRED",
      replyId: this.#pendingReply.replyId,
      messageIds: [...this.#pendingReply.messageIds]
    };
  }

  async submitOrder(intent) {
    this.#calls.submitOrder += 1;
    switch (this.#config.submitMode) {
      case "SUBMITTED":
        return this.#createSubmittedOrder(intent);
      case "REPLY_REQUIRED":
        return this.#createReply(intent);
      case "PROVIDER_REJECTED":
        return {
          status: "PROVIDER_REJECTED",
          code: "SYNTHETIC_PROVIDER_REJECTED"
        };
      case "ACKNOWLEDGEMENT_UNKNOWN":
        this.#createSubmittedOrder(intent);
        submitFailure("ACKNOWLEDGEMENT_UNKNOWN");
        break;
      case "SUBMIT_FAILED":
        submitFailure("CPGW_REQUEST_FAILED");
        break;
      default:
        submitFailure("SYNTHETIC_SUBMIT_MODE_UNKNOWN");
    }
  }

  async confirmReply(replyId) {
    this.#calls.confirmReply += 1;
    if (!this.#pendingReply || replyId !== this.#pendingReply.replyId) {
      submitFailure("SYNTHETIC_REPLY_NOT_FOUND", "order-reply");
    }
    const pendingIntent = this.#pendingReply.intent;
    this.#pendingReply = null;
    switch (this.#config.confirmMode) {
      case "SUBMITTED":
        return this.#createSubmittedOrder(pendingIntent);
      case "REPLY_REQUIRED":
        return this.#createReply(pendingIntent);
      case "PROVIDER_REJECTED":
        return {
          status: "PROVIDER_REJECTED",
          code: "SYNTHETIC_PROVIDER_REJECTED"
        };
      case "ACKNOWLEDGEMENT_UNKNOWN":
        this.#createSubmittedOrder(pendingIntent);
        submitFailure("ACKNOWLEDGEMENT_UNKNOWN", "order-reply");
        break;
      default:
        submitFailure("SYNTHETIC_CONFIRM_MODE_UNKNOWN", "order-reply");
    }
  }

  async getOrders() {
    this.#calls.getOrders += 1;
    return this.#order ? [Object.freeze({ ...this.#order })] : [];
  }

  async getTrades() {
    this.#calls.getTrades += 1;
    return this.#trades.map((trade) => Object.freeze({ ...trade }));
  }

  async cancelOrder({ providerOrderId }) {
    this.#calls.cancelOrder += 1;
    if (!this.#order || this.#order.providerOrderId !== providerOrderId) {
      submitFailure("SYNTHETIC_CANCEL_NOT_FOUND", "order-cancel");
    }
    this.#order.status = "Cancelled";
    this.#order.remainingQuantity = Math.max(
      0,
      this.#order.totalQuantity - this.#order.filledQuantity
    );
    return {
      status: "CANCEL_REQUESTED",
      providerOrderId,
      conid: this.#order.conid
    };
  }

  async keepalive() {
    this.#calls.keepalive += 1;
    return {
      authenticated: this.#config.authenticated,
      connected: this.#config.authenticated,
      ssoExpiresMs: 300_000
    };
  }

  setObservation({ filledQuantity, status = "Submitted", price = 123.4 }) {
    if (!this.#order) {
      throw new Error("synthetic order must exist before setting observation");
    }
    if (
      typeof filledQuantity !== "number"
      || !Number.isFinite(filledQuantity)
      || filledQuantity < 0
      || filledQuantity > this.#order.totalQuantity
    ) {
      throw new TypeError("filledQuantity is invalid");
    }
    this.#order.filledQuantity = filledQuantity;
    this.#order.remainingQuantity = this.#order.totalQuantity - filledQuantity;
    this.#order.status = status;
    this.#trades = filledQuantity > 0
      ? [{
          executionId: "SYNTH-EXEC-1",
          conid: this.#order.conid,
          quantity: filledQuantity,
          price: String(price),
          correlationId: this.#order.correlationId
        }]
      : [];
  }

  getCallCounts() {
    return { ...this.#calls };
  }
}
