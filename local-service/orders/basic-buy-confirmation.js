import { randomBytes } from "node:crypto";

const MAX_BODY_BYTES = 2048;
const DEFAULT_PAGE_TTL_MS = 120_000;
const DEFAULT_MAX_PAGE_SESSIONS = 64;
const CSRF_HEADER = "x-market-flow-csrf";
const CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'none'; img-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

export const BASIC_BUY_CSRF_HEADER = CSRF_HEADER;

export class BasicBuyConfirmationError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = "BasicBuyConfirmationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode) {
  throw new BasicBuyConfirmationError(code, statusCode);
}

function secureHeaders(contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": CSP
  };
}

function write(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    ...secureHeaders(contentType),
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function writeJson(response, statusCode, payload) {
  write(response, statusCode, "application/json; charset=utf-8", JSON.stringify(payload));
}

function writeFailure(response, error) {
  if (error instanceof BasicBuyConfirmationError) {
    writeJson(response, error.statusCode, { code: error.code });
    return;
  }
  writeJson(response, 500, { code: "BASIC_BUY_CONFIRMATION_INTERNAL_ERROR" });
}

function exactLocalOrigin(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("BASIC_BUY_LOCAL_ORIGIN_UNAVAILABLE", 503);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("BASIC_BUY_LOCAL_ORIGIN_UNAVAILABLE", 503);
  }
  const loopback = parsed.hostname === "127.0.0.1"
    || parsed.hostname === "localhost"
    || parsed.hostname === "[::1]";
  if (parsed.protocol !== "http:" || !loopback || parsed.origin !== value) {
    fail("BASIC_BUY_LOCAL_ORIGIN_UNAVAILABLE", 503);
  }
  return value;
}

function assertSameLocalOrigin(request, getLocalOrigin) {
  const expected = exactLocalOrigin(getLocalOrigin());
  if (request.headers.origin !== expected) {
    fail("BASIC_BUY_CONFIRMATION_ORIGIN_REJECTED", 403);
  }
}

function assertJsonContentType(request) {
  const raw = request.headers["content-type"];
  if (typeof raw !== "string" || raw.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    fail("BASIC_BUY_CONFIRMATION_CONTENT_TYPE_REJECTED", 415);
  }
}

async function readJson(request) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    request.resume();
    fail("BASIC_BUY_CONFIRMATION_BODY_TOO_LARGE", 413);
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      request.resume();
      fail("BASIC_BUY_CONFIRMATION_BODY_TOO_LARGE", 413);
    }
    chunks.push(chunk);
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail("BASIC_BUY_CONFIRMATION_BODY_INVALID", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("BASIC_BUY_CONFIRMATION_BODY_INVALID", 400);
  }
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "ticketId") {
    fail("BASIC_BUY_CONFIRMATION_BODY_INVALID", 400);
  }
  if (typeof parsed.ticketId !== "string" || parsed.ticketId.length === 0 || parsed.ticketId.length > 128) {
    fail("BASIC_BUY_CONFIRMATION_BODY_INVALID", 400);
  }
  return parsed;
}

function pageHtml(nonce) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Market Flow US - Confirm BUY</title>
</head>
<body data-csrf="${nonce}">
<h1>Confirm BUY</h1>
<p id="status">Loading trusted order ticket...</p>
<dl id="summary" hidden>
<dt>Security</dt><dd id="securityId"></dd>
<dt>Name</dt><dd id="paperName"></dd>
<dt>Symbol</dt><dd id="symbol"></dd>
<dt>Quantity</dt><dd id="quantity"></dd>
<dt>Side</dt><dd id="side"></dd>
<dt>Order type</dt><dd id="orderType"></dd>
<dt>Time in force</dt><dd id="tif"></dd>
<dt>Execution mode</dt><dd id="executionMode"></dd>
</dl>
<p id="liveWarning" hidden>LIVE — this confirmation can submit a real provider order.</p>
<button id="confirm" type="button" disabled>Confirm BUY</button>
<pre id="result"></pre>
<script src="/buy/confirm/app.js"></script>
</body>
</html>`;
}

const APP_JS = `(() => {
  "use strict";
  const csrf = document.body.dataset.csrf;
  let ticketId = "";
  try {
    ticketId = decodeURIComponent(location.hash.slice(1));
  } catch {
    ticketId = "";
  }
  history.replaceState(null, "", location.pathname);

  const status = document.getElementById("status");
  const summary = document.getElementById("summary");
  const confirm = document.getElementById("confirm");
  const liveWarning = document.getElementById("liveWarning");
  const result = document.getElementById("result");
  const fields = ["securityId", "paperName", "symbol", "quantity", "side", "orderType", "tif", "executionMode"];

  async function post(path) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Market-Flow-CSRF": csrf
      },
      body: JSON.stringify({ ticketId })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.code || "BASIC_BUY_CONFIRMATION_FAILED");
    return body;
  }

  async function load() {
    if (!ticketId) throw new Error("BASIC_BUY_TICKET_INVALID");
    const inspected = await post("/buy/confirm/inspect");
    for (const field of fields) {
      const node = document.getElementById(field);
      node.textContent = inspected.summary[field] == null ? "" : String(inspected.summary[field]);
    }
    if (inspected.summary.executionMode === "LIVE") liveWarning.hidden = false;
    summary.hidden = false;
    status.textContent = "Review the immutable order details before confirming.";
    confirm.disabled = false;
  }

  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    result.textContent = "Confirming...";
    try {
      const confirmed = await post("/buy/confirm/execute");
      result.textContent = JSON.stringify(confirmed, null, 2);
    } catch (error) {
      result.textContent = error.message;
    }
  });

  load().catch((error) => {
    status.textContent = error.message;
  });
})();`;

function safeSummary(ticket) {
  const intent = ticket?.intent;
  if (!ticket || !intent || typeof intent !== "object") {
    fail("BASIC_BUY_TICKET_INVALID", 410);
  }
  return Object.freeze({
    securityId: ticket.securityId,
    paperName: ticket.paperName ?? null,
    symbol: intent.instrument?.symbol ?? null,
    quantity: intent.quantity,
    side: intent.side,
    orderType: intent.orderType,
    tif: intent.tif,
    executionMode: intent.executionMode
  });
}

export function createBasicBuyConfirmationHandler({
  tickets,
  getLocalOrigin,
  executeConfirmedBuy = null,
  now = () => Date.now(),
  randomId = () => randomBytes(32).toString("base64url"),
  pageTtlMs = DEFAULT_PAGE_TTL_MS,
  maxPageSessions = DEFAULT_MAX_PAGE_SESSIONS
} = {}) {
  if (!tickets || typeof tickets.read !== "function") throw new TypeError("tickets.read is required");
  if (typeof getLocalOrigin !== "function") throw new TypeError("getLocalOrigin must be a function");
  if (executeConfirmedBuy !== null && typeof executeConfirmedBuy !== "function") {
    throw new TypeError("executeConfirmedBuy must be null or a function");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof randomId !== "function") throw new TypeError("randomId must be a function");
  if (!Number.isSafeInteger(pageTtlMs) || pageTtlMs <= 0) throw new TypeError("pageTtlMs must be positive");
  if (!Number.isSafeInteger(maxPageSessions) || maxPageSessions <= 0) {
    throw new TypeError("maxPageSessions must be positive");
  }

  const sessions = new Map();

  function currentTime() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("now() must return a non-negative safe integer");
    return value;
  }

  function cleanupExpired(atMs = currentTime()) {
    for (const [nonce, session] of sessions) {
      if (session.expiresAtMs <= atMs) sessions.delete(nonce);
    }
  }

  function createPageNonce() {
    const atMs = currentTime();
    cleanupExpired(atMs);
    if (sessions.size >= maxPageSessions) fail("BASIC_BUY_CONFIRMATION_BUSY", 503);
    const nonce = randomId();
    if (typeof nonce !== "string" || nonce.length < 32 || nonce.length > 256 || sessions.has(nonce)) {
      fail("BASIC_BUY_CONFIRMATION_NONCE_FAILED", 503);
    }
    const expiresAtMs = atMs + pageTtlMs;
    if (!Number.isSafeInteger(expiresAtMs)) fail("BASIC_BUY_CONFIRMATION_NONCE_FAILED", 503);
    sessions.set(nonce, Object.freeze({ expiresAtMs }));
    return nonce;
  }

  function validateNonce(request) {
    cleanupExpired();
    const nonce = request.headers[CSRF_HEADER];
    if (typeof nonce !== "string" || !sessions.has(nonce)) {
      fail("BASIC_BUY_CSRF_INVALID", 403);
    }
    return nonce;
  }

  function ticketFor(ticketId) {
    const ticket = tickets.read(ticketId);
    if (!ticket) fail("BASIC_BUY_TICKET_INVALID", 410);
    return ticket;
  }

  async function postBoundary(request, response, operation) {
    assertSameLocalOrigin(request, getLocalOrigin);
    assertJsonContentType(request);
    const nonce = validateNonce(request);
    const { ticketId } = await readJson(request);
    const ticket = ticketFor(ticketId);

    if (operation === "inspect") {
      writeJson(response, 200, { summary: safeSummary(ticket) });
      return;
    }

    if (executeConfirmedBuy === null) {
      fail("BASIC_BUY_EXECUTION_UNAVAILABLE", 503);
    }

    sessions.delete(nonce);
    const result = await executeConfirmedBuy(ticket);
    writeJson(response, 200, { result });
  }

  async function handle(request, response) {
    const method = request.method ?? "GET";
    const url = request.url ?? "/";

    try {
      if (method === "GET" && url === "/buy/confirm") {
        write(response, 200, "text/html; charset=utf-8", pageHtml(createPageNonce()));
        return true;
      }
      if (method === "GET" && url === "/buy/confirm/app.js") {
        write(response, 200, "text/javascript; charset=utf-8", APP_JS);
        return true;
      }
      if (method === "POST" && url === "/buy/confirm/inspect") {
        await postBoundary(request, response, "inspect");
        return true;
      }
      if (method === "POST" && url === "/buy/confirm/execute") {
        await postBoundary(request, response, "execute");
        return true;
      }
      return false;
    } catch (error) {
      writeFailure(response, error);
      return true;
    }
  }

  return Object.freeze({
    handle,
    clear() {
      sessions.clear();
    }
  });
}
