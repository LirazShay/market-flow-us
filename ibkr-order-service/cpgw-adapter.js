import { createHash } from "node:crypto";
import https from "node:https";

import { buildProviderOrderPayload } from "./fake-adapter.js";

const DEFAULT_BASE_URL = "https://localhost:5000/v1/api";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const SNAPSHOT_FIELDS = "31,84,86,6509";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class CpgwTransportError extends Error {
  constructor(message, {
    code = "CPGW_TRANSPORT_FAILURE",
    dispatched = false,
    conclusive = false,
    statusCode = null
  } = {}) {
    super(message);
    this.name = "CpgwTransportError";
    this.code = code;
    this.dispatched = dispatched;
    this.conclusive = conclusive;
    this.statusCode = statusCode;
  }
}

export class CpgwAdapterError extends Error {
  constructor(code, checkpoint, { statusCode = 502 } = {}) {
    super(code);
    this.name = "CpgwAdapterError";
    this.code = code;
    this.checkpoint = checkpoint;
    this.statusCode = statusCode;
  }
}

function fail(code, checkpoint, options) {
  throw new CpgwAdapterError(code, checkpoint, options);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function loopbackHostname(url) {
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  return hostname.toLowerCase();
}

function assertLoopbackBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") {
    throw new TypeError("CPGW baseUrl must use https");
  }
  if (!LOOPBACK_HOSTS.has(loopbackHostname(parsed))) {
    throw new TypeError("CPGW baseUrl must target loopback only");
  }
  return parsed;
}

function combineProviderUrl(baseUrl, path, query) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new TypeError("provider path must be absolute");
  }
  const url = new URL(baseUrl.href);
  const basePath = url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;
  url.pathname = `${basePath}${path}`;
  url.search = "";
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

export function createCpgwTransport({
  baseUrl = DEFAULT_BASE_URL,
  allowInsecureLoopbackTls = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
} = {}) {
  const parsedBaseUrl = assertLoopbackBaseUrl(baseUrl);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new TypeError("maxResponseBytes must be a positive safe integer");
  }

  const agent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: allowInsecureLoopbackTls !== true
  });

  return async function requestJson({ method, path, query, body }) {
    const url = combineProviderUrl(parsedBaseUrl, path, query);
    const requestBody = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");

    return new Promise((resolve, reject) => {
      let dispatched = false;
      let settled = false;

      const rejectTransport = (error) => {
        if (settled) return;
        settled = true;
        if (error instanceof CpgwTransportError) {
          reject(error);
          return;
        }
        reject(new CpgwTransportError("CPGW transport failed", { dispatched }));
      };

      const req = https.request(url, {
        method,
        agent,
        headers: {
          Host: "api.ibkr.com",
          Accept: "application/json",
          Connection: "keep-alive",
          ...(requestBody
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(requestBody.length)
              }
            : {})
        }
      }, (response) => {
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maxResponseBytes) {
            req.destroy(new CpgwTransportError("CPGW response exceeds limit", {
              code: "CPGW_RESPONSE_TOO_LARGE",
              dispatched,
              conclusive: true,
              statusCode: response.statusCode ?? null
            }));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", rejectTransport);
        response.on("end", () => {
          if (settled) return;
          const statusCode = response.statusCode ?? 0;
          const text = Buffer.concat(chunks).toString("utf8");
          if (statusCode < 200 || statusCode >= 300) {
            settled = true;
            reject(new CpgwTransportError("CPGW HTTP request failed", {
              code: "CPGW_HTTP_ERROR",
              dispatched,
              conclusive: true,
              statusCode
            }));
            return;
          }
          if (text.length === 0) {
            settled = true;
            resolve(null);
            return;
          }
          try {
            const parsed = JSON.parse(text);
            settled = true;
            resolve(parsed);
          } catch {
            settled = true;
            reject(new CpgwTransportError("CPGW returned invalid JSON", {
              code: "CPGW_INVALID_JSON",
              dispatched,
              conclusive: true,
              statusCode
            }));
          }
        });
      });

      req.once("finish", () => {
        dispatched = true;
      });
      req.once("error", rejectTransport);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new CpgwTransportError("CPGW request timed out", {
          code: "CPGW_TIMEOUT",
          dispatched
        }));
      });

      if (requestBody) {
        req.write(requestBody);
      }
      req.end();
    });
  };
}

function parseAllowedAssetTypes(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function parsePositiveConid(value) {
  const conid = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(conid) && conid > 0 ? conid : null;
}

function parseFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replaceAll(",", "").trim();
  if (normalized.length === 0) {
    return null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function buildProviderCorrelationId(requestId) {
  if (typeof requestId !== "string" || requestId.length === 0) {
    throw new TypeError("requestId is required");
  }
  const digest = createHash("sha256").update(requestId, "utf8").digest("hex");
  return `mfu-${digest.slice(0, 20)}`;
}

function providerPayload(intent, resolution) {
  return {
    ...buildProviderOrderPayload(intent, { conid: resolution.conid }),
    cOID: buildProviderCorrelationId(intent.requestId)
  };
}

function normalizedSession(body) {
  if (!isObject(body)) {
    return {
      authenticated: false,
      brokerageSession: false,
      connected: false
    };
  }
  const authenticated = body.authenticated === true;
  const connected = body.connected === true;
  const established = body.established;
  return {
    authenticated,
    brokerageSession: authenticated && connected && established !== false,
    connected
  };
}

function isStkSection(row) {
  return Array.isArray(row?.sections)
    && row.sections.some((section) => section?.secType === "STK");
}

function exactSearchCandidates(body, symbol) {
  if (!Array.isArray(body)) {
    return [];
  }
  return body.filter((row) => (
    row?.restricted !== true
    && typeof row?.symbol === "string"
    && row.symbol.toUpperCase() === symbol
    && isStkSection(row)
    && parsePositiveConid(row.conid) !== null
  ));
}

function hasSmartExchange(row) {
  if (row?.exchange === "SMART") {
    return true;
  }
  if (typeof row?.validExchanges !== "string") {
    return false;
  }
  return row.validExchanges
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .includes("SMART");
}

function exactInfoCandidates(body, conid) {
  if (!Array.isArray(body)) {
    return [];
  }
  return body.filter((row) => (
    parsePositiveConid(row?.conid) === conid
    && row?.secType === "STK"
    && row?.currency === "USD"
    && hasSmartExchange(row)
  ));
}

function snapshotRow(body, conid) {
  if (!Array.isArray(body)) {
    return null;
  }
  return body.find((row) => parsePositiveConid(row?.conid) === conid) ?? null;
}

function readySnapshot(row) {
  if (!row) return false;
  return ["31", "84", "86"].some((field) => parseFiniteNumber(row[field]) !== null);
}

function classifySubmission(body) {
  const first = Array.isArray(body) ? body[0] : body;
  if (!isObject(first)) {
    return null;
  }
  const providerOrderId = first.order_id ?? first.orderId;
  if (providerOrderId !== undefined && providerOrderId !== null) {
    return {
      status: "SUBMITTED",
      providerOrderId: String(providerOrderId),
      providerStatus: typeof first.order_status === "string"
        ? first.order_status
        : typeof first.orderStatus === "string"
          ? first.orderStatus
          : null
    };
  }
  if (typeof first.id === "string" && first.id.length > 0) {
    return {
      status: "REPLY_REQUIRED",
      replyId: first.id,
      messageIds: Array.isArray(first.messageIds)
        ? first.messageIds.filter((value) => typeof value === "string")
        : []
    };
  }
  if (typeof first.error === "string") {
    return {
      status: "PROVIDER_REJECTED",
      code: "PROVIDER_ORDER_REJECTED"
    };
  }
  return null;
}

function sanitizeOrders(body) {
  const rows = Array.isArray(body?.orders) ? body.orders : [];
  return rows.flatMap((row) => {
    const providerOrderId = row?.orderId ?? row?.order_id;
    const conid = parsePositiveConid(row?.conid);
    if (providerOrderId === undefined || providerOrderId === null || conid === null) {
      return [];
    }
    return [{
      providerOrderId: String(providerOrderId),
      conid,
      status: typeof row.status === "string" ? row.status : null,
      filledQuantity: parseFiniteNumber(row.filledQuantity),
      remainingQuantity: parseFiniteNumber(row.remainingQuantity),
      totalQuantity: parseFiniteNumber(row.totalSize),
      correlationId: typeof row.order_ref === "string" ? row.order_ref : null
    }];
  });
}

function sanitizeTrades(body) {
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((row) => {
    const conid = parsePositiveConid(row?.conid);
    if (typeof row?.execution_id !== "string" || conid === null) {
      return [];
    }
    return [{
      executionId: row.execution_id,
      conid,
      quantity: parseFiniteNumber(row.size),
      price: row.price === undefined || row.price === null ? null : String(row.price),
      correlationId: typeof row.order_ref === "string" ? row.order_ref : null
    }];
  });
}

export class CpgwAdapter {
  #requestJson;
  #sleep;

  constructor({
    requestJson = createCpgwTransport(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    if (typeof requestJson !== "function") {
      throw new TypeError("requestJson must be a function");
    }
    if (typeof sleep !== "function") {
      throw new TypeError("sleep must be a function");
    }
    this.#requestJson = requestJson;
    this.#sleep = sleep;
  }

  async #request(checkpoint, request, { acknowledgementUnknown = false } = {}) {
    try {
      return await this.#requestJson(request);
    } catch (error) {
      if (
        acknowledgementUnknown
        && error instanceof CpgwTransportError
        && error.dispatched === true
        && error.conclusive !== true
      ) {
        fail("ACKNOWLEDGEMENT_UNKNOWN", checkpoint);
      }
      fail("CPGW_REQUEST_FAILED", checkpoint, {
        statusCode: error instanceof CpgwTransportError && Number.isInteger(error.statusCode)
          ? error.statusCode
          : 502
      });
    }
  }

  async getSessionStatus() {
    const body = await this.#request("brokerage-session", {
      method: "POST",
      path: "/iserver/auth/status"
    });
    return normalizedSession(body);
  }

  async initializeSession() {
    const body = await this.#request("brokerage-session-init", {
      method: "POST",
      path: "/iserver/auth/ssodh/init",
      body: { publish: true, compete: false }
    });
    await this.#sleep(2_000);
    return normalizedSession(body);
  }

  async getTradableAccounts() {
    const body = await this.#request("account-discovery", {
      method: "GET",
      path: "/iserver/accounts"
    });
    if (!isObject(body) || !Array.isArray(body.accounts)) {
      return [];
    }
    const allowedAssetTypes = parseAllowedAssetTypes(body.allowFeatures?.allowedAssetTypes);
    return body.accounts
      .filter((accountId) => typeof accountId === "string" && accountId.length > 0)
      .map((providerAccountId) => ({
        tradable: true,
        providerAccountId,
        allowedAssetTypes: [...allowedAssetTypes]
      }));
  }

  async checkTradingPermission({ account, instrument }) {
    const allowed = account?.tradable === true
      && typeof account.providerAccountId === "string"
      && Array.isArray(account.allowedAssetTypes)
      && account.allowedAssetTypes.includes(instrument?.secType);
    return { allowed };
  }

  async resolveInstrument(instrument) {
    const symbol = instrument?.symbol?.toUpperCase?.();
    if (typeof symbol !== "string" || symbol.length === 0) {
      return { status: "UNRESOLVED" };
    }

    const search = await this.#request("instrument-resolution", {
      method: "GET",
      path: "/iserver/secdef/search",
      query: { symbol }
    });
    const candidates = exactSearchCandidates(search, symbol);
    if (candidates.length === 0) {
      return { status: "UNRESOLVED" };
    }
    if (candidates.length !== 1) {
      return { status: "AMBIGUOUS" };
    }

    const conid = parsePositiveConid(candidates[0].conid);
    const info = await this.#request("instrument-resolution", {
      method: "GET",
      path: "/iserver/secdef/info",
      query: { conid: String(conid), sectype: "STK" }
    });
    const exact = exactInfoCandidates(info, conid);
    if (exact.length === 0) {
      return { status: "UNRESOLVED" };
    }
    if (exact.length !== 1) {
      return { status: "AMBIGUOUS" };
    }

    return {
      status: "EXACT",
      conid,
      instrument: {
        symbol,
        secType: "STK",
        currency: "USD",
        exchange: "SMART"
      }
    };
  }

  async getSnapshot({ resolution }) {
    const conid = parsePositiveConid(resolution?.conid);
    if (conid === null) {
      return { status: "UNAVAILABLE" };
    }
    const request = {
      method: "GET",
      path: "/iserver/marketdata/snapshot",
      query: { conids: String(conid), fields: SNAPSHOT_FIELDS }
    };

    const preflight = await this.#request("market-data-snapshot", request);
    let row = snapshotRow(preflight, conid);
    if (!readySnapshot(row)) {
      await this.#sleep(200);
      const second = await this.#request("market-data-snapshot", request);
      row = snapshotRow(second, conid);
    }
    if (!readySnapshot(row)) {
      return { status: "UNAVAILABLE" };
    }

    return {
      status: "READY",
      conid,
      marketDataAvailability: typeof row["6509"] === "string" ? row["6509"] : null,
      last: parseFiniteNumber(row["31"]),
      bid: parseFiniteNumber(row["84"]),
      ask: parseFiniteNumber(row["86"]),
      updatedAtMs: Number.isSafeInteger(row._updated) ? row._updated : null
    };
  }

  async previewOrder(intent, { account, resolution, whatIf = true }) {
    if (whatIf !== true) {
      throw new TypeError("previewOrder requires whatIf=true");
    }
    const body = await this.#request("what-if-preview", {
      method: "POST",
      path: `/iserver/account/${encodeURIComponent(account.providerAccountId)}/orders/whatif`,
      body: { orders: [providerPayload(intent, resolution)] }
    });

    if (!isObject(body) || typeof body.error === "string" || Array.isArray(body)) {
      return {
        status: "REJECTED",
        code: "PROVIDER_WHAT_IF_REJECTED"
      };
    }

    return {
      status: "ACCEPTED",
      commission: body.amount?.commission === undefined ? null : String(body.amount.commission),
      total: body.amount?.total === undefined ? null : String(body.amount.total)
    };
  }

  async getLongPosition({ account, resolution }) {
    const providerAccountId = account?.providerAccountId;
    const conid = parsePositiveConid(resolution?.conid);
    if (typeof providerAccountId !== "string" || conid === null) {
      return { status: "UNAVAILABLE" };
    }

    const accounts = await this.#request("sell-position-guard", {
      method: "GET",
      path: "/portfolio/accounts"
    });
    const accountKnown = Array.isArray(accounts)
      && accounts.some((row) => (
        row?.accountId === providerAccountId
        || row?.acctId === providerAccountId
        || row?.id === providerAccountId
      ));
    if (!accountKnown) {
      return { status: "UNAVAILABLE" };
    }

    const positions = await this.#request("sell-position-guard", {
      method: "GET",
      path: `/portfolio/${encodeURIComponent(providerAccountId)}/position/${conid}`
    });
    if (!Array.isArray(positions)) {
      return { status: "UNAVAILABLE" };
    }
    if (positions.length === 0) {
      return { status: "EXACT", longQuantity: 0 };
    }
    const matching = positions.filter((row) => parsePositiveConid(row?.conid) === conid);
    if (matching.length !== 1) {
      return { status: "AMBIGUOUS" };
    }
    const quantity = parseFiniteNumber(matching[0].position);
    if (quantity === null) {
      return { status: "AMBIGUOUS" };
    }
    return {
      status: "EXACT",
      longQuantity: Math.max(0, quantity)
    };
  }

  async submitOrder(intent, { account, resolution }) {
    const body = await this.#request("order-submit", {
      method: "POST",
      path: `/iserver/account/${encodeURIComponent(account.providerAccountId)}/orders`,
      body: { orders: [providerPayload(intent, resolution)] }
    }, { acknowledgementUnknown: true });

    const result = classifySubmission(body);
    if (!result) {
      fail("PROVIDER_RESPONSE_UNRECOGNIZED", "order-submit");
    }
    return result;
  }

  async confirmReply(replyId) {
    if (typeof replyId !== "string" || replyId.length === 0) {
      throw new TypeError("replyId is required");
    }
    const body = await this.#request("order-reply", {
      method: "POST",
      path: `/iserver/reply/${encodeURIComponent(replyId)}`,
      body: { confirmed: true }
    }, { acknowledgementUnknown: true });
    const result = classifySubmission(body);
    if (!result) {
      fail("PROVIDER_RESPONSE_UNRECOGNIZED", "order-reply");
    }
    return result;
  }

  async getOrders() {
    const body = await this.#request("order-reconciliation", {
      method: "GET",
      path: "/iserver/account/orders"
    });
    return sanitizeOrders(body);
  }

  async getTrades() {
    const body = await this.#request("trade-reconciliation", {
      method: "GET",
      path: "/iserver/account/trades"
    });
    return sanitizeTrades(body);
  }

  async cancelOrder({ account, providerOrderId }) {
    if (typeof providerOrderId !== "string" || providerOrderId.length === 0) {
      throw new TypeError("providerOrderId is required");
    }
    const body = await this.#request("order-cancel", {
      method: "DELETE",
      path: `/iserver/account/${encodeURIComponent(account.providerAccountId)}/order/${encodeURIComponent(providerOrderId)}`
    });
    if (!isObject(body) || typeof body.error === "string") {
      fail("PROVIDER_CANCEL_REJECTED", "order-cancel");
    }
    return {
      status: "CANCEL_REQUESTED",
      providerOrderId: body.order_id === undefined ? providerOrderId : String(body.order_id),
      conid: parsePositiveConid(body.conid)
    };
  }

  async keepalive() {
    const body = await this.#request("keepalive", {
      method: "POST",
      path: "/tickle"
    });
    const auth = body?.iserver?.authStatus;
    return {
      authenticated: auth?.authenticated === true,
      connected: auth?.connected === true,
      ssoExpiresMs: Number.isFinite(body?.ssoExpires) ? body.ssoExpires : null
    };
  }
}
