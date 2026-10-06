import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FakeLiveIbkrAdapter } from "../ibkr-order-service/fake-live-adapter.js";
import {
  ORDER_SERVICE_HOST,
  ORDER_SERVICE_PORT,
  startOrderService
} from "../ibkr-order-service/service.js";

function instrument(symbol = "AAPL") {
  return {
    symbol,
    secType: "STK",
    currency: "USD",
    exchange: "SMART"
  };
}

function orderIntent({
  requestId,
  side = "BUY",
  quantity = 2,
  executionMode = "DRY_RUN",
  symbol = "AAPL"
}) {
  return {
    requestId,
    instrument: instrument(symbol),
    side,
    quantity,
    orderType: "LMT",
    limitPrice: 123.45,
    tif: "DAY",
    executionMode
  };
}

async function requestJson({ token, pathname, method = "GET", body, origin }) {
  const response = await fetch(`http://${ORDER_SERVICE_HOST}:${ORDER_SERVICE_PORT}${pathname}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      ...(origin === undefined ? {} : { Origin: origin }),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

async function start({ adapter, dbPath, live = false }) {
  return startOrderService({
    adapter,
    dbPath,
    processLiveEnabled: live
  });
}

async function dryRunAndRestart(dbPath, checkpoints, secrets) {
  const firstAdapter = new FakeLiveIbkrAdapter();
  const first = await start({ adapter: firstAdapter, dbPath });
  let dryOrder;
  try {
    assert.equal(first.liveEnabled, false);
    secrets.add(first.callerToken);

    const health = await requestJson({ pathname: "/health" });
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { service: "ibkr-order-service", status: "ok" });

    const missingAuth = await requestJson({ pathname: "/session" });
    assert.equal(missingAuth.status, 401);
    assert.equal(missingAuth.body.code, "LOCAL_CALLER_UNAUTHORIZED");

    const wrongAuth = await requestJson({ token: "definitely-wrong-token", pathname: "/session" });
    assert.equal(wrongAuth.status, 401);
    assert.equal(wrongAuth.body.code, "LOCAL_CALLER_UNAUTHORIZED");

    const browserOrigin = await requestJson({
      token: first.callerToken,
      pathname: "/session",
      origin: "https://attacker.example"
    });
    assert.equal(browserOrigin.status, 403);
    assert.equal(browserOrigin.body.code, "BROWSER_ORIGIN_REJECTED");

    const session = await requestJson({ token: first.callerToken, pathname: "/session" });
    assert.equal(session.status, 200);
    assert.equal(session.body.authenticated, true);

    for (const side of ["BUY", "SELL"]) {
      const preview = await requestJson({
        token: first.callerToken,
        pathname: "/orders/preview",
        method: "POST",
        body: orderIntent({ requestId: `accept-preview-${side}`, side })
      });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.preview.status, "ACCEPTED");
      assert.equal(firstAdapter.getCallCounts().submitOrder, 0);
    }

    const intent = orderIntent({ requestId: "accept-dry-restart" });
    const created = await requestJson({
      token: first.callerToken,
      pathname: "/orders",
      method: "POST",
      body: intent
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.lifecycleState, "DRY_RUN_COMPLETE");
    dryOrder = { intent, localOrderId: created.body.localOrderId };

    const replay = await requestJson({
      token: first.callerToken,
      pathname: "/orders",
      method: "POST",
      body: intent
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.localOrderId, dryOrder.localOrderId);
    assert.equal(replay.body.replayed, true);

    checkpoints.push("dry-run-auth-preview-idempotency");
  } finally {
    await first.close();
  }

  const secondAdapter = new FakeLiveIbkrAdapter();
  const second = await start({ adapter: secondAdapter, dbPath });
  try {
    secrets.add(second.callerToken);
    assert.equal(secrets.size, 2, "restart must rotate generated caller token");

    const replayAfterRestart = await requestJson({
      token: second.callerToken,
      pathname: "/orders",
      method: "POST",
      body: dryOrder.intent
    });
    assert.equal(replayAfterRestart.status, 200);
    assert.equal(replayAfterRestart.body.localOrderId, dryOrder.localOrderId);
    assert.equal(replayAfterRestart.body.replayed, true);
    assert.equal(secondAdapter.getCallCounts().submitOrder, 0);

    checkpoints.push("restart-token-rotation-idempotency");
  } finally {
    await second.close();
  }
}

async function replyCancelAndFills(dbPath, checkpoints, secrets) {
  const adapter = new FakeLiveIbkrAdapter({
    submitMode: "REPLY_REQUIRED",
    confirmMode: "SUBMITTED",
    longQuantity: 10
  });
  const runtime = await start({ adapter, dbPath, live: true });
  try {
    secrets.add(runtime.callerToken);
    assert.equal(runtime.liveEnabled, true);

    const replyIntent = orderIntent({
      requestId: "accept-live-reply-cancel",
      executionMode: "LIVE"
    });
    const pending = await requestJson({
      token: runtime.callerToken,
      pathname: "/orders",
      method: "POST",
      body: replyIntent
    });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.lifecycleState, "REPLY_REQUIRED");

    const confirmed = await requestJson({
      token: runtime.callerToken,
      pathname: `/orders/${pending.body.localOrderId}/confirm`,
      method: "POST",
      body: { confirmed: true }
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.lifecycleState, "SUBMITTED");

    adapter.setObservation({ filledQuantity: 1, status: "Submitted" });
    const partial = await requestJson({
      token: runtime.callerToken,
      pathname: "/orders",
      method: "POST",
      body: replyIntent
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.lifecycleState, "PARTIALLY_FILLED");
    assert.equal(partial.body.filledQuantity, 1);

    const cancelled = await requestJson({
      token: runtime.callerToken,
      pathname: `/orders/${pending.body.localOrderId}/cancel`,
      method: "POST",
      body: {}
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.lifecycleState, "CANCELLED");
    assert.equal(cancelled.body.filledQuantity, 1);

    const fillIntent = orderIntent({
      requestId: "accept-live-fill",
      executionMode: "LIVE",
      symbol: "MSFT"
    });
    const fillPending = await requestJson({
      token: runtime.callerToken,
      pathname: "/orders",
      method: "POST",
      body: fillIntent
    });
    assert.equal(fillPending.status, 200);
    assert.equal(fillPending.body.lifecycleState, "REPLY_REQUIRED");

    const fillSubmitted = await requestJson({
      token: runtime.callerToken,
      pathname: `/orders/${fillPending.body.localOrderId}/confirm`,
      method: "POST",
      body: { confirmed: true }
    });
    assert.equal(fillSubmitted.status, 200);
    adapter.setObservation({ filledQuantity: 2, status: "Filled" });

    const filled = await requestJson({
      token: runtime.callerToken,
      pathname: "/orders",
      method: "POST",
      body: fillIntent
    });
    assert.equal(filled.status, 200);
    assert.equal(filled.body.lifecycleState, "FILLED");
    assert.equal(filled.body.filledQuantity, 2);

    checkpoints.push("fake-live-reply-cancel-partial-full-fill");
  } finally {
    await runtime.close();
  }
}

async function acknowledgementUnknown(dbPath, checkpoints, secrets) {
  const adapter = new FakeLiveIbkrAdapter({ submitMode: "ACKNOWLEDGEMENT_UNKNOWN" });
  const runtime = await start({ adapter, dbPath, live: true });
  try {
    secrets.add(runtime.callerToken);
    const intent = orderIntent({
      requestId: "accept-live-ack-unknown",
      executionMode: "LIVE",
      symbol: "NVDA"
    });

    const uncertain = await requestJson({
      token: runtime.callerToken,
      pathname: "/orders",
      method: "POST",
      body: intent
    });
    assert.equal(uncertain.status, 200);
    assert.equal(uncertain.body.lifecycleState, "ACKNOWLEDGEMENT_UNKNOWN");
    assert.equal(adapter.getCallCounts().submitOrder, 1);

    const reconciled = await requestJson({
      token: runtime.callerToken,
      pathname: "/orders",
      method: "POST",
      body: intent
    });
    assert.equal(reconciled.status, 200);
    assert.equal(reconciled.body.lifecycleState, "SUBMITTED");
    assert.equal(adapter.getCallCounts().submitOrder, 1, "reconciliation must not blind-resubmit");

    checkpoints.push("acknowledgement-unknown-reconciliation-no-resubmit");
  } finally {
    await runtime.close();
  }
}

async function noShortGuard(dbPath, checkpoints, secrets) {
  const adapter = new FakeLiveIbkrAdapter({ longQuantity: 0 });
  const runtime = await start({ adapter, dbPath, live: true });
  try {
    secrets.add(runtime.callerToken);
    const rejected = await requestJson({
      token: runtime.callerToken,
      pathname: "/orders",
      method: "POST",
      body: orderIntent({
        requestId: "accept-live-sell-no-short",
        side: "SELL",
        quantity: 1,
        executionMode: "LIVE",
        symbol: "AMD"
      })
    });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, "SELL_POSITION_INSUFFICIENT");
    assert.equal(adapter.getCallCounts().submitOrder, 0);

    checkpoints.push("sell-no-short-opening-guard");
  } finally {
    await runtime.close();
  }
}

export async function runOrderServiceAcceptance() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-order-acceptance-"));
  const dbPath = path.join(tempDir, "orders.duckdb");
  const checkpoints = [];
  const secrets = new Set();

  try {
    await dryRunAndRestart(dbPath, checkpoints, secrets);
    await replyCancelAndFills(dbPath, checkpoints, secrets);
    await acknowledgementUnknown(dbPath, checkpoints, secrets);
    await noShortGuard(dbPath, checkpoints, secrets);

    checkpoints.push("clean-stop");
    const report = {
      schemaVersion: 1,
      acceptance: "ibkr-order-service",
      status: "PASS",
      providerEvidence: "SYNTHETIC_ONLY",
      realOrderSubmitted: false,
      endpoint: `http://${ORDER_SERVICE_HOST}:${ORDER_SERVICE_PORT}`,
      checkpoints
    };
    const serialized = JSON.stringify(report);
    for (const secret of secrets) {
      assert.equal(serialized.includes(secret), false, "sanitized report must not contain caller token");
    }
    assert.equal(serialized.includes("SYNTH-ACCOUNT"), false);
    return report;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  const report = await runOrderServiceAcceptance();
  console.log(JSON.stringify(report, null, 2));
}
