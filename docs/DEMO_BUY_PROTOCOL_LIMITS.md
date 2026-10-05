# Demo Buy Protocol / Export Bounds

This document owns the concrete bounded constants and temporal-authority rules required by the Demo Buy + AI Investigation contracts. These are implementation requirements, not suggestions.

While the comprehensive replan is still `active`, this document is the normative owner for Demo Buy/AI protocol bounds, authority-watermark timing and lost-ack behavior. Any older conflicting wording elsewhere must be aligned before the plan is frozen; executors remain unauthorized until that alignment and final review are complete.

## 1. Existing transport boundary

The local WebSocket service keeps the existing inbound-message limit:

```text
16 MiB
```

Demo Buy must remain comfortably below that transport ceiling; it must not rely on `ws` rejecting an oversized message as ordinary product validation.

## 2. Demo Buy capture provenance bounds

A Demo Buy capture request is valid only when all of the following hold:

```text
selected unique items            <= 5000
securityId UTF-16 code units     <= 128
source SQL UTF-8 bytes           <= 1 MiB
Scanner context source rows      <= 50
Scanner context retained columns <= 64 total, including the canonical identity column
one textual/serialized cell      <= 128 UTF-8 bytes after deterministic clipping
serialized context JSON          <= 256 KiB UTF-8
```

The browser performs the same preflight before submission and Node validates independently.

The complete encoded request must still fit the existing 16 MiB WebSocket boundary.

These limits deliberately bound **daily persistence cost**, not only transport size. Automatic capture may execute repeatedly through a trading day, so a multi-megabyte provenance blob per generation is not acceptable even when it technically fits the WebSocket. The 50-row comparison depth is retained because peer ranking is valuable; width/value size is bounded instead.

## 3. Scanner-context shaping

Context is taken from the exact successful Scanner generation, never by re-running SQL.

The Scanner generation is Demo-Buy-capable only when it exposes exactly one recognized canonical identity column named `securityId` or `security_id`. That identity column is mandatory provenance and may never be omitted by context column bounding.

Deterministic shaping order:

1. take source rows 1..50 in exact Scanner order;
2. retain the recognized canonical identity column unconditionally;
3. fill the remaining retained-column budget with the earliest source columns in exact Scanner order, skipping the identity column if already encountered, for at most 64 retained columns total;
4. preserve original source-column indexes/names and record every omitted source column so the AI can distinguish retained evidence from missing evidence;
5. preserve JSON-safe `null`, boolean and finite numeric values exactly;
6. preserve strings exactly while their UTF-8 representation is <= 128 bytes;
7. deterministically UTF-8 clip longer strings at a valid code-point boundary and mark that cell truncated;
8. for JSON-safe arrays/objects, encode canonical JSON with array order preserved and object keys sorted lexicographically; clip the serialized representation to the same 128-byte limit and mark its encoded/truncated form explicitly;
9. preserve each context row's original 1-based `resultRank`;
10. record omitted-row/omitted-column counts and all cell-truncation metadata;
11. serialize the complete context object deterministically and require its UTF-8 size <= 256 KiB.

If deterministic shaping cannot produce a valid context within these limits, the capture fails visibly before commit. It must not silently drop additional rows/columns beyond the specified shaping rules.

Context truncation never changes which rows are selected for Demo Buy and never changes an item's original `resultRank`.

### Context-to-capture integrity

Node independently validates the frozen context against the capture items before commit.

For every retained capture item whose `resultRank <= 50`:

```text
context row with that exact resultRank must exist
AND context canonical identity value must equal item.securityId
```

If that row is absent, its identity cell is unusable/truncated, or its canonical identity differs from the submitted item, the complete capture fails before commit as an integrity/provenance error.

Items whose `resultRank > 50` are valid even though their source row is intentionally outside the retained comparison context. The persisted item rank remains authoritative and later AI export reports `targetInScannerContext=false`.

The identity cell itself is never clipped into ambiguity: a Demo-Buy-capable source row must contain the same bounded canonical identity already required by the capture item contract.

## 4. SQL provenance

Demo Buy preserves the exact activated SQL text. If its UTF-8 size exceeds 1 MiB, Scanner execution itself may still be a valid Scanner operation, but that generation is not Demo-Buy-capturable. The Viewer explains that Demo Buy provenance exceeds the capture bound.

SQL is never truncated for persisted provenance or AI Investigation.

## 5. Capture acknowledgement states

After request dispatch, the browser distinguishes exactly:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

`ACKNOWLEDGEMENT_UNKNOWN` means transport closed before a conclusive response and the capture may already have committed.

Rules:

- never auto-replay an acknowledgement-unknown capture;
- block additional capture submission in that Viewer instance until explicit reconnect/relaunch;
- after reconnect, refresh Demo Buy before the user chooses to submit another capture;
- do not label acknowledgement-unknown as confirmed failure;
- do not add a durable idempotency subsystem in Phase 1 unless implementation evidence proves this recovery contract inadequate.

## 6. Per-connection sequencing

The current local service serializes messages per WebSocket connection. Demo Buy keeps that model.

Consequences:

- `capturedAtMs` is assigned only inside the serialized writer operation, after any earlier same-connection and writer work;
- browser click time is not the virtual-buy authority;
- Demo Buy/AI-pack operations must remain bounded so they do not create an unbounded same-connection queue;
- automatic capture never queues behind another in-flight capture; it is visibly skipped according to the Demo Buy contract.

AI-pack generation may delay the next Scanner request on that Viewer socket while its bounded request is being serviced, but the existing Scanner scheduler must remain non-overlapping so this cannot grow an unbounded request backlog. No second transport or global server-concurrency rewrite is introduced solely for export.

The Viewer also owns one AI-export slot:

```text
at most one Generate/Regenerate AI Investigation request in flight per Viewer instance
```

While that slot is busy, additional Generate/Regenerate actions are disabled/refused visibly rather than queued. This bounds local file-export work and prevents user clicks from building a second application-level backlog on top of the socket FIFO.

### Timing diagnostics are not authority

Scanner `startedAtMs`/`completedAtMs`, market `collectedAtMs` and Demo Buy `capturedAtMs` are wall-clock diagnostics. Writer/cycle ordering is the authority boundary.

Validate `sourceResultStartedAtMs <= sourceResultCompletedAtMs` because both values come from one Scanner execution. Do **not** fail a valid capture merely because wall-clock adjustment makes `sourceResultCompletedAtMs > capturedAtMs` or `baselineCollectedAtMs > capturedAtMs`.

Instead:

```text
captureLatencyMs = capturedAtMs - sourceResultCompletedAtMs when non-negative, else null + timingAnomaly
baselineAgeMs    = capturedAtMs - baselineCollectedAtMs when non-negative, else null + timingAnomaly
```

The raw persisted timestamps remain unchanged. A timing anomaly is diagnostic and must not be clamped to zero or used to reorder authority.

## 7. Capture-time authority watermark

The exact linked `buy_cycle_id` is not only the baseline row identifier; because successful market writes and Demo Buy capture share the same serialized writer, it is also the market-authority watermark available at capture time.

For one captured item:

```text
prediction-time authoritative history:
  same security_id
  AND cycle_id <= buy_cycle_id

post-capture authoritative history:
  same security_id
  AND cycle_id > buy_cycle_id
```

This cycle boundary is required in addition to local timestamps.

Reason: a market snapshot may have been collected in the browser before `capturedAtMs` but may commit to DuckDB only after the Demo Buy capture. Timestamp-only forensic queries could therefore leak information backward that was not authoritative when the virtual buy was accepted.

### Demo Buy horizon reads

A future horizon row must satisfy both:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= captured_at_ms + horizon_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The `cycle_id > buy_cycle_id` condition is a safety/authority invariant. It prevents a pathological older cycle with an anomalous local timestamp from being treated as post-capture evidence.

## 8. AI Investigation temporal partition

Prediction-time target history is:

```text
same security_id
AND cycle_id <= buy_cycle_id
AND collected_at_ms >= captured_at_ms - 30 minutes
AND collected_at_ms <= captured_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
```

`TARGET_AFTER.jsonl` is:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= captured_at_ms
AND collected_at_ms <= captured_at_ms + 10 minutes
ORDER BY collected_at_ms ASC, cycle_id ASC
```

Using `>= captured_at_ms` on the post side intentionally permits a later committed observation with the same millisecond timestamp; writer/cycle ordering, not millisecond precision, determines whether it was authoritative before or after capture.

The exact baseline is exported separately and may also appear in the prediction-time window.

### Outcome completeness watermark

`COMPLETE_OUTCOME` is not based on wall-clock time alone.

Define:

```text
evidenceWatermarkMs = MAX(history.collected_at_ms) from committed cycles after the capture watermark in the currently opened DB
postWindowEndMs     = captured_at_ms + 10 minutes
```

The pack is:

```text
COMPLETE_OUTCOME  when evidenceWatermarkMs >= postWindowEndMs
PARTIAL_OUTCOME   otherwise
```

No special “day ended, therefore complete” shortcut exists in Phase 1. An archived DB whose persisted evidence never reached the 10-minute boundary remains honestly `PARTIAL_OUTCOME`.

This classification says whether persisted market authority progressed through the requested time boundary; it does not guarantee that the target security itself has a future row.

## 9. AI Investigation export bounds

The AI Investigation Pack is bounded by evidence time rather than an arbitrary row-count sample:

```text
pre-buy history window    30 minutes ending at capturedAtMs
post-buy history window   capturedAtMs through capturedAtMs + 10 minutes
Scanner comparison        persisted bounded context above
```

The exporter writes evidence locally; history rows are not returned through WebSocket. The WebSocket response contains only bounded metadata, generated path and prompt text.

`promptText` UTF-8 size is capped at 256 KiB. The normal generated prompt is expected to be far smaller; exceeding the cap is an export error rather than silent prompt truncation.

Generated pack files may contain every persisted target-security row inside the fixed time windows, including `raw_data`; they remain local artifacts and are not copied into diagnostics or the repository.

## 10. Export atomicity and naming

The exporter:

```text
validate target/evidence
→ create an internally generated temporary directory under exports/ai-investigations/
→ write every required file
→ fsync/close as provided by normal Node file APIs
→ atomically rename the completed directory to its final name
```

The final directory name is generated only by Node and contains sanitized capture/security identifiers plus generation metadata and a collision-safe internally generated suffix. The browser never supplies a path.

If any write or final rename fails:

- no final directory is reported as complete;
- best-effort cleanup removes the temporary directory;
- an already-existing successful pack is never overwritten;
- no DuckDB authority is mutated.

Transport loss after a completed export may leave a valid local pack whose path was not acknowledged to the Viewer. Retrying pack generation after explicit reconnect is safe because it performs no DB mutation; it may create another valid pack rather than trying to discover/reuse the unacknowledged one. This is intentionally different from Demo Buy capture, which must never be blindly replayed.

## 11. New-day source-version boundary

After schema v4 ships, `NEW_TRADING_DAY` must accept either:

```text
valid Market Flow US v3 source DB
valid Market Flow US v4 source DB
```

It must reject v1/v2, missing required tables, partial/corrupt v3/v4 states and running producer sessions.

Rollover semantics are:

```text
inspect source without mutating it
→ read scanner_saved_queries
→ build fresh schema-v4 DB
→ seed saved queries transactionally
→ archive/move original source DB as-is
→ atomically install fresh v4 DB
```

Demo Buy/context rows are never copied into the new active day. A v4 archive remains self-contained with its history and Demo Buy evidence. A v3 archive remains a valid historical pre-Demo-Buy Market Flow US DB.

## 12. Verification ownership

Focused unit/service tests must cover every numeric bound and boundary transition above, including exact-limit and limit+1 cases, identity-column-beyond-64 retention, context↔item rank/identity mismatch rejection, canonical object-key ordering, UTF-8 multi-byte clipping, request-size preflight, Scanner started/completed inversion rejection, wall-clock anomaly nullable diagnostics, acknowledgement-unknown behavior, authority-watermark anti-hindsight cases, horizon `cycle_id > buy_cycle_id`, partial/complete evidence watermark behavior, one-export-slot behavior, AI-pack lost-ACK safe-regeneration behavior, export cleanup/collision behavior and v3/v4 new-day rollover.