# Replay hardening + basic BUY execution-reopen review

Review marker: `R-US-REPLAY-BUY-EXTENSION-FINAL`

**Result:** PASS AFTER CORRECTIONS — TREE/CONTRACTS READY; ALLOCATION/FREEZE STILL PENDING

This review covers only the execution-reopen extension requested after completed TREE `9.5` and before final `7.4` target-machine/provider acceptance. Completed historical leaves remain valid and are not reopened.

## Scope reviewed

```text
B-US-005 → TREE 9.6 Replay pre-user-run hardening
B-US-006 → TREE 8.5 basic in-product BUY
final acceptance → TREE 7.4 after both
```

Normative extension contracts:

```text
docs/REPLAY_HARDENING.md
docs/BASIC_BUY_INTEGRATION.md
```

Historical order/replay contracts remain authoritative where not explicitly extended:

```text
docs/IBKR_ORDER_SERVICE.md
docs/IBKR_ORDER_SERVICE_SECURITY.md
docs/MARKET_REPLAY.md
```

## 1. Structural S&T review

**PASS.**

The existing nine capability branches remain the correct top-level decomposition. No tenth branch is necessary:

- Replay hardening is part of branch `9` because it audits/repairs the already-implemented Replay capability rather than introducing a new product capability.
- Basic BUY is part of branch `8` because it consumes the completed standalone order-service boundary rather than creating a second execution authority.

Updated structure:

```text
TREE nodes:              52
implementation leaves:   39
new leaves:               2
root branches:             9
one-child decomposition:   0
```

New leaves:

```text
9.6 Replay pre-user-run hardening
8.5 basic in-product BUY integration
```

No completed leaf changes ownership or meaning.

## 2. Dependency review

**PASS AFTER CORRECTION.**

A first draft treated the requested execution order `9.6 → 8.5` as a technical dependency. That was rejected because S&T `depends_on` must represent real implementation prerequisites, not scheduling preference.

Final dependency truth:

```text
9.6 depends_on: [9.5]
8.5 depends_on: [3.3, 8.4]
7.4 depends_on: [7.5, 8.5, 9.6]
```

The later allocation will still schedule `9.6` before `8.5` because the user explicitly requested hardening first. The dependency graph remains semantically truthful.

## 3. Replay hardening necessity / sufficiency

**PASS.**

`9.6` is necessary because completed feature implementation/reclosure does not by itself prove that every cleanup, stale-callback, malformed-input, storage-failure and lifecycle race was adversarially inspected before the user's run.

It is sufficient because the contract requires both:

```text
static/adversarial audit of every Replay seam
+
executable proof of every material risk
```

Any newly identified material risk without existing proof must receive the smallest deterministic regression. Any blocking defect remains in `9.6` through root cause, fix, regression proof and affected verification.

The leaf deliberately does not add speed controls, server replay mode, virtual clock, preroll, new market persistence or other speculative capability.

## 4. Basic BUY product / KISS review

**PASS AFTER NARROWING.**

The requested first version is kept intentionally small:

```text
Detail only
BUY only
current security only
run-configured quantity
MKT
DAY
STK / USD / SMART
DRY_RUN default
LIVE only by explicit operator opt-in
```

Rejected as unnecessary for this MVP:

```text
Current/Scanner buttons
automatic Scanner → order
Demo Buy → order
Replay → order
SELL
LMT UI
per-order quantity editing
cash-amount sizing
portfolio/risk engine
new execution database/provider adapter
```

This keeps the implementation inside one coherent leaf `8.5` while preserving later extensibility.

## 5. Security review

**PASS AFTER MATERIAL CORRECTION.**

The initial integration idea considered letting the market service act as an order proxy because it can hold the sidecar caller token through IPC. That is insufficient: a browser with ordinary Viewer access could otherwise acquire unintended execution authority.

Final security boundary:

```text
provider page Viewer
→ may prepare only immutable order.buy ticket from securityId
→ zero sidecar/provider mutation

trusted product-owned loopback confirmation page
→ short-lived immutable ticket
→ per-page anti-CSRF nonce/custom header
→ explicit human confirmation
→ Node uses sidecar caller token kept only in memory
→ existing ibkr-order-service authority
```

The provider page never receives the sidecar token, never obtains CORS access to port 8770, and never sends arbitrary normalized order JSON to a generic market-service proxy.

Node resolves authoritative current `Symbol` and owns quantity, side, type, TIF and execution mode. Historical-only Detail and missing/ambiguous Symbol fail closed.

Normal launch, Replay, Scanner, Demo Buy, AI Investigation and Current remain execution-disabled.

## 6. Idempotency / uncertain acknowledgement review

**PASS.**

One server-generated `requestId` is bound to the immutable prepared intent. Double-click, response retry or local UI race must reuse the same ID and same normalized intent.

Existing sidecar semantics remain authoritative:

```text
same requestId + same intent → return/reconcile existing logical order
same requestId + different intent → reject
ACKNOWLEDGEMENT_UNKNOWN → reconcile; never blind-resubmit
```

The integration does not duplicate order state, provider reply logic, LIVE gates or reconciliation.

## 7. Replay/order isolation review

**PASS.**

Replay must remain unable to create live-order authority. Replay Host starts the normal market service without BUY-enabled composition. Reusing the Detail UI does not imply an executable BUY path.

Synthetic test composition may prove BUY behavior, but synthetic success can never be labeled as actual live IBKR success.

Replay hardening itself must verify that ordinary launch/test semantics and the normal live DB remain isolated.

## 8. Verification review

**PASS.**

`9.6` owns broad static/executable Replay audit including build, focused acceptance, full unit/service and materially affected Browser/Planning/Workload/local gates.

`8.5` owns focused proof for:

- launcher/config DRY_RUN/LIVE boundaries;
- current-Detail eligibility and Node-owned symbol projection;
- zero-mutation prepare;
- browser absence of sidecar token;
- local-page ticket/nonce/origin/content-type protections;
- double-click stable-requestId behavior;
- DRY_RUN zero submit;
- deterministic synthetic LIVE gate preservation;
- reply/rejection/acknowledgement-unknown behavior;
- normal launcher/Replay/Scanner/Demo Buy/AI execution isolation;
- existing standalone order-service regression gates.

Final `7.4` must execute against the exact candidate after both leaves complete.

## 9. Outside-in user walkthrough

**PASS.**

Expected user path after implementation:

```text
run Replay hardening before relying on manual Replay use
→ all material findings green/fixed
→ start dedicated BUY-enabled Market Flow US in DRY_RUN by default
→ choose one run quantity
→ open a current security Detail
→ click BUY
→ receive immutable summary/ticket
→ open product-owned local confirmation page
→ review symbol/quantity/BUY/MKT/DAY/mode
→ explicitly confirm
→ see exact sidecar outcome semantics
→ later opt into LIVE only through deliberate operator startup when permission exists
→ final target-machine/provider acceptance on the resulting exact SHA
```

No automatic execution is hidden behind Scanner or Replay.

## 10. KISS / negative-space challenge

**PASS.**

The replan reuses:

```text
existing Detail identity/current authority
existing Market Flow service process
existing child-process/IPC sidecar readiness seam
existing ibkr-order-service normalized intent/API
existing sidecar idempotency/reconciliation
existing Replay contracts/tests
existing CI/test architecture
```

It does not create a second broker adapter, second execution store, generic order bus, trading strategy engine, credential persistence subsystem, replay-aware market server or automatic execution scheduler.

## 11. Review outcome

The contracts, decisions and TREE are coherent and implementation-ready in substance.

The plan is **not yet frozen/authorized** because the following mechanical work remains intentionally outside this review checkpoint:

```text
repair EXECUTION allocation so hardening runs before BUY and 7.4 remains last
update STATUS + EXECUTOR_HANDOFF
update TEST_STRATEGY / Planning CI structural counts and required leaves
consolidate this review marker into normal durable handoff/review truth
run local planning validators
open planning PR
Planning CI green
review/merge
main Planning CI + open-PR audit
explicit implementation authorization
```

Until those steps are complete:

```text
phase: planning
plan_state: active
implementation_authorized: false
7.4 remains blocked
no new implementation leaf may start
```
