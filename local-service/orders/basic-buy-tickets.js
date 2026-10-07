import { randomUUID } from "node:crypto";

import { normalizeOrderIntent } from "../../ibkr-order-service/intent.js";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

export const BASIC_BUY_TICKET_TTL_MS = 120_000;
const DEFAULT_MAX_PENDING_TICKETS = 32;

function fail(code) {
  throw new ProtocolValidationError(code);
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
}

function normalizeLocalOrigin(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Local confirmation Origin is unavailable");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Local confirmation Origin is invalid");
  }

  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback || url.origin !== value) {
    throw new TypeError("Local confirmation Origin must be an exact loopback http Origin");
  }

  return value;
}

function normalizeBuyConfig(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("buyConfig is required");
  }

  const enabled = value.enabled === true;
  const quantity = value.quantity;
  const mode = value.mode;

  if (enabled && (!Number.isFinite(quantity) || quantity <= 0)) {
    throw new TypeError("Enabled BUY configuration requires a positive finite quantity");
  }
  if (mode !== "DRY_RUN" && mode !== "LIVE") {
    throw new TypeError("BUY mode must be DRY_RUN or LIVE");
  }

  return Object.freeze({ enabled, quantity: enabled ? quantity : null, mode });
}

function validCurrentSymbol(security) {
  const symbol = security?.currentRow?.Symbol;
  return security?.found === true &&
    security?.isCurrent === true &&
    typeof symbol === "string" &&
    symbol.length > 0 &&
    symbol.trim() === symbol;
}

export function createBasicBuyTicketAuthority({
  viewerReads,
  buyConfig,
  isReady,
  getLocalOrigin,
  now = () => Date.now(),
  randomId = () => randomUUID(),
  ttlMs = BASIC_BUY_TICKET_TTL_MS,
  maxPendingTickets = DEFAULT_MAX_PENDING_TICKETS
}) {
  if (!viewerReads || typeof viewerReads.security !== "function") {
    throw new TypeError("viewerReads.security is required");
  }
  const config = normalizeBuyConfig(buyConfig);
  assertFunction(isReady, "isReady");
  assertFunction(getLocalOrigin, "getLocalOrigin");
  assertFunction(now, "now");
  assertFunction(randomId, "randomId");
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError("ttlMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxPendingTickets) || maxPendingTickets < 1) {
    throw new TypeError("maxPendingTickets must be a positive safe integer");
  }

  const tickets = new Map();

  function currentTime() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("now() must return a non-negative safe integer");
    }
    return value;
  }

  function cleanupExpired(atMs = currentTime()) {
    for (const [ticketId, ticket] of tickets) {
      if (ticket.expiresAtMs <= atMs) tickets.delete(ticketId);
    }
  }

  function nextOpaqueId(label) {
    const value = randomId();
    if (typeof value !== "string" || value.length === 0 || value.length > 128) {
      throw new TypeError(`${label} must be a non-empty bounded string`);
    }
    return value;
  }

  async function prepare(securityId) {
    if (!config.enabled || isReady() !== true) {
      fail(ERROR_CODES.SERVICE_NOT_READY);
    }
    if (typeof securityId !== "string" || securityId.length === 0 || securityId.length > 128) {
      fail(ERROR_CODES.INVALID_MESSAGE);
    }

    const security = await viewerReads.security(securityId);
    if (!validCurrentSymbol(security)) {
      fail(ERROR_CODES.NOT_FOUND);
    }

    const createdAtMs = currentTime();
    cleanupExpired(createdAtMs);
    if (tickets.size >= maxPendingTickets) {
      fail(ERROR_CODES.SERVICE_NOT_READY);
    }

    const localOrigin = normalizeLocalOrigin(getLocalOrigin());
    const requestId = `buy-${nextOpaqueId("requestId")}`;
    const ticketId = nextOpaqueId("ticketId");
    if (tickets.has(ticketId)) {
      fail(ERROR_CODES.SERVICE_NOT_READY);
    }

    const intent = normalizeOrderIntent({
      requestId,
      instrument: {
        symbol: security.currentRow.Symbol,
        secType: "STK",
        currency: "USD",
        exchange: "SMART"
      },
      side: "BUY",
      quantity: config.quantity,
      orderType: "MKT",
      tif: "DAY",
      executionMode: config.mode
    });
    const expiresAtMs = createdAtMs + ttlMs;
    if (!Number.isSafeInteger(expiresAtMs)) {
      throw new TypeError("BUY ticket expiry exceeds safe integer range");
    }

    const ticket = Object.freeze({
      ticketId,
      requestId,
      securityId,
      paperName: security.paperName ?? null,
      intent,
      createdAtMs,
      expiresAtMs
    });
    tickets.set(ticketId, ticket);

    const summary = Object.freeze({
      securityId,
      paperName: security.paperName ?? null,
      symbol: intent.instrument.symbol,
      quantity: intent.quantity,
      side: intent.side,
      orderType: intent.orderType,
      tif: intent.tif,
      executionMode: intent.executionMode
    });

    return Object.freeze({
      confirmationUrl: `${localOrigin}/buy/confirm#${encodeURIComponent(ticketId)}`,
      expiresAtMs,
      summary
    });
  }

  function read(ticketId) {
    if (typeof ticketId !== "string" || ticketId.length === 0) return null;
    cleanupExpired();
    return tickets.get(ticketId) ?? null;
  }

  function consume(ticketId) {
    if (typeof ticketId !== "string" || ticketId.length === 0) return null;
    cleanupExpired();
    const ticket = tickets.get(ticketId) ?? null;
    if (!ticket) return null;
    tickets.delete(ticketId);
    return ticket;
  }

  function diagnostics() {
    cleanupExpired();
    return Object.freeze({
      enabled: config.enabled,
      pendingTicket: tickets.size > 0
    });
  }

  function clear() {
    tickets.clear();
  }

  return Object.freeze({
    prepare,
    read,
    consume,
    diagnostics,
    clear
  });
}
