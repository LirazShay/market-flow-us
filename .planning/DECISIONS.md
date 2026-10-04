# Decisions and Open Questions

Single source for material unresolved planning questions and resolutions.

Stage 1 opened no material MarketScope decision. Market Flow decisions are inputs only until MarketScope explicitly owns a question/resolution.

## Template

### D-001 — Historical-only Detail current-summary semantics

**Status:** resolved

**Related S&T node(s):** root now; map to the eventual Detail/read leaf before freeze.

**Question:**  
When a canonical SecurityId has persisted history but no row in the current authority, how should Detail remain usable without misrepresenting historical data as current?

**Why it matters:**  
The accepted V2 product shape requires persisted history to remain viewable after a security leaves Current, while the V1 Detail implementation derives its summary from a Current row.

**Options considered:**
- promote the newest history row into the Current summary;
- refuse Detail without a Current row;
- open Detail by SecurityId, keep history available, and render Current-only summary values as unavailable.

**Resolution:**  
Use the third option. Detail is addressable by canonical SecurityId independently of Current. If a current row exists, show the normal Current-derived summary. If it does not, keep persisted history available, use persisted paperName metadata when available (otherwise SecurityId), and show Current-only values as missing/unavailable. Never silently promote the newest historical row to Current.

**Resolution basis / rationale:**  
This is the smallest behavior that satisfies the durable historical-only product requirement while preserving the authority distinction between current state and historical evidence.

**What would reopen this:**  
A later explicit product requirement introducing a separate "last known historical summary" concept, with its own labeling and contract.

### D-002 — Browser→Node market-data object boundary

**Status:** resolved

**Related S&T node(s):** root now; map to provider/protocol/persistence leaves before freeze.

**Question:**  
Which Browser-produced market-data facts cross into Node so persistence can be implemented without reverse-engineering V1 Browser/IndexedDB code?

**Why it matters:**  
MarketScope separates authenticated provider acquisition from Node/DuckDB authority. The boundary must preserve raw facts and integrity without copying Browser persistence mechanics.

**Options considered:**
- send V1 IndexedDB-shaped persistence records;
- send raw provider responses and make Node repeat provider-specific interpretation;
- send validated provider-neutral universe/cycle objects that retain full raw provider records.

**Resolution:**  
Use validated provider-neutral objects.

1. Universe replacement contains `loadedAtMs`, validated `recordCount`, and normalized security entries with canonical `securityId`, useful metadata and full `rawMapHeat`.
2. Successful cycle commit uses the exact `CompleteCycle` shape in `docs/DATA_CONTRACT.md`, including raw Security objects and explicit integrity counters.
3. Browser sends no Node `sessionId`/`cycleId`/DB row IDs.
4. Protocol must ACK a universe replacement before accepting cycles validated against that replacement.
5. Node remains free to choose its own relational schema while preserving these facts.

**Resolution basis / rationale:**  
This is the smallest boundary that keeps provider-specific validation in the authenticated Browser, prevents Node from reverse-engineering Browser internals, preserves raw evidence, and avoids transporting obsolete IndexedDB persistence shapes.

**What would reopen this:**  
Evidence that the boundary cannot meet correctness/performance requirements, or a provider model change that materially changes universe/cycle semantics.

### D-003 — Complete-cycle integrity counters include unexpected

**Status:** resolved

**Related S&T node(s):** root now; map to provider/protocol/service validation leaves before freeze.

**Question:**  
V1 validates unexpected IDs to zero but does not return an `unexpected` field in its successful cycle object. Should MarketScope expose that integrity fact explicitly?

**Why it matters:**  
The clean contract is intended to be independently understandable at the Browser→Node boundary and the original MarketScope brief explicitly requires requested/received/unique/duplicates/missing/unexpected accounting.

**Resolution:**  
Yes. MarketScope `CompleteCycle` includes `unexpected: 0` alongside `missing: 0` and `duplicates: 0`. This does not weaken or replace set-membership validation; it makes the already-proved success invariant explicit.

**Resolution basis / rationale:**  
Tiny payload cost, clearer contract, no new provider assumption.

**What would reopen this:**  
Only a broader redesign of the complete-cycle object during technical review.

### D-004 — MarketScope operational diagnostics scope

**Status:** resolved

**Related S&T node(s):** root now; map to Viewer/status-read and service-health leaves before freeze.

**Question:**  
Which V1 diagnostics are product behavior worth preserving after storage authority moves from browser IndexedDB to Node/DuckDB?

**Why it matters:**  
The original brief requires recorder/health diagnostics visible to the user, but some V1 metrics (notably browser storage quota) are artifacts of the old storage architecture.

**Resolution:**  
Preserve the compact operational-health surface: health state, last committed update, last committed cycle ID, last cycle duration, Current security count, completed/failed cycle counts and persisted-history row count. Keep it visible in MAIN and DETAIL and refresh it from trusted authority.

Do not make browser IndexedDB quota/usage a MarketScope product requirement. Do not carry the V1 Debug Bundle export UI into the initial MarketScope product solely because it existed in V1; diagnostics needed for CI/live verification are planned separately.

Preserve V1 health meanings `UNKNOWN/RUNNING/STALE/STOPPED/ERROR`, but let the Technical Spec define heartbeat cadence/stale timing coherently rather than freezing the old 15-second threshold as a product law.

**Resolution basis / rationale:**  
This retains the operational information the user needs while dropping browser-storage-specific surface area that no longer has the same meaning under Node/DuckDB, consistent with clean-room migration and KISS.

**What would reopen this:**  
A concrete operational need for additional user-visible diagnostics or a requirement for a downloadable sanitized support bundle.

### D-005 — Runtime and dependency baseline

**Status:** resolved

**Related S&T node(s):** map to service/bootstrap, browser-build and dependency leaves before freeze.

**Question:**  
Which minimal maintained runtime/dependency stack should MarketScope implement against?

**Resolution:**  
Use Node 24 LTS, native ESM JavaScript, one root npm project, `@duckdb/node-api` (Node Neo high-level API) and `ws`. Do not use the deprecated `duckdb` package, direct `@duckdb/node-bindings` dependency, Express/Nest, ORM, workspaces or TypeScript solely for architecture ceremony.

Stage-6 verified package baselines are `@duckdb/node-api@1.5.5-r.5` and `ws@8.21.3`; implementation pins exact package versions/lockfile.

**Why:**  
This is the smallest maintained stack that directly supplies native DuckDB, Promise-based APIs, statement extraction/type metadata and a Node WebSocket server.

**What would reopen this:**  
A concrete unsupported-platform/API defect or security issue in the pinned dependency.

### D-006 — DuckDB authority schema and cycle identity strategy

**Status:** resolved; schema-v2 extension governed by D-015

**Related S&T node(s):** map to DB bootstrap/persistence leaves plus the saved-query migration leaf added by the Scanner replan.

**Question:**  
How should MarketScope persist current/history with deterministic cycle identity without introducing sequence side effects or a migration framework prematurely?

**Resolution:**  
The original market-authority model remains unchanged: `schema_info`, `sessions`, `universe`, `cycles`, `history`, `latest`; all-seen universe metadata with `is_current`; whole-`latest` replacement per complete cycle; append-only successful history; raw provider JSON plus a small typed projection; and `cycle_id = MAX(cycles.cycle_id)+1` inside the one serialized writer transaction. Create no SQL sequence.

D-015 now adds the first explicit schema evolution: v2 adds only `scanner_saved_queries` as user configuration and an explicit transactional v1→v2 migration. It does not change market-authority table semantics or introduce a generic migration framework.

**Why:**  
The accepted cycle is a complete universe; one serialized writer removes allocation races; avoiding sequences reduces Scanner-accessible mutation surface. The saved-query requirement is a genuine second-schema requirement, so one reviewed migration is now justified while a general migration framework remains unnecessary.

**What would reopen this:**  
Measured workload evidence, a future schema-v3 requirement, or evidence that saved-query configuration in the same DuckDB materially interferes with market authority.

### D-007 — Scanner admission uses DuckDB parser/type metadata plus hardening

**Status:** resolved

**Related S&T node(s):** map to Scanner service/security leaves.

**Question:**  
How can Scanner support broad analytical SELECT SQL without letting SELECT-shaped dynamic functions mutate authority?

**Resolution:**  
Use the high-level DuckDB Node Neo APIs: extract exactly one statement, prepare it, require `StatementType.SELECT`, require zero parameters, then reject `query`, `query_table`, and any invoked function marked `has_side_effects=true` in `duckdb_functions()`. Run against a hardened instance with external access, extension auto-install/load, community extensions and persistent secrets disabled, then lock configuration. The current schema creates no sequence objects.

**Why:**  
This relies on DuckDB's own parser/statement metadata for the structural gate, adds conservative function-level defense in depth, and avoids building a custom SQL parser.

**What would reopen this:**  
A DuckDB upgrade changes statement/function metadata, or tests find a SELECT mutation path not covered by the gate.

### D-008 — Loopback WebSocket remains target with explicit provider compatibility gate

**Status:** resolved with external verification condition

**Related S&T node(s):** map to protocol transport leaf and real-provider verification leaf.

**Question:**  
Should planning abandon `ws://127.0.0.1:8765` because modern browsers may apply CSP/Local Network Access rules to an HTTPS provider page?

**Resolution:**  
No. Keep the requested loopback WebSocket target and implement it against Fake Market/CI. Add a bounded real-provider transport proof for current browser CSP/LNA behavior before release. If that proof fails, reopen only the transport branch; do not bypass browser/provider security controls.

**Why:**  
Loopback remains the simplest architecture and current web-platform rules treat loopback specially, but provider CSP/LNA are external facts that planning cannot honestly declare PASS without the real page/session.

**What would reopen this:**  
The live transport proof fails on the supported browser/provider page.

### D-009 — Browser runtime delivery reuses the self-contained V1 pattern, not its storage architecture

**Status:** resolved

**Related S&T node(s):** map to browser build/runtime leaf and Fake Market browser leaf.

**Question:**  
How should the same normal browser runtime execute on the authenticated provider page and Fake Market without introducing a frontend hosting system?

**Resolution:**  
Build one self-contained browser runtime from one source graph. Fake Market loads the readable built runtime directly. Production additionally gets a self-contained bookmarklet launcher generated from the same source graph; it must not fetch executable remote JavaScript. The runtime opens/reuses a same-origin Viewer and connects to Node authority.

**Why:**  
This is a proven delivery pattern from V1, avoids remote code/CSP script-hosting dependencies, and preserves one product implementation while dropping IndexedDB authority.

**What would reopen this:**  
Measured artifact/browser limitations or provider policy makes the self-contained launcher infeasible.

### D-010 — Canonical Fake Market is a stateful real HTTP provider

**Status:** resolved

**Related S&T node(s):** map to Fake Market + Browser E2E/demo leaves.

**Question:**  
How should offline verification model changing multi-chunk market data without turning Playwright interception into the product's test architecture?

**Resolution:**  
Build one loopback HTTP Fake Market that serves the production provider paths, hosts the normal built runtime, and maintains deterministic logical market state. All GetSecuritiesData chunks belonging to one full-universe pass read the same logical cycle; the fake advances only after the complete current-universe ID set has been served. Stable synthetic scenarios cover normal movement, null/zero/missing data, malformed/incomplete provider results, delay and universe removal.

Playwright `page.route` remains allowed only for narrow isolated malformed cases when cheaper.

**Why:**  
This proves the real browser fetch adapter and chunk flow, supports CI and manual demo from the same implementation, and eliminates random timing from correctness tests.

**What would reopen this:**  
A real provider behavior cannot be represented by the canonical fake without distorting the provider contract.

### D-011 — Fast CI includes real service integration; Browser CI is the product-code final gate

**Status:** resolved

**Related S&T node(s):** map to CI/test-infrastructure leaves.

**Question:**  
How should verification balance fast feedback with the new Node/DuckDB/WebSocket architecture?

**Resolution:**  
`test:fast` includes Unit + real-service integration (real `ws`, real temporary DuckDB). Fast CI runs on normal relevant pushes/PRs. Full Chromium Browser CI runs automatically for product-code changes affecting the end-to-end product and is required on the final changed state before the implementation leaf closes. Workload remains separate; live provider remains local/manual-gated.

**Why:**  
Transaction/protocol correctness is too central to defer to browser E2E, while deterministic service tests are still much cheaper than full Chromium. Automatic browser final-state CI prevents integration drift without using the full suite for every red/green micro-step.

**What would reopen this:**  
Measured service-test or Browser-CI runtime becomes materially impractical; any relaxation must retain equivalent final-state proof.

### D-012 — Workload begins with measurement, not invented latency SLOs

**Status:** resolved

**Related S&T node(s):** map to workload/final-verification leaf.

**Question:**  
What performance threshold should the first native-DuckDB implementation pass before empirical baseline exists?

**Resolution:**  
Use the representative 561 × 600 workload and record DB size plus commit/Current/history/Scanner/restart latency distributions. Correctness/count integrity is mandatory. Do not set an arbitrary millisecond pass/fail threshold before the first baseline. If measurements materially prevent the selected collection/Scanner cadence or ordinary interactive use, optimization/replanning is owned before release.

**Why:**  
The brief explicitly requires measurement before optimization and treats old ~3000ms cadence as evidence, not a current hard gate.

**What would reopen this:**  
An explicit product SLO is later adopted.

### D-013 — Real provider verification is a bounded self-verifying browser-side gate

**Status:** resolved

**Related S&T node(s):** map to live verification/final release leaf.

**Question:**  
What exactly remains for the authenticated provider after Fake Market, service integration and workload verification are green?

**Resolution:**  
Only irreducible external facts: real provider access/shape, exact provider Origin, CSP/LNA loopback transport, one validated real universe/cycle, Node COMMIT ACK, Current/Detail/history/Scanner reads and ownership checks. Implement a browser-side self-verifying harness using production adapters/protocol that emits only sanitized PASS/FAIL evidence. No GitHub-hosted CI credentials and no visual checklist where assertions can be automated.

**Why:**  
Keeps credentials/session data local, minimizes live-market dependence and prevents live testing from becoming a substitute for deterministic coverage.

**What would reopen this:**  
A new provider behavior can only be validated live and materially changes the product contract.

### D-014 — Minimal build and test tooling

**Status:** resolved

**Related S&T node(s):** 1.1, 1.5, 6.3, 6.4, 7.1

**Question:**  
Which concrete build/test tools should executor chats use so implementation-ready leaves do not reopen an unnecessary tooling choice?

**Resolution:**  
Use:

- `esbuild` for the self-contained browser runtime/bookmarklet build;
- Node's built-in `node:test` runner for unit, service-integration and workload tests;
- `@playwright/test` with Chromium for browser E2E.

Pin actual package versions in the implementation lockfile. Do not add Jest, Vitest, Rollup, Webpack or another runner/bundler without evidence.

**Resolution basis / rationale:**  
This is the smallest toolchain consistent with V1 evidence, the one-root npm design and the Test Strategy. Node already supplies the non-browser test runner; Playwright is required for real Chromium; esbuild is sufficient for the single browser artifact.

**What would reopen this:**  
A concrete unsupported requirement or measured/tool defect during implementation.


### D-015 — Saved Scanner query ownership, persistence and built-in/example boundary

**Status:** resolved

**Related S&T node(s):** Scanner branch; exact new leaf IDs are assigned in the next decomposition stage.

**Question:**  
What is the smallest durable design for named saved Scanner queries that survives restart, supports explicit CRUD, keeps built-in examples immutable/copyable, and does not blur market-data authority with user configuration?

**Resolution:**  
Use **Node-owned persistence in the existing MarketScope DuckDB**, not browser-local storage.

This creates the first real schema evolution:

```text
schema v1
→ explicit transactional v1→v2 migration
→ schema v2 adds scanner_saved_queries
```

The table stores only user-saved query configuration: Node-generated ID, display name + normalized collision key, SQL text, interval and timestamps. CRUD uses explicit Viewer-role protocol operations and the existing serialized writer.

Built-ins are **not** database rows. They are stable versioned source definitions merged into `scanner.queries.list`. They are read-only, copyable through normal create, and verified against the same Scanner execution path.

The canonical AI/user authoring guide is `docs/SCANNER_SQL_GUIDE.md`. Current-schema metadata and built-in definitions are mechanically checked against that guide so schema/example drift fails CI.

Browser state remains split cleanly:

```text
Node/DuckDB = durable user-query library
Browser     = cached list + selected item + editable draft + active Scanner generation
```

Selecting/saving/deleting a library entry never Activates or silently changes an already-active generation.

**Why Node/DuckDB instead of localStorage/browser storage:**  
- one durable authority regardless of provider/Fake-Market Origin;
- survives Viewer/browser close and service restart consistently;
- avoids per-origin library drift;
- reuses the existing serialized persistence boundary;
- demo reset and DB backup naturally include the matching user-query configuration;
- no second persistence engine/file format/atomic-write mechanism is introduced.

**Why schema v2 is justified:**  
The existing contract explicitly reserved reviewed migration SQL for the first real second-schema requirement. Saved query persistence is now that requirement. A single explicit v1→v2 migration is smaller and safer than inventing a generic migration framework or parallel JSON store.

**Public-schema choice:**  
`scanner_saved_queries` is readable by SELECT as documented configuration metadata. It contains no credentials/session/account/provider secrets. Arbitrary SQL still cannot mutate it because normal Scanner admission remains SELECT-only; CRUD occurs only through explicit protocol operations.

**Name semantics:**  
Use Unicode NFKC + trim + collapsed whitespace + deterministic lowercase for collision keys. User names must be non-empty, at most 120 Unicode code points, and must not collide with another user query or built-in display name. No silent overwrite.

**Built-in baseline:**  
- `builtin:all-current-fields` — bounded `SELECT * FROM latest ... LIMIT 100`;
- `builtin:market-ranking-example` — bounded latest-market ranking example using canonical fields and `securityId` alias, without claiming an undocumented trading formula.

Both default to a 5-second interval.

**Explicit exclusions:**  
No browser `localStorage` authority, no cloud sync, no query execution history, no automatic query capture, no server scheduler, no generic migration framework, no separate configuration database.

**What would reopen this:**  
A concrete requirement for cross-machine/cloud synchronization, separate configuration backup policy, or evidence that the same-DuckDB configuration table materially interferes with market authority/workload.


### D-016 — Test feedback optimization keeps full proof but removes avoidable waiting

**Status:** resolved

**Related S&T node(s):** 6.6, 6.3, 6.4.

**Trigger / measured baseline:**  
Actions run `36348375187` completed successfully but required about 79 seconds from job start to completion. Step timings were approximately:

```text
npm ci                  2s
Chromium install       26s
focused unit/service    1s
focused Chromium       11s
full Fast              15s
full Browser           16s
cleanup                 2s
```

The same job therefore paid both large browser-setup cost and serial focused+full duplication.

**Resolution:**  
Treat feedback latency as an explicit engineering property while preserving the verification contract.

The optimization mini-project must, in order:

1. profile real command/test-file durations and identify wait/setup/process-exit causes before changing architecture;
2. remove avoidable test-internal waits/open-handle delays where the observable contract can be proven deterministically instead;
3. keep full Fast and full Browser suites as final-state gates;
4. stop running focused and full versions of the same layer serially in final CI; focused tests are development/leaf evidence, while final CI runs the complete required gate once;
5. run independent Fast and Browser gates in parallel when both are required;
6. avoid repeatedly downloading/installing the Chromium binary on warm CI when a safe version-keyed cache or equivalent proven mechanism works;
7. keep path-aware CI so planning/docs-only changes do not pay Browser cost;
8. publish/verify timing evidence so later regressions are visible.

**Targets (runner queue time excluded):**

```text
full test:fast command:              <= 10s target
full Playwright test execution:      <= 12s target
warm required product-code CI gates: <= 45s wall-clock target
cold required product-code CI gates: <= 60s wall-clock target
```

The first two are optimization targets, not permission to delete tests. If a target cannot be met without weakening correctness, record the measured irreducible cause and keep correctness.

The hard success condition is at least a **35% reduction** from the 79-second measured baseline on a representative product-code PR, with the same or greater full-suite contract coverage and all gates green.

**KISS constraints:**  
Do not introduce a new test runner, distributed test service, bespoke daemon, permanent container platform, or flaky timing shortcuts merely for speed. Prefer command structure, deterministic fixtures, cache reuse, process lifecycle fixes, and CI parallelism.

**What would reopen this:**  
Suite growth or runner/platform changes make the measured feedback budget materially impractical again.
