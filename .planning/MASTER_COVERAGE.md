# MarketScope Master Coverage Map

## Purpose

This file is the durable **anti-forgetting coverage inventory** distilled from the original MarketScope brief.

It is intentionally much more granular than the S&T tree.

It is **not**:
- a second STATUS file;
- an implementation order;
- a replacement for `.planning/TREE.yaml`;
- permission to implement while `plan_state: active`.

Before plan freeze, every coverage ID must be mapped to one of:

```text
durable contract section
or
resolved DECISION
or
S&T node / success evidence
or
explicit N/A with rationale
```

No requirement may disappear merely because it is not currently top-of-mind.

## Mandatory re-audit checkpoints

Re-read this coverage map and compare it against the original brief whenever available:

1. after Current + Detail + Provider/Data extraction;
2. after Product Requirements/Product Spec completeness review;
3. after Technical Spec completion;
4. after Test Strategy + Fake Market design completion;
5. during outside-in coverage audit;
6. immediately before Final Planning Review;
7. immediately before `plan_state: frozen`;
8. after `EXECUTION.yaml` allocation;
9. before the first executor chat is declared ready;
10. whenever a material plan/architecture correction reopens the tree.

If the original brief is available in the active conversation, sample-check the durable map against the source again rather than trusting this file blindly.

---

# A. Repository truth, operating protocol and governance

- **GOV-001** — `LirazShay/market-scope/main` is product truth.
- **GOV-002** — `market-flow` is reference/source-library/history only.
- **GOV-003** — `st-planner` supplies the planning framework, not product truth.
- **GOV-004** — GitHub truth overrides contradictory chat context.
- **GOV-005** — Default repository-working language is Hebrew.
- **GOV-006** — Work directly in GitHub when tooling permits; avoid handing the user manual TODOs.
- **GOV-007** — One user "continue" message advances one natural stage only.
- **GOV-008** — A stage may include many tool calls/commits/tests/CI fixes when they belong to one coherent unit.
- **GOV-009** — Do not compress unrelated natural stages into one response.
- **GOV-010** — Do not invent an arbitrary number of stages; boundaries come from real work/coupling/verification.
- **GOV-011** — Fresh chats must resume from GitHub without conversation archaeology.
- **GOV-012** — Before any fresh-chat handoff, current work is closed or explicitly verification-pending.
- **GOV-013** — Fresh-chat handoff must have exact current/next pointers.
- **GOV-014** — No material decision may live only in chat text.
- **GOV-015** — Current live status belongs only in root `STATUS.yaml`.
- **GOV-016** — Planning state/pointer belongs only in `.planning/STATUS.yaml`.
- **GOV-017** — S&T execution allocation belongs only in `.planning/EXECUTION.yaml`.
- **GOV-018** — Do not duplicate live state into README/specs/source extraction.
- **GOV-019** — Treat repository artifacts as public-safe even if GitHub visibility is private.
- **GOV-020** — Completion vocabulary is reserved for the full user-defined process boundary, not arbitrary checkpoints.

# B. Clean-room migration discipline

- **MIG-001** — Do not copy Market Flow wholesale.
- **MIG-002** — Inspect old evidence selectively.
- **MIG-003** — Extract observable product knowledge before replacement implementation.
- **MIG-004** — Classify inspected legacy material as KEEP / ADAPT / DROP / INVESTIGATE.
- **MIG-005** — Every migrated artifact must justify its presence in the new product.
- **MIG-006** — A green old test is not by itself a reason to migrate it.
- **MIG-007** — Detailed old documentation is not by itself a reason to migrate it.
- **MIG-008** — Browser-SQL architecture is not current MarketScope architecture.
- **MIG-009** — DuckDB-Wasm production authority is excluded.
- **MIG-010** — OPFS production DB authority is excluded.
- **MIG-011** — Browser SQL Worker authority is excluded.
- **MIG-012** — Browser DB Web Locks as DB authority are excluded.
- **MIG-013** — Browser-SQL probe/POC machinery is excluded.
- **MIG-014** — Old C01-C12 execution graph is not imported as current planning.
- **MIG-015** — Obsolete STATUS/HANDOFF/history artifacts remain out of HOT context.
- **MIG-016** — Legacy IndexedDB is not target production authority.
- **MIG-017** — Market Flow root planning may inform MarketScope but must be re-evaluated.
- **MIG-018** — Product behavior and technical architecture must be re-owned in MarketScope documents.
- **MIG-019** — Old pure helpers may be reused only if independently justified.
- **MIG-020** — Product extraction must precede Current/Detail rewrite.
- **MIG-021** — Historical evidence remains discoverable in Market Flow rather than copied into MarketScope HOT context.
- **MIG-022** — `SOURCE_EXTRACTION.md` records provenance, not live progress.

# C. Required durable documents

- **DOC-001** — `docs/PRODUCT_REQUIREMENTS.md` owns WHAT/WHY.
- **DOC-002** — `docs/PRODUCT_SPEC.md` owns exact observable behavior.
- **DOC-003** — `docs/TECHNICAL_SPEC.md` owns the current technical implementation contract.
- **DOC-004** — `docs/DATA_CONTRACT.md` owns provider/cycle/identity/raw semantics.
- **DOC-005** — `docs/TEST_STRATEGY.md` owns proof layers and boundaries.
- **DOC-006** — `docs/SOURCE_EXTRACTION.md` owns migration provenance.
- **DOC-007** — `.planning/GOAL.md` owns stable project outcome/boundary.
- **DOC-008** — `.planning/TREE.yaml` owns Strategy/Tactics logic.
- **DOC-009** — `.planning/DECISIONS.md` owns material open/resolved planning questions.
- **DOC-010** — `.planning/REVIEWS.md` owns review evidence.
- **DOC-011** — `.planning/STATUS.yaml` owns plan state/pointer.
- **DOC-012** — `.planning/EXECUTION.yaml` stays unallocated until freeze.
- **DOC-013** — Product behavior and technical implementation remain conceptually separate.
- **DOC-014** — Avoid creating overlapping documentation files for the same authority.
- **DOC-015** — Future AI must understand the product without reading Market Flow for normal work.
- **DOC-016** — README must provide a compact fresh-chat entry path.
- **DOC-017** — AGENTS must remain compact enough to be a practical mandatory entry point.
- **DOC-018** — Durable docs describe current truth, not migration diary/history.
- **DOC-019** — Historical/research rationale belongs outside HOT truth.
- **DOC-020** — Important source uncertainty uses Verified / Inferred / Unknown where needed.

# D. Product Requirements coverage

- **REQ-001** — Product is a local single-user market analysis tool.
- **REQ-002** — Product continuously acquires validated market data.
- **REQ-003** — User can inspect current full-universe state.
- **REQ-004** — User can inspect per-security persisted history.
- **REQ-005** — User can run recurring arbitrary supported analytical SQL.
- **REQ-006** — Current/history/SQL operate without cloud backend.
- **REQ-007** — Product is one product even though Browser and Node are separate processes.
- **REQ-008** — Automatic order execution is a non-goal.
- **REQ-009** — Automatic trading is a non-goal.
- **REQ-010** — Portfolio management is a non-goal.
- **REQ-011** — Cloud SaaS is a non-goal.
- **REQ-012** — Collaboration is a non-goal.
- **REQ-013** — Remote multi-user access is a non-goal.
- **REQ-014** — Generic enterprise data warehouse/platform is a non-goal.
- **REQ-015** — Legacy-history import is not added unless explicitly justified later.

# E. Current Universe contract

- **CUR-001** — Current derives from authoritative latest rows.
- **CUR-002** — Universe metadata enriches Current by canonical SecurityId.
- **CUR-003** — Missing universe metadata never drops a valid latest row.
- **CUR-004** — Universe-only entries do not create Current rows.
- **CUR-005** — Duplicate canonical IDs are integrity errors.
- **CUR-006** — Current has the exact extracted 16-column V1 shape unless deliberately changed later.
- **CUR-007** — Column order is stable.
- **CUR-008** — Canonical securityId displays as string identity.
- **CUR-009** — `null` displays as missing, not zero.
- **CUR-010** — `undefined/missing` remains distinct internally.
- **CUR-011** — empty string remains distinct internally.
- **CUR-012** — zero is preserved/displayed as zero.
- **CUR-013** — Formatting does not invent units/provider meaning.
- **CUR-014** — Default sort is `DailyDealsQuantity DESC`.
- **CUR-015** — String first-click sort is ASC.
- **CUR-016** — Numeric/time first-click sort is DESC.
- **CUR-017** — Repeated selected-column sort toggles.
- **CUR-018** — Tie-breaker includes `paperName ASC`.
- **CUR-019** — Final deterministic tie-break uses canonical securityId.
- **CUR-020** — Missing-value ordering is deterministic.
- **CUR-021** — Sorting never mutates authoritative persisted data.
- **CUR-022** — Explicit loading state exists.
- **CUR-023** — Explicit populated/main state exists.
- **CUR-024** — Explicit empty state exists.
- **CUR-025** — Explicit read/model error state exists.
- **CUR-026** — Read failure is not rendered as successful empty.
- **CUR-027** — Manual refresh rereads authority only.
- **CUR-028** — Manual refresh makes no provider calls.
- **CUR-029** — Live notification is a hint; rows are reread from authority.
- **CUR-030** — Lost/unavailable live notification does not break startup/manual refresh.
- **CUR-031** — Selected sort survives refresh.
- **CUR-032** — Current table scroll position survives rerender/Detail round-trip.
- **CUR-033** — Scroll preservation receives direct MarketScope proof because V1 evidence was weaker.
- **CUR-034** — Row click activates Detail.
- **CUR-035** — Enter activates focused row.
- **CUR-036** — Space activates focused row.
- **CUR-037** — Sort controls expose accessible state.
- **CUR-038** — Refresh while in Detail does not force main/empty.
- **CUR-039** — IndexedDB-specific UI wording is not preserved as product truth.
- **CUR-040** — BroadcastChannel itself is not a product requirement.

# E2. Operational diagnostics contract

- **DIAG-001** — Operational diagnostics are visibly available to the user.
- **DIAG-002** — Diagnostics remain visible in both Current/MAIN and Detail.
- **DIAG-003** — Health distinguishes UNKNOWN.
- **DIAG-004** — Health distinguishes RUNNING.
- **DIAG-005** — Health distinguishes STALE.
- **DIAG-006** — Health distinguishes STOPPED.
- **DIAG-007** — Health distinguishes ERROR.
- **DIAG-008** — Health precedence remains deterministic.
- **DIAG-009** — Last committed update is visible.
- **DIAG-010** — Last committed cycle identity is visible.
- **DIAG-011** — Last cycle duration is visible when known.
- **DIAG-012** — Current security count is visible.
- **DIAG-013** — Completed/failed cycle counts are visible without collapsing zero to missing.
- **DIAG-014** — Persisted history row count is visible.
- **DIAG-015** — Manual/live-hint refresh rereads diagnostics from authority.
- **DIAG-016** — Current-table rerender does not overwrite diagnostics.
- **DIAG-017** — Missing diagnostic values remain unknown/missing rather than fabricated.
- **DIAG-018** — V1 browser storage quota is not frozen as a MarketScope product requirement.
- **DIAG-019** — Exact heartbeat/stale timing is owned by Technical Spec; V1 15s remains extraction evidence.
- **DIAG-020** — No diagnostic refresh makes provider calls.
- **DIAG-021** — Operational failures identify the owning component.
- **DIAG-022** — Operational failures identify a stable failed checkpoint/stage.
- **DIAG-023** — Operational failures expose a stable error code when the system can classify the failure.
- **DIAG-024** — Diagnostics retain the last successful checkpoint so the failure boundary is obvious.
- **DIAG-025** — Specific sanitized technical cause survives error wrapping; generic-only replacement is forbidden when a known cause exists.
- **DIAG-026** — Normal product operation exposes a compact copyable Support Snapshot.
- **DIAG-027** — Fatal startup/launcher failures remain actionable when Viewer/service UI cannot start.
- **DIAG-028** — Checkpoint coverage distinguishes browser launch, service/hello, DB/schema, producer/session, universe/provider, complete-cycle commit, trusted read, Scanner execution and saved-query library boundaries.
- **DIAG-029** — Diagnostic state is bounded/local and never becomes market authority.
- **DIAG-030** — Diagnostic/support output excludes credentials, cookies, auth/session data, account identifiers, private browser state and raw authenticated/provider dumps.
- **DIAG-031** — Representative failure tests assert that the reported checkpoint/code matches the real failing boundary.
- **DIAG-032** — Future implementation work that changes an operational boundary must consider and preserve its diagnosability contract rather than relying on ad-hoc debugging.

# F. Security Detail / History contract

- **DET-001** — Detail opens from canonical SecurityId.
- **DET-002** — Exact V1 opening behavior must be extracted before implementation.
- **DET-003** — Current/latest representation in Detail must be explicit.
- **DET-004** — Historical row shape must be explicit.
- **DET-005** — History ordering must be verified and documented.
- **DET-006** — Page size must be verified rather than assumed from memory.
- **DET-007** — Continuation/cursor semantics must be documented.
- **DET-008** — Load More behavior must be documented.
- **DET-009** — Pagination must not duplicate rows.
- **DET-010** — Pagination must not skip rows.
- **DET-011** — Equal timestamps must remain deterministic across continuation boundaries.
- **DET-012** — Refresh behavior while in Detail must be explicit.
- **DET-013** — Already loaded history depth should be preserved when required by extracted behavior.
- **DET-014** — Historical-only persisted security must remain viewable if V1 evidence confirms it.
- **DET-015** — Back returns to Current.
- **DET-016** — Current sort survives Detail round-trip.
- **DET-017** — Current viewport/scroll survives Detail round-trip.
- **DET-018** — Detail loading state is explicit.
- **DET-019** — Detail read error is explicit/localized.
- **DET-020** — Not-found behavior is explicit.
- **DET-021** — Viewer Detail performs no provider calls.
- **DET-022** — Detail/history reads come from Node/DuckDB authority after migration.
- **DET-023** — Previous evidence suggesting page size 500 must be verified before becoming normative.
- **DET-024** — Previous evidence suggesting newest-first must be verified before becoming normative.
- **DET-025** — Previous evidence about historical-only securities must be verified before becoming normative.

# G. Dynamic SQL Scanner product contract

- **SCN-001** — Scanner is a first-class third surface.
- **SCN-002** — User edits SQL text.
- **SCN-003** — User edits positive repeat interval.
- **SCN-004** — User explicitly activates config.
- **SCN-005** — Activate executes immediately.
- **SCN-006** — Active config repeats at interval.
- **SCN-007** — One active config is sufficient.
- **SCN-008** — Draft edits are inactive until Activate.
- **SCN-009** — At most one Scanner execution is active at a time.
- **SCN-010** — No execution overlap.
- **SCN-011** — No catch-up burst after delays.
- **SCN-012** — Query error is visible.
- **SCN-013** — Zero rows is successful empty output.
- **SCN-014** — Result column names come from SQL result schema.
- **SCN-015** — Result column order comes from SQL result schema.
- **SCN-016** — UI adds no hidden ranking.
- **SCN-017** — UI adds no hidden sort.
- **SCN-018** — UI adds no hidden filter.
- **SCN-019** — UI adds no hidden LIMIT.
- **SCN-020** — Scanner cadence is independent from collector cadence.
- **SCN-021** — Supported analytical SQL includes SELECT.
- **SCN-022** — Supported analytical SQL can include JOIN.
- **SCN-023** — Supported analytical SQL can include WHERE.
- **SCN-024** — Supported analytical SQL can include GROUP BY/HAVING.
- **SCN-025** — Supported analytical SQL can include ORDER BY/LIMIT.
- **SCN-026** — Supported analytical SQL can include window functions.
- **SCN-027** — Supported analytical SQL can include history/time predicates.
- **SCN-028** — Supported analytical SQL can include cross-security comparison/ranking.
- **SCN-029** — Result canonical SecurityId may navigate to shared Detail/History.
- **SCN-030** — Exact SQL safety/admission contract must be resolved before implementation.
- **SCN-031** — Scanner provides a reusable saved-query library.
- **SCN-032** — A user can create multiple named saved queries.
- **SCN-033** — A saved query persists SQL and repeat interval.
- **SCN-034** — Saved queries persist across ordinary browser/service restarts.
- **SCN-035** — User can list/select/read saved queries by human-usable name.
- **SCN-036** — Selecting a saved query loads the draft and never auto-activates it.
- **SCN-037** — User can explicitly update a saved query after draft editing.
- **SCN-038** — User can rename a saved query.
- **SCN-039** — User can explicitly delete a saved query.
- **SCN-040** — Deleting/updating a saved query does not silently mutate an already-active Scanner generation.
- **SCN-041** — Built-in query examples are distinguishable from user-saved queries.
- **SCN-042** — Built-ins are protected from destructive update/delete.
- **SCN-043** — Built-ins can be copied into the user library for customization.
- **SCN-044** — Initial built-ins include a bounded all-current-fields/latest SELECT-star-style example.
- **SCN-045** — Initial built-ins include at least one practical canonical analytical/ranking example.
- **SCN-046** — Built-in SQL remains executable against the current public Scanner schema.
- **SCN-047** — MarketScope owns one canonical AI-friendly Scanner SQL guide.
- **SCN-048** — The guide documents all public Scanner tables/columns and canonical joins/identity.
- **SCN-049** — The guide documents verified field semantics and marks unknown semantics explicitly.
- **SCN-050** — The guide documents SQL safety/admission boundaries and null/zero/missing rules.
- **SCN-051** — The guide contains practical bounded examples and performance/bounding guidance.
- **SCN-052** — The guide contains a copyable AI prompt pattern for generating/modifying Scanner queries.
- **SCN-053** — Public Scanner schema/semantic changes must update the guide, affected built-ins and synchronization proof in the same work unit.

# H. Provider and complete-cycle data contract

- **DAT-001** — Provider authentication stays in authenticated browser context.
- **DAT-002** — MapHeat2 discovers dynamic universe.
- **DAT-003** — GetSecuritiesData supplies security snapshots.
- **DAT-004** — Snapshot acquisition remains sequential unless evidence changes it.
- **DAT-005** — Canonical identity derives from `String(PaperId or Key)`.
- **DAT-006** — Exact precedence/error cases for PaperId/Key are verified from evidence.
- **DAT-007** — Universe size is never hardcoded.
- **DAT-008** — Requested count is validated.
- **DAT-009** — Received count is validated.
- **DAT-010** — Unique count is validated.
- **DAT-011** — Duplicate IDs are detected.
- **DAT-012** — Missing requested IDs are detected.
- **DAT-013** — Unexpected IDs are detected.
- **DAT-014** — Incomplete/corrupt cycle never advances current authority.
- **DAT-015** — Incomplete/corrupt cycle never appends authoritative history.
- **DAT-016** — Raw MapHeat facts are preserved where required.
- **DAT-017** — Raw security snapshot facts are preserved where required.
- **DAT-018** — `null != 0 != "" != missing` is a data invariant.
- **DAT-019** — Unknown provider-field semantics are never guessed.
- **DAT-020** — Material source claims may be labeled Verified/Inferred/Unknown.
- **DAT-021** — Complete-cycle timing metadata is explicit.
- **DAT-022** — Complete-cycle object crossing Browser→Node is fully specified.
- **DAT-023** — Node persistence implementation must not need to reverse-engineer old Browser code.
- **DAT-024** — Failed-cycle facts versus transient diagnostics are explicitly classified.
- **DAT-025** — Old provider pure logic is reused only after evidence-backed fit review.

# I. Browser ↔ Node process/protocol contract

- **PRO-001** — Browser owns provider authentication.
- **PRO-002** — Browser owns provider calls.
- **PRO-003** — Browser owns dynamic universe acquisition.
- **PRO-004** — Browser owns sequential chunk acquisition.
- **PRO-005** — Browser owns exact complete-cycle validation.
- **PRO-006** — Browser creates one valid complete-cycle object.
- **PRO-007** — Browser owns browser UI.
- **PRO-008** — Browser initially owns Scanner active config/timer unless evidence changes it.
- **PRO-009** — Browser does not own durable production history.
- **PRO-010** — Browser does not open DuckDB.
- **PRO-011** — Browser does not own final SQL authority.
- **PRO-012** — Browser does not own final commit authority.
- **PRO-013** — Node owns service lifecycle.
- **PRO-014** — Node owns DuckDB lifecycle.
- **PRO-015** — Node owns schema.
- **PRO-016** — Node owns sessions.
- **PRO-017** — Node owns universe persistence.
- **PRO-018** — Node owns successful/failed cycle persistence.
- **PRO-019** — Node owns history.
- **PRO-020** — Node owns latest/current authority.
- **PRO-021** — Node owns transaction/commit boundary.
- **PRO-022** — Node owns trusted Viewer reads.
- **PRO-023** — Node owns Scanner SQL execution.
- **PRO-024** — Node owns readiness/health.
- **PRO-025** — Protocol uses a small versioned envelope.
- **PRO-026** — Envelope includes version.
- **PRO-027** — Envelope includes message type.
- **PRO-028** — Request/response correlation uses requestId where needed.
- **PRO-029** — Envelope contains payload.
- **PRO-030** — Required operation list is resolved explicitly rather than hidden in implementation.
- **PRO-031** — Candidate producer lifecycle messages are reviewed.
- **PRO-032** — Candidate Viewer read messages are reviewed.
- **PRO-033** — Scanner execute message is explicit.
- **PRO-034** — Success/error response semantics are explicit.
- **PRO-035** — Do not build a generic message framework without evidence.

# J. WebSocket/security/lifecycle

- **WS-001** — Production service binds loopback only.
- **WS-002** — Production default host/port is explicit.
- **WS-003** — Browser uses native WebSocket.
- **WS-004** — Node library version is pinned if `ws` is used.
- **WS-005** — One producer is the simple production ownership model.
- **WS-006** — Multiple viewers are allowed.
- **WS-007** — Second producer is rejected or otherwise deterministically handled.
- **WS-008** — Allowed Origin policy is explicit.
- **WS-009** — Invalid Origin is rejected.
- **WS-010** — Message schema is validated.
- **WS-011** — Oversized messages are rejected.
- **WS-012** — No provider credentials/session secrets cross to Node.
- **WS-013** — No automatic reconnect framework initially.
- **WS-014** — No offline queue initially.
- **WS-015** — No replay subsystem initially.
- **WS-016** — Transport failure fails pending requests.
- **WS-017** — Transport failure stops recorder/producer flow safely.
- **WS-018** — Recovery is explicit relaunch initially.
- **WS-019** — Tests may override port/DB path/allowed local Origin explicitly.
- **WS-020** — Production defaults remain secure despite test overrides.

# K. Node + DuckDB storage/transaction design

- **DB-001** — One local Node process owns one DuckDB instance/file.
- **DB-002** — One serialized writer path initially.
- **DB-003** — Schema is minimal.
- **DB-004** — Schema version/metadata exists as needed.
- **DB-005** — Session persistence is explicit.
- **DB-006** — Universe persistence is explicit.
- **DB-007** — Cycle metadata persistence is explicit.
- **DB-008** — History persistence is explicit.
- **DB-009** — Latest/current persistence is explicit.
- **DB-010** — Raw facts retention strategy is explicit.
- **DB-011** — Successful complete-cycle commit is transactional.
- **DB-012** — Transaction begins before authoritative mutation.
- **DB-013** — Cycle/session metadata changes belong to the same atomic boundary when required.
- **DB-014** — Universe replacement/update belongs to the atomic boundary when required.
- **DB-015** — History append belongs to the atomic boundary.
- **DB-016** — Latest/current replacement belongs to the atomic boundary.
- **DB-017** — COMMIT happens before producer ACK.
- **DB-018** — Any transaction failure causes ROLLBACK.
- **DB-019** — No partial current/history authority survives failed commit.
- **DB-020** — Whole-latest replacement is considered before per-row complexity because accepted cycles represent a complete universe.
- **DB-021** — Optimization follows workload evidence, not speculation.
- **DB-022** — Node opens DB and validates schema on restart.
- **DB-023** — Stale running session is recovered to interrupted/non-running state.
- **DB-024** — Service reports ready only after DB/schema/session recovery.
- **DB-025** — Committed current/history survives Node restart.
- **DB-026** — No custom replay log without evidence.
- **DB-027** — No PID framework without evidence.
- **DB-028** — No custom WAL layer without evidence.
- **DB-029** — No service manager without evidence.
- **DB-030** — Package/API versions needed for native DuckDB are pinned/verified during implementation planning.

# L. Trusted read API

- **READ-001** — Viewer reads are narrow, not a generic RPC framework.
- **READ-002** — Current read contract is explicit.
- **READ-003** — Single-security read contract is explicit.
- **READ-004** — History-page read contract is explicit.
- **READ-005** — Status/readiness read contract is explicit.
- **READ-006** — Reuse existing logical Viewer row shapes where practical.
- **READ-007** — Do not introduce a DTO layer solely for aesthetic layering.
- **READ-008** — History newest-first requirement is verified and owned.
- **READ-009** — History page size is verified and owned.
- **READ-010** — History uses deterministic keyset pagination where appropriate.
- **READ-011** — Equal timestamps cannot duplicate/skip across pages.
- **READ-012** — Detail lookup uses canonical SecurityId.
- **READ-013** — Viewer read path performs no provider calls.
- **READ-014** — Notifications never carry authoritative market rows.
- **READ-015** — Manual/reopen recovery works from Node authority if notifications are lost.

# M. Scanner scheduler and SQL hardening

- **SAFE-001** — Browser scheduler uses activate→execute→wait→timer model initially.
- **SAFE-002** — No server-side Scanner scheduler initially.
- **SAFE-003** — No Scanner config database initially.
- **SAFE-004** — No query-history product initially.
- **SAFE-005** — No cancellation engine initially unless evidence requires it.
- **SAFE-006** — Do not equate `SELECT` with safe.
- **SAFE-007** — Pinned DuckDB/API capabilities are verified during implementation.
- **SAFE-008** — External access is disabled where supported/appropriate.
- **SAFE-009** — Auto/community extension behavior is disabled/restricted where supported.
- **SAFE-010** — Persistent secrets are disabled/restricted where supported.
- **SAFE-011** — Relevant configuration is locked after hardening where supported.
- **SAFE-012** — SQL admission requires non-empty SQL.
- **SAFE-013** — Exactly one statement is accepted.
- **SAFE-014** — Statement is prepared/parsed through the chosen API.
- **SAFE-015** — Statement type must be SELECT.
- **SAFE-016** — Unsafe query wrappers/invocation forms are rejected as needed.
- **SAFE-017** — Function metadata such as side-effect flags is inspected where API supports it.
- **SAFE-018** — Side-effecting functions are conservatively rejected.
- **SAFE-019** — Schema avoids mutation paths that can be triggered from accepted SELECT where practical.
- **SAFE-020** — Hostile-to-authority SQL examples are tested.
- **SAFE-021** — Rejected Scanner SQL leaves schema unchanged.
- **SAFE-022** — Rejected Scanner SQL leaves sessions unchanged.
- **SAFE-023** — Rejected Scanner SQL leaves cycles unchanged.
- **SAFE-024** — Rejected Scanner SQL leaves history unchanged.
- **SAFE-025** — Rejected Scanner SQL leaves latest/current unchanged.
- **SAFE-026** — Scanner protection is documented as trusted-local-operator hardening, not a hostile-code sandbox.

# N. Fake Market / Fake Leumi

- **FAK-001** — Fake Market is mandatory engineering infrastructure.
- **FAK-002** — Almost all product behavior is provable without bank login/exchange hours.
- **FAK-003** — One canonical fake provider is used.
- **FAK-004** — Fake provider is a real HTTP server/site.
- **FAK-005** — Main E2E does not rely solely on Playwright interception.
- **FAK-006** — Fake serves the production MapHeat2 path.
- **FAK-007** — Fake serves the production GetSecuritiesData path.
- **FAK-008** — Sanitized old fixtures may seed fake behavior when still valid.
- **FAK-009** — Default correctness market is small/deterministic.
- **FAK-010** — Default fake contains several securities (roughly four is acceptable initial shape).
- **FAK-011** — Fake prices change deterministically.
- **FAK-012** — Fake history grows deterministically.
- **FAK-013** — Fake includes zero values.
- **FAK-014** — Fake includes null values.
- **FAK-015** — Fake includes missing optional values.
- **FAK-016** — Fake includes normal complete cycles.
- **FAK-017** — Fake includes relevant provider/cycle failure scenarios.
- **FAK-018** — Fake advances by complete logical cycle, not random wall-clock mutation.
- **FAK-019** — Fake can be reset deterministically.
- **FAK-020** — Fake contains no real session/private data.
- **FAK-021** — Fake provider page loads the normal built browser runtime.
- **FAK-022** — Local fake usage requires no DevTools.
- **FAK-023** — Local fake usage requires no page.route.
- **FAK-024** — Local fake usage requires no bookmarklet copy/paste.
- **FAK-025** — Local fake usage requires no bank login.
- **FAK-026** — One URL exposes the realistic provider-page development surface.

# O. One-command local demo

- **DEMO-001** — A clear one-command fake-market demo exists.
- **DEMO-002** — Demo uses normal product runtime.
- **DEMO-003** — Demo starts Fake Market server.
- **DEMO-004** — Demo starts local Node service.
- **DEMO-005** — Demo uses a dedicated ignored DuckDB path.
- **DEMO-006** — Demo explicitly allows Fake Market local Origin.
- **DEMO-007** — Demo prints one browser URL.
- **DEMO-008** — Demo supports Current.
- **DEMO-009** — Demo supports Detail/History.
- **DEMO-010** — Demo supports Scanner.
- **DEMO-011** — Restart preserves demo history.
- **DEMO-012** — Separate explicit reset removes demo-only state.
- **DEMO-013** — Reset cannot touch production DB path.
- **DEMO-014** — No Electron unless later evidence requires it.
- **DEMO-015** — No installer unless later evidence requires it.
- **DEMO-016** — No custom control panel unless later evidence requires it.

# P. Test pyramid and verification boundaries

- **TST-001** — Testing is part of implementation from the first leaf.
- **TST-002** — Use proof/test first when practical.
- **TST-003** — Tests protect public/observable contracts.
- **TST-004** — Avoid private-implementation coupling.
- **TST-005** — Unit layer covers pure provider parsing.
- **TST-006** — Unit layer covers validation/accounting.
- **TST-007** — Unit layer covers SecurityId.
- **TST-008** — Unit layer covers cycle building.
- **TST-009** — Unit layer covers protocol validation/encode-decode.
- **TST-010** — Unit layer covers pagination/cursor logic.
- **TST-011** — Unit layer covers Current model/sorting.
- **TST-012** — Unit layer covers Scanner scheduling.
- **TST-013** — Unit layer covers SQL admission helpers.
- **TST-014** — Unit layer covers result shaping.
- **TST-015** — Service integration uses real Node service.
- **TST-016** — Service integration uses real WebSocket sockets.
- **TST-017** — Service integration uses real temporary native DuckDB.
- **TST-018** — Service integration covers fresh DB bootstrap.
- **TST-019** — Service integration covers reopen/schema version.
- **TST-020** — Service integration covers one producer.
- **TST-021** — Service integration covers multiple viewers.
- **TST-022** — Service integration covers wrong Origin.
- **TST-023** — Service integration covers invalid/oversized messages.
- **TST-024** — Service integration covers session lifecycle.
- **TST-025** — Service integration covers universe persistence.
- **TST-026** — Service integration covers successful cycle commit.
- **TST-027** — Service integration covers transaction fault injection.
- **TST-028** — Service integration covers rollback at important transaction phases.
- **TST-029** — Service integration proves failed cycle never becomes Current.
- **TST-030** — Service integration covers restart/interrupted session.
- **TST-031** — Service integration covers Current reads.
- **TST-032** — Service integration covers Detail reads.
- **TST-033** — Service integration covers history pagination.
- **TST-034** — Service integration covers Scanner guard.
- **TST-035** — Service integration covers Scanner execution.
- **TST-036** — Service integration proves rejected SQL does not mutate authority.
- **TST-037** — Service integration covers shutdown.
- **TST-038** — Chromium E2E uses real Fake Market HTTP.
- **TST-039** — Chromium E2E uses normal browser runtime.
- **TST-040** — Chromium E2E uses real provider fetch calls to fake endpoints.
- **TST-041** — Chromium E2E uses real WebSocket.
- **TST-042** — Chromium E2E uses real Node.
- **TST-043** — Chromium E2E uses real temporary DuckDB.
- **TST-044** — Chromium E2E covers Viewer Current.
- **TST-045** — Chromium E2E covers Detail/history.
- **TST-046** — Chromium E2E covers Back.
- **TST-047** — Chromium E2E covers Scanner.
- **TST-048** — Chromium E2E covers Scanner SecurityId navigation.
- **TST-049** — Chromium E2E covers no-service launch.
- **TST-050** — Chromium E2E covers service disconnect.
- **TST-051** — Chromium E2E covers explicit relaunch.
- **TST-052** — Chromium E2E covers multiple viewers.
- **TST-053** — Chromium E2E covers second producer rejection.
- **TST-054** — Chromium E2E covers reload.
- **TST-055** — Chromium E2E covers refresh.
- **TST-056** — Focused malformed-provider tests may use interception when cheapest.
- **TST-057** — Manual demo uses the same fake/service implementation as CI.
- **TST-058** — Test Strategy explicitly says what each layer proves.
- **TST-059** — Test Strategy explicitly says what each layer does not prove.
- **TST-060** — Unexpected red is fixed by the current owner before progression.
- **TST-061** — Test-feedback latency has an explicit measured baseline.
- **TST-062** — Optimization may not delete/weaken full verification solely for speed.
- **TST-063** — Final CI avoids serial focused+full duplication for the same layer.
- **TST-064** — Fast and Browser gates run independently/in parallel when both apply.
- **TST-065** — Chromium provisioning is cached/reused when safe and version-correct.
- **TST-066** — Feedback optimization has explicit Fast/Browser/wall-clock targets and before/after evidence.
- **TST-067** — Service tests are profiled for process/open-handle delay, not assertion duration only.
- **TST-068** — Planning/docs-only changes do not pay unnecessary Browser CI cost.

# Q. Workload / performance evidence

- **LOAD-001** — Correctness fixtures remain small.
- **LOAD-002** — Scale workload is separate from correctness fake.
- **LOAD-003** — Initial representative universe target is around 561 securities.
- **LOAD-004** — Representative workload uses hundreds of cycles.
- **LOAD-005** — A 600×561-scale case may be used as useful initial evidence, not immutable law.
- **LOAD-006** — Workload interleaves writes.
- **LOAD-007** — Workload interleaves Current reads.
- **LOAD-008** — Workload interleaves history reads.
- **LOAD-009** — Workload runs Scanner JOIN queries.
- **LOAD-010** — Workload runs GROUP/HAVING queries.
- **LOAD-011** — Workload runs window/ranking queries.
- **LOAD-012** — Workload includes restart/reopen.
- **LOAD-013** — Measure DB size.
- **LOAD-014** — Measure commit latency.
- **LOAD-015** — Measure query latency.
- **LOAD-016** — Do not optimize before measurement.
- **LOAD-017** — Old ~3000ms snapshot cadence is evidence only until current requirement is verified.

# R. Real-provider gate

- **LIVE-001** — Real provider verification is reserved for irreducible real-world facts.
- **LIVE-002** — Everything else should already be proven offline.
- **LIVE-003** — Final live gate is bounded.
- **LIVE-004** — Final live gate is self-verifying.
- **LIVE-005** — Final live evidence is sanitized.
- **LIVE-006** — Final candidate uses Node/DuckDB authority.
- **LIVE-007** — Gate verifies one complete real cycle.
- **LIVE-008** — Gate verifies COMMIT ACK.
- **LIVE-009** — Gate verifies Current read.
- **LIVE-010** — Gate verifies Detail read.
- **LIVE-011** — Gate verifies Scanner read.
- **LIVE-012** — Gate verifies ownership/authority assumptions.
- **LIVE-013** — Prefer code assertions over visual checklist.
- **LIVE-014** — Never persist credentials/session evidence.
- **LIVE-015** — If market/session unavailable, mark live gate pending honestly rather than inventing PASS.

# S. Security and privacy

- **SEC-001** — Never commit credentials.
- **SEC-002** — Never commit cookies.
- **SEC-003** — Never commit session tokens.
- **SEC-004** — Never commit Authorization headers.
- **SEC-005** — Never commit account numbers.
- **SEC-006** — Never commit private browser/session data.
- **SEC-007** — Never commit raw authenticated dumps.
- **SEC-008** — Provider auth stays inside browser provider context.
- **SEC-009** — Node receives market data plus minimal non-sensitive protocol metadata only.
- **SEC-010** — Fake Market uses synthetic/sanitized data.
- **SEC-011** — Service binds loopback.
- **SEC-012** — Do not bypass WAF/access/CSP controls.
- **SEC-013** — Diagnostic/test artifacts are sanitized.
- **SEC-014** — Public-safe rule applies even if repository is private today.

# T. Repository/package/CI shape

- **REP-001** — Browser/provider/collector/viewer/scanner responsibilities receive clear homes.
- **REP-002** — Shared protocol receives a narrow home if needed.
- **REP-003** — Local service/server/database/persistence/read/scanner responsibilities receive clear homes.
- **REP-004** — Tests are organized by unit/service/e2e/fake-market/fixtures responsibilities.
- **REP-005** — Prefer one root npm project initially.
- **REP-006** — Do not add workspaces without justification.
- **REP-007** — Do not add ORM without evidence.
- **REP-008** — Do not add Express/Nest solely for one WebSocket service.
- **REP-009** — Do not rewrite UI in React merely because UI exists.
- **REP-010** — Do not add Docker without evidence.
- **REP-011** — Do not add Kubernetes.
- **REP-012** — Do not add DI container/repository pattern/message broker without evidence.
- **REP-013** — Do not add retry/reconnect frameworks without evidence.
- **REP-014** — Do not add event sourcing/caching/cloud backend/multi-user auth/general query platform without evidence.
- **REP-015** — Fast CI covers unit/service integration when appropriate.
- **REP-016** — Fast CI covers planning/docs guards.
- **REP-017** — Fast CI covers static repository contract guards.
- **REP-018** — Browser CI builds normal runtime.
- **REP-019** — Browser CI starts Fake Market.
- **REP-020** — Browser CI starts local Node.
- **REP-021** — Browser CI runs Chromium E2E.
- **REP-022** — Browser CI captures useful failure diagnostics.
- **REP-023** — Workload may use a separate workflow.
- **REP-024** — CI triggers include production code/tests/package/planning/important docs/CI config.
- **REP-025** — Unexpected CI red stays with current owner.

# U. S&T planning quality

- **PLN-001** — Use official `st-planner` framework/templates.
- **PLN-002** — MarketScope `.planning` is planning truth.
- **PLN-003** — Repository understanding precedes detailed planning.
- **PLN-004** — Product knowledge extraction precedes implementation decomposition.
- **PLN-005** — GOAL is stable outcome/boundary.
- **PLN-006** — TREE uses Strategy/Tactics reasoning, not arbitrary task list.
- **PLN-007** — Material open choices go into DECISIONS.
- **PLN-008** — Local reviews check necessity.
- **PLN-009** — Local reviews check sufficiency.
- **PLN-010** — Local reviews check KISS.
- **PLN-011** — Local reviews check implementation readiness.
- **PLN-012** — Outside-in coverage audit checks all product flows/contracts.
- **PLN-013** — Final Planning Review occurs before freeze.
- **PLN-014** — No major production implementation while plan_state is active.
- **PLN-015** — Old Market Flow S&T is input only.
- **PLN-016** — New tree describes how to build MarketScope, not how Browser-SQL was abandoned.
- **PLN-017** — Current V1 extraction appears before Current rewrite.
- **PLN-018** — Detail V1 extraction appears before Detail rewrite.
- **PLN-019** — Provider/data extraction appears before transport/persistence implementation.
- **PLN-020** — Product requirements/spec completeness review is explicit.
- **PLN-021** — Technical architecture review is explicit.
- **PLN-022** — Fake Market/testing plan is explicit.
- **PLN-023** — Every implementation-ready leaf has explicit success evidence.
- **PLN-024** — Every leaf's dependencies are explicit.
- **PLN-025** — Plan freeze happens only when whole-plan coverage is complete.
- **PLN-026** — After freeze, every implementation-ready leaf appears exactly once in EXECUTION.
- **PLN-027** — EXECUTION points to TREE nodes rather than duplicating full task descriptions.
- **PLN-028** — Executor-chat count is derived from real leaves/coupling.
- **PLN-029** — If execution exposes a material plan defect, reopen the smallest affected branch.
- **PLN-030** — Preserve still-valid done work during plan correction.
- **PLN-031** — Re-freeze only after focused affected review.
- **PLN-032** — No next executor chat starts through a blocked dependency.
- **PLN-033** — Serial executor chat marks node in-progress before work.
- **PLN-034** — Serial executor chat marks done only after success evidence.
- **PLN-035** — Root STATUS is advanced only after required verification.

# V. Implementation discipline for future executor chats

- **IMP-001** — Understand public contract first.
- **IMP-002** — Choose cheapest meaningful proof.
- **IMP-003** — Create intended red first when practical.
- **IMP-004** — Implement the smallest sufficient mechanism.
- **IMP-005** — Run targeted green verification.
- **IMP-006** — Broaden verification when change scope requires it.
- **IMP-007** — Update affected contract/docs/status in the same coherent work unit.
- **IMP-008** — Leave no cleanup debt.
- **IMP-009** — Do not leave broken tests.
- **IMP-010** — Do not test private implementation solely because it is easy.
- **IMP-011** — Unexpected failures receive root-cause/process/safeguard/minimal-prevention review.
- **IMP-012** — Expected TDD red is not an incident.
- **IMP-013** — Promote only reusable evidence-based lessons.
- **IMP-014** — Security/data-integrity defects remain with current owner until resolved.
- **IMP-015** — Verification-pending is explicit; never silently treated as complete.

# W. Required user flows / acceptance slices

- **FLOW-001** — Start daily collection.
- **FLOW-002** — Open/browse Current Universe.
- **FLOW-003** — Current → Detail.
- **FLOW-004** — Detail → Load More.
- **FLOW-005** — Detail → Back to Current.
- **FLOW-006** — Open persisted historical-only security.
- **FLOW-007** — Configure/activate Scanner.
- **FLOW-008** — Scanner repeats without overlap.
- **FLOW-009** — Scanner zero-row successful output.
- **FLOW-010** — Scanner error visible.
- **FLOW-011** — Scanner result with SecurityId navigates to Detail.
- **FLOW-012** — Node unavailable at launch.
- **FLOW-013** — Node disconnect during product use.
- **FLOW-014** — Explicit recovery/relaunch.
- **FLOW-015** — Run complete product against Fake Market.
- **FLOW-016** — Restart Node.
- **FLOW-017** — Reopen and preserve committed history.
- **FLOW-018** — Multiple viewers share one authority.
- **FLOW-019** — Second producer ownership conflict handled safely.
- **FLOW-020** — Lost refresh hint recovers by manual/reopen authoritative read.

# X. Pre-implementation readiness gate

The planning/preparation conversation must not hand off to `אני צאט 1 תתחיל` until all of the following are true:

- **READY-001** — Current V1 contract extraction complete.
- **READY-002** — Detail/History V1 contract extraction complete.
- **READY-003** — Provider/Recorder/data contract extraction complete.
- **READY-004** — Product Requirements complete and reviewed.
- **READY-005** — Product Spec complete and reviewed.
- **READY-006** — Data Contract complete and reviewed.
- **READY-007** — Technical Spec implementation-ready.
- **READY-008** — Browser↔Node protocol implementation-ready.
- **READY-009** — WebSocket lifecycle/security contract implementation-ready.
- **READY-010** — DuckDB schema/transaction/restart contract implementation-ready.
- **READY-011** — Trusted read/history pagination contract implementation-ready.
- **READY-012** — Scanner scheduler/product contract implementation-ready.
- **READY-013** — Scanner hardening plan implementation-ready.
- **READY-014** — Fake Market contract implementation-ready.
- **READY-015** — Local demo contract implementation-ready.
- **READY-016** — Unit/service/E2E/workload/live proof boundaries implementation-ready.
- **READY-017** — Repository/package/CI structure is justified by the plan.
- **READY-018** — All material open decisions resolved or explicitly block freeze.
- **READY-019** — S&T necessity review passes.
- **READY-020** — S&T sufficiency review passes.
- **READY-021** — S&T KISS review passes.
- **READY-022** — Outside-in coverage audit maps every required user flow.
- **READY-023** — This Master Coverage Map has no unmapped requirement.
- **READY-024** — Final Planning Review passes.
- **READY-025** — `plan_state: frozen`.
- **READY-026** — Every implementation-ready leaf is allocated exactly once in `EXECUTION.yaml`.
- **READY-027** — Executor dependencies are internally consistent.
- **READY-028** — Root STATUS points to executor Chat 1 / first available work.
- **READY-029** — Fresh-chat simulation can determine Chat 1 work from GitHub only.
- **READY-030** — No production implementation was accidentally introduced during planning.
- **READY-031** — A dedicated legacy-migration completeness audit confirms no relevant Market Flow product behavior/evidence is missing from MarketScope planning.

# Y. Final product quality bar

These are not pre-implementation requirements; they are the ultimate product completion bar from the original brief and therefore must remain represented in the S&T plan:

- **FINAL-001** — Fresh AI can understand product from MarketScope alone.
- **FINAL-002** — Fresh AI can understand Current contract.
- **FINAL-003** — Fresh AI can understand Detail/History contract.
- **FINAL-004** — Fresh AI can understand Scanner contract.
- **FINAL-005** — Fresh AI can understand provider/data contract.
- **FINAL-006** — Fresh AI can understand Node/DuckDB architecture.
- **FINAL-007** — Fresh AI can run unit tests.
- **FINAL-008** — Fresh AI can run real service integration tests.
- **FINAL-009** — Fresh AI can run Fake Market Chromium E2E.
- **FINAL-010** — Fresh AI can start local Fake Market demo.
- **FINAL-011** — Fresh AI can run workload verification.
- **FINAL-012** — Repository is clean of obsolete experiments/current-context archaeology.
- **FINAL-013** — Required CI is green.
- **FINAL-014** — Required offline verification is green.
- **FINAL-015** — Real-provider-only verification is either PASS or honestly pending for a real external reason.
- **FINAL-016** — Documentation matches implemented current truth.
- **FINAL-017** — No known correctness/data-integrity/security failure is hidden.
- **FINAL-018** — Final handoff requires no chat-history guessing.
- **FINAL-019** — Market Flow is unnecessary for normal future development.
- **FINAL-020** — Any remaining Market Flow use is historical/source evidence only.

---

## How this file interacts with S&T

This inventory is deliberately granular. The S&T tree should stay smaller and causal.

A single well-designed S&T leaf may cover many IDs, provided its success evidence proves them all.

Before freeze, add a compact mapping section (or machine-readable companion if genuinely useful) from coverage IDs → durable owner / S&T node. Do not make `TREE.yaml` hundreds of leaves merely to mirror this inventory.

The rule is:

```text
granular coverage inventory
→ compact causal S&T
→ explicit mapping
→ no forgotten requirement
```



# Z. Legacy migration completeness audit

This is a deliberate **second-pass migration gate** requested after the causal S&T review. It is not satisfied merely because earlier extraction stages passed.

- **MIGCHECK-001** — Re-enumerate the relevant V1 and V2 source trees from Market Flow; do not rely only on the earlier SOURCE_EXTRACTION list.
- **MIGCHECK-002** — Recheck V1 Current implementation, owning spec and direct tests against MarketScope Current contract/S&T.
- **MIGCHECK-003** — Recheck V1 Detail/History implementation, owning spec and direct tests against MarketScope Detail contract/S&T.
- **MIGCHECK-004** — Recheck V1 provider/Recorder/data-validation implementation, owning specs and direct tests against DATA_CONTRACT/S&T.
- **MIGCHECK-005** — Recheck V1 operational diagnostics/health behavior against Product Spec/S&T.
- **MIGCHECK-006** — Recheck V2 durable product-shape/Node migration evidence and relevant decisions for requirements not represented in MarketScope.
- **MIGCHECK-007** — Recheck relevant V1/V2 browser runtime/build/testing/CI artifacts for product or verification behavior that was not intentionally classified.
- **MIGCHECK-008** — Every newly found relevant legacy item receives KEEP / ADAPT / DROP / INVESTIGATE with evidence; nothing remains “implicitly ignored”.
- **MIGCHECK-009** — Any missing behavior/contract/test obligation discovered is repaired in its owning MarketScope document/TREE branch before the audit can pass.
- **MIGCHECK-010** — Any obsolete legacy mechanism accidentally treated as a product requirement is removed/corrected rather than preserved by inertia.
- **MIGCHECK-011** — Run the outside-in flow audit after the legacy recheck so every required product flow maps through contracts → S&T leaves → success evidence.
- **MIGCHECK-012** — After the audit, normal implementation planning can proceed from MarketScope alone; Market Flow is needed only as historical/source evidence for exceptional contradictions.

## Stage 10 gate

Stage 10 must produce explicit evidence of:

```text
fresh legacy inventory
→ compare against SOURCE_EXTRACTION + contracts + TREE
→ classify/fix every discrepancy
→ outside-in user-flow audit
→ no unexplained legacy requirement gap
→ READY-022 / READY-023 / READY-031 eligible to pass
```

This stage occurs before Final Planning Review and before `plan_state: frozen`.


# AA. Stage 10 legacy-behavior findings

- **LEG-001** — Initial MarketScope production history has no automatic retention/TTL/background deletion.
- **LEG-002** — A future retention policy requires an explicit reviewed contract; silent cleanup is forbidden.
- **LEG-003** — Closing a Viewer does not stop the active producer.
- **LEG-004** — Viewer reopen/read remains usable from committed Node authority while the producer is stopped.
- **LEG-005** — Viewer recovery does not require provider availability or an opener-memory snapshot.
- **LEG-006** — Runtime and bookmarklet are generated from one source graph; no hand-maintained business-logic fork.
- **LEG-007** — Bookmarklet is `javascript:` + one executable line and is not whole-runtime percent encoded.
- **LEG-008** — Bookmarklet build has no arbitrary absolute size ceiling; practicality is verified by browser/live evidence.
- **LEG-009** — Repeated launch/clean stop/relaunch cannot create overlapping producer ownership.
- **LEG-010** — Historical D-045 real-origin loopback WebSocket smoke evidence is preserved, while the final candidate still re-verifies current compatibility.
- **LEG-011** — V1 Debug Bundle UI, IndexedDB storage-quota UI, DATABASE_CLEARED messaging, rolling release tag, Current filtering/charts, and Browser-SQL Scanner-config persistence are not silently promoted into initial MarketScope requirements; each is explicitly dropped/not-required unless a later contract reopens it.

When the Stage 10 audit and exact coverage map are green, READY-022, READY-023 and READY-031 may pass. READY-024 and later remain owned by Final Planning Review/freeze/execution allocation.
