# AI Investigation Pack — Demo Buy Forensic Review Contract

## 1. Purpose

For one Demo Buy observation, generate a local reproducible evidence pack that helps an external AI answer:

- why the exact Scanner SQL returned/selected this security and, **only when the SQL ordering establishes ranking semantics**, why it appeared at its observed result position;
- which warning signals were already available before the virtual buy;
- what actually happened afterward;
- what minimal SQL changes might have filtered/de-ranked the failed candidate;
- what evidence would be needed to validate those changes across many observations.

This is forensic strategy-improvement evidence, not an AI trading agent and not an autonomous query editor.

`resultRank` / `result_rank` is a historical field name for the original 1-based returned Scanner row position. It is **not by itself proof of semantic rank, score quality or strategy preference**. A query without a deterministic `ORDER BY` may return a row first without meaning “best candidate”. The AI must inspect the exact SQL before using ranking language.

## 2. Product boundary

Phase 1 adds no AI/cloud provider integration, API key or automatic upload.

Workflow:

```text
Demo Buy observation
→ Investigate with AI
→ Generate local pack
→ Copy AI Prompt / Copy folder path
→ user reviews/attaches the generated evidence to an AI of choice
→ AI proposes hypotheses
→ user decides what to test in Scanner
```

The product never automatically edits or activates Scanner SQL.

The pack is designed for external sharing, so **system-owned operational/session data is excluded by construction**. The exact Scanner SQL is user-authored content and is intentionally exported verbatim; the UI therefore reminds the user not to put secrets in Scanner SQL and to review the pack before external upload.

## 3. Anti-hindsight invariant

The pack separates:

```text
PREDICTION-TIME EVIDENCE
OUTCOME EVIDENCE
```

Writer/cycle ordering is authority. For the target item:

```text
prediction-time market evidence: cycle_id <= buy_cycle_id
outcome market evidence:         cycle_id > buy_cycle_id
```

Timestamps additionally bound the intended forensic windows but never move a later-committed cycle into prediction-time evidence.

Every generated prompt instructs the AI to:

1. use only prediction-time evidence for proposed Scanner rules;
2. cite exact supporting fields/rows/timestamps for claimed warning signals;
3. label fact, derived calculation and hypothesis separately;
4. mark suggestions requiring unavailable pre-buy evidence as invalid/unproven;
5. avoid inventing provider-field semantics beyond the field guide;
6. never claim source `Price` proves a real fill/executable trade;
7. treat one observation as insufficient to adopt a rule;
8. recommend validation across multiple Demo Buy observations;
9. state explicitly when context was truncated/omitted/redacted or the target was outside retained peer context;
10. treat `resultRank` as returned row position unless the exact SQL contains deterministic ordering logic that justifies a stronger ranking interpretation; if ordering is absent/ambiguous, say so explicitly and never call row 1 “the best”, “top-ranked” or equivalent.

## 4. Evidence sources

The pack is derived only from local persisted/immutable evidence:

- exact capture-level Scanner SQL/provenance;
- original selected `resultRank` (returned row position);
- bounded Scanner comparison context frozen at capture;
- target `history` rows that were authoritative before capture;
- exact linked baseline row;
- target `history` rows committed after capture;
- trusted Demo Buy evaluator output;
- documented field semantics/uncertainties.

The generated **shareable files use the safe projections defined below**. They do not dump literal DuckDB rows or the complete persisted Scanner-context object.

No credentials, cookies, auth headers, account identifiers, producer/session identifiers, browser-session data or raw authenticated HTTP dumps may enter the generated pack.

## 5. Frozen Scanner comparison context

Re-running Scanner SQL later is not equivalent to the original generation because market tables continue changing. Therefore capture freezes bounded original comparison provenance locally.

Exact capture shaping/bounds are owned by `DEMO_BUY_PROTOCOL_LIMITS.md`:

```text
source rows: first up to 50 in exact SQL-returned order
retained columns: <=64 total
canonical identity column: mandatory even if originally after column 64
textual/serialized cell: <=128 UTF-8 bytes after deterministic clipping
serialized persisted context: <=256 KiB UTF-8
exact SQL: <=1 MiB UTF-8
```

Persisted context preserves:

```text
source column names/indexes
original resultRank per retained row
canonical identity value
omitted row/column counts
cell encoding/truncation metadata
```

Numeric/null/boolean values are preserved exactly. Strings and encoded non-scalars may be clipped only by the deterministic documented capture rule and are explicitly marked.

Persisted context is provenance, not market authority and never changes row selection/position semantics. Persisted row order is evidence of what Scanner returned; whether that order represents a meaningful ranking is determined only by analysis of the exact SQL ordering logic.

## 6. Context integrity / target coverage

The investigation target is:

```text
captureId + securityId
```

It must belong to that capture.

At capture time, every selected item with `resultRank <= 50` is cross-checked against the retained context row at the same position and canonical identity. A mismatch/missing/unusable identity causes capture failure before commit.

The pack derives:

```text
targetInScannerContext: boolean
```

- result position <=50 with matching retained row → `true`;
- result position >50 → `false`, but pack generation still succeeds;
- a target that should be retained but is missing/mismatched → integrity/export error, not `false`.

When false, the prompt forbids pretending that the exact target row or peer neighborhood was retained.

## 7. Sharing-safe evidence projection

The exporter must never copy operational/session columns merely because they exist in DuckDB or were returned by arbitrary Scanner SQL.

### 7.1 Target history / baseline projection

`TARGET_BEFORE.jsonl`, `BASELINE.json` and `TARGET_AFTER.jsonl` contain the market-safe evidence projection only:

```text
cycle_id
security_id
universe_revision
collected_at_ms
provider/source market fields from the documented U.S. projection
raw_data (the preserved provider market record)
```

They **exclude** system-owned operational fields including:

```text
session_id
producer_instance_id
source_metadata_json
session/config/error payloads
transport/request metadata
absolute local paths
```

Operational timing fields not needed to answer the forensic market question are omitted rather than shared by default. `cycle_id` and `collected_at_ms` remain because they are required for authority/time reasoning.

The provider `raw_data` object is allowed because the data contract defines it as the preserved market-record payload, not browser authentication/session material. If that source contract ever changes, planning must reopen before AI export continues to include it.

### 7.2 Scanner-context sharing projection

`SCANNER_CONTEXT.json` is a deterministic **sharing-safe projection of the persisted context**, not a raw dump.

Always preserve:

- row position and structural omission/truncation metadata;
- canonical identity;
- `null`, boolean and finite numeric result values, including user-defined numeric scores/calculations;
- safe market-text values whose output column name is one of:

```text
securityId
security_id
Symbol
PaperNameEng
PaperNameHeb
ExchangeName
TradeDateTime
CountryName
CountryNameEng
```

For any other string/array/object result value, export structural metadata only:

```text
source column name/index
value type
redactedForSharing: true
captured/truncated length metadata when available
```

Do not export its content. This intentionally favors no accidental operational/session disclosure over preserving arbitrary textual computed output. The exact SQL remains available for the AI to understand how omitted computed text was produced.

This rule does not attempt to protect a malicious user who deliberately places a secret into a market-safe-named output column or directly into the SQL text. The product owns prevention of **system-generated accidental disclosure** and provides an explicit pre-share warning for user-authored SQL/evidence.

### 7.3 Sharing-safety manifest

`MANIFEST.json` records bounded counts of:

```text
context values preserved
context values redacted for sharing
operational history fields omitted
```

No redacted value content is copied into the manifest, prompt, diagnostics or README.

## 8. Forensic windows

### Prediction-time target history

```text
same security_id
AND cycle_id <= buy_cycle_id
AND collected_at_ms >= captured_at_ms - 30 minutes
AND collected_at_ms <= captured_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
```

### Post-capture target history

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= captured_at_ms
AND collected_at_ms <= captured_at_ms + 10 minutes
ORDER BY collected_at_ms ASC, cycle_id ASC
```

The baseline is exported separately and may also appear in the prediction-time window.

No interpolation occurs.

## 9. Partial / complete outcome evidence

Define:

```text
postWindowEndMs = captured_at_ms + 10 minutes
```

`COMPLETE_OUTCOME` requires persisted committed post-capture market authority to have progressed to at least `postWindowEndMs` in the opened DB.

`PARTIAL_OUTCOME` applies otherwise.

There is no special “the trading day ended, therefore complete” shortcut. An archived DB whose persisted evidence never reached the ten-minute boundary remains honestly partial.

Completeness does not guarantee that the target security itself has a qualifying row at every horizon; horizon-level unavailable reasons remain separate.

## 10. Required bundle

One pack contains:

```text
README.md
PROMPT.md
MANIFEST.json
QUERY.sql
SCANNER_CONTEXT.json
TARGET_BEFORE.jsonl
BASELINE.json
TARGET_AFTER.jsonl
OUTCOME.json
FIELD_GUIDE.md
```

Generated packs are local ignored artifacts, never repository fixtures.

### `MANIFEST.json`

Includes bounded structural metadata such as:

```text
packFormatVersion
productVersion
captureId
securityId
resultRank
targetInScannerContext
generatedAtMs
sourceResultStartedAtMs
sourceResultCompletedAtMs
capturedAtMs
buyCycleId
baselineCollectedAtMs
preWindowStartMs
postWindowEndMs
latestIncludedPostObservationMs
outcomeEvidenceStatus
file names / record counts
context omission/truncation/redaction summary
```

`resultRank` in the manifest is explicitly documented as the original returned row position, not a claim that SQL semantically ranked that row.

### `QUERY.sql`

Exact immutable activated SQL. Never truncated in the pack. It is user-authored text and the UI/README explicitly remind the user to review it before external sharing.

### `SCANNER_CONTEXT.json`

Deterministic sharing-safe projection from section 7.2. No later SQL re-run and no raw operational/session-value dump.

### `TARGET_BEFORE.jsonl`

Every matching authoritative target row in the prediction-time window, oldest→newest, using the safe market projection from section 7.1.

### `BASELINE.json`

The safe market projection of the exact linked `(buy_cycle_id, security_id)` history row.

### `TARGET_AFTER.jsonl`

Every matching post-capture target row in the fixed ten-minute window, oldest→newest, using the safe market projection from section 7.1.

### `OUTCOME.json`

The exact trusted Demo Buy evaluator output for all ten horizons. A second horizon algorithm is forbidden.

### `FIELD_GUIDE.md`

Explains canonical identity; source-shaped/empirical field semantics; wall-clock diagnostics vs writer/cycle authority; null/zero/missing distinctions; the Phase-1 non-fillability boundary; sharing-safety omissions/redactions; and the critical distinction between **returned result position (`resultRank`)** and a semantic rank established by explicit deterministic SQL ordering.

## 11. Prompt investigation sequence

`PROMPT.md` instructs the AI to work in this order.

### A. Reconstruct the original decision

- explain the SQL in plain language;
- identify filters, computed values and ordering/tie-break logic;
- first determine whether the SQL actually establishes a deterministic ranking/order. If not, call `resultRank` only “returned position” and explicitly state that row position does not prove strategy preference;
- only when SQL ordering justifies it, explain why the target occupied that ranked position;
- when `targetInScannerContext=true`, compare the target with retained nearby returned candidates without inventing unavailable/redacted fields;
- when false, state the missing peer context and do not fabricate it;
- report any omitted/truncated/redacted inputs that limit analysis.

### B. Search prediction-time warning signals

Use only query/context/baseline and `TARGET_BEFORE` evidence that was authoritative at capture time.

Possible areas include price trajectory, acceleration/reversal, bid/ask relations, volume/change/high/low/yesterday/market-cap/source fields, stale values, capture delay/baseline age diagnostics and additional calculations derivable solely from pre-buy history.

Every claimed signal must cite concrete evidence.

### C. Explain the outcome

Use `TARGET_AFTER` and `OUTCOME` to describe what happened after capture without presenting those facts as predictive inputs.

### D. Propose minimal SQL hypotheses

For every proposal provide:

```text
hypothesis
pre-buy evidence used
minimal SQL change/fragment
whether it would have filtered/de-ranked this target
expected benefit
false-negative cost
overfitting risk
additional Demo Buy evidence required
```

If the original SQL had no deterministic ranking semantics, “de-ranked” must be replaced by the precise effect the proposed SQL would create, such as filtering the row or adding an explicit deterministic ordering rule.

Prefer the smallest useful change before larger rewrites.

### E. Counterfactual/peer check

State whether the change would have altered this target using only pre-buy evidence. When retained sharing-safe context permits, assess neighboring returned candidates; otherwise mark the counterfactual unproven. Never infer semantic rank solely from source row position.

### F. Validation plan

End with measurable multi-observation validation criteria before replacing the current Scanner query.

## 12. Local export publication

Exporter operation:

```text
demo.buy.ai-pack.create(captureId, securityId)
```

The browser supplies no path.

Node:

```text
validate target/evidence
→ derive sharing-safe projections
→ create internal temp directory under exports/ai-investigations/
→ write every required file
→ close/fsync using normal Node file APIs
→ atomically rename to a collision-safe final directory
```

Failure:

- reports no complete final pack;
- best-effort cleans temp output;
- never overwrites an existing successful pack;
- mutates no DuckDB authority.

The response contains bounded metadata and `promptText`; evidence rows remain in local files.

The returned/displayed path is **relative to the product/export root**, never an absolute machine path containing user/machine details.

`promptText` is capped at 256 KiB UTF-8; exceeding the cap is an export error, not silent truncation.

## 13. Export concurrency / lost ACK

At most one Generate/Regenerate AI-pack request is in flight per Viewer instance. Additional export actions are disabled/refused visibly rather than queued.

Transport loss after successful local publication may leave an unacknowledged valid pack. Unlike Demo Buy capture, retry after reconnect is safe because export performs no DB mutation and generates a collision-safe new directory. The product does not need an export idempotency/recovery subsystem in Phase 1.

## 14. Viewer workflow

Detailed UI behavior is owned by `DEMO_BUY_UX.md`.

The investigation panel shows:

```text
capture/target/original result position
targetInScannerContext
current horizon progress
PARTIAL_OUTCOME | COMPLETE_OUTCOME
Generate / Regenerate
Copy AI Prompt
Copy folder path
relative generated path
```

Before Generate/Regenerate, display a concise pre-share reminder:

```text
The pack contains your exact Scanner SQL and market evidence.
Do not place secrets in Scanner SQL; review generated files before sharing them externally.
```

For Partial evidence, explain that later committed evidence may change outcome-dependent files. Immutable query/context/baseline authority does not change; the sharing-safe projection is regenerated deterministically from it.

`Copy AI Prompt` and `Copy folder path` use clipboard fallback: if automatic copy is unavailable, reveal/focus selectable text. Clipboard failure is not pack-generation failure.

## 15. Determinism / regeneration

For identical persisted evidence and `packFormatVersion`, semantic shareable content is deterministic except generation metadata/directory name.

Regeneration may change only evidence legitimately added since the prior pack and derived fields depending on it. Query/context/baseline authority remain immutable; the sharing-safe projection rules remain versioned by `packFormatVersion`.

## 16. Verification

`TEST_STRATEGY.md` must prove at least:

- exact context bounds, identity-column retention and deterministic clipping;
- context↔item result-position/identity integrity;
- authority-watermark pre/post partition including misleading wall-clock cases;
- `resultRank` is treated as returned position by default and AI ranking language is allowed only when deterministic SQL ordering justifies it, including an unordered-query regression case;
- targetInScannerContext true/false/integrity paths;
- safe target-history/baseline projection excludes session/operational fields while retaining required market authority and `raw_data`;
- Scanner-context sharing projection preserves identity/numeric/boolean/null + allowlisted market text, redacts other string/array/object values, and records omission/redaction metadata without content leakage;
- exact user-authored SQL export plus visible pre-share warning;
- exact baseline and trusted evaluator reuse;
- partial→complete progression with no terminal-day shortcut;
- deterministic bundle/prompt semantics;
- safe relative paths and no browser path input/traversal;
- temp-dir/atomic-rename cleanup/collision behavior;
- one export slot and lost-ACK safe regeneration;
- prompt/copy path clipboard fallback;
- no DB mutation/cloud call/AI key/automatic SQL activation.

## 17. Explicit non-goals

Not included:

```text
automatic AI provider call
AI API-key storage
automatic SQL edit/activation
web enrichment during export
claiming causality from one observation
broker/order/fill analysis
Phase-2 liquidity/sellability analysis
long-term embedded AI chat/history
```
