# Goal

## Desired outcome

Build MarketScope as a clean local single-user market analysis product whose product knowledge, plan and eventual implementation live in this repository without requiring Market Flow history for normal work.

Target product:

```text
authenticated provider page
→ preserved provider acquisition
→ exact complete-cycle validation
→ loopback WebSocket
→ one localhost Node.js service
→ one native DuckDB authority
→ Current Universe
→ Security Detail / History
→ Dynamic SQL Scanner
```

MarketScope must be independently understandable, runnable and verifiable, including deterministic offline verification through a real local Fake Market and representative workload verification.

## Current reality

- MarketScope contains planning/documentation only; no production implementation has been migrated.
- Product Requirements, Product Spec, Data Contract, Technical Spec, Test Strategy and Source Extraction are complete for the current pre-implementation scope.
- Proven V1 Current, Detail/History, provider/Recorder and operational-diagnostics behavior has been extracted into MarketScope durable contracts; normal implementation planning no longer depends on rereading Market Flow.
- Market Flow remains reference-only evidence when a concrete later contradiction requires it.
- D-043 preserves provider/data continuity and the three surfaces.
- D-045 establishes browser → loopback WebSocket → Node → native DuckDB as target authority.
- The causal S&T implementation tree has passed local necessity, sufficiency, dependency and KISS review: 36 nodes / 28 implementation-ready leaves, all approved.
- The dedicated legacy-completeness/outside-in audit is complete and every one of the 660 unique coverage IDs maps to a durable owner; Final Planning Review is the remaining pre-freeze gate.
- No production code may be written until the full plan is reviewed, frozen and allocated.

## Constraints

- Local single-user product; no cloud backend, remote app server or collaboration.
- Browser owns provider authentication/calls and complete-cycle validation.
- Node owns durable history, DuckDB, transaction authority and trusted reads/SQL.
- One Node-owned DuckDB; browsers never open it directly.
- Preserve MapHeat2 → sequential GetSecuritiesData → exact complete-cycle validation unless evidence changes it.
- Preserve canonical `String(PaperId or Key)`, raw facts and `null != 0 != "" != missing`.
- Incomplete/corrupt cycles never advance authority.
- Preserve exact V1-derived Current and Detail/History behavior after extraction.
- Scanner is separate and must not hide ranking/filter/sort/LIMIT.
- Real local Fake Market using production provider paths is mandatory.
- Tests protect observable/public contracts.
- Public-safe repository discipline.
- KISS; no speculative frameworks.
- No production implementation while `plan_state: active`.
- Planning ends only after Final Planning Review, freeze and executor allocation.

## Non-goals

- Automatic trading/order execution.
- Portfolio management.
- Cloud SaaS / remote multi-user access.
- Generic data warehouse.
- DuckDB-Wasm/OPFS/browser SQL Worker as production authority.
- Legacy IndexedDB history import in the first release unless later explicitly required.
- Browser-SQL archaeology in HOT context.
- Production coding during the current planning/preparation phase.
