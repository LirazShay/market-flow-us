# Market Flow US — Pre-Acceptance Extension Code Audit Report

## Audit identity

Status: `PASS`

Initial scoped extension range:

```text
base: e0af9d105004f175a44ec33fa481fba0631773bf
pre-audit head: 93a48c8b0a36433e58f09f6a607ec7cd366c9aea
commits entering audit: 35
```

Exact production runtime candidate after audit fixes:

```text
d1ff24abfe72e55302c4c008030174f8923a6d48
```

Later Stage-5 test/CI/evidence-only commits do not replace that runtime SHA.

## Stage matrix

| TREE node | Stage | State | Evidence / findings |
|---|---|---|---|
| `7.6.1` | Exact delta inventory + contract/proof map | PASS | Every material production/runtime/packaging file in the scoped extension delta mapped to contract, risk, proof and deep-review owner |
| `7.6.2` | IBKR order service + Basic BUY deep audit | PASS | Two material lifecycle defects found, root-caused, fixed and regression-proven |
| `7.6.3` | Recording/Replay/Host deep audit | PASS | One material lifecycle/cleanup defect found, root-caused, fixed and regression-proven |
| `7.6.4` | Shared integration/regression audit | PASS | Shared service/protocol/diagnostics/Viewer/launcher/DB/CI seams independently re-read; no additional material defect or execution bypass found |
| `7.6.5` | Adversarial verification + deterministic reclosure | PASS | Fresh Fast #540, Browser #498, Replay #69, Planning #700 and Workload #326 green on Stage-5 verification head `63f558bf18dc10600f89ce7f2f1196cb60e7ae49`; final audit diff reviewed |

## Reviewed capability families

The audit covered the complete recent extension window, including:

- standalone IBKR order-service validation, local security, persistence/idempotency, DRY_RUN/LIVE gates, CPGW lifecycle and operator path;
- Basic current-Detail BUY ticket, Node-owned sidecar, trusted confirmation, reply/reconciliation and Viewer isolation;
- Replay recorder, IndexedDB storage, portable source, Player/controller, Host/run lifecycle and dedicated UI/operator path;
- shared market-service config/index/service, protocol and diagnostics seams affected by the extensions;
- ordinary/BUY/Replay Windows launchers, New Trading Day boundaries, package/build scripts and CI/test routing;
- interaction seams with Current, Detail/History, Scanner, Demo Buy and AI Investigation.

No material scoped production/runtime area remains unreviewed.

## Material defects found and fixed

### 1. Planning validator drift after audit replan

The planning validator still encoded the old allocation/counts after inserting TREE `7.6`. It was repaired in PR #64 so the frozen audit plan is validated rather than bypassed.

### 2. IBKR pending cancellation misclassified as terminal

Root cause: cancellation reconciliation used an over-broad `cancel` status match, so provider states such as `PendingCancel` / `PreCancelled` could be reported as terminal `CANCELLED` before provider confirmation.

Fix: only confirmed normalized `Cancelled` is terminal; fill authority remains authoritative and partial fills stay `PARTIALLY_FILLED`.

Regression: `tests/service/ibkr-order-service-cancel-status.test.mjs` distinguishes `PendingCancel`, `PreCancelled` and terminal `Cancelled`.

### 3. Basic BUY acknowledgement uncertainty lost the same-order recovery handle

Root cause: after the trusted one-time ticket was consumed, `ACKNOWLEDGEMENT_UNKNOWN` removed the page session, so the operator could no longer reconcile the same immutable request safely.

Fix: Node retains the consumed immutable ticket only in memory while outcome is uncertain; browser receives no order-service `requestId` or caller token; only `Check status` is available and it reconciles the same intent/requestId. Provider-reply transport uncertainty enters the same fail-closed state, and transient status-check failure preserves the recovery handle.

Regression: `tests/service/basic-buy-ack-reconciliation.test.mjs` covers returned/thrown uncertainty, provider-reply transport uncertainty and transient reconciliation failure.

### 4. Replay post-start composition failure could leak a Host-owned run

Root cause: a fresh Host run could already exist when producer/viewer composition threw, while cleanup was not guaranteed for every post-start failure path.

Fix: all post-start composition runs inside one fail-closed cleanup boundary; owned run is stopped on failure; `activeRunId` is cleared only after successful stop and retained as ownership truth if cleanup itself fails.

Regression: `tests/unit/replay-run-coordinator-composition-failure.test.mjs` covers producer/viewer/open failures, malformed Viewer result and cleanup-stop failure.

## Shared-integration closure

Independent Stage-4 review confirmed:

- ordinary `START_MARKET_FLOW_US.cmd` remains execution-disabled;
- Basic BUY requires explicit BUY-enabled composition and Viewer exposes prepare-only authority, never a generic execution proxy;
- browser code receives no sidecar token or order-service requestId;
- Replay remains opt-in and the shared server/protocol remains Replay-unaware;
- normal market DB, Replay-owned DB and order-service DB remain disjoint authorities;
- New Trading Day owns only the market DB boundary;
- BUY-enabled startup cleans its owned sidecar when later startup fails;
- diagnostics remain bounded/sanitized and no raw provider/auth state is introduced;
- no test-only bypass exists in production composition.

A suspected BUY-startup child leak was explicitly checked and rejected as a false positive because the existing startup `catch` already closes the owned sidecar.

## Stage 5 fresh deterministic reclosure

Three small test-only adversarial guards were added without production-runtime changes:

- Browser: loopback BUY confirmation URL with embedded credentials is rejected before navigation;
- Replay: malformed `null` Viewer-open result after Host run start still cleans the owned run;
- shared/workload: ordinary service configuration remains BUY-disabled and `DRY_RUN` by default.

The shared guard runs inside the existing bounded workload job; no duplicate subsystem or recurring production cost was introduced. Runtime performance behavior is unchanged because Stage 5 changes only tests/CI/evidence.

Fresh verification on Stage-5 head `63f558bf18dc10600f89ce7f2f1196cb60e7ae49`:

```text
Fast #540        PASS — unit + service + standalone order acceptance
Browser #498     PASS — browser build + full Chromium E2E + bounded Local Fake acceptance
Replay #69       PASS — Replay build + focused Replay acceptance
Planning #700    PASS
Workload #326    PASS — bounded end-to-end + isolated/shared sanity
```

The complete Stage-5 diff was reviewed. It contains test/CI/evidence and final acceptance truth only; no additional production runtime change was required.

## Final disposition

The user-requested pre-acceptance code audit is complete:

```text
no known material defect remains
+ no material scoped extension area is left unreviewed
+ every discovered blocking defect is root-caused, fixed and regression-proven
+ fresh deterministic gates are green
```

This is not a claim of literal zero-bug certainty. User/target-machine/provider evidence remains the responsibility of TREE `7.4`.

Final acceptance must use exact runtime candidate:

```text
d1ff24abfe72e55302c4c008030174f8923a6d48
```

FR-1 machine prerequisite evidence remains reusable because the runtime fixes cannot invalidate those host facts. FR-2 and later candidate-bound checkpoints remain pending for Chat 28 unless the final acceptance contract explicitly permits reuse.
