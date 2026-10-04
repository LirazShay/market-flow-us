# Bounded Real-Provider Verification

This is the explicit local gate for TREE node `7.2`. It is not ordinary CI and it never stores provider credentials/session state in the repository.

## Preconditions

Before running:

1. Use the final candidate checkout with no local modifications.
2. `npm ci` is complete.
3. Fast CI, Browser CI and required workload evidence for the candidate are green/reviewed.
4. The old/legacy producer is stopped so MarketScope can own the single producer session.
5. An authenticated eligible provider page is already open in the browser.
6. Use a dedicated local verification database, not the normal production database.

The gate uses the authenticated browser page's existing same-origin session. No cookie, token, authorization header or account identifier is copied into Node, a file, a command line, or the report.

## Windows helper

For the same gate with fewer manual shell steps, run `PREPARE_LIVE_VERIFICATION.cmd` from the repository root. It accepts a full provider-page URL, derives the exact Origin, builds the same SHA-bound artifact, copies/opens the bookmarklet and starts the same dedicated loopback service/database. The browser-side bookmarklet still runs manually on the already-authenticated provider page, and all PASS rules below remain unchanged.

## Build the browser gate

From the clean candidate checkout:

```text
npm run build:live-verification
```

The build refuses a dirty working tree and embeds the exact Git `HEAD` SHA into the artifact.

Generated files are under ignored `dist/live-verification/`:

```text
market-scope-live-verification.js
market-scope-live-verification.bookmarklet.txt
```

The bookmarklet is separate from the normal MarketScope runtime.

## Start the dedicated local service

Read the exact provider page origin from the browser as `location.origin`. Use only that origin: scheme + host + optional port, with no path/query.

Start MarketScope with a dedicated verification DB:

```text
npm run service -- --db data/live-verification.duckdb --allowed-origin <exact-provider-origin>
```

The service remains loopback-only. Do not use wildcard Origin and do not bypass CSP, Local Network Access, browser security, or provider controls.

## Execute

On the already-authenticated provider page, execute the full contents of:

```text
dist/live-verification/market-scope-live-verification.bookmarklet.txt
```

The gate performs exactly one bounded proof:

```text
producer hello/session
→ validated MapHeat universe
→ universe ACK
→ one sequential complete GetSecuritiesData cycle
→ COMMIT ACK
→ Current
→ Security
→ History
→ bounded read-only Scanner query
→ producer ownership/status
→ clean producer stop
```

A sanitized JSON report is shown for copying and is also available at:

```text
window.__MARKET_SCOPE_LIVE_VERIFICATION_RESULT_V1__
```

Do not capture or commit raw authenticated browser/network dumps.

## Result classification

Only the gate may report `overall: "PASS"`.

If the gate reports `FAIL`, keep the sanitized report and investigate the checkpoint. Never replace a real failure with a manual PASS.

If the authenticated session, provider, browser policy, market condition, or other irreducible external prerequisite is unavailable, do not simulate it. Record the factual external boundary in `STATUS.yaml` using the pending classification. This runbook does not own or duplicate the current live-gate state.

A pending external gate does not invalidate already-green offline/Fake/service/workload evidence, but it is not a live PASS.
