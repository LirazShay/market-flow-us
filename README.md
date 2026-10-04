# MarketScope

MarketScope is the clean product repository for a local, single-user market analysis tool.

## Product boundary

The implemented product flow is:

```text
authenticated provider page
→ browser provider acquisition
→ exact complete-cycle validation
→ loopback WebSocket
→ one localhost Node.js service
→ native DuckDB
→ trusted reads / SQL
→ Current Universe
→ Security Detail / History
→ Dynamic SQL Scanner
```

There is no cloud backend and no remote application server.

## Quick start

**Windows / easiest path:** start with [START_HERE.md](START_HERE.md). It provides double-click helpers for first-time setup, local Demo, normal real-provider use, regular tests and bounded live-verification preparation.

For a fuller user-oriented walkthrough, see [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

Requirements: Node.js 24.x and npm.

Install the pinned dependencies:

```text
npm ci
```

Fastest local product smoke, using the canonical Fake Market and the normal MarketScope browser runtime:

```text
npm run demo:fake-market
```

Open the URL printed by the command. The demo persists only under `.demo/`; stop it with Ctrl+C. To remove demo state safely:

```text
npm run demo:reset
```

For the authenticated provider flow:

```text
npm run build:browser
npm run service -- --allowed-origin <exact-provider-origin>
```

Read the exact origin from the authenticated provider page as `location.origin`. The service is loopback-only and stores production data in `data/market-scope.duckdb` unless `--db` is supplied. Launch the self-contained bookmarklet generated at:

```text
dist/browser/market-scope.bookmarklet.txt
```

Do not copy cookies, authorization headers, account identifiers, or authenticated browser dumps into the repository or service configuration.

Core verification commands:

```text
npm run test:fast
npm run build:browser
npm run test:e2e
npm run test:workload
```

Local Chromium E2E requires the pinned Playwright Chromium binary; install it when needed with `npx playwright install chromium`. The real-provider release gate is documented in `docs/LIVE_VERIFICATION.md`; its **current state belongs only in `STATUS.yaml`**.

## Repository roles

- `LirazShay/market-scope` — **the product source of truth**.
- `LirazShay/market-flow` — reference-only source library and historical evidence.
- `LirazShay/st-planner` — reusable S&T planning framework.

Normal MarketScope work must not require reading Market Flow history. Relevant knowledge is extracted into this repository before implementation.

## Current state

Read `STATUS.yaml` for the current operational phase and verification pointer.

While `.planning/STATUS.yaml -> plan_state: active`, production implementation is forbidden. After freeze, executor chats use `.planning/EXECUTION.yaml` and their assigned S&T nodes.

## Start here

Fresh planning/review chat:

1. `AGENTS.md`
2. `STATUS.yaml`
3. `.planning/README.md`
4. `.planning/FRAMEWORK.md`
5. `.planning/STATUS.yaml`
6. only the docs/source evidence needed by the current stage

After the S&T plan is frozen, executor chats use `.planning/EXECUTION.yaml` and only their assigned S&T nodes.

For normal post-implementation maintenance, start with `AGENTS.md` → `STATUS.yaml` → this README, then load only the durable contract and code area relevant to the change. Planning history is not normal HOT context.

## Development workflow

Meaningful planning or implementation changes use a focused branch + pull request rather than direct work on `main`:

```text
main
→ focused branch
→ implementation/planning + verification
→ PR
→ CI green
→ squash merge
→ verify main
```

`main` is the last accepted verified truth; an open PR is explicitly work-in-progress. See `AGENTS.md` for the full operating rules.

## Durable product documents

- `docs/PRODUCT_REQUIREMENTS.md` — what the user needs and why.
- `docs/PRODUCT_SPEC.md` — exact observable product behavior.
- `docs/DATA_CONTRACT.md` — provider, identity, complete-cycle and raw-data semantics.
- `docs/TECHNICAL_SPEC.md` — current technical architecture contract.
- `docs/TEST_STRATEGY.md` — verification layers and their proof boundaries.
- `docs/SOURCE_EXTRACTION.md` — traceability from Market Flow evidence to MarketScope.

## Migration rule

Do not copy Market Flow wholesale.

```text
inspect old evidence
→ extract product knowledge
→ KEEP / ADAPT / DROP / INVESTIGATE
→ define the clean MarketScope contract
→ plan proof/tests
→ only then implement justified code
```

Browser-SQL archaeology, DuckDB-Wasm production authority, OPFS authority, browser SQL Worker ownership, browser DB Web Locks, obsolete execution graphs and old live-status files are not MarketScope HOT context.

## Security

Treat repository contents as public-safe regardless of current GitHub visibility. Never commit credentials, cookies, session/auth data, account identifiers, private browser/session data, or unsanitized authenticated dumps. Use sanitized synthetic fixtures only.
