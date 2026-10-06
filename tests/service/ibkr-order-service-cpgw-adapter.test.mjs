import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CpgwAdapter,
  CpgwAdapterError,
  CpgwTransportError,
  createCpgwTransport
} from "../../ibkr-order-service/cpgw-adapter.js";

function liveIntent(overrides = {}) {
  return {
    requestId: "req-cpgw-1",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 2,
    orderType: "LMT",
    limitPrice: 123.45,
    tif: "DAY",
    executionMode: "LIVE",
    ...overrides
  };
}

function syntheticAccount() {
  return {
    tradable: true,
    providerAccountId: "SYNTH-ACCOUNT-1",
    allowedAssetTypes: ["STK"]
  };
}

function scriptedTransport(script) {
  const calls = [];
  let index = 0;
  const requestJson = async (request) => {
    calls.push(request);
    const step = script[index++];
    assert.ok(step, `unexpected provider call ${request.method} ${request.path}`);
    if (step.assert) {
      step.assert(request);
    }
    if (step.error) {
      throw step.error;
    }
    return typeof step.result === "function"
      ? step.result(request)
      : step.result;
  };
  return { requestJson, calls, done: () => assert.equal(index, script.length) };
}

test("session/accounts/permission/contract/snapshot/what-if sequence is exact and sanitized", async () => {
  const transport = scriptedTransport([
    {
      assert: ({ method, path, body }) => {
        assert.equal(method, "POST");
        assert.equal(path, "/iserver/auth/status");
        assert.equal(body, undefined);
      },
      result: { authenticated: true, connected: true, established: true }
    },
    {
      assert: ({ method, path, body }) => {
        assert.equal(method, "POST");
        assert.equal(path, "/iserver/auth/ssodh/init");
        assert.deepEqual(body, { publish: true, compete: false });
      },
      result: { authenticated: true, connected: true, established: true }
    },
    {
      assert: ({ method, path }) => {
        assert.equal(method, "GET");
        assert.equal(path, "/iserver/accounts");
      },
      result: {
        accounts: ["SYNTH-ACCOUNT-1"],
        allowFeatures: { allowedAssetTypes: "STK,OPT" },
        selectedAccount: "SYNTH-ACCOUNT-1"
      }
    },
    {
      assert: ({ method, path, query }) => {
        assert.equal(method, "GET");
        assert.equal(path, "/iserver/secdef/search");
        assert.deepEqual(query, { symbol: "AAPL" });
        assert.equal(Object.hasOwn(query, "secType"), false);
      },
      result: [
        {
          conid: "265598",
          symbol: "AAPL",
          restricted: false,
          sections: [{ secType: "STK" }]
        }
      ]
    },
    {
      assert: ({ method, path, query }) => {
        assert.equal(method, "GET");
        assert.equal(path, "/iserver/secdef/info");
        assert.deepEqual(query, { conid: "265598", sectype: "STK" });
      },
      result: [
        {
          conid: 265598,
          symbol: "AAPL",
          secType: "STK",
          currency: "USD",
          exchange: "SMART",
          validExchanges: "SMART,NASDAQ"
        }
      ]
    },
    {
      assert: ({ method, path, query }) => {
        assert.equal(method, "GET");
        assert.equal(path, "/iserver/marketdata/snapshot");
        assert.deepEqual(query, { conids: "265598", fields: "31,84,86,6509" });
      },
      result: [{ conid: 265598, conidEx: "265598" }]
    },
    {
      result: [
        {
          conid: 265598,
          conidEx: "265598",
          _updated: 1_700_000_000_000,
          "31": "123.40",
          "84": "123.39",
          "86": "123.41",
          "6509": "RpB"
        }
      ]
    },
    {
      assert: ({ method, path, body }) => {
        assert.equal(method, "POST");
        assert.equal(path, "/iserver/account/SYNTH-ACCOUNT-1/orders/whatif");
        assert.deepEqual(body, {
          orders: [
            {
              conid: 265598,
              side: "BUY",
              orderType: "LMT",
              quantity: 2,
              tif: "DAY",
              price: 123.45,
              cOID: "mfu-8f92fc81895e7434496e"
            }
          ]
        });
      },
      result: {
        amount: { commission: "1.00", total: "247.90" },
        equity: { current: "10000", after: "9752.10" }
      }
    }
  ]);

  const adapter = new CpgwAdapter({
    requestJson: transport.requestJson,
    sleep: async () => {}
  });

  assert.deepEqual(await adapter.getSessionStatus(), {
    authenticated: true,
    brokerageSession: true,
    connected: true
  });
  assert.deepEqual(await adapter.initializeSession(), {
    authenticated: true,
    brokerageSession: true,
    connected: true
  });

  const accounts = await adapter.getTradableAccounts();
  assert.deepEqual(accounts, [syntheticAccount()]);
  assert.deepEqual(
    await adapter.checkTradingPermission({
      account: accounts[0],
      instrument: liveIntent().instrument
    }),
    { allowed: true }
  );

  const resolution = await adapter.resolveInstrument(liveIntent().instrument);
  assert.deepEqual(resolution, {
    status: "EXACT",
    conid: 265598,
    instrument: liveIntent().instrument
  });

  const snapshot = await adapter.getSnapshot({
    account: accounts[0],
    resolution
  });
  assert.equal(snapshot.status, "READY");
  assert.equal(snapshot.conid, 265598);
  assert.equal(snapshot.marketDataAvailability, "RpB");
  assert.equal(snapshot.last, 123.4);
  assert.equal(snapshot.bid, 123.39);
  assert.equal(snapshot.ask, 123.41);

  const preview = await adapter.previewOrder(liveIntent(), {
    account: accounts[0],
    resolution,
    snapshot,
    whatIf: true
  });
  assert.equal(preview.status, "ACCEPTED");
  assert.equal(preview.commission, "1.00");
  assert.equal(preview.total, "247.90");
  assert.equal(Object.hasOwn(preview, "raw"), false);
  transport.done();
});

test("instrument resolution fails closed for missing or ambiguous U.S. STK matches", async () => {
  for (const { result, expectedStatus } of [
    { result: [], expectedStatus: "UNRESOLVED" },
    {
      result: [
        { conid: "1", symbol: "AAPL", restricted: false, sections: [{ secType: "STK" }] },
        { conid: "2", symbol: "AAPL", restricted: false, sections: [{ secType: "STK" }] }
      ],
      expectedStatus: "AMBIGUOUS"
    }
  ]) {
    const transport = scriptedTransport([{ result }]);
    const adapter = new CpgwAdapter({ requestJson: transport.requestJson });
    const resolution = await adapter.resolveInstrument(liveIntent().instrument);
    assert.equal(resolution.status, expectedStatus);
    transport.done();
  }
});

test("what-if provider errors become a stable rejection without raw provider content", async () => {
  const transport = scriptedTransport([
    {
      result: {
        error: "Synthetic provider rejection mentioning SYNTH-ACCOUNT-1"
      }
    }
  ]);
  const adapter = new CpgwAdapter({ requestJson: transport.requestJson });
  const preview = await adapter.previewOrder(liveIntent(), {
    account: syntheticAccount(),
    resolution: { status: "EXACT", conid: 265598 },
    snapshot: { status: "READY" },
    whatIf: true
  });
  assert.deepEqual(preview, {
    status: "REJECTED",
    code: "PROVIDER_WHAT_IF_REJECTED"
  });
  assert.equal(JSON.stringify(preview).includes("SYNTH-ACCOUNT-1"), false);
});

test("SELL position lookup distinguishes exact zero/long coverage from unavailable or ambiguous state", async () => {
  const account = syntheticAccount();

  const exactTransport = scriptedTransport([
    { result: [{ accountId: "SYNTH-ACCOUNT-1" }] },
    { result: [{ acctId: "SYNTH-ACCOUNT-1", conid: 265598, position: 7 }] }
  ]);
  const exactAdapter = new CpgwAdapter({ requestJson: exactTransport.requestJson });
  assert.deepEqual(
    await exactAdapter.getLongPosition({ account, resolution: { conid: 265598 } }),
    { status: "EXACT", longQuantity: 7 }
  );

  const flatTransport = scriptedTransport([
    { result: [{ accountId: "SYNTH-ACCOUNT-1" }] },
    { result: [] }
  ]);
  const flatAdapter = new CpgwAdapter({ requestJson: flatTransport.requestJson });
  assert.deepEqual(
    await flatAdapter.getLongPosition({ account, resolution: { conid: 265598 } }),
    { status: "EXACT", longQuantity: 0 }
  );

  const ambiguousTransport = scriptedTransport([
    { result: [{ accountId: "SYNTH-ACCOUNT-1" }] },
    {
      result: [
        { acctId: "SYNTH-ACCOUNT-1", conid: 265598, position: 7 },
        { acctId: "SYNTH-ACCOUNT-1", conid: 265598, position: 2 }
      ]
    }
  ]);
  const ambiguousAdapter = new CpgwAdapter({ requestJson: ambiguousTransport.requestJson });
  assert.deepEqual(
    await ambiguousAdapter.getLongPosition({ account, resolution: { conid: 265598 } }),
    { status: "AMBIGUOUS" }
  );
});

test("submit classifies immediate success, reply-required and post-dispatch transport loss without blind retry", async () => {
  const account = syntheticAccount();
  const prepared = {
    account,
    resolution: { status: "EXACT", conid: 265598 }
  };

  const successTransport = scriptedTransport([
    {
      result: [{ order_id: "SYNTH-ORDER-1", order_status: "Submitted" }]
    }
  ]);
  const successAdapter = new CpgwAdapter({ requestJson: successTransport.requestJson });
  assert.deepEqual(
    await successAdapter.submitOrder(liveIntent(), prepared),
    {
      status: "SUBMITTED",
      providerOrderId: "SYNTH-ORDER-1",
      providerStatus: "Submitted"
    }
  );

  const replyTransport = scriptedTransport([
    {
      result: [
        {
          id: "SYNTH-REPLY-1",
          message: ["Synthetic warning"],
          messageIds: ["o163"],
          isSuppressed: false
        }
      ]
    }
  ]);
  const replyAdapter = new CpgwAdapter({ requestJson: replyTransport.requestJson });
  assert.deepEqual(
    await replyAdapter.submitOrder(liveIntent(), prepared),
    {
      status: "REPLY_REQUIRED",
      replyId: "SYNTH-REPLY-1",
      messageIds: ["o163"]
    }
  );

  const uncertainTransport = scriptedTransport([
    {
      error: new CpgwTransportError("synthetic connection reset", { dispatched: true })
    }
  ]);
  const uncertainAdapter = new CpgwAdapter({ requestJson: uncertainTransport.requestJson });
  await assert.rejects(
    uncertainAdapter.submitOrder(liveIntent(), prepared),
    (error) => {
      assert.ok(error instanceof CpgwAdapterError);
      assert.equal(error.code, "ACKNOWLEDGEMENT_UNKNOWN");
      assert.equal(error.checkpoint, "order-submit");
      assert.equal(error.message.includes("synthetic connection reset"), false);
      return true;
    }
  );
  assert.equal(uncertainTransport.calls.length, 1);
});

test("explicit reply confirmation, order/trade observation, cancel and keepalive return only sanitized facts", async () => {
  const transport = scriptedTransport([
    {
      assert: ({ method, path, body }) => {
        assert.equal(method, "POST");
        assert.equal(path, "/iserver/reply/SYNTH-REPLY-1");
        assert.deepEqual(body, { confirmed: true });
      },
      result: [{ order_id: "SYNTH-ORDER-1", order_status: "Submitted" }]
    },
    {
      result: {
        orders: [
          {
            account: "SYNTH-ACCOUNT-1",
            orderId: "SYNTH-ORDER-1",
            conid: 265598,
            status: "Submitted",
            filledQuantity: 1,
            remainingQuantity: 1,
            totalSize: 2,
            order_ref: "mfu-8f92fc81895e7434496e"
          }
        ],
        snapshot: true
      }
    },
    {
      result: [
        {
          account: "SYNTH-ACCOUNT-1",
          accountCode: "SYNTH-ACCOUNT-1",
          execution_id: "SYNTH-EXEC-1",
          conid: 265598,
          size: 1,
          price: "123.40",
          order_ref: "mfu-8f92fc81895e7434496e"
        }
      ]
    },
    {
      assert: ({ method, path }) => {
        assert.equal(method, "DELETE");
        assert.equal(path, "/iserver/account/SYNTH-ACCOUNT-1/order/SYNTH-ORDER-1");
      },
      result: {
        msg: "Request was submitted",
        order_id: "SYNTH-ORDER-1",
        account: "SYNTH-ACCOUNT-1",
        conid: 265598
      }
    },
    {
      assert: ({ method, path }) => {
        assert.equal(method, "POST");
        assert.equal(path, "/tickle");
      },
      result: {
        session: "PRIVATE-SYNTH-SESSION",
        ssoExpires: 300000,
        userId: 123,
        iserver: {
          authStatus: { authenticated: true, connected: true }
        }
      }
    }
  ]);

  const adapter = new CpgwAdapter({ requestJson: transport.requestJson });
  assert.deepEqual(await adapter.confirmReply("SYNTH-REPLY-1"), {
    status: "SUBMITTED",
    providerOrderId: "SYNTH-ORDER-1",
    providerStatus: "Submitted"
  });

  const orders = await adapter.getOrders();
  assert.deepEqual(orders, [
    {
      providerOrderId: "SYNTH-ORDER-1",
      conid: 265598,
      status: "Submitted",
      filledQuantity: 1,
      remainingQuantity: 1,
      totalQuantity: 2,
      correlationId: "mfu-8f92fc81895e7434496e"
    }
  ]);
  assert.equal(JSON.stringify(orders).includes("SYNTH-ACCOUNT-1"), false);

  const trades = await adapter.getTrades();
  assert.deepEqual(trades, [
    {
      executionId: "SYNTH-EXEC-1",
      conid: 265598,
      quantity: 1,
      price: "123.40",
      correlationId: "mfu-8f92fc81895e7434496e"
    }
  ]);
  assert.equal(JSON.stringify(trades).includes("SYNTH-ACCOUNT-1"), false);

  assert.deepEqual(
    await adapter.cancelOrder({
      account: syntheticAccount(),
      providerOrderId: "SYNTH-ORDER-1"
    }),
    {
      status: "CANCEL_REQUESTED",
      providerOrderId: "SYNTH-ORDER-1",
      conid: 265598
    }
  );

  assert.deepEqual(await adapter.keepalive(), {
    authenticated: true,
    connected: true,
    ssoExpiresMs: 300000
  });
  transport.done();
});

test("real transport only accepts HTTPS loopback CPGW and never changes process-global TLS policy", () => {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  assert.throws(
    () => createCpgwTransport({ baseUrl: "https://example.com/v1/api" }),
    /loopback/u
  );
  assert.throws(
    () => createCpgwTransport({ baseUrl: "http://127.0.0.1:5000/v1/api" }),
    /https/u
  );

  const transport = createCpgwTransport({
    baseUrl: "https://127.0.0.1:5000/v1/api",
    allowInsecureLoopbackTls: true
  });
  assert.equal(typeof transport, "function");
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, previous);
});
