# Market Flow US Bounded Real-Provider Verification

This is the explicit local authenticated-provider gate used by the release flow. It is not ordinary CI and it never stores provider credentials/session state in the repository.

## Preconditions

Before running:

1. Use the intended candidate checkout with no local modifications.
2. `npm ci` is complete.
3. Required Fast/Browser/workload evidence for the candidate is green/reviewed.
4. Any competing/legacy producer is stopped so Market Flow US owns the single producer session.
5. An authenticated eligible Bank Leumi U.S. provider page is already open in the browser.
6. Use the dedicated live-verification database, not the normal production database.

The gate uses the authenticated browser page's existing same-origin session. No cookie, token, authorization header, account identifier, raw authenticated response dump or private browser state is copied into Node, a file, a command line, or the report.

## Windows helper

Run `PREPARE_LIVE_VERIFICATION.cmd` from the repository root. It accepts a full provider-page URL, derives the exact Origin, builds the SHA-bound artifact, copies/opens the bookmarklet and starts the dedicated loopback service/database.

The browser-side bookmarklet is still executed manually on the already-authenticated provider page. The helper does not bypass browser/provider security.

## Build the browser gate

From the clean candidate checkout:

```text
npm run build:live-verification
```

The build refuses a dirty working tree and embeds the exact Git `HEAD` SHA into the artifact.

Generated files are under ignored `dist/live-verification/`:

```text
dist/live-verification/market-flow-us-live-verification.js
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

The bookmarklet is separate from the normal Market Flow US runtime.

## Start the dedicated local service

Read the exact provider page origin from the browser as `location.origin`. Use only that origin: scheme + host + optional port, with no path/query.

Start Market Flow US with the dedicated verification DB:

```text
npm run service -- --db data/live-verification.duckdb --allowed-origin <exact-provider-origin>
```

The service remains loopback-only. Do not use wildcard Origin and do not bypass CSP, Local Network Access, browser security, or provider controls.

## Execute

On the already-authenticated provider page, execute the full contents of:

```text
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

The gate uses the production U.S. `ScreenerHulPaging3` single-response acquisition path and performs one bounded sustained proof:

```text
producer hello/session
→ repeated complete ScreenerHulPaging3 snapshots at candidate cadence
→ same-response universe + cycle validation
→ universe ACK/revision handling when membership changes
→ COMMIT ACK for every successful cycle
→ continue until at least 20 complete cycles AND at least 60 seconds have elapsed
→ Current on the final committed cycle
→ Security
→ History containing the committed live cycles for a security present throughout the run
→ bounded read-only Scanner query
→ producer ownership/status
→ clean producer stop
```

The cadence comes from the U.S. Recorder configuration. The gate does not use the superseded Israeli multi-request acquisition semantics.

A sanitized JSON report is shown for copying and is also available at:

```text
window.__MARKET_FLOW_US_LIVE_VERIFICATION_RESULT_V1__
```

The report is identified as:

```text
market-flow-us-real-provider
```

and includes the embedded candidate commit, bounded-run counters/duration, final authority proof, last successful checkpoint and a sanitized failure checkpoint when applicable.

Do not capture or commit raw authenticated browser/network dumps.

## Result classification

Only this gate may report `overall: "PASS"` for the real authenticated provider boundary.

`PASS` requires, at minimum:

- at least 20 consecutive complete U.S. cycles;
- at least 60 seconds of sustained run time;
- one valid COMMIT ACK per completed cycle;
- valid universe revision handling;
- final Current/Security/History/Scanner authority checks;
- valid producer ownership/status;
- clean producer stop;
- candidate SHA preserved in the report.

If the gate reports `FAIL`, keep only the sanitized report and investigate `failure.checkpoint`, `failure.code` and `lastSuccessfulCheckpoint`. Never replace a real failure with a manual PASS.

If the authenticated session, provider, browser policy, market condition, or another irreducible external prerequisite is unavailable, do not simulate it. Record the factual external boundary according to the current repository status contract. A pending external gate does not invalidate already-green offline/Fake/service/workload evidence, but it is not a live PASS.
