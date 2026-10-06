import { normalizeOrderIntent } from "./intent.js";

export class LiveGateError extends Error {
  constructor(code, checkpoint) {
    super(code);
    this.name = "LiveGateError";
    this.code = code;
    this.checkpoint = checkpoint;
    this.statusCode = 409;
  }
}

function fail(code, checkpoint) {
  throw new LiveGateError(code, checkpoint);
}

function assertAdapter(adapter, { requirePosition = false } = {}) {
  const requiredMethods = [
    "getSessionStatus",
    "getTradableAccounts",
    "checkTradingPermission",
    "resolveInstrument",
    "getSnapshot",
    "previewOrder",
    ...(requirePosition ? ["getLongPosition"] : [])
  ];

  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("adapter is required");
  }
  for (const method of requiredMethods) {
    if (typeof adapter[method] !== "function") {
      throw new TypeError(`adapter.${method}() is required`);
    }
  }
}

function exactTradableAccount(accounts) {
  if (!Array.isArray(accounts)) {
    fail("TRADABLE_ACCOUNT_UNAVAILABLE", "account-discovery");
  }
  const tradable = accounts.filter((account) => account?.tradable === true);
  if (tradable.length === 0) {
    fail("TRADABLE_ACCOUNT_UNAVAILABLE", "account-discovery");
  }
  if (tradable.length !== 1) {
    fail("TRADABLE_ACCOUNT_AMBIGUOUS", "account-discovery");
  }
  return tradable[0];
}

function assertExactInstrument(resolution) {
  if (resolution?.status === "AMBIGUOUS") {
    fail("INSTRUMENT_AMBIGUOUS", "instrument-resolution");
  }
  if (
    resolution?.status !== "EXACT"
    || !Number.isSafeInteger(resolution.conid)
    || resolution.conid <= 0
  ) {
    fail("INSTRUMENT_UNRESOLVED", "instrument-resolution");
  }
}

function assertSnapshot(snapshot) {
  if (snapshot?.status !== "READY") {
    fail("SNAPSHOT_PREFLIGHT_FAILED", "market-data-snapshot");
  }
}

function assertWhatIf(preview) {
  if (preview?.status !== "ACCEPTED") {
    fail("WHAT_IF_REJECTED", "what-if-preview");
  }
}

function assertSellCoverage(position, requestedQuantity) {
  if (position?.status === "UNAVAILABLE") {
    fail("SELL_POSITION_UNAVAILABLE", "sell-position-guard");
  }
  if (
    position?.status !== "EXACT"
    || typeof position.longQuantity !== "number"
    || !Number.isFinite(position.longQuantity)
    || position.longQuantity < 0
  ) {
    fail("SELL_POSITION_AMBIGUOUS", "sell-position-guard");
  }
  if (position.longQuantity < requestedQuantity) {
    fail("SELL_POSITION_INSUFFICIENT", "sell-position-guard");
  }
}

async function prepareProviderPreflight(intent, adapter) {
  const session = await adapter.getSessionStatus();
  if (session?.authenticated !== true) {
    fail("PROVIDER_NOT_AUTHENTICATED", "brokerage-session");
  }
  if (session?.brokerageSession !== true) {
    fail("BROKERAGE_SESSION_UNAVAILABLE", "brokerage-session");
  }

  const account = exactTradableAccount(await adapter.getTradableAccounts());

  const permission = await adapter.checkTradingPermission({
    account,
    instrument: intent.instrument,
    side: intent.side
  });
  if (permission?.allowed !== true) {
    fail("TRADING_PERMISSION_UNAVAILABLE", "trading-permission");
  }

  const resolution = await adapter.resolveInstrument(intent.instrument);
  assertExactInstrument(resolution);

  const snapshot = await adapter.getSnapshot({ account, resolution });
  assertSnapshot(snapshot);

  const preview = await adapter.previewOrder(intent, {
    account,
    resolution,
    snapshot,
    whatIf: true
  });
  assertWhatIf(preview);

  return Object.freeze({
    intent,
    account,
    resolution,
    snapshot,
    preview
  });
}

export async function prepareOrderPreview({ intent: inputIntent, adapter }) {
  assertAdapter(adapter);
  const intent = normalizeOrderIntent(inputIntent);
  return prepareProviderPreflight(intent, adapter);
}

export async function prepareLiveSubmission({
  intent: inputIntent,
  adapter,
  processLiveEnabled = false
}) {
  assertAdapter(adapter, { requirePosition: true });
  const intent = normalizeOrderIntent(inputIntent);

  if (intent.executionMode !== "LIVE") {
    fail("LIVE_REQUEST_REQUIRED", "request-live-gate");
  }
  if (processLiveEnabled !== true) {
    fail("LIVE_PROCESS_NOT_ENABLED", "process-live-gate");
  }

  const prepared = await prepareProviderPreflight(intent, adapter);
  let position = null;
  if (intent.side === "SELL") {
    position = await adapter.getLongPosition({
      account: prepared.account,
      resolution: prepared.resolution
    });
    assertSellCoverage(position, intent.quantity);
  }

  return Object.freeze({ ...prepared, position });
}
