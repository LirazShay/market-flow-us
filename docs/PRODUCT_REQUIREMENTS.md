# MarketScope Product Requirements

## Ownership

This document owns **what the user needs and why**. It does not own protocol framing, database schema, package choices, implementation tasks, or live project status.

Later technical changes may refine mechanisms but must not silently weaken these product needs.

## 1. Product problem

MarketScope is a **local, single-user market-analysis product**.

The core value chain is:

```text
continuous validated market data
→ trustworthy current market view
→ trustworthy per-security history
→ arbitrary supported analytical SQL
```

The product exists so the user can observe and analyze a dynamically discovered market universe using persisted facts, while keeping provider authentication in the browser and durable/query authority local.

MarketScope is one product even though its target runtime contains a Browser process and a localhost Node process.

## 2. Primary user outcomes

The user must be able to:

1. start a daily market-data collection session from the authenticated provider-side product runtime;
2. see the latest **committed** state of the dynamically discovered universe;
3. open a security and inspect its persisted history;
4. keep historical data usable even when that security is no longer in Current;
5. run recurring analytical SQL over trusted current/history data;
6. understand whether collection/service state is healthy, stale, stopped, failed, or unavailable;
7. recover explicitly from local-service failure without pretending uncommitted data succeeded;
8. restart the local service without losing already committed market history;
9. run almost the entire product offline against one deterministic local Fake Market;
10. continue future development from MarketScope alone, without reconstructing product intent from Market Flow history;
11. maintain a reusable personal library of named Scanner queries instead of retyping recurring SQL;
12. start from useful built-in Scanner examples, including one broad all-fields example and at least one practical analytical/ranking example;
13. obtain or generate new SQL easily from one canonical AI-friendly guide that describes the supported schema, semantics and safe query rules.

## 3. Required product surfaces

MarketScope has three first-class analytical surfaces:

### 3.1 Current Universe

A trustworthy latest committed row per currently authoritative security, enriched with universe metadata, with deterministic sorting, explicit loading/empty/error states, refresh and navigation to Detail.

### 3.2 Security Detail / History

A canonical-SecurityId view of one security, its current summary when available, and deterministic paged persisted history. Persisted historical-only securities remain inspectable.

### 3.3 Dynamic SQL Scanner

User-supplied supported analytical SQL plus a repeat interval and explicit activation. The result table reflects SQL output exactly; the UI does not secretly rank/filter/sort/limit it.

Scanner also includes a reusable **Saved Query Library**. The user can keep multiple named query configurations, select one to load it into the editable Scanner draft, create new saved queries, update/rename existing user queries and delete user queries. Saved user queries persist across ordinary browser/service restarts.

Loading a saved query never implicitly starts execution. Activation remains explicit so browsing/editing the library cannot accidentally replace an active Scanner generation.

The product also ships a small built-in example set. Built-ins are always available, are not destructively edited/deleted, and can be copied into the user's saved library for customization. At minimum the built-ins include:

- a broad `SELECT *`-style Current/latest example that visibly exposes the available latest-row fields with an explicit bounded `LIMIT`;
- at least one practical analytical/ranking example using canonical supported fields and normal Scanner SQL features.

Scanner SQL authoring must be self-service. MarketScope owns one canonical AI-friendly SQL guide that lets a user ask an AI for a query without reconstructing the schema from source code. The guide must cover the public Scanner tables/columns, important field semantics and null/identity rules, supported/rejected SQL boundaries, copyable examples, performance/bounding guidance and a ready-to-use prompt pattern for requesting new queries.

## 4. Data-integrity requirements

MarketScope must prefer **no new authoritative state** over uncertain authoritative state.

Therefore:

- universe size is provider-derived, never hardcoded;
- identity is canonical and not array-position based;
- provider membership/completeness is validated exactly;
- incomplete/corrupt cycles never advance Current;
- incomplete/corrupt cycles never append authoritative history;
- Node commit success is required before a cycle is exposed as committed;
- prior committed authority survives provider, validation, transport, or persistence failure;
- raw provider facts are retained sufficiently to avoid losing future analytical value;
- `null`, numeric `0`, empty string, and missing property remain distinguishable;
- unknown provider semantics remain unknown until supported by evidence;
- successful production history is not silently deleted by automatic retention/cleanup in the initial release; any future retention policy requires an explicit product/technical contract.

## 5. Locality, privacy and authority requirements

- Provider authentication/session material remains inside the authenticated Browser context.
- Node receives market data and minimal non-sensitive protocol metadata only.
- Durable production history and trusted SQL authority belong to one localhost Node-owned DuckDB.
- Browsers never open the production DuckDB directly.
- No cloud backend is required.
- The localhost service binds to loopback under the technical contract.
- Repository/test artifacts must remain safe even if publicly visible.

## 6. Operational visibility

The user needs a compact visible operational-health surface, not only console logs.

At minimum the product must make understandable:

- collection/service health;
- most recent committed update;
- most recent committed cycle identity;
- last cycle duration when known;
- Current security count;
- completed-cycle count;
- failed-cycle count;
- persisted-history row count.

The exact V1 health vocabulary is extracted in `PRODUCT_SPEC.md`.

Browser storage quota was a V1 implementation diagnostic. It is not itself a MarketScope product requirement because Node/DuckDB changes the storage authority.

## 7. Failure and recovery requirements

### Local service unavailable at launch

The product must visibly report that the local authority is unavailable and must not claim collection/commit success.

### Local service disconnects during use

The product fails closed:

- pending authority-dependent work fails visibly;
- collector/producer operation stops rather than accumulating an offline authority queue;
- already committed data remains intact;
- recovery is explicit after the local service becomes available again.

Automatic reconnect, offline queueing and replay are not current product requirements.

### Restart

After Node restarts, previously committed Current/history remain readable. A stale previously-running collection session must not remain falsely presented as actively running.

Viewer continuity is independent from an actively running producer:

- closing a Viewer must not stop the producer;
- a Viewer opened/reopened while the producer is stopped can still read the last committed Current/history from Node authority;
- Viewer recovery must not require provider availability or an in-memory opener snapshot.

## 8. Offline development and verification requirement

Fake Market is a core product-engineering capability.

A developer/user must be able to launch a deterministic local provider experience without:

- bank login;
- DevTools;
- Playwright interception;
- bookmarklet copy/paste.

The fake environment must exercise the **normal Browser runtime**, localhost Node service, DuckDB, Current, Detail/History and Scanner.

It must use synthetic/sanitized data and support deterministic reset without touching production state.

## 9. Diagnosability and supportability requirements

MarketScope must be self-localizing when ordinary operation fails. A user should normally be able to report a compact diagnostic result that identifies the failing boundary without first attaching a debugger or reproducing the issue manually step-by-step.

Required outcomes:

- meaningful startup/runtime boundaries have stable checkpoint identities;
- a failure identifies the owning component, failed checkpoint/stage and stable error code;
- the last successful checkpoint is available so the failure boundary is clear;
- the specific sanitized technical cause remains available in addition to localized user-facing wording;
- when the UI is available, the user can obtain a compact copyable support snapshot containing enough state to identify the failure boundary;
- when UI/service startup itself fails, the launcher/CLI still emits an actionable sanitized failure result;
- core boundaries include at least browser runtime launch, localhost service reachability, database/schema readiness, producer ownership/session, universe/provider acquisition, cycle persistence/ACK, trusted Viewer reads and Scanner execution;
- diagnostic state never becomes market authority and never changes correctness/fail-closed semantics;
- diagnostics are bounded and local-first; no cloud telemetry/remote monitoring platform is required;
- diagnostic output must never contain credentials, cookies, authorization/session data, account identifiers, private browser state or raw authenticated/provider dumps;
- representative failure tests must prove that errors are not reduced to generic-only messages and that the reported checkpoint matches the actual failing boundary.

The support goal is deliberately operational: if tomorrow's run fails, the normal output should already answer **where it failed, what the system was doing, what stable error occurred, and what the last successful checkpoint was**, so the user can paste that evidence into a maintenance chat and begin directly at the failing boundary.

## 10. Quality requirements

- Observable/public contracts are documented before implementation.
- Tests protect those contracts rather than private implementation.
- Pure logic is proved cheaply; database/process behavior is proved with real service/DuckDB integration; full browser flows are proved with Chromium + real Fake Market HTTP.
- Representative workload evidence precedes performance optimization.
- Real-provider verification is reserved for irreducible provider/session/origin facts.
- An unavailable real session/market may leave a live-only gate explicitly pending, but does not excuse missing offline proof.

## 11. Simplicity requirements

Use the smallest mechanism that satisfies current verified requirements.

Do not introduce without evidence:

- ORM;
- application framework solely for one WebSocket service;
- React rewrite;
- Docker/Kubernetes;
- service manager;
- Electron/installer;
- DI/repository-pattern ceremony;
- message broker;
- reconnect/retry framework;
- event sourcing;
- caching;
- cloud backend;
- multi-user authentication;
- generic query platform;
- legacy-history import;
- dual durable authority.

## 12. Non-goals

Current non-goals:

- automatic order execution;
- automatic trading;
- portfolio management;
- cloud SaaS;
- collaboration;
- remote multi-user access;
- generic enterprise data warehouse/platform;
- a long-term historical warehouse product;
- automatic retention/compaction policy in the initial release;
- reproducing the obsolete Browser-SQL/DuckDB-Wasm/OPFS authority model;
- importing old IndexedDB history into the first release unless a later explicit requirement changes scope.

## 13. Product-level acceptance flows

The product requirements are not considered represented unless the Product Spec defines observable behavior for all of:

1. start daily collection;
2. browse Current Universe;
3. Current → Detail → Load More → Back;
4. open persisted historical-only security;
5. use recurring Scanner;
6. local Node/service failure and explicit recovery;
7. complete product against Fake Market;
8. restart Node and preserve committed history.

Implementation/test details for proving these flows belong to later Technical/Test planning.
