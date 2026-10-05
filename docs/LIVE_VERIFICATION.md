# Market Flow US Bounded Real-Provider Verification

This is the explicit local authenticated-provider gate used by the release flow. It is not ordinary CI and it never stores provider credentials/session state in the repository.

The gate proves two deliberately separate facts in one SHA-bound report:

1. authenticated provider shape/transport/authority over a sustained bounded run;
2. when real provider values actually change, a mechanically verified market-open movement witness reflected in committed Current/History authority.

A closed/static market is therefore allowed to produce a valid base PASS while movement remains `PENDING`.

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

After that base boundary is PASS, the same artifact automatically evaluates market-open movement evidence from the already-committed live cycle range:

```text
bounded read-only Scanner witness over firstCycleId..lastCycleId
→ only persisted provider fields: Price / ChangePercent / BidRate / AskRate / DailyVolume / TradeDateTime
→ local collected_at_ms is excluded
→ deterministic single security/field witness when a change exists
→ trusted Current + History reflection proof
→ movement.status = PASS | PENDING | FAIL
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

and includes the embedded candidate commit, bounded-run counters/duration, final authority proof, last successful checkpoint, and on a base PASS a bounded `movement` classification. The movement section contains status/witness metadata only; it does not copy raw provider responses or provider market-value dumps.

Do not capture or commit raw authenticated browser/network dumps.

## What `overall: "PASS"` proves

Base PASS requires, at minimum:

- at least 20 consecutive complete U.S. cycles;
- at least 60 seconds of sustained run time;
- one valid COMMIT ACK per completed cycle;
- valid universe revision handling;
- final Current/Security/History/Scanner authority checks;
- valid producer ownership/status;
- clean producer stop;
- candidate SHA preserved in the report.

A base PASS proves that the authenticated provider boundary, browser/runtime path, local authority and trusted read/Scanner path all worked for the bounded run.

It deliberately remains a separate fact from movement. A static market can validly satisfy this base boundary.

## Closed/static authenticated market

A closed or static market may legitimately return the same market values across consecutive complete provider responses.

Repeated equal values are acceptable when:

- every provider response is complete and valid;
- every cycle receives a durable COMMIT ACK;
- Current/Security/History/Scanner/ownership/clean-stop proof passes.

In that case the expected report shape is:

```text
overall = "PASS"
movement.status = "PENDING"
movement.code = "NO_MARKET_MOVEMENT_OBSERVED"
```

This is valid authenticated static-provider compatibility evidence. It is not market-open movement PASS.

TREE `7.4` requires at least five consecutive complete static responses. The current sustained gate is stricter on count/time (`20` cycles and `60` seconds), so a successful static run exceeds that minimum while still proving the same compatibility boundary.

## Market-open movement acceptance

Market-open acceptance proves an additional fact: at least one persisted provider market/freshness field changed during the exact SHA-bound committed cycle range and that change reached committed product authority.

The movement witness intentionally excludes `collected_at_ms`, because local polling time always advances and cannot prove provider movement.

A successful movement classification requires:

```text
overall = "PASS"
movement.status = "PASS"
movement.observed = true
movement.currentReflected = true
movement.historyReflected = true
```

The witness is selected deterministically from the exact live cycle-id range and must still belong to the final `latest` cycle. Trusted Current and History reads then prove the final changed field value and multiple committed values across the run.

If the base run passes but no real provider-field change is observed:

```text
movement.status = "PENDING"
```

The result is inconclusive for FR-13 and must be rerun later; do not weaken the contract or convert it manually to PASS.

If a provider-field change is detected but committed Current/History reflection cannot be proven:

```text
movement.status = "FAIL"
```

That failure must be investigated. The already-proven base/static boundary remains a separate fact, but FR-13 is not green.

## Result classification

Only the gate may report the external facts it actually verifies.

If `overall` is `FAIL`, keep only the sanitized report and investigate `failure.checkpoint`, `failure.code` and `lastSuccessfulCheckpoint`.

If `overall` is `PASS` and movement is `PENDING`, the authenticated static boundary is green but market-open acceptance is still pending.

If `overall` is `PASS` and movement is `FAIL`, do not claim FR-13; investigate the movement reflection failure.

Only `overall: "PASS"` together with `movement.status: "PASS"` satisfies the market-open movement requirement.

If the authenticated session, provider, browser policy, market condition, or another irreducible external prerequisite is unavailable, do not simulate it. Record the factual external boundary according to the current repository status contract. A pending external gate does not invalidate already-green offline/Fake/service/workload evidence, but it is not a live movement PASS.

## Relation to local and daily acceptance

The final target-machine order is:

```text
Local Fake Leumi bounded modes
→ isolated day-bounded profiles
→ 4096 × 180 target-machine profile
→ NEW_TRADING_DAY.cmd lifecycle proof
→ authenticated closed/static provider compatibility
→ authenticated market-open movement proof
```

The normal production DB (`data/market-flow-us.duckdb`) is an active-day DB and is handled by `NEW_TRADING_DAY.cmd`. This live gate intentionally uses `data/live-verification.duckdb` instead, so real-provider verification cannot accidentally roll or mutate the user's normal active-day authority.
