import { randomUUID } from "node:crypto";

import { fingerprintOrderIntent } from "./intent.js";
import { DRY_RUN_COMPLETE } from "./store.js";

export class RequestIdReuseMismatchError extends Error {
  constructor() {
    super("requestId was already used for a different normalized intent");
    this.name = "RequestIdReuseMismatchError";
    this.code = "REQUEST_ID_REUSE_MISMATCH";
    this.statusCode = 409;
  }
}

function createVolatileExecutionStore() {
  const rows = new Map();
  return {
    async getByRequestId(requestId) {
      return rows.get(requestId) ?? null;
    },
    async insertDryRun({ requestId, intentFingerprint, localOrderId }) {
      if (rows.has(requestId)) {
        throw new Error("volatile execution store duplicate requestId");
      }
      const now = Date.now();
      const row = Object.freeze({
        requestId,
        intentFingerprint,
        localOrderId,
        lifecycleState: DRY_RUN_COMPLETE,
        createdAtMs: now,
        updatedAtMs: now
      });
      rows.set(requestId, row);
      return row;
    }
  };
}

function assertDependencies(adapter, store) {
  if (!adapter || typeof adapter.previewOrder !== "function") {
    throw new TypeError("adapter with previewOrder() is required");
  }
  if (
    !store
    || typeof store.getByRequestId !== "function"
    || typeof store.insertDryRun !== "function"
  ) {
    throw new TypeError("store with getByRequestId() and insertDryRun() is required");
  }
}

export function createDryRunOrderAuthority({
  adapter,
  store = createVolatileExecutionStore(),
  createLocalOrderId = () => `ord_${randomUUID()}`
}) {
  assertDependencies(adapter, store);
  if (typeof createLocalOrderId !== "function") {
    throw new TypeError("createLocalOrderId must be a function");
  }

  let mutationTail = Promise.resolve();

  function serializeMutation(operation) {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.catch(() => {});
    return result;
  }

  return Object.freeze({
    create(intent) {
      if (intent.executionMode !== "DRY_RUN") {
        const error = new Error("live execution is not enabled in TREE 8.1");
        error.code = "LIVE_EXECUTION_NOT_ENABLED";
        error.statusCode = 409;
        throw error;
      }

      const intentFingerprint = fingerprintOrderIntent(intent);

      return serializeMutation(async () => {
        const existing = await store.getByRequestId(intent.requestId);
        if (existing && existing.intentFingerprint !== intentFingerprint) {
          throw new RequestIdReuseMismatchError();
        }

        const preview = await adapter.previewOrder(intent);
        if (existing) {
          return Object.freeze({
            requestId: intent.requestId,
            intentFingerprint,
            localOrderId: existing.localOrderId,
            lifecycleState: existing.lifecycleState,
            executionMode: "DRY_RUN",
            replayed: true,
            preview
          });
        }

        const localOrderId = createLocalOrderId();
        const persisted = await store.insertDryRun({
          requestId: intent.requestId,
          intentFingerprint,
          localOrderId
        });

        return Object.freeze({
          requestId: intent.requestId,
          intentFingerprint,
          localOrderId: persisted.localOrderId,
          lifecycleState: persisted.lifecycleState,
          executionMode: "DRY_RUN",
          replayed: false,
          preview
        });
      });
    }
  });
}
