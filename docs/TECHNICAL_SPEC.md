# MarketScope Technical Specification

## Ownership

This document owns the **current implementation contract** for MarketScope: process boundaries, browser/runtime delivery, protocol, service lifecycle, DuckDB schema/transactions/reads, Scanner execution/hardening, Fake Market topology, and package/run model.

It does **not** redefine product behavior from `PRODUCT_SPEC.md` or provider semantics from `DATA_CONTRACT.md`.


---

## 1. Runtime baseline

### 1.1 Node

Target runtime line:

```text
Node.js 24 LTS
```

As verified on 2026-09-27, Node 24 is an LTS line. Implementation should pin/support the Node 24 major line rather than the Current Node line.

### 1.2 DuckDB

Use the maintained DuckDB Node Neo high-level API:

```text
@duckdb/node-api
```

Verified implementation baseline on 2026-09-27:

```text
@duckdb/node-api 1.5.5-r.5
DuckDB engine 1.5.5
```

Do **not** depend directly on the deprecated `duckdb` Node package.

Do **not** add `@duckdb/node-bindings` as a direct MarketScope dependency merely for Scanner admission: the high-level API already exposes:

- `connection.extractStatements(sql)`;
- `prepared.statementType`;
- `prepared.parameterCount`;
- result column names/types;
- JSON-safe result conversion.

Implementation pins the exact package version in `package.json` + lockfile. A version change later is an explicit dependency update, not an implicit floating upgrade.

### 1.3 WebSocket

Use:

```text
browser: native WebSocket
Node: ws
```

Verified package baseline on 2026-09-27:

```text
ws 8.21.3
```

Pin the exact implementation version in the lockfile.

### 1.4 JavaScript/build model

Use one root npm project.

Node sources use native ESM JavaScript. Do not add TypeScript solely for static types.

Browser sources are ordinary ES modules bundled into one self-contained browser runtime. Use `esbuild` only for producing the self-contained browser artifact/bookmarklet from the one browser source graph; there is no frontend framework requirement.

No npm workspaces initially.

---

## 2. Repository implementation layout

Target layout:

```text
browser/
  provider/
  collector/
  recorder/
  viewer/
  scanner/
  runtime/

shared/
  protocol/
  scanner/

local-service/
  server/
  database/
  persistence/
  reads/
  scanner/

tests/
  unit/
  service/
  e2e/
  fake-market/
  fixtures/

scripts/
  build-browser.mjs
  demo-fake-market.mjs
  demo-reset.mjs

dist/                  # generated / ignored
data/                  # local production DB / ignored
.demo/                 # local demo state / ignored

docs/
  SCANNER_SQL_GUIDE.md
.planning/
.github/workflows/
package.json
package-lock.json
```

Keep module boundaries functional, not ceremonial. No DI container, repository-pattern layer, ORM, Express/Nest, or generic RPC framework.

---

## 3. Browser runtime delivery

### 3.1 One source graph

There is one browser implementation.

Build generates at least:

```text
dist/browser/market-scope.runtime.js
dist/browser/market-scope.bookmarklet.txt
```

The readable runtime is a self-contained IIFE/browser bundle.

The bookmarklet is a self-contained launcher built from the **same source graph**. It must not fetch executable JavaScript from a remote host.

Packaging invariants carried forward from the proven V1 delivery contract:

- the text artifact begins with `javascript:`;
- it is one executable line;
- the whole runtime is not percent-encoded as a URL payload (for example, no packaging strategy that expands spaces/newlines into `%20`/`%0A`);
- the build imposes no arbitrary absolute bookmarklet-size rejection; actual browser practicality is verified by build/browser/live evidence instead;
- the readable runtime and bookmarklet are generated artifacts, never separately hand-maintained business-logic forks.

A rolling GitHub Release/tag is **not** a v1 MarketScope requirement. Distribution may use CI artifacts or another later explicit release mechanism.

Production use:

```text
authenticated provider page
→ user launches self-contained MarketScope browser runtime
→ producer connects to localhost service
→ same-origin Viewer opens
```

Repeated launch in the same page must not create a second in-page producer. The Node service independently enforces the one-producer invariant.

Closing a Viewer does not stop the producer. A clean stop/relaunch must not create overlap: a new producer start waits until the prior `producer.session.stop` acknowledgement or until Node has otherwise released producer ownership after a confirmed connection-loss/stale boundary.

### 3.2 Fake Market use

The Fake Market page loads the normal built `market-scope.runtime.js` directly.

It does not use a separate product implementation.

---

## 4. Process topology and authority

```text
authenticated provider page / Fake Market page
        |
        | provider fetches
        v
browser collector + validation
        |
        | protocol v1 over loopback WebSocket
        v
localhost Node service
        |
        v
one native DuckDB file
        |
        +--> Viewer reads
        +--> Scanner SQL
```

Browser owns provider auth/acquisition/validation/UI/Scanner schedule.

Node owns service lifecycle, sessions, universe persistence, cycle commit authority, DuckDB, trusted reads, Scanner execution and health.

DuckDB is never opened by browser code.

---

## 5. Service configuration

Initial production defaults:

```text
host = 127.0.0.1
port = 8765
dbPath = ./data/market-scope.duckdb
maxInboundMessageBytes = 16 MiB
producerHeartbeatMs = 5000
producerStaleAfterMs = 15000
historyPageSize = 500
```

Allowed browser Origins are explicit configuration.

Rules:

- no wildcard Origin;
- at least one exact Origin is required for normal service startup;
- an Origin is scheme + host + optional port, with no path;
- tests/demo pass their own exact local Origin explicitly;
- CLI/test overrides must not change secure production defaults silently.

The exact authenticated provider Origin is not guessed in planning. Real-provider verification records the exact current Origin and confirms the browser can reach loopback under the provider's CSP and current Local Network Access rules.

---

## 6. WebSocket transport

Production target:

```text
ws://127.0.0.1:8765
```

Node uses a small `node:http` server only for the WebSocket upgrade path and `ws.WebSocketServer({ noServer: true })`.

Upgrade sequence:

1. connection arrives on loopback listener;
2. reject if `Origin` header is absent or not in exact allowlist;
3. reject unsupported WebSocket/protocol conditions;
4. accept upgrade;
5. require `client.hello` as first application message.

Set:

```text
perMessageDeflate = false
maxPayload = 16 MiB
```

No TLS termination, remote bind, proxy, or service manager in the initial product.

### 6.1 Browser/CSP/LNA proof gate

The target remains loopback `ws://127.0.0.1:8765`, but compatibility with the real authenticated provider page is an external browser/provider fact.

Implementation must include a bounded real-provider transport proof before release:

```text
provider HTTPS page
→ CSP allows required loopback connection
→ current browser Local Network Access policy permits/authorizes it
→ protocol hello succeeds
```

If blocked by CSP/LNA/mixed-content policy:

- do not bypass browser security;
- do not weaken provider controls;
- reopen only the transport decision;
- keep Fake Market/service/database work that remains valid.

---

## 7. Protocol v1 envelope

Every application message is JSON:

```json
{
  "v": 1,
  "type": "producer.cycle.commit",
  "requestId": "client-generated-id",
  "payload": {}
}
```

Rules:

- `v` must equal `1`;
- `type` is a known exact string;
- `requestId` is required for every request and echoed by its response;
- requestId is a non-empty string with a bounded length (max 128 characters);
- `payload` is an object unless an operation explicitly uses an empty object;
- unknown fields may be rejected by operation validators rather than silently becoming contract;
- malformed JSON, invalid envelope, wrong role, or unsupported protocol never reaches persistence code.

No generic middleware/RPC framework is introduced.

### 7.1 Responses

Success:

```json
{
  "v": 1,
  "type": "response.ok",
  "requestId": "...",
  "payload": {
    "requestType": "...",
    "data": {}
  }
}
```

Failure:

```json
{
  "v": 1,
  "type": "response.error",
  "requestId": "...",
  "payload": {
    "requestType": "...",
    "code": "STABLE_MACHINE_CODE",
    "message": "safe user-facing message",
    "retryable": false,
    "details": null
  }
}
```

Never send stack traces, local filesystem paths, credentials, cookies, auth headers, or raw authenticated transport data to browser clients.

---

## 8. Connection roles and hello

First message:

```text
client.hello
```

Payload:

```text
{
  role: "producer" | "viewer",
  clientInstanceId: non-empty string,
  productVersion: non-empty string
}
```

Successful response includes:

```text
{
  protocolVersion: 1,
  serviceVersion,
  role,
  ready: true
}
```

Rules:

- one active producer connection maximum;
- any number of ordinary local Viewer connections within practical browser limits;
- a second producer receives `PRODUCER_ALREADY_ACTIVE` and is closed with policy violation;
- messages before hello are rejected;
- producer connection may call only `producer.*`;
- viewer connection may call only `viewer.*`, `scanner.execute`, and `scanner.queries.*`;
- browser page reload/socket close ends that producer connection and interrupts its running session;
- stale producer heartbeat closes the stale producer connection and frees producer ownership.

A local non-browser process can spoof an Origin, so Origin checking is defense-in-depth for browser misuse, **not** a hostile-local-process security boundary.

---

## 9. Protocol operations

### 9.1 Producer

#### producer.session.start

Payload:

```text
{
  startedAtMs,
  config
}
```

`config` is sanitized collector configuration only. No auth/session material.

Response:

```text
{ sessionId }
```

Starting twice on the same producer connection is rejected.

#### producer.universe.replace

Payload is the `ValidatedUniverse` from `DATA_CONTRACT.md`.

Node re-validates:

- record count;
- canonical IDs;
- uniqueness;
- raw/normalized identity agreement.

Successful response:

```text
{
  universeRevision,
  recordCount
}
```

ACK occurs only after the universe transaction commits.

#### producer.cycle.commit

Payload:

```text
{
  universeRevision,
  cycle: CompleteCycle
}
```

Node re-validates the complete-cycle invariants and exact membership against the currently acknowledged `universeRevision`.

Response after DB COMMIT only:

```text
{
  cycleId,
  committedAtMs
}
```

#### producer.cycle.failed

Payload:

```text
{
  report: FailedCycleReport
}
```

Node persists sanitized diagnostics only.

Response:

```text
{ cycleId }
```

A failed cycle never modifies `latest` or `history`.

#### producer.heartbeat

Payload:

```text
{ atMs }
```

Node records heartbeat for the active session and replies with acceptance time.

Heartbeat cadence: every 5 seconds while producer session is running.

If no accepted heartbeat is seen for 15 seconds, the Node service:

- derives STALE;
- terminates the producer connection;
- persists the session as interrupted;
- frees producer ownership.

#### producer.session.stop

Payload:

```text
{
  stoppedAtMs,
  reason
}
```

Node marks session stopped and clears producer session state.

### 9.2 Viewer

#### viewer.current.get

Payload:

```text
{}
```

Response:

```text
{
  rows: CurrentRow[],
  summary: {
    rowCount,
    lastCycleId,
    lastCollectedAtMs
  }
}
```

`CurrentRow` is the exact logical row shape required by `PRODUCT_SPEC.md`.

#### viewer.security.get

Payload:

```text
{ securityId }
```

Response:

```text
{
  found,
  securityId,
  paperName,
  isCurrent,
  currentRow
}
```

`currentRow` is `null` for historical-only securities.

`found=false` means the ID exists in neither durable universe metadata nor history/latest authority.

#### viewer.history.page

Payload:

```text
{
  securityId,
  cursor: null | opaque string
}
```

Page size is server-owned and fixed at 500 in protocol v1.

Response:

```text
{
  rows: HistoryRow[],
  hasMore,
  nextCursor
}
```

The cursor is opaque to browser code.

#### viewer.status.get

Payload:

```text
{}
```

Response contains the operational fields from Product Spec:

```text
{
  serviceReady,
  recorderHealth,
  lastCompletedAtMs,
  lastCompletedCycleId,
  lastCycleDurationMs,
  latestCount,
  completedCycles,
  failedCycles,
  historyCount,
  lastError
}
```

`lastError` is sanitized.

#### viewer.support.snapshot

Payload:

```text
{}
```

Returns the bounded sanitized Node support snapshot defined in §28.4.

It is Viewer-role, read-only, provider-independent and must remain available whenever the service is ready even if no producer is active.


### 9.3 Scanner

#### scanner.execute

Payload:

```text
{ sql }
```

Response:

```text
{
  columns: [
    { name, type }
  ],
  rows: [
    [value, ...]
  ],
  rowCount,
  startedAtMs,
  completedAtMs,
  durationMs
}
```

Rows are arrays, not row objects, so duplicate SQL result column names and exact result column order are preserved.

Values are converted through the DuckDB Node API JSON-safe conversion path.

#### scanner.queries.list

Viewer-role, read-only.

Payload:

```text
{}
```

Response:

```text
{
  queries: [
    {
      queryId,
      source,              # "builtin" | "user"
      name,
      sql,
      intervalMs,
      editable,
      deletable,
      createdAtMs,         # null for builtin
      updatedAtMs          # null for builtin
    }
  ]
}
```

Ordering is deterministic: built-ins in frozen source order first, then user queries by normalized name and queryId.

#### scanner.queries.create

Viewer-role configuration write.

Payload:

```text
{ name, sql, intervalMs }
```

Creates one durable user query and returns its full query record.

#### scanner.queries.update

Viewer-role configuration write.

Payload:

```text
{ queryId, name, sql, intervalMs }
```

Updates one existing **user** query and returns its full updated query record. Built-in IDs are read-only.

#### scanner.queries.delete

Viewer-role configuration write.

Payload:

```text
{ queryId }
```

Deletes one existing **user** query and returns:

```text
{ queryId }
```

These library operations never activate Scanner execution. They edit/select durable configuration only.

---

## 10. Error codes

Initial stable codes:

```text
SERVICE_NOT_READY
PROTOCOL_VERSION_UNSUPPORTED
INVALID_MESSAGE
ROLE_VIOLATION
PRODUCER_ALREADY_ACTIVE
SESSION_NOT_STARTED
SESSION_ALREADY_STARTED
UNIVERSE_INVALID
UNIVERSE_REVISION_MISMATCH
CYCLE_INVALID
CURSOR_INVALID
NOT_FOUND
SCANNER_EMPTY_SQL
SCANNER_MULTIPLE_STATEMENTS
SCANNER_NON_SELECT
SCANNER_PARAMETERS_UNSUPPORTED
SCANNER_FORBIDDEN_FUNCTION
SCANNER_EXECUTION_ERROR
SCANNER_QUERY_NAME_CONFLICT
SCANNER_QUERY_READ_ONLY
DB_SCHEMA_UNSUPPORTED
DB_ERROR
```

Unexpected internal errors become a sanitized `DB_ERROR`/service error to the client and retain stack detail only in local process logs.

---

## 11. DuckDB instance hardening

Create one `DuckDBInstance` for the configured database path.

Before accepting Scanner work, explicitly configure the instance/process to restrict capabilities:

```text
enable_external_access = false
allow_community_extensions = false
autoinstall_known_extensions = false
autoload_known_extensions = false
allow_persistent_secrets = false
allow_unsigned_extensions = false
allow_unredacted_secrets = false
```

After MarketScope-owned startup configuration is complete:

```text
allowed_configs = []
lock_configuration = true
```

Do not load extensions in the initial product.

These are defense-in-depth settings for a trusted local analytical tool; they do not make arbitrary SQL a hostile-code sandbox.

---

## 12. DuckDB connections

One DB instance, with a small fixed connection set:

```text
writerConnection
viewerReadConnection
scannerConnection
```

### writerConnection

Only service-owned writes use it.

All writes are serialized through one in-process writer queue.

### viewerReadConnection

Used by narrow trusted Current/Detail/history/status reads.

### scannerConnection

Used only by admitted Scanner SQL.

The browser ensures only one Scanner execution at a time. Node rejects/serializes a second concurrent Scanner request on the same local Scanner connection rather than creating an unbounded query pool.

No connection pool library.

---

## 13. Schema v2 and explicit v1 migration

No ORM.

No generic migration framework.

The saved-query library is the first real post-v1 schema requirement, so MarketScope now has one explicit reviewed migration:

```text
schema v1 → schema v2
```

A fresh DB creates schema version 2 directly.

An existing valid schema-v1 DB is migrated transactionally to v2 before service readiness. Any unsupported schema version or invalid required structure fails startup with `DB_SCHEMA_UNSUPPORTED`.

Do not introduce a generic migration framework merely because v2 exists. Future versions add only the next explicit reviewed migration when a real requirement exists.

### 13.1 schema_info

Exactly one row.

Fields:

```text
schema_version INTEGER NOT NULL
created_at_ms BIGINT NOT NULL
product_version VARCHAR NOT NULL
```

Current schema version:

```text
2
```

### 13.2 sessions

```text
session_id VARCHAR PRIMARY KEY
producer_instance_id VARCHAR NOT NULL
status VARCHAR NOT NULL          # running | stopped | interrupted
started_at_ms BIGINT NOT NULL
stopped_at_ms BIGINT NULL
stop_reason VARCHAR NULL
last_heartbeat_at_ms BIGINT NOT NULL
completed_cycles BIGINT NOT NULL
failed_cycles BIGINT NOT NULL
last_completed_cycle_id BIGINT NULL
last_completed_at_ms BIGINT NULL
config_json JSON NOT NULL
last_error_json JSON NULL
```

Session IDs are generated by Node (UUID/string), not by a DuckDB sequence.

### 13.3 universe

This table is a durable all-seen security catalog plus current-universe membership.

```text
security_id VARCHAR PRIMARY KEY
is_current BOOLEAN NOT NULL
universe_revision BIGINT NOT NULL
first_seen_at_ms BIGINT NOT NULL
last_seen_at_ms BIGINT NOT NULL
paper_name VARCHAR NULL
map_heat_date_change_json JSON NULL
raw_map_heat JSON NOT NULL
```

Why retain inactive rows:

- historical-only Detail can still recover paper metadata;
- a universe replacement does not erase historical metadata.

Current universe membership is `is_current = true`.

All rows in one accepted replacement share one `universe_revision`.

### 13.4 cycles

One row per persisted successful or failed cycle event.

```text
cycle_id BIGINT PRIMARY KEY
session_id VARCHAR NOT NULL
universe_revision BIGINT NULL
status VARCHAR NOT NULL          # complete | failed
started_at_ms BIGINT NOT NULL
completed_at_ms BIGINT NOT NULL
committed_at_ms BIGINT NOT NULL
duration_ms BIGINT NOT NULL
requested BIGINT NULL
received BIGINT NULL
unique_count BIGINT NULL
missing BIGINT NULL
duplicates BIGINT NULL
unexpected BIGINT NULL
chunk_count INTEGER NULL
chunks_json JSON NULL
failure_phase VARCHAR NULL
error_json JSON NULL
```

For successful cycles the integrity counters are non-null and satisfy the Data Contract.

For failed reports unavailable counters remain NULL.

### 13.5 history

Append-only successful-cycle market facts.

```text
cycle_id BIGINT NOT NULL
session_id VARCHAR NOT NULL
universe_revision BIGINT NOT NULL
security_id VARCHAR NOT NULL
chunk_index INTEGER NOT NULL
cycle_started_at_ms BIGINT NOT NULL
chunk_received_at_ms BIGINT NOT NULL
collected_at_ms BIGINT NOT NULL
server_as_of_date_json JSON NULL

LastKnownRate DOUBLE NULL
BaseRateChangePercentage DOUBLE NULL
BuyLimit1 DOUBLE NULL
BuyVolume1 DOUBLE NULL
SellLimit1 DOUBLE NULL
SellVolume1 DOUBLE NULL
DailyDealsQuantity DOUBLE NULL
LastDealVolume DOUBLE NULL
DailyTurnover DOUBLE NULL
DailyNISRevenue DOUBLE NULL
DailyLowestRate DOUBLE NULL
DailyHighestRate DOUBLE NULL
LastDealTimeOnly VARCHAR NULL

raw_data JSON NOT NULL

PRIMARY KEY (cycle_id, security_id)
```

The named typed market columns are convenience projections for common UI/Scanner use.

Projection rule:

- a raw JSON numeric value becomes the corresponding DOUBLE;
- a raw string field intended as string remains string;
- null/missing/non-matching raw type becomes NULL in the typed projection;
- `raw_data` remains the fidelity source and is never replaced by the typed projection.

No provider field semantics are invented by the projection.

### 13.6 latest

Same market row shape as `history` for the latest committed complete cycle, with:

```text
PRIMARY KEY (security_id)
```

It contains exactly the complete cycle's securities.

`latest` is replaced as a whole inside the successful-cycle transaction.

### 13.7 scanner_saved_queries

Durable **user configuration**, not market authority.

```text
query_id VARCHAR PRIMARY KEY
name VARCHAR NOT NULL
name_key VARCHAR NOT NULL UNIQUE
sql_text VARCHAR NOT NULL
interval_ms BIGINT NOT NULL
created_at_ms BIGINT NOT NULL
updated_at_ms BIGINT NOT NULL
```

Rules:

- `query_id` is generated by Node as `user:<uuid>`;
- `interval_ms > 0`;
- `name` is trimmed human-visible text;
- `name_key` is derived deterministically from Unicode NFKC normalization, trim/collapsed whitespace and lowercase normalization;
- user `name_key` must not collide with another user query or a reserved built-in name;
- SQL is stored as authored text and is **not** treated as valid merely because it was saved;
- normal Scanner admission still runs only when the query is explicitly Activated/executed;
- CRUD writes use the existing serialized `writerConnection`;
- CRUD failure cannot change sessions/universe/cycles/history/latest or an already-active Browser Scanner generation.

The table contains no provider credentials/session/account data.

### 13.8 Explicit v1 → v2 migration

For a valid v1 database:

```text
BEGIN
→ create scanner_saved_queries
→ update schema_info.schema_version = 2
→ update schema_info.product_version to the migrating service version
→ COMMIT
→ validate the complete v2 required table set
```

On migration failure:

```text
ROLLBACK
→ prior v1 market data remains intact
→ service does not become ready
```

`created_at_ms` in `schema_info` remains the original database creation time.

Fresh v2 bootstrap creates all seven tables in one schema bootstrap transaction.

### 13.9 Public Scanner schema

Scanner may read:

```text
schema_info
sessions
universe
cycles
history
latest
scanner_saved_queries
```

`scanner_saved_queries` is documented as configuration metadata rather than market data. Scanner still has SELECT-only access; CRUD uses protocol operations, never arbitrary SQL mutation.

No hidden analytical database exists.

No sequence objects are created in schema v2.

### 13.10 Production history retention

Schema v2 has **no automatic retention, TTL, age-based cleanup, or background history-deletion job**.

Successful-cycle history is append-only until an explicit future retention/delete feature is designed and reviewed. Demo reset is separate and may delete only demo state under `.demo/`.

The initial product does not need a production-history delete UI merely to satisfy this rule; the invariant is that implementation must not silently remove committed history.

---

## 14. Universe replacement transaction

`producer.universe.replace` uses the serialized writer.

Transaction:

```text
BEGIN
→ validate payload again
→ allocate new revision = previous max universe_revision + 1
→ mark existing universe rows is_current = false
→ upsert incoming rows:
     is_current = true
     universe_revision = new revision
     first_seen preserved when existing
     last_seen/raw metadata updated
→ verify count(is_current) == recordCount
→ COMMIT
→ response.ok with universeRevision
```

On any error:

```text
ROLLBACK
→ no revision ACK
```

Current Viewer row membership still comes from `latest`, not from `universe.is_current`. This prevents a universe discovery update from masquerading as a committed market cycle.

---

## 15. Successful-cycle transaction

Before transaction:

- validate protocol object;
- validate Data Contract invariants;
- require active producer session;
- require `universeRevision` to equal current acknowledged revision;
- compare cycle SecurityId set exactly with current universe SecurityId set;
- verify each `securityId == String(data.Key)`;
- reject duplicates/missing/unexpected.

Then serialized writer transaction:

```text
BEGIN

→ allocate cycle_id =
    COALESCE(MAX(cycles.cycle_id), 0) + 1

→ INSERT cycles(status='complete', ...)

→ INSERT one history row per security

→ DELETE FROM latest

→ INSERT complete cycle into latest

→ UPDATE active session:
     completed_cycles += 1
     last_completed_cycle_id = cycle_id
     last_completed_at_ms = cycle.completedAtMs
     last_error_json = NULL

→ COMMIT

→ only now response.ok(cycleId, committedAtMs)
```

Because there is one serialized writer, `MAX(cycle_id)+1` is sufficient and avoids a mutable SQL sequence callable from Scanner SELECT functions.

Any error after BEGIN:

```text
ROLLBACK
→ previous latest remains authoritative
→ no partial history survives
→ no successful ACK
```

Separate read connections see only committed states.

---

## 16. Failed-cycle persistence

`producer.cycle.failed` is diagnostics-only.

Serialized transaction:

```text
BEGIN
→ allocate next cycle_id
→ INSERT cycles(status='failed', counters/error...)
→ UPDATE session:
     failed_cycles += 1
     last_error_json = sanitized error
→ COMMIT
→ ACK failed-cycle persistence
```

Do not touch `latest` or `history`.

Provider/validation failure may be followed by a later scheduled cycle.

Transport/service failure is different: the producer fails closed and must be explicitly relaunched.

---

## 17. Heartbeat/session lifecycle

### Session start

Creates one `running` session row and binds it to the active producer connection.

### Heartbeat

Every accepted heartbeat updates:

```text
last_heartbeat_at_ms
```

### Graceful producer stop

```text
status = stopped
stopped_at_ms = supplied/validated time
stop_reason = supplied reason
```

### Producer socket loss/service interruption

If a running producer connection disappears without a successful session.stop:

```text
status = interrupted
stopped_at_ms = service-observed time
stop_reason = connection_lost | service_shutdown | heartbeat_stale
```

### Service restart recovery

Startup performs:

```text
open DB
→ validate/create schema
→ UPDATE any status='running' sessions to interrupted
→ build Scanner safety metadata
→ only then start accepting WebSocket upgrades
→ serviceReady = true
```

Committed universe/cycles/history/latest are not rewritten during recovery.

### Service shutdown drain

Before closing DuckDB connections, service shutdown must:

```text
stop accepting new work
→ close active WebSocket connections
→ await every already-accepted per-connection message task
→ drain the serialized writer
→ close DuckDB connections
```

This applies to Viewer reads, Scanner execution/query-library operations and producer work. A socket closing does not cancel an already-entered DuckDB operation, so the DB must not be closed underneath an in-flight message task.

---

## 18. Trusted Viewer reads

### Current

Query begins from `latest` and LEFT JOINs `universe` by `security_id`.

Do not filter Current rows by `universe.is_current`.

This preserves the product rule that only a complete committed cycle advances Current.

Return exact Product Spec row shape.

### Security lookup

Given canonical SecurityId:

1. check `latest`;
2. check durable `universe` metadata;
3. check existence in `history`;
4. return `found=false` only if none exist.

Historical-only security returns `isCurrent=false`, metadata if available, and `currentRow=null`.

### History paging

Ordering:

```text
ORDER BY collected_at_ms DESC, cycle_id DESC
```

Per one `security_id`.

Server page size:

```text
500
```

Node fetches 501 rows to derive `hasMore`, returns at most 500.

Continuation predicate:

```text
collected_at_ms < cursor.collectedAtMs
OR
(
  collected_at_ms = cursor.collectedAtMs
  AND cycle_id < cursor.cycleId
)
```

Cursor payload logically contains:

```text
v = 1
securityId
collectedAtMs
cycleId
```

It is encoded as an opaque base64url JSON string.

On decode, Node verifies version, SecurityId match, integer fields and shape.

No HMAC is needed for this trusted local cursor; invalid/tampered cursor simply returns `CURSOR_INVALID`.

### Status

Status derives health using latest relevant session:

```text
no session/state → UNKNOWN
stopped/interrupted → STOPPED
running heartbeat age >= 15000 ms → STALE
running fresh + last_error_json != NULL → ERROR
running fresh + no error → RUNNING
```

This preserves V1 health semantics with the chosen technical heartbeat/stale cadence.

---

## 19. Commit notifications

BroadcastChannel may be retained only as same-origin metadata invalidation.

Channel name is versioned, for example:

```text
market-scope:v1
```

After a successful cycle COMMIT ACK, producer publishes:

```text
{
  type: "CYCLE_COMMITTED",
  cycleId,
  completedAtMs
}
```

No market rows cross BroadcastChannel.

Viewer response:

```text
hint
→ reread Node current/status
→ if in Detail, reread Detail/history to preserved depth
```

If BroadcastChannel is unavailable or notification is lost, manual refresh/reopen recovers from Node authority.

---

## 20. Scanner browser scheduler and query-library state

Browser owns transient UI/execution state:

```text
cached query-library list
selected queryId or null
draft name
draft SQL
draft interval
active generation
active SQL
active interval
timer
execution-in-flight flag
```

Node/DuckDB owns durable **user-saved** query records. Browser cache is never persistence authority.

Selecting a built-in or user query:

```text
load its name/SQL/interval into draft state
→ do not Activate
→ do not replace the active generation
```

For a selected user query, Save performs `scanner.queries.update`. Save As/New performs `scanner.queries.create`. Delete performs `scanner.queries.delete`.

For a selected built-in:

- direct update/delete controls are disabled;
- Save As/New copies the current draft into a new user query;
- built-in source records remain unchanged.

A name conflict is visible and must not silently overwrite another query.

Activate:

```text
generation++
→ cancel old timer
→ capture draft as active
→ execute immediately
```

After execution settles:

```text
if generation still active
→ setTimeout(activeInterval)
→ next execute
```

No `setInterval`.

No overlap.

No catch-up.

Changing the draft or saved-library state does not mutate active execution until Activate.

There is no server Scanner scheduler, execution-history table, automatic query-history capture or cancellation engine. The only new persisted configuration is the explicit user-saved query library.

### 20.1 Query-name and identity contract

Built-in IDs are stable source constants:

```text
builtin:all-current-fields
builtin:market-ranking-example
```

User IDs are opaque `user:<uuid>` values generated by Node.

User-visible names are normalized for collision detection as:

```text
Unicode NFKC
→ trim outer whitespace
→ collapse internal whitespace runs
→ lowercase deterministically
```

Names must be non-empty after normalization and no longer than 120 Unicode code points.

A normalized user name may not collide with:

- another saved user query;
- a built-in display name.

Collision returns `SCANNER_QUERY_NAME_CONFLICT`.

Unknown user IDs return `NOT_FOUND`.

Attempted built-in update/delete returns `SCANNER_QUERY_READ_ONLY`.

### 20.2 Built-in query source

Built-ins are versioned source definitions, not rows in `scanner_saved_queries`.

Initial built-ins use a 5-second interval and include exactly these two semantic examples.

**All current fields**

```text
queryId: builtin:all-current-fields
name: All current fields
intervalMs: 5000
```

```sql
SELECT *
FROM latest
ORDER BY security_id
LIMIT 100;
```

Purpose: discover the current/latest row shape without an unbounded result.

**Market ranking example**

```text
queryId: builtin:market-ranking-example
name: Market ranking example
intervalMs: 5000
```

```sql
SELECT
  security_id AS securityId,
  LastKnownRate,
  BaseRateChangePercentage,
  DailyDealsQuantity,
  BuyLimit1,
  SellLimit1
FROM latest
WHERE LastKnownRate IS NOT NULL
ORDER BY BaseRateChangePercentage DESC NULLS LAST,
         DailyDealsQuantity DESC NULLS LAST,
         security_id ASC
LIMIT 20;
```

Purpose: demonstrate canonical SecurityId navigation, filtering, ranking, null ordering and bounded output without claiming a proprietary trading formula or inventing provider semantics.

Every built-in must pass the same real-DuckDB Scanner admission/execution path as user SQL.

### 20.3 Canonical Scanner SQL guide

The canonical user/AI authoring document is:

```text
docs/SCANNER_SQL_GUIDE.md
```

It must contain:

- all public Scanner tables and columns from the current schema;
- market/config table distinction;
- canonical SecurityId joins/navigation alias guidance;
- verified field semantics and explicit Unknown where semantics are not established;
- null/zero/missing rules;
- supported and rejected SQL;
- bounded/performance guidance;
- built-in examples;
- additional practical examples;
- one copyable prompt template for asking an AI to create or modify a query.

Guide drift is a test failure. Automated proof compares the real fresh-schema public table/column inventory and built-in definitions against the guide.

---

## 21. Scanner admission

Scanner input is treated as trusted-user SQL that still must not mutate MarketScope authority.

Admission sequence on `scannerConnection`:

1. require non-empty SQL after trim;
2. call `extractStatements(sql)`;
3. require exactly one extracted statement;
4. prepare that extracted statement;
5. require `prepared.statementType === StatementType.SELECT`;
6. require `prepared.parameterCount === 0`;
7. lex the SQL outside comments/string literals/quoted identifiers to identify function-call identifiers;
8. reject `query(...)` and `query_table(...)` explicitly;
9. reject invocation of any function whose current `duckdb_functions().has_side_effects = true`;
10. execute only after all checks pass.

The function lexer is an admission helper, not a replacement SQL parser. DuckDB's own parser/extractor/preparer remains authoritative for statement count/type.

At service startup, Scanner loads the relevant function catalog metadata from the same hardened DuckDB instance.

If DuckDB/package upgrade changes function metadata/admission behavior, Scanner safety tests must pass before the upgrade lands.

---

## 22. Scanner execution/result shaping

Execute on dedicated `scannerConnection`.

Requirements:

- no server-added `ORDER BY`;
- no server-added `LIMIT`;
- no hidden filter/rank;
- no mutation transaction;
- preserve returned row order;
- preserve exact returned column names/order.

Use DuckDB result metadata for:

```text
columnNames
columnTypes
```

Serialize rows as JSON-safe arrays.

There is no hidden server row limit in the current product contract.

This is a trusted local analytical tool; the operator is responsible for writing bounded analytical queries when needed. If workload evidence later requires an explicit result/resource limit, it must be product-visible and must fail rather than silently truncate results.

Scanner query failure never changes collector/session authority.

---

## 23. Scanner security guarantees and limits

Hardening layers:

```text
loopback service
+ exact browser Origin
+ protocol role separation
+ DuckDB external access disabled
+ extension auto-load/install disabled
+ persistent secrets disabled
+ config locked
+ exactly one statement
+ SELECT statement type
+ no parameters
+ query/query_table blocked
+ side-effect function rejection
+ no schema sequences
```

Required non-mutation proof later:

Rejected Scanner SQL leaves unchanged:

- schema;
- sessions;
- cycles;
- history;
- latest;
- universe.

This does **not** claim sandboxing against a malicious local user/process.

---

## 24. Fake Market topology

Canonical fake environment:

```text
Node built-in HTTP Fake Market server
        |
        | same production provider paths
        v
fake provider page
        |
        | loads normal dist/browser/market-scope.runtime.js
        v
browser runtime
        |
        | real ws:// loopback protocol
        v
real local-service module
        |
        v
real temporary/demo DuckDB
```

No Express.

Fake HTTP server binds loopback.

Required routes:

```text
GET /                           # fake provider page
GET /assets/market-scope.runtime.js
GET /lti/lti-app/api/MarketFast/MapHeat2
GET /lti/lti-app/api/SecuritiesFast/GetSecuritiesData
```

Test-only/reset control endpoints may exist under a clearly non-production namespace and must bind loopback only.

Default fake market:

- about four synthetic securities;
- deterministic prices;
- deterministic growing logical cycles;
- zero/null/missing optional values;
- normal complete cycles;
- explicit failure scenarios.

The fake advances by complete logical market cycle, not random timers.

---

## 25. One-command demo

Command:

```text
npm run demo:fake-market
```

Conceptual behavior:

1. build normal browser runtime;
2. start real local service with:
   - DB `.demo/market-scope.duckdb`;
   - explicit fake Origin;
3. start Fake Market HTTP server on a fixed documented loopback port (initially 4173);
4. print exactly one useful URL:
   `http://127.0.0.1:4173/`;
5. keep both servers alive until process termination.

Demo database is **not** reset automatically.

Restarting the demo reopens the same demo DB and preserves committed history.

Reset command:

```text
npm run demo:reset
```

It may delete only paths rooted under the repository's `.demo/` directory.

It must refuse path escape and must never read/delete the production `data/` database.

No Electron, installer, Docker, or custom control panel.

---

## 26. Package/run commands

Current command contract:

```text
npm ci
npm run build:browser
npm run service -- --allowed-origin=<exact-origin>
npm run demo:fake-market
npm run demo:reset
npm test
```

The exact test/CI script split is owned by `docs/TEST_STRATEGY.md`.

Production service accepts explicit CLI options at minimum:

```text
--db <path>
--host <loopback host>
--port <integer>
--allowed-origin <origin>   # repeatable if needed
```

No secrets are passed through these options.

---

## 27. Shutdown

Graceful service shutdown:

1. stop accepting upgrades;
2. close active viewer sockets;
3. mark active producer session interrupted unless it already stopped cleanly;
4. drain/finish the current serialized writer operation;
5. close DuckDB connections;
6. close instance/process resources;
7. exit.

Do not kill the process in the middle of an acknowledged write.

An ungraceful OS/process crash is recovered through DuckDB durability + startup stale-session recovery.

---

## 28. Diagnosability-by-design

Diagnosability is a local product contract, not a remote telemetry system.

The implementation must reuse existing protocol errors, service health and browser state wherever possible. Add only the small shared diagnostic model needed to identify **which boundary failed, what succeeded immediately before it, and why**.

### 28.1 Stable components and checkpoints

Stable component IDs:

```text
browser.runtime
node.service
node.database
producer
provider
persistence
viewer
scanner
demo
```

Initial stable checkpoint registry:

| Checkpoint ID | Owning component | Meaning when successful |
|---|---|---|
| `browser.runtime.loaded` | `browser.runtime` | built runtime loaded and bootstrap exists |
| `browser.service.hello` | `browser.runtime` | localhost WebSocket connected and hello accepted |
| `browser.service.connection` | `browser.runtime` | established authority transport remains usable; a post-start disconnect fails this boundary |
| `node.database.ready` | `node.database` | DuckDB opened and schema/recovery completed |
| `node.service.ready` | `node.service` | loopback listener is active and the service can accept allowed client hello |
| `producer.session.started` | `producer` | producer ownership/session start accepted |
| `provider.universe.collected` | `provider` | provider universe was fetched, canonicalized and completely validated in Browser |
| `producer.universe.accepted` | `producer` | validated universe was persisted/acknowledged by Node |
| `provider.cycle.collected` | `provider` | one complete provider cycle was fetched and passed Browser validation |
| `producer.cycle.committed` | `persistence` | Node COMMIT completed and ACK was accepted by producer |
| `viewer.current.read` | `viewer` | trusted Current/status read completed |
| `viewer.detail.read` | `viewer` | trusted Security/History read completed |
| `scanner.execute` | `scanner` | one admitted Scanner execution completed successfully |
| `scanner.query_library` | `scanner` | one saved-query library read/create/update/delete completed successfully |
| `demo.runtime.built` | `demo` | normal browser runtime build completed |
| `demo.fake_market.ready` | `demo` | Fake Market HTTP listener is ready |
| `demo.stack.ready` | `demo` | runtime + Fake Market + Node service are ready and launch URL is usable |

Checkpoint IDs are public contract strings. Rename/remove them only through an explicit contract change; tests and support reports may depend on them.

A failed operation records the checkpoint it was attempting. The last successful checkpoint is the most recent successful checkpoint in the same operation/flow when known. It may be `null` only when failure occurs before any checkpoint can succeed.

### 28.2 Diagnostic record

The small shared logical shape is:

```text
DiagnosticRecord {
  schemaVersion: 1,
  atMs,
  productVersion,
  component,
  operation,
  operationId,
  checkpoint,
  status: "ok" | "error",
  lastSuccessfulCheckpoint,
  error: null | {
    code,
    name,
    message,
    retryable
  },
  context
}
```

Rules:

- for WebSocket request/response work, `operationId` may reuse the existing protocol `requestId` only when it matches the product's bounded opaque-correlation format; otherwise Node/Browser assign a local safe alias and never copy the original requestId into public diagnostics;
- for local startup/non-protocol work, `operationId` is a locally generated opaque correlation ID containing no account/provider/user identity;
- correlation IDs are bounded technical tokens, not user-controlled free text.
- `code` reuses the stable protocol/domain error code where one exists.
- a new stable diagnostic code is introduced only when the failure has no existing meaningful machine code;
- `name` + `message` are sanitized technical evidence, not raw stack/payload dumps;
- raw `Error.message` is never copied automatically into public/support diagnostics; the owning boundary supplies a public-safe cause summary or maps to a known stable error description;
- unknown/unclassified failures retain the stable failing checkpoint/code even when the safe cause summary must be generic;
- browser-visible diagnostic records never include stack traces, SQL text, URLs with query/fragment data, or absolute filesystem paths;
- `context` is a strict allowlist of scalar/aggregate facts, not arbitrary objects.

Allowed context examples:

```text
universeRevision
cycleId
requested / received / unique / missing / duplicates / unexpected
latestCount
historyCount
serviceHealth
producerState
scannerIntervalMs
```

Do not place raw provider rows, Scanner result rows, SQL result data, cookies, headers or request bodies in diagnostic context.

### 28.3 Bounded process-local checkpoint tracker

Browser runtime and Node service each keep one small process-local tracker:

- current/last successful checkpoint per active operation;
- most recent error record;
- at most **32** recent sanitized diagnostic records per process;
- oldest record is discarded when the limit is exceeded.

This is intentionally not a new database table and not a durable telemetry store.

Persistent authority remains:

```text
DuckDB market/session/cycle facts
```

The diagnostic ring is explanatory evidence only. After restart, persistent session/cycle facts still explain committed/failed authority while the process-local ring begins fresh.

### 28.4 Node support read

Add one Viewer-role protocol operation:

```text
viewer.support.snapshot
```

Payload:

```text
{}
```

Response contains only sanitized operational evidence:

```text
{
  schemaVersion: 1,
  generatedAtMs,
  service: {
    productVersion,
    ready,
    schemaVersion,
    health,
    producerState
  },
  authority: {
    lastCommittedCycleId,
    lastCommittedAtMs,
    completedCycles,
    failedCycles,
    latestCount,
    historyCount
  },
  diagnostics: {
    lastSuccessfulCheckpoint,
    lastError,
    recent
  }
}
```

`recent` is bounded to the process-local diagnostic limit and uses the allowlisted DiagnosticRecord shape. `producerState` is a small state value only; the snapshot does not expose producer/client/session identifiers.

The operation is read-only, does not query provider endpoints, does not expose Scanner data rows, and does not mutate authority.

### 28.5 Browser Support Snapshot

The normal Viewer diagnostics surface provides an explicit **העתק אבחון / Copy Support Snapshot** action.

The browser builds one JSON snapshot by combining:

1. browser runtime checkpoint state;
2. Node `viewer.support.snapshot`;
3. the existing trusted health/current aggregate diagnostics;
4. browser product version and generated timestamp.

Logical top-level shape:

```text
{
  schemaVersion: 1,
  generatedAtMs,
  browser: { ...sanitized checkpoint state... },
  node: { ...viewer.support.snapshot response... },
  visibleState: {
    runtimeState,
    viewerSurface,
    selectedSecurityIdPresent,
    scannerActive
  }
}
```

Do **not** include:

- Current rows;
- history rows;
- Scanner SQL text or result rows;
- provider response/request bodies;
- cookies/auth/session headers;
- account identifiers;
- page URL query strings/fragments;
- local absolute filesystem paths.

The copied JSON must be useful as-is when pasted into a maintenance chat. It should expose the latest error/checkpoint near the top; the user should not need to interpret a large raw log.

The action first attempts normal clipboard copy. If browser clipboard permission/API is unavailable, the same JSON is rendered in a selectable text surface so the user can still copy it without DevTools.

If Node is unavailable, snapshot creation still succeeds with browser evidence plus a Node-unavailable diagnostic instead of failing the copy action.

### 28.6 CLI/startup fallback

Failures that occur before Viewer diagnostics are usable must emit one concise sanitized diagnostic JSON line to stderr:

```text
MARKETSCOPE_DIAGNOSTIC { ...DiagnosticRecord... }
```

This applies to the service/demo launcher startup path, including DB/schema/open/listen/build/Fake Market readiness failures.

Normal successful demo startup continues to print its one useful URL to stdout. Diagnostics therefore do not pollute the success URL contract.

No stack trace is printed by default. A stack may be retained only inside local development/test process memory; it is not part of the copyable/public diagnostic contract.

### 28.7 Cause preservation

When one layer wraps another failure:

```text
specific cause
→ stable code + sanitized technical name/message
→ outer checkpoint/component context
```

The outer layer must not replace a known specific cause with a generic-only `INTERNAL_ERROR`/“failed” message unless exposing the original cause would violate the sanitization contract.

A wrapper may change the user-facing localized text while preserving the machine code and sanitized cause in diagnostics.

### 28.8 Failure-boundary examples

Expected self-localization examples:

```text
runtime loads, service absent
lastSuccessfulCheckpoint = browser.runtime.loaded
checkpoint               = browser.service.hello
code                     = SERVICE_UNAVAILABLE
```

```text
cycle validated, DuckDB COMMIT fails
lastSuccessfulCheckpoint = provider.cycle.collected
checkpoint               = producer.cycle.committed
code                     = DB_ERROR
```

```text
Scanner SQL is rejected
lastSuccessfulCheckpoint = <previous successful scanner.execute or null>
checkpoint               = scanner.execute
code                     = SCANNER_* stable rejection code
```

```text
Saved-query CRUD fails
lastSuccessfulCheckpoint = <previous successful scanner.query_library or null>
checkpoint               = scanner.query_library
code                     = SCANNER_QUERY_* / NOT_FOUND / DB_ERROR as applicable
```

Schema-v1→v2 saved-query migration failures remain a `node.database.ready` failure because migration is part of database readiness, not a runtime query-library CRUD operation.

### 28.9 Security and KISS boundary

Diagnosability must remain:

- loopback/local-first;
- bounded;
- sanitized;
- read-only from the support surface;
- independent from market-data authority.

Do not add for this requirement:

- OpenTelemetry;
- cloud telemetry;
- external log shipping;
- metrics server;
- distributed tracing backend;
- persistent diagnostic event database;
- generic logging framework;
- raw browser/network dump collection.

The smallest sufficient mechanism is: stable checkpoint/error semantics + bounded local record + one Node support read + one copyable Browser snapshot + one CLI fallback line.

---

## 29. Logging

Use concise local process logs.

Log:

- service startup/readiness;
- DB/schema version;
- connection role changes;
- session/universe/cycle IDs;
- sanitized error names/messages;
- shutdown.

Do not log:

- credentials/cookies/auth headers;
- account identifiers;
- full raw provider rows by default;
- full Scanner result sets;
- private browser/session data.

No logging framework is required initially.

---

## 30. Technical external-dependency facts verified on 2026-09-27

This specification was checked against current upstream documentation/API rather than assuming old package behavior.

Verified facts used by this spec:

- Node 24 is an LTS release line.
- `@duckdb/node-api` is the maintained Node Neo high-level client; the old `duckdb` package is deprecated.
- current npm `@duckdb/node-api` baseline is `1.5.5-r.5`.
- Node Neo high-level prepared statements expose `statementType`.
- Node Neo exposes `extractStatements()`.
- DuckDB exposes `duckdb_functions().has_side_effects`.
- DuckDB documents `query()` as capable of executing arbitrary query text and potentially altering DB state.
- DuckDB supports the hardening settings used above: external-access disabling, extension restrictions, persistent-secret restriction, and configuration locking.
- current `ws` baseline is `8.21.3`.
- loopback origins are treated specially by secure-context/mixed-content rules, but current browser Local Network Access and provider CSP remain real external compatibility conditions and therefore receive an explicit real-provider proof gate.

---

## 31. KISS exclusions

Do not add in initial implementation absent new evidence:

- ORM;
- schema migration framework;
- Express/Nest;
- React rewrite;
- browser DuckDB;
- worker-owned DB;
- Web Locks DB authority;
- remote/cloud service;
- Docker/Kubernetes;
- service manager;
- IPC broker;
- event sourcing;
- caching layer;
- reconnect framework;
- offline queue/replay;
- SQL query-history database;
- server Scanner scheduler;
- query cancellation engine;
- connection pool framework;
- generalized message bus.

---

