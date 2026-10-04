# MarketScope Data Contract

## Ownership

This file owns provider acquisition facts, canonical market identity, complete-cycle integrity, raw-value fidelity, and the provider-neutral data objects that cross the Browser → Node boundary.

It does **not** own:

- WebSocket envelope/message framing;
- Node database schema/transactions;
- Viewer formatting;
- Scanner SQL admission;
- live operational status.

Those belong to `docs/TECHNICAL_SPEC.md`, `docs/PRODUCT_SPEC.md`, and `STATUS.yaml`.


---

## 1. Evidence vocabulary

Material provider/data statements use these labels where useful:

- **Verified** — directly proved by executable V1 tests and/or explicit recorded live evidence.
- **Accepted** — deliberate current product/design requirement supported by evidence but not an eternal provider guarantee.
- **Inferred** — reasonable interpretation needed for planning but not yet directly proved.
- **Unknown** — not supported strongly enough to claim.

A private provider API observation is never promoted into an eternal contract merely because it worked once.

---

## 2. Provider boundary and authority

### 2.1 Browser provider ownership

**Accepted**

Provider authentication/session context stays in the authenticated provider browser page.

The Browser owns:

```text
MapHeat2
→ dynamic universe
→ sequential GetSecuritiesData chunks
→ exact complete-cycle validation
→ provider-neutral validated objects
```

Node never receives browser cookies, authorization headers, session tokens, account identifiers, or authenticated raw transport dumps.

### 2.2 Endpoint roles

**Accepted based on observed behavior**

`MapHeat2` is the universe/discovery/metadata source.

`GetSecuritiesData` is the repeatedly refreshed detailed/dynamic security snapshot source.

**Verified**

The join relation used by this product is:

```text
String(MapHeat2.PaperId)
==
String(GetSecuritiesData.Key)
```

Recorded historical evidence matched 561/561 securities. The number 561 is evidence from one universe observation, **not** a size contract.

### 2.3 Non-atomic provider calls

**Verified**

MapHeat2 and GetSecuritiesData are separate calls made at different times.

Therefore MarketScope must never claim that dynamic values returned by the two endpoints form one atomic provider snapshot or are required to be equal.

Use MapHeat2 primarily for universe/name/metadata and GetSecuritiesData for the repeated detailed market snapshot.

---

## 3. MapHeat2 universe acquisition

### 3.1 Relative same-origin endpoint

Current proven V1 adapter uses:

```text
/lti/lti-app/api/MarketFast/MapHeat2
```

with the V1 filter/query shape, including:

```text
indexIdArray=0
sectorIdAndTatSectorArray=0;0
showOnlyDual=0
page=1
pageCount=<requested count>
orderFieldName=DailyNumDeals
order=DESC
rt=true
```

plus the existing broad numeric range parameters used to avoid artificially filtering the universe.

The exact private endpoint/query shape is **provider-adapter evidence**, not a promise that the provider can never change it.

### 3.2 Two-step complete-universe load

The proven baseline is:

```text
MapHeat2(pageCount=1)
→ validate positive integer recordCount
→ MapHeat2(pageCount=recordCount)
→ validate same recordCount
→ validate records.length == recordCount
→ validate every PaperId
→ validate unique canonical IDs
```

Failures are explicit. An invalid/missing structure is not an empty universe.

### 3.3 Required universe facts

Each usable MapHeat record requires a non-null, non-undefined, non-empty `PaperId`.

Canonical MapHeat identity is:

```text
securityId = String(rawMapHeat.PaperId)
```

This is source-specific. MarketScope does **not** interpret the phrase “PaperId or Key” as a fallback search through arbitrary fields in one record:

- MapHeat record → use `PaperId`;
- Security record → use `Key`.

Duplicate IDs after string canonicalization fail the universe load.

Record order is preserved by the adapter for deterministic chunk planning, but array position is never identity.

### 3.4 Dynamic size

Universe size comes only from the validated provider `recordCount`.

Never hardcode:

```text
561
187 × 3
or any other observed universe shape
```

Historical evidence supports a conservative chunk size around 187, but exact provider thresholds are not known.

Recorded evidence:

```text
187 IDs → HTTP 200
200 IDs → HTTP 200
250 IDs → HTTP 200
400 IDs → HTTP 403
561 IDs → HTTP 403
```

**Unknown:** the exact reason/threshold behind those 403 responses.

Therefore old `chunkSize=187` is a conservative proven baseline, not an eternal provider law.

---

## 4. Validated universe object

Browser collection may retain additional runtime helpers, but the provider-neutral universe object that Node needs is:

```text
ValidatedUniverse = {
  loadedAtMs: finite non-negative number,
  recordCount: positive integer,

  securities: [
    {
      securityId: non-empty canonical string,
      paperName: provider value or null,
      mapHeatDateChange: provider value or null,
      rawMapHeat: full raw MapHeat record
    },
    ...
  ]
}
```

Rules:

- `securities.length == recordCount`;
- every `securityId` is unique;
- security order follows the validated MapHeat records but is not an identity mechanism;
- `rawMapHeat` preserves the complete provider record;
- `paperName` is metadata convenience, not identity;
- absence of optional metadata does not invalidate a record whose required identity is valid.

Browser-internal collection mechanics such as `paperIds`, chunk arrays, chunk sizes, or collection config need not be persisted by Node merely because V1 kept them in its in-memory universe object.

The later protocol must guarantee that a newly validated universe replacement is acknowledged by Node before a complete cycle validated against that new universe can become authoritative. This ordering removes the need to duplicate the whole universe in every cycle payload.

---

## 5. GetSecuritiesData chunk acquisition

### 5.1 Relative same-origin endpoint

Current proven endpoint:

```text
/lti/lti-app/api/SecuritiesFast/GetSecuritiesData
```

Current observed query shape:

```text
securityIds=<comma-separated encoded IDs>
responseType=1
is_gto=true
force=false
```

### 5.2 Requested ID normalization

A chunk request:

- must contain at least one ID;
- rejects `null`, `undefined`, and empty string;
- canonicalizes each ID with `String(value)`;
- preserves requested order;
- rejects duplicates after canonicalization.

### 5.3 Required response shape

A successful provider response must contain:

```text
data.SecuritiesData.Table.Security[]
```

Each usable Security object requires a non-null, non-undefined, non-empty `Key`.

Canonical Security-record identity is:

```text
securityId = String(rawSecurity.Key)
```

`Table.AsOfDate` is preserved as `serverAsOfDate`; if absent it becomes `null`.

### 5.4 Exact chunk membership

For every chunk:

- every response record has Key;
- response Keys are unique after canonicalization;
- every requested ID appears exactly once;
- no unrequested ID appears.

Provider response order **may differ** from request order and is accepted. Membership is matched by canonical ID, never by array index.

A chunk with missing or unexpected IDs fails.

### 5.5 Chunk timing

The existing adapter records:

```text
startedAtMs
responseReceivedAtMs
completedAtMs
requestDurationMs
parseDurationMs
durationMs
```

with:

```text
startedAtMs
<= responseReceivedAtMs
<= completedAtMs
```

Current V1 measurement points are:

- `startedAtMs` — immediately before `fetch`;
- `responseReceivedAtMs` — after the HTTP response object resolves;
- `completedAtMs` — after JSON parsing completes and immediately before synchronous result validation/building.

A security row later carries:

- `chunkReceivedAtMs = responseReceivedAtMs`;
- `collectedAtMs = completedAtMs`.

These are local Browser timing facts. They are not exchange timestamps.

---

## 6. Validated chunk result

The Browser's validated chunk result has the logical shape:

```text
ValidatedChunkResult = {
  requestedIds: canonical string[],
  requestedCount: integer,

  responseIds: canonical string[],
  receivedCount: integer,
  uniqueCount: integer,

  records: full raw Security[],
  serverAsOfDate: provider value or null,
  httpStatus: integer,

  timing: {
    startedAtMs,
    responseReceivedAtMs,
    completedAtMs,
    requestDurationMs,
    parseDurationMs,
    durationMs
  }
}
```

This is primarily a Browser validation/building object. The final Node cycle payload does not need to persist every helper field separately when the same fact is represented in the normalized cycle/chunk summaries and raw Security rows.

Raw Security objects are preserved, including explicit `0` and `null`.

---

## 7. Sequential complete-cycle construction

### 7.1 Proven baseline

**Accepted until evidence deliberately changes it**

Chunks execute sequentially.

```text
fetch chunk 0
→ optional delay
→ fetch chunk 1
→ optional delay
→ ...
→ fetch final chunk
→ no trailing delay
→ whole-cycle validation
```

At most one chunk fetch is in flight in the proven baseline.

Parallel collection is not a free optimization. It would require a revised contract for ordering, provider stability, backpressure, timing and completeness.

### 7.2 Chunk delay

V1 default:

```text
chunkDelayMs = 1000
```

The delay occurs only between chunks.

This default is implementation evidence, not a permanent MarketScope product requirement.

### 7.3 Cycle-level validation

Before a cycle can be called complete, Browser validates all of the following again:

- universe `recordCount` is valid;
- universe canonical IDs are unique;
- concatenated planned chunks exactly equal the universe canonical ID list;
- result count equals planned chunk count;
- each result is bound to the expected chunk;
- each chunk has exact record count;
- each raw Security has Key;
- each chunk response exactly matches its requested membership;
- no duplicate canonical Key occurs inside a chunk;
- no duplicate canonical Key occurs across chunks;
- no expected universe ID is missing;
- no unexpected ID exists.

If any check fails, no complete cycle exists.

### 7.4 Response order is not authority

Within a validated cycle, `securities[]` preserves the actual provider response order within each sequential chunk.

That order is diagnostic/observational only.

Downstream Node persistence and reads must use canonical `securityId`, never security-array position, as identity.

---

## 8. CompleteCycle — exact Browser → Node data object

The MarketScope complete-cycle payload is deliberately close to the proven V1 object while making all integrity counters explicit:

```text
CompleteCycle = {
  status: "complete",

  startedAtMs: finite non-negative number,
  completedAtMs: finite non-negative number,
  durationMs: completedAtMs - startedAtMs,

  requested: positive integer,
  received: positive integer,
  unique: positive integer,
  missing: 0,
  duplicates: 0,
  unexpected: 0,

  chunks: [
    {
      chunkIndex: zero-based integer,

      requested: positive integer,
      received: positive integer,
      unique: positive integer,

      requestStartedAtMs: finite non-negative number,
      receivedAtMs: finite non-negative number,
      completedAtMs: finite non-negative number,
      durationMs: finite non-negative number,

      serverAsOfDate: provider value or null,
      httpStatus: successful HTTP status
    },
    ...
  ],

  securities: [
    {
      securityId: canonical non-empty string,
      chunkIndex: zero-based integer,
      chunkReceivedAtMs: finite non-negative number,
      collectedAtMs: finite non-negative number,
      serverAsOfDate: provider value or null,
      data: full raw GetSecuritiesData Security object
    },
    ...
  ]
}
```

### 8.1 Complete-cycle success invariant

For a successful object:

```text
requested == received == unique == securities.length
missing == 0
duplicates == 0
unexpected == 0
```

Every `securities[].securityId` is unique and matches `String(securities[].data.Key)`.

The set of cycle SecurityIds equals the currently acknowledged validated universe set exactly.

### 8.2 Node-assigned facts are absent

The Browser does **not** invent durable database identity.

Therefore Browser → Node `CompleteCycle` does not contain:

- Node `cycleId`;
- Node `sessionId`;
- database row IDs;
- DuckDB-specific fields.

Node assigns durable session/cycle identity only when it accepts/commits the data under the Technical Spec.

### 8.3 Raw Security fidelity

`data` is the complete raw Security object returned by the provider.

Do not project it down to only currently-used UI fields before durable persistence.

Preserve logical JSON value distinctions:

```text
0
!= null
!= ""
!= missing property
```

Do not apply generic falsy fallback such as `value || null`.

JSON field order and exact HTTP response bytes are not product facts; the logical object/field/value content is.

---

## 9. Universe → cycle ordering rule

Because universe metadata is transported separately from every cycle, transport planning must preserve this causal order:

```text
validate universe U
→ send/replace U at Node
→ wait for successful acknowledgement
→ collect/validate cycle against U
→ send CompleteCycle
→ Node validates cycle membership against currently acknowledged U
→ commit or reject
```

If Browser refreshes the universe:

```text
new universe U2
→ replace/ACK U2
→ only then commit cycles validated against U2
```

This is a data-integrity requirement. Exact WebSocket message names/request IDs remain owned by `TECHNICAL_SPEC.md`.

---

## 10. Failed cycle versus authoritative market data

A failure object is diagnostics only.

It never updates:

- authoritative Current/latest;
- authoritative history;
- current universe membership merely by implication.

### 10.1 Browser-side failed-cycle report

The minimum provider/validation failure report sent to Node, when the local service is available, is:

```text
FailedCycleReport = {
  phase: "universe" | "chunk-fetch" | "cycle-validation",

  startedAtMs: finite non-negative number,
  failedAtMs: finite non-negative number,

  requested: integer | null,
  received: integer | null,
  unique: integer | null,
  missing: integer | null,
  duplicates: integer | null,
  unexpected: integer | null,

  error: {
    name: non-empty string,
    message: string
  }
}
```

Rules:

- unavailable counters remain `null`; never fabricate zero;
- no raw partial Security payload is authoritative merely because some chunks finished;
- provider credentials/headers/session data are never included;
- stack traces are not required in the durable failed-cycle market record;
- richer sanitized transient diagnostics may exist locally/test-side but are not market authority.

V1 evidence already distinguishes failure diagnostics from successful commit and allows counters to be null when a cycle was never fully built.

### 10.2 Node-side commit failure

A Browser object may be fully valid and still fail Node persistence.

That is **not** a successful cycle.

Node records/returns the failure according to the later Technical Spec, rolls back authoritative mutation, and sends no successful commit acknowledgement.

The Browser must not expose the cycle as completed before Node commit succeeds.

---

## 11. Recorder scheduling/in-memory success boundary

The durable Recorder behavior carried forward from V1 is:

- no overlapping cycles;
- first cycle may start immediately;
- target snapshot cadence is start-to-start, not a guarantee that one cycle finishes within the interval;
- if a cycle runs longer than the target interval, the next cycle may start immediately **after** the previous one settles, never concurrently;
- universe may be cached or deliberately refreshed, but a refreshed universe must pass the universe→cycle ordering rule above;
- provider/validation failure preserves the last committed authority;
- commit failure preserves the last committed authority;
- a completed cycle is exposed in Recorder success state only after the authoritative commit acknowledgement.

Historical V1 defaults:

```text
snapshotIntervalMs = 3000
chunkDelayMs = 1000
chunkSize = 187
refreshUniverseEveryCycle = false
```

These values are **evidence/default history, not immutable MarketScope product requirements**. Later product/technical planning may retain or change them deliberately.

---

## 12. Raw provider semantics

### 12.1 Required fidelity

**Accepted / required**

Preserve:

- full raw MapHeat record;
- full raw GetSecuritiesData Security record;
- explicit `null`;
- numeric `0`;
- empty string;
- missing property.

### 12.2 Known nullable Level 1 fields

Historical live evidence showed Level 1 BID/ASK price/volume fields can be null.

Models must therefore not make those fields non-null merely because the security is active.

### 12.3 Levels 2–5

Historical tested Equity snapshot evidence showed GetSecuritiesData Level 2–5 price/volume/change fields were null across the observed 561-security snapshot.

Therefore MarketScope must not design product behavior that depends on those fields until another source/condition is explicitly verified.

This is not a claim that they can never become populated.

### 12.4 Unknown semantics

Unknown provider fields remain raw/unknown.

Do not infer business meaning from:

- field names alone;
- one sample;
- equality with another endpoint;
- UI assumptions.

---

## 13. Explicit failure conditions

The affected universe/chunk/cycle fails on any of:

- provider HTTP failure;
- invalid JSON;
- missing required response structure;
- invalid universe `recordCount`;
- count changing between MapHeat count/full requests;
- incomplete MapHeat records array;
- missing/empty PaperId;
- duplicate PaperId after canonicalization;
- empty requested chunk;
- duplicate requested IDs after canonicalization;
- missing/empty Security Key;
- duplicate response Keys;
- missing requested IDs;
- unexpected IDs;
- invalid/out-of-order local timing facts;
- wrong chunk bound to a result;
- missing/extra chunk result;
- cross-chunk duplicate;
- whole-cycle membership mismatch;
- Node commit rejection/failure.

No failure path is converted into a successful empty market snapshot.

---

## 14. Evidence map

### Verified by direct executable V1 evidence

- relative MapHeat2/GetSecuritiesData adapter paths and query construction;
- dynamic recordCount validation;
- full-map count/completeness validation;
- canonical string identity and duplicate rejection;
- chunk creation preserves order/remainder;
- GetSecuritiesData response order may differ from request order;
- exact chunk membership validation;
- raw `0` and `null` preservation;
- missing AsOfDate → null;
- timing validation/derived durations;
- exact whole-cycle membership;
- cross-chunk duplicate rejection;
- sequential fetch with delay only between chunks;
- immediate stop on chunk-fetch failure;
- no cycle success exposure before commit resolves;
- commit failure never exposes uncommitted cycle as success;
- failure diagnostics are separate from authority.

Primary executable sources:

- `recorder/pure/universe-logic.js`;
- `recorder/pure/securities-chunk-logic.js`;
- `recorder/pure/cycle-logic.js`;
- `recorder/pure/recorder-loop-logic.js`;
- their direct unit tests.

### Verified / Accepted from durable Market Flow evidence

- MapHeat2 role — D-004;
- GetSecuritiesData role — D-005;
- PaperId↔Key join — D-006;
- dynamic universe / do not hardcode 561 — D-007;
- conservative batching evidence and unknown 403 threshold — D-008;
- sequential baseline — D-009;
- null/zero distinction — D-010;
- nullable Level 1 evidence — D-011;
- no Level 2–5 dependency from tested snapshot — D-012;
- endpoints are not atomic — D-013;
- prefer GetSecuritiesData for refreshed dynamic values — D-014;
- raw payload preservation — D-015;
- three-surface/Node continuity — D-043/D-045.

### Unknown / live-verification boundary

Still not promoted to permanent facts:

- long-term stability of private endpoint paths/parameters;
- exact cause or permanent threshold of provider 403 batching behavior;
- semantics of provider fields not independently evidenced;
- future population behavior of currently-null optional fields;
- current authenticated provider/session behavior until bounded live verification runs.

---

## 15. Implementation guardrails

The implemented provider/data boundary follows these guardrails:

1. reuse/adapt pure V1 validation logic only if it still matches this clean contract;
2. do not port IndexedDB authority;
3. do not move provider authentication into Node;
4. do not weaken exact membership checks for convenience;
5. do not reorder/join securities by array position;
6. do not normalize away raw null/zero/empty/missing distinctions;
7. do not ACK success before Node commit;
8. do not optimize chunk concurrency before evidence;
9. add direct tests for the exact Browser→Node objects defined here;
10. keep provider-specific parsing at the Browser adapter edge.
