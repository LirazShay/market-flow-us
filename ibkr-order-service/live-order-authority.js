import { randomUUID } from "node:crypto";

import { buildProviderCorrelationId } from "./cpgw-adapter.js";
import { fingerprintOrderIntent } from "./intent.js";
import { prepareLiveSubmission } from "./live-gates.js";
import { RequestIdReuseMismatchError } from "./order-authority.js";
import {
  ACKNOWLEDGEMENT_UNKNOWN,
  CANCELLED,
  FILLED,
  PARTIALLY_FILLED,
  PROVIDER_REJECTED,
  READY_TO_SUBMIT,
  REPLY_REQUIRED,
  SUBMIT_FAILED,
  SUBMITTED
} from "./store.js";

const DEFAULT_MODELED_REPLY_MESSAGE_IDS = Object.freeze(["o163"]);

export class LiveOrderAuthorityError extends Error {
  constructor(code, { statusCode = 409 } = {}) {
    super(code);
    this.name = "LiveOrderAuthorityError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, options) {
  throw new LiveOrderAuthorityError(code, options);
}

function assertDependencies(adapter, store) {
  const adapterMethods = [
    "submitOrder",
    "confirmReply",
    "getOrders",
    "getTrades",
    "cancelOrder",
    "getSessionStatus",
    "getTradableAccounts"
  ];
  for (const method of adapterMethods) {
    if (!adapter || typeof adapter[method] !== "function") {
      throw new TypeError(`adapter.${method}() is required`);
    }
  }

  const storeMethods = [
    "getByRequestId",
    "getByLocalOrderId",
    "getProviderState",
    "insertLive",
    "updateLiveState"
  ];
  for (const method of storeMethods) {
    if (!store || typeof store[method] !== "function") {
      throw new TypeError(`store.${method}() is required`);
    }
  }
}

function normalizeModeledReplyIds(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("modeledReplyMessageIds must be an array");
  }
  const ids = values.map((value) => {
    if (typeof value !== "string" || value.length === 0 || value.length > 64) {
      throw new TypeError("modeled reply message IDs must be bounded strings");
    }
    return value;
  });
  return new Set(ids);
}

function resultFromStored(execution, provider, { replayed = false } = {}) {
  return Object.freeze({
    requestId: execution.requestId,
    intentFingerprint: execution.intentFingerprint,
    localOrderId: execution.localOrderId,
    lifecycleState: execution.lifecycleState,
    executionMode: "LIVE",
    replayed,
    providerOrderId: provider?.providerOrderId ?? null,
    requestedQuantity: provider?.requestedQuantity ?? null,
    filledQuantity: provider?.filledQuantity ?? null,
    replyRequired: execution.lifecycleState === REPLY_REQUIRED,
    replyMessageIds: execution.lifecycleState === REPLY_REQUIRED
      ? Object.freeze([...(provider?.replyMessageIds ?? [])])
      : Object.freeze([])
  });
}

function isCancellationStatus(status) {
  return typeof status === "string" && /cancel/iu.test(status);
}

function exactRuntimeAccount(accounts) {
  if (!Array.isArray(accounts)) {
    fail("TRADABLE_ACCOUNT_UNAVAILABLE");
  }
  const tradable = accounts.filter((account) => account?.tradable === true);
  if (tradable.length === 0) {
    fail("TRADABLE_ACCOUNT_UNAVAILABLE");
  }
  if (tradable.length !== 1) {
    fail("TRADABLE_ACCOUNT_AMBIGUOUS");
  }
  return tradable[0];
}

function boundedFilledQuantity(value, requestedQuantity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(value, requestedQuantity);
}

export function createLiveOrderAuthority({
  adapter,
  store,
  processLiveEnabled = false,
  createLocalOrderId = () => `ord_${randomUUID()}`,
  modeledReplyMessageIds = DEFAULT_MODELED_REPLY_MESSAGE_IDS
}) {
  assertDependencies(adapter, store);
  if (typeof createLocalOrderId !== "function") {
    throw new TypeError("createLocalOrderId must be a function");
  }
  const modeledReplyIds = normalizeModeledReplyIds(modeledReplyMessageIds);

  let mutationTail = Promise.resolve();

  function serializeMutation(operation) {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.catch(() => {});
    return result;
  }

  async function loadLive(localOrderId) {
    const execution = await store.getByLocalOrderId(localOrderId);
    if (!execution) {
      fail("ORDER_NOT_FOUND", { statusCode: 404 });
    }
    const provider = await store.getProviderState(localOrderId);
    if (!provider) {
      fail("LIVE_PROVIDER_STATE_MISSING", { statusCode: 500 });
    }
    return { execution, provider };
  }

  async function applyProviderResult(localOrderId, result) {
    if (result?.status === "SUBMITTED") {
      return store.updateLiveState({
        localOrderId,
        lifecycleState: SUBMITTED,
        providerOrderId: result.providerOrderId,
        replyId: null,
        replyMessageIds: []
      });
    }
    if (result?.status === "REPLY_REQUIRED") {
      if (
        typeof result.replyId !== "string"
        || result.replyId.length === 0
        || !Array.isArray(result.messageIds)
        || result.messageIds.length === 0
      ) {
        fail("PROVIDER_REPLY_UNRECOGNIZED", { statusCode: 502 });
      }
      return store.updateLiveState({
        localOrderId,
        lifecycleState: REPLY_REQUIRED,
        replyId: result.replyId,
        replyMessageIds: result.messageIds
      });
    }
    if (result?.status === "PROVIDER_REJECTED") {
      return store.updateLiveState({
        localOrderId,
        lifecycleState: PROVIDER_REJECTED,
        replyId: null,
        replyMessageIds: []
      });
    }
    fail("PROVIDER_RESPONSE_UNRECOGNIZED", { statusCode: 502 });
  }

  async function reconcileInternal(localOrderId) {
    const { execution, provider } = await loadLive(localOrderId);
    const correlationId = buildProviderCorrelationId(execution.requestId);
    const [orders, trades] = await Promise.all([
      adapter.getOrders(),
      adapter.getTrades()
    ]);

    const matchingOrders = Array.isArray(orders)
      ? orders.filter((order) => order?.correlationId === correlationId)
      : [];
    if (matchingOrders.length > 1) {
      fail("RECONCILIATION_AMBIGUOUS", { statusCode: 502 });
    }
    const matchingTrades = Array.isArray(trades)
      ? trades.filter((trade) => trade?.correlationId === correlationId)
      : [];

    const order = matchingOrders[0] ?? null;
    const tradeFilled = matchingTrades.reduce((sum, trade) => {
      const quantity = typeof trade?.quantity === "number" && Number.isFinite(trade.quantity)
        ? Math.max(0, trade.quantity)
        : 0;
      return sum + quantity;
    }, 0);
    const orderFilled = boundedFilledQuantity(order?.filledQuantity, provider.requestedQuantity);
    const filledQuantity = Math.min(
      provider.requestedQuantity,
      Math.max(provider.filledQuantity, orderFilled, tradeFilled)
    );
    const providerOrderId = order?.providerOrderId ?? provider.providerOrderId;

    let lifecycleState = execution.lifecycleState;
    if (filledQuantity >= provider.requestedQuantity) {
      lifecycleState = FILLED;
    } else if (order && isCancellationStatus(order.status)) {
      lifecycleState = CANCELLED;
    } else if (filledQuantity > 0) {
      lifecycleState = PARTIALLY_FILLED;
    } else if (order) {
      lifecycleState = SUBMITTED;
    }

    if (
      lifecycleState === execution.lifecycleState
      && providerOrderId === provider.providerOrderId
      && filledQuantity === provider.filledQuantity
    ) {
      return { execution, provider };
    }

    return store.updateLiveState({
      localOrderId,
      lifecycleState,
      providerOrderId,
      filledQuantity
    });
  }

  async function createInternal(intent) {
    if (intent.executionMode !== "LIVE") {
      fail("LIVE_REQUEST_REQUIRED");
    }
    const intentFingerprint = fingerprintOrderIntent(intent);
    const existing = await store.getByRequestId(intent.requestId);
    if (existing && existing.intentFingerprint !== intentFingerprint) {
      throw new RequestIdReuseMismatchError();
    }
    if (existing) {
      const provider = await store.getProviderState(existing.localOrderId);
      if (!provider) {
        fail("LIVE_PROVIDER_STATE_MISSING", { statusCode: 500 });
      }
      if ([ACKNOWLEDGEMENT_UNKNOWN, SUBMITTED, PARTIALLY_FILLED].includes(existing.lifecycleState)) {
        const reconciled = await reconcileInternal(existing.localOrderId);
        return resultFromStored(reconciled.execution, reconciled.provider, { replayed: true });
      }
      return resultFromStored(existing, provider, { replayed: true });
    }

    const prepared = await prepareLiveSubmission({
      intent,
      adapter,
      processLiveEnabled
    });
    const localOrderId = createLocalOrderId();
    await store.insertLive({
      requestId: intent.requestId,
      intentFingerprint,
      localOrderId,
      providerConid: prepared.resolution.conid,
      requestedQuantity: intent.quantity,
      lifecycleState: READY_TO_SUBMIT
    });

    await store.updateLiveState({
      localOrderId,
      lifecycleState: ACKNOWLEDGEMENT_UNKNOWN
    });

    try {
      const providerResult = await adapter.submitOrder(intent, prepared);
      const persisted = await applyProviderResult(localOrderId, providerResult);
      return resultFromStored(persisted.execution, persisted.provider);
    } catch (error) {
      if (error?.code === "ACKNOWLEDGEMENT_UNKNOWN") {
        const persisted = await loadLive(localOrderId);
        return resultFromStored(persisted.execution, persisted.provider);
      }
      await store.updateLiveState({
        localOrderId,
        lifecycleState: SUBMIT_FAILED
      });
      throw error;
    }
  }

  return Object.freeze({
    create(intent) {
      return serializeMutation(() => createInternal(intent));
    },

    confirm(localOrderId, { confirmed } = {}) {
      return serializeMutation(async () => {
        if (confirmed !== true) {
          fail("EXPLICIT_CONFIRMATION_REQUIRED");
        }
        const current = await loadLive(localOrderId);
        if (current.execution.lifecycleState !== REPLY_REQUIRED || !current.provider.replyId) {
          fail("ORDER_REPLY_NOT_PENDING");
        }
        if (
          current.provider.replyMessageIds.length === 0
          || current.provider.replyMessageIds.some((id) => !modeledReplyIds.has(id))
        ) {
          fail("PROVIDER_REPLY_UNMODELED");
        }

        await store.updateLiveState({
          localOrderId,
          lifecycleState: ACKNOWLEDGEMENT_UNKNOWN
        });
        try {
          const providerResult = await adapter.confirmReply(current.provider.replyId);
          const persisted = await applyProviderResult(localOrderId, providerResult);
          return resultFromStored(persisted.execution, persisted.provider);
        } catch (error) {
          if (error?.code === "ACKNOWLEDGEMENT_UNKNOWN") {
            const persisted = await loadLive(localOrderId);
            return resultFromStored(persisted.execution, persisted.provider);
          }
          await store.updateLiveState({
            localOrderId,
            lifecycleState: SUBMIT_FAILED
          });
          throw error;
        }
      });
    },

    reconcile(localOrderId) {
      return serializeMutation(async () => {
        const reconciled = await reconcileInternal(localOrderId);
        return resultFromStored(reconciled.execution, reconciled.provider, { replayed: true });
      });
    },

    cancel(localOrderId) {
      return serializeMutation(async () => {
        let current = await reconcileInternal(localOrderId);
        if (current.execution.lifecycleState === FILLED) {
          return resultFromStored(current.execution, current.provider, { replayed: true });
        }
        if (!current.provider.providerOrderId) {
          fail("ORDER_NOT_CANCELLABLE");
        }

        const session = await adapter.getSessionStatus();
        if (session?.authenticated !== true || session?.brokerageSession !== true) {
          fail("BROKERAGE_SESSION_UNAVAILABLE");
        }
        const account = exactRuntimeAccount(await adapter.getTradableAccounts());
        await adapter.cancelOrder({
          account,
          providerOrderId: current.provider.providerOrderId
        });
        current = await reconcileInternal(localOrderId);
        return resultFromStored(current.execution, current.provider);
      });
    },

    get(localOrderId) {
      return serializeMutation(async () => {
        const current = await loadLive(localOrderId);
        return resultFromStored(current.execution, current.provider, { replayed: true });
      });
    }
  });
}
